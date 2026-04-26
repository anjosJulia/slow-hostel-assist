import { RoomType, ROOM_TYPE_KEYWORDS, SHARED_ROOM_NAME_OVERRIDES } from './constants.js';

/** Formats a numeric value as Brazilian Real (e.g. 362.5 → "362,50"). */
export function formatCurrency(value) {
  return value.toFixed(2).replace('.', ',');
}

/** Detects the room type from a raw HQBed room name string. Defaults to PRIVATE. */
export function detectRoomType(roomName) {
  const normalized = roomName.toLowerCase();

  if (ROOM_TYPE_KEYWORDS.EUROPA.some(k => normalized.includes(k))) return RoomType.EUROPA;
  if (ROOM_TYPE_KEYWORDS.SHARED.some(k => normalized.includes(k))) return RoomType.SHARED;
  if (ROOM_TYPE_KEYWORDS.PRIVATE.some(k => normalized.includes(k))) return RoomType.PRIVATE;

  return RoomType.PRIVATE;
}

/** Resolves a display-friendly name for shared rooms (e.g. "norte" → "América do Norte (misto)"). */
export function resolveSharedRoomDisplayName(roomName) {
  const normalized = roomName.toLowerCase();

  for (const { keywords, displayName } of SHARED_ROOM_NAME_OVERRIDES) {
    if (keywords.some(k => normalized.includes(k))) return displayName;
  }

  return roomName;
}
