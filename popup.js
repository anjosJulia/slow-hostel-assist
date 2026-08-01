import { scrapeReservationData, scrapeBreakfastData, scrapeCheckinTomorrowGuests } from './js/scrapers.js';
import { detectRoomType } from './js/services.js';
import { generateQuote, generatePreReservation, generateBreakfastList, generateCheckinMessage } from './js/generators.js';
import {
  TemplateMode,
  QUOTE_ROOM_TYPE_LABELS,
  PRE_RESERVATION_ROOM_TYPE_LABELS,
  BREAKFAST_TAG_LABEL,
  ERROR_MESSAGES,
  BREAKFAST_FAILURE_MESSAGES,
  BreakfastScrapeFailure,
  CHECKIN_FAILURE_MESSAGES,
  SUCCESS_MESSAGE,
  LOADING_MESSAGE,
} from './js/constants.js';

// ── DOM element references ───────────────────────────────────────────────────

const buttonQuote = document.getElementById('btn-select-quote');
const buttonPreReservation = document.getElementById('btn-select-pre-reservation');
const buttonBreakfast = document.getElementById('btn-select-breakfast');
const buttonCheckinTomorrow = document.getElementById('btn-select-checkin-tomorrow');
const buttonGenerate = document.getElementById('btn-generate');
const buttonCopy = document.getElementById('btn-copy');
const resultBox = document.getElementById('result-box');
const resultText = document.getElementById('result-content');
const resultTypeTag = document.getElementById('tag-type');
const statusMessage = document.getElementById('status');
const optionShowDiscount = document.getElementById('option-show-discount');
const checkboxShowDiscount = document.getElementById('checkbox-show-discount');
const checkinSection = document.getElementById('checkin-section');
const guestList = document.getElementById('guest-list');

// ── Template mode state ──────────────────────────────────────────────────────

let activeTemplateMode = TemplateMode.QUOTE;

// ── Template selector buttons ────────────────────────────────────────────────

const SELECTOR_BUTTONS = {
  [TemplateMode.QUOTE]: buttonQuote,
  [TemplateMode.PRE_RESERVATION]: buttonPreReservation,
  [TemplateMode.BREAKFAST]: buttonBreakfast,
  [TemplateMode.CHECKIN_TOMORROW]: buttonCheckinTomorrow,
};

function activateTemplateMode(mode) {
  activeTemplateMode = mode;

  for (const [buttonMode, button] of Object.entries(SELECTOR_BUTTONS)) {
    button.classList.toggle('active', buttonMode === mode);
  }

  const isCheckinMode = mode === TemplateMode.CHECKIN_TOMORROW;

  optionShowDiscount.style.display = mode === TemplateMode.QUOTE ? 'flex' : 'none';
  resultBox.style.display = 'none';
  buttonCopy.style.display = 'none';
  checkinSection.style.display = isCheckinMode ? 'flex' : 'none';
  guestList.innerHTML = '';
  statusMessage.textContent = '';
  statusMessage.className = 'status';
}

buttonQuote.addEventListener('click', () => activateTemplateMode(TemplateMode.QUOTE));
buttonPreReservation.addEventListener('click', () => activateTemplateMode(TemplateMode.PRE_RESERVATION));
buttonBreakfast.addEventListener('click', () => activateTemplateMode(TemplateMode.BREAKFAST));
buttonCheckinTomorrow.addEventListener('click', () => activateTemplateMode(TemplateMode.CHECKIN_TOMORROW));

// ── Status helpers ───────────────────────────────────────────────────────────

// The diagnostic goes to the console, not the panel: three separate defects
// once produced a byte-identical "wrong page" message, so the trace has to stay
// reachable — just not in the operator's face.
function showError(message, diagnostic = '') {
  if (diagnostic) console.debug(`[Slow Hostel Assist] ${message} — ${diagnostic}`);

  statusMessage.className = 'status error';
  statusMessage.textContent = message;
  resultBox.style.display = 'none';
  buttonCopy.style.display = 'none';
}

function showResult(template, tagLabel) {
  resultText.textContent = template;
  resultTypeTag.textContent = tagLabel;
  resultBox.style.display = 'block';
  buttonCopy.style.display = 'flex';
  statusMessage.textContent = '';

  buttonCopy.onclick = () => {
    navigator.clipboard.writeText(template).then(() => {
      statusMessage.className = 'status ok';
      statusMessage.textContent = SUCCESS_MESSAGE;
    });
  };
}

// ── Shared page guards ───────────────────────────────────────────────────────

const HQBEDS_HOST = 'hqbeds.com.br';

// Chrome only exposes `tab.url` when the extension holds permission for that
// tab, and in a side panel that permission is not re-granted on every tab
// switch the way it was for the old action popup. A missing URL therefore means
// "unknown", never "wrong page" — treating the two as the same is what made the
// extension claim the occupancy page was closed while it was plainly open.
// The URL is only ever used to rule a page OUT, never to rule it IN: whether
// the occupancy map is really there is a question only the page can answer.
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
 * Returns { success: true, frames } or { success: false, message }. Injection
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
      message: isAccessDenied
        ? ERROR_MESSAGES.EXTENSION_HAS_NO_ACCESS
        : ERROR_MESSAGES.PAGE_NOT_ACCESSIBLE,
    };
  }
}

/**
 * Collects the results the frames actually produced.
 *
 * The HQBed page embeds a same-origin notifications iframe, so `allFrames`
 * always yields bystander frames alongside the real one. Frames where the
 * script threw report `result: undefined` rather than `null`, and frame order
 * is not guaranteed — so both empty shapes must be dropped here, or a bystander
 * frame ends up masking the frame that actually holds the occupancy map.
 */
function collectFrameResults(frames) {
  return frames.map(frame => frame.result).filter(result => result != null);
}

// Both occupancy scrapers report OCCUPANCY_TABLE_NOT_FOUND when the frame they
// landed in has no occupancy table at all. Every bystander frame answers that
// way, so it means "wrong frame", not "wrong page", and such a frame must never
// be allowed to speak for the tab: the frame that actually found the table is
// the only authoritative one. Picking results[0] instead let a bystander report
// "abra a página de Ocupação" while the real frame had a precise reason to give.
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
 * Builds a one-line trace of what the tab actually looked like.
 *
 * Every "wrong page" message so far has been the extension guessing, and each
 * guess looked identical to the operator. The trace names the branch that fired
 * so a failure can be read instead of re-derived.
 */
function describeAttempt(activeTab, frames) {
  const parts = [`url:${activeTab.url ? 'ok' : 'oculta'}`];

  if (frames) {
    parts.push(`frames:${frames.length}`);
    const reasons = collectFrameResults(frames).map(result =>
      result.success === true ? 'ok' : (result.reason ?? 'sem-motivo'),
    );
    parts.push(`resultados:${reasons.length ? reasons.join(',') : 'nenhum'}`);
  }

  return parts.join(' · ');
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

function renderGuestCard(guest) {
  const card = document.createElement('div');
  card.className = 'guest-card';

  const name = document.createElement('div');
  name.className = 'guest-card-name';
  name.textContent =
    guest.guestCount > 1
      ? `${guest.firstName} · ${guest.guestCount} hóspedes`
      : guest.firstName;

  const row = document.createElement('div');
  row.className = 'guest-card-row';

  const phoneInput = document.createElement('input');
  phoneInput.type = 'tel';
  phoneInput.className = 'guest-phone-input';
  phoneInput.placeholder = 'Telefone (ex: 5511999999999)';
  phoneInput.value = guest.phone ?? '';

  const whatsappButton = document.createElement('button');
  whatsappButton.className = 'btn-whatsapp';
  whatsappButton.textContent = '📲 Abrir';

  whatsappButton.addEventListener('click', () => {
    const phone = phoneInput.value.trim();
    if (!phone) {
      phoneInput.focus();
      return;
    }
    chrome.tabs.create({ url: buildWhatsAppUrl(phone, guest.firstName), active: true });
  });

  row.appendChild(phoneInput);
  row.appendChild(whatsappButton);
  card.appendChild(name);
  card.appendChild(row);

  return card;
}

async function handleCheckinTomorrowGeneration(activeTab) {
  if (isDefinitelyDifferentSite(activeTab.url)) {
    showError(ERROR_MESSAGES.CHECKIN_TOMORROW_PAGE_NOT_OPEN, describeAttempt(activeTab));
    return;
  }

  const injection = await injectScraper(activeTab.id, scrapeCheckinTomorrowGuests);

  if (!injection.success) {
    showError(injection.message, describeAttempt(activeTab));
    return;
  }

  const trace = describeAttempt(activeTab, injection.frames);
  const scraped = selectOccupancyResult(injection.frames);

  if (!scraped) {
    showError(ERROR_MESSAGES.PAGE_NOT_ACCESSIBLE, trace);
    return;
  }

  if (!scraped.success) {
    showError(
      CHECKIN_FAILURE_MESSAGES[scraped.reason] ?? ERROR_MESSAGES.CHECKIN_TOMORROW_PAGE_NOT_OPEN,
      trace,
    );
    return;
  }

  if (scraped.bookings.length === 0) {
    statusMessage.className = 'status ok';
    statusMessage.textContent = ERROR_MESSAGES.CHECKIN_TOMORROW_NO_GUESTS;
    return;
  }

  statusMessage.textContent = '';
  guestList.innerHTML = '';

  for (const guest of scraped.bookings) {
    guestList.appendChild(renderGuestCard(guest));
  }
}

// ── Breakfast flow ───────────────────────────────────────────────────────────

// Adds the dates HQBed is actually showing, so "volte para hoje" is actionable
// instead of leaving the operator guessing where the map drifted to.
function describeBreakfastFailure(scraped) {
  const message =
    BREAKFAST_FAILURE_MESSAGES[scraped.reason] ?? ERROR_MESSAGES.OCCUPANCY_PAGE_NOT_OPEN;

  if (scraped.reason === BreakfastScrapeFailure.TODAY_COLUMN_NOT_VISIBLE && scraped.visibleRange) {
    return `${message} (mostrando ${scraped.visibleRange.from} a ${scraped.visibleRange.to})`;
  }

  return message;
}

async function handleBreakfastGeneration(activeTab) {
  if (isDefinitelyDifferentSite(activeTab.url)) {
    showError(ERROR_MESSAGES.OCCUPANCY_PAGE_NOT_OPEN, describeAttempt(activeTab));
    return;
  }

  const injection = await injectScraper(activeTab.id, scrapeBreakfastData);

  if (!injection.success) {
    showError(injection.message, describeAttempt(activeTab));
    return;
  }

  const trace = describeAttempt(activeTab, injection.frames);
  const scraped = selectOccupancyResult(injection.frames);

  if (!scraped) {
    showError(ERROR_MESSAGES.PAGE_NOT_ACCESSIBLE, trace);
    return;
  }

  if (!scraped.success) {
    showError(describeBreakfastFailure(scraped), trace);
    return;
  }

  const template = generateBreakfastList(scraped);
  showResult(template, BREAKFAST_TAG_LABEL);
}

// ── Quote / Pre-reservation flow ─────────────────────────────────────────────

const UNKNOWN_SCRAPED_VALUE = '???';

async function handleReservationGeneration(tabId, mode) {
  const injection = await injectScraper(tabId, scrapeReservationData);

  if (!injection.success) {
    showError(injection.message);
    return;
  }

  const scraped = collectFrameResults(injection.frames).find(
    result => result.checkIn !== UNKNOWN_SCRAPED_VALUE,
  ) ?? null;

  if (!scraped) {
    showError(ERROR_MESSAGES.BOOKING_MODAL_NOT_OPEN);
    return;
  }

  const roomType = detectRoomType(scraped.roomName);
  const showDiscountToGuest = checkboxShowDiscount.checked;

  const template =
    mode === TemplateMode.PRE_RESERVATION
      ? generatePreReservation(scraped, roomType)
      : generateQuote(scraped, roomType, showDiscountToGuest);

  const tagLabel =
    mode === TemplateMode.PRE_RESERVATION
      ? PRE_RESERVATION_ROOM_TYPE_LABELS[roomType]
      : QUOTE_ROOM_TYPE_LABELS[roomType];

  showResult(template, tagLabel);
}

// ── Generate button ──────────────────────────────────────────────────────────

buttonGenerate.addEventListener('click', async () => {
  statusMessage.className = 'status';
  statusMessage.textContent = LOADING_MESSAGE;
  guestList.innerHTML = '';

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab.id) {
    showError(ERROR_MESSAGES.PAGE_NOT_ACCESSIBLE);
    return;
  }

  if (activeTemplateMode === TemplateMode.CHECKIN_TOMORROW) {
    await handleCheckinTomorrowGeneration(activeTab);
  } else if (activeTemplateMode === TemplateMode.BREAKFAST) {
    await handleBreakfastGeneration(activeTab);
  } else {
    await handleReservationGeneration(activeTab.id, activeTemplateMode);
  }
});
