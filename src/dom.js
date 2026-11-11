export const FILE_LINK =
  'h2 a[href*="#diff-"], h3 a[href*="#diff-"], h4 a[href*="#diff-"]';
const EXCLUDED =
  "table, pre, .blob-wrapper, .markdown-body, .comment-body, script, style";
const clean = (s) =>
  s.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim();

export function parseNumber(text) {
  const s = text.trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(s)) return null;
  const n = Number(s.replaceAll(",", ""));
  return Number.isSafeInteger(n) ? n : null;
}

export function parseStats(text) {
  const s = text.replace(/\s+/g, " ").trim();
  const match =
    s.match(
      /^(?:(?:Lines changed:|[\d,]+ changes:)\s*)?([\d,]+) additions?\s*(?:&|and|,)\s*([\d,]+) deletions?$/i,
    ) ?? s.match(/^\+([\d,]+)\s*[−-]([\d,]+)$/);
  if (!match) return null;
  const additions = parseNumber(match[1]),
    deletions = parseNumber(match[2]);
  return additions !== null && deletions !== null
    ? { additions, deletions }
    : null;
}

function statElements(root) {
  return [...root.querySelectorAll("[aria-label], .sr-only, span")].flatMap(
    (el) => {
      if (el.closest(EXCLUDED)) return [];
      const label = el.getAttribute("aria-label");
      const stats = (label && parseStats(label)) || parseStats(el.textContent);
      if (stats) return [{ element: el, ...stats }];
      // GitHub can put the two signed totals in sibling spans inside a div.
      if (/^\+[\d,]+$/.test(el.textContent.trim()) && el.parentElement) {
        const pair = parseStats(el.parentElement.textContent);
        if (pair) return [{ element: el.parentElement, ...pair }];
      }
      return [];
    },
  );
}

function resolveStats(items) {
  if (!items.length)
    return { additions: null, deletions: null, conflict: false };
  const first = items[0];
  const conflict = items.some(
    (s) => s.additions !== first.additions || s.deletions !== first.deletions,
  );
  return {
    additions: conflict ? null : first.additions,
    deletions: conflict ? null : first.deletions,
    conflict,
  };
}

function readViewed(header) {
  for (const control of header.querySelectorAll(
    'button[aria-pressed], [role="checkbox"][aria-checked], input[type="checkbox"]',
  )) {
    if (control.closest(EXCLUDED)) continue;
    const label = clean(
      control.getAttribute("aria-label") ||
        [...(control.labels ?? [])].map((node) => node.textContent).join(" ") ||
        control.textContent,
    );
    if (!/\bviewed\b/i.test(label)) continue;
    const viewed = control.matches('input[type="checkbox"]')
      ? control.checked
      : (control.getAttribute("aria-pressed") ??
          control.getAttribute("aria-checked")) === "true";
    return { viewed, viewControl: control };
  }
  return { viewed: false, viewControl: null };
}

export const canClick = (control) =>
  !!control &&
  !control.disabled &&
  control.getAttribute("aria-disabled") !== "true";

export function prContext(href) {
  const url = new URL(href);
  if (url.hostname !== "github.com") return null;
  const match = url.pathname.match(
    /^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/changes\/?$/,
  );
  if (!match || url.protocol !== "https:") return null;
  // A hash is only a scroll position. Query parameters conservatively identify a selected view.
  return {
    repo: `${match[1]}/${match[2]}`,
    key: url.pathname + url.search,
    base: `/${match[1]}/${match[2]}/pull/${match[3]}`,
    scoped: !!url.search,
  };
}

export function readPage(doc, href) {
  const context = prContext(href);
  if (!context) return null;
  const records = [],
    roots = new Set();
  const stats = statElements(doc);
  for (const header of doc.querySelectorAll(".file-header[data-path]")) {
    if (header.closest(".markdown-body, .comment-body")) continue;
    roots.add(header);
    records.push({
      path: header.getAttribute("data-path"),
      anchor: header.querySelector('a[href*="#diff-"]')?.hash ?? "",
      element: header,
      ...readViewed(header),
      ...resolveStats(stats.filter((s) => header.contains(s.element))),
    });
  }
  for (const link of doc.querySelectorAll(FILE_LINK)) {
    if (link.closest(".file-header, .markdown-body, .comment-body")) continue;
    const heading = link.parentElement;
    let root = heading;
    let found = [];
    for (
      let parent = heading.parentElement, depth = 0;
      parent && parent !== doc.body && depth < 7;
      parent = parent.parentElement, depth++
    ) {
      const hashes = new Set(
        [...parent.querySelectorAll(FILE_LINK)].map((a) => a.hash),
      );
      if (
        hashes.size > 1 ||
        parent.querySelector(
          'h1, nav, #files_tab_counter, [aria-label="Pull request navigation"]',
        )
      )
        break;
      root = parent;
      found = stats.filter((s) => parent.contains(s.element));
      if (found.length || parent.querySelector('table, [role="table"]')) break;
    }
    roots.add(root);
    // Prefer a dedicated path attribute. Otherwise current GitHub headings contain the new path.
    const path = clean(
      root.getAttribute("data-path") ||
        link.getAttribute("title") ||
        link.textContent,
    );
    if (path)
      records.push({
        path,
        anchor: link.hash,
        element: root,
        ...readViewed(root),
        ...resolveStats(found),
      });
  }

  const byPath = new Map();
  for (const file of records) {
    let previous = byPath.get(file.path);
    if (!previous) {
      byPath.set(file.path, file);
      continue;
    }
    // Duplicates (e.g. sticky copies) must not hide the header that can be marked viewed.
    if (!canClick(previous.viewControl) && canClick(file.viewControl)) {
      previous = {
        ...previous,
        viewed: file.viewed,
        viewControl: file.viewControl,
      };
      byPath.set(file.path, previous);
    }
    if (
      previous.additions !== file.additions ||
      previous.deletions !== file.deletions ||
      file.conflict
    ) {
      byPath.set(file.path, {
        ...previous,
        additions: null,
        deletions: null,
        conflict: true,
      });
    }
  }
  const files = [...byPath.values()];
  const outsideFiles = (el) => ![...roots].some((root) => root.contains(el));
  const globalStats = stats.filter(
    (s) =>
      outsideFiles(s.element) &&
      ![...roots].some((root) => s.element.contains(root)),
  );
  const legacyTotal = doc.querySelector("#diffstat");
  if (legacyTotal && outsideFiles(legacyTotal)) {
    const parsed = parseStats(legacyTotal.textContent);
    if (parsed) globalStats.push(parsed);
  }
  const expected = resolveStats(globalStats);
  expected.files = null;
  const legacyCounter = doc.querySelector("#files_tab_counter");
  if (legacyCounter)
    expected.files = parseNumber(
      legacyCounter.getAttribute("title") || legacyCounter.textContent,
    );
  if (expected.files === null) {
    for (const a of doc.querySelectorAll("a[href]")) {
      let url;
      try {
        url = new URL(a.getAttribute("href"), href);
      } catch {
        continue;
      }
      if (
        url.pathname !== context.base + "/changes" &&
        url.pathname !== context.base + "/files"
      )
        continue;
      // Primer tabs can include the count twice: an aria-hidden visual badge
      // and a screen-reader-only "(5)". Read either representation, not both.
      const accessible = a.cloneNode(true);
      for (const hidden of accessible.querySelectorAll(
        '[aria-hidden="true"], svg, script, style',
      ))
        hidden.remove();
      for (const value of [
        a.getAttribute("aria-label"),
        accessible.textContent,
        a.textContent,
      ]) {
        const text = clean(value || "").replace(/\s+/g, " ");
        const match = text.match(
          /^Files changed\s*,?\s*\(?([\d,]+)\)?(?:\s+files?)?$/i,
        );
        if (match) {
          expected.files = parseNumber(match[1]);
          break;
        }
      }
      if (expected.files !== null) break;
    }
  }
  const activeFilter = [
    ...doc.querySelectorAll(
      'input[placeholder*="Filter files"], input[aria-label*="Filter files"]',
    ),
  ].some((input) => input.value.trim());
  return { context, files, expected, scoped: context.scoped || activeFilter };
}

// GitHub omits line counts for empty files. When every other count already
// matches its PR header exactly, the uncounted files must have changed 0 lines.
export function reconcile(page) {
  const { expected, files } = page;
  if (
    page.scoped ||
    expected.conflict ||
    files.some((f) => f.conflict) ||
    expected.files === null ||
    expected.additions === null ||
    expected.deletions === null ||
    files.length !== expected.files
  )
    return page;
  const unknown = (f) => f.additions === null && f.deletions === null;
  if (!files.some(unknown)) return page;
  let additions = 0,
    deletions = 0;
  for (const f of files) {
    if (unknown(f)) continue;
    if (f.additions === null || f.deletions === null) return page;
    additions += f.additions;
    deletions += f.deletions;
  }
  if (additions !== expected.additions || deletions !== expected.deletions)
    return page;
  return {
    ...page,
    files: files.map((f) =>
      unknown(f) ? { ...f, additions: 0, deletions: 0, inferred: true } : f,
    ),
  };
}

export function coverage(page, total) {
  if (page.scoped)
    return {
      state: "scoped",
      message:
        "Filtered or selected view. These counts describe the loaded view, not the full PR.",
    };
  if (page.files.some((f) => f.conflict) || page.expected.conflict)
    return {
      state: "partial",
      message:
        "GitHub shows conflicting counts. Refresh the page to verify this breakdown.",
    };
  if (total.unknown)
    return {
      state: "partial",
      message: `${total.unknown} loaded file(s) have no exact line counts. Their lines are not included below.`,
    };
  if (
    page.expected.files === null ||
    page.expected.additions === null ||
    page.expected.deletions === null
  ) {
    const missing = [];
    if (page.expected.files === null) missing.push("file total");
    if (page.expected.additions === null || page.expected.deletions === null)
      missing.push("addition/deletion totals");
    return {
      state: "partial",
      message: `Loaded file counts only. Could not read GitHub’s ${missing.join(" and ")} for comparison. This does not necessarily mean files are missing.`,
    };
  }
  if (page.expected.files !== total.files)
    return {
      state: "partial",
      message: `${total.files} of ${page.expected.files} file headers loaded. Scroll through Files changed or clear GitHub filters to load more.`,
    };
  if (
    page.expected.additions !== total.additions ||
    page.expected.deletions !== total.deletions
  )
    return {
      state: "partial",
      message:
        "Loaded line counts do not match the full PR. More data may need to load, or the view is filtered.",
    };
  const inferred = page.files.filter((f) => f.inferred).length;
  return {
    state: "complete",
    message:
      `${total.files} file${total.files === 1 ? "" : "s"} accounted for. Additions and deletions match GitHub’s PR total.` +
      (inferred
        ? ` ${inferred} file${inferred === 1 ? " has" : "s have"} no line counts on GitHub and changed 0 lines, derived from GitHub’s PR totals.`
        : ""),
  };
}
