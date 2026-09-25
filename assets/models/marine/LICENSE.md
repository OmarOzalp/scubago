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

## Species batch v1

`whale-shark.glb` and `tiger-shark.glb` use original procedural geometry,
vertex-painted markings and a new swimming rig authored for this project in
`scripts/art/prepare-species.py`. No third-party textures or model geometry are
included in these two assets.

`reef-manta.glb` adapts the Quaternius CC0 manta mesh and animation above, with
broader shoulders, painted shoulder patches, belly spots and embedded eyes.
Reproduce all three with `scripts/art/prepare-species.py` in Blender 5.2.
Anatomy references are linked in `docs/marine-species-art.md`; no reference
photographs are embedded in these GLBs. These species assets are stylized drafts
awaiting human anatomy and art review.
