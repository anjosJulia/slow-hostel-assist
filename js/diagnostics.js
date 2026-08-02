/**
 * Persistent record of the last generation attempts.
 *
 * The panel has a failure mode that disappears while DevTools is open, which
 * makes `console.debug` useless for diagnosing it: by the time the console
 * exists, the bug is gone. Writing each attempt to chrome.storage.local instead
 * lets a failure be inspected *after* the fact — fail with the console closed,
 * open it afterwards, read what actually happened.
 */

const STORAGE_KEY = 'diagnosticAttempts';

// A ring buffer, not a log: the operator never clears this, and an unbounded
// array in extension storage would grow for the life of the install.
const MAX_RECORDED_ATTEMPTS = 30;

/** Never let diagnostics break the flow they are only meant to observe. */
export async function recordAttempt(attempt) {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const attempts = stored[STORAGE_KEY] ?? [];

    attempts.push({ at: new Date().toISOString(), ...attempt });

    await chrome.storage.local.set({
      [STORAGE_KEY]: attempts.slice(-MAX_RECORDED_ATTEMPTS),
    });
  } catch (error) {
    console.debug('Diagnostics write failed', error);
  }
}

export async function readAttempts() {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return stored[STORAGE_KEY] ?? [];
  } catch (error) {
    console.debug('Diagnostics read failed', error);
    return [];
  }
}

export async function clearAttempts() {
  await chrome.storage.local.remove(STORAGE_KEY);
}
