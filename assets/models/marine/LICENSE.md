# Marine models

Source artist: **Quaternius** — Animated Fish Pack (April 2018).
Source: https://quaternius.com/packs/animatedfish.html
License: **CC0 1.0 Universal** — https://creativecommons.org/publicdomain/zero/1.0/
Artist's license confirmation: https://quaternius.itch.io/lowpoly-animated-fish

The source directory retains the original Shark.blend, Manta ray.blend, and
Fish1.blend files (renamed). Each has the artist's skeleton and swimming animation.
The exported GLBs add subdivided smooth surfaces, adjusted materials, and small
rig-bound eyes. Reproduce with scripts/art/prepare-marine.py in Blender.

These are stylized family representatives, not scientifically exact models of
every species in the catalog. No texture downloads are required at runtime.

## Species batch v2

`tiger-shark.glb`, `whale-shark.glb`, `great-white-shark.glb` and `reef-manta.glb`
use original procedural geometry, vertex-painted markings and species-specific
bone hierarchies authored for this project in `scripts/art/build-species.ts`
(Node + three.js; reproduce with `npm run build:species`). No third-party textures
or model geometry are included in these four assets; the reef manta no longer
adapts the Quaternius mesh. Anatomy references are linked in
`docs/marine-species-art.md`; no reference photographs are embedded in these GLBs.
These species assets are stylized drafts awaiting human anatomy and art review.
