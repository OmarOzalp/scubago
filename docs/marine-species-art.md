# Species art direction and production plan

Approved direction: recognizable, polished stylized animals with accurate shapes
and markings. Collection cards use actual photographs. The island uses animated
3D animals. Photographs must not be replaced with AI illustrations presented as
real wildlife.

## Current inventory

The catalog contains **119 species** (the earlier rough count of 120 included a
non-entry match). All 119 have photo URLs, but none have recorded human identity
review. Nine animated GLBs now exist: three family representatives and species
drafts for whale shark, tiger shark, great white shark, reef manta ray, ocean
sunfish and green sea turtle. The mapping in `src/lib/swimming.ts` resolves these
exact IDs before category fallbacks. This is **6 of 119 species with dedicated
draft art**, not 119 approved models.

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

The six species drafts are implemented and can be opened from their species
pages using **See [species] in 3D**. The remaining supported species still use
clearly described family representatives; unsupported body plans remain without
3D assets. No asset has been marked scientifically or artistically approved.

## Batch v2: species models and swimming

Each species is its own modeling and animation problem. The models are generated
by `scripts/art/build-species.ts` (Node + three.js; `npm run build:species`), with
shared helpers in `scripts/art/species/` for lofting, airfoil fins, decals and
skinning, and one design file per species for proportions, fins and markings.
Every asset is a single skinned, vertex-colored draw call with no textures.

| Species | Model | Swimming | Triangles | GLB bytes |
| --- | --- | --- | ---: | ---: |
| Tiger shark | Broad blunt snout, heavy shoulders tapering to a slender keeled tail stock, falcate fins, long notched upper lobe, irregular dark bars, cream belly | Heavy, controlled carangiform stroke from the rear third; long flexible upper lobe; steady head; 0.44 strokes/s | 4,084 | 184,088 |
| Whale shark | Huge flat truncated head with a terminal mouth, small eyes, flank ridges, rearward dorsal, big semi-lunate tail, spots between pale grid lines, white belly | Slow, long, large sweeps in the rear body; almost no head movement; gentle roll; 0.17 strokes/s | 3,986 | 212,504 |
| Great white shark | Conical snout, deep torpedo body, tall triangular dorsal, long pectorals with dark tips beneath, keeled peduncle, crescent tail, jagged gray/white line | Near-thunniform: rigid body, powerful beats packed into the peduncle and stiff tail; slight roll; 0.6 strokes/s | 3,580 | 146,876 |
| Reef manta ray | Continuous disc lofted from airfoil sections, broad pointed wings, rolled cephalic lobes, thin tail, pale shoulder patches on a dark back, white belly with dark wing margins | Underwater flight: flexible wing strokes traveling outward and backward, glides, banking; 0.3 strokes/s | 3,096 | 136,800 |
| Ocean sunfish | Tall, laterally compressed, near-round body that ends abruptly in a scalloped clavus; tall sickle dorsal and anal fins set far back; tiny rounded pectorals; small beaked mouth; blue-gray skin with pale mottling | Sculls with the dorsal and anal fins swinging together to the same side (the tips lagging), the clavus rippling as a rudder; the body stays rigid with a slow yaw and roll; drifts tilted onto its side; 0.36 strokes/s | 1,832 | 79,480 |
| Green sea turtle | Low heart-shaped carapace built from flat-shaded scute plates (vertebral, costal, marginal) in olive and brown; pale plastron; small blunt head and beak; long curved front flippers; small rounded rear flippers | Underwater flight: bouts of 2–3 front-flipper strokes (down and back, feathering on the return) then 2.5–5.5 s glides with flippers swept back; rear flippers steer; gentle pitch and bob; 0.42 strokes/s | 1,226 | 93,228 |

### Rigs and animation

The app drives the bones procedurally every frame (`src/lib/marine-rigs.ts`,
applied by `src/components/home/three/swim-rig-driver.ts`), so the motion follows
each swimmer's actual speed, turns and climbs. The baked `Swim` clip in each GLB is
the same rig sampled at cruising effort, for previews and verification.

- **Sharks:** `Root → Spine1 → Spine2 → RearBody → TailBase → Tail →
  TailUpper/TailLower`, with `Head`, `Dorsal` and `PectoralL/R` nodes. A traveling
  wave runs down the midline with an amplitude envelope that grows toward the tail;
  each spine bone takes the change in midline angle across its segment, so rotation
  increases toward the tail and the caudal fin lags the peduncle. Turning adds a
  C-shaped bend into the turn and dips the inside pectoral; climbing pitches both
  pectorals.
- **Reef manta:** five wing segments per side (`WingL1–5`, `WingR1–5`), plus `Head`,
  `CephalicL/R` and a three-bone tail. Each segment flaps about an axis parallel to
  the body with a growing phase delay, so strokes roll outward to the tips; a
  quarter-cycle twist lifts the trailing edge after the leading edge. The body rides
  up on the downstroke, the outer wing strokes harder in turns, stronger strokes
  come with climbing, and below cruising speed the wings are held in a shallow V.
- **Ocean sunfish:** `Root`, two-bone dorsal and anal fins (`Dorsal1/2`,
  `Anal1/2`), a three-bone clavus (`Clavus1–3`) and `PectoralL/R`. The dorsal and
  anal fins sweep in a coordinated oscillation (the anal fin mirrored so both tips
  swing to the same side), their tips lagging; the body answers with a slight yaw
  and roll; the clavus ripples and angles into turns; the tiny pectorals flutter.
  There is almost no tail motion: the fins drive it.
- **Green sea turtle:** `Root`, `Head`, two-bone front flippers (`FrontL1/2`,
  `FrontR1/2`), `RearL/R` and `Tail`. Strokes come in bouts separated by glides
  (the rig tracks strokes and glide time itself); each stroke sweeps the flipper
  down and back with the elbow lagging and the blade feathering on the return,
  then eases into a swept-back glide pose. Rear flippers paddle to steer, and the
  shell pitches gently with each stroke.

Tuning parameters:

- **Swimming speed, turning, spacing and island distance:** `MOVEMENT` in
  `src/lib/marine-motion.ts` (see `docs/marine-navigation.md` for every setting
  and a tuning guide).
- **Stroke frequency and amplitude:** `SWIM_RIGS` in `src/lib/marine-rigs.ts`:
  `frequency` (strokes per second at cruise, scaled by speed via `strokeFrequency`),
  `tailAmplitude`, `envelope`, `wavelength`, `lobes`, `dorsal`, `pectoral`, `roll`
  and `bend` for sharks; `flap`, `waveLag`, `twist`, `glideDihedral`,
  `turnAsymmetry`, `climbGain`, `bob` and `pitch` for the manta; `sweep`, `flex`,
  `tipLag`, `analLag`, `clavus` and `rudder` for the sunfish; `flap`, `sweep`,
  `feather`, `elbow`, `bout`, `glide` and `paddle` for the turtle.
- **Size in the scene:** `SIZE` in `src/components/home/three/animated-marine.tsx`.

Movement personalities: the whale shark cruises slowest with broad, gentle arcs and
barely rolls; the manta glides at slow to medium speed, weaves in wide turns with
deep banks and the largest rises and falls; the tiger shark cruises at medium speed
with confident curves and an occasional lazy roll; the great white is fastest,
holds a line and then turns decisively with a slight bank, with occasional surges
that quicken its tail beat. The ocean sunfish is the slowest: heavy and calm, it
drifts tilted onto its side through deeper water and turns reluctantly. The green
turtle cruises close to shore, calm but agile, alternating stroke bouts and long
glides.

Rebuild: `npm run build:species` (or `-- --only=tiger-shark`). Verify exports:
`npm run verify:marine` (rig bones, procedural deformation, loop continuity,
bounds, budgets) and `npm run verify:underwater`. The studio previews in
`docs/art-previews/` for these six species are real-time renders of the actual
assets with the app's lighting; the sunfish is shown upright (in the island it
swims tilted onto its side, as sunfish often do, so its disc reads from above).

References used for proportions and pattern placement:
- [Florida Museum: whale shark](https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/whale-shark/)
- [Florida Museum: tiger shark](https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/tiger-shark/)
- [Florida Museum: white shark](https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/white-shark/)
- [Manta Trust: reef manta ray](https://www.mantatrust.org/mobula-alfredi)
- [NOAA Fisheries: ocean sunfish](https://www.fisheries.noaa.gov/species/ocean-sunfish)
- [NOAA Fisheries: green turtle](https://www.fisheries.noaa.gov/species/green-turtle)

These simplified drafts still need human comparison against multiple views,
especially fin contours, mouth detail and individual marking variation, and the
swimming should be watched on physical hardware before release.
