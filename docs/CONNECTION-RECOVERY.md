# Attunement: connection and browser-stall diagnostics

Connection recovery is automatic for active worlds, pending character creation,
account sign-in and guest recovery. Retries use bounded exponential backoff
(about 1–12 seconds) with jitter. The game continues to use server-authoritative
state and deliberately does not queue gameplay commands across a disconnect.

## Reproduce on the affected desktop

1. Start the game normally with `npm start` and open the local address.
2. Append `?netdiag=1` to the URL (or `&netdiag=1` when a query exists).
   The DevTools console records only transport events and aggregate timing.
   Preserve the console log and capture a Chrome/Edge Performance trace while
   reproducing the stall. Never publish local account tokens or character saves.
3. Evaluate `window.__attune.state().network` for socket close codes,
   reconnects and stale snapshot/pong age. Evaluate
   `window.__attune.state().diagnostics` for long-task, frame, snapshot,
   rendering and world-reset timings. The snapshots contain no bearer tokens.
4. Compare the same location and movement at normal quality and
   `?q=0&qlock=1&netdiag=1`. Keep resolution and scene consistent.
5. Review the Node console for `[net] socket-closed` (server termination
   cause, buffer size, missed pongs) and `[perf] slow-server-tick` or
   `[perf] slow-save`. Correlate timestamps with the browser trace.

The `[net]` close cause is established only when the server initiates a
termination. `remote-or-transport` does not by itself identify a root cause.
A low last-good ping is not proof of current connectivity; RTT is cleared
on socket close. Browser frames and network connectivity are separate
measurements.

## Focused regression

Run `npm test` for deterministic retry, account/guest recovery and server
backpressure tests. Run `node test/e2e/network-health.mjs` for the Chromium
reconnection and browser-long-task fixture; Playwright Chromium must be
installed. CI also runs the normal integrated playtest.

The fixture intentionally terminates its own local test socket and runs a
synthetic browser long task. This proves the recovery path and observability,
not the root cause of an owner's real-world 4 FPS stall. Determine that from
the affected machine's Performance trace before attempting renderer rewrites
or raising server backpressure/heartbeat limits.
