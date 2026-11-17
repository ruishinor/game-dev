# 11 — Redesigned Mender Symbiote

Original rigid mechanical carapace plus procedural animated lens and four articulated biological tendrils. Existing Quaternius EyeDrone is a rigged donor in the current game; its asset manifest bounds were inspected. This prototype does NOT reuse its geometry or replace its animations: no binary donor access or fit test was available. Existing live Mender remains unchanged. Body is a separate loadable GLB; optional component expects a detached clone and owns only its dynamic resources.

Simulated roundtable:
- Art: reclaimed survey hardware, angular pale segmented shell, exposed dermal surface, restrained front sensor. Biology appears integrated rather than gory.
- Modelling: carapace static, dynamic tendrils separated; no baked cross-joint geometry or speculative donor overlay.
- Runtime: stable Three geometry and shared per-instance materials, explicit disposal, donor/body resources remain caller-owned.
- UX: lens mode colour and physical activity supplement existing companion UI; no movement, command, interaction or combat changes.
- Adversarial: finite pose inputs, mode fallback, bounded charge and speed, reduced motion, deterministic poses and no body disposal. Live attachment/hover, visual silhouette across distance and actual Three lifecycle still unverified.
- Retrospective: deliberately avoided clipping-prone outer armour wrapped over an unseen animated donor. A neutral software preview of the static carapace was generated; it omits procedural tendrils and animated lens.

Executed GLB structure, finite/unit normals, deterministic byte equality and 200 procedural pose checks. 2656 triangles, 10 material batches, 263232 bytes. Hosted Three tests staged.

Cross-package adversarial review: mode lookup now requires an own property; inherited object keys such as `constructor` fall back to triage and are covered by a test. This is presentation input hardening, not a gameplay/security assurance.

## Visual revision v2
Changed construction technique: closed curved shell-sector meshes with smooth shared normals plus a smooth ellipsoidal core, visible gaps, structural ribs and sensor detail. Four tendril attachment points and the animated lens remain aligned to the existing optional visual rig. Added joint spheres between tapered tendril segments. Organic material maps embedded with industrial maps. Art: curved carapace instead of the toy-like circular frame. Technical: explicit inner/outer shell surfaces; existing unsmoothed mesh compiler output unchanged for legacy recipe (byte equality tested). Adversarial: first build rejected for triangle budget; reduced tessellation, then verified finite/unit normals, deterministic output and budget. Full validation and actual render still pending. Retrospective: neutral previews show front and back, not final appearance. Existing live companion unchanged.
4404 triangles, 24 maps, 732884 bytes.
