import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import {
  readPage,
  reconcile,
  coverage,
  parseStats,
  parseNumber,
  prContext,
} from "../src/dom.js";
import { compileRules, DEFAULT_RULES, summarize } from "../src/core.js";

const url = "https://github.com/acme/app/pull/42/changes";
const rules = compileRules(DEFAULT_RULES);
const header = (files = 2, plus = 20, minus = 3) =>
  `<div><h1>PR title</h1><span aria-label="Lines changed: ${plus} additions &amp; ${minus} deletions"></span><nav aria-label="Pull request navigation"><a href="/acme/app/pull/42/changes">Files changed <span>(${files})</span></a></nav></div>`;
const file = (path, plus, minus, id = path.replace(/\W/g, "")) =>
  `<section><div><button>Collapse file</button><h3><a href="#diff-${id}">‎${path}‎</a></h3>${plus === null ? "<span>Binary file not shown</span>" : `<span>Lines changed: ${plus} additions &amp; ${minus} deletions</span>`}</div><table><tr><td>not parsed as statistics</td></tr></table></section>`;
function read(html, href = url) {
  const doc = new JSDOM(html, { url: href }).window.document;
  const page = readPage(doc, href),
    totals = summarize(page.files, rules);
  return { doc, page, totals, status: coverage(page, totals.total) };
}

test("exact stats parse separators, zero, singular and Unicode minus without estimates", () => {
  assert.deepEqual(parseStats("Lines changed: 1,234 additions & 0 deletions"), {
    additions: 1234,
    deletions: 0,
  });
  assert.deepEqual(parseStats("15 changes: 0 additions & 15 deletions"), {
    additions: 0,
    deletions: 15,
  });
  assert.deepEqual(parseStats("+0 −15"), { additions: 0, deletions: 15 });
  assert.deepEqual(parseStats("1 addition and 1 deletion"), {
    additions: 1,
    deletions: 1,
  });
  for (const v of ["1k", "1.2k", "12,3", "-1", "", "1 000", "1.000"])
    assert.equal(parseNumber(v), null);
  assert.equal(parseStats("+1.2k −0"), null);
});

test("React-like headers reconcile separately and remain available when collapsed", () => {
  const { page, totals, status } = read(
    header() + file("src/a.ts", 5, 3) + file("src/a.spec.ts", 15, 0),
  );
  assert.equal(status.state, "complete");
  assert.equal(
    totals.categories.find((category) => category.name === "Other").additions,
    15,
  );
  assert.deepEqual(
    page.files.map((f) => f.path),
    ["src/a.ts", "src/a.spec.ts"],
  );
  const { status: collapsed } = read(
    header() +
      file("src/a.ts", 5, 3).replace(/<table>.*?<\/table>/, "") +
      file("src/a.spec.ts", 15, 0),
  );
  assert.equal(collapsed.state, "complete");
});

test("Viewed state comes from the file's review control, including collapsed and legacy headers", () => {
  for (const [control, expected] of [
    ['<button aria-pressed="true" aria-label="Viewed"></button>', true],
    [
      '<button aria-pressed="false" aria-label="Not Viewed">Viewed</button>',
      false,
    ],
    ['<label><input type="checkbox" checked>Viewed</label>', true],
    ['<label><input type="checkbox">Viewed</label>', false],
    [
      '<span role="checkbox" aria-label="Viewed" aria-checked="true"></span>',
      true,
    ],
    ['<button aria-pressed="true">Wrap lines</button>', false],
    [
      '<div class="comment-body"><button aria-pressed="true">Viewed</button></div>',
      false,
    ],
  ]) {
    const markup = file("a.ts", 20, 3).replace(
      "</div><table>",
      `${control}</div><table>`,
    );
    assert.equal(read(header(1) + markup).page.files[0].viewed, expected);
    assert.equal(
      read(header(1) + markup.replace(/<table>.*?<\/table>/, "")).page.files[0]
        .viewed,
      expected,
    );
    const legacy = `<div class="file-header" data-path="a.ts"><span>+20 −3</span>${control}</div>`;
    assert.equal(read(header(1) + legacy).page.files[0].viewed, expected);
  }
});

test("the viewed control itself is exposed so it can be clicked", () => {
  for (const control of [
    '<button aria-pressed="false" aria-label="Not Viewed">Viewed</button>',
    '<label><input type="checkbox">Viewed</label>',
    '<span role="checkbox" aria-label="Viewed" aria-checked="false"></span>',
  ]) {
    const markup = file("a.ts", 20, 3).replace(
      "</div><table>",
      `${control}</div><table>`,
    );
    const found = read(header(1) + markup).page.files[0].viewControl;
    assert.match(found.outerHTML, /^<(button|input|span)/);
  }
  const ignored = file("a.ts", 20, 3).replace(
    "</div><table>",
    '<div class="comment-body"><button aria-pressed="true">Viewed</button></div></div><table>',
  );
  assert.equal(read(header(1) + ignored).page.files[0].viewControl, null);
  const actionable = file("a.ts", 20, 3).replace(
    "</div><table>",
    '<button aria-pressed="true" aria-label="Viewed"></button></div><table>',
  );
  const dup = read(header(1) + file("a.ts", 20, 3) + actionable).page.files;
  const disabledFirst = file("a.ts", 20, 3).replace(
    "</div><table>",
    '<button aria-pressed="false" aria-label="Not Viewed" disabled></button></div><table>',
  );
  const usable = read(header(1) + disabledFirst + actionable).page.files[0];
  assert.equal(usable.viewControl.disabled, false);
  assert.equal(usable.viewed, true);
  assert.equal(dup.length, 1);
  assert.equal(dup[0].viewed, true);
  assert.ok(dup[0].viewControl);
});

test("dedupe sticky headers but reject conflicting data", () => {
  const same = read(
    header() +
      file("src/a.ts", 5, 3) +
      file("src/a.ts", 5, 3) +
      file("src/a.spec.ts", 15, 0),
  );
  assert.equal(same.status.state, "complete");
  assert.equal(same.page.files.length, 2);
  const conflict = read(
    header() +
      file("src/a.ts", 5, 3) +
      file("src/a.ts", 8, 3) +
      file("src/a.spec.ts", 15, 0),
  );
  assert.equal(conflict.status.state, "partial");
  assert.equal(conflict.page.files[0].additions, null);
});

test("visible tab badges and sibling signed totals reconcile when labels omit the file count", () => {
  const markup = `<main><h1>PR title</h1>
    <nav aria-label="Pull request navigation">
      <a aria-label="Files changed" href="/acme/app/pull/42/changes">Files changed <span>5</span></a>
    </nav>
    <div><span>+471</span><span>-57</span><span aria-hidden="true"></span></div>
    ${file("src/a.ts", 21, 0)}
    ${file("src/a.spec.ts", 286, 0)}
    ${file("src/b.spec.ts", 35, 53)}
    ${file("src/b.ts", 36, 4)}
    ${file("test/a.it-spec.ts", 93, 0)}</main>`;
  const { page, status } = read(markup);
  assert.deepEqual(page.expected, {
    files: 5,
    additions: 471,
    deletions: 57,
    conflict: false,
  });
  assert.equal(status.state, "complete");
});

test("a visual counter plus its screen-reader copy is counted once", () => {
  const tab = `<nav aria-label="Pull request navigation">
    <a href="/acme/app/pull/42/changes" aria-label="Files changed">
      <svg aria-hidden="true"><title>File diff</title></svg>
      <span>Files changed</span><span aria-hidden="true">2</span><span class="sr-only"> (2)</span>
    </a>
  </nav>`;
  const { page, status } = read(
    header().replace(/<nav.*?<\/nav>/, tab) +
      file("src/a.ts", 5, 3) +
      file("src/a.spec.ts", 15, 0),
  );
  assert.equal(page.expected.files, 2);
  assert.equal(status.state, "complete");
});

test("missing files, missing counts, and equal net changes cannot falsely reconcile", () => {
  assert.equal(read(header() + file("src/a.ts", 5, 3)).status.state, "partial");
  const missing = read(
    header() + file("logo.png", null, null) + file("src/a.spec.ts", 15, 0),
  );
  assert.equal(missing.status.state, "partial");
  assert.equal(missing.totals.total.unknown, 1);
  assert.equal(missing.page.files[0].additions, null);
  assert.equal(
    read(header(1, 5, 3) + file("a.ts", 4, 2)).status.state,
    "partial",
  );
  assert.equal(
    read(
      header(1, 5, 3) +
        file("logo.png", null, null).replace(/<table>.*?<\/table>/, ""),
    ).page.files[0].additions,
    null,
  );
});

test("zero-file, zero-change, rename-only, and deletion-only PRs can reconcile", () => {
  assert.equal(read(header(0, 0, 0)).status.state, "complete");
  assert.equal(
    read(header(1, 0, 0) + file("renamed.ts", 0, 0)).status.state,
    "complete",
  );
  assert.equal(
    read(header(1, 0, 12) + file("deleted.ts", 0, 12)).status.state,
    "complete",
  );
});

test("selected commits, queries, filters and conversation are never labeled full PR", () => {
  const html = header() + file("src/a.ts", 5, 3) + file("src/a.spec.ts", 15, 0);
  for (const suffix of ["?w=1", "?diff=split"])
    assert.equal(read(html, url + suffix).status.state, "scoped");
  assert.equal(
    read(html + '<input placeholder="Filter files…" value="src/">').status
      .state,
    "scoped",
  );
  for (const suffix of [
    "",
    "/files",
    "/commits",
    "/checks",
    "/changes/abc..def",
    "/changes-other",
  ]) {
    const href = "https://github.com/acme/app/pull/42" + suffix;
    assert.equal(prContext(href), null);
    assert.equal(readPage(new JSDOM(html).window.document, href), null);
  }
  assert.equal(prContext("https://github.com/acme/app/issues/42"), null);
  assert.equal(prContext("https://evil.example/acme/app/pull/42"), null);
  assert.equal(prContext(url + "#diff-123").scoped, false);
});

test("no totals or unsupported markup is explicitly unverified", () => {
  const missing = read(file("src/a.ts", 5, 3)).status;
  assert.equal(missing.state, "partial");
  assert.match(missing.message, /file total and addition\/deletion totals/);
  const missingBadge = read(
    header(1, 5, 3).replace("Files changed <span>(1)</span>", "Files changed") +
      file("src/a.ts", 5, 3),
  ).status;
  assert.match(missingBadge.message, /file total for comparison/);
  assert.equal(read(header()).status.state, "partial");
});

test("diff code and comments cannot supply fabricated header counts or files", () => {
  const html =
    header(1, 5, 3) +
    file("src/a.ts", 5, 3).replace(
      "not parsed as statistics",
      '<span aria-label="Lines changed: 300 additions &amp; 4 deletions"></span>',
    ) +
    '<div class="markdown-body"><h3><a href="#diff-fake">fake.spec.ts</a></h3><span>Lines changed: 9 additions &amp; 0 deletions</span></div>';
  assert.equal(read(html).status.state, "complete");
  assert.equal(read(html).page.files.length, 1);
});

test("legacy real-markup fixture parses exact deletion-only file count", () => {
  const html = readFileSync(
    new URL("./fixtures/legacy.html", import.meta.url),
    "utf8",
  );
  const { page, status } = read(
    html,
    "https://github.com/microsoft/vscode/pull/337065/changes",
  );
  assert.equal(status.state, "complete");
  assert.equal(page.files[0].path, "build/npm/postinstall.ts");
  assert.equal(page.files[0].deletions, 15);
});

test("re-scan uses current DOM only after navigation or more files load", () => {
  const { doc, page } = read(header() + file("src/a.ts", 5, 3));
  assert.equal(page.files.length, 1);
  doc.body.insertAdjacentHTML("beforeend", file("src/a.spec.ts", 15, 0));
  assert.equal(readPage(doc, url).files.length, 2);
  doc.body.innerHTML = header(1, 4, 0) + file("new.ts", 4, 0);
  assert.deepEqual(
    readPage(doc, url).files.map((f) => f.path),
    ["new.ts"],
  );
});

test("files without GitHub counts reconcile to 0 lines only when the remainder is exactly zero", () => {
  const html =
    header(3, 5, 3) +
    file("src/a.ts", 5, 3) +
    file("src/entities/.gitkeep", null, null) +
    file("src/services/.gitkeep", null, null);
  const doc = new JSDOM(html, { url }).window.document;
  const page = reconcile(readPage(doc, url));
  const gitkeep = page.files.filter((f) => f.inferred);
  assert.equal(gitkeep.length, 2);
  assert.deepEqual(
    gitkeep.map((f) => [f.additions, f.deletions]),
    [
      [0, 0],
      [0, 0],
    ],
  );
  const totals = summarize(page.files, rules);
  const status = coverage(page, totals.total);
  assert.equal(totals.total.unknown, 0);
  assert.equal(status.state, "complete");
  assert.match(status.message, /2 files have no line counts on GitHub/);

  const check = (markup, href = url) => {
    const p = readPage(new JSDOM(markup, { url: href }).window.document, href);
    return reconcile(p) === p;
  };
  assert.ok(
    check(
      header() + file("logo.png", null, null) + file("src/a.spec.ts", 15, 0),
    ),
    "a positive remainder stays unknown",
  );
  assert.ok(
    check(
      header(3, 5, 3) + file("src/a.ts", 5, 3) + file("x/.gitkeep", null, null),
    ),
    "a file-count mismatch never reconciles",
  );
  assert.ok(
    check(
      header(2, 5, 3) + file("src/a.ts", 5, 3) + file("x/.gitkeep", null, null),
      url + "?w=1",
    ),
    "a scoped view never reconciles",
  );
});
