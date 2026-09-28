# Species art direction and production plan

Approved direction: recognizable, polished stylized animals with accurate shapes
and markings. Collection cards use actual photographs. The island uses animated
3D animals. Photographs must not be replaced with AI illustrations presented as
real wildlife.

## Current inventory

The catalog contains **119 species** (the earlier rough count of 120 included a
non-entry match). All 119 have photo URLs, but none have recorded human identity
review. Eleven animated GLBs now exist: three family representatives and species
drafts for whale shark, tiger shark, great white shark, scalloped hammerhead, reef
manta ray, ocean sunfish, green sea turtle and bottlenose dolphin. The mapping in
`src/lib/swimming.ts` resolves these exact IDs before category fallbacks, and draws
two close relatives with them (great hammerheads as the scalloped hammerhead,
spinner dolphins as the bottlenose; like family representatives, these are not
offered as the relative's own 3D model). This is **8 of 119 species with dedicated
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
plans before expanding to all 119. The hammerhead, the turtle and a first cetacean
(the bottlenose dolphin) are done; a distinctive reef fish and an octopus remain.

The eight species drafts are implemented and can be opened from their species
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
| Scalloped hammerhead | A wide, flat, thin cephalofoil a quarter of the body length across, lofted as its own airfoil blade: an arched front margin with a central notch and shallow scallops, narrow lobes with the eyes at their tips, rear margins sweeping into the neck. A lean body (narrower and shallower than the great white's), a tall sickle-shaped first dorsal, a small second dorsal with a long free tip over a larger notched anal fin, falcate pectorals with dusky tips beneath, and an asymmetrical tail with a long, notched upper lobe; grayish bronze above, pale below | Agile and slightly serpentine: the wave starts in the mid-body (a lower envelope and shorter wave than the great white's) and swells toward the long upper lobe, while the head follows only 40% of the body's sway, so the hammer stays steady; 0.52 strokes/s | 4,108 | 163,936 |
| Bottlenose dolphin | Streamlined fusiform body; a short, stout beak set off by a crease from a rounded melon; a curved, backswept dorsal fin at mid-back; tapered, pointed flippers low on the flanks; a narrow, deep tail stock keeled above and below; horizontal flukes swept back to pointed tips with a central notch; a darker gray cape over paler flanks, a light belly and lower jaw, the mouth's upturned line and a blowhole | Up-and-down propulsion: the spine pitches (never yaws when swimming straight) in a wave that grows toward the flukes, which heave and angle into each beat while their tips flex; the head stays level; turns add a sideways bend; 0.78 beats/s | 3,682 | 144,372 |

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
  pectorals. The hammerhead's whole cephalofoil rides on `Head`, which follows only
  part of the body's sway (`headSteady`), so the wide head stays steady while the
  body swims behind it; it still leads into turns.
- **Bottlenose dolphin:** the shark's spine chain (`Root → Spine1 → Spine2 →
  RearBody → TailBase → Tail`), with the horizontal flukes on `Tail` and their tips
  on `FlukeL/R`, plus `Head` and `PectoralL/R`. The traveling wave runs in the
  vertical plane: each spine bone pitches (rotation about X) by the change in
  midline slope across its segment, so the tail stock heaves the flukes up and
  down. The flukes add their own pitch, trailing the stroke, so they angle into
  each beat, and their tips flex a little later still. The front body barely
  moves and the head stays level; turns add a sideways C-bend, and climbing pitches
  both flippers up. Nothing moves side to side while swimming straight.
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
  `tailAmplitude`, `envelope`, `wavelength`, `lobes`, `dorsal`, `pectoral`, `roll`,
  `bend` and `headSteady` for sharks; `tailAmplitude`, `envelope`, `wavelength`,
  `fluke`, `flukeLag`, `flukeFlex`, `heave`, `pectoral` and `bend` for the dolphin;
  `flap`, `waveLag`, `twist`, `glideDihedral`,
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
glides. The scalloped hammerhead is agile and curious: medium speed, the tightest
turns of the sharks with a moderate bank, mid-water, meandering in smooth arcs. The
bottlenose dolphin is the most playful: medium-fast with short bursts, the most
agile, swimming highest with the most rise and fall, and coming up now and then
until its dorsal fin breaks the surface (see `docs/marine-navigation.md`).

Rebuild: `npm run build:species` (or `-- --only=tiger-shark`). Verify exports:
`npm run verify:marine` (rig bones, procedural deformation, loop continuity,
bounds, budgets) and `npm run verify:underwater`. The studio previews in
`docs/art-previews/` for these eight species are real-time renders of the actual
assets with the app's lighting; the sunfish is shown upright (in the island it
swims tilted onto its side, as sunfish often do, so its disc reads from above).

The island's tuna school is not a glTF asset: each tuna is a low-poly mesh built at runtime
(`src/components/home/three/tuna-geometry.ts`, 167 triangles, or 83 in lite quality). It has a
spindle body, pointed snout, forked crescent tail, sickle fins and yellow finlets, metallic blue
above and silver below, and it swims in the vertex shader. `docs/art-previews/tuna.png` shows it
with the app's lighting; `docs/tuna-school.md` describes the school.

References used for proportions and pattern placement:
- [Florida Museum: whale shark](https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/whale-shark/)
- [Florida Museum: tiger shark](https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/tiger-shark/)
- [Florida Museum: white shark](https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/white-shark/)
- [Manta Trust: reef manta ray](https://www.mantatrust.org/mobula-alfredi)
- [NOAA Fisheries: ocean sunfish](https://www.fisheries.noaa.gov/species/ocean-sunfish)
- [NOAA Fisheries: green turtle](https://www.fisheries.noaa.gov/species/green-turtle)
- [Florida Museum: scalloped hammerhead](https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/sphyrna-lewini/)
- [NOAA Fisheries: common bottlenose dolphin](https://www.fisheries.noaa.gov/species/common-bottlenose-dolphin)
- [NOAA Fisheries: Atlantic bluefin tuna](https://www.fisheries.noaa.gov/species/atlantic-bluefin-tuna)

These simplified drafts still need human comparison against multiple views,
especially fin contours, mouth detail and individual marking variation, and the
swimming should be watched on physical hardware before release.
