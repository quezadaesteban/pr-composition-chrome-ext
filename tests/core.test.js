import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RULES,
  classify,
  compileRules,
  globRegex,
  summarize,
  validateRules,
} from "../src/core.js";

const rules = compileRules(DEFAULT_RULES);
test("tests, config, lockfiles, docs and assets go to hidden Other; behaviour stays in Changes", () => {
  for (const path of [
    "tests/Feature/JobTest.php",
    "src/Button.test.tsx",
    "src/user.spec.ts",
    "pkg/user_test.go",
    "test_user.py",
    "__tests__/user.js",
    ".github/workflows/build.yml",
    "docs/API.md",
    "README.md",
    "images/logo.png",
    "diagrams/flow.drawio.svg",
    "package-lock.json",
    "yarn.lock",
    "package.json",
    "docker-compose.yml",
    ".vscode/launch.json",
    "src/core/entities/.gitkeep",
  ])
    assert.equal(classify(path, rules).name, "Other", path);
  for (const path of [
    "src/Button.tsx",
    "app/Jobs/SendMessage.php",
    "database/migrations/create_jobs.php",
    "deployment/terraform/main.tf",
    "bin/bootstrap.sh",
    "src/level.map",
  ]) {
    assert.equal(classify(path, rules).name, "Changes", path);
  }
  assert.deepEqual(
    DEFAULT_RULES.map((rule) => [rule.name, rule.hidden]),
    [["Other", true]],
  );
});

test("Changes is reduced by each configured category without changing Total", () => {
  const files = [
    { path: "src/a.ts", additions: 10, deletions: 3 },
    { path: "src/a.spec.ts", additions: 100, deletions: 1 },
    { path: "deploy/main.tf", additions: 5, deletions: 2 },
    { path: "unknown.bin", additions: null, deletions: null },
  ];
  const before = summarize(files, rules);
  const after = summarize(
    files,
    compileRules([...DEFAULT_RULES, { name: "Infra", patterns: ["*.tf"] }]),
  );
  assert.equal(before.source.additions, 15);
  assert.deepEqual(after.source, {
    name: "Changes",
    files: 2,
    additions: 10,
    deletions: 3,
    unknown: 1,
  });
  assert.deepEqual(
    after.categories.map((category) => category.name),
    ["Other", "Infra"],
  );
  assert.deepEqual(after.categories[1], {
    name: "Infra",
    hidden: false,
    files: 1,
    additions: 5,
    deletions: 2,
    unknown: 0,
  });
  assert.deepEqual(before.total, after.total);
  for (const key of ["files", "additions", "deletions", "unknown"]) {
    assert.equal(
      after.total[key],
      after.source[key] +
        after.categories.reduce((sum, category) => sum + category[key], 0),
    );
  }
  assert.deepEqual(
    summarize(files, rules),
    before,
    "removing Infra restores its files to Changes",
  );
});

test("glob semantics: root, nested, single-segment and literal regex symbols", () => {
  assert.ok(globRegex("**/tests/**").test("tests/a.ts"));
  assert.ok(globRegex("**/tests/**").test("packages/a/tests/a.ts"));
  assert.ok(globRegex("*.spec.ts").test("src/a.spec.ts"));
  assert.ok(globRegex("src/*.ts").test("src/a.ts"));
  assert.ok(!globRegex("src/*.ts").test("src/sub/a.ts"));
  assert.ok(!globRegex("src/*.ts").test("packages/src/a.ts"));
  assert.ok(globRegex("src/?.ts").test("src/a.ts"));
  assert.ok(!globRegex("src/?.ts").test("src/ab.ts"));
  assert.ok(globRegex("a+b.ts").test("a+b.ts"));
  assert.ok(!globRegex("a+b.ts").test("aaab.ts"));
  assert.ok(!globRegex("*.ts").test("a.TS"));
});

test("custom categories use first match, so overlapping ones go before Other", () => {
  const custom = compileRules([
    { name: "Fixtures", patterns: ["**/fixtures/**"] },
    ...DEFAULT_RULES,
    { name: "Config", patterns: ["*.json"] },
  ]);
  assert.equal(classify("tests/fixtures/a.json", custom).name, "Fixtures");
  assert.equal(classify("tests/input.json", custom).name, "Other");
  assert.equal(classify("config/app.json", custom).name, "Other");
  const first = compileRules([
    { name: "Config", patterns: ["*.json"] },
    ...DEFAULT_RULES,
  ]);
  assert.equal(classify("config/app.json", first).name, "Config");
  assert.equal(classify("a.random", custom).name, "Changes");
});

test("invalid config cannot override a last known good config", () => {
  for (const value of [
    null,
    {},
    [{ name: "Changes", patterns: ["*"] }],
    [{ name: "TOTAL", patterns: ["*"] }],
    [{ name: "A", patterns: ["*.{ts,tsx}"] }],
    [{ name: "A", patterns: ["!foo"] }],
    [{ name: "A", hidden: "yes", patterns: ["*"] }],
    [
      { name: "A", patterns: ["*"] },
      { name: "a", patterns: ["*"] },
    ],
  ])
    assert.throws(() => validateRules(value));
  assert.deepEqual(validateRules([]), []);
  assert.deepEqual(
    validateRules([{ name: "A", hidden: false, patterns: ["*"] }]),
    [{ name: "A", patterns: ["*"] }],
  );
});

test("Changes plus configured categories equals Total, with explicit unknown counts", () => {
  const summary = summarize(
    [
      { path: "src/a.spec.ts", additions: 100, deletions: 2 },
      { path: "src/a.ts", additions: 5, deletions: 10 },
      { path: "logo.png", additions: null, deletions: null },
    ],
    rules,
  );
  assert.deepEqual(summary.total, {
    files: 3,
    additions: 105,
    deletions: 12,
    unknown: 1,
  });
  assert.deepEqual(summary.categories[0], {
    name: "Other",
    hidden: true,
    files: 2,
    additions: 100,
    deletions: 2,
    unknown: 1,
  });
  assert.deepEqual(summary.source, {
    name: "Changes",
    files: 1,
    additions: 5,
    deletions: 10,
    unknown: 0,
  });
  assert.equal(summarize([], rules).total.files, 0);
});

test("empty rules put everything into Changes, including when no files are loaded", () => {
  const summary = summarize(
    [{ path: "tests/a.ts", additions: 3, deletions: 1 }],
    compileRules([]),
  );
  assert.deepEqual(summary.categories, []);
  assert.equal(summary.source.additions, 3);
  assert.equal(summary.total.additions, 3);
  const empty = summarize([], rules);
  assert.equal(empty.source.files, 0);
  assert.equal(empty.categories[0].name, "Other");
  assert.equal(empty.categories[0].files, 0);
});
