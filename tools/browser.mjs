// One place that knows how to start a browser for the automated checks.
//
// Playwright is a dev dependency; its Chromium is installed separately with
// `npx playwright install chromium` (cloud sessions ship one already).
//
//   ATTUNEMENT_GPU=1        use the machine's real GPU instead of software WebGL
//   ATTUNEMENT_HEADED=1     show the browser window (needed for some GPUs)
//   ATTUNEMENT_CHROMIUM=…   path to a specific Chromium/Chrome binary

import { chromium } from 'playwright';

export const SOFTWARE_GL = process.env.ATTUNEMENT_GPU !== '1';

export async function launchBrowser() {
  const args = SOFTWARE_GL ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=default'];
  try {
    return await chromium.launch({ args, headless: process.env.ATTUNEMENT_HEADED !== '1', executablePath: process.env.ATTUNEMENT_CHROMIUM || undefined });
  } catch (err) {
    if (/Executable doesn't exist/.test(String(err.message))) {
      throw new Error(`Chromium for Playwright is not installed. Run: npx playwright install chromium\n(${String(err.message).split('\n')[0]})`);
    }
    throw err;
  }
}

/** What actually rendered: vendor/renderer strings from the page's WebGL context. */
export async function describeGraphics(page) {
  return page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return { webgl2: false };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { webgl2: true, vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR), renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), userAgent: navigator.userAgent };
  });
}

/** Correlate browser readiness to the currently attached authoritative actor. */
export async function activeBrowserPlayer(page, server, name) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const id = await page.evaluate(() => window.__attune?.state().myId);
    const player = server.game.players.get(id);
    const session = player && server.net.sessions.get(player.char.id);
    if (player?.name === name && session?.player === player && session.ws.readyState === 1) return player;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`No active authoritative player for ${name}`);
}
