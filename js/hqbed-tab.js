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

/** Reloads the tab the panel is pointed at — the fix for a stale HQBed page. */
export async function reloadActiveTab() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!activeTab?.id) {
    return;
  }

  await chrome.tabs.reload(activeTab.id);
}
