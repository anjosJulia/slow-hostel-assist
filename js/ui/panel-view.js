import { createIcon, hydrateIcons } from "./icons.js"
import { createGuestCard } from "./guest-card.js"
import {
  IDLE_HINT_MESSAGE,
  LOADING_MESSAGE,
  PRIMARY_ACTION_LABELS,
  SECONDARY_ACTION_LABELS,
  SUCCESS_MESSAGE,
  TemplateMode,
} from "../constants.js"

/**
 * Every screen the side panel can be on. The view owns the transitions
 * between them so the flow handlers in popup.js only say *what* happened —
 * "here is a template", "this failed" — and never touch the DOM.
 */
export const PanelState = Object.freeze({
  IDLE: "idle",
  LOADING: "loading",
  RESULT: "result",
  EDITING: "editing",
  GUEST_LIST: "guest-list",
  NOTICE: "notice",
})

const MODE_BUTTON_IDS = Object.freeze({
  [TemplateMode.QUOTE]: "btn-select-quote",
  [TemplateMode.PRE_RESERVATION]: "btn-select-pre-reservation",
  [TemplateMode.BREAKFAST]: "btn-select-breakfast",
  [TemplateMode.CHECKIN_TOMORROW]: "btn-select-checkin-tomorrow",
})

const HIDDEN_CLASS = "is-hidden"

export class MissingPanelElementError extends Error {
  constructor(elementId) {
    super(`Panel element not found: ${elementId}`)
    this.name = "MissingPanelElementError"
  }
}

/**
 * Renders the side panel and reports user intent back through callbacks.
 *
 * Pattern: Observer — the view exposes intents (generate, copy, open a
 * conversation) rather than DOM events, so the flows stay unaware of markup.
 *
 * @typedef {object} PanelCallbacks
 * @property {(mode: string) => void} onModeChange
 * @property {() => void} onGenerate
 * @property {(template: string) => void} onCopy
 * @property {() => void} onOpenHqbed
 * @property {() => void} onReloadTab
 * @property {(phone: string, guest: object) => void} onOpenConversation
 */
export class PanelView {
  #elements
  #callbacks
  #originalTemplate = ""
  #state = PanelState.IDLE

  /** @param {PanelCallbacks} callbacks */
  constructor(callbacks) {
    this.#callbacks = callbacks
    this.#elements = readElements()

    hydrateIcons()
    this.#bindEvents()
    this.#applyState(PanelState.IDLE)
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /** Highlights a mode and returns the panel to its resting screen. */
  setActiveMode(mode) {
    for (const [buttonMode, button] of Object.entries(
      this.#elements.modeButtons,
    )) {
      button.classList.toggle("is-active", buttonMode === mode)
    }

    this.#elements.optionShowDiscount.classList.toggle(
      HIDDEN_CLASS,
      mode !== TemplateMode.QUOTE,
    )

    this.showIdle()
  }

  showIdle() {
    this.#elements.panelHint.textContent = IDLE_HINT_MESSAGE
    this.#applyState(PanelState.IDLE)
  }

  showLoading() {
    this.#elements.loadingNoteLabel.textContent = LOADING_MESSAGE
    this.#applyState(PanelState.LOADING)
  }

  /**
   * @param {string} template Text to display and, later, to copy.
   * @param {string} tagLabel Room-type or list label shown on the card.
   */
  showResult(template, tagLabel) {
    this.#originalTemplate = template
    this.#elements.resultText.value = template
    this.#elements.resultText.scrollTop = 0
    this.#elements.resultTag.textContent = tagLabel
    this.#elements.resultTag.className = "tag"
    this.#applyState(PanelState.RESULT)
  }

  /**
   * @param {Array<object>} guests
   * @param {string} meta Sub-heading, e.g. "domingo, 02/08 · 3 reservas".
   */
  showGuestList(guests, meta) {
    this.#elements.guestListMeta.textContent = meta
    this.#elements.guestList.replaceChildren(
      ...guests.map((guest) =>
        createGuestCard(guest, this.#callbacks.onOpenConversation),
      ),
    )
    this.#applyState(PanelState.GUEST_LIST)
  }

  /** @param {{ title: string, body: string }} notice */
  showNotice(notice) {
    this.#elements.noticeTitle.textContent = notice.title
    this.#elements.noticeBody.textContent = notice.body
    this.#applyState(PanelState.NOTICE)
  }

  /** Success banner that does not replace whatever is already on screen. */
  showFeedback(message = SUCCESS_MESSAGE) {
    this.#renderFeedback(message, "feedback", "check")
  }

  /** Same banner in a warning tone — used when the result must stay visible. */
  showWarning(message) {
    this.#renderFeedback(message, "feedback feedback--warning", "alert")
  }

  #renderFeedback(message, className, iconName) {
    const { feedback, feedbackLabel } = this.#elements

    feedback.className = className
    feedback.querySelector("svg")?.remove()
    feedback.prepend(createIcon(iconName, { size: 16 }))
    feedbackLabel.textContent = message
    show(feedback)
  }

  hideFeedback() {
    hide(this.#elements.feedback)
  }

  get isDiscountVisibleToGuest() {
    return this.#elements.checkboxShowDiscount.checked
  }

  // ── Event wiring ───────────────────────────────────────────────────────

  #bindEvents() {
    const { modeButtons, primaryButton, secondaryButton } = this.#elements

    for (const [mode, button] of Object.entries(modeButtons)) {
      button.addEventListener("click", () => this.#callbacks.onModeChange(mode))
    }

    primaryButton.addEventListener("click", () => this.#runPrimaryAction())
    secondaryButton.addEventListener("click", () =>
      this.#callbacks.onGenerate(),
    )

    this.#elements.editButton.addEventListener("click", () =>
      this.#startEditing(),
    )
    this.#elements.discardButton.addEventListener("click", () =>
      this.#discardEdits(),
    )
    this.#elements.copyInlineButton.addEventListener("click", () =>
      this.#copyCurrentTemplate(),
    )

    this.#elements.openHqbedButton.addEventListener("click", () =>
      this.#callbacks.onOpenHqbed(),
    )
    this.#elements.reloadTabButton.addEventListener("click", () =>
      this.#callbacks.onReloadTab(),
    )
  }

  #runPrimaryAction() {
    if (
      this.#state === PanelState.RESULT ||
      this.#state === PanelState.EDITING
    ) {
      this.#copyCurrentTemplate()
      return
    }

    this.#callbacks.onGenerate()
  }

  #copyCurrentTemplate() {
    const template = this.#elements.resultText.value

    this.#callbacks.onCopy(template)

    if (this.#state === PanelState.EDITING) {
      this.#applyState(PanelState.RESULT)
    }
  }

  #startEditing() {
    this.#applyState(PanelState.EDITING)
    this.#elements.resultText.focus()
  }

  #discardEdits() {
    this.#elements.resultText.value = this.#originalTemplate
    this.#applyState(PanelState.RESULT)
  }

  // ── State rendering ────────────────────────────────────────────────────

  #applyState(state) {
    this.#state = state

    const elements = this.#elements
    const isEditing = state === PanelState.EDITING
    const showsResultCard =
      state === PanelState.RESULT ||
      state === PanelState.EDITING ||
      state === PanelState.LOADING

    document.body.classList.toggle("panel--compact", state !== PanelState.IDLE)
    document.body.classList.toggle("panel--busy", state === PanelState.LOADING)

    toggle(elements.resultCard, showsResultCard)
    elements.resultCard.classList.toggle("is-editing", isEditing)
    elements.resultText.readOnly = !isEditing
    toggle(elements.resultText, state !== PanelState.LOADING)
    toggle(elements.resultSkeleton, state === PanelState.LOADING)
    toggle(elements.resultCardActions, state === PanelState.RESULT)
    toggle(elements.discardButton, isEditing)
    toggle(elements.editHint, isEditing)

    toggle(elements.loadingNote, state === PanelState.LOADING)
    toggle(elements.notice, state === PanelState.NOTICE)
    toggle(elements.noticeActions, state === PanelState.NOTICE)
    toggle(elements.checkinSection, state === PanelState.GUEST_LIST)
    toggle(
      elements.panelHint,
      state === PanelState.IDLE || state === PanelState.NOTICE,
    )

    if (state === PanelState.LOADING) {
      elements.resultTag.textContent = "montando…"
      elements.resultTag.className = "tag tag--muted"
    }

    if (isEditing) {
      elements.resultTag.textContent = "Editando"
      elements.resultTag.className = "tag tag--editing"
    }

    hide(elements.feedback)
    this.#applyFooter(state)
  }

  #applyFooter(state) {
    const { primaryButton, secondaryButton } = this.#elements
    const footer = FOOTER_BY_STATE[state]

    primaryButton.disabled = footer.disabled === true
    primaryButton.classList.toggle(
      "btn-primary--confirm",
      footer.confirm === true,
    )
    this.#elements.primaryLabel.textContent = footer.label
    setIcon(this.#elements.primaryIcon, footer.icon)

    toggle(secondaryButton, Boolean(footer.secondary))

    if (footer.secondary) {
      this.#elements.secondaryLabel.textContent = footer.secondary.label
      setIcon(this.#elements.secondaryIcon, footer.secondary.icon, 13)
    }
  }
}

/** Footer contract per state: label, icon, tone and the optional quiet action. */
const FOOTER_BY_STATE = Object.freeze({
  [PanelState.IDLE]: { label: PRIMARY_ACTION_LABELS.GENERATE, icon: "sparkle" },
  [PanelState.NOTICE]: {
    label: PRIMARY_ACTION_LABELS.GENERATE,
    icon: "sparkle",
  },
  [PanelState.LOADING]: {
    label: PRIMARY_ACTION_LABELS.GENERATING,
    icon: "sparkle",
    disabled: true,
  },
  [PanelState.RESULT]: {
    label: PRIMARY_ACTION_LABELS.COPY,
    icon: "copy",
    confirm: true,
    secondary: { label: SECONDARY_ACTION_LABELS.REGENERATE, icon: "refresh" },
  },
  [PanelState.EDITING]: {
    label: PRIMARY_ACTION_LABELS.SAVE_AND_COPY,
    icon: "copy",
    confirm: true,
  },
  [PanelState.GUEST_LIST]: {
    label: PRIMARY_ACTION_LABELS.REFRESH_GUESTS,
    icon: "refresh",
  },
})

// ── DOM helpers ──────────────────────────────────────────────────────────────

function readElements() {
  const modeButtons = Object.fromEntries(
    Object.entries(MODE_BUTTON_IDS).map(([mode, id]) => [
      mode,
      requireElement(id),
    ]),
  )

  return {
    modeButtons,
    optionShowDiscount: requireElement("option-show-discount"),
    checkboxShowDiscount: requireElement("checkbox-show-discount"),
    resultCard: requireElement("result-card"),
    resultCardActions: requireElement("result-card-actions"),
    resultTag: requireElement("result-tag"),
    resultText: requireElement("result-text"),
    resultSkeleton: requireElement("result-skeleton"),
    editButton: requireElement("btn-edit"),
    copyInlineButton: requireElement("btn-copy-inline"),
    discardButton: requireElement("btn-discard"),
    editHint: requireElement("edit-hint"),
    loadingNote: requireElement("loading-note"),
    loadingNoteLabel: requireElement("loading-note-label"),
    feedback: requireElement("feedback"),
    feedbackLabel: requireElement("feedback-label"),
    notice: requireElement("notice"),
    noticeTitle: requireElement("notice-title"),
    noticeBody: requireElement("notice-body"),
    noticeActions: requireElement("notice-actions"),
    openHqbedButton: requireElement("btn-open-hqbed"),
    reloadTabButton: requireElement("btn-reload-tab"),
    checkinSection: requireElement("checkin-section"),
    guestList: requireElement("guest-list"),
    guestListMeta: requireElement("guest-list-meta"),
    panelHint: requireElement("panel-hint"),
    primaryButton: requireElement("btn-primary"),
    primaryIcon: requireElement("btn-primary-icon"),
    primaryLabel: requireElement("btn-primary-label"),
    secondaryButton: requireElement("btn-secondary"),
    secondaryIcon: requireElement("btn-secondary-icon"),
    secondaryLabel: requireElement("btn-secondary-label"),
  }
}

function requireElement(elementId) {
  const element = document.getElementById(elementId)

  if (!element) {
    throw new MissingPanelElementError(elementId)
  }

  return element
}

function setIcon(host, name, size = 17) {
  host.replaceChildren(createIcon(name, { size }))
}

function toggle(element, isVisible) {
  element.classList.toggle(HIDDEN_CLASS, !isVisible)
}

function show(element) {
  element.classList.remove(HIDDEN_CLASS)
}

function hide(element) {
  element.classList.add(HIDDEN_CLASS)
}
