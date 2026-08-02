import { readAttempts, clearAttempts } from './js/diagnostics.js';

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

/**
 * The diagnostics record is also reachable from the service worker console.
 *
 * The panel's own console is the wrong place to read it twice over: it is
 * awkward to find (right-clicking *inside* the panel, not the page, opens a
 * second DevTools window), and attaching DevTools to the panel may itself
 * disturb the intermittent failure being investigated. The service worker
 * console is a stable address — chrome://extensions → "service worker" — and
 * chrome.storage.local is shared, so it sees exactly the same entries.
 */
globalThis.slowHostelDiagnostics = async () => {
  const attempts = await readAttempts();
  console.table(attempts);
  return attempts;
};

globalThis.slowHostelDiagnosticsClear = clearAttempts;
