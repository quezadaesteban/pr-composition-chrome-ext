import { mkdir, copyFile, rm } from "node:fs/promises";
import { build } from "esbuild";

// Start from an empty dist/ so files from earlier builds never ship.
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await copyFile("extension/manifest.json", "dist/manifest.json");
await build({
  entryPoints: ["src/content.js", "src/background.js"],
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "chrome120",
  loader: { ".css": "text" },
  legalComments: "none",
});
console.log("Load the dist directory as an unpacked Chrome extension.");
