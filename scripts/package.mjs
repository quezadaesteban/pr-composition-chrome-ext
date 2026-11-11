import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";

// What Chrome loads, from dist/, plus the license; manifest.json sits at the zip root.
const EXTENSION_FILES = ["manifest.json", "background.js", "content.js"];
const LICENSE_FILE = "LICENSE";

const manifest = readJson("extension/manifest.json");
const packageJson = readJson("package.json");
if (manifest.version !== packageJson.version) {
  throw new Error(
    `Version mismatch: manifest.json is ${manifest.version}, package.json is ${packageJson.version}.`,
  );
}

const archive = `pr-composition-v${manifest.version}.zip`;
// Removed up front: zip would update a stale archive in place, and a failed run
// must not leave the previous zip looking like a fresh one.
rmSync(archive, { force: true });

// Tests read dist/, so they run after a clean build of exactly what ships.
run("npm", ["run", "lint"]);
run("npm", ["run", "build"]);
run("npm", ["test"]);

run("zip", [
  // A missing or unreadable input fails the run instead of being skipped.
  "-MM",
  "-X",
  "-j",
  archive,
  ...EXTENSION_FILES.map((file) => `dist/${file}`),
  LICENSE_FILE,
]);
console.log(`Packaged ${archive}`);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function run(command, args) {
  execFileSync(command, args, { stdio: "inherit" });
}
