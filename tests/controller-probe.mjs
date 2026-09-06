class EventTargetShim {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }
  dispatchEvent(event) {
    event.target ??= this;
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    return true;
  }
}

class ElementShim extends EventTargetShim {
  constructor(tagName, attributes = {}) {
    super();
    this.tagName = tagName.toUpperCase();
    this.attributes = attributes;
    this.dataset = {};
    this.id = attributes.id ?? '';
    this.className = attributes.class ?? '';
    this.disabled = Boolean(attributes.disabled);
    this.checked = Boolean(attributes.checked);
    this.value = attributes.value ?? '';
    this._innerHTML = '';
    this.files = [];
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) {
    this._innerHTML = String(value);
    if (this.id === 'app' && globalThis.document?.app === this) globalThis.document.rebuildMarkup(this._innerHTML);
  }
  replaceChildren(...children) { this.children = children; }
  insertAdjacentHTML(_position, html) { globalThis.document.registerMarkup(html); }
  click() { this.dispatchEvent({ type: 'click', target: this, preventDefault() {} }); }
  focus() { this.dispatchEvent({ type: 'focus', target: this }); }
}

class DocumentShim {
  constructor() {
    this.elements = [];
    this.app = new ElementShim('div', { id: 'app' });
    this.elements.push(this.app);
  }
  createTextNode(text) { return { textContent: text }; }
  createElement(tagName) { return new ElementShim(tagName); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector) {
    if (selector.startsWith('#')) return this.elements.filter((element) => element.id === selector.slice(1));
    if (selector.startsWith('.')) return this.elements.filter((element) => element.className.split(/\s+/).includes(selector.slice(1)));
    if (selector === '[data-control-action]') return this.elements.filter((element) => element.dataset.controlAction !== undefined);
    if (selector === '[data-room]') return this.elements.filter((element) => element.dataset.room !== undefined);
    if (selector === '[data-erase]') return this.elements.filter((element) => element.dataset.erase !== undefined);
    return [];
  }
  rebuildMarkup(html) {
    this.elements = [this.app];
    this.registerMarkup(html);
  }
  registerMarkup(html) {
    const tagPattern = /<([a-z][a-z0-9-]*)\b([^>]*)>/gi;
    let match;
    while ((match = tagPattern.exec(html))) {
      const [, tagName, rawAttributes] = match;
      const attrs = {};
      for (const attr of ['id', 'class', 'value', 'aria-label', 'data-room', 'data-erase', 'data-control-action']) {
        const value = rawAttributes.match(new RegExp(`${attr}="([^"]*)"`, 'i'));
        if (value) attrs[attr] = value[1];
      }
      if (/\bdisabled\b/i.test(rawAttributes)) attrs.disabled = true;
      if (/\bchecked\b/i.test(rawAttributes)) attrs.checked = true;
      if (!attrs.id && !attrs.class && !attrs['data-room'] && !attrs['data-erase'] && !attrs['data-control-action']) continue;
      const element = new ElementShim(tagName, attrs);
      if (attrs['data-room'] !== undefined) element.dataset.room = attrs['data-room'];
      if (attrs['data-erase'] !== undefined) element.dataset.erase = attrs['data-erase'];
      if (attrs['data-control-action'] !== undefined) element.dataset.controlAction = attrs['data-control-action'];
      this.elements.push(element);
    }
    const select = this.querySelector('#input-mode');
    if (select) {
      const selected = html.match(/<option\s+value="(realtime|step)"[^>]*selected/i);
      select.value = selected?.[1] ?? 'realtime';
    }
  }
}

const documentShim = new DocumentShim();
const windowShim = new EventTargetShim();
let intervalCallback = null;
const values = new Map();
windowShim.localStorage = {
  getItem(key) { return values.get(key) ?? null; },
  setItem(key, value) { values.set(key, String(value)); },
  removeItem(key) { values.delete(key); },
  clear() { values.clear(); },
};
windowShim.setInterval = (callback) => { intervalCallback = callback; return 1; };
windowShim.clearInterval = () => {};
globalThis.document = documentShim;
globalThis.window = windowShim;

await import('../src/main.ts');

const failures = [];
function check(condition, message) { if (!condition) failures.push(message); }
function saved() { return JSON.parse(values.get('loop-heist-save-v1')); }
function emit(type, detail = {}) { windowShim.dispatchEvent({ type, ...detail, preventDefault() {} }); }
function control(action) { return documentShim.querySelectorAll('[data-control-action]').find((element) => element.dataset.controlAction === action); }
function reset() { documentShim.querySelector('#reset').click(); }
function tapeSignature() { return saved().currentAttemptTape.map(({ tick, sequence, action, phase }) => `${tick}:${sequence}:${action}:${phase}`); }
function pointerTap(action, pointerId) {
  control(action).dispatchEvent({ type: 'pointerdown', pointerId, preventDefault() {} });
  emit('pointerup', { pointerId });
}

const controls = documentShim.querySelectorAll('[data-control-action]');
check(controls.length === 5, 'rendered DOM exposes four directions and Interact controls');
check(controls.every((element) => element.attributes['aria-label'] || element.dataset.controlAction === 'interact'), 'accessible controls expose labels');
control('interact').focus();
check(control('interact').tagName === 'BUTTON', 'keyboard-focusable Interact control is a button');
check(documentShim.querySelector('#step-wait')?.disabled === true, 'step wait is disabled in default realtime mode');
check(documentShim.querySelector('#input-mode')?.value === 'realtime', 'default input mode is realtime');

reset();
emit('keydown', { key: 'd', repeat: false });
emit('keyup', { key: 'd' });
check(JSON.stringify(tapeSignature()) === JSON.stringify(['0:0:right:down', '0:1:right:up']), 'keyboard quick tap records canonical down/up');

reset();
pointerTap('right', 11);
check(JSON.stringify(tapeSignature()) === JSON.stringify(['0:0:right:down', '0:1:right:up']), 'pointer quick tap records pointerup release');

reset();
control('left').dispatchEvent({ type: 'pointerdown', pointerId: 12, preventDefault() {} });
emit('pointercancel', { pointerId: 12 });
check(JSON.stringify(tapeSignature()) === JSON.stringify(['0:0:left:down', '0:1:left:up']), 'pointer cancel releases the held action');

reset();
control('up').dispatchEvent({ type: 'pointerdown', pointerId: 13, preventDefault() {} });
emit('blur');
check(JSON.stringify(tapeSignature()) === JSON.stringify(['0:0:up:down', '0:1:up:up']), 'blur releases held pointer input');

reset();
control('down').dispatchEvent({ type: 'pointerdown', pointerId: 14, preventDefault() {} });
documentShim.querySelector('#pause').click();
check(JSON.stringify(tapeSignature()) === JSON.stringify(['0:0:down:down', '0:1:down:up']), 'pause releases held input');

reset();
const mode = documentShim.querySelector('#input-mode');
mode.value = 'step';
mode.dispatchEvent({ type: 'change', target: mode });
check(documentShim.querySelector('#step-wait')?.disabled === false, 'step wait is enabled in step mode');
const cursorBeforeWallCallback = saved().timelineCursor;
intervalCallback?.();
check(saved().timelineCursor === cursorBeforeWallCallback, 'step mode disables wall-clock cursor advance');
const cursorBeforeWait = saved().timelineCursor;
documentShim.querySelector('#step-wait').click();
check(saved().timelineCursor === cursorBeforeWait + 6, 'step wait advances exactly six ticks through the controller');
const cursorBeforePointerStep = saved().timelineCursor;
pointerTap('right', 15);
check(saved().timelineCursor === cursorBeforePointerStep + 6, 'step pointer action advances exactly six ticks');
check(saved().currentAttemptTape.length === 2, 'step pointer action records one canonical down/up pair');
const cursorBeforeKeyboardStep = saved().timelineCursor;
emit('keydown', { key: 'ArrowDown', repeat: false });
check(saved().timelineCursor === cursorBeforeKeyboardStep + 6, 'step keyboard action advances exactly six ticks');
check(saved().currentAttemptTape.length === 4, 'step keyboard action adds one canonical down/up pair');

while (saved().timelineCursor < 179) documentShim.querySelector('#step-wait').click();
const terminalCursor = saved().timelineCursor;
const terminalTape = JSON.stringify(saved().currentAttemptTape);
documentShim.querySelector('#step-wait').click();
check(saved().timelineCursor === terminalCursor, 'real budget terminal rejects an extra controller step');
check(JSON.stringify(saved().currentAttemptTape) === terminalTape, 'real budget terminal records no extra wait input');

mode.value = 'realtime';
mode.dispatchEvent({ type: 'change', target: mode });
check(saved().settings.inputMode === 'realtime', 'mode change persists realtime setting');

if (failures.length) throw new Error(`Controller probe found ${failures.length} failure(s):\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
console.log('Controller probe PASS: DOM controls, pointer lifecycle, focus-safe release, step adapter, and terminal guard.');
