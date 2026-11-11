import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RULES,
  MAX_PATTERNS_PER_CATEGORY,
  classify,
  compileRules,
  globRegex,
  summarize,
  validateRules,
} from "../src/core.js";

const rules = compileRules(DEFAULT_RULES);
// Paths each ecosystem keeps out of review: tests, dependencies, config, generated files, docs, assets.
const OTHER_BY_ECOSYSTEM = {
  "JavaScript/TypeScript": [
    "src/Button.test.tsx",
    "src/user.spec.ts",
    "apps/api/src/app.e2e-spec.ts",
    "__tests__/user.js",
    "src/__mocks__/axios.ts",
    "src/__fixtures__/user.ts",
    "src/components/Button.stories.tsx",
    "src/components/Card.story.tsx",
    "src/__snapshots__/Button.test.tsx.snap",
    "cypress/e2e/login.cy.ts",
    "package.json",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "tsconfig.json",
    "vite.config.mts",
    "vitest.config.cts",
    ".eslintrc.cjs",
    ".lintstagedrc.json",
    ".husky/pre-commit",
    ".storybook/preview.tsx",
    ".changeset/brave-owls.md",
    "src/types.d.ts",
    "src/graphql/__generated__/types.ts",
    "dist/app.min.js",
  ],
  Python: [
    "test_user.py",
    "app/users/user_test.py",
    "tests/conftest.py",
    "conftest.py",
    "requirements.txt",
    "requirements-dev.txt",
    "requirements/base.txt",
    "Pipfile",
    "poetry.lock",
    "uv.lock",
    "pyproject.toml",
    "setup.cfg",
    "MANIFEST.in",
    ".python-version",
    "proto/user_pb2.py",
  ],
  Ruby: [
    "spec/models/user_spec.rb",
    "test/models/user_test.rb",
    "Gemfile",
    "Gemfile.lock",
    "acme.gemspec",
    ".rubocop.yml",
    ".rspec",
    ".ruby-version",
    "db/schema.rb",
    "services/billing/db/structure.sql",
  ],
  Go: [
    "pkg/user_test.go",
    "pkg/user/testdata/input.txt",
    "pkg/user/mock_store.go",
    "pkg/user/store_mock.go",
    "go.mod",
    "go.sum",
    "go.work",
    "api/user.pb.go",
    "api/zz_generated.deepcopy.go",
  ],
  "Java/Kotlin/Android": [
    "src/test/java/com/acme/ServiceTest.java",
    "app/src/androidTest/java/com/acme/TestHelpers.kt",
    "shared/src/commonTest/kotlin/Fakes.kt",
    "shared/src/jvmTest/kotlin/Fakes.kt",
    "src/main/kotlin/com/acme/UserServiceTest.kt",
    "lib/src/testFixtures/java/Users.java",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "settings.gradle.kts",
    "buildSrc/src/main/kotlin/conventions.gradle.kts",
    "gradle.properties",
    "gradlew",
    "gradle/wrapper/gradle-wrapper.jar",
    "mvnw",
    ".mvn/wrapper/maven-wrapper.jar",
    "app/app.iml",
  ],
  ".NET": [
    "tests/Api.Tests/UserTests.cs",
    "src/Api/UserServiceTest.cs",
    "src/Api/Api.csproj",
    "Acme.sln",
    "Directory.Build.props",
    "Directory.Packages.props",
    "src/Api/Forms/Main.Designer.cs",
    "src/Api/obj/Views.g.cs",
    "src/Api/obj/Views.g.i.cs",
    "global.json",
  ],
  PHP: [
    "tests/Feature/JobTest.php",
    "composer.json",
    "composer.lock",
    "phpunit.xml.dist",
    ".php-cs-fixer.dist.php",
  ],
  Rust: ["tests/integration.rs", "Cargo.toml", "Cargo.lock", "rust-toolchain"],
  "Swift/iOS": [
    "Tests/AppTests/UserTests.swift",
    "AppUITests/LoginTests.swift",
    "App/AppTests/Login/LoginTests.swift",
    "App/Info.plist",
    "Config/Release.xcconfig",
    "Package.swift",
    "Package.resolved",
    "Podfile",
    "Podfile.lock",
    "Acme.podspec",
    "Cartfile.resolved",
    "App.xcodeproj/project.pbxproj",
    "App.xcworkspace/contents.xcworkspacedata",
    "App/Assets.xcassets/AppIcon.appiconset/icon.png",
  ],
  "Dart/Flutter": [
    "test/widget_test.dart",
    "lib/user_repository_test.dart",
    "lib/user.mocks.dart",
    "lib/models/user.g.dart",
    "lib/models/user.freezed.dart",
    "pubspec.yaml",
    "pubspec.lock",
  ],
  Elixir: [
    "test/acme/accounts_test.exs",
    "mix.exs",
    "mix.lock",
    "config/runtime.exs",
    "apps/web/config/prod.exs",
  ],
  Scala: [
    "src/test/scala/acme/UserSpec.scala",
    "build.sbt",
    "project/plugins.sbt",
  ],
  "CI, editors and repo config": [
    ".github/workflows/build.yml",
    ".circleci/config.yml",
    ".buildkite/pipeline.yml",
    ".gitlab-ci.yml",
    "Jenkinsfile",
    ".devcontainer/devcontainer.json",
    ".vscode/launch.json",
    ".editorconfig",
    ".gitmodules",
    "CODEOWNERS",
    "docker-compose.yml",
    ".env.sample",
    "src/main/resources/application.properties",
  ],
  "Docs and assets": [
    "README.md",
    "docs/API.md",
    "docs/architecture/overview.html",
    "CHANGELOG",
    "LICENSE",
    "NOTICE",
    "images/logo.png",
    "diagrams/flow.drawio.svg",
    "public/hero.avif",
    "assets/fonts/Inter.woff2",
    "public/intro.mp4",
    "assets/brochure.pdf",
    "src/core/entities/.gitkeep",
  ],
};

// Source, migrations, build scripts and infrastructure, including names that look like test or config paths.
const STAYS_IN_CHANGES = [
  "src/Button.tsx",
  "src/pages/pricing.mdx",
  "src/contest.ts",
  "src/latest/feed.ts",
  "src/testimonials/List.tsx",
  "src/fixtures/Lighting.ts",
  "src/mocks/server.ts",
  "lib/integrations/slack.ts",
  "app/models/test_result.rb",
  "cmd/protest/main.go",
  "src/main/java/com/acme/Service.java",
  "src/main/java/com/acme/jit/JIT.java",
  "Sources/App/View.swift",
  "Sources/Stats/StatisticalTests/Normality.swift",
  "Sources/Stats/StatisticalTests.swift",
  "App/App.entitlements",
  "lib/acme/accounts.ex",
  "src/lib.rs",
  "app/Jobs/SendMessage.php",
  "database/migrations/create_jobs.php",
  "db/migrate/20240101000000_add_users.rb",
  "app/src/main/AndroidManifest.xml",
  "App/Base.lproj/Main.storyboard",
  "deployment/terraform/main.tf",
  "bin/bootstrap.sh",
  "Dockerfile",
  "Makefile",
  "CMakeLists.txt",
  "src/level.map",
];

test("each ecosystem's tests, dependencies, config, generated files, docs and assets go to hidden Other", () => {
  for (const [ecosystem, paths] of Object.entries(OTHER_BY_ECOSYSTEM))
    for (const path of paths)
      assert.equal(
        classify(path, rules).name,
        "Other",
        `${ecosystem}: ${path}`,
      );
});

test("source, migrations, build scripts and look-alike names stay in Changes", () => {
  for (const path of STAYS_IN_CHANGES)
    assert.equal(classify(path, rules).name, "Changes", path);
});

test("the defaults are one hidden Other category within the pattern limit", () => {
  assert.deepEqual(
    DEFAULT_RULES.map((rule) => [rule.name, rule.hidden]),
    [["Other", true]],
  );
  const patterns = DEFAULT_RULES[0].patterns;
  assert.equal(new Set(patterns).size, patterns.length, "no duplicates");
  assert.ok(patterns.length <= MAX_PATTERNS_PER_CATEGORY);
});

test("a category accepts up to the pattern limit and rejects one more", () => {
  const category = (count) => [
    { name: "A", patterns: Array.from({ length: count }, (_, i) => `*.x${i}`) },
  ];
  assert.equal(
    validateRules(category(MAX_PATTERNS_PER_CATEGORY))[0].patterns.length,
    MAX_PATTERNS_PER_CATEGORY,
  );
  assert.throws(
    () => validateRules(category(MAX_PATTERNS_PER_CATEGORY + 1)),
    new RegExp(`up to ${MAX_PATTERNS_PER_CATEGORY} patterns`),
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
