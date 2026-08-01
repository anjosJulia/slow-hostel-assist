import { scrapeReservationData, scrapeBreakfastData, scrapeCheckinTomorrowGuests } from './js/scrapers.js';
import { detectRoomType } from './js/services.js';
import { generateQuote, generatePreReservation, generateBreakfastList, generateCheckinMessage } from './js/generators.js';
import {
  TemplateMode,
  QUOTE_ROOM_TYPE_LABELS,
  PRE_RESERVATION_ROOM_TYPE_LABELS,
  BREAKFAST_TAG_LABEL,
  ERROR_MESSAGES,
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

function showError(message) {
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

function isOccupancyPage(tabUrl) {
  return tabUrl.includes('hqbeds.com.br') && tabUrl.includes('/hq/occupancy');
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
  if (!isOccupancyPage(activeTab.url ?? '')) {
    showError(ERROR_MESSAGES.CHECKIN_TOMORROW_PAGE_NOT_OPEN);
    return;
  }

  let frames;

  try {
    frames = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id, allFrames: true },
      func: scrapeCheckinTomorrowGuests,
    });
  } catch {
    showError(ERROR_MESSAGES.PAGE_NOT_ACCESSIBLE);
    return;
  }

  const results = frames.map(frame => frame.result).filter(result => result != null);
  // The occupancy table lives in a single frame; the others report a failure.
  const scraped = results.find(result => result.success) ?? results[0] ?? null;

  if (!scraped) {
    showError(ERROR_MESSAGES.PAGE_NOT_ACCESSIBLE);
    return;
  }

  if (!scraped.success) {
    showError(
      CHECKIN_FAILURE_MESSAGES[scraped.reason] ?? ERROR_MESSAGES.CHECKIN_TOMORROW_PAGE_NOT_OPEN,
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

async function handleBreakfastGeneration(activeTab) {
  if (!isOccupancyPage(activeTab.url ?? '')) {
    showError(ERROR_MESSAGES.OCCUPANCY_PAGE_NOT_OPEN);
    return;
  }

  let frames;

  try {
    frames = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id, allFrames: true },
      func: scrapeBreakfastData,
    });
  } catch {
    showError(ERROR_MESSAGES.PAGE_NOT_ACCESSIBLE);
    return;
  }

  const scraped = frames.find(frame => frame.result !== null)?.result ?? null;

  if (!scraped) {
    showError(ERROR_MESSAGES.OCCUPANCY_PAGE_NOT_OPEN);
    return;
  }

  const template = generateBreakfastList(scraped);
  showResult(template, BREAKFAST_TAG_LABEL);
}

// ── Quote / Pre-reservation flow ─────────────────────────────────────────────

async function handleReservationGeneration(tabId, mode) {
  let frames;

  try {
    frames = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: scrapeReservationData,
    });
  } catch {
    showError(ERROR_MESSAGES.PAGE_NOT_ACCESSIBLE);
    return;
  }

  const scraped = frames.find(
    frame => frame.result !== null && frame.result.checkIn !== '???',
  )?.result ?? null;

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
