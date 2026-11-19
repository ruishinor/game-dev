// Load a pipeline GLB in the real three.js runtime (client/pipeline-preview.html,
// served by the game server), step clips deterministically and capture screenshots.
//
//   node tools/asset-pipeline/js/preview-capture.mjs <assetId> <outDir> [clip:seconds ...]
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from '../../../server/index.js';
import { launchBrowser, describeGraphics } from '../../browser.mjs';

const [id, outDir, ...shots] = process.argv.slice(2);
if (!id || !outDir) {
  console.error('usage: preview-capture.mjs <assetId> <outDir> [clip:seconds[:yaw[:pitch]] ...]');
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });
const srv = await startServer({ port: 0, dataFile: null });
const browser = await launchBrowser();
const report = { asset: id, shots: [], consoleErrors: [], pageErrors: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 960 }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => report.pageErrors.push(String(e.message)));
  const failed = [];
  page.on('requestfailed', (r) => failed.push(r.url()));
  await page.goto(`http://127.0.0.1:${srv.port}/client/pipeline-preview.html?asset=${encodeURIComponent(id)}`);
  await page.waitForFunction(() => window.__pipelinePreview?.state.ready || window.__pipelinePreview?.state.error, null, { timeout: 120000 });
  report.state = await page.evaluate(() => ({ ...window.__pipelinePreview.state }));
  if (report.state.error) throw new Error(report.state.error);
  report.graphics = await describeGraphics(page);
  const glbReq = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.name.includes('/pipeline-assets/') && e.name.endsWith('.glb')).map((e) => ({ url: e.name, bytes: e.transferSize || e.encodedBodySize, ms: Math.round(e.duration) })));
  report.glbRequests = glbReq;
  report.failedRequests = failed;
  for (const spec of shots.length ? shots : ['Idle:0', 'Walk:0.4', 'Walk:1.2']) {
    const [clip, t, yaw, pitch] = spec.split(':');
    const st = await page.evaluate(([c, tt, y, p]) => {
      if (y) document.getElementById('yaw').value = y;
      if (p) document.getElementById('pitch').value = p;
      window.__pipelinePreview.setClip(c);
      return { ...window.__pipelinePreview.setTime(Number(tt)) };
    }, [clip, t, yaw, pitch]);
    const file = path.join(outDir, `runtime_${clip}_${t}${yaw ? '_y' + yaw : ''}.png`);
    await page.locator('#view').screenshot({ path: file });
    report.shots.push({ file, clip, t: Number(t), stateClip: st.clip });
  }
} finally {
  await browser.close();
  await srv.close();
}
fs.writeFileSync(path.join(outDir, 'runtime-report.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ shots: report.shots.length, errors: report.consoleErrors.length + report.pageErrors.length, state: report.state }, null, 1));
if (report.consoleErrors.length || report.pageErrors.length) process.exit(1);
