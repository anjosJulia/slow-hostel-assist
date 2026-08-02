import { createIcon } from './icons.js';
import { GUEST_PHONE_PLACEHOLDER, GUEST_WITHOUT_PHONE_TAG } from '../constants.js';

/**
 * One arrival from tomorrow's check-in list: name, editable phone and the
 * button that opens the WhatsApp conversation.
 *
 * The scraper cannot always find a phone on the booking page, so the input is
 * always editable and the card flags the ones the operator still has to fill
 * in — the button stays disabled until there is something to dial.
 *
 * @param {{ firstName: string, phone: string|null, guestCount: number }} guest
 * @param {(phone: string, guest: object) => void} onOpenConversation
 * @returns {HTMLElement}
 */
export function createGuestCard(guest, onOpenConversation) {
  const hasPhone = Boolean(guest.phone);

  const card = document.createElement('div');
  card.className = hasPhone ? 'guest-card' : 'guest-card guest-card--needs-phone';

  card.appendChild(buildHead(guest, hasPhone));

  const row = document.createElement('div');
  row.className = 'guest-card__row';

  const phoneInput = buildPhoneInput(guest);
  const openButton = buildOpenButton();

  const syncButtonState = () => {
    openButton.disabled = phoneInput.value.trim().length === 0;
  };

  phoneInput.addEventListener('input', syncButtonState);
  openButton.addEventListener('click', () => {
    const phone = phoneInput.value.trim();

    if (!phone) {
      phoneInput.focus();
      return;
    }

    onOpenConversation(phone, guest);
  });

  syncButtonState();

  row.append(phoneInput, openButton);
  card.appendChild(row);

  return card;
}

function buildHead(guest, hasPhone) {
  const head = document.createElement('div');
  head.className = 'guest-card__head';

  const name = document.createElement('span');
  name.className = 'guest-card__name';
  name.textContent = guest.firstName;
  head.appendChild(name);

  if (guest.guestCount > 1) {
    head.appendChild(buildTag(`${guest.guestCount} hóspedes`, 'guest-card__tag'));
  }

  if (!hasPhone) {
    head.appendChild(buildTag(GUEST_WITHOUT_PHONE_TAG, 'guest-card__tag tag--accent'));
  }

  return head;
}

function buildTag(label, className) {
  const tag = document.createElement('span');
  tag.className = `tag ${className}`;
  tag.textContent = label;
  return tag;
}

function buildPhoneInput(guest) {
  const input = document.createElement('input');
  input.type = 'tel';
  input.className = 'guest-phone-input';
  input.placeholder = GUEST_PHONE_PLACEHOLDER;
  input.value = guest.phone ?? '';
  input.setAttribute('aria-label', `Telefone de ${guest.firstName}`);
  return input;
}

function buildOpenButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn-whatsapp';
  button.append(createIcon('send', { size: 14 }), document.createTextNode('Abrir'));
  return button;
}
