import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const bundle = readFileSync(
  new URL("../dist/content.js", import.meta.url),
  "utf8",
);
const section = ([path, plus, minus]) =>
  `<section><div><h3><a href="#diff-${path.replace(/\W/g, "")}">${path}</a></h3>${plus === null ? "<span>Empty file</span>" : `<span>Lines changed: ${plus} additions &amp; ${minus} deletions</span>`}</div></section>`;
// Current GitHub layout: Submit review lives in the sticky page header, outside the toolbar.
const stickyHeader = `<div class="sticky-header"><div class="actions"><button>Submit review<span class="sr-only">Review</span></button></div></div>`;
const toolbar = `<section class="toolbar"><h2 class="sr-only">Pull request toolbar</h2><div class="left"><div><button aria-controls="pr-file-tree">Show file tree</button></div><button id="changes-selector-button">All commits</button></div><div class="right"><div class="file-controls">0 / 2 viewed</div><button>Diff settings</button></div></section>`;
// Earlier GitHub layout: Submit review sat at the end of the toolbar's right group.
const legacyToolbar = `<section class="toolbar"><h2 class="sr-only">Toolbar</h2><div class="left"><button id="changes-selector-button">All commits</button></div><div class="right"><div class="file-controls">0 / 2 viewed</div><button>Submit review<span class="sr-only">Review</span></button></div></section>`;
const sidebar = `<div id="pr-file-tree"><div class="filter"><input placeholder="Filter files…"></div><div class="tree">tree</div></div>`;
function page(files, { header } = {}) {
  const plus = files.reduce((n, f) => n + (f[1] ?? 0), 0);
  const minus = files.reduce((n, f) => n + (f[2] ?? 0), 0);
  return `<main><h1>Example pull request</h1><span>Lines changed: ${header?.[0] ?? plus} additions &amp; ${header?.[1] ?? minus} deletions</span><nav aria-label="Pull request navigation"><a href="/acme/app/pull/42/changes">Files changed (${files.length})</a></nav>${stickyHeader}${toolbar}<div class="layout">${sidebar}<div class="diffs">${files.map(section).join("")}</div></div></main>`;
}
const html = page([
  ["src/a.ts", 10, 2],
  ["src/a.spec.ts", 20, 0],
]);

async function setup(
  url = "https://github.com/acme/app/pull/42/changes",
  markup = html,
) {
  const dom = new JSDOM(markup, { url, runScripts: "outside-only" });
  const { window: w } = dom;
  const queue = [],
    storage = {},
    listeners = [],
    routeListeners = [];
  let requests = 0;
  w.fetch = () => {
    requests++;
    throw new Error("Network calls are forbidden");
  };
  w.XMLHttpRequest = class {
    constructor() {
      requests++;
      throw new Error("Network calls are forbidden");
    }
  };
  w.setTimeout = (callback) => {
    queue.push(callback);
    return queue.length;
  };
  w.requestAnimationFrame = w.setTimeout;
  w.cancelAnimationFrame = () => {};
  const jumped = [];
  w.Element.prototype.scrollIntoView = function (options) {
    const name = this.querySelector?.("h3")?.textContent;
    if (name)
      jumped.push({ name, options, margin: this.style.scrollMarginTop });
  };
  w.chrome = {
    runtime: {
      onMessage: {
        addListener(fn) {
          routeListeners.push(fn);
        },
        removeListener(fn) {
          const index = routeListeners.indexOf(fn);
          if (index >= 0) routeListeners.splice(index, 1);
        },
      },
    },
    storage: {
      local: {
        async get(key) {
          return { [key]: storage[key] };
        },
        async set(value) {
          Object.assign(storage, value);
          for (const fn of listeners)
            fn(
              Object.fromEntries(
                Object.entries(value).map(([k, v]) => [k, { newValue: v }]),
              ),
              "local",
            );
        },
      },
      onChanged: {
        addListener(fn) {
          listeners.push(fn);
        },
        removeListener(fn) {
          const index = listeners.indexOf(fn);
          if (index >= 0) listeners.splice(index, 1);
        },
      },
    },
  };
  const flush = async () => {
    for (let i = 0; i < 12; i++) {
      await Promise.resolve();
      const pending = queue.splice(0);
      pending.forEach((fn) => fn());
    }
    assert.equal(queue.length, 0, "observer should settle");
  };
  // Runs one round of pending timers and frames, to act between steps.
  const tick = async () => {
    await Promise.resolve();
    queue.splice(0).forEach((fn) => fn());
  };
  w.eval(bundle);
  await flush();
  return {
    dom,
    w,
    storage,
    flush,
    tick,
    jumped,
    requests: () => requests,
    listenerCount: () => listeners.length,
    routeChanged: () =>
      [...routeListeners].forEach((fn) =>
        fn({ type: "pr-composition:route-change" }),
      ),
    chip: () =>
      w.document.querySelector("#pr-composition-extension")?.shadowRoot,
    queue: () => w.document.querySelector("#pr-composition-queue")?.shadowRoot,
  };
}

const cells = (root) =>
  [...root.querySelectorAll(".cell")].map((node) => [
    node.dataset.category,
    node.querySelector(".counts").textContent,
    node.querySelector(".files").textContent,
  ]);
const rows = (root) =>
  [...root.querySelectorAll(".file-list li[data-path]")].map((row) => ({
    path: row.dataset.path,
    checked: row.querySelector(".view-toggle").checked,
    disabled: row.querySelector(".view-toggle").disabled,
  }));
const nativeToggle = (pressed) =>
  `<button data-native aria-label="${pressed ? "Viewed" : "Not Viewed"}" aria-pressed="${pressed}">Viewed</button>`;
// Mimics GitHub's React button: its own handler flips aria-pressed and the label.
function wireNative(s, header) {
  header.querySelector("[data-native]")?.addEventListener("click", function () {
    s.w.__clicks++;
    const viewed = this.getAttribute("aria-pressed") !== "true";
    this.setAttribute("aria-pressed", String(viewed));
    this.setAttribute("aria-label", viewed ? "Viewed" : "Not Viewed");
  });
}
async function withControls(controls, markup = html) {
  const s = await setup(undefined, markup);
  const headers = s.w.document.querySelectorAll("section:not(.toolbar) > div");
  s.w.__clicks = 0;
  controls.forEach((control, i) => {
    if (!control) return;
    headers[i].insertAdjacentHTML("beforeend", control);
    wireNative(s, headers[i]);
  });
  await s.flush();
  return { s, c: s.chip(), q: s.queue(), headers };
}

test("the chip sits first in the toolbar's right group and the review list tops the file tree", async (t) => {
  const s = await setup();
  t.after(() => s.dom.window.close());
  const doc = s.w.document;
  const right = doc.querySelector(".toolbar .right");
  assert.deepEqual(
    [...right.children].map(
      (node) => node.id || node.className || node.tagName,
    ),
    ["pr-composition-extension", "file-controls", "BUTTON"],
  );
  const tree = doc.querySelector("#pr-file-tree");
  assert.deepEqual(
    [...tree.children].map((node) => node.id || node.className),
    ["pr-composition-queue", "filter", "tree"],
  );
  assert.equal(
    doc.querySelector(".diffs").firstElementChild.tagName,
    "SECTION",
  );
  // Tests are hidden in Other; GitHub's own header already shows the total.
  assert.deepEqual(cells(s.chip()), [["Changes", "+10 −2", "1 file"]]);
  assert.equal(s.chip().querySelector(".badge").hidden, true);
  assert.equal(
    s.queue().querySelector(".queue-head strong").textContent,
    "Changes",
  );
  assert.deepEqual(
    rows(s.queue()).map((row) => row.path),
    ["src/a.ts"],
  );
  assert.equal(s.requests(), 0);
});

test("the chip stays out of the sticky header that holds Submit review", async (t) => {
  const s = await setup();
  t.after(() => s.dom.window.close());
  const doc = s.w.document;
  assert.equal(
    doc.querySelector(".sticky-header #pr-composition-extension"),
    null,
  );
  assert.equal(
    doc.querySelector(".toolbar .right").firstElementChild.id,
    "pr-composition-extension",
  );
});

test("the earlier toolbar layout, with Submit review inside, still gets the chip", async (t) => {
  const markup = html.replace(stickyHeader, "").replace(toolbar, legacyToolbar);
  const s = await setup(undefined, markup);
  t.after(() => s.dom.window.close());
  const doc = s.w.document;
  assert.deepEqual(
    [...doc.querySelector(".toolbar .right").children].map(
      (node) => node.id || node.className || node.tagName,
    ),
    ["pr-composition-extension", "file-controls", "BUTTON"],
  );
  assert.equal(
    doc.querySelector("#pr-file-tree").firstElementChild.id,
    "pr-composition-queue",
  );
  assert.deepEqual(cells(s.chip()), [["Changes", "+10 −2", "1 file"]]);
});

test("without GitHub's review toolbar nothing renders until it appears", async (t) => {
  const markup = html.replace(toolbar, "");
  const s = await setup(undefined, markup);
  t.after(() => s.dom.window.close());
  assert.equal(s.chip(), undefined);
  assert.equal(s.queue(), undefined);
  assert.equal(s.listenerCount(), 1, "keep observing for the toolbar");
  s.w.document.querySelector("nav").insertAdjacentHTML("afterend", toolbar);
  await s.flush();
  assert.ok(s.chip());
  assert.ok(s.queue());
});

test("replacing GitHub's toolbar and sidebar markup re-inserts both hosts", async (t) => {
  const s = await setup();
  t.after(() => s.dom.window.close());
  const doc = s.w.document;
  doc.querySelector(".toolbar").outerHTML = toolbar;
  doc.querySelector("#pr-file-tree").outerHTML = sidebar;
  await s.flush();
  assert.equal(
    doc.querySelector(".toolbar .right").firstElementChild.id,
    "pr-composition-extension",
  );
  assert.equal(
    doc.querySelector("#pr-file-tree").firstElementChild.id,
    "pr-composition-queue",
  );
  assert.equal(doc.querySelectorAll("#pr-composition-extension").length, 1);
  assert.deepEqual(cells(s.chip()), [["Changes", "+10 −2", "1 file"]]);
});

test("with the file tree collapsed the review list opens as a popover from the chip", async (t) => {
  const s = await setup();
  t.after(() => s.dom.window.close());
  const doc = s.w.document;
  doc.querySelector("#pr-file-tree").hidden = true;
  await s.flush();
  const slot = s.chip().querySelector(".queue-slot");
  assert.equal(slot.querySelector("#pr-composition-queue").parentNode, slot);
  assert.equal(slot.hidden, true);
  const toggle = s.chip().querySelector(".files");
  toggle.click();
  assert.equal(slot.hidden, false);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  s.chip()
    .querySelector(".chip")
    .dispatchEvent(
      new s.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  assert.equal(slot.hidden, true);
  toggle.click();
  doc.querySelector("#pr-file-tree").hidden = false;
  await s.flush();
  assert.equal(
    doc.querySelector("#pr-file-tree").firstElementChild.id,
    "pr-composition-queue",
  );
  assert.equal(slot.hidden, true, "the popover closes once the list is back");
});

test("info and settings open as popovers with keyboard dismissal", async (t) => {
  const s = await setup();
  t.after(() => s.dom.window.close());
  const c = s.chip();
  const info = c.querySelector('[aria-label="About these counts"]');
  const settings = c.querySelector('[aria-label="Configure categories"]');
  info.click();
  assert.equal(c.querySelector(".info").hidden, false);
  assert.match(c.querySelector(".status").textContent, /accounted for/);
  settings.click();
  assert.equal(c.querySelector(".info").hidden, true);
  assert.equal(c.querySelector(".rules").hidden, false);
  assert.equal(settings.getAttribute("aria-expanded"), "true");
  c.querySelector("textarea").dispatchEvent(
    new s.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  assert.equal(c.querySelector(".rules").hidden, true);
  assert.equal(settings.getAttribute("aria-expanded"), "false");
});

test("visible custom categories get their own cell and list; hidden ones never show", async (t) => {
  const s = await setup();
  t.after(() => s.dom.window.close());
  const c = s.chip();
  const editor = c.querySelector("textarea");
  const defaults = JSON.parse(editor.value);
  assert.deepEqual(
    defaults.map((rule) => [rule.name, rule.hidden]),
    [["Other", true]],
  );
  editor.value = JSON.stringify([
    { name: "Core", patterns: ["src/a.ts"] },
    { name: "Quiet", hidden: true, patterns: ["*.md"] },
    ...defaults,
  ]);
  c.querySelector(".primary").click();
  await s.flush();
  assert.deepEqual(cells(c), [
    ["Changes", "+0 −0", "0 files"],
    ["Core", "+10 −2", "1 file"],
  ]);
  c.querySelector('[data-category="Core"] .files').click();
  assert.equal(
    s.queue().querySelector(".queue-head strong").textContent,
    "Core",
  );
  assert.deepEqual(
    rows(s.queue()).map((row) => row.path),
    ["src/a.ts"],
  );
  editor.value = JSON.stringify(defaults);
  c.querySelector(".primary").click();
  await s.flush();
  assert.deepEqual(cells(c), [["Changes", "+10 −2", "1 file"]]);
  assert.equal(
    s.queue().querySelector(".queue-head strong").textContent,
    "Changes",
    "removing the selected category falls back to Changes",
  );
  editor.value = "invalid JSON";
  c.querySelector(".primary").click();
  await s.flush();
  assert.match(c.querySelector(".error").textContent, /Rules were not saved/);
});

test("empty files that GitHub leaves uncounted no longer mark the view partial", async (t) => {
  const markup = page([
    ["src/a.ts", 10, 2],
    ["src/entities/x.ts", null, null],
  ]);
  const s = await setup(undefined, markup);
  t.after(() => s.dom.window.close());
  assert.equal(s.chip().querySelector(".badge").hidden, true);
  assert.deepEqual(cells(s.chip()), [["Changes", "+10 −2", "2 files"]]);
  assert.match(
    s.chip().querySelector(".status").textContent,
    /changed 0 lines/,
  );
});

test("injection outside /changes does no work; reinjection is idempotent; leaving tears down", async (t) => {
  const s = await setup("https://github.com/acme/app/pull/42");
  t.after(() => s.dom.window.close());
  assert.equal(s.chip(), undefined);
  assert.equal(s.listenerCount(), 0);
  s.w.history.pushState({}, "", "/acme/app/pull/42/changes");
  s.w.eval(bundle);
  await s.flush();
  assert.equal(
    s.w.document.querySelectorAll("#pr-composition-extension").length,
    1,
  );
  s.w.eval(bundle);
  await s.flush();
  assert.equal(s.listenerCount(), 1);
  s.w.document.querySelectorAll(".diffs > section")[1].remove();
  await s.flush();
  assert.equal(s.chip().querySelector(".badge").textContent, "Partial data");
  assert.equal(s.chip().querySelector(".badge").hidden, false);
  assert.match(s.chip().querySelector(".status").textContent, /1 of 2/);
  s.w.history.pushState({}, "", "/acme/app/pull/42/files");
  s.routeChanged();
  await s.flush();
  assert.equal(s.chip(), undefined);
  assert.equal(s.queue(), undefined);
  assert.equal(s.listenerCount(), 0);
  s.w.history.pushState({}, "", "/acme/app/pull/42/changes");
  s.w.eval(bundle);
  await s.flush();
  assert.ok(s.chip());
  assert.equal(s.listenerCount(), 1);
});

test("file names render as text and cannot inject markup", async (t) => {
  const s = await setup();
  t.after(() => s.dom.window.close());
  s.w.document.querySelector(".diffs h3 a").textContent =
    "<img src=x onerror=alert(1)>.ts";
  await s.flush();
  assert.equal(s.chip().querySelector("img"), null);
  assert.equal(s.queue().querySelector("img"), null);
  assert.match(s.queue().querySelector(".file-link").textContent, /<img/);
  assert.equal(s.requests(), 0);
});

test("list boxes follow GitHub's Viewed controls without changing counts", async (t) => {
  const { s, c, q, headers } = await withControls([nativeToggle(false)]);
  t.after(() => s.dom.window.close());
  const before = cells(c).map(([name, lines]) => [name, lines]);
  assert.equal(c.querySelector(".files").textContent, "0 / 1 file reviewed");
  assert.equal(q.querySelector(".queue-head .muted").textContent, "1 left");
  headers[0].querySelector("button").click();
  await s.flush();
  assert.deepEqual(
    rows(q).map((row) => row.checked),
    [true],
  );
  assert.deepEqual(
    cells(c).map(([name, lines]) => [name, lines]),
    before,
  );
  assert.equal(c.querySelector(".files").textContent, "1 / 1 file reviewed");
  assert.equal(q.querySelector(".queue-head .muted").textContent, "0 left");
  const first = q.querySelector(".file-list li");
  assert.deepEqual(
    [...first.children].map((node) => node.className),
    ["view-toggle", "file-link"],
  );
});

test("ticking a list box clicks GitHub's control once and only reflects GitHub's state", async (t) => {
  const { s, q } = await withControls([nativeToggle(false)]);
  t.after(() => s.dom.window.close());
  q.querySelector(".view-toggle").click();
  assert.equal(s.w.__clicks, 1);
  // Not optimistic: the box waits for GitHub's control to change.
  assert.equal(q.querySelector(".view-toggle").checked, false);
  await s.flush();
  assert.equal(q.querySelector(".view-toggle").checked, true);
  q.querySelector(".view-toggle").click();
  await s.flush();
  assert.equal(q.querySelector(".view-toggle").checked, false);
  assert.equal(s.requests(), 0);
});

test("a control that ignores the click, or is missing or disabled, leaves the box unchecked or disabled", async (t) => {
  const { s, q, headers } = await withControls(
    [
      '<button aria-label="Not Viewed" aria-pressed="false">Viewed</button>',
      null,
      '<span role="checkbox" aria-label="Viewed" aria-checked="false" aria-disabled="true"></span>',
    ],
    page([
      ["src/a.ts", 1, 0],
      ["src/b.ts", 1, 0],
      ["src/c.ts", 1, 0],
    ]),
  );
  t.after(() => s.dom.window.close());
  q.querySelector(".view-toggle").click();
  await s.flush();
  assert.deepEqual(
    rows(q).map((row) => [row.checked, row.disabled]),
    [
      [false, false],
      [false, true],
      [false, true],
    ],
  );
  headers[1].insertAdjacentHTML("beforeend", nativeToggle(false));
  headers[2]
    .querySelector('[role="checkbox"]')
    .removeAttribute("aria-disabled");
  await s.flush();
  assert.deepEqual(
    rows(q).map((row) => row.disabled),
    [false, false, false],
  );
});

const three = page([
  ["src/a.ts", 1, 0],
  ["src/a.spec.ts", 1, 0],
  ["src/b.ts", 1, 0],
  ["src/c.ts", 1, 0],
]);
const fourControls = [
  nativeToggle(false),
  nativeToggle(false),
  nativeToggle(false),
  nativeToggle(false),
];

test("marking a file viewed from the list or its header scrolls to the next unviewed Changes file", async (t) => {
  const { s, q, headers } = await withControls(fourControls, three);
  t.after(() => s.dom.window.close());
  q.querySelector('[data-path="src/a.ts"] .view-toggle').click();
  await s.flush();
  assert.deepEqual(
    s.jumped.map((j) => j.name),
    ["src/b.ts"],
  );
  assert.equal(
    JSON.stringify(s.jumped[0].options),
    JSON.stringify({ block: "start", behavior: "smooth" }),
  );
  assert.equal(q.querySelector("li[data-current]").dataset.path, "src/b.ts");
  // GitHub's own header control, outside our list.
  headers[2].querySelector("button").click();
  await s.flush();
  assert.deepEqual(
    s.jumped.map((j) => j.name),
    ["src/b.ts", "src/c.ts"],
  );
  assert.equal(headers[2].style.scrollMarginTop, "", "scroll margin restored");
  // Un-viewing never moves the page.
  headers[2].querySelector("button").click();
  await s.flush();
  assert.equal(s.jumped.length, 2);
  // Files outside the shown list (hidden Other here) never move the page.
  headers[1].querySelector("button").click();
  await s.flush();
  assert.equal(s.jumped.length, 2);
  // Wraps round to the first unviewed file.
  headers[3].querySelector("button").click();
  await s.flush();
  assert.deepEqual(s.jumped.at(-1).name, "src/b.ts");
  // The last unviewed file has nowhere to go.
  headers[2].querySelector("button").click();
  await s.flush();
  assert.equal(s.jumped.length, 3);
  assert.equal(q.querySelector(".queue-head .muted").textContent, "0 left");
});

test("scrolling, typing or clicking a path after the click cancels the pending jump", async (t) => {
  const { s, q } = await withControls(fourControls, three);
  t.after(() => s.dom.window.close());
  q.querySelector('[data-path="src/a.ts"] .view-toggle').click();
  s.w.document.dispatchEvent(new s.w.Event("wheel", { bubbles: true }));
  await s.flush();
  assert.equal(s.jumped.length, 0);
  // Cancelled during the settle delay, after GitHub confirmed the viewed state.
  q.querySelector('[data-path="src/a.ts"] .view-toggle').click();
  await s.flush();
  q.querySelector('[data-path="src/a.ts"] .view-toggle').click();
  await s.tick();
  await s.tick();
  s.w.document.dispatchEvent(
    new s.w.KeyboardEvent("keydown", { key: "j", bubbles: true }),
  );
  await s.flush();
  assert.equal(s.jumped.length, 0);
  // An explicit path click wins over a pending advance.
  q.querySelector('[data-path="src/a.ts"] .view-toggle').click();
  await s.flush();
  q.querySelector('[data-path="src/a.ts"] .view-toggle').click();
  await s.tick();
  await s.tick();
  q.querySelector('[data-path="src/c.ts"] .file-link').click();
  await s.flush();
  assert.deepEqual(
    s.jumped.map((j) => j.name),
    ["src/c.ts"],
  );
  s.jumped.length = 0;
  q.querySelector('[data-path="src/b.ts"] .view-toggle').click();
  await s.flush();
  assert.deepEqual(
    s.jumped.map((j) => j.name),
    ["src/c.ts"],
  );
});

test("a viewed state GitHub restores on its own never moves the page", async (t) => {
  const { s, headers } = await withControls(fourControls, three);
  t.after(() => s.dom.window.close());
  const control = headers[0].querySelector("button");
  control.setAttribute("aria-pressed", "true");
  control.setAttribute("aria-label", "Viewed");
  await s.flush();
  assert.equal(s.jumped.length, 0);
});

test("clicking a path jumps to that file below the toolbar and restores its margin", async (t) => {
  const s = await setup();
  t.after(() => s.dom.window.close());
  const doc = s.w.document;
  doc.querySelector(".toolbar").getBoundingClientRect = () => ({ height: 60 });
  const header = doc.querySelector(".diffs section");
  header.style.scrollMarginTop = "4px";
  const link = s.queue().querySelector(".file-link");
  link.click();
  link.click();
  assert.deepEqual(
    s.jumped.map((j) => [j.name, j.margin]),
    [
      ["src/a.ts", "60px"],
      ["src/a.ts", "60px"],
    ],
  );
  await s.flush();
  assert.equal(header.style.scrollMarginTop, "4px");
});

test("a jump clears GitHub's sticky page header as well as the toolbar", async (t) => {
  const s = await setup();
  t.after(() => s.dom.window.close());
  const doc = s.w.document;
  const toolbarSection = doc.querySelector(".toolbar");
  // GitHub sticks the toolbar 48px down, under its page header.
  toolbarSection.style.position = "sticky";
  toolbarSection.style.top = "48px";
  toolbarSection.getBoundingClientRect = () => ({ height: 60 });
  s.queue().querySelector(".file-link").click();
  assert.deepEqual(
    s.jumped.map((j) => [j.name, j.margin]),
    [["src/a.ts", "108px"]],
  );
});

test("a toolbar that isn't sticky only clears its own height", async (t) => {
  const s = await setup();
  t.after(() => s.dom.window.close());
  const toolbarSection = s.w.document.querySelector(".toolbar");
  toolbarSection.style.position = "static";
  toolbarSection.style.top = "48px";
  toolbarSection.getBoundingClientRect = () => ({ height: 60 });
  s.queue().querySelector(".file-link").click();
  assert.deepEqual(
    s.jumped.map((j) => [j.name, j.margin]),
    [["src/a.ts", "60px"]],
  );
});

test("GitHub's native checkbox Viewed control also advances", async (t) => {
  const markup = page([
    ["src/a.ts", 1, 0],
    ["src/b.ts", 1, 0],
  ]);
  const s = await setup(undefined, markup);
  t.after(() => s.dom.window.close());
  for (const header of s.w.document.querySelectorAll(".diffs section > div"))
    header.insertAdjacentHTML(
      "beforeend",
      '<label><input type="checkbox">Viewed</label>',
    );
  await s.flush();
  s.w.document.querySelector(".diffs input").click();
  await s.flush();
  assert.deepEqual(
    s.jumped.map((j) => j.name),
    ["src/b.ts"],
  );
});

test("an unsaved rules draft never follows you to another repository", async (t) => {
  const s = await setup();
  t.after(() => s.dom.window.close());
  const c = s.chip();
  c.querySelector('[aria-label="Configure categories"]').click();
  const editor = c.querySelector("textarea");
  const defaults = editor.value;
  editor.value = JSON.stringify([{ name: "Draft", patterns: ["*"] }]);
  s.w.history.pushState({}, "", "/acme/other/pull/7/changes");
  s.routeChanged();
  await s.flush();
  assert.equal(editor.value, defaults);
  assert.equal(c.querySelector(".rules").hidden, true);
});
