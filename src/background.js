import { prContext } from "./dom.js";

// Only the changes route receives page-reading code, including GitHub's SPA navigation.
async function navigate(details) {
  if (details.frameId !== 0 || !details.url.startsWith("https://github.com/"))
    return;
  try {
    if (prContext(details.url)) {
      await chrome.scripting.executeScript({
        target: { tabId: details.tabId, documentIds: [details.documentId] },
        files: ["content.js"],
      });
    } else {
      await chrome.tabs.sendMessage(
        details.tabId,
        { type: "pr-composition:route-change" },
        { documentId: details.documentId },
      );
    }
  } catch {
    // The document can navigate away/close before injection, or have no existing panel.
  }
}

const filter = { url: [{ hostEquals: "github.com" }] };
chrome.webNavigation.onCompleted.addListener(navigate, filter);
chrome.webNavigation.onHistoryStateUpdated.addListener(navigate, filter);
