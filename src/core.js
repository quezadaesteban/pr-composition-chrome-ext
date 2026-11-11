// Hidden categories are counted but never shown, so Changes is what a reviewer reads first.
export const DEFAULT_RULES = [
  {
    name: "Other",
    hidden: true,
    patterns: [
      "**/tests/**",
      "**/test/**",
      "**/__tests__/**",
      "**/e2e/**",
      "**/cypress/**",
      "**/spec/**",
      "*.spec.*",
      "*.test.*",
      "*.stories.*",
      "*_spec.rb",
      "*Test.php",
      "*Test.java",
      "*Test.cs",
      "*Tests.cs",
      "test_*.py",
      "*_test.py",
      "*_test.go",
      "**/__snapshots__/**",
      "*.snap",
      "yarn.lock",
      "package-lock.json",
      "npm-shrinkwrap.json",
      "pnpm-lock.yaml",
      "bun.lock",
      "bun.lockb",
      "*.lock",
      "*.lockfile",
      "go.sum",
      "packages.lock.json",
      ".pnp.cjs",
      ".pnp.loader.mjs",
      "**/.yarn/**",
      "*.json",
      "*.yml",
      "*.yaml",
      "*.toml",
      "*.ini",
      "*.config.js",
      "*.config.cjs",
      "*.config.mjs",
      "*.config.ts",
      ".editorconfig",
      ".gitignore",
      ".gitattributes",
      ".gitkeep",
      ".dockerignore",
      ".prettierignore",
      ".eslintignore",
      ".nvmrc",
      ".npmrc",
      ".node-version",
      ".tool-versions",
      ".eslintrc*",
      ".prettierrc*",
      ".babelrc*",
      ".stylelintrc*",
      ".env.example",
      "**/.github/**",
      "**/.circleci/**",
      "**/.vscode/**",
      "**/.idea/**",
      "CODEOWNERS",
      "LICENSE*",
      "*.md",
      "*.rst",
      "*.adoc",
      "**/docs/**",
      "*.svg",
      "*.png",
      "*.jpg",
      "*.jpeg",
      "*.gif",
      "*.webp",
      "*.ico",
      "*.min.js",
      "*.min.css",
      "*.js.map",
      "*.css.map",
      "*.d.ts",
      "*.generated.*",
      "*.pb.go",
      "*.gen.go",
      "*_pb2.py",
      "*_pb2_grpc.py",
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
      rule.patterns.length > 100 ||
      rule.patterns.some(
        (p) =>
          typeof p !== "string" ||
          !p.trim() ||
          p.length > 200 ||
          /[{}\[\]\\!]/.test(p),
      )
    )
      throw new Error(
        `${name}: use up to 100 patterns with *, **, or ? (no braces, brackets, backslashes or negation).`,
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
