import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'desktop', 'builder.json'), 'utf8'));

test('desktop package uses runtime-only asset staging, not development archives', () => {
  const includes = config.files.filter((entry) => !entry.startsWith('!'));
  assert.ok(includes.includes('client/**/*'));
  assert.ok(includes.includes('server/**/*'));
  assert.ok(includes.includes('shared/**/*'));
  assert.ok(!includes.some((entry) => entry.startsWith('assets/') || entry.startsWith('test/') ||
    entry.startsWith('docs/') || entry.startsWith('tools/asset-pipeline/')));
  assert.deepEqual(config.extraResources, [
    { from: 'dist/desktop-runtime', to: 'runtime-models', filter: ['**/*.glb'] },
  ]);
  assert.ok(config.files.includes('!**/*.zip'));
});

function request(port, host) {
  return new Promise((resolve, reject) => {
    http.get({
      host: '127.0.0.1', port, path: '/', headers: { Host: host },
    }, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    }).on('error', reject);
  });
}

function socketResult(port, origin) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket('ws://127.0.0.1:' + port + '/ws', { origin });
    socket.once('open', () => {
      socket.terminate();
      resolve('open');
    });
    socket.once('unexpected-response', (_req, response) => {
      const code = response.statusCode;
      response.resume();
      resolve(code);
    });
    socket.once('error', reject);
  });
}

test('packaged runtime uses staged assets and rejects forged Host and WebSocket Origin', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'attunement-desktop-test-'));
  // Dummy files are enough here: this test checks routing and trust boundaries, not GLB decoding.
  for (const name of ['depths-recovery-cache.glb', 'sanctum-warden-carbine.glb',
    'sanctum-warden-marksman.glb', 'stillpoint.glb', 'severance_gate.glb',
    'severance_kit.glb', 'outpost_shelter.glb', 'salvage_camp.glb',
    'resonant_vein.glb', 'sanctum_arch.glb', 'phase_scar.glb', 'foundry_kit.glb']) {
    fs.writeFileSync(path.join(dir, name), Buffer.alloc(28));
  }
  process.env.ATTUNEMENT_DESKTOP_RUNTIME_DIR = dir;
  let server;
  try {
    // Isolated node:test file process; set the staged asset path before importing.
    const { startServer } = await import('../server/index.js');
    server = await startServer({ port: 0, host: '127.0.0.1', dataFile: null, desktopLocal: true });
    const host = '127.0.0.1:' + server.port;
    assert.equal(await request(server.port, host), 200);
    assert.equal(await request(server.port, 'attacker.example'), 403);
    // ws synchronous verifyClient rejection is HTTP 401 by default.
    assert.equal(await socketResult(server.port, 'https://attacker.example'), 401);
    assert.equal(await socketResult(server.port, 'http://' + host), 'open');

    const assetResponse = await fetch('http://' + host + '/client/assets/phase_scar.glb');
    assert.equal(assetResponse.status, 200);
    assert.equal(assetResponse.headers.get('content-type'), 'model/gltf-binary');
    await assetResponse.arrayBuffer();

    const sourceResponse = await fetch('http://' + host + '/assets/source-archives/glb-low-poly-models-building-blocks.zip');
    assert.equal(sourceResponse.status, 404);
    const pipelineResponse = await fetch('http://' + host + '/tools/asset-pipeline/assets/phase_scar/outputs/phase_scar.glb');
    assert.equal(pipelineResponse.status, 404);
  } finally {
    if (server) await server.close();
    delete process.env.ATTUNEMENT_DESKTOP_RUNTIME_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
