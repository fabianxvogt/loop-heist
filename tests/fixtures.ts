import { initialState, replay, step, validate } from '../src/core/model.ts';
import { ROOMS, validateCampaign, validateRoomBounds } from '../src/core/rooms.ts';
import { MAX_SAVE_BYTES, defaultSave, parseSave, roomIsSelectable, serializeSave } from '../src/core/save.ts';
import type { Action, InputEvent, RoomStatic } from '../src/core/types.ts';

function equal<T>(actual: T, expected: T, message: string): void { if (actual !== expected) throw new Error(`${message}: ${String(actual)} !== ${String(expected)}`); }
function notEqual<T>(actual: T, expected: T, message: string): void { if (actual === expected) throw new Error(message); }
function deepEqual(actual: unknown, expected: unknown, message: string): void { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(message); }
function throws(fn: () => unknown, message: string): void { let thrown = false; try { fn(); } catch { thrown = true; } if (!thrown) throw new Error(message); }
function hold(action: Action, start: number, duration: number, sequence = 0): InputEvent[] { return [{ tick: start, sequence, action, phase: 'down' }, { tick: start + duration, sequence: sequence + 1, action, phase: 'up' }]; }
function reviewRoom(overrides: Partial<RoomStatic> = {}): RoomStatic {
  return { ...ROOMS[0], id: 90, title: 'fixture', width: 7, height: 5, walls: [], start: { x: 1, y: 2 }, exit: { x: 6, y: 2 }, doors: [], plates: [], timedSwitches: [], keys: [], hazards: [], guards: [], requiredKeyIds: [], requiredPlateIds: [], requiredTimerIds: [], solution: { echoTapes: [], playerTape: [], operations: ['play'], steps: [{ kind: 'play', tape: [] }], expected: 'complete' }, ...overrides };
}

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

const tieRoom = reviewRoom({ start: { x: 3, y: 3 }, exit: { x: 6, y: 4 } });
const tiedRightThenDown = replay(tieRoom, [], [{ tick: 0, sequence: 0, action: 'right', phase: 'down' }, { tick: 0, sequence: 0, action: 'down', phase: 'down' }], 1);
const tiedDownThenRight = replay(tieRoom, [], [{ tick: 0, sequence: 0, action: 'down', phase: 'down' }, { tick: 0, sequence: 0, action: 'right', phase: 'down' }], 1);
equal(JSON.stringify(tiedRightThenDown.state.player.at), JSON.stringify(tiedDownThenRight.state.player.at), 'same-sequence direction tie is canonical');
equal(JSON.stringify(tiedRightThenDown.state.player.at), JSON.stringify({ x: 4, y: 3 }), 'same-sequence tie uses Up, Right, Down, Left precedence');

const echoTimerRoom = reviewRoom({ timedSwitches: [{ id: 'clock', at: { x: 2, y: 2 }, duration: 5 }] });
const echoWithoutInteract = replay(echoTimerRoom, [hold('right', 0, 6)], [], 7);
equal(echoWithoutInteract.state.timers.clock, 0, 'echo needs an interact edge for a timed switch');
const timerAtOne = reviewRoom({ exit: { x: 6, y: 4 }, doors: [{ at: { x: 2, y: 2 }, timerIds: ['clock'] }], timedSwitches: [{ id: 'clock', at: { x: 1, y: 2 }, duration: 1 }] });
const timerState = initialState(timerAtOne, [], hold('right', 0, 6)); timerState.timers.clock = 1; timerState.player.held.add('right'); timerState.player.lastDirection = 'right'; step(timerAtOne, timerState);
equal(JSON.stringify(timerState.player.at), JSON.stringify({ x: 2, y: 2 }), 'timer remains open during remaining-one evaluation');

const room3 = ROOMS[2];
const withoutSwitchTap = room3.solution.echoTapes[0].filter((event) => event.action !== 'interact');
equal(validate(room3, { ...room3.solution, echoTapes: [withoutSwitchTap] }).accepted, false, 'Room 3 needs the echo interact edge');
const room6 = ROOMS[5];
equal(validate(room6, { ...room6.solution, playerTape: room6.solution.playerTape.slice(0, -1) }).accepted, true, 'redundant trailing player key-up after success may be omitted');
equal(validate(room6, { ...room6.solution, echoTapes: [room6.solution.echoTapes[0].slice(1)] }).accepted, false, 'Room 6 needs the echo movement down edge');
equal(validate(ROOMS[3], { ...ROOMS[3].solution, operations: ['record', 'rewind'] }).accepted, false, 'Room 4 requires its executable erase plan');
equal(validate(ROOMS[7], { ...ROOMS[7].solution, operations: ['record', 'rewind'] }).accepted, false, 'Room 8 requires its executable retry and erase plan');
equal(ROOMS[9].solution.echoTapes.length, 3, 'Room 10 stores three authored echo roles');

const save = defaultSave(4);
save.completedRooms = [1, 2, 3];
save.selectedEchoTapes = [ROOMS[0].solution.echoTapes[0]];
save.currentAttemptTape = ROOMS[0].solution.playerTape;
save.timelineCursor = 36;
const roundTrip = parseSave(serializeSave(save));
deepEqual(roundTrip, save, 'save round trip');
throws(() => parseSave(JSON.stringify({ ...save, formatVersion: 99 })), 'wrong version accepted');
throws(() => parseSave(JSON.stringify({ ...save, selectedEchoTapes: [[], [], [], []] })), 'too many echoes accepted');
throws(() => parseSave(JSON.stringify({ ...save, currentAttemptTape: [{ tick: -1, sequence: 0, action: 'right', phase: 'down' }] })), 'negative tick accepted');
throws(() => parseSave(JSON.stringify({ ...save, currentAttemptTape: [{ tick: 8, sequence: 0, action: 'right', phase: 'down' }, { tick: 2, sequence: 1, action: 'right', phase: 'up' }] })), 'out of order events accepted');
throws(() => parseSave(JSON.stringify({ ...save, currentAttemptTape: [{ tick: 2, sequence: 1, action: 'right', phase: 'down' }, { tick: 2, sequence: 0, action: 'right', phase: 'up' }] })), 'out of order same-tick sequence accepted');
throws(() => parseSave(JSON.stringify({ ...save, timelineCursor: 0, currentAttemptTape: [{ tick: 6, sequence: 0, action: 'right', phase: 'down' }] })), 'cursor before current tape accepted');
throws(() => parseSave(JSON.stringify({ ...save, timelineCursor: 180 })), 'cursor at room budget accepted');
throws(() => parseSave(JSON.stringify({ ...save, roomId: 9, chapter: 3, completedRooms: [] })), 'chapter-three progress forgery accepted');
throws(() => parseSave(JSON.stringify({ ...save, medals: { '1': 'platinum' } })), 'unknown medal accepted');
throws(() => parseSave(JSON.stringify({ ...save, medals: { '4': 'gold' } })), 'medal for incomplete room accepted');
throws(() => parseSave(JSON.stringify({ ...save, roomStartCheckpoint: 42 })), 'bad checkpoint accepted');
throws(() => parseSave('x'.repeat(MAX_SAVE_BYTES + 1)), 'byte-oversized save accepted');
equal(roomIsSelectable({ completedRooms: [] }, 1), true, 'first room selectable');
equal(roomIsSelectable({ completedRooms: [1, 2] }, 2), true, 'completed room replay selectable');
equal(roomIsSelectable({ completedRooms: [1, 2] }, 4), false, 'room after an incomplete gap is locked');

console.log(`Loop Heist fixtures PASS: ${ROOMS.length} authored rooms, deterministic fingerprints, save rejection cases.`);
