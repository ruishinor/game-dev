// Browser-level recovery fixture: deliberately stall the main thread, terminate
// a local test socket, and exercise server snapshot backpressure. Never send
// synthetic actions or bypass authentication in the production client.
import assert from 'node:assert/strict';
import { startServer } from '../../server/index.js';
import { launchBrowser, SOFTWARE_GL } from '../../tools/browser.mjs';

const srv = await startServer({ port: 0, dataFile: null });
let browser;
try {
  browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(90000);
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  const query = 'q=0&nolock=1&netdiag=1' + (SOFTWARE_GL ? '&rfps=1' : '');
  await page.goto('http://127.0.0.1:' + srv.port + '/?' + query);
  await page.waitForFunction(() => !!window.__attune, null, { timeout: 120000 });
  await page.click('#gate-guest-link');
  await page.fill('#name', 'Connection Audit');
  await page.click('.classcard[data-cls="keeper"]');
  await page.click('#enter');
  await page.waitForFunction(() => {
    const s = window.__attune?.state();
    return s?.myId && s?.sheet?.name === 'Connection Audit' && s.snaps > 1;
  }, null, { timeout: 90000 });

  const initial = await page.evaluate(() => ({
    network: window.__attune.state().network,
    diagnostics: window.__attune.state().diagnostics,
  }));
  assert.equal(initial.network.connected, true, 'initial guest connection healthy');
  assert.equal(initial.diagnostics.enabled, true, 'opt-in diagnostics active');

  // A controlled long task captures scheduling pressure independently of
  // whether the browser's WebSocket implementation loses its transport.
  await page.evaluate(() => {
    const start = performance.now();
    while (performance.now() - start < 300) { /* synthetic main-thread stall */ }
  });
  await page.waitForFunction(() =>
    window.__attune.state().diagnostics.stats.longestLongTaskMs >= 200,
    null, { timeout: 20000 });
  console.log('PASS  main-thread stall appears in browser diagnostics');

  function currentServerConnection(id) {
    const actor = srv.game.players.get(id);
    assert.ok(actor, 'player exists on authoritative server');
    const conn = srv.net.sessions.get(actor.char.id);
    assert.equal(conn?.player, actor, 'connection owns current live player');
    return conn;
  }
  const id1 = await page.evaluate(() => window.__attune.state().myId);
  const first = currentServerConnection(id1);
  first.closeCause = 'synthetic-test-drop';
  first.ws.terminate();
  await page.waitForFunction(() => {
    const s = window.__attune.state();
    return s.network.connected && s.network.reconnects >= 1 &&
      s.snaps > 1 && s.sheet?.name === 'Connection Audit' &&
      document.getElementById('status').hidden;
  }, null, { timeout: 90000 });
  console.log('PASS  abnormal closure recovers a guest and authoritative state');

  const id2 = await page.evaluate(() => window.__attune.state().myId);
  const second = currentServerConnection(id2);
  // A deterministic synthetic backlog; no real multi-megabyte traffic or
  // unbounded queue needed. The server must not weaken its protective cap.
  Object.defineProperty(second.ws, 'bufferedAmount', {
    configurable: true, value: 600000,
  });
  second.stalledSince = performance.now() - 6000;
  srv.net.broadcast();
  assert.equal(second.closeCause, 'snapshot-backpressure');
  await page.waitForFunction(() => {
    const s = window.__attune.state();
    return s.network.connected && s.network.reconnects >= 2 &&
      s.snaps > 1 && s.sheet?.name === 'Connection Audit';
  }, null, { timeout: 90000 });
  console.log('PASS  backpressure disconnect recovers without losing the character');

  const final = await page.evaluate(() => {
    const s = window.__attune.state();
    return { network: s.network, diagnostics: s.diagnostics };
  });
  assert.equal(final.network.latencyMs === null || final.network.latencyMs >= 0, true);
  assert.ok(final.network.events.some((event) => event.kind === 'socket-close'));
  assert.ok(final.diagnostics.events.some((event) => event.kind === 'world-reset' && event.reconnecting));
  assert.deepEqual(errors, [], 'no unhandled page exceptions');
  console.log('PASS  diagnostics record bounded recovery evidence');
} finally {
  if (browser) await browser.close();
  await srv.close();
}
