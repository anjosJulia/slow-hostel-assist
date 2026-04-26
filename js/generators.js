import {
  RoomType,
  HOSTEL_PIX_CNPJ,
  HOSTEL_BANK_NAME,
  HOSTEL_LEGAL_NAME,
  PRE_RESERVATION_DEPOSIT_RATIO,
} from './constants.js';
import { formatCurrency, resolveSharedRoomDisplayName } from './services.js';

// ── Quote ───────────────────────────────────────────────────────────────────

function buildTotalPriceLine(data, showDiscountToGuest) {
  if (showDiscountToGuest && data.discountLabel) {
    return `💰 Valor total: ~R$ ${formatCurrency(data.originalTotalPrice)}~\nC/ desconto: R$ ${formatCurrency(data.totalPrice)}`;
  }

  return `💰 Valor total: R$ ${formatCurrency(data.totalPrice)}`;
}

function buildSharedRoomQuote(data, showDiscountToGuest) {
  const roomDisplayName = resolveSharedRoomDisplayName(data.roomName);
  const period = `${data.checkIn} a ${data.checkOut}`;

  return `QUARTO COLETIVO
🛏️ Quarto Coletivo – ${roomDisplayName}
✔️ 1 cama + armário com chave + Café da manhã 🔐
❄️ Quarto com ar-condicionado (ligado das 21h às 07h30)
📅 Período: ${period}
🛎️ Diárias: ${data.nightCount}
💲 Valor da diária: R$ ${formatCurrency(data.dailyRate)}
${buildTotalPriceLine(data, showDiscountToGuest)}`;
}

function buildEuropaRoomQuote(data, showDiscountToGuest) {
  const period = `${data.checkIn} a ${data.checkOut}`;

  return `QUARTO PRIVATIVO EUROPA
🏡 Quarto Privativo Europa
Com ventilador e varanda + Café da manhã 🌿
📅 Período: ${period}
🛎️ Diárias: ${data.nightCount}
💲 Valor da diária: R$ ${formatCurrency(data.dailyRate)}
${buildTotalPriceLine(data, showDiscountToGuest)}`;
}

function buildPrivateRoomQuote(data, showDiscountToGuest) {
  const period = `${data.checkIn} a ${data.checkOut}`;

  return `QUARTO PRIVATIVO
🏡 Quarto Privativo ${data.roomName} - com ar-condicionado ❄️ (ligado das 21h às 07h30) – para ${data.guestCount} pessoa(s) + café da manhã
📅 Período: ${period}
🛎️ Diárias: ${data.nightCount}
💲 Valor da diária: R$ ${formatCurrency(data.dailyRate)}
${buildTotalPriceLine(data, showDiscountToGuest)}`;
}

// Pattern: Strategy — each room type has its own template builder
const QUOTE_BUILDERS = {
  [RoomType.SHARED]: buildSharedRoomQuote,
  [RoomType.EUROPA]: buildEuropaRoomQuote,
  [RoomType.PRIVATE]: buildPrivateRoomQuote,
};

export function generateQuote(data, roomType, showDiscountToGuest = false) {
  return QUOTE_BUILDERS[roomType](data, showDiscountToGuest);
}

// ── Pre-reservation ─────────────────────────────────────────────────────────

function buildBedDescription(roomName, roomType) {
  if (roomType === RoomType.EUROPA) {
    return '*Cama:* 1 cama no quarto Europa com ventilador e varanda.';
  }

  if (roomType === RoomType.SHARED) {
    const displayName = resolveSharedRoomDisplayName(roomName);
    return `*Cama:* 1 cama no quarto ${displayName} com ar-condicionado (ligado a partir das 21h e desligado às 07h30).`;
  }

  return `*Cama:* 1 cama no quarto ${roomName} com ar-condicionado (ligado a partir das 21h e desligado às 07h30).`;
}

export function generatePreReservation(data, roomType) {
  const depositAmount = data.totalPrice * PRE_RESERVATION_DEPOSIT_RATIO;
  const bedDescription = buildBedDescription(data.roomName, roomType);

  return `Confira tudo direitinho e só efetue o depósito se concordar com tudo, ok? Qualquer dúvida, chame a gente aqui:

${bedDescription}

Período: ${data.checkIn} - ${data.checkOut}
Diárias: ${data.nightCount}
Valor total: R$ ${formatCurrency(data.totalPrice)}

Valor total a ser depositado: R$ ${formatCurrency(depositAmount)} (50% do valor total da reserva)

Esse valor não será reembolsado em caso de cancelamento.

Dados da conta para transferência:

PIX
CNPJ: ${HOSTEL_PIX_CNPJ}

${HOSTEL_BANK_NAME}
${HOSTEL_LEGAL_NAME}

🎯 Disponibilizamos café da manhã como cortesia das 7h às 9h. Há padarias, cafeterias e supermercados próximos.
É permitido o uso da cozinha até 21h30, para preparo de lanches e refeições rápidas.
Nossa recepção fecha de 22h. Lembre-se de informar seu horário de chegada e saída, para check-ins após esse horário, informe nossa equipe com antecedência.

O depósito deverá ser realizado em até 48h a contar do envio desta mensagem. Caso contrário, sua cama poderá ser revendida para outra pessoa. Qualquer eventualidade, comunique-nos o mais breve possível.

⚠️ Atenção: seu depósito é a garantia da sua vaga no nosso hostel. Não nos responsabilizamos pela sua reserva caso o depósito não seja feito e o comprovante enviado.

Após o depósito, será necessário enviar o comprovante da transferência (uma foto do comprovante ou o mesmo digitalizado). Somente assim sua reserva será confirmada. Qualquer dúvida, não hesite em contatar-nos.

O restante deverá ser pago no check-in. Ressaltamos que todos os pagamentos feitos no estabelecimento com cartão de débito ou crédito terão acréscimo, segundo a lei 13.455/2017.`;
}

// ── Check-in tomorrow message ────────────────────────────────────────────────

function resolveTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'bom dia';
  if (hour < 18) return 'boa tarde';
  return 'boa noite';
}

export function generateCheckinMessage(firstName) {
  const greeting = resolveTimeGreeting();

  return `Olá, ${greeting}, ${firstName}!
Tudo bem? Desejamos que sim. \u{1F60A}\u{1F33B}

Estamos muito felizes em recebê-lo(a) no Slow Hostel!

Para que possamos preparar tudo com carinho para a sua chegada, gostaríamos de saber:

Qual o seu horário de chegada?

Lembrando que o check-in começa a partir das 14h. \u{1F551}
E nossa recepção funciona até 22hrs

Se tiver qualquer dúvida ou precisar de algo, é só nos chamar!

Muito obrigado e até já! \u{1F917}`;
}

// ── Breakfast ───────────────────────────────────────────────────────────────

export function generateBreakfastList(data) {
  const lines = [data.responsibleStaff, ''];

  for (const day of data.days) {
    lines.push(day.header, '');
    lines.push(`👤 Total de Hóspedes na casa (manhã): ${day.totalGuests}`);
    lines.push(`☕ Hóspedes com café da manhã: ${day.breakfastGuests}`);
    lines.push('Nome dos hóspedes ', '');

    for (const name of day.guestNames) {
      lines.push(name);
    }

    lines.push('');
  }

  return lines.join('\n').trimEnd();
}
