// WebSocket connection with automatic reconnect. The secret character token
// lives in localStorage purely as a login credential; all game state is
// authoritative on the server.

const slot = new URLSearchParams(location.search).get('slot') || '1';
const TOKEN_KEY = `attunement.token.${slot.replace(/[^\w-]/g, '').slice(0, 16) || '1'}`;
const ACCOUNT_KEY = 'attunement.account.session';

export function loadToken() {
  try {
    const t = localStorage.getItem(TOKEN_KEY);
    return t && /^[0-9a-f]{64}$/.test(t) ? t : null;
  } catch {
    return null;
  }
}
export function saveToken(t) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: the session still works until the tab closes */
  }
}

export function loadAccountToken() {
  try {
    const t = localStorage.getItem(ACCOUNT_KEY);
    return t && /^[0-9a-f]{64}$/.test(t) ? t : null;
  } catch { return null; }
}
export function saveAccountToken(token) {
  try {
    if (token) localStorage.setItem(ACCOUNT_KEY, token);
    else localStorage.removeItem(ACCOUNT_KEY);
  } catch { /* Private-window storage can be disabled. */ }
}

// Bounded jitter prevents a group of stalled clients from retrying in lockstep.
export function reconnectDelay(attempt, random = Math.random) {
  const base = Math.min(12000, 1000 * 2 ** Math.min(Math.max(0, attempt), 4));
  return Math.min(12000, Math.round(base * (0.85 + 0.3 * random())));
}

export function reconnectEligible(state) {
  return !!(state.entered || state.pendingCreate || state.pendingAccount ||
    state.pendingGuest || state.accountToken || state.token);
}

export class Net {
  /**
   * @param {object} h handlers: onWelcome, onSnapshot, onAuthFail,
   *   onCreateFail, onStatus(text|null), onReplaced
   */
  constructor(h) {
    this.h = h;
    this.ws = null;
    this.token = loadToken();
    this.accountToken = loadAccountToken();
    this.accountLogged = false;
    this.pendingAccount = null;
    this.pendingClaim = false;
    this.pendingGuest = null;
    this.logoutPending = false;
    this.activeCharacterId = null;
    this.pendingCreate = null;
    this.entered = false;
    this.closedForGood = false;
    this.retry = null;
    this.reconnectAttempts = 0;
    this.reconnects = 0;
    this.openedAt = 0;
    this.lastSnapshotAt = 0;
    this.lastPongAt = 0;
    this.lastClose = null;
    this.diagnosticEvents = [];
    this.ping = 0;
    this.latency = null;
    setInterval(() => {
      if (this.entered && this.ws && this.ws.readyState === 1) this.send({ t: 'ping', c: performance.now() });
    }, 2000);
  }

  recordConnection(kind, details = {}) {
    // No authentication tokens, passwords, player identifiers or addresses.
    const event = { kind, at: Date.now(), ...details };
    this.diagnosticEvents.push(event);
    if (this.diagnosticEvents.length > 40) this.diagnosticEvents.shift();
    this.h.onDiagnostic?.(event);
  }

  getDiagnostics() {
    const now = performance.now();
    return {
      socketState: this.ws?.readyState ?? 3,
      connected: this.ws?.readyState === 1,
      entered: this.entered,
      reconnectAttempts: this.reconnectAttempts,
      reconnects: this.reconnects,
      latencyMs: this.latency,
      snapshotAgeMs: this.lastSnapshotAt ? Math.round(now - this.lastSnapshotAt) : null,
      pongAgeMs: this.lastPongAt ? Math.round(now - this.lastPongAt) : null,
      lastClose: this.lastClose,
      events: this.diagnosticEvents.slice(),
    };
  }

  scheduleReconnect() {
    if (this.closedForGood || !reconnectEligible(this)) return null;
    clearTimeout(this.retry);
    const delay = reconnectDelay(this.reconnectAttempts++);
    this.retry = setTimeout(() => {
      this.retry = null;
      this.connect();
    }, delay);
    this.recordConnection('retry-scheduled', { attempt: this.reconnectAttempts, delayMs: delay });
    return delay;
  }

  url() {
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  }

  /** Open a socket and authenticate with the token or a pending creation. */
  connect() {
    clearTimeout(this.retry);
    if (this.closedForGood || this.ws) return;
    let ws;
    try { ws = new WebSocket(this.url()); }
    catch {
      this.recordConnection('socket-construction-failed');
      this.h.onStatus('Unable to open connection. Retrying…');
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.openedAt = performance.now();
      this.recordConnection('socket-open');
      if (this.pendingGuest) this.send({ t: 'resume', token: this.pendingGuest });
      else if (this.pendingAccount) this.send(this.pendingAccount);
      else if (this.accountToken) this.send({ t: 'account_resume', token: this.accountToken });
      else if (this.pendingCreate) this.send({ t: 'create', ...this.pendingCreate });
      else if (this.token) this.send({ t: 'resume', token: this.token });
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      let m;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      switch (m.t) {
        case 's':
          this.lastSnapshotAt = performance.now();
          this.h.onSnapshot(m);
          break;
        case 'welcome':
          this.activeCharacterId = this.accountLogged ? (m.charId || null) : null;
          if (m.token || this.pendingGuest) {
            this.token = m.token || this.pendingGuest;
            saveToken(this.token);
          }
          this.pendingGuest = null;
          this.pendingCreate = null;
          this.entered = true;
          if (this.reconnectAttempts) this.reconnects++;
          this.reconnectAttempts = 0;
          this.recordConnection('world-welcome');
          this.h.onStatus(null);
          this.h.onWelcome(m);
          break;
        case 'account_ready':
          if (m.token) {
            this.accountToken = m.token;
            saveAccountToken(m.token);
          }
          this.accountLogged = true;
          if (this.reconnectAttempts) this.reconnects++;
          this.reconnectAttempts = 0;
          this.recordConnection('account-ready');
          this.pendingAccount = null;
          this.entered = false;
          this.h.onStatus(null);
          if (this.pendingClaim) {
            this.pendingClaim = false;
            this.token = null;
            saveToken(null);
          }
          if (this.activeCharacterId) this.send({ t: 'account_select', id: this.activeCharacterId });
          else this.h.onAccountReady(m);
          break;
        case 'account_fail':
          this.pendingAccount = null;
          this.pendingClaim = false;
          if (/session expired/i.test(m.reason || '')) {
            this.accountToken = null;
            this.accountLogged = false;
            this.activeCharacterId = null;
            this.entered = false;
            saveAccountToken(null);
          }
          this.h.onAccountFail(m.reason);
          break;
        case 'account_logged_out':
          this.finishSignOut();
          break;
        case 'auth_fail':
          // A mistyped recovery key must not erase a different valid saved guest.
          if (!this.pendingGuest || this.pendingGuest === this.token) {
            this.token = null;
            saveToken(null);
          }
          this.pendingGuest = null;
          this.entered = false;
          this.h.onAuthFail(m.reason);
          break;
        case 'create_fail':
          this.pendingCreate = null;
          this.h.onCreateFail(m.reason);
          break;
        case 'pong':
          if (!Number.isFinite(m.c)) break;
          this.lastPongAt = performance.now();
          this.latency = Math.round(this.lastPongAt - m.c);
          break;
        default:
          break;
      }
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.latency = null; // A cached last-good RTT is not current connectivity.
      this.lastClose = {
        code: ev.code,
        reason: String(ev.reason || '').slice(0, 96),
        wasClean: !!ev.wasClean,
        openForMs: this.openedAt ? Math.round(performance.now() - this.openedAt) : null,
        snapshotAgeMs: this.lastSnapshotAt ? Math.round(performance.now() - this.lastSnapshotAt) : null,
      };
      this.recordConnection('socket-close', this.lastClose);
      if (this.logoutPending) {
        this.finishSignOut();
        return;
      }
      if (ev.code === 4001) {
        this.closedForGood = true;
        this.h.onReplaced();
        return;
      }
      const delay = this.scheduleReconnect();
      if (delay !== null) {
        const why = ev.code === 4002 ? 'Disconnected for sending too much traffic.' : ev.code === 4003 ? 'The world is full.' : 'Connection lost.';
        this.h.onStatus(`${why} Code ${ev.code}; reconnecting in ${(delay / 1000).toFixed(1)}s…`);
      }
    };
    ws.onerror = () => {
      if (this.ws === ws) this.recordConnection('socket-error');
    };
  }

  create(name, cls, look, appearance) {
    if (this.accountLogged) {
      this.send({ t: 'account_create_character', name, cls, look, appearance });
      return;
    }
    this.pendingCreate = { name, cls, look, appearance };
    if (this.ws && this.ws.readyState === 1) this.send({ t: 'create', name, cls, look, appearance });
    else if (!this.ws) this.connect();
  }

  resumeGuest(token) {
    if (this.accountLogged || !/^[0-9a-f]{64}$/.test(token || '')) return false;
    this.pendingAccount = null;
    this.pendingCreate = null;
    this.pendingGuest = token;
    const old = this.ws;
    this.ws = null;
    if (old) old.close(1000, 'guest recovery');
    this.connect();
    return true;
  }

  accountAuth(handle, password, register = false) {
    this.pendingGuest = null;
    this.pendingAccount = { t: register ? 'account_register' : 'account_login', handle, password };
    if (this.ws && this.ws.readyState === 1) this.send(this.pendingAccount);
    else this.connect();
  }

  selectCharacter(id) { this.send({ t: 'account_select', id }); }
  deleteCharacter(id, confirmName) { this.send({ t: 'account_delete_character', id, confirmName }); }
  claimLegacy(token) {
    if (!this.accountLogged || !/^[0-9a-f]{64}$/.test(token)) return false;
    this.pendingClaim = token === this.token;
    this.send({ t: 'account_claim_character', token });
    return true;
  }

  leaveWorld() {
    this.activeCharacterId = null;
    this.entered = false;
    if (this.accountLogged) this.send({ t: 'account_leave' });
    else {
      const ws = this.ws;
      this.ws = null;
      if (ws) ws.close(1000, 'character selection');
    }
  }

  signOut() {
    if (this.accountLogged && this.ws?.readyState === 1) {
      // Let the server revoke the bearer session before closing the socket.
      this.logoutPending = true;
      this.send({ t: 'account_logout' });
      return;
    }
    this.finishSignOut();
  }

  finishSignOut() {
    this.logoutPending = false;
    this.accountLogged = false;
    this.entered = false;
    this.activeCharacterId = null;
    this.pendingAccount = null;
    this.accountToken = null;
    saveAccountToken(null);
    const ws = this.ws;
    this.ws = null;
    if (ws) ws.close(1000, 'signed out');
    this.h.onAccountLoggedOut();
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }
}
