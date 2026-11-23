import test from 'node:test';
import assert from 'node:assert/strict';

// The browser module reads the query slot once at import. No network or DOM
// is used by these client retry tests.
const originalLocation = globalThis.location;
globalThis.location = { search: '' };
const { Net, reconnectDelay, reconnectEligible } = await import('../client/src/net.js');
if (originalLocation === undefined) delete globalThis.location;
else globalThis.location = originalLocation;

function withFakeBrowser(run) {
  const old = {
    location: globalThis.location, localStorage: globalThis.localStorage,
    WebSocket: globalThis.WebSocket, setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout, setInterval: globalThis.setInterval,
  };
  const sockets = [], timers = [], saved = new Map(), events = [], statuses = [];
  class FakeSocket {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; sockets.push(this); }
    send(body) { this.sent.push(JSON.parse(body)); }
    open() { this.readyState = 1; this.onopen?.(); }
    drop(code = 1006) {
      this.readyState = 3;
      this.onclose?.({ code, reason: '', wasClean: code === 1000 });
    }
    close(code = 1000) { this.drop(code); }
  }
  globalThis.location = { search: '', protocol: 'http:', host: '127.0.0.1:8080' };
  globalThis.localStorage = {
    getItem: (k) => saved.get(k) || null,
    setItem: (k, v) => saved.set(k, v),
    removeItem: (k) => saved.delete(k),
  };
  globalThis.WebSocket = FakeSocket;
  globalThis.setTimeout = (fn, ms) => {
    const timer = { fn, ms, cancelled: false };
    timers.push(timer);
    return timer;
  };
  globalThis.clearTimeout = (timer) => { if (timer) timer.cancelled = true; };
  globalThis.setInterval = () => ({});
  const handlers = {
    onStatus: (text) => statuses.push(text),
    onDiagnostic: (event) => events.push(event),
    onWelcome: () => {},
    onAccountReady: () => {},
    onAuthFail: () => {},
    onAccountFail: () => {},
    onCreateFail: () => {},
    onAccountLoggedOut: () => {},
    onReplaced: () => {},
  };
  try { return run({ sockets, timers, saved, events, statuses, handlers }); }
  finally {
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
}

test('reconnection delay has bounded jitter and a capped exponential backoff', () => {
  assert.equal(reconnectDelay(0, () => 0), 850);
  assert.equal(reconnectDelay(1, () => 0.5), 2000);
  assert.equal(reconnectDelay(3, () => 1), 9200);
  assert.equal(reconnectDelay(25, () => 1), 12000);
  assert.equal(reconnectDelay(-2, () => 0), 850);
});

test('pending account sign-in survives socket loss and retries its original intent', () =>
  withFakeBrowser(({ sockets, timers, events, statuses, handlers }) => {
    const net = new Net(handlers);
    net.accountAuth('Example', 'unused-secret');
    assert.equal(sockets.length, 1);
    sockets[0].open();
    assert.equal(sockets[0].sent[0].t, 'account_login');
    sockets[0].drop();
    assert.equal(net.getDiagnostics().latencyMs, null);
    assert.equal(net.lastClose.code, 1006);
    assert.ok(reconnectEligible(net));
    assert.equal(timers.length, 1);
    assert.ok(timers[0].ms >= 850 && timers[0].ms <= 1150);
    assert.match(statuses.at(-1), /Code 1006/);
    timers[0].fn();
    sockets[1].open();
    assert.deepEqual(sockets[1].sent[0], sockets[0].sent[0]);
    sockets[1].onmessage({ data: JSON.stringify({ t: 'account_ready', token: 'f'.repeat(64) }) });
    assert.equal(net.reconnectAttempts, 0);
    assert.equal(net.reconnects, 1);
    assert.ok(events.some((event) => event.kind === 'retry-scheduled'));
    assert.ok(events.every((event) => !JSON.stringify(event).includes('unused-secret')));
  }));

test('pending guest recovery retries; session replacement is never retried', () =>
  withFakeBrowser(({ sockets, timers, handlers }) => {
    const net = new Net(handlers);
    const guestKey = 'a'.repeat(64);
    assert.equal(net.resumeGuest(guestKey), true);
    sockets[0].open();
    assert.equal(sockets[0].sent[0].t, 'resume');
    sockets[0].drop();
    assert.equal(timers.length, 1);
    timers[0].fn();
    sockets[1].open();
    assert.deepEqual(sockets[1].sent[0], { t: 'resume', token: guestKey });
    sockets[1].onmessage({ data: JSON.stringify({ t: 'welcome', id: 3, charId: 'fixture' }) });
    assert.equal(net.entered, true);
    assert.equal(net.reconnects, 1);
    sockets[1].drop(4001);
    assert.equal(net.closedForGood, true);
    assert.equal(timers.length, 1);
    assert.equal(net.getDiagnostics().latencyMs, null);
  }));
