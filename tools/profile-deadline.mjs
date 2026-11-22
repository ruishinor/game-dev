// Host-side timeout for browser work, including unresponsive page.evaluate calls.
// The caller remains responsible for terminating an unresponsive browser process.
export async function withDeadline(label, operation, ms, log = console.log) {
  if (!Number.isFinite(ms) || ms <= 0) throw new RangeError('Deadline must be a positive finite number');
  const start = Date.now();
  log(`[profile] ${label}: start`);
  let timer;
  try {
    const value = await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Profile deadline exceeded: ${label} (${ms} ms)`)), ms);
      }),
    ]);
    log(`[profile] ${label}: complete (${Date.now() - start} ms)`);
    return value;
  } catch (err) {
    log(`[profile] ${label}: failed (${Date.now() - start} ms): ${String(err)}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
