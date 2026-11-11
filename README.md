# PR Composition

A token-free Chrome extension that shows how much of a GitHub pull request a reviewer actually needs to read. **Changes** counts the files that change behaviour. Tests, config, lockfiles, docs and generated files are counted separately in a hidden **Other** category, so they don't pull attention.

The extension reads exact additions/deletions from the file headers already present in your logged-in GitHub page. It makes **no network requests**, reads no cookies or credentials, and stores only your category rules in `chrome.storage.local`. No backend, GitHub API, token, analytics, or runtime dependencies.

## Install

PR Composition isn't on the Chrome Web Store. Load it unpacked from a release:

1. From the [latest release](https://github.com/quezadaesteban/pr-composition-chrome-ext/releases/latest), download `pr-composition-v<version>.zip`. Not GitHub's "Source code" archive.
2. Unzip it into a folder you'll keep. Chrome loads the extension from that folder.
3. In the Chrome profile you use for GitHub, open `chrome://extensions` and turn on **Developer mode**.
4. Choose **Load unpacked** and select the unzipped folder, the one that contains `manifest.json`.
5. Open a PR's **Files changed** tab at `/<owner>/<repo>/pull/<number>/changes`.

To update, replace the folder's contents with a newer release, click Reload for PR Composition in `chrome://extensions`, and reload the PR page.

To run from source instead: `npm ci --ignore-scripts`, `npm run build`, then load the `dist` directory the same way. After changing the source, run `npm run build`, click Reload, and reload the PR page.

The page-reading script loads only on the exact PR `/changes` route, including a trailing slash or query string. It unloads when you leave that route. A background worker uses `webNavigation` to detect GitHub navigation, `scripting` to inject on `/changes`, and `storage` to save rules. Enterprise GitHub domains are not included.

## Where it appears

- **Review toolbar:** a chip between **All commits** and **N / M viewed** shows Changes as `+a −d`, then review progress for that category, `N / M files reviewed`. GitHub's own PR total is already shown at the right of the tabs, so the chip doesn't repeat it. The chip also holds a **Partial data** or **Selected view** marker when counts can't be verified, an information icon (accounting status) and a gear (category settings).
- **File-tree sidebar:** a review list sits above **Filter files…** with a Viewed checkbox and the path of every Changes file. Long paths are trimmed from the left so the file name stays visible. Click a path to jump to that diff. When the file tree is collapsed, the list opens from the chip's file count instead.
- **Diffs:** the extension adds nothing to the diff column.

If GitHub's review toolbar can't be found, nothing is shown; the extension keeps watching and appears once the toolbar does. Only extension-owned elements are inserted; GitHub's own nodes are never moved.

## Reviewing with it

Ticking a box clicks that file's own GitHub **Viewed** control, so GitHub saves the state and collapses the file. The box only changes once GitHub's control does. After a file is marked viewed, from the list or from GitHub's file header, the page scrolls to the next unviewed file in the list, wrapping round at the end. It waits for GitHub to finish collapsing the file and lands just below the toolbar. Scrolling, typing or switching category before it moves cancels the jump. Un-viewing a file, viewing a file outside the list, and Viewed state that GitHub restores on its own never move the page.

## What the numbers mean

- **Changes:** every file that does not match a configured category. This is the remainder, not a language detector.
- **Other (hidden):** the default rule. Tests, lockfiles, config (`*.json`, `*.yml`, `*.yaml`, `*.toml`, dotfile configs, `*.config.*`, `.github/**`), docs (`*.md`, `docs/**`) and generated files or assets (`*.svg`, images, minified files, source maps, snapshots, `.gitkeep`). It is counted but never shown. Blanket config patterns also catch things like i18n JSON or Kubernetes manifests; add a visible category before Other if you want those reviewed.
- **Custom categories:** each visible category gets its own cell in the chip; clicking it shows its files in the sidebar list.

Changes + every category, hidden or visible, = all loaded files. The accounting check compares that total with GitHub's PR header.

A successful accounting check appears only in the information panel, when GitHub's headline additions, deletions and file count all match the loaded file headers. GitHub shows no line counts for empty files such as a deleted `.gitkeep`. When every other count already matches the header exactly, those files are counted as 0 lines, and the information panel says so. A positive or negative remainder stays partial. Otherwise the chip says **Partial data** or **Selected view**. Missing line counts are unknown, not zero; `≥` marks sums that exclude unknown line counts. The extension does not fetch, expand, or cache missing files.

Query parameters (including whitespace and layout options) and active text filters are conservatively labeled as selected views even if counts happen to match. Renames use GitHub's `data-path` where present, or the rendered heading path.

## Configure categories

Click the **Configure categories** gear in the chip. Edit the JSON rules and save them for **This repository** or **All repositories**. Repository rules override global rules. **Use global rules for this repository** removes that repository's override. Loading defaults fills the editor; click Save to apply them.

Example: show infrastructure as its own category, ahead of the hidden default.

```json
[
  {
    "name": "Infra",
    "patterns": ["**/terraform/**", "Dockerfile", "docker-compose*.yml"]
  },
  {
    "name": "Other",
    "hidden": true,
    "patterns": ["*.spec.*", "**/tests/**", "yarn.lock", "*.json", "*.md"]
  }
]
```

Rules are case-sensitive and evaluated top to bottom; the first matching category wins, so a custom category that overlaps Other must come before it. `"hidden": true` counts a category without showing it. `Changes` and `Total` are reserved names. Use **Load defaults into editor** to start from the full default Other rule; rules you saved earlier keep overriding the defaults until you save new ones.

- `*` matches within one path segment; `**` can cross directories; `?` matches one non-slash character.
- `**/tests/**` matches both `tests/a.ts` and `packages/foo/tests/a.ts`.
- Patterns without a slash, such as `*.spec.ts`, match the basename at any depth.
- Patterns with a slash are relative to the repository root. Use `**/` for any depth.
- Braces, bracket classes, negation, and regular expressions are deliberately unsupported. Use multiple patterns instead.

## Development and verification

Requires Node.js 22.16+ and npm.

```sh
npm ci --ignore-scripts
npm run format
npm run build
npm test
npm run demo
```

`npm run lint` checks formatting. There is no separate static-analysis linter.

Validation includes Node/jsdom checks covering glob precedence, hidden categories, zero-remainder reconciliation, unknown counts, real legacy GitHub markup, React-like semantic fixtures, duplicate/conflicting headers, partial loading, toolbar and sidebar placement (including markup replacement and a collapsed file tree), route-specific injection and cleanup, settings, text-safe rendering, Viewed sync, auto-advance and its cancellation, and absence of network calls in exercised flows. The toolbar chip, sidebar list, and auto-advance from both the list and GitHub's header control were also checked on a live private PR.

`npm test` runs against `dist/`, so build first.

## Releasing

Runs on macOS or Linux. Requires the `zip` command (preinstalled on macOS and most Linux distributions) and the GitHub CLI.

1. Bump `version` in both `extension/manifest.json` and `package.json` (and the two matching entries in `package-lock.json`).
2. Run `npm run package`. It checks formatting, makes a clean build, runs the tests against that build, and writes `pr-composition-v<version>.zip` with the extension files and the license at its root. It stops at the first failure.
3. Commit, push, and publish the zip: `gh release create v<version> pr-composition-v<version>.zip --target main`.

## License

[MIT](LICENSE)
