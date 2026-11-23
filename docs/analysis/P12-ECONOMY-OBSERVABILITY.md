# P12 — Real-play economy observations

Economy balance **cannot be validated from source-modeled XP, drop odds or hypothetical retention**. This optional capture system records successful, server-owned economic transitions from **actual played sessions**. All values remain unknown until people play with collection deliberately enabled.

## Enable and inspect (local operator only)

Collection is **off by default**. Choose a private file *outside the statically served client assets*; the server creates its containing directory. For example:

```bash
ATTUNEMENT_ECONOMY_METRICS_FILE=./data/ops/economy-metrics.json npm start
node tools/economy-report.mjs ./data/ops/economy-metrics.json
```

The environment variable may also be set through PowerShell. A programmatic server may pass `economyMetricsFile` to `startServer`. No added network endpoint, third-party analytics SDK, browser storage, account permission or client-reported metrics is involved.

The server writes an aggregate snapshot during normal saves and shutdown using a temporary file and atomic replacement. Up to **90 UTC daily buckets** are retained. If the previous snapshot is corrupt, metrics collection is disabled rather than replacing it. A telemetry write failure does not block gameplay or mutate player inventory.

## What each measure means

| Measure | Event grain | Limit |
|---|---|---|
| `sessions` / `session_seconds` | One completed live connection and up to 8h of elapsed wall-clock duration | Not distinct players, activity, retention or an always-online sample |
| `kills` / `xp_awarded` | Once per credited kill; integer XP actually credited on all grant paths | No attack timeline, subjective challenge or time-to-kill |
| `credits_looted` | Credit stack successfully collected from personal remains | Unclaimed corpse drops excluded |
| `credits_vendor_in` / `credits_vendor_out` | Positive/negative wallet delta on a committed vendor transaction | No player-to-player economy; GM grants omitted |
| `materials_granted` / `goods_granted` | A successful grant, vendor purchase, recovered vein or other explicitly instrumented source | Additional uninstrumented source paths may exist |
| `materials_spent` / `materials_crafted`, `goods_crafted` | Ingredient consumption and output from a finished fabrication cycle | Does not count quotes, cancelled work or unmet requirements |
| `craft_cycles` / `vendor_trades` | Successful completed crafting cycle / committed trade | Not engagement, purchasing intent or buyer identity |
| `items_granted` / `items_crafted` | Actually acquired unique item or completed output | Carried rare-item demand is not directly measured |

Metrics are **aggregated at capture time** by UTC day, class and ending level band (1–4 / 5–7 / 8–11 / 12–15), with fixed allowlisted item/recipe/type breakdowns. Data contains **no account, character, IP, authentication token, exact location, name, chat message, event timestamp, or raw event stream**. The local JSON is still gameplay analytics and should be access-controlled; it is not publicly served or automatically uploaded. GM-assisted sessions are excluded from completed-session metrics once GM commands are issued; earlier activity before the command may already have been aggregated. Do not consider this a privacy or regulatory compliance certification.

## Interpretation and data collection plan

Invite voluntary playtesters across all four classes and the four level bands. Include both fresh starts and experienced characters; sample solo and grouped activity. Use unmodified server authority rather than GM-minted items. Record *separately, with appropriate consent*, whether a playtest followed a new-player or experienced-player script; the metrics themselves contain no individual cohort or retention identity. Only claim representativeness after checking recruitment and session mix against the intended population; session counts alone cannot establish it.

Analyze actual credit inflow vs vendor sinks, crafting inputs vs grants, completed cycles by recipe, XP relative to completed-session exposure and reachability of rare-set blueprints. Beware that snapshots do not measure all material transfers, playtime actively engaged, deaths, accessibility difficulties, perceived fun or inventory wealth. Do not infer session-based churn or time-to-cap from these aggregates. Any tuning proposal needs quantified observation windows, sampling caveats and regression tests.

**Rollout:** Keep reward rates and vendor prices unchanged until collected data justifies alterations. Retain the P12 baseline model at `docs/analysis/P12-PROGRESSION-ECONOMY-2026-11-23.md` as *pre-instrumentation* evidence, not measured playtest outcomes.
