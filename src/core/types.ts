export type Action = 'up' | 'right' | 'down' | 'left' | 'interact';
export type Phase = 'down' | 'up';
export type Direction = Exclude<Action, 'interact'>;

export interface InputEvent {
  tick: number;
  sequence: number;
  action: Action;
  phase: Phase;
}

export interface Point { x: number; y: number }

export interface Door {
  at: Point;
  plateIds?: string[];
  timerIds?: string[];
  all?: boolean;
}

export interface Plate { id: string; at: Point }
export interface TimedSwitch { id: string; at: Point; duration: number }
export interface Key { id: string; at: Point }
export interface Guard { id: string; patrol: Point[]; cadence?: number; startTick?: number }

export interface RoomStatic {
  id: number;
  chapter: number;
  title: string;
  lesson: string;
  width: number;
  height: number;
  walls: Point[];
  start: Point;
  exit: Point;
  doors: Door[];
  plates: Plate[];
  timedSwitches: TimedSwitch[];
  keys: Key[];
  hazards: Point[];
  guards: Guard[];
  requiredKeyIds: string[];
  requiredPlateIds: string[];
  requiredTimerIds: string[];
  parTicks: number;
  goldEchoes: number;
  budget: number;
  solution: SolutionPlan;
}

export interface SolutionPlan {
  echoTapes: InputEvent[][];
  playerTape: InputEvent[];
  operations: string[];
  steps?: PlanStep[];
  fingerprint?: string;
  expected: 'complete';
}

export type PlanStep =
  | { kind: 'play'; tape: InputEvent[] }
  | { kind: 'record'; tape: InputEvent[] }
  | { kind: 'rewind'; cursor: number }
  | { kind: 'erase'; echoIndex: number }
  | { kind: 'retry' };

export interface ActorState {
  at: Point;
  facing: Direction;
  held: Set<Action>;
  lastDirection: Direction;
  events: InputEvent[];
  eventCursor: number;
}

export interface GuardState { id: string; at: Point; cursor: number; waitCount: number }

export interface SimState {
  tick: number;
  player: ActorState;
  echoes: ActorState[];
  guards: GuardState[];
  timers: Record<string, number>;
  keys: Set<string>;
  trace: string[];
  terminal: 'running' | 'success' | 'collision' | 'hazard' | 'budget';
}

export interface ReplayResult {
  state: SimState;
  fingerprint: string;
}
