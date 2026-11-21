# Owner-only GM preview — independent main-branch increment

GM preview modifies **only the authenticated owner's active character**. There is no separate admin login, default privilege, client flag, script execution, account administration, inventory manipulation or other-player control. Privilege is disabled unless the server process has an explicit account UUID allowlist. Keep this setting private. Browser-delivered code contains only the ordinary command entry point; privileged logic is server-only.

## Local PowerShell setup

1. Run the ordinary account registration/sign-in and create a character. Stop the local server to flush the save.
2. From the repository root, inspect the local account IDs (not tokens):

    $accounts = (Get-Content .\data\characters.json -Raw | ConvertFrom-Json).accounts
    $accounts | Select-Object handle,id

3. Set the actual UUID in the **server** process environment, not the browser:

    $env:ATTUNEMENT_GM_ACCOUNT_IDS = '<your-account-uuid>'
    npm start

Multiple UUIDs may be comma-separated, but prefer one owner account. Use normal sign-in credentials, enter a character, open chat and run /gm help. To turn off privilege for a new server process:

    Remove-Item Env:\ATTUNEMENT_GM_ACCOUNT_IDS

Hosted deployment: set this key only in private server configuration, do not commit IDs, tokens, passwords or local save files. Require TLS/WSS and restrict operational access. Changing the environment requires restarting the server; existing sessions are independently checked for revocation.

## Supported commands on current main

- /gm help and /gm status
- /gm level N, where N is a decimal integer from 1 through the current server MAX_LEVEL (currently 5 on the starting main); resets XP and refreshes derived stats
- /gm tp reach|scar|sporefield|relay|sinter|annex; validated named main-branch locations, no arbitrary coordinates
- /gm heal; restores health of a living character
- /gm god on|off; incoming damage immunity on the *live player entity only*, never stored
- /gm unlock; sets existing Resonance attunement and Phase Scar calibration to completed on that character (idempotent)

Level and unlock are **persisted** and bypass normal progression; use a dedicated preview character. Teleport uses the existing authoritative transfer and collision code. Annex teleport is for isolated scene inspection and does **not** initiate its shared encounter. Reconnect from the disconnected Annex region returns to the Reach under the existing save contract. Other supported Reach teleports do not open world content.

## Deferred from stacked PR #194

Level 6–15 commands remain unsupported until separately merged authoritative progression. No Expanse, Outpost, Scrapyard, Gate, Foundry or Depths teleport is registered in this independent increment. No shared encounter is opened merely to inspect a scene; future environment-specific GM features require separate integration and tests. Do not merge #194's historical parent tree to obtain these commands.

## Authorization, auditing and limitations

Each privileged message must be on an active, token-authenticated account socket; the allowlisted UUID, persisted character owner, current character object, exclusive character session and live game entity must all match. Guest tokens, roster-only connections, stale account sessions, replayed revoked sessions and forged character selections cannot gain GM rights. Requests are validated on the server; accepted state-changing commands are audited without passwords or bearer tokens. Repeating level/unlock cannot stack rewards; no arbitrary scripts or other-character targets exist.

Tests include live WebSocket account sign-in, guest and foreign-account denial, forged ownership, revoked sessions, strict levels, damage outside a safe zone, reconnect, save integrity, collision-bounded teleport and non-opening shared encounters. A real browser UI journey remains a separate acceptance gate unless captured explicitly in CI. Running on a public GitHub repository exposes **source**, not private environment values.
