# Lumenfen — hybrid world reconstruction (implementation contract)

**Status as of 2026-11-23:** The Lumenfen region and initial art **merged through PR #236**; later landscape/landmark/fauna/GLB iterations include #275, #277, #280, #291 and #296. Issue #278 tracks remaining visual acceptance. Consult the [canonical register](../DELIVERY-REGISTER.md) for the current classification. All 138 archive GLBs are eligible for the registered production asset pipeline (`glb_archive`, PR #257); these eight donors are immediate candidates for reconstruction, composing and runtime integration. No additional owner approval or source-only exclusion is required to start development. Visual polish remains iterative.

## Owner-authorized archive and runtime pipeline

The supplied 138-GLB archive and its adapted Attunement derivatives are owner-authorized inputs to the established asset pipeline and CI artifact workflows. Do not impose a speculative archive-license or source-only publication hold. Document source lineage and actual third-party attribution, investigate only evidenced conflicts, and independently validate concrete geometry, rig, lighting and gameplay defects. The composite can advance through the ordinary production tooling without a separate permission checkpoint.

## Artistic and gameplay direction

Use the *architecture and authority contracts* of Severance Expanse, not its art, terrain shapes, enemy kits, or portal look. Lumenfen is a lived-in tidal watershed where root-bound forests, masonry waterworks, field-repaired mechanisms, hand-built timber settlements, and rare resonance technology have accumulated over centuries. Keep that layered history visible. The result must not read as a uniform fantasy village, science-fiction base, post-apocalyptic camp, or medieval dungeon. No generic low-poly domes or floating spheres as substitutes for real geometry.

**The material language is deliberate:** wet stone, moss, aged timber and braided roots dominate; ceramic/brass water instrumentation and oxidized metal are sparse; resonance glass appears where its function is legible. Built forms should be integrated into vegetation instead of scattered unrelated props. Preserve traversable lanes and the established portal collision/authority contracts.

### Distinct physical places

1. **Veil Landing** — southern wetland arrival: naturally eroded rootglass threshold, mossy stone footings, reed fringe. Arrival and return must remain immediately readable; no nearby solid foliage or scenic barriers across the safe approach.
2. **Mossbound Thicket** — ancient layered hardwood trunks, alien cage-growth grafts, fungal mats, low suspended mist, roosting birds. Distinct morphology from Severance spires.
3. **Glasswater Spring** — water mirror, shallow gravel shelves and winding stilted crossing, hand-laid stone with selective ceramic/metal instruments. Internal paired rift must sit on a stable threshold, not on a free-floating polygon.
4. **Root-Crown Hollow** — civic observatory built from adapted hall roof geometry, carved wet stone, winding roots, imperfect metal fittings; local architecture visibly evolved rather than pasted fantasy/modern assets.
5. **Tidal Mycelium and the Weir** — marsh sluice network and aged bucket-work mechanism wrapped by root growth. Machinery is functional and restrained, not an industrial factory or spaceship.
6. **Luminous Canopy** — layered high crown ecology with downward lantern-like leaves, damp stone remnants and smaller flying fauna. Distant silhouettes must remain legible in low-light and fog.

These places must differ in camera-level shape, atmosphere, creature populations and encounter cover, not just in biome names or map labels. Existing world dimensions and player collision must remain authoritative.

### Source-building-block donor assignments

Use `assets/lumenfen-donors.json` as the verified shortlist of **individual source nodes**, with exact archive filenames, node identities, material/geometry requirements and lineage metadata. Different donors are *combined within one building or organism*, not simply displayed beside each other.

- Canopy/roots: **Forest Trees and Woodland Plants** `000-english-oak-mature` + **Alien Planet Plants and Terrain** `002-cage-tree`; rework branch connection, layered leaf silhouette, tuned light-transmission and bark/vein texture response.
- Architecture: **Fantasy Cartographers Map Printing Guild** `001-roofed-cartographers-guild` + adapted stonework and root supports; radically rework the roof/walls so it ceases to resemble a medieval town asset.
- Elevated routes: **Flooded and Coastal Survival** `000-boardwalk-junction` + aged timber, submerged piers, cable/root-supported spans. Never obstruct portal approach circles.
- Mechanism: **Animated Mechanisms Kit** `000-bucket-elevator` as a detail donor for human-scale waterworks; combine it with built masonry and living reed growth.
- Fauna: **Birds and Flying Creatures** `001-grey-heron` and **Alien Creatures and Monsters** `000-six-limbed-apex-predator` as anatomical and silhouette studies. Replace simplistic current creature meshes with rebuilt, rigged and animated variants before gameplay use.
- Rift ground response: **VFX Mesh Library** `000-radial-impact-burst` as an abstract mesh study only. Build unique root/ground growth responses with bounded shader passes; do not transplant the exterior Phase Scar warning ring or alter that approved portal.

## Rendering and engineering contracts

- Reuse the existing deterministic shared geography and server-authorized travel, spawn, region, death/reconnect, combat and reward logic. Do not move portal or collider anchors simply to make art fit; align the art around the anchors.
- Construct proper new GLB derivatives through the existing asset pipeline. Improve geometry and silhouette, reauthor UV/PBR/normal/roughness/emissive maps, create appropriate LODs, rig and animate fauna, and document every donor's lineage and third-party rights. A smoothing modifier or higher subdivision count by itself is insufficient.
- Preserve runtime asset hash validation, manifest generation, GLTFLoader cache/instancing and scene lifecycle/disposal. Do not fetch the 94.4 MB ZIP to browsers, embed raw source assets in shared modules, or auto-populate the runtime manifest from the archive.
- Use existing Attunement VFX engines and actual geometry for portal rootglass, water interaction, particulate drift and impacts. Effects must remain bounded by camera range and respect reduced motion and desktop/TV performance; no dense clusters of individual unbatched draw calls.
- Keep existing four portal identities and the distinct Reach-side entry, in-region return and two-way interior threshold traversals. Preserve existing return destinations and eligibility rules.
- Populate gameplay from native flora/fauna rather than Severance soldier recolours. Include grounded non-combat encounters and clearly telegraphed predators; authoritative AI and loot stay server-side.

## Current technical deliverables

`tools/assets/lumenfen-source-inventory.py` verifies the archive, and the native `glb_archive` pipeline ingests **all 138 donors** as reusable inputs. `tools/assets/lumenfen-stage-donors.py` and `tools/assets/lumenfen-compose-donors.mjs` remain a fast shortlist extractor/composition route for the first eight Lumenfen donors. They do not limit access to other source assets. The outputs are eligible for successive geometry, material, rig, animation and world-integration passes, including runtime publication when technically valid; iteration does not require a separate owner sign-off.

## Technical quality checks during ongoing implementation

1. The full shortlist must exist in the ZIP and each exact selected node must be real, nonempty and independently extractable.
2. Derived geometry/materials/animations must differ substantively from the low-poly studies, with proper provenance and hash-verified assets. Inspect all donor combinations, not just isolated renders.
3. Validate source and derivative integrity with the Khronos glTF validator; no missing textures, unsupported extensions or broken animation targets.
4. Check actual in-world renders and traversal for all four rifts, ground contact, orientation, both-way travel, safe landing, camera obstruction, minimap/atlas, daylight and night fog.
5. Assess 1280×800, 1920×1080, 2560×1440, and TV UI scaling with measured frame times, draw calls and VRAM. Maintain the currently accepted exterior Severance/Phase Scar art.
6. Confirm exact PR-head CI and integrated browser playtest, server authority, reconnect/persistence and no client disclosure of privileged gameplay logic for any subsequent art or gameplay PR (the original #236 is already merged).

**Do not block or defer unrelated functional/regional merges solely because some art is unfinished or sourced from the low-poly archive.** Merge independently deliverable changes after applicable CI, gameplay and security checks, then continue asset reconstruction and visual improvements as follow-up work. Do not present a first-pass region as visually finished without evidence.
