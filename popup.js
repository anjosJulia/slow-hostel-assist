import { scrapeReservationData, scrapeBreakfastData, scrapeCheckinTomorrowGuests } from './js/scrapers.js';
import { detectRoomType, formatArrivalsSummary, nextDay } from './js/services.js';
import { generateQuote, generatePreReservation, generateBreakfastList, generateCheckinMessage } from './js/generators.js';
import { focusOrOpenHqbedTab, reloadActiveTab } from './js/hqbed-tab.js';
import { PanelView } from './js/ui/panel-view.js';
import {
  TemplateMode,
  QUOTE_ROOM_TYPE_LABELS,
  PRE_RESERVATION_ROOM_TYPE_LABELS,
  BREAKFAST_TAG_LABEL,
  NOTICES,
  BREAKFAST_FAILURE_NOTICES,
  CHECKIN_FAILURE_NOTICES,
  CHECKIN_TOMORROW_NO_GUESTS_MESSAGE,
  COPY_FAILED_MESSAGE,
} from './js/constants.js';

// ── Template mode state ──────────────────────────────────────────────────────

let activeTemplateMode = TemplateMode.QUOTE;

// ── View ─────────────────────────────────────────────────────────────────────

const view = new PanelView({
  onModeChange: mode => {
    activeTemplateMode = mode;
    view.setActiveMode(mode);
  },
  onGenerate: () => generateForActiveMode(),
  onCopy: template => copyToClipboard(template),
  onOpenHqbed: () => focusOrOpenHqbedTab(),
  onReloadTab: () => reloadActiveTab(),
  onOpenConversation: (phone, guest) => openWhatsAppConversation(phone, guest.firstName),
});

view.setActiveMode(activeTemplateMode);

// ── Clipboard ────────────────────────────────────────────────────────────────

// The banner is only shown once the write actually succeeded — a silent
// failure here would send the operator to WhatsApp to paste nothing.
async function copyToClipboard(template) {
  try {
    await navigator.clipboard.writeText(template);
  } catch (error) {
    console.debug('Clipboard write failed', error);
    // Warning, not a notice: the notice screen would hide the very card the
    // operator now has to select by hand.
    view.showWarning(COPY_FAILED_MESSAGE);
    return;
  }

  view.showFeedback();
}

// ── Shared page guards ───────────────────────────────────────────────────────

const HQBEDS_HOST = 'hqbeds.com.br';

// Chrome only exposes `tab.url` while the extension holds permission for that
// tab, and the side panel — unlike the action popup it replaced — is not
// re-granted `activeTab` when it is closed and reopened, or when the operator
// switches tabs. A missing URL therefore means "unknown", never "wrong page";
// conflating the two is what made the panel insist the occupancy map was closed
// while it was plainly on screen.
//
// So the URL may only ever rule a page OUT, never rule it IN. Whether the
// occupancy map is really there is a question only the page can answer, and
// the injected scraper is what asks it.
function isDefinitelyDifferentSite(tabUrl) {
  if (!tabUrl) return false;
  try {
    return !new URL(tabUrl).hostname.endsWith(HQBEDS_HOST);
  } catch {
    return false;
  }
}

const NO_ACCESS_ERROR_PATTERNS = ['cannot access', 'not access', 'no tab with id'];

/**
 * Injects a scraper into every frame of the tab.
 *
 * Returns { success: true, frames } or { success: false, notice }. Injection
 * failing is a distinct problem from the page not holding the expected content,
 * and the two must not collapse into a single message.
 */
async function injectScraper(tabId, scraper) {
  try {
    const frames = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: scraper,
    });
    return { success: true, frames };
  } catch (error) {
    const description = String(error?.message ?? error).toLowerCase();
    const isAccessDenied = NO_ACCESS_ERROR_PATTERNS.some(pattern =>
      description.includes(pattern),
    );
    return {
      success: false,
      notice: isAccessDenied ? NOTICES.EXTENSION_HAS_NO_ACCESS : NOTICES.PAGE_NOT_ACCESSIBLE,
    };
  }
}

/**
 * Collects the results the frames actually produced.
 *
 * `allFrames` yields one entry per frame, and HQBed embeds same-origin iframes
 * alongside the real page. A frame whose script threw reports `result:
 * undefined` rather than `null`, so both empty shapes have to be dropped here —
 * `!== null` alone lets a bystander frame mask the frame holding the map.
 */
function collectFrameResults(frames) {
  return frames.map(frame => frame.result).filter(result => result != null);
}

// Both occupancy scrapers report OCCUPANCY_TABLE_NOT_FOUND when the frame they
// landed in has no occupancy table at all. Every bystander frame answers that
// way, so it means "wrong frame", not "wrong page", and such a frame must never
// speak for the tab: the frame that found the table is the only authoritative
// one. Falling back to results[0] let a bystander report "abre a Ocupação" over
// the precise reason the real frame had to give.
const NOT_THE_OCCUPANCY_FRAME = 'OCCUPANCY_TABLE_NOT_FOUND';

function selectOccupancyResult(frames) {
  const results = collectFrameResults(frames);
  return (
    results.find(result => result.success === true) ??
    results.find(result => result.reason !== NOT_THE_OCCUPANCY_FRAME) ??
    results[0] ??
    null
  );
}

/**
 * One-line trace of what the tab actually looked like, for the console.
 *
 * Several distinct defects produce a byte-identical "wrong page" notice, which
 * makes them indistinguishable in the field. This names the branch that fired.
 */
function describeAttempt(activeTab, frames) {
  const parts = [`url:${activeTab.url ? 'ok' : 'oculta'}`];

  if (frames) {
    const reasons = collectFrameResults(frames).map(result =>
      result.success === true ? 'ok' : (result.reason ?? 'sem-motivo'),
    );
    parts.push(`frames:${frames.length}`);
    parts.push(`resultados:${reasons.length ? reasons.join(',') : 'nenhum'}`);
  }

  return parts.join(' · ');
}

function showNotice(notice, diagnostic) {
  if (diagnostic) console.debug(`[Slow Hostel Assist] ${notice.title} — ${diagnostic}`);
  view.showNotice(notice);
}

// ── Check-in tomorrow flow ───────────────────────────────────────────────────

function buildWhatsAppUrl(phone, firstName) {
  const message = generateCheckinMessage(firstName);
  const digits = phone.replace(/\D/g, '');
  const normalized = digits.startsWith('55') ? digits : `55${digits}`;
  // web.whatsapp.com/send avoids the wa.me redirect, which can mangle emoji
  // during the intermediate URL processing before reaching WhatsApp Web.
  return `https://web.whatsapp.com/send?phone=${normalized}&text=${encodeURIComponent(message)}`;
}

function openWhatsAppConversation(phone, firstName) {
  chrome.tabs.create({ url: buildWhatsAppUrl(phone, firstName), active: true });
}

async function handleCheckinTomorrowGeneration(activeTab) {
  if (isDefinitelyDifferentSite(activeTab.url)) {
    showNotice(NOTICES.CHECKIN_TOMORROW_PAGE_NOT_OPEN, describeAttempt(activeTab));
    return;
  }

  const injection = await injectScraper(activeTab.id, scrapeCheckinTomorrowGuests);

  if (!injection.success) {
    showNotice(injection.notice, describeAttempt(activeTab));
    return;
  }

  const trace = describeAttempt(activeTab, injection.frames);
  const scraped = selectOccupancyResult(injection.frames);

  if (!scraped) {
    showNotice(NOTICES.PAGE_NOT_ACCESSIBLE, trace);
    return;
  }

  if (!scraped.success) {
    showNotice(
      CHECKIN_FAILURE_NOTICES[scraped.reason] ?? NOTICES.CHECKIN_TOMORROW_PAGE_NOT_OPEN,
      trace,
    );
    return;
  }

  if (scraped.bookings.length === 0) {
    view.showIdle();
    view.showFeedback(CHECKIN_TOMORROW_NO_GUESTS_MESSAGE);
    return;
  }

  const tomorrow = nextDay(new Date());
  view.showGuestList(scraped.bookings, formatArrivalsSummary(tomorrow, scraped.bookings.length));
}

// ── Breakfast flow ───────────────────────────────────────────────────────────

async function handleBreakfastGeneration(activeTab) {
  if (isDefinitelyDifferentSite(activeTab.url)) {
    showNotice(NOTICES.OCCUPANCY_PAGE_NOT_OPEN, describeAttempt(activeTab));
    return;
  }

  const injection = await injectScraper(activeTab.id, scrapeBreakfastData);

  if (!injection.success) {
    showNotice(injection.notice, describeAttempt(activeTab));
    return;
  }

  const trace = describeAttempt(activeTab, injection.frames);
  const scraped = selectOccupancyResult(injection.frames);

  if (!scraped) {
    showNotice(NOTICES.PAGE_NOT_ACCESSIBLE, trace);
    return;
  }

  if (!scraped.success) {
    showNotice(BREAKFAST_FAILURE_NOTICES[scraped.reason] ?? NOTICES.OCCUPANCY_PAGE_NOT_OPEN, trace);
    return;
  }

  view.showResult(generateBreakfastList(scraped), BREAKFAST_TAG_LABEL);
}

// ── Quote / Pre-reservation flow ─────────────────────────────────────────────

const UNKNOWN_SCRAPED_VALUE = '???';

async function handleReservationGeneration(tabId, mode) {
  const injection = await injectScraper(tabId, scrapeReservationData);

  if (!injection.success) {
    view.showNotice(injection.notice);
    return;
  }

  const scraped = collectFrameResults(injection.frames).find(
    result => result.checkIn !== UNKNOWN_SCRAPED_VALUE,
  ) ?? null;

  if (!scraped) {
    view.showNotice(NOTICES.BOOKING_MODAL_NOT_OPEN);
    return;
  }

  const roomType = detectRoomType(scraped.roomName);
  const showDiscountToGuest = view.isDiscountVisibleToGuest;

  const template =
    mode === TemplateMode.PRE_RESERVATION
      ? generatePreReservation(scraped, roomType)
      : generateQuote(scraped, roomType, showDiscountToGuest);

  const tagLabel =
    mode === TemplateMode.PRE_RESERVATION
      ? PRE_RESERVATION_ROOM_TYPE_LABELS[roomType]
      : QUOTE_ROOM_TYPE_LABELS[roomType];

  view.showResult(template, tagLabel);
}

// ── Generation entry point ───────────────────────────────────────────────────

async function generateForActiveMode() {
  view.showLoading();

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!activeTab?.id) {
    view.showNotice(NOTICES.PAGE_NOT_ACCESSIBLE);
    return;
  }

  if (activeTemplateMode === TemplateMode.CHECKIN_TOMORROW) {
    await handleCheckinTomorrowGeneration(activeTab);
    return;
  }

  if (activeTemplateMode === TemplateMode.BREAKFAST) {
    await handleBreakfastGeneration(activeTab);
    return;
  }

  await handleReservationGeneration(activeTab.id, activeTemplateMode);
}
