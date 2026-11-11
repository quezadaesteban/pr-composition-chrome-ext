import {
  DEFAULT_RULES,
  compileRules,
  summarize,
  validateRules,
} from "./core.js";
import { canClick, coverage, prContext, readPage, reconcile } from "./dom.js";
import style from "./style.css";

const STORAGE_KEY = "prCompositionRules";
const CHANGES = "Changes";
// GitHub's "All commits" button, the first control in the review toolbar.
const COMMIT_SELECTOR_ID = "changes-selector-button";
// Long enough for GitHub to save Viewed and collapse the file, short enough to feel tied to the click.
const ADVANCE_WINDOW = 4000;
const COLLAPSE_SETTLE = 250;
let settings = {},
  rules = compileRules(DEFAULT_RULES),
  settingsError = "";
let currentKey = "",
  currentRepo = "",
  lastSignature = "";
let timer,
  lastRun = 0,
  observer;
const navigationEvents = ["turbo:load", "turbo:render", "pjax:end"];
const cancelEvents = ["wheel", "keydown", "touchstart"];
// chip: numbers in GitHub's review toolbar; queue: the review list in the file-tree sidebar.
const chip = {},
  queue = {};
const ui = {
  selected: CHANGES,
  cursor: null,
  files: [],
  popover: null,
};
let intent = null,
  generation = 0;
const number = (n) => n.toLocaleString("en-US");
const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const button = (text, action, className) => {
  const node = el("button", text, className);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
};
const live = (control) => !!control?.isConnected && canClick(control);

function effectiveRules(repo = currentRepo) {
  return settings[`repo:${repo}`] ?? settings.global ?? DEFAULT_RULES;
}

function selectRules() {
  try {
    rules = compileRules(effectiveRules());
  } catch (error) {
    settingsError = `Saved rules could not be read: ${error.message} Defaults are in use.`;
    rules = compileRules(DEFAULT_RULES);
  }
}

function countLine(stats) {
  const node = el("span", undefined, "counts");
  if (stats.unknown) node.append(el("span", "≥ ", "muted"));
  node.append(
    el("span", `+${number(stats.additions)}`, "add"),
    el("span", ` −${number(stats.deletions)}`, "del"),
  );
  if (stats.unknown)
    node.title = "Known lines only; some files have unavailable counts.";
  return node;
}

function iconButton(label, kind, action) {
  const control = button("", action, "icon-button");
  control.setAttribute("aria-label", label);
  control.setAttribute("aria-expanded", "false");
  control.title = label;
  control.innerHTML =
    kind === "info"
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 3-.6 2.3-2 1.2L4 6l-2 3.5 1.7 1.7v2L2 15l2 3.5 2.4-.5 2 1.2L9 21h4l.6-2.3 2-1.2 2.4.5 2-3.5-1.7-1.7v-2L20 9l-2-3.5-2.4.5-2-1.2L13 3Z"/><circle cx="11" cy="12" r="3"/></svg>';
  return control;
}

function shadowHost(id, className) {
  const host = el("div");
  host.id = id;
  const root = host.attachShadow({ mode: "open" });
  root.append(el("style", style));
  const body = el("div", undefined, className);
  root.append(body);
  return { host, root, body };
}

// --- Toolbar chip -----------------------------------------------------------

function buildChip() {
  Object.assign(chip, shadowHost("pr-composition-extension", "chip"));
  chip.body.setAttribute("role", "group");
  chip.body.setAttribute("aria-label", "PR composition");
  chip.cells = el("div", undefined, "cells");
  chip.cellNodes = new Map();
  chip.badge = el("span", "", "badge");
  chip.badge.setAttribute("role", "status");
  chip.badge.hidden = true;
  chip.infoButton = iconButton("About these counts", "info", () =>
    togglePopover("info"),
  );
  chip.settingsButton = iconButton("Configure categories", "settings", () =>
    togglePopover("rules"),
  );
  chip.body.append(
    chip.cells,
    chip.badge,
    chip.infoButton,
    chip.settingsButton,
  );

  chip.info = el("div", undefined, "popover info");
  chip.info.hidden = true;
  chip.status = el("p", undefined, "status");
  chip.info.append(
    chip.status,
    el(
      "p",
      "Changes counts the files a reviewer needs to read: everything that does not match a category. Tests, config, lockfiles, docs and generated files go to the hidden Other category by default. Counts come from this page; missing data is marked partial. Rules stay in this browser, and no data is sent anywhere. Line counts measure change volume, not review risk.",
    ),
  );

  chip.rules = el("div", undefined, "popover rules");
  chip.rules.hidden = true;
  const scopeLabel = el("label", "Save rules for ");
  chip.scope = el("select");
  chip.scope.id = "rules-scope";
  for (const [value, label] of [
    ["repo", "This repository"],
    ["global", "All repositories"],
  ]) {
    const option = el("option", label);
    option.value = value;
    chip.scope.append(option);
  }
  chip.scope.addEventListener("change", loadEditor);
  scopeLabel.append(chip.scope);
  chip.editor = el("textarea");
  chip.editor.id = "rules-editor";
  chip.editor.setAttribute("aria-label", "Category rules as JSON");
  chip.editor.spellcheck = false;
  const help = el(
    "p",
    'First matching rule wins. Use *, **, or ?. Patterns without a slash match at any depth. Unmatched files stay in Changes. "hidden": true counts a category without showing it. Put a custom category before Other if its patterns overlap.',
    "muted",
  );
  const actions = el("div", undefined, "actions");
  actions.append(
    button("Save rules", saveRules, "primary"),
    button("Load defaults into editor", () => {
      chip.editor.value = JSON.stringify(DEFAULT_RULES, null, 2);
    }),
    button("Use global rules for this repository", useGlobal),
  );
  chip.error = el("p", undefined, "error");
  chip.error.setAttribute("role", "status");
  chip.rules.append(scopeLabel, help, chip.editor, actions, chip.error);

  // Holds the review list when the file-tree sidebar is collapsed.
  chip.queueSlot = el("div", undefined, "popover queue-slot");
  chip.queueSlot.id = "review-popover";
  chip.queueSlot.hidden = true;

  chip.root.append(chip.info, chip.rules, chip.queueSlot);
  chip.root.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !ui.popover) return;
    const owner = {
      info: chip.infoButton,
      rules: chip.settingsButton,
    }[ui.popover];
    togglePopover(ui.popover);
    (owner ?? chip.cellNodes.get(ui.selected)?.toggle)?.focus();
  });
  loadEditor();
}

function togglePopover(name) {
  ui.popover = ui.popover === name ? null : name;
  chip.info.hidden = ui.popover !== "info";
  chip.rules.hidden = ui.popover !== "rules";
  chip.queueSlot.hidden = ui.popover !== "queue";
  chip.infoButton.setAttribute("aria-expanded", String(ui.popover === "info"));
  chip.settingsButton.setAttribute(
    "aria-expanded",
    String(ui.popover === "rules"),
  );
  for (const [name, nodes] of chip.cellNodes)
    nodes.toggle.setAttribute(
      "aria-expanded",
      String(ui.popover === "queue" && name === ui.selected),
    );
}

function selectCategory(name) {
  generation++;
  intent = null;
  if (ui.selected !== name) {
    ui.selected = name;
    ui.cursor = null;
    renderQueue();
  }
  if (queue.mode === "popover")
    togglePopover(ui.popover === "queue" ? null : "queue");
  else if (queue.host?.isConnected)
    queue.host.scrollIntoView?.({ block: "nearest" });
}

function renderChip(summary, state, page) {
  chip.badge.textContent =
    { partial: "Partial data", scoped: "Selected view" }[state.state] ?? "";
  chip.badge.hidden = state.state === "complete";
  chip.badge.title = state.message;
  chip.status.textContent = state.message;
  if (
    state.state !== "complete" &&
    page.expected.additions !== null &&
    page.expected.deletions !== null
  )
    chip.status.textContent += ` GitHub header: +${number(page.expected.additions)} −${number(page.expected.deletions)}.`;

  const groups = [
    summary.source,
    ...summary.categories.filter((category) => !category.hidden),
  ];
  for (const [name, nodes] of chip.cellNodes) {
    if (!groups.some((group) => group.name === name)) {
      nodes.root.remove();
      chip.cellNodes.delete(name);
    }
  }
  if (!groups.some((group) => group.name === ui.selected)) {
    cancelAdvance();
    ui.selected = CHANGES;
    ui.cursor = null;
  }
  groups.forEach((stats, index) => {
    let nodes = chip.cellNodes.get(stats.name);
    if (!nodes) {
      const root = el("div", undefined, "cell");
      root.dataset.category = stats.name;
      const label = el("span", stats.name, "label");
      const counts = el("span");
      const toggle = button("", () => selectCategory(stats.name), "files");
      toggle.setAttribute("aria-controls", "review-popover");
      root.append(label, counts, toggle);
      nodes = { root, counts, toggle };
      chip.cellNodes.set(stats.name, nodes);
    }
    if (chip.cells.children[index] !== nodes.root)
      chip.cells.insertBefore(nodes.root, chip.cells.children[index] ?? null);
    nodes.root.toggleAttribute("data-selected", stats.name === ui.selected);
    nodes.counts.replaceChildren(countLine(stats));
    const members = summary.files.filter(
      (file) => file.category === stats.name,
    );
    // Review progress within this category, mirroring GitHub's "N / M viewed".
    const files = `${number(stats.files)} file${stats.files === 1 ? "" : "s"}`;
    const progress = members.some((file) => canClick(file.viewControl))
      ? `${number(members.filter((file) => file.viewed).length)} / ${files} reviewed`
      : files;
    const text = `${progress}${stats.unknown ? ` · ${stats.unknown} unknown` : ""}`;
    nodes.toggle.textContent = text;
    nodes.toggle.setAttribute("aria-label", `${stats.name}: ${text}`);
  });
}

// --- Review list ------------------------------------------------------------

function buildQueue() {
  Object.assign(queue, shadowHost("pr-composition-queue", "queue"));
  queue.body.setAttribute("aria-label", "Files to review");
  const head = el("div", undefined, "queue-head");
  queue.title = el("strong");
  queue.meta = el("span", undefined, "muted");
  head.append(queue.title, queue.meta);
  queue.list = el("ul", undefined, "file-list");
  queue.list.id = "review-list";
  queue.body.append(head, queue.list);
}

function queueFiles() {
  return ui.files.filter((file) => file.category === ui.selected);
}

function rowFor(path) {
  return [...queue.list.children].find((row) => row.dataset.path === path);
}

function fileItem(file) {
  const item = el("li");
  item.dataset.path = file.path;
  if (file.viewed) item.dataset.viewed = "";
  if (file.path === ui.cursor) item.dataset.current = "";
  const toggle = el("input", undefined, "view-toggle");
  toggle.type = "checkbox";
  toggle.checked = file.viewed;
  toggle.setAttribute("aria-label", `Mark ${file.path} as viewed`);
  if (!canClick(file.viewControl)) {
    toggle.disabled = true;
    toggle.title = "GitHub’s Viewed control isn’t available for this file";
  }
  toggle.addEventListener("click", (event) => {
    event.preventDefault();
    toggleViewed(file.path);
  });
  const jump = el("button", undefined, "file-link");
  jump.type = "button";
  jump.title = file.path;
  // Paths ellipsize from the left so the file name stays visible.
  jump.append(el("bdi", file.path));
  jump.addEventListener("click", () => {
    cancelAdvance();
    jumpTo(file.path);
  });
  item.append(toggle, jump);
  return item;
}

function renderQueue() {
  if (!queue.list) return;
  const active = queue.root.activeElement;
  const focused = active
    ? { path: active.closest("li")?.dataset.path, kind: active.className }
    : null;
  const scrollTop = queue.list.scrollTop;
  const files = queueFiles();
  if (ui.cursor !== null && !files.some((file) => file.path === ui.cursor))
    ui.cursor = null;
  queue.title.textContent = ui.selected;
  const left = files.filter(
    (file) => !file.viewed && canClick(file.viewControl),
  ).length;
  queue.meta.textContent = files.some((file) => canClick(file.viewControl))
    ? `${number(left)} left`
    : `${number(files.length)} file${files.length === 1 ? "" : "s"}`;
  queue.list.setAttribute("aria-label", `${ui.selected} files`);
  queue.list.replaceChildren(...files.map(fileItem));
  if (!files.length)
    queue.list.append(el("li", "No loaded files in this category.", "muted"));
  queue.list.scrollTop = scrollTop;
  if (focused?.path) {
    const target = rowFor(focused.path)?.querySelector(`.${focused.kind}`);
    if (target && !target.disabled) target.focus({ preventScroll: true });
  }
  for (const [name, nodes] of chip.cellNodes ?? [])
    nodes.root.toggleAttribute("data-selected", name === ui.selected);
}

function revealRow(path) {
  const row = rowFor(path);
  if (!row) return;
  const list = queue.list;
  if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop;
  else if (
    row.offsetTop + row.offsetHeight >
    list.scrollTop + list.clientHeight
  )
    list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
}

// --- Viewed and auto-advance -------------------------------------------------

function freshFiles() {
  const page = readPage(document, location.href);
  return page ? summarize(reconcile(page).files, rules).files : [];
}

function arm(path) {
  intent = { path, at: Date.now(), generation: ++generation };
}

function cancelAdvance() {
  generation++;
  intent = null;
}

function toggleViewed(path) {
  const file = freshFiles().find((f) => f.path === path);
  if (!file || !live(file.viewControl)) return;
  if (!file.viewed && file.category === ui.selected) arm(path);
  else cancelAdvance();
  file.viewControl.click();
  schedule();
}

// GitHub's own header Viewed control arms the same advance as our checkbox.
function onNativeClick(event) {
  if (chip.host?.contains(event.target) || queue.host?.contains(event.target))
    return;
  const control = event.target.closest?.(
    'button[aria-pressed], [role="checkbox"][aria-checked], input[type="checkbox"]',
  );
  if (!control) return schedule();
  const file = freshFiles().find((f) => f.viewControl === control);
  // A native checkbox has already flipped `checked` by the time this listener runs.
  const wasViewed = control.matches('input[type="checkbox"]')
    ? !file?.viewed
    : file?.viewed;
  if (file && !wasViewed && file.category === ui.selected) arm(file.path);
  schedule();
}

function processIntent(files) {
  if (!intent) return;
  if (Date.now() - intent.at > ADVANCE_WINDOW) {
    intent = null;
    return;
  }
  const source = files.find((file) => file.path === intent.path);
  if (!source || !source.viewed || !live(source.viewControl)) return;
  const { path, generation: armed } = intent;
  intent = null;
  // Let GitHub finish collapsing the viewed file before measuring where to scroll.
  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      setTimeout(() => advance(path, armed), COLLAPSE_SETTLE),
    ),
  );
}

function advance(path, armed) {
  if (armed !== generation || prContext(location.href)?.key !== currentKey)
    return;
  const files = freshFiles().filter((file) => file.category === ui.selected);
  const start = files.findIndex((file) => file.path === path);
  if (start === -1 || !files[start].viewed) return;
  const next = [...files.slice(start + 1), ...files.slice(0, start)].find(
    (file) => !file.viewed && live(file.viewControl),
  );
  if (next) jumpTo(next.path);
}

function toolbar() {
  return chip.host?.isConnected ? chip.host.closest("section") : null;
}

// Where the stuck toolbar ends: GitHub sticks it below its own page header, so
// a file must land past both to be fully visible.
function toolbarBottomWhenStuck() {
  const section = toolbar();
  if (!section) return 0;
  const height = section.getBoundingClientRect().height;
  const style = getComputedStyle(section);
  if (style.position !== "sticky") return height;
  const stickyTop = Number.parseFloat(style.top);
  return Number.isNaN(stickyTop) ? height : stickyTop + height;
}

// GitHub's header keeps its own inline scroll margin once a jump finishes.
let pendingMargin = null;
function restoreMargin() {
  if (!pendingMargin) return;
  clearTimeout(pendingMargin.timer);
  pendingMargin.target.style.scrollMarginTop = pendingMargin.previous;
  pendingMargin = null;
}

function jumpTo(path) {
  const file = freshFiles().find((f) => f.path === path);
  if (!file?.element?.isConnected) return;
  ui.cursor = path;
  restoreMargin();
  const target = file.element;
  pendingMargin = { target, previous: target.style.scrollMarginTop };
  target.style.scrollMarginTop = `${toolbarBottomWhenStuck()}px`;
  const reduced = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  )?.matches;
  target.scrollIntoView({
    block: "start",
    behavior: reduced ? "auto" : "smooth",
  });
  pendingMargin.timer = setTimeout(restoreMargin, 1000);
  renderQueue();
  revealRow(path);
}

// --- Settings ---------------------------------------------------------------

function loadEditor() {
  if (!chip.editor) return;
  chip.editor.value = JSON.stringify(
    chip.scope.value === "global"
      ? (settings.global ?? DEFAULT_RULES)
      : effectiveRules(),
    null,
    2,
  );
  chip.error.textContent = settingsError;
}

async function persist(change) {
  try {
    const stored =
      (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] ?? {};
    const next = { ...stored, ...change };
    for (const key of Object.keys(next))
      if (next[key] === undefined) delete next[key];
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
    settings = next;
    settingsError = "";
    selectRules();
    lastSignature = "";
    scan();
    chip.error.textContent = "Saved locally. Counts updated.";
  } catch (error) {
    chip.error.textContent = `Could not save rules: ${error.message}`;
  }
}

async function saveRules() {
  try {
    const value = validateRules(JSON.parse(chip.editor.value));
    await persist({
      [chip.scope.value === "global" ? "global" : `repo:${currentRepo}`]: value,
    });
    if (chip.scope.value === "global" && settings[`repo:${currentRepo}`])
      chip.error.textContent =
        "Global rules saved. This repository still uses its own override.";
  } catch (error) {
    chip.error.textContent = `Rules were not saved: ${error.message}`;
  }
}

async function useGlobal() {
  await persist({ [`repo:${currentRepo}`]: undefined });
  loadEditor();
}

// --- Mounting ---------------------------------------------------------------

// The review toolbar is a section of two groups: commit selection, then file
// controls ("N / M viewed"). The chip goes at the start of the second group.
function toolbarAnchor() {
  const commitSelector = document.getElementById(COMMIT_SELECTOR_ID);
  const toolbarSection = commitSelector?.closest("section");
  if (!toolbarSection) return null;
  const commitGroup = [...toolbarSection.children].find((group) =>
    group.contains(commitSelector),
  );
  return commitGroup?.nextElementSibling ?? null;
}

function sidebar() {
  const tree = document.getElementById("pr-file-tree");
  if (!tree || tree.closest("[hidden]")) return null;
  return tree.checkVisibility?.() === false ? null : tree;
}

function unmount() {
  cancelAdvance();
  restoreMargin();
  chip.host?.remove();
  queue.host?.remove();
  lastSignature = "";
}

// Only extension-owned hosts are inserted; GitHub's own nodes are never moved.
function mount() {
  const anchor = toolbarAnchor();
  if (!anchor) {
    unmount();
    return false;
  }
  if (!chip.host) buildChip();
  if (!queue.host) buildQueue();
  if (anchor.firstChild !== chip.host) {
    anchor.prepend(chip.host);
    lastSignature = "";
  }
  const tree = sidebar();
  const mode = tree ? "sidebar" : "popover";
  if (tree && tree.firstChild !== queue.host) tree.prepend(queue.host);
  else if (!tree && queue.host.parentNode !== chip.queueSlot)
    chip.queueSlot.append(queue.host);
  if (mode !== queue.mode) {
    queue.mode = mode;
    queue.body.classList.toggle("in-popover", mode === "popover");
    if (mode === "sidebar" && ui.popover === "queue") togglePopover("queue");
  }
  return true;
}

function scan() {
  timer = undefined;
  lastRun = Date.now();
  const context = prContext(location.href);
  if (!context) {
    stop();
    return;
  }
  if (context.key !== currentKey) {
    currentKey = context.key;
    currentRepo = context.repo;
    selectRules();
    unmount();
    ui.selected = CHANGES;
    ui.cursor = null;
    // An unsaved draft from another PR must never be saved over this repository's rules.
    if (ui.popover) togglePopover(ui.popover);
    loadEditor();
  }
  const raw = readPage(document, location.href);
  if (!raw.files.length || !mount()) {
    unmount();
    return;
  }
  const page = reconcile(raw);
  const summary = summarize(page.files, rules);
  const state = coverage(page, summary.total);
  ui.files = summary.files;
  processIntent(summary.files);
  const signature = JSON.stringify({
    files: summary.files.map(({ element, viewControl, ...file }) => ({
      ...file,
      viewable: canClick(viewControl),
    })),
    expected: page.expected,
    state,
    categories: summary.categories,
  });
  if (signature !== lastSignature) {
    lastSignature = signature;
    renderChip(summary, state, page);
    renderQueue();
  }
}

function schedule() {
  if (!timer)
    timer = setTimeout(scan, Math.max(120, 500 - (Date.now() - lastRun)));
}

function onSettingsChange(changes, area) {
  if (area !== "local" || !changes[STORAGE_KEY]) return;
  settings = changes[STORAGE_KEY].newValue ?? {};
  selectRules();
  lastSignature = "";
  schedule();
}

function onRouteChange(message) {
  if (message?.type === "pr-composition:route-change") scan();
}

function stop() {
  clearTimeout(timer);
  timer = undefined;
  observer?.disconnect();
  for (const event of navigationEvents)
    document.removeEventListener(event, schedule);
  for (const event of cancelEvents)
    document.removeEventListener(event, cancelAdvance, true);
  window.removeEventListener("popstate", schedule);
  window.removeEventListener("resize", schedule);
  document.removeEventListener("input", schedule);
  document.removeEventListener("change", schedule);
  document.removeEventListener("click", onNativeClick, true);
  chrome.storage.onChanged.removeListener(onSettingsChange);
  chrome.runtime?.onMessage?.removeListener(onRouteChange);
  unmount();
  if (globalThis.__prCompositionRefresh === schedule)
    delete globalThis.__prCompositionRefresh;
}

async function start() {
  try {
    settings = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] ?? {};
  } catch {
    settingsError =
      "Saved rules are unavailable. Defaults are in use; reload after updating the extension.";
  }
  if (!prContext(location.href)) {
    stop();
    return;
  }
  selectRules();
  scan();
  observer = new MutationObserver((mutations) => {
    if (
      mutations.some(
        (m) =>
          !chip.host?.contains(m.target) &&
          !queue.host?.contains(m.target) &&
          m.target !== chip.host &&
          m.target !== queue.host,
      )
    )
      schedule();
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      "aria-label",
      "aria-pressed",
      "aria-checked",
      "checked",
      "data-path",
      "hidden",
      "disabled",
      "aria-disabled",
    ],
  });
  for (const event of navigationEvents)
    document.addEventListener(event, schedule);
  // A user scroll or key press means they've moved on; don't yank the page.
  for (const event of cancelEvents)
    document.addEventListener(event, cancelAdvance, {
      capture: true,
      passive: true,
    });
  window.addEventListener("popstate", schedule);
  window.addEventListener("resize", schedule);
  document.addEventListener("input", schedule);
  document.addEventListener("change", schedule);
  // Capture phase sees header Viewed clicks before GitHub re-renders the control.
  document.addEventListener("click", onNativeClick, true);
  chrome.storage.onChanged.addListener(onSettingsChange);
  chrome.runtime?.onMessage?.addListener(onRouteChange);
}

if (globalThis.__prCompositionRefresh) globalThis.__prCompositionRefresh();
else if (prContext(location.href)) {
  globalThis.__prCompositionRefresh = schedule;
  start();
}
