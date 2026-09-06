import type { InputEvent, InputMode } from './types.ts';
import { MAX_ECHOES, MAX_TICKS, replay } from './model.ts';
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
  settings: { sound: boolean; reducedMotion: boolean; inputHints: boolean; inputMode: InputMode };
}

function assertEvents(events: unknown, name: string): asserts events is InputEvent[] {
  if (!Array.isArray(events) || events.length > 18_000) throw new Error(`${name} is too large.`);
  let previousTick = -1;
  let previousSequence = -1;
  for (const event of events) {
    if (!event || typeof event !== 'object') throw new Error(`${name} has a malformed event.`);
    const item = event as Partial<InputEvent>;
    const tick = item.tick;
    const sequence = item.sequence;
    if (typeof tick !== 'number' || !Number.isInteger(tick) || tick < 0 || tick > MAX_TICKS) throw new Error(`${name} has an invalid tick.`);
    if (typeof sequence !== 'number' || !Number.isInteger(sequence) || sequence < 0) throw new Error(`${name} has an invalid sequence.`);
    if (tick < previousTick || tick === previousTick && sequence < previousSequence) throw new Error(`${name} is out of order.`);
    if (!['up', 'right', 'down', 'left', 'interact'].includes(item.action ?? '') || !['down', 'up'].includes(item.phase ?? '')) throw new Error(`${name} has an invalid action phase.`);
    previousTick = tick;
    previousSequence = sequence;
  }
}

function contiguousProgress(completedRooms: number[]): number {
  let expected = 1;
  for (const roomId of completedRooms) {
    if (roomId !== expected) break;
    expected += 1;
  }
  return expected - 1;
}

export function roomIsSelectable(save: Pick<SaveData, 'completedRooms'>, roomId: number): boolean {
  const prefix = contiguousProgress(save.completedRooms);
  return Number.isInteger(roomId) && roomId >= 1 && roomId <= prefix + 1;
}

export function defaultSave(roomId = 1): SaveData {
  const room = roomById(roomId);
  return { formatVersion: FORMAT_VERSION, campaignVersion: CAMPAIGN_VERSION, chapter: room.chapter, roomId, completedRooms: [], medals: {}, roomStartCheckpoint: 'room-start', selectedEchoTapes: [], currentAttemptTape: [], timelineCursor: 0, settings: { sound: true, reducedMotion: false, inputHints: true, inputMode: 'realtime' } };
}

export function serializeSave(save: SaveData): string {
  const raw = JSON.stringify(save, null, 2);
  if (new TextEncoder().encode(raw).byteLength > MAX_SAVE_BYTES) throw new Error('Save file is too large.');
  return raw;
}

export function parseSave(raw: string): SaveData {
  if (new TextEncoder().encode(raw).byteLength > MAX_SAVE_BYTES) throw new Error('Save file is too large.');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('Save file is not valid JSON.'); }
  if (!value || typeof value !== 'object') throw new Error('Save root must be an object.');
  const save = value as Partial<SaveData>;
  if (save.formatVersion !== FORMAT_VERSION || save.campaignVersion !== CAMPAIGN_VERSION) throw new Error('Save version is not supported.');
  const roomId = save.roomId;
  if (typeof roomId !== 'number' || !Number.isInteger(roomId)) throw new Error('Save has no valid room.');
  const room = roomById(roomId);
  if (save.chapter !== room.chapter) throw new Error('Save chapter does not match room.');

  const completedRooms = save.completedRooms;
  if (!Array.isArray(completedRooms) || completedRooms.some((id) => !Number.isInteger(id) || id < 1 || id > 12)) throw new Error('Save has invalid progress.');
  for (let index = 1; index < completedRooms.length; index += 1) if (completedRooms[index] <= completedRooms[index - 1]) throw new Error('Save progress must be unique and sorted.');
  const progress = contiguousProgress(completedRooms);
  if (completedRooms.length !== progress || !roomIsSelectable({ completedRooms }, room.id)) throw new Error('Save room is ahead of completed progress.');

  const medals = save.medals;
  if (!medals || typeof medals !== 'object' || Array.isArray(medals)) throw new Error('Save medals are invalid.');
  for (const [roomKey, medal] of Object.entries(medals)) {
    const medalRoomId = Number(roomKey);
    if (!Number.isInteger(medalRoomId) || medalRoomId < 1 || medalRoomId > 12 || !completedRooms.includes(medalRoomId)) throw new Error('Save contains a medal for an incomplete or unknown room.');
    if (!['bronze', 'silver', 'gold'].includes(medal)) throw new Error('Save contains an unknown medal.');
  }
  if (typeof save.roomStartCheckpoint !== 'string' || save.roomStartCheckpoint !== 'room-start') throw new Error('Save checkpoint is invalid.');

  const selectedEchoTapes = save.selectedEchoTapes;
  if (!Array.isArray(selectedEchoTapes) || selectedEchoTapes.length > MAX_ECHOES) throw new Error('Save has too many echoes.');
  selectedEchoTapes.forEach((tape, index) => assertEvents(tape, `echo ${index + 1}`));
  const currentAttemptTape = save.currentAttemptTape;
  assertEvents(currentAttemptTape, 'current attempt');
  const cursor = save.timelineCursor;
  if (typeof cursor !== 'number' || !Number.isInteger(cursor) || cursor < 0 || cursor >= room.budget || cursor > MAX_TICKS) throw new Error('Save has an invalid timeline cursor.');
  const timelineCursor = cursor;
  const lastEventTick = currentAttemptTape.at(-1)?.tick ?? 0;
  if (lastEventTick > timelineCursor) throw new Error('Save cursor is before a current attempt event.');
  try { replay(room, selectedEchoTapes, currentAttemptTape, timelineCursor + 1); } catch { throw new Error('Save replay data is invalid.'); }

  const settings = save.settings;
  if (!settings || typeof settings.sound !== 'boolean' || typeof settings.reducedMotion !== 'boolean' || typeof settings.inputHints !== 'boolean') throw new Error('Save settings are invalid.');
  const inputMode = settings.inputMode === undefined ? 'realtime' : settings.inputMode;
  if (inputMode !== 'realtime' && inputMode !== 'step') throw new Error('Save input mode is invalid.');
  return { formatVersion: FORMAT_VERSION, campaignVersion: CAMPAIGN_VERSION, chapter: room.chapter, roomId: room.id, completedRooms: [...completedRooms], medals: { ...medals }, roomStartCheckpoint: 'room-start', selectedEchoTapes: selectedEchoTapes.map((tape) => tape.map((event) => ({ ...event }))), currentAttemptTape: currentAttemptTape.map((event) => ({ ...event })), timelineCursor, settings: { sound: settings.sound, reducedMotion: settings.reducedMotion, inputHints: settings.inputHints, inputMode } };
}

export function safeLoad(storage: Storage | null, key: string): SaveData {
  if (!storage) return defaultSave();
  try { const raw = storage.getItem(key); return raw ? parseSave(raw) : defaultSave(); } catch { return defaultSave(); }
}

export function safeStore(storage: Storage | null, key: string, save: SaveData): string | null {
  if (!storage) return 'Local save is unavailable in this browser.';
  try { storage.setItem(key, serializeSave(save)); return null; } catch { return 'Local save failed; your exported file is still safe.'; }
}
