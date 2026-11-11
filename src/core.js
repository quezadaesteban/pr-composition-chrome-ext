// Leaves room above the ~200 default patterns for a user's own additions.
export const MAX_PATTERNS_PER_CATEGORY = 250;

// Hidden categories are counted but never shown, so Changes is what a reviewer reads first.
export const DEFAULT_RULES = [
  {
    name: "Other",
    hidden: true,
    patterns: [
      // Tests and test support. Test directories cover most languages, e.g.
      // Java, Kotlin and Scala under src/test/.
      "**/tests/**",
      "**/test/**",
      "**/Tests/**",
      "**/__tests__/**",
      "**/e2e/**",
      "**/cypress/**",
      "**/spec/**",
      "**/androidTest/**",
      "**/commonTest/**",
      "**/jvmTest/**",
      "**/jsTest/**",
      "**/iosTest/**",
      "**/testFixtures/**",
      "**/testdata/**",
      "**/__mocks__/**",
      "**/__fixtures__/**",
      "**/__snapshots__/**",
      "*.spec.*",
      "*.test.*",
      "*.e2e-spec.*",
      "*.stories.*",
      "*.story.*",
      "*.snap",
      "conftest.py",
      "test_*.py",
      "*_test.py",
      "*_spec.rb",
      "*_test.rb",
      "*_test.go",
      "mock_*.go",
      "*_mock.go",
      "*Test.java",
      "*Tests.java",
      "*Test.kt",
      "*Tests.kt",
      "*Test.cs",
      "*Tests.cs",
      "*Test.php",
      // Xcode test targets: a *Tests file inside a *Tests folder.
      "**/*Tests/**/*Tests.swift",
      "*_test.dart",
      "*.mocks.dart",
      "*_test.exs",
      // Dependency manifests, lockfiles and build tool wrappers.
      "*.lock",
      "*.lockfile",
      "yarn.lock",
      "package-lock.json",
      "npm-shrinkwrap.json",
      "pnpm-lock.yaml",
      "bun.lock",
      "bun.lockb",
      "packages.lock.json",
      ".pnp.cjs",
      ".pnp.loader.mjs",
      "**/.yarn/**",
      "go.mod",
      "go.sum",
      "go.work",
      "go.work.sum",
      "Gemfile",
      "*.gemspec",
      "Pipfile",
      "requirements*.txt",
      "**/requirements/*.txt",
      "MANIFEST.in",
      "pom.xml",
      "*.gradle",
      "*.gradle.kts",
      "gradlew",
      "gradlew.bat",
      "**/gradle/wrapper/**",
      "mvnw",
      "mvnw.cmd",
      "**/.mvn/**",
      "*.sbt",
      "mix.exs",
      "**/config/*.exs",
      "*.csproj",
      "*.fsproj",
      "*.vbproj",
      "*.sln",
      "Directory.Build.props",
      "Directory.Build.targets",
      "Directory.Packages.props",
      "Package.swift",
      "Package.resolved",
      "Podfile",
      "*.podspec",
      "Cartfile",
      "Cartfile.resolved",
      // Configuration: data formats, tool and editor settings, CI.
      "*.json",
      "*.yml",
      "*.yaml",
      "*.toml",
      "*.ini",
      "*.cfg",
      "*.properties",
      "*.plist",
      "*.xcconfig",
      "*.config.js",
      "*.config.cjs",
      "*.config.mjs",
      "*.config.ts",
      "*.config.mts",
      "*.config.cts",
      ".editorconfig",
      ".gitignore",
      ".gitattributes",
      ".gitmodules",
      ".gitkeep",
      ".mailmap",
      ".dockerignore",
      ".prettierignore",
      ".eslintignore",
      ".npmignore",
      ".nvmrc",
      ".npmrc",
      ".yarnrc",
      ".node-version",
      ".python-version",
      ".ruby-version",
      ".java-version",
      ".terraform-version",
      ".tool-versions",
      "rust-toolchain",
      ".eslintrc*",
      ".prettierrc*",
      ".babelrc*",
      ".stylelintrc*",
      ".browserslistrc",
      ".swcrc",
      ".lintstagedrc*",
      ".commitlintrc*",
      ".huskyrc*",
      ".rubocop*",
      ".rspec",
      ".php-cs-fixer*",
      ".clang-format",
      ".clang-tidy",
      "phpunit.xml",
      "phpunit.xml.dist",
      ".env.example",
      ".env.sample",
      ".env.template",
      "Jenkinsfile",
      "CODEOWNERS",
      "*.iml",
      "**/.github/**",
      "**/.circleci/**",
      "**/.buildkite/**",
      "**/.husky/**",
      "**/.changeset/**",
      "**/.devcontainer/**",
      "**/.storybook/**",
      "**/.vscode/**",
      "**/.idea/**",
      // IDE project files.
      "**/*.xcodeproj/**",
      "**/*.xcworkspace/**",
      // Docs.
      "LICENSE*",
      "CHANGELOG*",
      "AUTHORS*",
      "NOTICE*",
      "*.md",
      "*.rst",
      "*.adoc",
      "**/docs/**",
      // Generated code and build output.
      "*.d.ts",
      "*.generated.*",
      "**/__generated__/**",
      "*.min.js",
      "*.min.css",
      "*.js.map",
      "*.css.map",
      "*.pb.go",
      "*.gen.go",
      "zz_generated*.go",
      "*_pb2.py",
      "*_pb2_grpc.py",
      "*.g.dart",
      "*.freezed.dart",
      "*.g.cs",
      "*.g.i.cs",
      "*.Designer.cs",
      "**/db/schema.rb",
      "**/db/structure.sql",
      // Images, fonts and media.
      "*.svg",
      "*.png",
      "*.jpg",
      "*.jpeg",
      "*.gif",
      "*.webp",
      "*.avif",
      "*.bmp",
      "*.tiff",
      "*.ico",
      "*.woff",
      "*.woff2",
      "*.ttf",
      "*.otf",
      "*.eot",
      "*.mp4",
      "*.webm",
      "*.mp3",
      "*.wav",
      "*.pdf",
      "**/*.xcassets/**",
    ],
  },
];

// Deliberately small glob language: *, **, ?. A basename pattern matches at any depth.
export function globRegex(pattern) {
  pattern = pattern.replace(/^\.\//, "");
  let source = pattern.includes("/") ? "^" : "^(?:.*/)?";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "*" && pattern[i + 1] === "*") {
      while (pattern[i + 1] === "*") i++;
      if (pattern[i + 1] === "/") {
        source += "(?:.*/)?";
        i++;
      } else source += ".*";
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else source += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(source + "$");
}

export function validateRules(value) {
  if (!Array.isArray(value) || value.length > 30)
    throw new Error("Use an array of up to 30 categories.");
  const names = new Set(["changes", "total"]);
  return value.map((rule) => {
    if (
      !rule ||
      typeof rule.name !== "string" ||
      !rule.name.trim() ||
      rule.name.length > 40
    )
      throw new Error("Each category needs a name of 1–40 characters.");
    const name = rule.name.trim();
    if (names.has(name.toLowerCase()))
      throw new Error(
        "Category names must be unique. Changes and Total are automatic and cannot be configured.",
      );
    names.add(name.toLowerCase());
    if (
      !Array.isArray(rule.patterns) ||
      rule.patterns.length > MAX_PATTERNS_PER_CATEGORY ||
      rule.patterns.some(
        (p) =>
          typeof p !== "string" ||
          !p.trim() ||
          p.length > 200 ||
          /[{}\[\]\\!]/.test(p),
      )
    )
      throw new Error(
        `${name}: use up to ${MAX_PATTERNS_PER_CATEGORY} patterns with *, **, or ? (no braces, brackets, backslashes or negation).`,
      );
    if (rule.hidden !== undefined && typeof rule.hidden !== "boolean")
      throw new Error(`${name}: hidden must be true or false.`);
    return {
      name,
      ...(rule.hidden ? { hidden: true } : {}),
      patterns: rule.patterns.map((p) => p.trim()),
    };
  });
}

export function compileRules(rules) {
  return validateRules(rules).map((rule) => ({
    ...rule,
    matchers: rule.patterns.map(globRegex),
  }));
}

export function classify(path, compiled) {
  return (
    compiled.find((rule) =>
      rule.matchers.some((matcher) => matcher.test(path)),
    ) ?? { name: "Changes" }
  );
}

export function summarize(files, compiled) {
  const empty = () => ({ files: 0, additions: 0, deletions: 0, unknown: 0 });
  const total = empty();
  const source = { ...empty(), name: "Changes" };
  const categories = new Map(
    compiled.map((rule) => [
      rule.name,
      { ...empty(), name: rule.name, hidden: !!rule.hidden },
    ]),
  );
  const classified = files.map((file) => {
    const rule = classify(file.path, compiled);
    for (const stats of [total, categories.get(rule.name) ?? source]) {
      stats.files++;
      if (file.additions === null || file.deletions === null) stats.unknown++;
      else {
        stats.additions += file.additions;
        stats.deletions += file.deletions;
      }
    }
    return { ...file, category: rule.name };
  });
  return {
    total,
    source,
    categories: [...categories.values()],
    files: classified,
  };
}
