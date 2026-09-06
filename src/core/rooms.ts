import type { InputEvent, Point, RoomStatic, SolutionPlan } from './types.ts';
import { MAX_TICKS, validate } from './model.ts';

const p = (x: number, y: number): Point => ({ x, y });
const outerWalls = (width: number, height: number): Point[] => {
  const walls: Point[] = [];
  for (let x = 0; x < width; x += 1) { walls.push(p(x, 0), p(x, height - 1)); }
  for (let y = 1; y < height - 1; y += 1) { walls.push(p(0, y), p(width - 1, y)); }
  return walls;
};
const hold = (action: InputEvent['action'], start: number, duration: number, sequence = 0): InputEvent[] => [
  { tick: start, sequence, action, phase: 'down' },
  { tick: start + duration, sequence: sequence + 1, action, phase: 'up' },
];
const merge = (...parts: InputEvent[][]): InputEvent[] => parts.flat().sort((a, b) => a.tick - b.tick || a.sequence - b.sequence);
const move = (action: InputEvent['action'], cells: number, start = 0): InputEvent[] => hold(action, start, cells * 6);
const plan = (echoTapes: InputEvent[][], playerTape: InputEvent[], operations = ['record', 'rewind', 'erase', 'record']): SolutionPlan => ({ echoTapes, playerTape, operations, expected: 'complete' });

function base(id: number, title: string, lesson: string, start: Point, exit: Point, height = 5): RoomStatic {
  return {
    id, chapter: id <= 4 ? 1 : id <= 8 ? 2 : 3, title, lesson, width: 9, height,
    walls: outerWalls(9, height), start, exit, doors: [], plates: [], timedSwitches: [], keys: [], hazards: [], guards: [],
    requiredKeyIds: [], requiredPlateIds: [], requiredTimerIds: [], parTicks: 120, goldEchoes: 1, budget: 180,
    solution: plan([], []),
  };
}
function lineRoom(room: RoomStatic, plateAt: Point, doorAt: Point, plateId = 'p1'): RoomStatic {
  room.plates = [{ id: plateId, at: plateAt }];
  room.requiredPlateIds = [plateId];
  room.doors = [{ at: doorAt, plateIds: [plateId] }];
  return room;
}

const r1 = lineRoom(base(1, 'Hello, Accomplice', 'Record one echo. Let it hold the plate while you cross.', p(1, 2), p(7, 2)), p(3, 2), p(5, 2));
r1.solution = plan([move('right', 2)], move('right', 6));

const r2 = lineRoom(base(2, 'Long Hold', 'A plate keeps a timer alive. Cross the open door before the clock empties.', p(1, 2), p(7, 2)), p(3, 2), p(5, 2));
r2.timedSwitches = [{ id: 'clock', at: p(3, 2), duration: 42 }];
r2.doors = [{ at: p(5, 2), plateIds: ['p1'], timerIds: ['clock'] }];
r2.solution = plan([move('right', 2)], move('right', 6));

const r3 = base(3, 'Split Second', 'An echo taps the timing switch. Your route must use its short window.', p(1, 2), p(7, 2));
r3.timedSwitches = [{ id: 'gate', at: p(3, 2), duration: 48 }];
r3.doors = [{ at: p(5, 2), timerIds: ['gate'] }]; r3.requiredTimerIds = ['gate'];
r3.solution = plan([merge(move('right', 2), hold('interact', 12, 1))], move('right', 6));

const r4 = base(4, 'Clean Reset', 'Rehearse, rewind, erase the bad route, then keep two useful echoes.', p(1, 2), p(7, 2));
r4.height = 6; r4.walls = outerWalls(9, 6); r4.plates = [{ id: 'p1', at: p(3, 2) }, { id: 'p2', at: p(3, 3) }];
r4.requiredPlateIds = ['p1', 'p2']; r4.doors = [{ at: p(5, 2), plateIds: ['p1', 'p2'], all: false }];
r4.solution = plan([move('right', 2), merge(move('down', 1), move('right', 2, 6))], move('right', 6));

const r5 = lineRoom(base(5, 'Baton Pass', 'You carry the key. Your echo carries the plate duty.', p(1, 1), p(7, 2)), p(3, 2), p(5, 2));
r5.keys = [{ id: 'vault-key', at: p(2, 1) }]; r5.requiredKeyIds = ['vault-key'];
r5.guards = [{ id: 'patrol-a', patrol: [p(7, 4), p(7, 3)] }];
r5.solution = plan([merge(move('down', 1), move('right', 2, 6))], merge(move('right', 1), move('down', 1, 6), move('right', 5, 12)));

const r6 = base(6, 'Blind Corner', 'A ghost can block a guard. It cannot hurt you or steal your key.', p(1, 2), p(7, 2));
r6.plates = []; r6.guards = [{ id: 'corner-guard', patrol: [p(5, 1), p(5, 2)] }];
r6.solution = plan([move('right', 4)], move('right', 6));

const r7 = base(7, 'Double Bind', 'Two echoes hold two plates. Duplicate bodies do not double a plate pulse.', p(1, 2), p(7, 2));
r7.height = 6; r7.walls = outerWalls(9, 6); r7.plates = [{ id: 'p1', at: p(3, 2) }, { id: 'p2', at: p(3, 3) }];
r7.requiredPlateIds = ['p1', 'p2']; r7.doors = [{ at: p(5, 2), plateIds: ['p1', 'p2'] }];
r7.solution = plan([move('right', 2), merge(move('down', 1), move('right', 2, 6))], move('right', 6));

const r8 = base(8, 'Dead Drop', 'Bad routes are recoverable: rewind the current tape, erase one echo, and record again.', p(1, 2), p(7, 2));
r8.plates = [{ id: 'p1', at: p(3, 2) }]; r8.requiredPlateIds = ['p1']; r8.doors = [{ at: p(5, 2), plateIds: ['p1'] }];
r8.guards = [{ id: 'drop-guard', patrol: [p(7, 4), p(7, 3)] }];
r8.solution = plan([move('right', 2)], move('right', 6), ['record', 'rewind', 'erase', 'record', 'retry']);

const r9 = base(9, 'Relay', 'Carry a key while an echo holds a timed relay under guard pressure.', p(1, 1), p(7, 2));
r9.keys = [{ id: 'relay-key', at: p(2, 1) }]; r9.requiredKeyIds = ['relay-key']; r9.plates = [{ id: 'p1', at: p(3, 2) }]; r9.requiredPlateIds = ['p1'];
r9.timedSwitches = [{ id: 'relay-clock', at: p(3, 2), duration: 60 }]; r9.doors = [{ at: p(5, 2), plateIds: ['p1'], timerIds: ['relay-clock'] }]; r9.guards = [{ id: 'relay-guard', patrol: [p(7, 4), p(7, 3)] }];
r9.solution = plan([merge(move('down', 1), move('right', 2, 6))], merge(move('right', 1), move('down', 1, 6), move('right', 5, 12)));

const r10 = base(10, 'Crossfire', 'Hazards are fixed. A third echo can hold the guard in its blind corner.', p(1, 2), p(7, 2));
r10.hazards = [p(4, 1), p(6, 1)]; r10.guards = [{ id: 'crossfire-guard', patrol: [p(5, 1), p(5, 2)] }];
r10.solution = plan([move('right', 4)], move('right', 6));

const r11 = base(11, 'Clockwork', 'Three switches share one exact timing window. Order is part of the route.', p(1, 2), p(7, 2), 7);
r11.walls = outerWalls(9, 7); r11.timedSwitches = [{ id: 't1', at: p(3, 2), duration: 72 }, { id: 't2', at: p(3, 3), duration: 72 }, { id: 't3', at: p(3, 4), duration: 72 }];
r11.requiredTimerIds = ['t1', 't2', 't3']; r11.doors = [{ at: p(5, 2), timerIds: ['t1', 't2', 't3'] }];
r11.solution = plan([
  merge(move('right', 2), hold('interact', 12, 1)),
  merge(move('down', 1), move('right', 2, 6), hold('interact', 18, 1)),
  merge(move('down', 2), move('right', 2, 12), hold('interact', 24, 1)),
], move('right', 7));

const r12 = base(12, 'Master Vault', 'The final heist: key, plate, timed switch, hazards, and a guard all share one loop.', p(1, 1), p(7, 2), 7);
r12.walls = outerWalls(9, 7); r12.keys = [{ id: 'master-key', at: p(2, 1) }]; r12.requiredKeyIds = ['master-key'];
r12.plates = [{ id: 'p1', at: p(3, 2) }]; r12.requiredPlateIds = ['p1']; r12.timedSwitches = [{ id: 'master-clock', at: p(3, 3), duration: 72 }]; r12.requiredTimerIds = ['master-clock'];
r12.doors = [{ at: p(5, 2), plateIds: ['p1'], timerIds: ['master-clock'] }]; r12.hazards = [p(4, 1), p(6, 1)]; r12.guards = [{ id: 'master-guard', patrol: [p(7, 5), p(7, 4)] }];
r12.solution = plan([merge(move('down', 1), move('right', 2, 6)), merge(move('down', 2), move('right', 2, 12), hold('interact', 24, 1))], merge(move('right', 1), move('down', 1, 6), move('right', 6, 12)));

export const ROOMS: RoomStatic[] = [r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12];
export function roomById(id: number): RoomStatic {
  const room = ROOMS.find((candidate) => candidate.id === id);
  if (!room) throw new Error(`Unknown room ${id}.`);
  return room;
}
export function validateCampaign(): { roomId: number; accepted: boolean; fingerprint: string; failure?: string }[] {
  return ROOMS.map((room) => ({ roomId: room.id, ...validate(room) }));
}
export function validateRoomBounds(): void {
  for (const room of ROOMS) {
    if (room.width > 16 || room.height > 10 || room.budget > MAX_TICKS) throw new Error(`Room ${room.id} exceeds contract bounds.`);
  }
}
