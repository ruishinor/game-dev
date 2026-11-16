// WebSocket connection with automatic reconnect. The secret character token
// lives in localStorage purely as a login credential; all game state is
// authoritative on the server.

const slot = new URLSearchParams(location.search).get('slot') || '1';
const TOKEN_KEY = `attunement.token.${slot.replace(/[^\w-]/g, '').slice(0, 16) || '1'}`;

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

export class Net {
  /**
   * @param {object} h handlers: onWelcome, onSnapshot, onAuthFail,
   *   onCreateFail, onStatus(text|null), onReplaced
   */
  constructor(h) {
    this.h = h;
    this.ws = null;
    this.token = loadToken();
    this.pendingCreate = null;
    this.entered = false;
    this.closedForGood = false;
    this.retry = null;
    this.ping = 0;
    this.latency = null;
    setInterval(() => {
      if (this.entered && this.ws && this.ws.readyState === 1) this.send({ t: 'ping', c: performance.now() });
    }, 2000);
  }

  url() {
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  }

  /** Open a socket and authenticate with the token or a pending creation. */
  connect() {
    clearTimeout(this.retry);
    if (this.closedForGood) return;
    const ws = new WebSocket(this.url());
    this.ws = ws;
    ws.onopen = () => {
      if (this.pendingCreate) this.send({ t: 'create', ...this.pendingCreate });
      else if (this.token) this.send({ t: 'resume', token: this.token });
    };
    ws.onmessage = (ev) => {
      let m;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      switch (m.t) {
        case 's':
          this.h.onSnapshot(m);
          break;
        case 'welcome':
          if (m.token) {
            this.token = m.token;
            saveToken(m.token);
          }
          this.pendingCreate = null;
          this.entered = true;
          this.h.onStatus(null);
          this.h.onWelcome(m);
          break;
        case 'auth_fail':
          this.token = null;
          saveToken(null);
          this.entered = false;
          this.h.onAuthFail(m.reason);
          break;
        case 'create_fail':
          this.pendingCreate = null;
          this.h.onCreateFail(m.reason);
          break;
        case 'pong':
          this.latency = Math.round(performance.now() - m.c);
          break;
        default:
          break;
      }
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (ev.code === 4001) {
        this.closedForGood = true;
        this.h.onReplaced();
        return;
      }
      if (this.entered || this.pendingCreate) {
        const why = ev.code === 4002 ? 'Disconnected for sending too much traffic.' : ev.code === 4003 ? 'The world is full.' : 'Connection lost.';
        this.h.onStatus(`${why} Reconnecting…`);
        this.retry = setTimeout(() => this.connect(), 2000);
      }
    };
    ws.onerror = () => {};
  }

  create(name, cls, look) {
    this.pendingCreate = { name, cls, look };
    if (this.ws && this.ws.readyState === 1) this.send({ t: 'create', name, cls, look });
    else if (!this.ws) this.connect();
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }
}
