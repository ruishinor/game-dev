# Red Rucker / Veyran — archived identity

Owner decision, 2026-11-19: retire Red Rucker (Veyran Burdenkeeper) and Veyran from the playable game. Red Rucker was a Vanguard look, not a distinct gameplay class. Vanguard, the remaining origins and all class mechanics are retained.

- Playable look and origin registries no longer enumerate these entries. New requests for a retired look/origin resolve to the active class default. Existing persisted Red Rucker/Veyran cosmetics normalize to the supported class look/origin, preserving a valid saved body frame and leaving accounts, identity, level, XP, inventory, wallet and equipment intact. Standard appearance validation also excludes Veyran in the arrival-hall candidate when reconciled.
- Preserve original source, textures, historical commits and explicitly requested art inspection. The archived renderer registry is separate from active origin selection; the default preview gallery no longer includes Red Rucker. An explicit developer preview of the archival asset remains possible. PR #117 is closed without merge and its branch preserved.
- No new gameplay authority or data access. Server save/create normalization is the trust boundary; client selectors consume active registries. Regression coverage includes forged retired creation, legacy migration, active alternate appearance and remote model visibility. Hosted checks and independent visual acceptance remain outstanding on this candidate.

## Validation follow-up

On `42b4349`, six workflow runs succeeded; preview job 135455934507 was cancelled with 34 evidence files uploaded and orphan browser processes terminated. There was no assertion failure in the available log. Port the bounded 25-minute job / 20-minute test-step allowance and stage/teardown diagnostics previously exercised successfully in #115 (job 135430647366). No gameplay or assertion changes; the precise cancellation cause remains unconfirmed. Require fresh applicable exact-head checks.
