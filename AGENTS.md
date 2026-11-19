# Attunement — standing engineering and review rules

Owner decision, 2026-11-18: the development repository remains public for now. Attunement is proprietary; use the independent public showcase for curated publication, not as a development mirror.

Read this document before planning or implementing changes, and apply it during PR review, release/playtest gates and every development handoff. These are standing requirements, not a one-off task.

## Server authority and minimum disclosure

- Keep unrevealed mechanics, reward algorithms, loot rolls and probabilities (unless deliberately published), future economic systems, undiscovered content, hidden quest/encounter triggers, anti-abuse rules and privileged operations in server-only execution and data modules. The same applies to future systems with comparable competitive, commercial, narrative or security sensitivity.
- Treat every client, request, browser-delivered file and shared module as untrusted and inspectable. Clients submit intent; the server authenticates, authorizes, validates ownership, eligibility, range, resources and state, calculates outcomes, applies mutations and persists authoritative results.
- For vendor purchases, sales, repairs, trading, crafting and rewards, enforce prices, balances, quantities, inventory changes, transaction integrity and replay/duplicate protection on the server. Do not accept client-calculated outcomes as authority.
- Share only explicitly approved presentation metadata and deterministic prediction necessary for responsiveness. Reveal player-visible content when appropriate to discovery/authorization; send scoped snapshots and outcomes, not hidden tables, seeds, future content or entire internal character/world state. Client previews are advisory; the server independently revalidates.
- Keep server-only modules outside browser-served directories and client dependency graphs. Review HTTP mounts, imports, bundles, source maps, static assets, API/WebSocket payloads and logs for unintended disclosure. Do not rely on obfuscation, minification, client-side flags or an unknown URL for secrecy.
- Preserve intended public Codex, Workshop and other UX contracts; migrate existing shared definitions incrementally with explicit disclosure decisions and focused tests. Do not break functioning features merely to relocate files.

## Repository and publication hygiene

- Public Git history, branches, PRs, issues, CI logs/artifacts and releases are observable. Server-only placement limits browser disclosure, not access to public Git source. Do not claim that public source is confidential or that .gitignore protects tracked files.
- Do not commit secrets, player data, sensitive unreleased content or unpublished production material to any public branch. Use appropriately access-controlled storage or local untracked paths; check staged/tracked state before publishing. If safe storage/workflow is unavailable, escalate rather than publish sensitive material. Rotate exposed credentials and assess historical exposure if an incident occurs.
- Preserve the proprietary notice and third-party rights/attribution. The independent showcase (ruishinor/attunement-showcase) is allowlist-only: approved screenshots, footage and public-facing copy; no development history, source, raw assets, private design plans, unpublished mechanics, credentials or player data.

## Recurring review gate

For each relevant change, record in the PR or handoff: (1) authority and trust boundary; (2) data exposed to client/public repo and why; (3) ownership/authorization and abuse cases; (4) targeted verification and remaining limitations. Test unauthorized/forged actions, replay, invalid state and direct retrieval of server-only content where relevant; confirm existing valid UI/gameplay still works. Block promotion for confirmed material authority, disclosure, security or persistence regressions. Do not mark a check PASS without evidence; documentation-only edits need only targeted document verification. Revisit the boundary at architecture changes, integration and before public releases. Escalate conflicts with these rules to the owner.

## Owner-reserved workstream — 2026-11-19

The expanded Severance Expanse and Silent Foundry (including #139, its successors, arrival/return doorway, terrain, gate integration, outpost, region-specific enemies/resources/loot and dungeon environment) are reserved for Claude's isolated parallel development. All other agents must leave that workstream and its branches untouched unless the owner explicitly authorizes a specific intervention. General autonomous merge/development approval is not an exception. Work on independent systems against canonical main; if a shared interface change overlaps reserved work, document the dependency and coordinate rather than editing or merging the reserved branch. Read-only inspection and roadmap/handoff notes are permitted. Preserve the existing merged travel and return contract. See docs/DEVELOPMENT-ROADMAP.md for the owner's visual defect and handoff priorities.
