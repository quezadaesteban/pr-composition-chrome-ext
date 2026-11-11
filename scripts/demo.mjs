import { mkdir, copyFile } from "node:fs/promises";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

await mkdir("demo-dist", { recursive: true });
for (const file of ["index.html", "demo.js"])
  await copyFile(`demo/${file}`, `demo-dist/${file}`);
await build({
  entryPoints: ["src/content.js"],
  outfile: "demo-dist/content.js",
  bundle: true,
  format: "iife",
  target: "chrome120",
  loader: { ".css": "text" },
  define: {
    "location.href": JSON.stringify(
      "https://github.com/example/invitations/pull/42/changes",
    ),
  },
});
const allowed = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/demo.js", "demo.js"],
  ["/content.js", "content.js"],
]);
createServer(async (req, res) => {
  const file = allowed.get(req.url);
  if (!file) {
    res.writeHead(404);
    res.end();
    return;
  }
  try {
    res.setHeader(
      "Content-Type",
      file.endsWith(".html")
        ? "text/html; charset=utf-8"
        : "text/javascript; charset=utf-8",
    );
    res.end(await readFile(`demo-dist/${file}`));
  } catch {
    res.writeHead(500);
    res.end();
  }
}).listen(4173, "127.0.0.1", () =>
  console.log("Local demo: http://127.0.0.1:4173"),
);
