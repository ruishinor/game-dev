# PROG-15 — main reconciliation and remaining acceptance

20 November 2026. Recovered the level-15 character XP contract and persistence tests onto current main without restoring old GCD/combat or other shared source versions. The base tree is the reviewed main head `8b733e15`.

The character cap now allows server-owned XP through level 15; each level uses the existing permanent health/primary-skill advancement. Levels 1–5 retain their previous XP thresholds and saved records are not schema-migrated.

**Not established:** 15 attunement affinity ranks, class-specific skills above level 5, meaningful level-6–15 content pacing, and an end-to-end playable browser journey. The original owner contract for attunement ranks remains unidentified. Do not represent this infrastructure phase as full PROG-15 acceptance or merge a purely grind-based extension without the content gate. Current-head Node, live browser, reconnect, quest reward and progression checks are required.

This changes no private loot probability or Claude-reserved Expanse/Foundry art.
