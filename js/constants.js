// ── Room Types ──────────────────────────────────────────────────────────────

export const RoomType = Object.freeze({
  SHARED: "SHARED",
  EUROPA: "EUROPA",
  PRIVATE: "PRIVATE",
})

// ── Room Classification Keywords ────────────────────────────────────────────

export const ROOM_TYPE_KEYWORDS = {
  EUROPA: ["europa"],
  SHARED: [
    "coletivo",
    "norte",
    "africa",
    "áfrica",
    "6 vagas",
    "misto",
    "femenino",
    "feminino",
  ],
  PRIVATE: ["america latina", "oceania", "america do sul", "privativo"],
}

export const SHARED_ROOM_NAME_OVERRIDES = [
  { keywords: ["norte"], displayName: "América do Norte (misto)" },
  { keywords: ["africa", "áfrica"], displayName: "África (feminino)" },
]

// ── Payment ─────────────────────────────────────────────────────────────────

export const HOSTEL_PIX_CNPJ = "15.567.269/0001-21"
export const HOSTEL_BANK_NAME = "BANCO INTER"
export const HOSTEL_LEGAL_NAME = "SLOW HOSTEL EMPREENDIMENTOS HOTELEIROS"
export const PRE_RESERVATION_DEPOSIT_RATIO = 0.5

// ── UI Labels & Messages ────────────────────────────────────────────────────

export const TemplateMode = Object.freeze({
  QUOTE: "quote",
  PRE_RESERVATION: "pre-reservation",
  BREAKFAST: "breakfast",
  CHECKIN_TOMORROW: "checkin-tomorrow",
})

export const QUOTE_ROOM_TYPE_LABELS = {
  [RoomType.SHARED]: "🛏️ Quarto Coletivo",
  [RoomType.EUROPA]: "🌿 Privativo Europa",
  [RoomType.PRIVATE]: "🏡 Quarto Privativo",
}

export const PRE_RESERVATION_ROOM_TYPE_LABELS = {
  [RoomType.SHARED]: "🛏️ Pré-reserva · Coletivo",
  [RoomType.EUROPA]: "🌿 Pré-reserva · Europa",
  [RoomType.PRIVATE]: "🏡 Pré-reserva · Privativo",
}

export const BREAKFAST_TAG_LABEL = "☕ Café da Manhã"

// A notice leads with the instruction and explains underneath. The operators
// are hostel staff mid-conversation with a guest: "deu erro" costs them a
// support call, "abre a modal e clica de novo" does not.
export const NOTICES = Object.freeze({
  PAGE_NOT_ACCESSIBLE: {
    title: "Abre o HQBed nesta aba",
    body: "A gente lê os dados direto da tela. Abre o HQBed na aba ativa e tenta de novo.",
  },
  BOOKING_MODAL_NOT_OPEN: {
    title: "Abre a modal da reserva primeiro",
    body: "A gente lê os dados da tela do HQBed. Abre a reserva (ou a Nova Reserva) e clica em Gerar de novo — leva dois segundos.",
  },
  OCCUPANCY_PAGE_NOT_OPEN: {
    title: "Abre a página de Ocupação",
    body: "A lista do café sai do mapa de ocupação do HQBed. Abre a Ocupação e clica em Gerar de novo.",
  },
  CHECKIN_TOMORROW_PAGE_NOT_OPEN: {
    title: "Abre a página de Ocupação",
    body: "Os check-ins de amanhã saem do mapa de ocupação do HQBed. Abre a Ocupação e clica em Atualizar lista.",
  },
  CHECKIN_TOMORROW_TODAY_NOT_VISIBLE: {
    title: "Volta o mapa para hoje",
    body: "O mapa está rolado para outra data, então amanhã não aparece na tela. Volta para hoje e clica em Atualizar lista.",
  },
  OCCUPANCY_TODAY_NOT_VISIBLE: {
    title: "Volta o mapa para hoje",
    body: "O mapa está rolado para outra data, então os dias do café não aparecem na tela. Volta para hoje e clica em Gerar de novo.",
  },
  BREAKFAST_NO_UPCOMING_DAYS: {
    title: "Avança o mapa alguns dias",
    body: "O mapa não está mostrando dias suficientes à frente para montar o café. Rola um pouco para a direita e clica em Gerar de novo.",
  },
  EXTENSION_HAS_NO_ACCESS: {
    title: "Recarrega a aba do HQBed",
    body: "A extensão perdeu o acesso a esta aba — costuma acontecer depois de fechar e abrir o painel. Recarrega a aba e tenta de novo.",
  },
})

export const CHECKIN_TOMORROW_NO_GUESTS_MESSAGE =
  "Nenhum hóspede pendente de check-in amanhã."

// ── HQBed navigation ────────────────────────────────────────────────────────

// Matches the extension's host_permissions, so tabs.query can already read
// the URL of these tabs without asking for the broad "tabs" permission.
export const HQBED_TAB_URL_PATTERN = "https://admin.hqbeds.com.br/*"
export const HQBED_HOME_URL = "https://admin.hqbeds.com.br/hq/occupancy"

// ── Breakfast scraping failures ─────────────────────────────────────────────

// Same duplication caveat as CheckinScrapeFailure below: these values are
// repeated as string literals inside scrapeBreakfastData, which is injected
// into the HQBed page and therefore cannot import this module.
export const BreakfastScrapeFailure = Object.freeze({
  OCCUPANCY_TABLE_NOT_FOUND: "OCCUPANCY_TABLE_NOT_FOUND",
  TODAY_COLUMN_NOT_VISIBLE: "TODAY_COLUMN_NOT_VISIBLE",
  NO_UPCOMING_DAYS: "NO_UPCOMING_DAYS",
})

export const BREAKFAST_FAILURE_NOTICES = Object.freeze({
  [BreakfastScrapeFailure.OCCUPANCY_TABLE_NOT_FOUND]:
    NOTICES.OCCUPANCY_PAGE_NOT_OPEN,
  [BreakfastScrapeFailure.TODAY_COLUMN_NOT_VISIBLE]:
    NOTICES.OCCUPANCY_TODAY_NOT_VISIBLE,
  [BreakfastScrapeFailure.NO_UPCOMING_DAYS]: NOTICES.BREAKFAST_NO_UPCOMING_DAYS,
})

// ── Check-in scraping failures ──────────────────────────────────────────────

// These values are duplicated as string literals inside
// scrapeCheckinTomorrowGuests: the scraper is injected into the HQBed page and
// cannot import anything, so it has no access to this module.
export const CheckinScrapeFailure = Object.freeze({
  OCCUPANCY_TABLE_NOT_FOUND: "OCCUPANCY_TABLE_NOT_FOUND",
  TODAY_COLUMN_NOT_VISIBLE: "TODAY_COLUMN_NOT_VISIBLE",
  TOMORROW_COLUMN_NOT_VISIBLE: "TOMORROW_COLUMN_NOT_VISIBLE",
})

export const CHECKIN_FAILURE_NOTICES = Object.freeze({
  [CheckinScrapeFailure.OCCUPANCY_TABLE_NOT_FOUND]:
    NOTICES.CHECKIN_TOMORROW_PAGE_NOT_OPEN,
  [CheckinScrapeFailure.TODAY_COLUMN_NOT_VISIBLE]:
    NOTICES.CHECKIN_TOMORROW_TODAY_NOT_VISIBLE,
  [CheckinScrapeFailure.TOMORROW_COLUMN_NOT_VISIBLE]:
    NOTICES.CHECKIN_TOMORROW_TODAY_NOT_VISIBLE,
})

// ── Panel copy ──────────────────────────────────────────────────────────────

export const SUCCESS_MESSAGE = "Copiado! Cola direto no WhatsApp."
export const COPY_FAILED_MESSAGE =
  "Não deu para copiar sozinho — seleciona o texto e usa Ctrl+C."
export const LOADING_MESSAGE =
  "Gerando… faça carinho em Muximba enquanto aguarda"
export const IDLE_HINT_MESSAGE =
  "Abra a reserva no HQBed e a gente monta o texto."
export const EDIT_HINT_MESSAGE =
  "A edição vale só para este envio — o template original continua igual."

export const GUEST_WITHOUT_PHONE_TAG = "sem telefone"
export const GUEST_PHONE_PLACEHOLDER = "Digite o telefone"

export const PRIMARY_ACTION_LABELS = Object.freeze({
  GENERATE: "Gerar template",
  GENERATING: "Gerando…",
  COPY: "Copiar para o WhatsApp",
  SAVE_AND_COPY: "Salvar e copiar",
  REFRESH_GUESTS: "Atualizar lista",
})

export const SECONDARY_ACTION_LABELS = Object.freeze({
  REGENERATE: "Gerar de novo",
})
