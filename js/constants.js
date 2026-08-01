// ── Room Types ──────────────────────────────────────────────────────────────

export const RoomType = Object.freeze({
  SHARED: 'SHARED',
  EUROPA: 'EUROPA',
  PRIVATE: 'PRIVATE',
});

// ── Room Classification Keywords ────────────────────────────────────────────

export const ROOM_TYPE_KEYWORDS = {
  EUROPA: ['europa'],
  SHARED: ['coletivo', 'norte', 'africa', 'áfrica', '6 vagas', 'misto', 'femenino', 'feminino'],
  PRIVATE: ['america latina', 'oceania', 'america do sul', 'privativo'],
};

export const SHARED_ROOM_NAME_OVERRIDES = [
  { keywords: ['norte'], displayName: 'América do Norte (misto)' },
  { keywords: ['africa', 'áfrica'], displayName: 'África (feminino)' },
];

// ── Payment ─────────────────────────────────────────────────────────────────

export const HOSTEL_PIX_CNPJ = '15.567.269/0001-21';
export const HOSTEL_BANK_NAME = 'BANCO INTER';
export const HOSTEL_LEGAL_NAME = 'SLOW HOSTEL EMPREENDIMENTOS HOTELEIROS';
export const PRE_RESERVATION_DEPOSIT_RATIO = 0.5;

// ── UI Labels & Messages ────────────────────────────────────────────────────

export const TemplateMode = Object.freeze({
  QUOTE: 'quote',
  PRE_RESERVATION: 'pre-reservation',
  BREAKFAST: 'breakfast',
  CHECKIN_TOMORROW: 'checkin-tomorrow',
});

export const QUOTE_ROOM_TYPE_LABELS = {
  [RoomType.SHARED]: '🛏️ Quarto Coletivo',
  [RoomType.EUROPA]: '🌿 Privativo Europa',
  [RoomType.PRIVATE]: '🏡 Quarto Privativo',
};

export const PRE_RESERVATION_ROOM_TYPE_LABELS = {
  [RoomType.SHARED]: '🛏️ Pré-reserva · Coletivo',
  [RoomType.EUROPA]: '🌿 Pré-reserva · Europa',
  [RoomType.PRIVATE]: '🏡 Pré-reserva · Privativo',
};

export const BREAKFAST_TAG_LABEL = '☕ Café da Manhã';

export const ERROR_MESSAGES = Object.freeze({
  PAGE_NOT_ACCESSIBLE: '⚠️ Não foi possível ler a página. Você está no HQBed?',
  EXTENSION_HAS_NO_ACCESS:
    '⚠️ A extensão não tem acesso a esta aba. Recarregue a página do HQBed (F5) e tente de novo.',
  BOOKING_MODAL_NOT_OPEN: '⚠️ Abra a modal de Nova Reserva no HQBed primeiro.',
  OCCUPANCY_PAGE_NOT_OPEN: '⚠️ Abra a página de Ocupação do HQBed para gerar o café.',
  OCCUPANCY_TODAY_NOT_VISIBLE:
    '⚠️ O mapa de ocupação está em outra data. Volte para hoje e gere de novo.',
  BREAKFAST_NO_UPCOMING_DAYS:
    '⚠️ O mapa de ocupação não mostra dias suficientes à frente para montar o café.',
  CHECKIN_TOMORROW_PAGE_NOT_OPEN: '⚠️ Abra a página de Ocupação do HQBed para buscar os check-ins.',
  CHECKIN_TOMORROW_TODAY_NOT_VISIBLE: '⚠️ Volte o mapa de ocupação para a data de hoje.',
  CHECKIN_TOMORROW_NO_GUESTS: '✅ Nenhum hóspede pendente de check-in amanhã.',
});

// ── Breakfast scraping failures ─────────────────────────────────────────────

// Same duplication caveat as CheckinScrapeFailure below: these values are
// repeated as string literals inside scrapeBreakfastData, which is injected
// into the HQBed page and therefore cannot import this module.
export const BreakfastScrapeFailure = Object.freeze({
  OCCUPANCY_TABLE_NOT_FOUND: 'OCCUPANCY_TABLE_NOT_FOUND',
  TODAY_COLUMN_NOT_VISIBLE: 'TODAY_COLUMN_NOT_VISIBLE',
  NO_UPCOMING_DAYS: 'NO_UPCOMING_DAYS',
});

export const BREAKFAST_FAILURE_MESSAGES = Object.freeze({
  [BreakfastScrapeFailure.OCCUPANCY_TABLE_NOT_FOUND]: ERROR_MESSAGES.OCCUPANCY_PAGE_NOT_OPEN,
  [BreakfastScrapeFailure.TODAY_COLUMN_NOT_VISIBLE]: ERROR_MESSAGES.OCCUPANCY_TODAY_NOT_VISIBLE,
  [BreakfastScrapeFailure.NO_UPCOMING_DAYS]: ERROR_MESSAGES.BREAKFAST_NO_UPCOMING_DAYS,
});

// ── Check-in scraping failures ──────────────────────────────────────────────

// These values are duplicated as string literals inside
// scrapeCheckinTomorrowGuests: the scraper is injected into the HQBed page and
// cannot import anything, so it has no access to this module.
export const CheckinScrapeFailure = Object.freeze({
  OCCUPANCY_TABLE_NOT_FOUND: 'OCCUPANCY_TABLE_NOT_FOUND',
  TODAY_COLUMN_NOT_VISIBLE: 'TODAY_COLUMN_NOT_VISIBLE',
  TOMORROW_COLUMN_NOT_VISIBLE: 'TOMORROW_COLUMN_NOT_VISIBLE',
});

export const CHECKIN_FAILURE_MESSAGES = Object.freeze({
  [CheckinScrapeFailure.OCCUPANCY_TABLE_NOT_FOUND]: ERROR_MESSAGES.CHECKIN_TOMORROW_PAGE_NOT_OPEN,
  [CheckinScrapeFailure.TODAY_COLUMN_NOT_VISIBLE]: ERROR_MESSAGES.CHECKIN_TOMORROW_TODAY_NOT_VISIBLE,
  [CheckinScrapeFailure.TOMORROW_COLUMN_NOT_VISIBLE]:
    ERROR_MESSAGES.CHECKIN_TOMORROW_TODAY_NOT_VISIBLE,
});

export const SUCCESS_MESSAGE = '✅ Copiado! Cola direto no WhatsApp.';
export const LOADING_MESSAGE = 'Gerando... Por enquanto faça carinho em Muximba 🐈';
