import { replay, validate } from '../src/core/model.ts';
import { ROOMS, validateCampaign, validateRoomBounds } from '../src/core/rooms.ts';
import { defaultSave, parseSave, serializeSave } from '../src/core/save.ts';

function equal<T>(actual: T, expected: T, message: string): void { if (actual !== expected) throw new Error(`${message}: ${String(actual)} !== ${String(expected)}`); }
function notEqual<T>(actual: T, expected: T, message: string): void { if (actual === expected) throw new Error(message); }
function deepEqual(actual: unknown, expected: unknown, message: string): void { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(message); }
function throws(fn: () => unknown, message: string): void { let thrown = false; try { fn(); } catch { thrown = true; } if (!thrown) throw new Error(message); }

validateRoomBounds();
const campaign = validateCampaign();
equal(campaign.length, 12, 'campaign room count');
for (const result of campaign) equal(result.accepted, true, `room ${result.roomId}: ${result.failure ?? 'unknown failure'}`);

for (const room of ROOMS) {
  const a = replay(room, room.solution.echoTapes, room.solution.playerTape);
  const b = replay(room, room.solution.echoTapes, room.solution.playerTape);
  equal(a.fingerprint, b.fingerprint, `room ${room.id} replay drift`);
  const removed = room.solution.playerTape.slice(1);
  notEqual(validate(room, { ...room.solution, playerTape: removed }).accepted, true, `room ${room.id} accepts truncated solution`);
}

const save = defaultSave(4);
save.completedRooms = [1, 2, 3];
save.selectedEchoTapes = [ROOMS[0].solution.echoTapes[0]];
save.currentAttemptTape = ROOMS[0].solution.playerTape;
const roundTrip = parseSave(serializeSave(save));
deepEqual(roundTrip, save, 'save round trip');
throws(() => parseSave(JSON.stringify({ ...save, formatVersion: 99 })), 'wrong version accepted');
throws(() => parseSave(JSON.stringify({ ...save, selectedEchoTapes: [[], [], [], []] })), 'too many echoes accepted');
throws(() => parseSave(JSON.stringify({ ...save, currentAttemptTape: [{ tick: -1, sequence: 0, action: 'right', phase: 'down' }] })), 'negative tick accepted');
throws(() => parseSave(JSON.stringify({ ...save, currentAttemptTape: [{ tick: 8, sequence: 0, action: 'right', phase: 'down' }, { tick: 2, sequence: 1, action: 'right', phase: 'up' }] })), 'out of order events accepted');

console.log(`Loop Heist fixtures PASS: ${ROOMS.length} authored rooms, deterministic fingerprints, save rejection cases.`);
