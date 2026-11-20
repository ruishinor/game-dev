# GM owner preview console

This is a privileged **gameplay preview** capability, not server, database, operating-system, or hosting administration. It reuses the existing account/password login. There is no public default administrator, client-side GM switch, hard-coded secret or guest-token elevation.

## One-time setup (local PowerShell)

1. Create or sign into the **account you own** at the ordinary Attunement sign-in screen and create/link at least one character.
2. Stop the local server so the character and account data are flushed.
3. In PowerShell from the repository root, obtain that account's UUID from the local save:
   ```powershell
   $accounts = (Get-Content .\data\characters.json -Raw | ConvertFrom-Json).accounts
   $accounts | Select-Object handle,id
   ```
4. Set its UUID (not account name or password) in the **server process environment**, then start Attunement:
   ```powershell
   $env:ATTUNEMENT_GM_ACCOUNT_IDS = '<your-existing-account-uuid>'
   npm start
   ```
   Replace the placeholder with the actual UUID. Do not commit your account's UUID, password or environment to the public repository. In hosted deployments, configure the value in private server environment settings, and require authenticated TLS/WSS for internet access.
5. Log in with your normal account credentials. On any owned character, press Enter and issue `/gm help`.

Commands: `/gm status`, `/gm level 15` (up to current `MAX_LEVEL`), `/gm unlock` (Resonance and Phase Scar calibration only), `/gm tp reach|scar|expanse|outpost|scrapyard|gate|foundry|depths`, `/gm heal`, `/gm god on` and `/gm god off`.

GM actions require the account session to remain valid and the active character to belong to that account. All actions use explicit server handlers and valid named destinations; there is no unrestricted script execution, arbitrary coordinates, inventory cloning, other-user control or implicit production privileges. GM actions are logged server-side without credentials. Level and calibration changes persist on the selected character; invulnerability does not persist. Use a dedicated preview character, not a production character, because explicit progression mutation bypasses narrative quests.

The Foundry command opens the existing shared encounter. Teleports use the existing authoritative transfer path, which clears travel-bound combat state, companions and interaction locks. Scheduled CI plus manual browser sign-in, command feedback, teleport and reconnect tests remain merge gates.
