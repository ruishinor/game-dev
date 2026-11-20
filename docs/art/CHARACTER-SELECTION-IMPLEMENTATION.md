# Character selection delivery and review

This isolated branch implements a real account-based character-selection screen between login and gameplay, using the existing account-owned roster and model factory. It intentionally does not modify the owner-reserved Expanse/Silent Foundry environment.

## Delivered
- Three-column roster presentation with selected character facts, central rotatable/zoomable live model and account-owned character list.
- Original low-overhead architectural presentation platform. Existing player model and character appearance are used; no third-party art copied.
- Enter World, Create, Back to Roster, Return from game menu and Sign Out use existing network contracts.
- Delete confirmation requires typing the exact selected name, then the existing server-owned deletion action.
- Explicit 0/6 through 6/6 slot count from the existing six-character server limit; creation disabled when full.
- Account-authenticated roster sockets remain connected after the unauthenticated 15-second timeout. This avoids dropping a player who is taking time selecting or creating a character.
- Responsive layout and reduced-motion compatibility through the existing preview component.

## Authority and disclosure
No new server character fields or cross-account reads. The roster still comes from the authenticated account's `account_ready` and the account ownership check remains server-side on select/delete/create. Character records are displayed as plain text, with no HTML injection. No secrets or internal progress tables are sent to the browser. The socket timeout change permits authenticated accounts to remain in the character selection state; unauthenticated connections retain the original timeout.

## Validation
`npm test`, syntax checks and targeted Playwright `test/e2e/character-roster.mjs` are required before merge. Browser gate: account registration, survival past auth timeout, returning from creation, creating/entering the world, returning to roster, actual character 3D preview, re-entering the world, typed-name deletion, and rejection of incorrect confirmation.

Human visual acceptance, representative screenshots, race/body framing, equipment visualization, cinematic environment fidelity and measured GPU impact remain outstanding. The existing account roster metadata contains name, class, level, outfit and appearance; equipped armour/weapons and last world location are not yet available as roster presentation fields and are deliberately not invented.

## Follow-on
- Extend the authoritative character roster presentation projection to include permitted equipment appearance, class insignia and last known location, without exposing private/unavailable data.
- Evaluate loading states and long-name layout, camera presets per model and 320px layouts.
- Validate account switching and all supported races, including non-humanoid models.
- Add a distinct fully art-directed Attunement character-select environment from the established 3D production pipeline.
