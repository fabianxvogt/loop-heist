import type { Action, ActorState, Direction, InputEvent, PlanStep, Point, ReplayResult, RoomStatic, SimState, SolutionPlan } from './types.ts';

export const TICK_RATE = 60;
export const MOVE_EVERY = 6;
export const STEP_BEAT = MOVE_EVERY;
export const MAX_TICKS = 1800;
export const MAX_ECHOES = 3;

const dirs: Direction[] = ['up', 'right', 'down', 'left'];
const actionOrder: Record<Action, number> = { up: 0, right: 1, down: 2, left: 3, interact: 4 };
const delta: Record<Direction, Point> = {
  up: { x: 0, y: -1 }, right: { x: 1, y: 0 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 },
};

export function pointKey(p: Point): string { return `${p.x},${p.y}`; }
export function samePoint(a: Point, b: Point): boolean { return a.x === b.x && a.y === b.y; }
function clonePoint(p: Point): Point { return { x: p.x, y: p.y }; }
function cloneEvents(events: InputEvent[]): InputEvent[] { return events.map((event) => ({ ...event })); }
export function canonicalizeInputEvents(events: InputEvent[]): InputEvent[] {
  return cloneEvents(events).sort((a, b) => a.tick - b.tick || a.sequence - b.sequence || actionOrder[b.action] - actionOrder[a.action] || (a.phase === b.phase ? 0 : a.phase === 'down' ? -1 : 1));
}

export function appendInputEvent(events: InputEvent[], next: InputEvent): InputEvent[] {
  return canonicalizeInputEvents([...events, { ...next }]);
}

function actor(at: Point, events: InputEvent[]): ActorState {
  return { at: clonePoint(at), facing: 'down', held: new Set(), lastDirection: 'down', events: canonicalizeInputEvents(events), eventCursor: 0 };
}

export function initialState(room: RoomStatic, echoTapes: InputEvent[][] = [], playerTape: InputEvent[] = []): SimState {
  return {
    tick: 0,
    player: actor(room.start, playerTape),
    echoes: echoTapes.slice(0, MAX_ECHOES).map((tape) => actor(room.start, tape)),
    guards: room.guards.map((guard) => ({ id: guard.id, at: clonePoint(guard.patrol[0]), cursor: 0, waitCount: 0 })),
    timers: Object.fromEntries(room.timedSwitches.map((timer) => [timer.id, 0])),
    keys: new Set(),
    trace: [],
    terminal: 'running',
  };
}

function applyEvents(actorState: ActorState, tick: number): boolean {
  let interacted = false;
  while (actorState.eventCursor < actorState.events.length && actorState.events[actorState.eventCursor].tick === tick) {
    const event = actorState.events[actorState.eventCursor++];
    if (event.phase === 'down') {
      actorState.held.add(event.action);
      if (event.action !== 'interact') {
        actorState.lastDirection = event.action;
        actorState.facing = event.action;
      } else {
        interacted = true;
      }
    } else {
      actorState.held.delete(event.action);
    }
  }
  return interacted;
}

function desiredDirection(actorState: ActorState): Direction | null {
  if (actorState.held.has(actorState.lastDirection)) return actorState.lastDirection;
  for (const direction of dirs) if (actorState.held.has(direction)) return direction;
  return null;
}

function blocked(room: RoomStatic, at: Point, state: SimState): boolean {
  if (at.x < 0 || at.y < 0 || at.x >= room.width || at.y >= room.height) return true;
  if (room.walls.some((wall) => samePoint(wall, at))) return true;
  const door = room.doors.find((candidate) => samePoint(candidate.at, at));
  if (door && !doorOpen(room, door, state)) return true;
  return false;
}

function plateActive(room: RoomStatic, id: string, state: SimState): boolean {
  const plate = room.plates.find((candidate) => candidate.id === id);
  if (!plate) return false;
  return [state.player, ...state.echoes].some((candidate) => samePoint(candidate.at, plate.at));
}

function doorOpen(room: RoomStatic, door: RoomStatic['doors'][number], state: SimState): boolean {
  const plateOk = (door.plateIds ?? []).map((id) => plateActive(room, id, state));
  const timerOk = (door.timerIds ?? []).map((id) => state.timers[id] > 0);
  const checks = [...plateOk, ...timerOk];
  if (!checks.length) return true;
  return door.all === false ? checks.some(Boolean) : checks.every(Boolean);
}

function move(room: RoomStatic, state: SimState, actorState: ActorState): Point {
  const direction = desiredDirection(actorState);
  if (!direction || state.tick % MOVE_EVERY !== 0) return clonePoint(actorState.at);
  const d = delta[direction];
  const next = { x: actorState.at.x + d.x, y: actorState.at.y + d.y };
  return blocked(room, next, state) ? clonePoint(actorState.at) : next;
}

function activateTimers(room: RoomStatic, state: SimState, interactedPlayer: boolean, interactedEchoes: boolean[]): void {
  if (interactedPlayer) {
    for (const switchDef of room.timedSwitches) {
      if (samePoint(state.player.at, switchDef.at)) state.timers[switchDef.id] = switchDef.duration;
    }
  }
  for (const switchDef of room.timedSwitches) {
    const activatedByEcho = state.echoes.some((echo, index) => interactedEchoes[index] && samePoint(echo.at, switchDef.at));
    if (activatedByEcho) state.timers[switchDef.id] = switchDef.duration;
  }
}

function collectKey(room: RoomStatic, state: SimState): void {
  for (const key of room.keys) if (samePoint(state.player.at, key.at)) state.keys.add(key.id);
}

function guardMove(room: RoomStatic, state: SimState, oldPlayer: Point, newPlayer: Point): boolean {
  let collision = false;
  for (const guardState of state.guards) {
    const guard = room.guards.find((candidate) => candidate.id === guardState.id)!;
    const cadence = guard.cadence ?? MOVE_EVERY;
    const nextIndex = (guardState.cursor + 1) % guard.patrol.length;
    const target = guard.patrol[nextIndex];
    const blockedByEcho = state.echoes.some((echo) => samePoint(echo.at, target));
    const startTick = guard.startTick ?? 0;
    if (state.tick >= startTick && (state.tick - startTick) % cadence === 0 && !blockedByEcho) {
      if (samePoint(target, newPlayer) || (samePoint(guardState.at, newPlayer) && samePoint(target, oldPlayer))) collision = true;
      else { guardState.cursor = nextIndex; guardState.at = clonePoint(target); }
    } else if (blockedByEcho) guardState.waitCount += 1;
    if (samePoint(guardState.at, newPlayer)) collision = true;
  }
  return collision;
}

function requirementsMet(room: RoomStatic, state: SimState): boolean {
  return room.requiredKeyIds.every((id) => state.keys.has(id))
    && room.requiredPlateIds.every((id) => plateActive(room, id, state))
    && room.requiredTimerIds.every((id) => state.timers[id] > 0);
}

function fingerprintState(state: SimState): string {
  const actors = [state.player, ...state.echoes].map((candidate) => pointKey(candidate.at)).join('|');
  const guards = state.guards.map((guard) => `${guard.id}:${pointKey(guard.at)}:${guard.waitCount}`).join('|');
  return `${state.tick};${state.terminal};${actors};${guards};${JSON.stringify(state.timers)};${[...state.keys].sort().join(',')}`;
}

export function step(room: RoomStatic, state: SimState): SimState {
  if (state.terminal !== 'running') return state;
  const oldPlayer = clonePoint(state.player.at);
  const playerInteract = applyEvents(state.player, state.tick);
  const echoInteracts = state.echoes.map((echo) => applyEvents(echo, state.tick));
  activateTimers(room, state, playerInteract, echoInteracts);
  const nextPlayer = move(room, state, state.player);
  const nextEchoes = state.echoes.map((echo) => move(room, state, echo));
  state.player.at = nextPlayer;
  state.echoes.forEach((echo, index) => { echo.at = nextEchoes[index]; });
  for (const echo of state.echoes) if (echo.eventCursor >= echo.events.length) echo.held.clear();
  collectKey(room, state);
  const collision = guardMove(room, state, oldPlayer, state.player.at)
    || state.guards.some((guard) => samePoint(guard.at, state.player.at));
  const hazard = room.hazards.some((hazardPoint) => samePoint(hazardPoint, state.player.at));
  const exit = samePoint(room.exit, state.player.at) && requirementsMet(room, state);
  state.trace.push(`${state.tick}:${pointKey(state.player.at)}:${state.echoes.map((echo) => pointKey(echo.at)).join('.')}`);
  if (collision) state.terminal = 'collision';
  else if (hazard) state.terminal = 'hazard';
  else if (exit) state.terminal = 'success';
  state.tick += 1;
  for (const timerId of Object.keys(state.timers)) state.timers[timerId] = Math.max(0, state.timers[timerId] - 1);
  if (state.terminal === 'running' && state.tick >= room.budget) state.terminal = 'budget';
  return state;
}

export function advanceTicks(room: RoomStatic, state: SimState, ticks: number): SimState {
  if (!Number.isInteger(ticks) || ticks < 0) throw new Error('Advance ticks must be a non-negative integer.');
  for (let index = 0; index < ticks && state.terminal === 'running'; index += 1) step(room, state);
  return state;
}

export function advanceBeat(room: RoomStatic, state: SimState): SimState {
  return advanceTicks(room, state, STEP_BEAT);
}

export function replay(room: RoomStatic, echoTapes: InputEvent[][] = [], playerTape: InputEvent[] = [], until = room.budget): ReplayResult {
  if (echoTapes.length > MAX_ECHOES) throw new Error('At most three echo tapes are allowed.');
  const state = initialState(room, echoTapes, playerTape);
  // A bounded preview stops before the room budget without inventing a terminal result.
  // `step` remains the only place that marks a real budget terminal at room.budget.
  const previewLimit = Math.max(0, Math.min(until, MAX_TICKS));
  while (state.terminal === 'running' && state.tick < previewLimit) step(room, state);
  if (state.terminal === 'running' && state.tick >= room.budget) state.terminal = 'budget';
  return { state, fingerprint: fingerprintState(state) };
}

export function rewindTape(room: RoomStatic, echoTapes: InputEvent[][], tape: InputEvent[], cursor: number): ReplayResult {
  const prefix = tape.filter((event) => event.tick <= cursor);
  return replay(room, echoTapes, prefix, Math.max(cursor + 1, 1));
}

function eventsEqual(a: InputEvent[], b: InputEvent[]): boolean { return JSON.stringify(a) === JSON.stringify(b); }
function tapesEqual(a: InputEvent[][], b: InputEvent[][]): boolean { return a.length === b.length && a.every((tape, index) => eventsEqual(tape, b[index] ?? [])); }
function operationNames(steps: PlanStep[]): string[] { return steps.map((step) => step.kind); }

export interface PlanExecution {
  echoTapes: InputEvent[][];
  playerTape: InputEvent[];
  operations: string[];
  failure?: string;
}

export function executePlan(room: RoomStatic, plan: SolutionPlan): PlanExecution {
  let echoTapes: InputEvent[][] = [];
  let currentTape: InputEvent[] = [];
  const operations: string[] = [];
  for (const step of plan.steps ?? []) {
    operations.push(step.kind);
    if (step.kind === 'play') currentTape = canonicalizeInputEvents(step.tape);
    if (step.kind === 'record') {
      const tape = canonicalizeInputEvents(step.tape);
      if (!tape.length || echoTapes.length >= MAX_ECHOES) return { echoTapes, playerTape: currentTape, operations, failure: 'invalid record step' };
      echoTapes = [...echoTapes, tape]; currentTape = [];
    }
    if (step.kind === 'rewind') {
      const prefix = currentTape.filter((event) => event.tick <= step.cursor);
      if (prefix.length === currentTape.length) return { echoTapes, playerTape: currentTape, operations, failure: 'rewind did not truncate a current tape' };
      currentTape = prefix;
      rewindTape(room, echoTapes, currentTape, step.cursor);
    }
    if (step.kind === 'erase') {
      if (step.echoIndex < 0 || step.echoIndex >= echoTapes.length) return { echoTapes, playerTape: currentTape, operations, failure: 'erase index is not present' };
      echoTapes = echoTapes.filter((_, index) => index !== step.echoIndex);
    }
    if (step.kind === 'retry') { echoTapes = []; currentTape = []; }
  }
  return { echoTapes, playerTape: currentTape, operations };
}

export function validateAuthoredSolution(room: RoomStatic): { accepted: boolean; fingerprint: string; failure?: string } {
  const plan = room.solution;
  if (plan.expected !== 'complete') return { accepted: false, fingerprint: '', failure: 'authored solution expected result is not complete' };
  if (!plan.steps?.length || !plan.fingerprint) return { accepted: false, fingerprint: '', failure: 'authored solution has no executable steps or fingerprint' };
  const execution = executePlan(room, plan);
  if (execution.failure || !tapesEqual(execution.echoTapes, plan.echoTapes) || !eventsEqual(execution.playerTape, plan.playerTape)) return { accepted: false, fingerprint: '', failure: execution.failure ?? 'plan steps do not produce its stored tapes' };
  const result = replay(room, execution.echoTapes, execution.playerTape);
  if (result.state.terminal !== 'success') return { accepted: false, fingerprint: result.fingerprint, failure: `terminal=${result.state.terminal}` };
  if (result.fingerprint !== plan.fingerprint) return { accepted: false, fingerprint: result.fingerprint, failure: 'stored solution fingerprint changed' };
  if (JSON.stringify(execution.operations) !== JSON.stringify(plan.operations)) return { accepted: false, fingerprint: result.fingerprint, failure: 'stored operation sequence changed' };
  return { accepted: true, fingerprint: result.fingerprint };
}

export function validate(room: RoomStatic, plan = room.solution): { accepted: boolean; fingerprint: string; failure?: string } {
  if (plan.echoTapes.length > MAX_ECHOES) return { accepted: false, fingerprint: '', failure: 'too many echo tapes' };
  const result = replay(room, plan.echoTapes, plan.playerTape);
  if (result.state.terminal !== 'success') return { accepted: false, fingerprint: result.fingerprint, failure: `terminal=${result.state.terminal}` };
  if (plan.steps?.length && JSON.stringify(operationNames(plan.steps)) !== JSON.stringify(plan.operations)) return { accepted: false, fingerprint: result.fingerprint, failure: 'declared operations do not match executable steps' };
  if (plan.fingerprint && result.fingerprint !== plan.fingerprint) return { accepted: false, fingerprint: result.fingerprint, failure: 'solution fingerprint does not match this route' };
  return { accepted: true, fingerprint: result.fingerprint };
}
