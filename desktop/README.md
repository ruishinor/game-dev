# Attunement Windows desktop (owner-only local playtest)

This is a thin Electron shell around the current Three.js game and authoritative Node server.
It is **not** a public client build. The authoritative server source is inside the
executable; do not distribute it to players or publish a release asset. A separate
remote-server client packaging model is required before public/Steam distribution.

## Windows PowerShell, from the repository root

\`\`\`powershell
git status --short
npm ci
npm install --prefix desktop --no-audit --no-fund
node desktop/prepare.mjs
& ".\desktop\node_modules\.bin\electron.cmd" .
& ".\desktop\node_modules\.bin\electron-builder.cmd" --win portable --config desktop/builder.json
\`\`\`

The portable executable appears in \`dist/desktop/\`. It has no auto-update, code
signing, or installer privileges. Windows SmartScreen may warn about unsigned builds.

The preparation step requires the owner's approved source archive *on the build
machine* and the nine existing finalized pipeline GLB outputs. It extracts/validates
three additional runtime models, and fails if any required runtime output is missing.
**Only resulting runtime GLBs** are staged into \`dist/desktop-runtime/\`; neither
the source ZIP nor editable Blender projects are packaged.

The packaged game runs a local-only server on a random 127.0.0.1 port. The
desktop window has no Node integration, no IPC preload and no external navigation.
HTTP Host and WebSocket Origin/Host checks apply in desktop mode. This is a
local, independent world, **not** the existing shared Cloudflare playtest server.
Never connect a client-only release to this bundled trusted server design.

Saves: \`%APPDATA%\Attunement\saves\characters.json\`
Logs: \`%APPDATA%\Attunement\logs\desktop.log\`

**Existing browser progress is not migrated automatically.** Import an old guest
via its recovery key, or first back up existing data and deliberately migrate
the relevant authoritative world store. Never overwrite either store as a
side effect of installing or updating the desktop app.

F11 toggles fullscreen. The UI is otherwise unchanged.

## Required release checks

1. Generate the runtime models and inspect build inputs; ensure archives and
   source art are excluded. Verify no proprietary server bundles are published.
2. Build on Windows x64, inspect the actual portable package contents and
   check that every required GLB and JS/CSS/HTML asset loads (no 404s).
3. Launch offline; create, exit, relaunch and recover a character. Inspect save
   and log paths and verify graceful shutdown. Test two local clients.
4. Check localhost Host rejection and cross-origin WebSocket rejection.
5. Compare hardware-rendered browser vs desktop frame times and crashes at
   identical settings, including 1280×800, 1920×1080 and 2560×1440.
6. Verify F11, Escape, chat focus, pointer lock, input bindings, screen reader
   labels and UI scaling. Do not claim the wrapper fixes GPU stalls.
7. Generate and commit a \`desktop/package-lock.json\` before a reproducible CI
   or external release, replacing \`npm install\` above with \`npm ci --prefix desktop\`.
   A clean Windows build and exact-head CI are still required.
