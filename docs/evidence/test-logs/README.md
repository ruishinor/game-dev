# Browser-suite logs behind the stated results

These logs are kept so that the claims in the handoff documents can be checked.

| Log | Run | Result |
|---|---|---|
| `e2e.log`, `e2e2.log` | `play.mjs`, effects branch (pre-merge) | 71/72; check 9 failure pre-existing |
| `e2e-base.log` | `play.mjs` on untouched base `7a9c5d7` | 71/72, same check 9 failure |
| `e2e-final.log`, `e2e-fix.log` | `play.mjs` after the check 9 fix | 72/72 |
| `e2e-merge.log` | `play.mjs` right after merging preview `232aa02` | Beacon flake (CPU contention from parallel jobs) + radio click timeout |
| `base-e2e.log`, `base-pex.log` | Preview `232aa02` untouched | Same radio timeout; pex uppercase lesson failure (both pre-existing) |
| `e2e-gate.log`, `pex-gate.log` | After the radio/tutorial fixes | 72/72; pex exit 0 |
| `e2e-cov.log`, `pex-cov.log` | After the full effect coverage (`fac3854`) | See the files |
| `art.log`, `pex.log` | art-originals and the first merged pex run | art pass; pex uppercase failure |
