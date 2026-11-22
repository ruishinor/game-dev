# Development probes (not part of the game)

Small diagnostics written while building the Severance work. Run from `tools/dev/`.

- `render_blend.py`, `render_spread.py`: Cycles preview renders of a pipeline `.blend`
  (`PYTHONPATH=../asset-pipeline <venv>/python render_blend.py '{"blend":...,"out":...,"views":[[name,eye,target]]}'`;
  `render_spread.py` also takes `"spread":[object names]` to lay kit pieces out in a row).
- `vein-sites.mjs`, `camp-site.mjs`: search the Expanse for clear, level sites away from colliders,
  patrol routes, the outpost and the gate approach.
- `rift-fps.mjs <repoRoot>`: same-session A/B frame time near the rift (visible / no refraction / hidden).
- `reach-probe.mjs`, `vein-probe.mjs`: scene probes (entities and meshes present at a moment).
- `ab-vendor.sh`: run the vendor e2e in two worktrees back to back (set `SCRATCH`).

Software rendering only: numbers here are not GPU measurements.
