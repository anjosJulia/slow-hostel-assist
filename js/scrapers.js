/**
 * Scrapes reservation data from HQBed's "Nova Reserva" modal.
 *
 * IMPORTANT: This function is serialized and injected into the HQBed page via
 * chrome.scripting.executeScript. It MUST be completely self-contained —
 * no references to variables or imports outside this function body.
 */
export function scrapeReservationData() {
  if (!document.getElementById('reservationForm')) return null;

  const UNKNOWN_VALUE = '???';

  function getInnerText(selector) {
    const element = document.querySelector(selector);
    return element ? element.innerText.trim() : UNKNOWN_VALUE;
  }

  const DATE_CONTAINER_SELECTOR = '[style*="margin:10px 0"][style*="font-size:1.2em"]';
  const DATE_SPAN_SELECTOR = 'span[style*="color:#104E8B"]';
  const NIGHT_COUNT_SPAN_SELECTOR = 'span[style*="margin-left"]';

  const dateContainer = document.querySelector(DATE_CONTAINER_SELECTOR);
  const dateSpans = dateContainer
    ? dateContainer.querySelectorAll(DATE_SPAN_SELECTOR)
    : [];

  const checkIn = dateSpans[0] ? dateSpans[0].innerText.trim() : UNKNOWN_VALUE;
  const checkOut = dateSpans[1] ? dateSpans[1].innerText.trim() : UNKNOWN_VALUE;

  const nightCountSpan = dateContainer
    ? dateContainer.querySelector(NIGHT_COUNT_SPAN_SELECTOR)
    : null;
  const nightCountText = nightCountSpan
    ? nightCountSpan.innerText.trim()
    : 'Noite(s): ?';
  const nightCountMatch = nightCountText.match(/\d+/);
  const nightCount = nightCountMatch ? parseInt(nightCountMatch[0], 10) : 1;

  const firstRoomRow = document.querySelector('#reservationForm table tbody tr');
  const roomName = firstRoomRow
    ? firstRoomRow.querySelector('td').innerText.trim()
    : UNKNOWN_VALUE;

  const adultsSelect = document.querySelector('select[name^="adults"]');
  const guestCount = adultsSelect ? adultsSelect.value : UNKNOWN_VALUE;

  const totalGrossText = getInnerText('#reservation_total');
  const totalDiscountedText = getInnerText('#price_w_discount');

  const effectiveTotalText =
    totalDiscountedText && totalDiscountedText !== UNKNOWN_VALUE && totalDiscountedText !== ''
      ? totalDiscountedText
      : totalGrossText;

  const totalPrice = parseFloat(effectiveTotalText) || 0;
  const originalTotalPrice = parseFloat(totalGrossText) || totalPrice;
  const dailyRate = nightCount > 0
    ? parseFloat((totalPrice / nightCount).toFixed(2))
    : totalPrice;

  const discountSelect = document.querySelector('#discount_percentage');
  let discountLabel = '';
  if (discountSelect) {
    const selectedOption = discountSelect.options[discountSelect.selectedIndex];
    if (selectedOption && selectedOption.value !== '0') {
      discountLabel = selectedOption.text.trim();
    }
  }

  return { checkIn, checkOut, nightCount, roomName, guestCount, totalPrice, originalTotalPrice, dailyRate, discountLabel };
}

/**
 * Scrapes breakfast guest data from HQBed's occupancy table (#occupancy).
 * For private rooms with multiple guests, fetches the full guest list from
 * the HQBed tooltip endpoint so every guest appears by name.
 *
 * Returns { success: true, responsibleStaff, days } or { success: false, reason },
 * where reason mirrors BreakfastScrapeFailure in constants.js — duplicated as
 * string literals because this function cannot import anything (see below).
 * Distinct reasons matter: HQBed only renders a ten-day window of the occupancy
 * map, so paging it away from today is a different problem from being on the
 * wrong page, and the operator needs to be told which one happened.
 *
 * IMPORTANT: This function is serialized and injected into the HQBed page via
 * chrome.scripting.executeScript. It MUST be completely self-contained —
 * no references to variables or imports outside this function body.
 */
export async function scrapeBreakfastData() {
  const FailureReason = {
    OCCUPANCY_TABLE_NOT_FOUND: 'OCCUPANCY_TABLE_NOT_FOUND',
    TODAY_COLUMN_NOT_VISIBLE: 'TODAY_COLUMN_NOT_VISIBLE',
    NO_UPCOMING_DAYS: 'NO_UPCOMING_DAYS',
  };

  const occupancyTable = document.querySelector('table#occupancy');
  if (!occupancyTable) {
    return { success: false, reason: FailureReason.OCCUPANCY_TABLE_NOT_FOUND };
  }

  // ── Constants (defined inline — function must be self-contained) ────────

  const WEEKDAY_NAMES = [
    'Domingo', 'Segunda-Feira', 'Terça-Feira', 'Quarta-Feira',
    'Quinta-Feira', 'Sexta-Feira', 'Sábado',
  ];

  const NO_BREAKFAST_TAG_TITLE = 'sem café da manhã';

  const ROOM_SHORT_LABEL_MAP = [
    { keywords: ['africa'], label: 'África' },
    { keywords: ['norte'], label: 'Am. Norte' },
    { keywords: ['oceania'], label: 'Oceania' },
    { keywords: ['europa'], label: 'Europa' },
    { keywords: ['latina', 'sul'], label: 'Am. Latina' },
    { keywords: ['asia'], label: 'Ásia' },
  ];

  const BREAKFAST_DAYS_AHEAD = 3;
  const DATE_REGEX = /(\d{2})\/(\d{2})\/(\d{4})/;
  const HQBEDS_ORIGIN = 'https://admin.hqbeds.com.br';

  // ── Helpers ─────────────────────────────────────────────────────────────

  function normalizeText(text) {
    return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function resolveRoomShortLabel(roomName) {
    const normalized = normalizeText(roomName);
    for (const { keywords, label } of ROOM_SHORT_LABEL_MAP) {
      if (keywords.some(keyword => normalized.includes(keyword))) return label;
    }
    return roomName.split(/[\s\-(]/)[0].trim();
  }

  function hasNoBreakfastTag(bookingLink) {
    return bookingLink.querySelector(`i.icon-tag[title="${NO_BREAKFAST_TAG_TITLE}"]`) !== null;
  }

  function extractGuestFirstName(bookingLink) {
    for (const node of Array.from(bookingLink.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.replace(/\u00a0/g, ' ').trim();
        if (text && !text.startsWith('(')) {
          return text.replace(/[.\u2025\u2026]+$/, '').trim();
        }
      }
    }
    const fallback = bookingLink.innerText
      .split('\n')
      .map(s => s.trim())
      .find(s => s && !s.startsWith('('));
    return (fallback ?? '').replace(/[.\u2025\u2026]+$/, '').trim();
  }

  function extractGuestQuantity(bookingLink) {
    // Search all text content (text nodes + descendants) for a (N) pattern.
    // Using textContent of the full element handles cases where the quantity
    // is a direct text node, inside a child element, or on the same line as the name.
    const fullText = bookingLink.textContent.replace(/\u00a0/g, ' ');
    const match = fullText.match(/\((\d+)\)/);
    if (match) {
      const quantity = parseInt(match[1], 10);
      if (quantity > 1) return quantity;
    }
    return 1;
  }

  // Fetches all guest first names for a booking via the tooltip endpoint.
  // Returns an array of first names. Falls back to empty array on any failure.
  async function fetchGuestFirstNamesFromTooltip(guestBedId) {
    try {
      const response = await fetch(`${HQBEDS_ORIGIN}/hq/occupancy/tooltip/${guestBedId}`);
      if (!response.ok) throw new Error(`HQBed tooltip error: ${response.status}`);
      const html = await response.text();

      // Guest names appear as: <a href="…/guest_info…">Full Name</a>
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const links = Array.from(doc.querySelectorAll('a[href*="/guest_info"]'));
      return links.flatMap(link => {
        const fullName = link.textContent.trim();
        const firstName = fullName.split(/\s+/)[0].replace(/[.\u2025\u2026]+$/, '');
        return firstName ? [firstName] : [];
      });
    } catch {
      return [];
    }
  }

  // Resolves the final list of first names for a booking.
  // If fetched names are fewer than quantity, the available names are repeated
  // cyclically to fill the remaining slots.
  function resolveGuestFirstNames(quantity, fallbackFirstName, fetchedNames) {
    if (fetchedNames.length === 0) {
      return Array(quantity).fill(fallbackFirstName);
    }
    return Array.from({ length: quantity }, (_, idx) => {
      return fetchedNames[idx] ?? fetchedNames[idx % fetchedNames.length];
    });
  }

  // ── Responsible staff name ───────────────────────────────────────────────

  const userDropdownLink = document.querySelector('.user .dropdown-toggle');
  const responsibleStaff = userDropdownLink
    ? userDropdownLink.innerText.trim()
    : '';

  // ── Parse date columns from thead ───────────────────────────────────────

  const theadRow = occupancyTable.querySelector('thead tr:first-child');
  if (!theadRow) {
    return { success: false, reason: FailureReason.OCCUPANCY_TABLE_NOT_FOUND };
  }

  const dateColumns = [];
  const headerCells = Array.from(theadRow.children);

  for (let i = 2; i < headerCells.length; i++) {
    const match = headerCells[i].innerText.match(DATE_REGEX);
    if (!match) continue;

    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);

    dateColumns.push({
      columnIndex: i,
      dateObject: new Date(year, month - 1, day),
      label: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
    });
  }

  if (!dateColumns.length) {
    return { success: false, reason: FailureReason.OCCUPANCY_TABLE_NOT_FOUND };
  }

  // ── Find today's column ─────────────────────────────────────────────────

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayColumnIndex = dateColumns.findIndex(
    col => col.dateObject.getTime() === today.getTime(),
  );
  // HQBed renders only the ten days starting at the map's current start date,
  // so paging the map forward or back removes today's column from the DOM.
  if (todayColumnIndex === -1) {
    return {
      success: false,
      reason: FailureReason.TODAY_COLUMN_NOT_VISIBLE,
      visibleRange: { from: dateColumns[0].label, to: dateColumns[dateColumns.length - 1].label },
    };
  }

  // ── Pre-scan: resolve room short label per table-color-N class ──────────

  const tableRows = Array.from(occupancyTable.querySelectorAll('tbody tr'));
  const roomNameAccumulator = {};

  for (const row of tableRows) {
    const roomHeaderCell = row.querySelector('th.rooms-name-column');
    if (!roomHeaderCell) continue;

    const colorClass = Array.from(roomHeaderCell.classList).find(c =>
      /^table-color-\d+$/.test(c),
    );
    if (!colorClass) continue;

    const cellText = roomHeaderCell.innerText
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (cellText) {
      roomNameAccumulator[colorClass] = (roomNameAccumulator[colorClass] ?? '') + ' ' + cellText;
    }
  }

  const colorClassToLabel = {};
  for (const colorClass of Object.keys(roomNameAccumulator)) {
    colorClassToLabel[colorClass] = resolveRoomShortLabel(roomNameAccumulator[colorClass].trim());
  }

  // ── Build breakfast list for each upcoming day ───────────────────────────

  const days = [];
  const maxDayIndex = Math.min(todayColumnIndex + BREAKFAST_DAYS_AHEAD, dateColumns.length - 1);

  for (let dayOffset = todayColumnIndex; dayOffset < maxDayIndex; dayOffset++) {
    const targetDay = dateColumns[dayOffset + 1];
    const sourceColumn = dateColumns[dayOffset];

    // ── First pass: collect raw booking data for this day ────────────────

    const rawBookings = [];

    for (const row of tableRows) {
      const anyHeaderCell = row.querySelector('th');
      const colorClass = anyHeaderCell
        ? Array.from(anyHeaderCell.classList).find(c => /^table-color-\d+$/.test(c))
        : undefined;

      const roomLabel = (colorClass && colorClassToLabel[colorClass]) ?? '?';

      const sourceCell = row.children[sourceColumn.columnIndex];
      if (!sourceCell) continue;

      const activeReservationDivs = sourceCell.querySelectorAll(
        '.room-occupancy-overview.bed_button_active',
      );

      for (const div of Array.from(activeReservationDivs)) {
        if (div.classList.contains('hidden')) continue;
        if (div.classList.contains('bed_button_checkedout')) continue;

        const bookingLink = div.querySelector('a.bookingInfo');
        if (!bookingLink) continue;

        const fullName = extractGuestFirstName(bookingLink);
        if (!fullName) continue;

        const firstNameOnly = fullName.split(/\s+/)[0].replace(/[.\u2025\u2026]+$/, '');
        if (!firstNameOnly) continue;

        const quantity = extractGuestQuantity(bookingLink);
        const hasNoBreakfast = hasNoBreakfastTag(bookingLink);

        const dataHref = bookingLink.getAttribute('data-href') ?? '';
        const guestBedIdMatch = dataHref.match(/\/(\d+)$/);
        // Only fetch additional names when there are multiple guests in the booking
        const guestBedId = (guestBedIdMatch && quantity > 1) ? guestBedIdMatch[1] : null;

        rawBookings.push({ firstNameOnly, roomLabel, quantity, guestBedId, hasNoBreakfast });
      }
    }

    // ── Second pass: fetch all guest names for multi-guest bookings ───────

    const multiGuestBookings = rawBookings.filter(b => b.guestBedId !== null);
    const fetchedNamesMap = new Map();

    // Process in batches to avoid hammering HQBed with simultaneous requests
    const FETCH_BATCH_SIZE = 5;
    for (let i = 0; i < multiGuestBookings.length; i += FETCH_BATCH_SIZE) {
      const batch = multiGuestBookings.slice(i, i + FETCH_BATCH_SIZE);
      await Promise.all(batch.map(async booking => {
        const names = await fetchGuestFirstNamesFromTooltip(booking.guestBedId);
        fetchedNamesMap.set(booking.guestBedId, names);
      }));
    }

    // ── Third pass: build guest entries with resolved names ───────────────

    const allGuestEntries = [];
    const breakfastGuestEntries = [];

    for (const booking of rawBookings) {
      const fetchedNames = booking.guestBedId !== null
        ? (fetchedNamesMap.get(booking.guestBedId) ?? [])
        : [];

      const resolvedNames = resolveGuestFirstNames(
        booking.quantity,
        booking.firstNameOnly,
        fetchedNames,
      );

      for (const name of resolvedNames) {
        const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
        const entry = `${capitalizedName} (${booking.roomLabel})`;
        allGuestEntries.push(entry);
        if (!booking.hasNoBreakfast) {
          breakfastGuestEntries.push(entry);
        }
      }
    }

    if (!allGuestEntries.length) continue;

    const weekdayName = WEEKDAY_NAMES[targetDay.dateObject.getDay()];

    days.push({
      header: `📈 ${weekdayName} - ${targetDay.label}`,
      totalGuests: String(allGuestEntries.length).padStart(2, '0'),
      breakfastGuests: String(breakfastGuestEntries.length).padStart(2, '0'),
      guestNames: breakfastGuestEntries,
    });
  }

  if (!days.length) {
    return { success: false, reason: FailureReason.NO_UPCOMING_DAYS };
  }

  return { success: true, responsibleStaff, days };
}

/**
 * Scrapes bookings arriving tomorrow that have not completed check-in yet.
 *
 * A booking is a candidate when its cell in tomorrow's column is flagged as an
 * arrival by HQBed, or when the booking simply is not present in today's column.
 * Each candidate is then confirmed against its own booking page, which is the
 * authoritative source for the arrival date, the untruncated guest name and the
 * phone number.
 *
 * Returns { success: true, bookings } or { success: false, reason }, where
 * reason mirrors CheckinScrapeFailure in constants.js — duplicated as string
 * literals because this function cannot import anything (see below).
 *
 * IMPORTANT: This function is serialized and injected into the HQBed page via
 * chrome.scripting.executeScript. It MUST be completely self-contained —
 * no references to variables or imports outside this function body.
 */
export async function scrapeCheckinTomorrowGuests() {
  // ── Constants (defined inline — function must be self-contained) ────────

  const DATE_REGEX = /(\d{2})\/(\d{2})\/(\d{4})/;
  const HQBEDS_ORIGIN = 'https://admin.hqbeds.com.br';

  const RESERVATION_CELL_SELECTOR = '.room-occupancy-overview';

  // HQBed flags the arrival cell with one of two classes: `bed_button_checkin`
  // when the stay continues past that day, and `bed_button_checkin_checkout`
  // for single-night stays. They are distinct class tokens, so matching only
  // the first one silently misses every one-night arrival.
  const ARRIVAL_CELL_CLASSES = ['bed_button_checkin', 'bed_button_checkin_checkout'];

  // Mirrors HQBed's own cellStatus(): blocked beds and bookings already checked
  // in or out are never pending arrivals.
  const NON_ARRIVAL_CELL_CLASSES = [
    'hidden',
    'reserveBlock',
    'bed_button_checkedin',
    'bed_button_checkedout',
  ];

  // The booking page carries a fixed floating button pointing at HQBed's own
  // support WhatsApp. Matching it would hand out the support number as if it
  // were the guest's.
  const SUPPORT_WHATSAPP_LINK_CLASS = 'wa-fab-button';

  const ARRIVAL_DATE_REGEX = /Chegada:\s*(\d{2})\/(\d{2})\/(\d{4})/;
  const PHONE_LABEL_REGEX = /^Telefone\s*(.+)$/;
  const TRUNCATED_NAME_SUFFIX_REGEX = /[.\u2025\u2026]+$/;
  const MINIMUM_PHONE_DIGIT_COUNT = 10;
  const FETCH_BATCH_SIZE = 5;

  const FailureReason = {
    OCCUPANCY_TABLE_NOT_FOUND: 'OCCUPANCY_TABLE_NOT_FOUND',
    TODAY_COLUMN_NOT_VISIBLE: 'TODAY_COLUMN_NOT_VISIBLE',
    TOMORROW_COLUMN_NOT_VISIBLE: 'TOMORROW_COLUMN_NOT_VISIBLE',
  };

  // ── Occupancy map helpers ───────────────────────────────────────────────

  function extractGuestFirstName(bookingLink) {
    for (const node of Array.from(bookingLink.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.replace(/\u00a0/g, ' ').trim();
        if (text && !text.startsWith('(')) {
          return text.replace(TRUNCATED_NAME_SUFFIX_REGEX, '').trim();
        }
      }
    }
    const fallback = bookingLink.innerText
      .split('\n')
      .map(s => s.trim())
      .find(s => s && !s.startsWith('('));
    return (fallback ?? '').replace(TRUNCATED_NAME_SUFFIX_REGEX, '').trim();
  }

  function extractGuestQuantity(bookingLink) {
    const fullText = bookingLink.textContent.replace(/\u00a0/g, ' ');
    const match = fullText.match(/\((\d+)\)/);
    if (match) {
      const quantity = parseInt(match[1], 10);
      if (quantity > 1) return quantity;
    }
    return 1;
  }

  function toFirstName(fullName) {
    return fullName.split(/\s+/)[0].replace(TRUNCATED_NAME_SUFFIX_REGEX, '').trim();
  }

  function collectReservationDivs(tableRows, columnIndex) {
    const reservationDivs = [];
    for (const row of tableRows) {
      const cell = row.children[columnIndex];
      if (!cell) continue;
      reservationDivs.push(...Array.from(cell.querySelectorAll(RESERVATION_CELL_SELECTOR)));
    }
    return reservationDivs;
  }

  function collectBookingIds(reservationDivs) {
    const bookingIds = new Set();
    for (const div of reservationDivs) {
      const bookingId = div.getAttribute('data-booking-id');
      if (bookingId) bookingIds.add(bookingId);
    }
    return bookingIds;
  }

  function isPendingArrival(reservationDiv, bookingId, todayBookingIds) {
    if (NON_ARRIVAL_CELL_CLASSES.some(name => reservationDiv.classList.contains(name))) return false;
    if (ARRIVAL_CELL_CLASSES.some(name => reservationDiv.classList.contains(name))) return true;
    // Safety net: even if HQBed renames the arrival classes, a booking absent
    // from today's column can only have started tomorrow.
    return !todayBookingIds.has(bookingId);
  }

  // ── Booking page helpers ────────────────────────────────────────────────

  function getOwnText(element) {
    return Array.from(element.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent.replace(/\u00a0/g, ' '))
      .join(' ')
      .trim();
  }

  function findPhoneLabelElement(bookingDocument) {
    const elements = Array.from(bookingDocument.querySelectorAll('div, span, p, td, li'));
    return elements.find(element => PHONE_LABEL_REGEX.test(getOwnText(element))) ?? null;
  }

  function toPhoneDigits(rawPhone) {
    const digits = rawPhone.replace(/\D/g, '');
    return digits.length >= MINIMUM_PHONE_DIGIT_COUNT ? digits : null;
  }

  function extractPhoneFromLabel(phoneLabelElement) {
    if (!phoneLabelElement) return null;
    const match = getOwnText(phoneLabelElement).match(PHONE_LABEL_REGEX);
    return match ? toPhoneDigits(match[1]) : null;
  }

  function extractPhoneFromWhatsAppLink(bookingDocument) {
    const links = Array.from(bookingDocument.querySelectorAll('a[href*="whatsapp.com/send"]'));
    for (const link of links) {
      if (link.classList.contains(SUPPORT_WHATSAPP_LINK_CLASS)) continue;
      const match = (link.getAttribute('href') ?? '').match(/[?&]phone=([^&]*)/);
      if (!match) continue;
      const digits = toPhoneDigits(decodeURIComponent(match[1]));
      if (digits) return digits;
    }
    return null;
  }

  function extractGuestFullName(phoneLabelElement) {
    const contactBlock = phoneLabelElement ? phoneLabelElement.parentElement : null;
    if (!contactBlock) return '';
    const nameElement = Array.from(contactBlock.querySelectorAll('strong')).find(
      element => !element.textContent.includes('@'),
    );
    return nameElement ? nameElement.textContent.trim() : '';
  }

  // Returns the authoritative booking details, or null when the page cannot be read.
  async function fetchBookingDetails(bookingId) {
    try {
      const response = await fetch(`${HQBEDS_ORIGIN}/hq/booking/${bookingId}`);
      if (!response.ok) throw new Error(`HQBed booking error: ${response.status}`);
      const bookingDocument = new DOMParser().parseFromString(await response.text(), 'text/html');

      const arrivalMatch = bookingDocument.body.textContent.match(ARRIVAL_DATE_REGEX);
      const phoneLabelElement = findPhoneLabelElement(bookingDocument);

      return {
        arrivalDateLabel: arrivalMatch
          ? `${arrivalMatch[1]}/${arrivalMatch[2]}/${arrivalMatch[3]}`
          : null,
        fullName: extractGuestFullName(phoneLabelElement),
        phone:
          extractPhoneFromLabel(phoneLabelElement) ?? extractPhoneFromWhatsAppLink(bookingDocument),
      };
    } catch {
      return null;
    }
  }

  // ── Parse date columns from thead ───────────────────────────────────────

  const occupancyTable = document.querySelector('table#occupancy');
  if (!occupancyTable) return { success: false, reason: FailureReason.OCCUPANCY_TABLE_NOT_FOUND };

  const theadRow = occupancyTable.querySelector('thead tr:first-child');
  if (!theadRow) return { success: false, reason: FailureReason.OCCUPANCY_TABLE_NOT_FOUND };

  const dateColumns = [];
  const headerCells = Array.from(theadRow.children);

  for (let i = 2; i < headerCells.length; i++) {
    const match = headerCells[i].innerText.match(DATE_REGEX);
    if (!match) continue;

    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);

    dateColumns.push({
      columnIndex: i,
      dateObject: new Date(year, month - 1, day),
      label: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
    });
  }

  if (!dateColumns.length) {
    return { success: false, reason: FailureReason.OCCUPANCY_TABLE_NOT_FOUND };
  }

  // ── Find today's column index, then tomorrow's ───────────────────────────

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayColumnIndex = dateColumns.findIndex(
    col => col.dateObject.getTime() === today.getTime(),
  );
  if (todayColumnIndex === -1) {
    return { success: false, reason: FailureReason.TODAY_COLUMN_NOT_VISIBLE };
  }
  if (todayColumnIndex + 1 >= dateColumns.length) {
    return { success: false, reason: FailureReason.TOMORROW_COLUMN_NOT_VISIBLE };
  }

  const tomorrowColumn = dateColumns[todayColumnIndex + 1];

  // ── Collect candidate bookings from tomorrow's column ────────────────────

  const tableRows = Array.from(occupancyTable.querySelectorAll('tbody tr'));
  const todayBookingIds = collectBookingIds(
    collectReservationDivs(tableRows, dateColumns[todayColumnIndex].columnIndex),
  );

  // A booking can span several beds, so it shows up in several rows.
  const candidatesByBookingId = new Map();

  for (const reservationDiv of collectReservationDivs(tableRows, tomorrowColumn.columnIndex)) {
    const bookingId = reservationDiv.getAttribute('data-booking-id');
    if (!bookingId) continue;
    if (!isPendingArrival(reservationDiv, bookingId, todayBookingIds)) continue;

    const bookingLink = reservationDiv.querySelector('a.bookingInfo');
    if (!bookingLink) continue;

    const firstName = toFirstName(extractGuestFirstName(bookingLink));
    if (!firstName) continue;

    const guestCount = extractGuestQuantity(bookingLink);
    const existingCandidate = candidatesByBookingId.get(bookingId);

    if (existingCandidate) {
      existingCandidate.guestCount += guestCount;
    } else {
      candidatesByBookingId.set(bookingId, { bookingId, firstName, guestCount });
    }
  }

  const candidates = Array.from(candidatesByBookingId.values());
  if (!candidates.length) return { success: true, bookings: [] };

  // ── Confirm each candidate against its own booking page ──────────────────

  const bookings = [];

  for (let i = 0; i < candidates.length; i += FETCH_BATCH_SIZE) {
    const batch = candidates.slice(i, i + FETCH_BATCH_SIZE);
    const detailedBatch = await Promise.all(
      batch.map(async candidate => ({
        candidate,
        details: await fetchBookingDetails(candidate.bookingId),
      })),
    );

    for (const { candidate, details } of detailedBatch) {
      // Unreadable booking page: keep the candidate, the map already flagged it.
      if (!details) {
        bookings.push({
          firstName: candidate.firstName,
          guestCount: candidate.guestCount,
          phone: null,
        });
        continue;
      }

      if (details.arrivalDateLabel && details.arrivalDateLabel !== tomorrowColumn.label) continue;

      const fullNameFirstName = details.fullName ? toFirstName(details.fullName) : '';

      bookings.push({
        firstName: fullNameFirstName || candidate.firstName,
        guestCount: candidate.guestCount,
        phone: details.phone,
      });
    }
  }

  bookings.sort((a, b) => a.firstName.localeCompare(b.firstName, 'pt-BR'));

  return { success: true, bookings };
}
