# Brineworks Cut — equipment and source-archive reconstruction pass

## Implemented presentation layer

`client/src/brineworks-detail.js` mounts actual indexed 3x3 crease-aware PN-triangle remesh derivatives `research_tabletop_module_refined.glb` and `engineering_tabletop_module_refined.glb` at the two established service stations. The original GLBs are retained as load-failure fallbacks. Each is bounded to the work surface and receives a physically based material adaptation that retains donor textures and normal maps. The surrounding equipment gains contained fluid samples, brazed connection hardware, tube runs, instrument rail details, and two readable gauges. Needles and equipment light change subtly over time and become steady when reduced motion is requested. The existing shared VFX engine now renders low-frequency, distance-capped, motion-sensitive moisture/pressure microdroplets near the pressure station.

Existing Brineworks server objects, quest route, range checks, pressure-ring exclusion, service cooldowns, objects, and movement collision are not changed. The presentational layer is disabled under the low-detail scene preset; models that fail to load retain the previous base station structures. The output contains real triangle refinement with curved surface reconstruction: research 3,044 → 27,396 triangles; engineering 3,376 → 30,384 triangles. Both retain their embedded PBR textures, normals/UVs, and material semantics. The work remains an incremental visual-fidelity pass, not demonstrated maximum-quality art.

## Owner source archive — candidates, not automatically shipped

`assets/brineworks-donors.json` identifies two exact source nodes from the already-recorded GLB source inventory: the bucket-elevator mechanism from `modelpack - Animated Mechanisms Kit.glb` and the boardwalk junction from `modelpack - Flooded and Coastal Survival.glb`. Both are eligible for the approved `glb_archive` production pipeline. This pass does not assert that raw source ZIP contents have been rebuilt, remeshed, optimized, rendered in the game or placed at Brineworks.

Their next technical stage is extraction to the private pipeline cache, visual/mesh inspection, mechanical reauthoring and LOD/animation work, and a hash-verified derivative with explicit lineage. No origin-based or speculative licensing restriction prevents that work; normal geometry, safety, performance and visual-acceptance checks do apply.

## Verification and limitations

Node tests check module requests, finite fitting, PBR adapted material mounting, no new collision, both refined-to-original and missing-source fallbacks, reduced-detail disablement, VFX throttling, frame update and idempotent cleanup. Binary GLB tests validate the real on-disk output, 9× triangle count, accessor and index range integrity, material/texture preservation, and source blob provenance. Validate the new assembly in live gameplay at 1280×800, 1920×1080, 2560×1440, along with reduced-motion and low-light conditions, before artistic acceptance. CI/Node green does **not** establish photorealism, PBR texture resolution, real hardware GPU cost, or satisfactory upscale of ZIP donors.

Authority: client-side presentation only; no new server action, economic/reward state, persistent state or privileged operation. The existing two tabletop GLBs were already browser-served; archive contents remain a development input, never a new browser mount.
