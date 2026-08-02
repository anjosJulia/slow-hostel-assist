import { HQBED_HOME_URL, HQBED_TAB_URL_PATTERN } from './constants.js';

/**
 * Recovery actions offered alongside a notice.
 *
 * `chrome.tabs.query` can filter by URL because the extension already holds
 * host permission for admin.hqbeds.com.br — no extra "tabs" permission is
 * requested for these.
 */

/**
 * Brings an HQBed tab to the front, opening one only if the window has none.
 * Reusing the tab keeps the operator's place in the occupancy map.
 */
export async function focusOrOpenHqbedTab() {
  const [existingTab] = await chrome.tabs.query({
    url: HQBED_TAB_URL_PATTERN,
    currentWindow: true,
  });

  if (existingTab?.id) {
    await chrome.tabs.update(existingTab.id, { active: true });
    return;
  }

  await chrome.tabs.create({ url: HQBED_HOME_URL, active: true });
}

/**
 * Resolves the tab the panel should read, reporting which lookup answered.
 *
 * A side panel is not a tab and has no window of its own, so `currentWindow`
 * resolves against whatever window is current *at that moment* — and the panel
 * outlives tab switches, window switches and focus changes that a popup never
 * survived. When it comes back empty the panel used to report "não consigo ler
 * a página", which reads to the operator as the extension being broken.
 *
 * Falling back costs nothing and each step is narrower than the last. The
 * `source` is recorded in diagnostics so a fallback that starts firing in the
 * field is visible rather than silent.
 */
export async function resolveTabToRead() {
  const [inCurrentWindow] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (inCurrentWindow?.id) {
    return { tab: inCurrentWindow, source: 'currentWindow' };
  }

  const [inLastFocusedWindow] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (inLastFocusedWindow?.id) {
    return { tab: inLastFocusedWindow, source: 'lastFocusedWindow' };
  }

  // Last resort: the panel only ever reads HQBed, so an HQBed tab in this
  // window is a better answer than refusing to act. It may not be the tab in
  // front, which is why this ranks below both active-tab lookups.
  const [anyHqbedTab] = await chrome.tabs.query({
    url: HQBED_TAB_URL_PATTERN,
    currentWindow: true,
  });
  if (anyHqbedTab?.id) {
    return { tab: anyHqbedTab, source: 'hqbedTabFallback' };
  }

  return { tab: null, source: 'none' };
}

/** Reloads the tab the panel is pointed at — the fix for a stale HQBed page. */
export async function reloadActiveTab() {
  const { tab } = await resolveTabToRead();

  if (!tab?.id) {
    return;
  }

  await chrome.tabs.reload(tab.id);
}
