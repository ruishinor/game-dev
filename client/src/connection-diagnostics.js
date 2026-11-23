// Opt-in, bounded, read-only diagnostics for browser stalling and reconnects.
// No credentials, character data, addresses or simulation payloads are retained.
export function createGameDiagnostics(enabled, {
  now = () => performance.now(),
  logger = (...args) => console.info(...args),
  Observer = globalThis.PerformanceObserver,
} = {}) {
  const events = [];
  const stats = {
    longestFrameGapMs: 0, slowFrames: 0, longestWorkMs: 0,
    longestRenderMs: 0, longestSnapshotMs: 0, longestWorldResetMs: 0,
    longTasks: 0, longestLongTaskMs: 0,
  };
  let lastFrameLog = -Infinity;
  const round = (n) => Math.round(n * 10) / 10;

  function record(kind, details = {}) {
    if (!enabled) return;
    const event = { kind, atMs: Math.round(now()), ...details };
    events.push(event);
    if (events.length > 60) events.shift();
    logger('[attunement:diag]', JSON.stringify(event));
  }

  function frame(gapMs, workMs, renderMs) {
    if (!enabled) return;
    stats.longestFrameGapMs = Math.max(stats.longestFrameGapMs, round(gapMs));
    stats.longestWorkMs = Math.max(stats.longestWorkMs, round(workMs));
    stats.longestRenderMs = Math.max(stats.longestRenderMs, round(renderMs));
    if (gapMs > 180 || workMs > 100 || renderMs > 65) {
      stats.slowFrames++;
      const at = now();
      if (at - lastFrameLog >= 1500) {
        lastFrameLog = at;
        record('slow-frame', { gapMs: round(gapMs), workMs: round(workMs), renderMs: round(renderMs) });
      }
    }
  }

  function snapshot(elapsedMs, entities) {
    if (!enabled) return;
    stats.longestSnapshotMs = Math.max(stats.longestSnapshotMs, round(elapsedMs));
    if (elapsedMs > 80) record('slow-snapshot', { elapsedMs: round(elapsedMs), entities });
  }

  function worldReset(elapsedMs, entities, reconnecting) {
    if (!enabled) return;
    stats.longestWorldResetMs = Math.max(stats.longestWorldResetMs, round(elapsedMs));
    record('world-reset', { elapsedMs: round(elapsedMs), entities, reconnecting });
  }

  function observeLongTasks() {
    if (!enabled || !Observer) return;
    try {
      const observer = new Observer((list) => {
        for (const entry of list.getEntries()) {
          stats.longTasks++;
          stats.longestLongTaskMs = Math.max(stats.longestLongTaskMs, round(entry.duration));
          if (entry.duration >= 100) record('main-thread-long-task', { durationMs: round(entry.duration) });
        }
      });
      observer.observe({ type: 'longtask', buffered: true });
      return () => observer.disconnect();
    } catch {
      // Some browsers do not implement the Long Tasks API.
    }
  }

  function get() {
    return { enabled, stats: { ...stats }, events: events.slice() };
  }

  return { record, frame, snapshot, worldReset, observeLongTasks, get };
}
