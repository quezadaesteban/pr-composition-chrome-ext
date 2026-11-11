import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

test("inject only on /changes, for direct and same-document navigation", async () => {
  const callbacks = {},
    injections = [],
    messages = [];
  const event = (name) => ({
    addListener(fn, filter) {
      callbacks[name] = fn;
      assert.equal(filter.url[0].hostEquals, "github.com");
    },
  });
  const chrome = {
    webNavigation: {
      onCompleted: event("complete"),
      onHistoryStateUpdated: event("history"),
    },
    scripting: {
      async executeScript(details) {
        injections.push(details);
      },
    },
    tabs: {
      async sendMessage(...args) {
        messages.push(args);
      },
    },
  };
  runInNewContext(
    readFileSync(new URL("../dist/background.js", import.meta.url), "utf8"),
    { chrome, URL },
  );
  const base = { frameId: 0, tabId: 7, documentId: "same-document" };
  for (const url of [
    "https://github.com/acme/app",
    "https://github.com/acme/app/pull/42",
    "https://github.com/acme/app/pull/42/files",
    "https://github.com/acme/app/pull/42/changes-other",
  ])
    await callbacks.history({ ...base, url });
  assert.equal(injections.length, 0);
  assert.equal(messages.length, 4);
  const url = "https://github.com/acme/app/pull/42/changes";
  await callbacks.complete({ ...base, url });
  await callbacks.history({ ...base, url: url + "?w=1" });
  assert.equal(injections.length, 2);
  assert.equal(injections[0].files[0], "content.js");
  assert.equal(injections[0].target.documentIds[0], "same-document");
  await callbacks.history({ ...base, frameId: 1, url });
  await callbacks.history({
    ...base,
    url: "https://example.com/acme/app/pull/42/changes",
  });
  assert.equal(injections.length, 2);
});
