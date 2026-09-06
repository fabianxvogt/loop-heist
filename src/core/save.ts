import type { InputEvent } from './types.ts';
import { MAX_ECHOES, MAX_TICKS } from './model.ts';
import { roomById } from './rooms.ts';

export const FORMAT_VERSION = 1;
export const CAMPAIGN_VERSION = '1.0.0';
export const MAX_SAVE_BYTES = 256_000;

export interface SaveData {
  formatVersion: number;
  campaignVersion: string;
  chapter: number;
  roomId: number;
  completedRooms: number[];
  medals: Record<string, string>;
  roomStartCheckpoint: string;
  selectedEchoTapes: InputEvent[][];
  currentAttemptTape: InputEvent[];
  timelineCursor: number;
  settings: { sound: boolean; reducedMotion: boolean; inputHints: boolean };
}

function assertEvents(events: unknown, name: string): asserts events is InputEvent[] {
  if (!Array.isArray(events) || events.length > 0 && events.length > 18_000) throw new Error(`${name} is too large.`);
  let previous = -1;
  for (const event of events) {
    if (!event || typeof event !== 'object') throw new Error(`${name} has a malformed event.`);
    const item = event as Partial<InputEvent>;
    if (!Number.isInteger(item.tick) || item.tick < 0 || item.tick > MAX_TICKS) throw new Error(`${name} has an invalid tick.`);
    if (!Number.isInteger(item.sequence) || item.sequence < 0) throw new Error(`${name} has an invalid sequence.`);
    if (item.tick < previous) throw new Error(`${name} is out of order.`);
    if (!['up', 'right', 'down', 'left', 'interact'].includes(item.action ?? '') || !['down', 'up'].includes(item.phase ?? '')) throw new Error(`${name} has an invalid action phase.`);
    previous = item.tick;
  }
}

export function defaultSave(roomId = 1): SaveData {
  return { formatVersion: FORMAT_VERSION, campaignVersion: CAMPAIGN_VERSION, chapter: 1, roomId, completedRooms: [], medals: {}, roomStartCheckpoint: 'room-start', selectedEchoTapes: [], currentAttemptTape: [], timelineCursor: 0, settings: { sound: true, reducedMotion: false, inputHints: true } };
}

export function serializeSave(save: SaveData): string { return JSON.stringify(save, null, 2); }

export function parseSave(raw: string): SaveData {
  if (raw.length > MAX_SAVE_BYTES) throw new Error('Save file is too large.');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('Save file is not valid JSON.'); }
  if (!value || typeof value !== 'object') throw new Error('Save root must be an object.');
  const save = value as Partial<SaveData>;
  if (save.formatVersion !== FORMAT_VERSION || save.campaignVersion !== CAMPAIGN_VERSION) throw new Error('Save version is not supported.');
  if (!Number.isInteger(save.roomId)) throw new Error('Save has no valid room.');
  const room = roomById(save.roomId);
  if (save.chapter !== room.chapter) throw new Error('Save chapter does not match room.');
  if (!Array.isArray(save.completedRooms) || save.completedRooms.some((id) => !Number.isInteger(id) || id < 1 || id > 12)) throw new Error('Save has invalid progress.');
  if (!Array.isArray(save.selectedEchoTapes) || save.selectedEchoTapes.length > MAX_ECHOES) throw new Error('Save has too many echoes.');
  save.selectedEchoTapes.forEach((tape, index) => assertEvents(tape, `echo ${index + 1}`));
  assertEvents(save.currentAttemptTape, 'current attempt');
  if (!Number.isInteger(save.timelineCursor) || save.timelineCursor < 0 || save.timelineCursor > MAX_TICKS) throw new Error('Save has an invalid timeline cursor.');
  const settings = save.settings;
  if (!settings || typeof settings.sound !== 'boolean' || typeof settings.reducedMotion !== 'boolean' || typeof settings.inputHints !== 'boolean') throw new Error('Save settings are invalid.');
  return JSON.parse(JSON.stringify(save)) as SaveData;
}

export function safeLoad(storage: Storage | null, key: string): SaveData {
  if (!storage) return defaultSave();
  try { const raw = storage.getItem(key); return raw ? parseSave(raw) : defaultSave(); } catch { return defaultSave(); }
}

export function safeStore(storage: Storage | null, key: string, save: SaveData): string | null {
  if (!storage) return 'Local save is unavailable in this browser.';
  try { storage.setItem(key, serializeSave(save)); return null; } catch { return 'Local save failed; your exported file is still safe.'; }
}
