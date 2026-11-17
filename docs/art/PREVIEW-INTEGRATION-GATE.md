# Brineworks integration gate

Candidate first-parent: 249791753568e264403a1a04f19020ed133a0724 (PR #8).
Art parent: 0f68c42f002e112cf821f7d4dea66ffa89ba85f1 (PR #7).
Merge checkpoint: 747fac4944d01cc2859061e66ccccacd3cd81624.

Standalone art checks passed: 85 Node tests, 45 authoring previews and playable browser scenario (run 44129493164). Base integration browser run 44130071063 failed before art integration, including movement, camera, targeting, combat and equipment UI checks; their underlying causes have not been established here. Do not dismiss as runner performance without evidence.

Reconciled 135 art-only paths by exact Git blob identity; eight shared source files by common-ancestor line changes, preserving both sides. The simultaneous additive UI import insertion retains both imports. No source branch was changed. Combined regression, full browser playtest, authoring and focused playable checks must pass on the same candidate before shared-preview merge. Reconcile any later changes in #8/#9 without overwriting them. Do not promote unapproved art as production, nor deploy publicly.

The full browser workflow is extended to pull requests targeting the combined preview branch, so it is not silently omitted for this stacked PR.
