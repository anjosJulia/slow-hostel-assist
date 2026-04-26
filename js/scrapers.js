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
 * IMPORTANT: This function is serialized and injected into the HQBed page via
 * chrome.scripting.executeScript. It MUST be completely self-contained —
 * no references to variables or imports outside this function body.
 */
export async function scrapeBreakfastData() {
  const occupancyTable = document.querySelector('table#occupancy');
  if (!occupancyTable) return null;

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
  if (!theadRow) return null;

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

  if (!dateColumns.length) return null;

  // ── Find today's column ─────────────────────────────────────────────────

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayColumnIndex = dateColumns.findIndex(
    col => col.dateObject.getTime() === today.getTime(),
  );
  if (todayColumnIndex === -1) return null;

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

  if (!days.length) return null;

  return { responsibleStaff, days };
}

/**
 * Scrapes guests checking in tomorrow who have not yet completed check-in.
 * For each guest, fetches their phone number from the HQBed booking page.
 *
 * IMPORTANT: This function is serialized and injected into the HQBed page via
 * chrome.scripting.executeScript. It MUST be completely self-contained —
 * no references to variables or imports outside this function body.
 */
export async function scrapeCheckinTomorrowGuests() {
  const occupancyTable = document.querySelector('table#occupancy');
  if (!occupancyTable) return null;

  // ── Constants (defined inline — function must be self-contained) ────────

  const DATE_REGEX = /(\d{2})\/(\d{2})\/(\d{4})/;
  const HQBEDS_ORIGIN = 'https://admin.hqbeds.com.br';

  // ── Helpers ─────────────────────────────────────────────────────────────

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

  async function fetchPhoneForGuest(guestBedId) {
    try {
      const tooltipResponse = await fetch(`${HQBEDS_ORIGIN}/hq/occupancy/tooltip/${guestBedId}`);
      if (!tooltipResponse.ok) throw new Error(`HQBed tooltip error: ${tooltipResponse.status}`);
      const tooltipHtml = await tooltipResponse.text();

      const bookingIdMatch = tooltipHtml.match(/\/hq\/booking\/(\d+)/);
      if (!bookingIdMatch) return null;

      const bookingId = bookingIdMatch[1];
      const bookingResponse = await fetch(`${HQBEDS_ORIGIN}/hq/booking/${bookingId}`);
      if (!bookingResponse.ok) throw new Error(`HQBed booking error: ${bookingResponse.status}`);
      const bookingHtml = await bookingResponse.text();

      const phoneMatch = bookingHtml.match(/web\.whatsapp\.com\/send\?phone=([^&"]+)/);
      if (!phoneMatch) return null;

      return phoneMatch[1].replace(/\D/g, '');
    } catch {
      return null;
    }
  }

  // ── Parse date columns from thead ───────────────────────────────────────

  const theadRow = occupancyTable.querySelector('thead tr:first-child');
  if (!theadRow) return null;

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
    });
  }

  if (!dateColumns.length) return null;

  // ── Find today's column index, then tomorrow's ───────────────────────────

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayColumnIndex = dateColumns.findIndex(
    col => col.dateObject.getTime() === today.getTime(),
  );
  if (todayColumnIndex === -1 || todayColumnIndex + 1 >= dateColumns.length) return null;

  const tomorrowColumn = dateColumns[todayColumnIndex + 1];

  // ── Collect arriving guests from tomorrow's column ───────────────────────

  const tableRows = Array.from(occupancyTable.querySelectorAll('tbody tr'));
  const arrivingGuests = [];

  for (const row of tableRows) {
    const tomorrowCell = row.children[tomorrowColumn.columnIndex];
    if (!tomorrowCell) continue;

    const checkinDivs = tomorrowCell.querySelectorAll(
      '.room-occupancy-overview.bed_button_active.bed_button_checkin',
    );

    for (const div of Array.from(checkinDivs)) {
      if (div.classList.contains('hidden')) continue;
      if (div.classList.contains('bed_button_checkedin')) continue;

      const bookingLink = div.querySelector('a.bookingInfo');
      if (!bookingLink) continue;

      const fullName = extractGuestFirstName(bookingLink);
      if (!fullName) continue;

      const firstName = fullName.split(/\s+/)[0].replace(/[.\u2025\u2026]+$/, '');
      if (!firstName) continue;

      const dataHref = bookingLink.getAttribute('data-href') ?? '';
      const guestBedIdMatch = dataHref.match(/\/(\d+)$/);
      const guestBedId = guestBedIdMatch ? guestBedIdMatch[1] : null;

      arrivingGuests.push({ firstName, guestBedId });
    }
  }

  if (!arrivingGuests.length) return [];

  // ── Fetch phone numbers in parallel ─────────────────────────────────────

  const guestsWithPhones = await Promise.all(
    arrivingGuests.map(async guest => ({
      firstName: guest.firstName,
      phone: guest.guestBedId ? await fetchPhoneForGuest(guest.guestBedId) : null,
    })),
  );

  return guestsWithPhones;
}
