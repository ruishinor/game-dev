import test from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../client/src/input.js';

// Only the DOM events consumed by Input are modeled here. Real browser
// steering/lock behavior is separately exercised by the integrated playtest.
function target() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    emit(type, props = {}) {
      for (const fn of listeners.get(type) || []) fn({ preventDefault() {}, ...props });
    }
  };
}
test('pointer-lock synchronous failure, pending warp, late grant and reset', () => {
  const prev = {window:globalThis.window, document:globalThis.document};
  const w = target(), doc = target(), canvas = target();
  globalThis.window = w;
  globalThis.document = doc;
  doc.pointerLockElement = null;
  doc.exitPointerLock = () => { doc.pointerLockElement = null; doc.emit('pointerlockchange'); };
  const input = new Input(canvas);
  input.enabled = true;
  const down = () => canvas.emit('mousedown', {button:2,clientX:10,clientY:10});
  const move = (buttons=2) => w.emit('mousemove',{buttons,movementX:20,movementY:0});
  const up = () => w.emit('mouseup',{button:2});
  try {
    canvas.requestPointerLock = () => { throw new Error('unavailable'); };
    down();move();
    assert.equal(input.lockPending,false);
    move(0);
    assert.equal(input.rmb,false);
    let requests=0;
    canvas.requestPointerLock = () => { requests++; };
    down();move();move(0);move();
    assert.equal(requests,1);
    assert.equal(input.rmb,true);
    assert.equal(input.lockPending,true);
    up();
    doc.pointerLockElement=canvas;doc.emit('pointerlockchange');
    assert.equal(doc.pointerLockElement,null,'late grant must be released');
    assert.equal(input.lockPending,false);
    down();move();
    doc.pointerLockElement=canvas;doc.emit('pointerlockchange');
    assert.equal(doc.pointerLockElement,canvas);
    move(0);move();move();
    assert.equal(input.rmb,true,'warp is not a release');
    assert.ok(input.sample().lookX>0);
    w.emit('blur');
    assert.equal(doc.pointerLockElement,null);
    assert.equal(input.rmb,false);
    assert.equal(input.sample().lookX,0);
  } finally {
    if(prev.window===undefined) delete globalThis.window; else globalThis.window=prev.window;
    if(prev.document===undefined) delete globalThis.document; else globalThis.document=prev.document;
  }
});
