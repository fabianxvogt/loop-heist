import './ui/styles.css';
import { replay, rewindTape } from './core/model.ts';
import { ROOMS, roomById } from './core/rooms.ts';
import { defaultSave, parseSave, safeLoad, safeStore, serializeSave, type SaveData } from './core/save.ts';
import type { Action, InputEvent } from './core/types.ts';

const SAVE_KEY = 'loop-heist-save-v1';
const storage = (() => { try { return window.localStorage; } catch { return null; } })();
let save: SaveData = safeLoad(storage, SAVE_KEY);
let room = roomById(save.roomId);
let echoTapes: InputEvent[][] = save.selectedEchoTapes;
let currentTape: InputEvent[] = save.currentAttemptTape;
let cursor = save.timelineCursor;
let sequence = Math.max(0, ...currentTape.map((event) => event.sequence)) + 1;
let paused = false;
let message = 'Move with arrows or WASD. Record your first echo, then let it hold the plate.';
const pressed = new Set<Action>();
const app = document.querySelector<HTMLDivElement>('#app')!;

function currentReplay() { return replay(room, echoTapes, currentTape, Math.max(1, cursor + 1)); }
function event(action: Action, phase: InputEvent['phase']): void {
  if (paused && phase === 'down') return;
  currentTape.push({ tick: cursor, sequence: sequence++, action, phase });
  currentTape.sort((a, b) => a.tick - b.tick || a.sequence - b.sequence);
  saveCurrent();
}
function saveCurrent(): void {
  save.roomId = room.id; save.chapter = room.chapter; save.selectedEchoTapes = echoTapes; save.currentAttemptTape = currentTape; save.timelineCursor = cursor;
  const failure = safeStore(storage, SAVE_KEY, save);
  if (failure) message = failure;
}
function resetAttempt(): void { currentTape = []; cursor = 0; sequence = 0; paused = false; message = 'Fresh attempt. Your echoes stay put until you erase them.'; saveCurrent(); render(); }
function recordEcho(): void {
  if (currentTape.length === 0) { message = 'Run a route first; empty echoes are not saved.'; render(); return; }
  if (echoTapes.length >= 3) { message = 'Three echo slots is the limit. Erase one before recording again.'; render(); return; }
  echoTapes = [...echoTapes, currentTape.map((item) => ({ ...item }))]; currentTape = []; cursor = 0; sequence = 0; message = `Echo ${echoTapes.length} saved. New attempt starts at the room checkpoint.`; saveCurrent(); render();
}
function eraseEcho(index: number): void { echoTapes = echoTapes.filter((_, echoIndex) => echoIndex !== index); message = `Echo ${index + 1} erased. Other routes were not changed.`; saveCurrent(); render(); }
function rewind(): void {
  const chosen = Math.max(0, Math.min(cursor, room.budget - 1));
  const replayed = rewindTape(room, echoTapes, currentTape, chosen);
  currentTape = currentTape.filter((item) => item.tick <= chosen);
  cursor = replayed.state.tick;
  sequence = Math.max(0, ...currentTape.map((item) => item.sequence)) + 1;
  message = `Timeline rewound to tick ${chosen}. Only the current attempt was truncated.`; saveCurrent(); render();
}
function completeIfReady(): void {
  const result = currentReplay();
  if (result.state.terminal === 'success') {
    if (!save.completedRooms.includes(room.id)) save.completedRooms = [...save.completedRooms, room.id].sort((a, b) => a - b);
    save.medals[String(room.id)] = result.state.tick <= room.parTicks ? (echoTapes.length <= room.goldEchoes ? 'gold' : 'silver') : 'bronze';
    message = `Vault clear. ${save.medals[String(room.id)]} medal. Pick another vault or keep practicing.`; safeStore(storage, SAVE_KEY, save);
  }
}
function selectRoom(id: number): void {
  const next = roomById(id);
  if (next.chapter > 1 && !save.completedRooms.includes(4)) { message = 'Finish the first four vaults to open Guard Work.'; render(); return; }
  if (next.chapter > 2 && !save.completedRooms.includes(8)) { message = 'Finish the first eight vaults to open Master Vault.'; render(); return; }
  room = next; echoTapes = []; currentTape = []; cursor = 0; sequence = 0; paused = false; message = room.lesson; saveCurrent(); render();
}
function togglePause(): void {
  paused = !paused;
  if (paused) {
    for (const action of [...pressed]) event(action, 'up');
    pressed.clear();
    message = 'Paused. Key releases are recorded, so resume cannot stick a held input.';
  } else message = 'Resumed at the same timeline tick.';
  render();
}
function exportSave(): void {
  const blob = new Blob([serializeSave(save)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'loop-heist-save.json'; link.click(); URL.revokeObjectURL(link.href);
}
function importSave(): void {
  const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/json';
  input.onchange = async () => {
    const file = input.files?.[0]; if (!file) return;
    try { const next = parseSave(await file.text()); save = next; room = roomById(save.roomId); echoTapes = save.selectedEchoTapes; currentTape = save.currentAttemptTape; cursor = save.timelineCursor; message = 'Save imported. Bad files leave the old save untouched.'; safeStore(storage, SAVE_KEY, save); render(); }
    catch (error) { message = error instanceof Error ? `Import rejected: ${error.message}` : 'Import rejected.'; render(); }
  }; input.click();
}

function tileMarkup(x: number, y: number, state: ReturnType<typeof currentReplay>['state']): string {
  const point = { x, y };
  const wall = room.walls.some((item) => item.x === x && item.y === y);
  if (wall) return '<div class="tile wall" aria-label="wall"></div>';
  const door = room.doors.find((item) => item.at.x === x && item.at.y === y);
  const doorClosed = door && !((door.plateIds ?? []).every((id) => state.echoes.concat(state.player).some((actor) => { const plate = room.plates.find((candidate) => candidate.id === id); return plate && actor.at.x === plate.at.x && actor.at.y === plate.at.y; })) && (door.timerIds ?? []).every((id) => state.timers[id] > 0));
  const classes = ['tile', doorClosed ? 'door-closed' : 'floor'];
  if (room.hazards.some((item) => item.x === x && item.y === y)) classes.push('hazard');
  if (room.plates.some((item) => item.at.x === x && item.at.y === y)) classes.push('plate');
  if (room.timedSwitches.some((item) => item.at.x === x && item.at.y === y)) classes.push('switch');
  if (room.keys.some((item) => item.at.x === x && item.at.y === y)) classes.push('key');
  if (room.exit.x === x && room.exit.y === y) classes.push('exit');
  let content = '';
  if (state.player.at.x === x && state.player.at.y === y) content = '<span class="actor player" title="you">●</span>';
  else if (state.echoes.some((actor) => actor.at.x === x && actor.at.y === y)) content = '<span class="actor echo" title="echo">◌</span>';
  else if (state.guards.some((actor) => actor.at.x === x && actor.at.y === y)) content = '<span class="actor guard" title="guard">◆</span>';
  return `<div class="${classes.join(' ')}">${content}</div>`;
}
function render(): void {
  const result = currentReplay();
  completeIfReady();
  const roomButtons = ROOMS.map((candidate) => {
    const locked = candidate.chapter === 2 && !save.completedRooms.includes(4) || candidate.chapter === 3 && !save.completedRooms.includes(8);
    const medal = save.medals[String(candidate.id)] ? ` · ${save.medals[String(candidate.id)]}` : '';
    return `<button class="room-button ${candidate.id === room.id ? 'selected' : ''}" data-room="${candidate.id}" ${locked ? 'disabled' : ''}>${candidate.id}. ${candidate.title}${medal}</button>`;
  }).join('');
  const grid = Array.from({ length: room.height }, (_, y) => Array.from({ length: room.width }, (_, x) => tileMarkup(x, y, result.state)).join('')).join('');
  const terminal = result.state.terminal === 'running' ? (paused ? 'PAUSED' : 'LIVE') : result.state.terminal.toUpperCase();
  app.innerHTML = `<main class="shell">
    <header class="topbar"><div><p class="eyebrow">LOOP HEIST / CHAPTER ${room.chapter}</p><h1>${room.title}</h1><p class="subhead">${room.lesson}</p></div><div class="header-actions"><button id="pause">${paused ? 'Resume' : 'Pause'} <kbd>P</kbd></button><button id="reset">Retry <kbd>R</kbd></button></div></header>
    <section class="layout"><aside class="sidebar"><div class="panel intro"><p class="panel-label">VAULT ${String(room.id).padStart(2, '0')}</p><p>Earlier routes become echoes. Ghosts hold plates, tap switches, and block guards. They never steal your keys.</p><p class="hint">${save.settings.inputHints ? 'Arrows / WASD move · Space or E interact · P pause · R retry' : 'Input hints are off.'}</p></div><div class="panel"><p class="panel-label">CHAPTER MAP</p><div class="room-list">${roomButtons}</div></div><div class="panel tools"><p class="panel-label">SAVE KIT</p><div class="button-row"><button id="export">Export</button><button id="import">Import</button></div><label><input type="checkbox" id="sound" ${save.settings.sound ? 'checked' : ''}> sound</label><label><input type="checkbox" id="motion" ${save.settings.reducedMotion ? 'checked' : ''}> reduced motion</label></div></aside><section class="play"><div class="status-row"><span class="status ${terminal.toLowerCase()}">${terminal}</span><span>tick ${result.state.tick} / ${room.budget}</span><span>echoes ${echoTapes.length} / 3</span><span>keys ${[...result.state.keys].length} / ${room.requiredKeyIds.length}</span></div><div class="board" style="--cols:${room.width};--rows:${room.height}">${grid}</div><div class="timeline panel"><div class="timeline-head"><div><p class="panel-label">TIMELINE</p><strong>${currentTape.length ? `${currentTape.length} current events` : 'No current route yet'}</strong></div><div class="timeline-buttons"><button id="record" class="accent">Record echo</button><button id="rewind">Rewind to tick</button></div></div><input id="scrub" type="range" min="0" max="${Math.max(1, room.budget - 1)}" value="${cursor}" aria-label="rewind timeline"><div class="lanes"><div class="lane current"><span>YOU</span><i style="width:${Math.min(100, cursor / room.budget * 100)}%"></i></div>${echoTapes.map((tape, index) => `<div class="lane"><span>ECHO ${index + 1}<button class="erase" data-erase="${index}" aria-label="erase echo ${index + 1}">×</button></span><i style="width:${Math.min(100, ((tape.at(-1)?.tick ?? 0) / room.budget) * 100)}%"></i></div>`).join('')}</div></div><div class="message" role="status">${message}</div></section></section></main>`;
  document.querySelector('#pause')?.addEventListener('click', togglePause); document.querySelector('#reset')?.addEventListener('click', resetAttempt); document.querySelector('#record')?.addEventListener('click', recordEcho); document.querySelector('#rewind')?.addEventListener('click', rewind); document.querySelector('#export')?.addEventListener('click', exportSave); document.querySelector('#import')?.addEventListener('click', importSave);
  document.querySelectorAll<HTMLButtonElement>('[data-room]').forEach((button) => button.addEventListener('click', () => selectRoom(Number(button.dataset.room))));
  document.querySelectorAll<HTMLButtonElement>('[data-erase]').forEach((button) => button.addEventListener('click', () => eraseEcho(Number(button.dataset.erase))));
  document.querySelector<HTMLInputElement>('#scrub')?.addEventListener('input', (inputEvent) => { cursor = Number((inputEvent.target as HTMLInputElement).value); render(); });
  document.querySelector<HTMLInputElement>('#sound')?.addEventListener('change', (inputEvent) => { save.settings.sound = (inputEvent.target as HTMLInputElement).checked; saveCurrent(); });
  document.querySelector<HTMLInputElement>('#motion')?.addEventListener('change', (inputEvent) => { save.settings.reducedMotion = (inputEvent.target as HTMLInputElement).checked; saveCurrent(); });
}

const keyActions: Record<string, Action> = { ArrowUp: 'up', w: 'up', ArrowRight: 'right', d: 'right', ArrowDown: 'down', s: 'down', ArrowLeft: 'left', a: 'left', ' ': 'interact', e: 'interact' };
window.addEventListener('keydown', (keyboardEvent) => { if (keyboardEvent.repeat) return; const lower = keyboardEvent.key.toLowerCase(); if (lower === 'p') { keyboardEvent.preventDefault(); togglePause(); return; } if (lower === 'r') { keyboardEvent.preventDefault(); resetAttempt(); return; } const action = keyActions[keyboardEvent.key]; if (!action) return; keyboardEvent.preventDefault(); if (!pressed.has(action)) { pressed.add(action); event(action, 'down'); render(); } });
window.addEventListener('keyup', (keyboardEvent) => { const action = keyActions[keyboardEvent.key]; if (!action) return; keyboardEvent.preventDefault(); pressed.delete(action); event(action, 'up'); render(); });
window.setInterval(() => { if (!paused && currentTape.length) { cursor = Math.min(room.budget - 1, cursor + 1); saveCurrent(); render(); } }, 1000 / 30);
render();
