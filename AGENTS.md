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

## Owner-authorized GLB archive — no invented publication hold (2026-11-22)

The owner supplied `assets/source-archives/glb-low-poly-models-building-blocks.zip` and expressly authorized its use in this public development repository, inspection/artifact workflows, source-derived Attunement assets and the game's ordinary asset pipeline. The source archive is a **building-block library**, not finished production-quality art. Distinguish visual quality, runtime readiness, provenance documentation and actual asset-integrity or disclosure failures from permissions.

**Do not impose a blanket “unlicensed archive-derived art”, “redistribution clearance unknown”, “source-only files must not be published”, or speculative third-party licence blocker** for this archive or derivatives. Do not suppress owner-authorized CI GLB study artifacts, refuse to build runtime derivatives, defer an otherwise acceptable PR, or require repeated owner confirmation solely on that invented basis. This supersedes contradictory language in older roadmaps, PR descriptions, handoffs and scheduled prompts across **all** Attunement asset work, including Lumenfen, Kestrel Deep, characters/NPCs and weapons.

Retain actual third-party attribution and documented provenance. Investigate a **specific, evidenced** conflicting licence or rights restriction if one emerges; do not treat the mere absence of a separately verified licence statement as evidence of a conflict. Normal independent gates still apply: substantive model/rig/material improvements, correct authoring and runtime pipeline, security/disclosure, current-head tests, merge safety, and actual visual acceptance where required. The existing #189 disclosure exception remains exactly scoped.

## Recurring review gate

For each relevant change, record in the PR or handoff: (1) authority and trust boundary; (2) data exposed to client/public repo and why; (3) ownership/authorization and abuse cases; (4) targeted verification and remaining limitations. Test unauthorized/forged actions, replay, invalid state and direct retrieval of server-only content where relevant; confirm existing valid UI/gameplay still works. Block promotion for confirmed material authority, disclosure, security or persistence regressions. Do not mark a check PASS without evidence; documentation-only edits need only targeted document verification. Revisit the boundary at architecture changes, integration and before public releases. Escalate conflicts with these rules to the owner.

## Shared regional development — owner decision 2026-11-22

The prior 2026-11-19 Claude-exclusive isolation rule for Severance Expanse and Silent Foundry is superseded. The integrated regional content, including terrain, arrival/return, gates, outpost, enemies, resources, loot, dungeon environment and VFX, is now eligible for coordinated development, recovery, review and integration by any owner-authorized agent. Inspect current main and active PR heads before changing overlapping files; retain approved art, mechanics, travel/return contracts and concurrent contributions. This does not cancel other explicitly reserved assignments, authorize destructive overwrites, or expand any publication exception.

## Rift visual acceptance and dungeon recovery — owner clarification 2026-11-22

Owner acceptance of the current physical portal construction applies ONLY to the exterior Phase Scar / Severance versions. Preserve those approved models, geometry, architecture, silhouettes, placement and established visual identity. The reported exterior VFX regression concerns the ground-level effect around the portal, not the membrane or portal visual itself. Recover the previous ground-effect implementation from history and improve it where warranted. Optional improvements to the existing exterior portal VFX are allowed but must not redesign the approved construction or displace ground-effect recovery.

This acceptance explicitly excludes the interior dungeon portals, Silent Foundry and Null Chamber / Null Annex environment and thresholds. Their current visual quality is rejected. Investigate each actual entrance, exit and internal transition in live gameplay; recover or adapt the updated rift construction rather than retaining legacy skewed door frames or merely changing their colour. Check model dispatch, GLB loading/fallback, actual placement, collision footprint, ground contact, orientation, clear approach and arrival clearance. Reuse approved exterior art where appropriate without altering its source geometry or forcing an exterior hazard, calibration or warning-ring mechanic into an interior return portal. Upgrade the interior environment and portal integration as a distinct deliverable commensurate with pinnacle dungeon content; do not mark it accepted merely because it shares a rift model or passes CI.

Preserve authoritative traversal, return, activation, death/reconnect, region isolation and encounter/reward contracts. Review prior implementation history before replacing assets. Verify exterior ground effects independently from interior portal construction with actual gameplay captures, day/night and relevant portal states, readability and performance. Interior visual acceptance remains outstanding.

## Merge-first integration

At the start of each delivery pass, identify independently deliverable open PRs against canonical main. Prioritize merging validated, current, nonconflicting work before starting new development or resolving unrelated blockers. Recheck the exact head and applicable combined-tree CI, review material risks, and use expected-head safeguards. GitHub mergeability alone, stale green results, draft status, pending checks and failed security/disclosure checks are not approval. Do not postpone a safe merge because an unrelated PR is blocked. Re-fetch main after each merge and reconcile remaining overlapping work; recover unique approved changes selectively rather than wholesale merging obsolete stacks.

## Desktop and TV gameplay interface

- Default to contextual hover tooltips (also available through keyboard focus) for item details, attributes, descriptions, status effects, requirements and explanatory controls. Keep persistent UI limited to the information needed for immediate gameplay, decisions or actions. Support optional pinned inspection or side-by-side comparison when needed; do not force a permanent detail column.
- Minimize interruptions to gameplay: compact context-sensitive controls, predictable dismissal and focus restoration, no redundant modal windows or panels for information that can be conveyed in place. Preserve essential combat feedback, accessibility and authoritative state.
- Avoid unnecessary scrolling in core inventory, loadout, equipment selection, vendor, fabrication, settings and other gameplay windows. Prefer legible grids, tabs, filters, search, pagination where useful, and contextual details. Keep primary controls and comparison context available without scrolling. Allow bounded scrolling only for genuinely long or dynamic content (such as chat history or journal text); never clip content or shrink text below readable sizes to eliminate it.
- Verify actual desktop layouts at 1280×800, 1920×1080 and 2560×1440 plus representative large-screen/UI-scale settings; check focus, tooltip placement, overflow, hit targets, and simultaneous HUD elements. Desktop and TV are the supported design targets; do not introduce phone-specific layout constraints.
