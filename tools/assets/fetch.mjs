// Download the third-party source packs listed in assets/sources.json into
// .asset-cache/ and unpack them. Every file is checked against the SHA-256
// recorded in the ledger; a mismatch aborts, so a changed upstream file can
// never slip into a build unnoticed. Re-running skips files already present.
//
//   npm run assets:fetch

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CACHE = path.join(ROOT, '.asset-cache');
export const LEDGER = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sources.json'), 'utf8'));

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** Every {id, url, file, bytes, sha256, unpack} the ledger asks for. */
export function ledgerFiles() {
  const out = [];
  for (const s of LEDGER.sources) {
    if (s.files) for (const f of s.files) out.push({ id: s.id, ...f });
    else out.push({ id: s.id, url: s.url, file: s.file, bytes: s.bytes, sha256: s.sha256, unpack: s.unpack });
  }
  return out;
}

async function download(url, dest) {
  const tmp = `${dest}.part`;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  } catch (err) {
    // Node's fetch ignores proxy settings on older runtimes; curl honours them.
    console.log(`  fetch failed (${err.cause?.code || err.message}); retrying with curl`);
    execFileSync('curl', ['-fsSL', '--retry', '3', '-o', tmp, url], { stdio: 'inherit' });
  }
  fs.renameSync(tmp, dest);
}

function unpackZip(zipFile, destDir) {
  const files = unzipSync(new Uint8Array(fs.readFileSync(zipFile)));
  let count = 0;
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith('/')) continue;
    const target = path.resolve(destDir, name);
    // Never write outside the unpack directory, whatever the archive says.
    if (!target.startsWith(destDir + path.sep)) throw new Error(`unsafe path in archive: ${name}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
    count++;
  }
  return count;
}

export async function fetchAll({ log = console.log, sourceIds = null } = {}) {
  for (const f of ledgerFiles()) {
    if (sourceIds && !sourceIds.has(f.id)) continue;
    const dir = path.join(CACHE, f.id);
    const dest = path.join(dir, f.file);
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(dest)) {
      log(`downloading ${f.id}/${f.file} (${(f.bytes / 1e6).toFixed(1)} MB)`);
      await download(f.url, dest);
    }
    const got = sha256(dest);
    if (got !== f.sha256) {
      throw new Error(`${f.id}/${f.file}: SHA-256 ${got} does not match the ledger (${f.sha256}). Delete the file and investigate before updating assets/sources.json.`);
    }
    if (f.unpack === 'zip') {
      const out = path.join(dir, 'x');
      const stamp = path.join(dir, '.unpacked');
      if (!fs.existsSync(stamp) || fs.readFileSync(stamp, 'utf8') !== f.sha256) {
        fs.rmSync(out, { recursive: true, force: true });
        fs.mkdirSync(out, { recursive: true });
        const n = unpackZip(dest, out);
        fs.writeFileSync(stamp, f.sha256);
        log(`unpacked ${f.id}: ${n} files`);
      }
    }
    log(`ok ${f.id}/${f.file}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fetchAll().catch((err) => {
    console.error(`assets:fetch failed: ${err.message}`);
    process.exit(1);
  });
}
