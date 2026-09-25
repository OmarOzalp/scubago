# Species art direction and production plan

Approved direction: recognizable, polished stylized animals with accurate shapes
and markings. Collection cards use actual photographs. The island uses animated
3D animals. Photographs must not be replaced with AI illustrations presented as
real wildlife.

## Current inventory

The catalog contains **119 species** (the earlier rough count of 120 included a
non-entry match). All 119 have photo URLs, but none have recorded human identity
review. Six animated GLBs now exist: three family representatives and first species
drafts for whale shark, tiger shark and reef manta ray. The mapping in
`src/lib/swimming.ts` resolves these exact IDs before category fallbacks. This
is **3 of 119 species with dedicated draft art**, not 119 approved models.

The existing photo map contains 26 "all rights reserved" images, 67 CC BY-NC,
10 CC BY-NC-SA, 2 CC BY-NC-ND, 10 CC BY and 4 CC BY-SA. It is a reference catalog,
not a release-ready rights-cleared asset library. The importer currently takes
the first taxon search result and doesn't enforce a matching scientific name or
license. Do not bulk regenerate or publish from it without correcting those checks.
See [iNaturalist's media reuse guidance](https://help.inaturalist.org/en/support/solutions/articles/151000169918-can-i-use-the-photos-and-sounds-that-are-posted-on-inaturalist-).

## Build one reviewed asset record per species

Each record needs the species ID and accepted scientific name, reference photos,
creator and source links, explicit licenses/permissions, an identity-review status,
3D asset/version, rig family, animation clips, bounds, download size, and review
status. Missing artwork stays missing; category placeholders do not count as
species-specific coverage.

1. **Photographs:** resolve the exact taxon and review diagnostic features. Choose
   owned/permissioned photos or suitably licensed images, preserve photographer
   credits and source/license links, and prepare a consistent thumbnail crop.
   Mark juvenile/adult, sex, regional and color-phase differences when relevant.
   Download approved derivatives to controlled storage with offline caching.
2. **Reference sheets:** collect side, top and front views, silhouette, proportions,
   fin placement, key markings and typical motion. Human review is mandatory;
   an image generator cannot certify species identity or unseen anatomy.
3. **Base rigs:** develop a small set of reusable skeletons and swimming cycles
   for similar body plans. Sharks, flat rays, deep-bodied reef fish, elongated
   fish/eels, turtles, cetaceans and cephalopods need different approaches.
   Bottom-dwelling species need suitable crawling/resting behavior rather than
   forcing every animal into an identical swimming orbit.
4. **Species variants:** model distinctive geometry and author markings per
   species. Reuse a rig where anatomy allows; recoloring a generic model is not
   enough. Produce consistent stylized materials and inspect at both island and
   close-up scale.
5. **Export and validate:** export animated GLB, normalize forward direction and
   scale, verify skinning, loop continuity and bounds, and test on a real iPhone.
   Start from the existing 5,000-triangle/220 KB texture-free rig budgets; set and
   measure a separate texture budget when markings require textures. Load only
   visible species and cache assets rather than parsing 119 rigs at startup.
6. **Review:** compare a turntable and swimming clip against the real photos.
   Approve silhouette, anatomy, pattern placement, motion, small-screen readability,
   licenses and mobile performance before changing status to ready.

## First production batch

Start with the animals already in the simulator collection: **whale shark, tiger
shark and reef manta ray**. Whale shark and tiger shark require separate meshes
and markings even if part of their skeleton can be shared. Then add a hammerhead,
a distinctive reef fish, turtle and octopus to prove the pipeline across body
plans before expanding to all 119.

The first three drafts are implemented and can be opened from their species
pages using **See [species] in 3D**. The remaining supported species still use
clearly described family representatives; unsupported body plans remain without
3D assets. No asset has been marked scientifically or artistically approved.

## Batch v1 implementation and review

| Species | Distinctive draft geometry / markings | Triangles | GLB bytes |
| --- | --- | ---: | ---: |
| Whale shark | Broad flattened head, terminal mouth, rearward dorsal, pale spots and flank lines | 3,466 | 187,552 |
| Tiger shark | Fuller body, blunt snout, elongated upper tail, dark side bars | 2,820 | 126,084 |
| Reef manta ray | Broadened disc, cephalic fins, pale shoulders and underside, belly spots | 3,100 | 144,348 |

Sharks have newly authored procedural meshes and rigs. The ray adapts the
Quaternius CC0 mesh/animation. All three use one skinned mesh and one
vertex-colored material, no textures, and a looping `Swim` clip. Assets load
only when requested by the visible swimmer page or close-up; in-flight loads
are shared and stale requests cannot replace the current page.

Rebuild: `blender --background --factory-startup --python scripts/art/prepare-species.py`.
Verify exports: `npm run verify:marine`. Studio previews in `docs/art-previews/`
are actual model renders. The verifier checks all six assets for deformation,
loop continuity, bounds, independent skeletons and budgets; dedicated models
also require vertex colors and a single skinned draw call.

References used for draft proportions and pattern placement:
- [Florida Museum: whale shark](https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/whale-shark/)
- [Florida Museum: tiger shark](https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/tiger-shark/)
- [Manta Trust: reef manta ray](https://www.mantatrust.org/mobula-alfredi)

These simplified drafts still need human comparison against multiple views,
especially fin contours, mouth detail and individual marking variation. Native
performance must also be checked on physical hardware before release.

Validation on September 25, 2026: 84 Jest tests across 17 suites, TypeScript,
changed-file ESLint, six-model rig verification and iOS/web production export
passed. Web close-ups and native simulator island rendering were inspected;
the three animals visibly moved around the island in successive captures.
