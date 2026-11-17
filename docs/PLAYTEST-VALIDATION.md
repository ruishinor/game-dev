# Playtest validation

Default: test the affected behavior and preserve meaningful existing regression, authority, security, persistence and asset-integrity checks. Do not regenerate neural speech or replay the asset generator for unrelated gameplay changes. The original-art authoring workflow verifies regeneration when its inputs change; the ordinary suite verifies the committed inventory and hashes, structurally validates models, and exercises behavior. Text asset comparison canonicalizes Git CRLF checkout conversion only; binary hashes remain exact.

Voice synthesis and promotion are explicit production tasks, not automatic PR jobs. Promotion verifies the exact accepted artifacts, runs focused voice tests and real playback, then checkpoints only the accepted assets on the voice branch. Pending audio does not block merging unrelated gameplay or transcript-only UI into the private playtest. Public redistribution remains separate.

For development checkpoints, a successful local test at the exact source commit is evidence; do not call absent runner steps a regression, or repeatedly retry an unexecuted hosted job. Document known limitations and the scope of verification. A confirmed material gameplay/security/persistence regression is not waived. A private playtest merge is not a public release or a claim that untested browser paths have passed.

Owner local evidence at eb3d6ce: 176/177, sole failure industrial_atlas.json regeneration (unchanged from baseline; likely CRLF). No successful fresh hosted run supplied. The following policy-only/test-scope changes are reviewed statically; not independently executed here.

## Standing authority and disclosure gate

Apply [AGENTS.md](../AGENTS.md) before each relevant playtest or release promotion. Record the server/client trust boundary, intended disclosures, negative authority and disclosure checks, and remaining limitations. A material regression is a blocker. Public Git visibility is not confidentiality; never equate server-only execution with private source.
