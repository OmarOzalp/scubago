# Species art direction and production plan

Approved direction: recognizable, polished stylized animals with accurate shapes
and markings. Collection cards use actual photographs. The island uses animated
3D animals. Photographs must not be replaced with AI illustrations presented as
real wildlife.

## Current inventory

The catalog contains **140 species** (the first 120, plus twenty added in November 2026: rays, small
sharks, reef fish, macro animals and three whales and dolphins). All 140 have photos under CC0, CC BY or CC BY-SA (October 2026), each
looked over by eye on contact sheets for the right animal, alive and visible; 16 were
chosen by hand, twenty of them (`OVERRIDES` in `scripts/fetch-species-photos.ts`). Twenty-five animated GLBs now exist: three family
representatives and species drafts for whale shark, tiger shark, great white shark,
scalloped hammerhead, reef manta ray, ocean sunfish, green sea turtle, bottlenose
dolphin, day octopus, giant cuttlefish, giant moray, great barracuda, sailfish,
California sea lion, spotted eagle ray, golden jellyfish, ocellaris clownfish, and the
Open Ocean's humpback whale, sperm whale, oceanic whitetip shark, leatherback turtle and
oceanic manta ray. The
mapping in `src/lib/swimming.ts` resolves these exact IDs before category fallbacks,
and draws close relatives with them (great hammerheads as the scalloped hammerhead,
spinner dolphins as the bottlenose, the giant Pacific, blue-ringed, mimic and coconut
octopuses as the day octopus, the broadclub and flamboyant cuttlefish as the giant
cuttlefish, the green moray as the giant moray, chevron barracuda as the great
barracuda; like family representatives, these are not offered as the relative's own 3D
model). Before the reef animals no cephalopod had any island presence; squid and the
nautilus still have none. Before batch v4 no marine mammal but the dolphins and no
jellyfish had any either; the other mammals (the orca, the harbor seal, the sea otter,
the dugong and the manatee), the other turtles and the other jellies still have none. This
is **22 of 120 species with dedicated draft art**, not 120 approved models.

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

Rebuild: `npm run build:species` (or `-- --only=tiger-shark`), then slim what it wrote with
`node scripts/art/slim-marine.mjs` (or `--only=tiger-shark`): quantized with KHR_mesh_quantization and
about 40% smaller, with no visible change (see `docs/island-performance.md`). The GLB bytes in the
tables here are as built; `assets/models/marine/species-manifest.json` has the shipped sizes. Verify exports:
`npm run verify:marine` (rig bones, procedural deformation, loop continuity,
bounds, budgets; for the reef animals also their jet, fin fold, den rest and breathing
mouth) and `npm run verify:underwater`. The studio previews in
`docs/art-previews/` for these species are real-time renders of the actual
assets with the app's lighting; the sunfish is shown upright (in the island it
swims tilted onto its side, as sunfish often do, so its disc reads from above).

## Batch v3: reef animals

Three animals with body plans unlike any before, and their own habitats on the reef rather
than the open water (`docs/marine-navigation.md`, "Reef habitats"). Built the same way (one
design file each in `scripts/art/species/`, one skinned, vertex-colored draw call).

| Species | Model | Motion | Triangles | GLB bytes |
| --- | --- | --- | ---: | ---: |
| Day octopus | A rounded head with raised pale eyes (dark slit pupils), a pinched neck and a soft, faceted mantle sac rising behind it; eight tapering, slightly flattened arms spreading from a webbed crown; mottled reddish brown with darker blotches and pale spots above, lighter beneath with pale sucker dots. Drawn 1.1 units across its arms | Each arm walks in its own rhythm (its own phase and vigor), reaching forward and pressing down, with a slow curl wave running out to the tip, mirrored left to right; the mantle rides up and down and breathes. Resting, the tips coil and the mantle settles; jetting, the arms stream together behind the mantle as it squeezes and lowers into the line of travel; gliding after it, they loosen and drift; turning, they lag behind the turn. 0.34 strides/s | 1,820 | 114,564 |
| Giant cuttlefish | A broad, flattened oval mantle edged all round by a thin, continuous fin skirt with a pale margin; a short head with large eyes and W-shaped pupils; eight short arms held together in a cone in front; warm tan with dark mottling, cream flecks and a pale belly. Drawn 0.85 units long | No tail: a wave ripples backward along the fin skirt on both sides (fourteen fin bones), gentler and slower while it hovers, the outer side working harder in a turn; the arms sway and the upper pair lifts while it hovers, closing together as it speeds up; the mantle breathes. A jet squeezes the mantle and folds the skirt down; the head and arms lead into turns. 0.95 waves/s | 1,752 | 101,844 |
| Giant moray | A long, muscular, laterally compressed body (heavier than a snake: a broad head with heavy cheeks, a deep jaw, a narrow tail) with a continuous fin along the back and beneath the tail; a gape held slightly open, its lips parting from upper and lower teeth over a dark mouth lining; small eyes high on the snout; dark olive-green and brown with mottling. Drawn 1.65 units long | Swimming, a traveling wave runs down the whole body, growing toward the tail (anguilliform, unlike a shark's stiff front). Resting in its den, the part out of the rock lies in a gentle S, swaying slowly, the head looking about and nodding as the mouth opens and closes with each breath (respiration, not a threat). Turns bend the whole body. 0.85 waves/s | 1,320 | 68,488 |

### Rigs

- **Day octopus:** `Root` at the crown, `Mantle` (scaled as it breathes and squeezes), and
  four bones down each arm (`ArmL1_1`–`ArmR4_4`). Each arm bone bends about its own axes,
  whichever way the arm points (a closed-form rotation in `marine-rigs.ts`), so a reach,
  a press and a curl read the same on every arm. Inputs beyond speed and turn: `rest`,
  `jet` and `ground` (walking on the bottom, or gliding off it).
- **Giant cuttlefish:** `Root`, `Mantle` (scaled), `Head`, seven fin bones a side along
  the skirt (`FinL1–7`, `FinR1–7`, each hinged along the mantle's edge there) and two bones
  for each pair of arms. Inputs: speed (hovering below cruise), turn, climb and `jet`.
- **Giant moray:** `Root`, `Head`, `Jaw` and a chain of eight body bones (`Body1–8`); the
  jaw opens about the corner of the mouth, and the lips are separate vertices so the mouth
  truly opens. Inputs: speed, turn and `rest`.

Tuning: `SWIM_RIGS` in `src/lib/marine-rigs.ts`: for the octopus `frequency`, `phases` and
`vigor` (per arm), `curl`, `curlLag`, `reach`, `press`, `coil`, `settle`, `breath`,
`mantle`, `bob`, `trail`, `squeeze`, `streamline` and `swirl`; for the cuttlefish
`frequency`, `waveLag`, `amplitude`, `hover`, `turnAsymmetry`, `sway`, `raise`, `trail`,
`breath`, `squeeze`, `fold`, `bob` and `pitch`; for the moray `joints`, `frequency`,
`wavelength`, `amplitude`, `headAmplitude`, `envelope`, `bend`, `drape`, `sway`, `look`,
`gape`, `breathRate` and `curve`. Their behavior (walks, jets, hovering, dens) and color
states are `REEF` in `src/lib/reef-life.ts`; their sizes `REEF_SIZE`. On the island, their
colors change with what they do (the octopus darker resting and wary, brighter jetting;
the cuttlefish bolder gliding and darker, high-contrast when startled) through a per-animal
tone in their material, not new vertex colors. Their tap targets are simple shapes
(`TAP_SHAPES` in `tap-target.ts`), never their arms or long bodies.

Previews: `docs/art-previews/day-octopus.png`, `giant-cuttlefish.png` and `giant-moray.png`
(the same studio framing as the others, walking, cruising and swimming).

## Batch v4: six more animals

Six animals chosen to be told apart at a glance by shape, swimming and numbers (the full
behavior is in `docs/marine-navigation.md`). Built the same way, one design file each in
`scripts/art/species/`; the fish reuse the sharks' lofted body (`shark.ts`, whose
`midlineFin` now takes a `chordPoints` count for a long-based fin such as the sail), the ray
the manta's airfoil sheet.

| Species | Model | Motion | Triangles | GLB bytes |
| --- | --- | --- | ---: | ---: |
| Great barracuda | A long, slender silver torpedo with a pointed head and a jutting lower jaw lined with fangs; about twenty dark bars across the blue-gray back and black blotches low on the rear flanks; two small dorsal fins set far apart, small low pectorals and a forked tail with pale tips. Drawn 1.6 units long | Stiff and subcarangiform, the stroke in the rear third and the tail. Lurking, it hangs all but still (`hover`: an eighth of its stroke left), only the pectorals sculling; a dash beats hard. 0.82 beats/s | 4,336 | 188,396 |
| Sailfish | A long, slim body behind a spear of a bill; a huge sail of a first dorsal fin, taller than the body is deep, navy with black spots; long thin pelvic streamers; a keeled tail stock and a tall crescent tail; dark metallic blue above, silver below, rows of pale blue spots on the flanks. Drawn 2.2 units long | Near-thunniform: a stiff body, the stroke packed into the tail. The sail is a scaled bone (`Dorsal`): half raised cruising, fully raised in a display, folded flat into its groove for a dash. 0.95 beats/s | 4,836 | 216,852 |
| California sea lion | A sleek brown torpedo on a long, thick neck; a dog-like head with big dark eyes, small ear flaps, a black nose and long pale whiskers; long, broad, near-black fore flippers; short hind flippers trailing together, fanning to their toes. Drawn 1.35 units long | A new `pinniped` rig: bouts of one or two strokes of the fore flippers (raised and forward, then down and back until they press along the flanks), then a glide with them held there; the body heaves a little with each stroke, bends right round in turns, the head leads on its neck and looks about as it glides; the hind flippers trail and follow the curve. 0.8 strokes/s | 3,432 | 139,692 |
| Spotted eagle ray | A diamond of long, pointed, swept-back wings (a convex leading edge, a concave trailing edge), a domed head jutting ahead of them in a flat duck-bill snout, a very long whip of a tail; inky blue-black above with seventy-odd white spots and rings scattered at random, white below. Drawn 1.4 units across | The manta's rig (`manta`), quicker and deeper: steady wingbeats travel out to the tips, the tail trails its own slow wave and swings in turns. 0.5 beats/s | 3,612 | 177,780 |
| Golden jellyfish | A deep, rounded, translucent bell (per-vertex alpha, see below), golden amber richest over the crown, paler toward the scalloped margin; under it a stout column dividing into eight thick, frilly, three-winged oral arms, each ending in a short pale club. Drawn 0.48 units across | A new `jelly` rig: each pulse squeezes the bell quickly (`Rim` scaled most, `Bell` half as much) and relaxes it slowly, the arms swinging in and out behind it with a lag growing down each arm; the bell tilts into its drift and into turns and turns slowly about its axis. 0.9 pulses/s | 2,400 | 118,376 |
| Ocellaris clownfish | A small, deep, oval body with a blunt snout and big eyes; bright orange with three white bands edged in black (a head bar bowing back behind the eye, a middle bar bulging forward, a narrow tail bar); a notched dorsal fin, rounded anal fin and tail, and paddle pectorals, every fin rimmed in black. Drawn 0.46 units long | The sharks' rig with a new pectoral `row`: hovering, it rows with its pectorals, one after the other (sweeping back broadside and returning feathered), the tail all but still; darting, the whole deep body wags. 2.1 beats/s | 3,900 | 165,024 |

### Rigs and building blocks

- **Pectoral rowing** (`pectoral.row` on a shark rig): a fore-and-aft sweep with a feathering
  twist, the right fin half a stroke behind the left, stronger as a hovering fish's tail rests.
- **Hover** (`hover`): the share of the stroke a fish keeps at its slowest, so a lurking
  barracuda barely flickers while its pectorals scull harder.
- **Sail** (`sail: { folded, cruise }`): the `Dorsal` bone's height scales between folded (7%)
  and fully raised; `SwimDrive.sail` sets it, folding quickly (rate 3.5) and rising slowly (1.8).
- **Pinniped** (`PINNIPED_BONES`): the sharks' spine chain (`Head` at the neck's base), the fore
  flippers in two parts (`ForeL1` the arm, `ForeL2` the hand) and `HindL/R`. Its bouts of strokes
  and glides share the turtle's stepping (`stepBouts`). Inputs: speed, turn, curvature, climb.
- **Jelly** (`JELLY_BONES`): `Root`, the scaled `Bell` and `Rim`, and two bones down each of the
  eight arms (`Arm1A`, `Arm1B`, …; their directions `jellyArmAngle`). Its slow turn rides the
  rig's own slow phase (`spin`), never baked into the swim clip.
- **Translucency.** `MeshBuilder` takes an optional alpha per vertex (an `RGBA` color); any
  translucent vertex makes the GLB's colors RGBA and its material blended (`alphaMode: BLEND`),
  and three.js reads the alpha from the vertex colors. The jellyfish's triangles are ordered so
  that, drawn in index order through the translucent bell, the arms show, then its inside, then
  its outside.

Tuning: `SWIM_RIGS` in `src/lib/marine-rigs.ts` (for the pinniped `frequency`, `flap`, `sweep`,
`feather`, `wrist`, `glideSweep`, `glideDroop`, `bout`, `glide`, `pitch`, `bob`, `wave`, `bend`,
`head`, `lead`, `look`, `lookRate`, `rudder`, `splay`; for the jelly `frequency`, `squeeze`,
`stretch`, `contract`, `sway`, `lag`, `trail`, `tilt`, `spin`, `bob`). The clownfish's anemone is
not a glTF asset: `src/components/home/three/reef-anemone.tsx` builds it at runtime (a magenta
column under a crown of seventy round, finger-like tentacles, sand-colored with lime tips: about
2,000 triangles, 1,160 in lite), and sways the tentacles on the CPU.

Previews: `docs/art-previews/great-barracuda.png`, `sailfish.png`, `california-sea-lion.png`,
`spotted-eagle-ray.png`, `golden-jellyfish.png` and `clownfish.png` (the same studio framing), and
`island-batch-v4.png`: the six around a level 3 island as the app's camera sees them, eight
seconds apart (left: the eagle-ray squadron, the barracuda, the sailfish cruising, the jellyfish
swarm and the clownfish's anemone; right: the sailfish rolled into its display, the sea lions).

## Batch v5: the Open Ocean

The first animals of the archipelago's Open Ocean (`docs/archipelago.md`), chosen for the
deep blue around the islands. Built the same way, one design file each in
`scripts/art/species/`. The whales and the whitetip use the sharks' lofted body (`shark.ts`),
and the oceanic manta uses the reef manta's sheet: `reef-manta.ts` now exports `buildManta(look)`, a
`MantaLook` giving the markings, mouth and belly spots. The reef manta's model rebuilds byte for
byte. All are within the 5,000-triangle, 220 KB budget (`npm run verify:marine`).

| Species | Model | Motion | Triangles | GLB bytes |
| --- | --- | --- | ---: | ---: |
| Humpback whale | A long, stout body with a broad, flat head; rows of knobs (tubercles) along the rostrum, a cluster on the chin; a long mouth line arching up and down to its corner; throat pleats from the chin to the navel; flippers a third of the body long, white, their leading edges scalloped with knobs; a small dorsal fin on a hump; broad flukes with a serrated trailing edge, white beneath with a black margin and blotches. Black above, pale below. Drawn 3.3 units long | The dolphin's `cetacean` rig, slow and deep: the flukes heave from far back, the long flippers stroke and bank in turns. 0.3 beats/s | 4,850 | 195,272 |
| Sperm whale | An enormous, box-like head a third of the body long, squared off in front, the single blowhole at its front left; a narrow, white-lipped lower jaw set far back underneath; small eyes and short paddle flippers behind the mouth's corners; wrinkled, prune-like skin behind the head; a low hump and a row of knuckles to the tail; broad triangular flukes. Dark slate with a brownish cast, pale squid-sucker scars on the head. Drawn 3.1 units long | `cetacean`, slower still and from farther back, its head steady. 0.26 beats/s | 4,800 | 186,672 |
| Oceanic whitetip shark | A stocky body behind a short, bluntly rounded snout; a very tall first dorsal fin with a broadly rounded top; enormous, long, broad pectoral fins with rounded tips; a heterocercal tail. Bronze-gray above, white below, every big fin tipped with mottled white. Drawn 2.3 units long | The great white's `shark` rig, slower, its pectorals held out and turning more. 0.46 beats/s | 3,768 | 152,812 |
| Leatherback turtle | A long, tapering, leathery carapace with seven ridges running its length to a point over the tail, dark and finely speckled white; a pale, mottled plastron; a small head with a notched upper jaw and the pink spot on its crown; enormous clawless front flippers, half the body long, their roots and shoulders under the shell's edge; small rear flippers webbed to the tail. Drawn 1.5 units long | The green turtle's `turtle` rig, deeper and slower, in bouts of two to four strokes with long glides. 0.34 strokes/s | 2,680 | 130,644 |
| Oceanic manta ray | The reef manta's sheet, larger. On a jet-black back, bright white shoulder patches shaped like right triangles: their front edges run straight across behind the head and their inner edges along the spine, leaving a black "T", and they shade to gray toward the rear. Below: a black mouth and dark-gray chin, broad charcoal margins along the back and tips of the wings, dark spots low on the belly behind the gills. Drawn 2.6 units across | The reef manta's `manta` rig, slower. 0.25 beats/s | 3,608 | 157,280 |

The oceanic manta's shoulder patches are laid on the back as their own thin skin (like the
mouth and gill decals), following the sheet and its wing bones: painted into the sheet's vertex
colours, a straight diagonal edge falls between its vertices and turns into a staircase.

Previews: `docs/art-previews/humpback-whale.png`, `sperm-whale.png`, `oceanic-whitetip.png`,
`leatherback-turtle.png` and `oceanic-manta.png` (the same studio framing), and
`island-open-ocean.png`: the five around a level 4 island as the app's camera sees them, 22
seconds apart (left: the oceanic manta, the whitetip and the sperm whale; right: the humpback,
the sperm whale and the leatherback).

## Batch v6: the Kelp Forest

The first animals of the Kelp Forest's island (`docs/kelp-forest.md`). Built the same way, one
design file each in `scripts/art/species/`, all on the sharks' lofted body (`shark.ts`). The seal
and the otter use the sea lion's `pinniped` rig with a new `stroke`: `'hind'` (a true seal's lateral
sweeps of its rear body and hind flippers, fore flippers pressed to its flanks) and `'otter'`
(dorsoventral undulation and paddling hind feet, and a resting curl for floating on its back).
All are within the 5,000-triangle, 220 KB budget (`npm run verify:marine`).

| Species | Model | Motion | Triangles | GLB bytes |
| --- | --- | --- | ---: | ---: |
| Harbor seal | A plump, spindle-shaped body; a big round head on a short neck, with a steep forehead over a short, blunt, dog-like muzzle, a V of nostrils on top, big dark eyes and beaded whiskers, and no ear flaps; short, stubby fore flippers with dark claws tucked in under the chest along the belly; broad, fan-shaped hind flippers held close together behind the hips in a shallow V. Silvery gray, darker along the back, dappled with dark spots of every size, a few ringed pale, sparser and paler toward the belly | `pinniped`, `stroke: 'hind'`: the rear body and hind flippers sweep from side to side, the flippers beating alternately; short bouts and long glides. 0.9 strokes/s | 4,162 | 188,992 |
| Sea otter | A long, supple body in dense, dark chocolate fur frosted with paler guard hairs; a broad, round, pale cream-gray head with a short, blunt muzzle, dark nose, long pale whiskers and small rounded ears; short forelegs with mitten paws; a short, flat, broad tail with a rounded end; big webbed hind feet | `pinniped`, `stroke: 'otter'`: the body waves up and down and the hind feet paddle in quick bouts. At rest (`pose.rest`) it curls belly-up: head and feet raised, paws on its chest, the stroke stilled (the motion rolls it onto its back). 1.15 strokes/s | 3,262 | 133,620 |
| Garibaldi | A deep, oval, compressed body (its depth nearly half its length) with a steep, rounded forehead and small mouth; one long dorsal fin, low in front and rising to a rounded soft rear; a rounded anal fin; a broad tail with rounded lobes and a shallow fork; paddle pectorals. Brilliant orange all over, fins included, a touch deeper on the back; large eyes ringed in orange, set on the side of the head | The sharks' `shark` rig as a hovering fish: rows with its pectorals, the body nearly still, darting with quick tail beats. 1.6 beats/s | 3,328 | 133,904 |
| Leafy seadragon | An S-shaped body in bony rings: a small, horse-like head bowed a little on an arched neck, a long tubular snout, a deep, pot-bellied trunk, and a long, thin, finless tail curling down; rounded, frond-like lobes on short spines from the head, back, belly and tail, largest over the back and belly; tiny see-through dorsal and pectoral fins. Yellow-ochre and olive with thin pale bands, rosy on the head, the leaves yellow-green | `shark`, almost stiff: the tiny fins flutter and the body barely bends. 1.4 beats/s | 3,768 | 153,380 |
| Orca | A robust body with a blunt, rounded head, the melon swelling over a short, broad snout, and no beak; a tall, triangular dorsal fin standing straight up; big, broad paddle flippers; a thick tail stock and broad flukes. Glossy black, with crisp white markings (a long oval patch above and behind each eye, sloping up toward its rear; the chin and throat; a band down the belly sweeping high up into a lobe on each flank behind the dorsal fin; the flukes' undersides) and a pale gray saddle behind the dorsal fin | The dolphin's `cetacean` rig, stronger and slower: powerful beats of the broad flukes, the dorsal fin steady. 0.48 beats/s | 4,314 | 165,928 |

The orca's white is crisp along every curve: the body's columns meet in a seam that follows the white's
edge (`ORCA.boundary` is the edge itself, its gap 0.025 radians), so the chin, belly band and flank lobe
change colour exactly there, and the eye patches are smooth oval decals laid on the skin. Painted into
the vertex colours with a soft boundary, the white stepped between vertices like a staircase, and an
early, pointed snout read as a dolphin's beak. The seal's spots are small decals thrown at random over its back and flanks (none crowding another), since
noise painted into the vertex colours fell between the vertices and blurred away.

Previews: `docs/art-previews/harbor-seal.png`, `sea-otter.png`, `garibaldi.png`,
`leafy-seadragon.png` and `orca.png` (the same studio framing), and `island-kelp-forest.png`: the
five at a level 3 Kelp Forest island as the app's camera sees them, 22 seconds apart.

## Batch v7: the Volcanic Pinnacle

The first animals of the Volcanic Pinnacle's island (`docs/volcanic-pinnacle.md`), all on the sharks'
lofted body (`shark.ts`) and `shark` rig. The four fish and sharks were drafted in parallel, each
from the field marks, a reference and an existing design as a template, then reviewed in studio
sheets and in the scene and refined; the iguana's legs are tubes along smooth paths (`tube()` in its
design file), its crest a row of conical spines. All are within the 5,000-triangle, 220 KB budget
(`npm run verify:marine`).

| Species | Model | Motion | Triangles | GLB bytes |
| --- | --- | --- | ---: | ---: |
| Marine iguana | A short, blunt, box-like head with heavy jowls, crusted with pale salt and knobbly scales, small eyes in scaly lids; a thick neck and stout body; a long tail flattened side to side, more than half its length; a crest of spines from the nape (tallest there, pale-tipped) down the back and tail; short legs folded back along the flanks, long clawed toes trailing. Sooty black, mottled rust red and dull green on the flanks | `shark` as a lizard: the tail sweeps in waves that grow toward the tip, whose last third whips on `TailUpper` (`lobes` with a 0° angle flex it sideways, lagging the stroke); the head held steady (`headSteady`), the forelegs on the pectoral bones. 0.8 strokes/s | 4,400 | 180,152 |
| Galápagos shark | A classic requiem shark: streamlined, a broadly rounded snout, round eyes; a tall, slightly falcate first dorsal over the pectorals' free rear tips and a low interdorsal ridge; long, sickle-shaped pectorals; a heterocercal tail with a subterminal notch. Bronze-gray above, white below, a faint pale band on the flank; fin tips and rear margins dusky | Steady, confident tail beats, the front stiff. 0.55 beats/s | 4,196 | 167,356 |
| Pelagic thresher | A slim torpedo deepest over the pectorals (the body ends about halfway along it), a short conical snout and large round eyes set flush, a blue-gray iris round the pupil; long pectorals swept back, tapering to broad rounded tips; a slightly falcate first dorsal nearer the pectorals than the pelvics; big pelvic fins; the tail half its length: a scythe of an upper lobe, broad where it leaves the body, then a long, narrowing blade curving up to a notch and a small terminal lobe, above a short, falcate lower lobe. Metallic deep blue with a violet cast, a silvery sheen low on the flanks, a crisp white belly under the pectoral bases | A nearly still body sweeps the long tail in one smooth arc (a long body wave, 1.9 body lengths), the lobe trailing a little on `TailUpper`, weighted in a ramp along it so it bends rather than hinges. 0.5 beats/s | 4,780 | 187,040 |
| Giant trevally | A deep, compressed jack with a steep, blunt forehead, a large eye set low and forward and a sloping mouth; a low spiny first dorsal; the second dorsal and anal fins each a tall sickle lobe on a long low base; long sickle pectorals; a very narrow tail stock keeled with a row of darker scutes; a deeply forked tail. Silver, dark slate above, finely speckled, the fins dusky, the tail darkest | A stiff body, quick strong beats in the tail stock and forked tail. 1.1 beats/s | 4,144 | 182,668 |
| King angelfish | A deep disc of a body, very compressed, with a steep forehead, a short snout, a small mouth and a spine at the corner of the gill cover; dorsal and anal fins sweeping back into long pointed streamers level with the tail tip; a rounded-square tail; long white pelvic fins. Slate navy with fine pale dots, one crisp white bar behind the head, the dorsal and anal fins edged in bright turquoise, a yellow-orange tail | `shark` as a hovering fish: rows with its pectorals, its dorsal swaying. 1.5 beats/s | 4,388 | 191,292 |

The angelfish's dorsal and anal fins are free outlines (`sailFin`, `leafFin` in its design file),
since a midline fin can't sweep back into streamers; its white bar is a decal ribbon, so its edges
are crisp. The thresher's whole caudal fin is one blade of its own, sliced by vertical chords (its
outline drops to the lower lobe's tip, back up to the fork and along the blade to its notch), and
its eyes are finer domes than the kit's, so they stay round up close. Its first draft, a narrow
strap of a tail that snaked like a whip behind straight, airplane-like pectorals, was redrawn
from the species' proportions.

Previews: `docs/art-previews/marine-iguana.png`, `galapagos-shark.png`, `thresher-shark.png`,
`giant-trevally.png` and `king-angelfish.png` (the same studio framing), and
`island-volcanic-pinnacle.png`: the island's animals at a level 4 island as the app's camera sees them.

The island's tuna school is not a glTF asset: each tuna is a low-poly mesh built at runtime
(`src/components/home/three/tuna-geometry.ts`, 167 triangles, or 83 in lite quality). It has a
spindle body, pointed snout, forked crescent tail, sickle fins and yellow finlets, metallic blue
above and silver below, and it swims in the vertex shader. `docs/art-previews/tuna.png` shows it
with the app's lighting; `docs/tuna-school.md` describes the school.

## Batch v8: the Mangroves & Seagrass

The first animals of the Mangroves & Seagrass island (`docs/mangroves.md`). Each was drafted in its
own design file over many rounds of studio renders (side, top, front, below, head close-ups and swim
strips), then reviewed against the species' real proportions and corrected. The sharks, the sawfish
and the tarpon are on the sharks' lofted body (`shark.ts`) and `shark` rig, the dugong on the
`cetacean` rig with its vertical fluke beat, and the stingray on the `manta` rig. All are within the
5,000-triangle, 220 KB budget (`npm run verify:marine`).

| Species | Model | Motion | Triangles | GLB bytes |
| --- | --- | --- | ---: | ---: |
| Dugong | A plump spindle of a body with a narrower head; the muzzle bent sharply down into a broad, bristled disc whose lower lip hangs below the chin, crescent nostrils on top at the very front; small eyes well back; short, rounded paddle flippers far forward; broad, whale-like flukes swept to points with a notched, concave trailing edge; no dorsal fin. Warm slate grey-brown, paler and pinker below, softly mottled, with pale rake scars | `cetacean`: slow, deep beats of the flukes, the heavy body barely flexing, the flippers steering. 0.42 beats/s | 4,762 | 202,936 |
| Largetooth sawfish | A ray built like a shark: a long, flat saw (about a fifth of its length) set with evenly spaced peg teeth along both edges, rigid on the head bone; a flat, triangular head with small eyes and spiracles on top, the mouth and five gill slits underneath; broad, angular pectorals running on from the head; two tall dorsals of nearly equal size, the first rising in front of the pelvics; a shark-like tail with a distinct lower lobe. Olive grey-brown above, cream below, ivory teeth | `shark`: slow, sinuous sweeps of the tail, the head and saw held steady (`headSteady`). 0.42 beats/s | 4,444 | 185,720 |
| Lemon shark | A stocky requiem shark with a short, broad, flattened snout; two dorsal fins of nearly equal size, the second almost as tall as the first; broad, slightly falcate pectorals. Muted khaki yellow above, paler yellowish flanks, cream below, the fins a little darker | `shark`: easy, steady beats. 0.5 beats/s | 4,772 | 189,436 |
| Southern stingray | A rhomboid disc a little wider than long, with angular outer corners and a slightly pointed snout, domed over the body and thin at the margins; raised eyes close together with the spiracles behind them, a row of small tubercles down the back; the mouth, nostrils and gill slits on the white underside; small rounded pelvic lobes; a whip of a tail longer than the disc with a serrated spine near its root and low folds above and below. Muddy olive-brown, softly mottled | `manta` as a stingray: a gentle ripple running back across the disc's edges (a long `waveLag` and small `flap`), the tail trailing. 0.7 ripples/s | 4,220 | 177,512 |
| Tarpon | A deep, compressed, straight-backed body with a narrow tail stock; a large head with a jutting lower jaw at the level of the eye's lower edge, the long gape sloping down and back below the huge gold eye; a bony plate along the throat; enormous round-edged scales in staggered rows; a single dorsal whose last ray trails back in a long filament, a falcate anal fin, a deeply forked tail. Dark blue-green back, bright silver flanks, white belly | `shark`: strong, quick beats in the tail stock and forked tail, the filament fluttering on the dorsal bone. 0.8 beats/s | 4,080 | 211,844 |

Review notes. The lemon shark's first draft was too bright a yellow and too round in the head: it is
a muted khaki now, flatter-headed and slimmer. The sawfish's trunk was flattened a little and made
greyer, so it doesn't read as the lemon shark's colour. The stingray's first swim flapped like an
eagle ray's: its beat is softer and its wave slower across the disc, so its edges ripple. The dugong's
flukes were widened (about 29% of its length) and its skin folds made fainter. The tarpon's first
draft had its jaw low and its mouth curving up to the eye, a fish's smile: its lower jaw now sits high
and its gape slopes down and back, as a tarpon's does. The manatee swims as the dugong for now, with
the dugong's pointed flukes rather than its own rounded paddle of a tail.

Previews: `docs/art-previews/dugong.png`, `sawfish.png`, `lemon-shark.png`,
`southern-stingray.png` and `tarpon.png` (the same studio framing), and `island-mangroves.png`:
the island's animals at a level 4 island as the app's camera sees them.

## Batch v9: the Coral Reef and the Shipwreck

Six animals for Home's own island (`docs/coral-reef.md`), which until now swam as family models (or,
like the hawksbill, not at all), and five for the Shipwreck (`docs/shipwreck.md`). As before, each
was drafted in its own design file over many rounds of studio renders, then reviewed against the
species' real proportions and corrected. The sharks and fish are on the sharks' lofted body
(`shark.ts`) and `shark` rig, the three reef sharks sharing a crisp-edged fin lofter, eye and
nostril decals (`reef-sharks.ts`); the turtles share a scute-by-scute shell, head and flippers
(`hard-shell.ts`) on the `turtle` rig. All are within the 5,000-triangle, 220 KB budget
(`npm run verify:marine`).

| Species | Model | Motion | Triangles | GLB bytes |
| --- | --- | --- | ---: | ---: |
| Grey reef shark | A sturdy requiem shark with a broadly rounded snout and big round eyes; a plain first dorsal over the pectorals' free tips; a broad, crisp black margin along the whole back edge of the tail; dusky tips under the pectorals and on the pelvics, second dorsal and anal fin. Cool slate grey, white below | `shark`: quick, easy beats. 0.6 beats/s | 3,924 | 160,144 |
| Blacktip reef shark | Smaller and slimmer, with a short, blunt snout; every fin tipped ink black, the first dorsal's black tip set off by a pale band, the tail's back edge black; a pale wedge along the flank above the pelvics. Sandy grey-brown, white below | `shark`: quicker, shallower beats with a little more roll. 0.8 beats/s | 3,924 | 159,968 |
| Whitetip reef shark | Slender and lithe, with a short, very blunt, flat snout, tubular flaps at the nostrils and a ridge over each eye; the first dorsal set well back, the second dorsal and anal fin nearly as big; bright white tips on the first dorsal and both tail lobes; a few dark spots. Warm brownish grey | `shark`: slow and sinuous, the head steady, still as it rests (`hover`). 0.7 beats/s | 3,768 | 157,408 |
| Hawksbill turtle | A narrow head drawn out into a sharp, hooked beak, two pairs of plates between the eyes; an oval shell of thick, overlapping scutes, its back edge serrated; amber and honey tortoiseshell streaked dark brown and black and flared with gold; dark, cream-edged scales on the head and long fore flippers, two claws on each | `turtle`: quicker strokes and shorter glides than the green turtle's. 0.47 strokes/s | 2,706 | 138,856 |
| Napoleon wrasse | A deep, compressed body under a bulging hump of a forehead; thick, fleshy lips the colour of its face; a long dorsal and anal fin darker at the base, a rounded tail; teal-green, a dark bar on every scale, wavy blue-green and yellow-green lines over the head, two dark lines back from each eye | `shark`: rows on its broad pectorals, the tail slow, hanging still at low effort. 0.6 beats/s | 4,324 | 203,308 |
| Bumphead parrotfish | A deep body behind a near-vertical, bulbous forehead; pale, knobbly fused tooth plates for a beak; big scales; dark green, the bump and face paler, flushing pink at the front | `shark`: rows on its pectorals, slow tail beats. 0.7 beats/s | 4,246 | 194,148 |
| Sand tiger shark | Bulky and a little humpbacked, with a conical, pointed snout and small eyes; ragged, needle-like teeth jutting from both jaws even with the mouth closed; two big dorsals of nearly the same size set far back, a large anal fin; a long upper tail lobe and a short lower one; bronze, with reddish-brown spots on its rear half | `shark`: slow sweeps, almost motionless at low effort (`hover`). 0.38 beats/s | 4,346 | 184,956 |
| Loggerhead turtle | A huge, broad, blocky head with massive jaws (a third of the shell's width, a little exaggerated to read from above); a reddish-brown, heart-shaped shell of five pairs of costal scutes, with a few pale barnacles; reddish-brown head and flippers edged in cream, yellowing below; short, thick fore flippers | `turtle`: slower, heavier strokes and longer glides. 0.37 strokes/s | 2,714 | 126,944 |
| Goliath grouper | Massive and thick, with a broad, flat-topped head, a wide mouth with a jutting lower jaw and small eyes; a low spiny dorsal, rounded soft fins and tail; olive-brown with faint darker bars and small dark spots over the head and fins | `shark`: slow, heavy beats, barely moving at low effort. 0.45 beats/s | 4,464 | 205,804 |
| Lionfish | Banded all over in maroon and cream, broad and thin bars; thirteen long, separate, banded pectoral rays a side spread into feathery fans over a rosy web; thirteen banded dorsal spines like a mane; tentacles over the eyes and tabs by the mouth; spotted soft fins | `shark`: hovers, the fans breathing slowly and the mane swaying. 0.5 beats/s | 3,421 | 202,248 |
| Batfish | The longfin batfish: a deep, compressed, silvery disc of a body with tall dorsal and anal fins swept back into a great diamond; a dark band through the eye and another behind the head; long yellow pelvic fins; a dark smudge at the front of the belly. Listed a few degrees so it shows from above | `shark`: gentle beats, gliding. 0.75 beats/s | 4,288 | 167,640 |

Review notes. The reef sharks first read alike from above: the grey reef is a cooler slate grey
now and the whitetip a warmer brown-grey. Their pelvic fins closed to a long needle that read as a
stray stick and are blunt now. The Napoleon wrasse's first lips were an orange duck's bill; they are
the colour of its face now, set back as a fleshy rim, and its body and fins are deeper. The
hawksbill's fore flippers were lengthened (a quarter) and its shell toned from orange to amber. The
batfish is drawn after the longfin batfish; the circular batfish in the catalog swims as it. Other
fellow species borrow these too: the potato cod, the giant grouper and the giant sea bass swim as the
goliath grouper, and the olive ridley turtle as the loggerhead.

Previews: `docs/art-previews/island-coral-reef.png` and `island-shipwreck.png`, each island's
animals as the app's camera sees them.

## Batch v10: bull shark, bull ray and cownose ray

Three animals that swam as a relative's model (the bull shark as the generic shark, the two rays as the
spotted eagle ray) now have their own. The bull shark is on the reef sharks' lofted body and crisp fin
lofter (`bull-shark.ts`, `shark.ts`, `reef-sharks.ts`); the two rays share a new lofter
(`eagle-rays.ts`: the spotted eagle ray's airfoil-sheet disc and head loft, with the planform, head,
snout notch, colours and markings given by a design) and each is a short design file (`bull-ray.ts`,
`cownose-ray.ts`). The spotted eagle ray's own file is untouched. After the fidelity pass (below) all
three have a per-species budget of 8,000 triangles and 340 KB in `scripts/verify-marine.mjs`
(`BUDGETS`); every other model keeps 5,000 / 220 KB.

| Species | Model | Motion | Triangles | GLB bytes |
| --- | --- | --- | ---: | ---: |
| Bull shark | Very stout and humpbacked, with a very short, broad, blunt snout and small round eyes; a big, tall, triangular first dorsal over the pectorals' free tips, a low ridge to a small second dorsal; broad, triangular pectorals; warm grey above with a faint pale flank band, white below; dusky tips on the pectoral undersides, second dorsal, anal fin and lower tail lobe | `shark`: slow, powerful beats, the heavy body hardly bending. 0.42 beats/s | 5,840 | 135,876 (228,492 as built) |
| Bull ray | A broad, flattened-diamond disc with a nearly straight leading edge, sharp, swept tips and a concave rear edge; a short, blunt, duck-billed head with a bulging brow, set apart from the wings; olive-brown, paler along the midline, crossed by faint pale bars from the midline out over the wings; white below with dusky margins; a very long whip tail, tiny dorsal fin and a pale spine | `manta`: slow, deep wingbeats (0.36/s) with a lazy glide, always alone or with one other | 4,152 | 107,276 (181,412) |
| Cownose ray | A kite-shaped disc of long, pointed, swept-back wings with a concave rear edge; a broad, flat, projecting head whose snout is notched into two lobes (the cow nose), eyes out on its sides; plain golden brown above, no markings, white below; long thin tail, small dorsal fin, spine | `manta`: quick, whippy wingbeats of the pointed wings (0.68/s), flown as a school of three or four in loose formation | 3,940 | 98,812 (166,144) |

Review notes. The first renders of the rays had the same fan-shaped disc: the bull ray's was lengthened
and rounded (the tips only a little behind the middle of the disc) and the cownose's wings given
pointed, strongly swept tips, so they read apart from each other and from the spotted eagle ray, whose
wings are long and narrow, from above. Colour does the rest at island scale: the spotted eagle ray is
blue-black with white spots, the bull ray olive with pale bars, the cownose ray golden brown. The
bars were first bright white and are now faint and bluish, as in the photographs. The bull shark's
first dorsal was a thin spike and was widened into the broad triangle the species has. The hull
table (`marine-bodies.ts`) rows for the three were measured over the swimming stroke. Fellow species:
the bat ray still flies as the spotted eagle ray. `verify:marine` also failed before these animals on
five older hull rows (reef fish, California sea lion, golden jellyfish, harbor seal, leafy seadragon:
each a few hundredths short of what its clip reaches); those rows were widened to the measured reach.

Fidelity pass (side-by-side sheets of render against CC photographs, read in the studio: the sheets are in the
working notes, `sheet-bull-ray-1` to `-3`, `sheet-cownose-1`, `sheet-bull-shark-1` and `-2`).
- Bull shark: stouter through the shoulders and belly (girth profiles scaled by up to 7% above and 10%
  below), warmer tan-grey back (sampled from three photographs), larger and broader pectorals, a wider
  gape curling up toward the eyes with real teeth (15 broad upper and 14 narrow lower little pyramids),
  slightly larger eyes with a lid ring; 5,840 triangles (smoother rings and more columns).
- Bull ray: a flattened diamond about 1.9 times as wide as long (the first pass read as a dome, then as a
  lens, from above): a nearly straight, slightly bowed leading edge running back to sharp, swept tips just
  behind the middle of the disc, a concave rear edge, a wider, flatter, flaring head lobe with larger eye
  domes, seven curved pale bars that follow the wing, a bulging brow and spatulate bill, a layered eye
  (lid, iris, pupil), dark spiracle slits behind the eyes, a mouth and nostril slits under the head, and a
  taller, swept, pale tail spine with a second blade behind it.
- Cownose ray: a true kite (long falcate tips, strongly concave rear edge), a notch about twice as deep
  and wide, the same eye, spiracle, mouth and spine details, plain golden back kept.
- Swimming: `MantaRig` gained optional `bout` and `glide` (as the turtles'). The bull ray flies 3 to 4
  slow deep strokes, then glides 3 to 6 s; the cownose ray 4 to 8 quick strokes, then 1.2 to 2.6 s. The wave
  still travels outward (segment amplitudes 0.10 to 0.24 and 0.10 to 0.28 rad, lagging by 0.34 and 0.30
  rad per segment); other rays are unchanged.
- Hull rows for the three were widened to their measured reach (bull shark crest .62 and width .72, bull ray
  crest .27 and width .63, cownose ray crest .26 and width .58).

Previews: `docs/art-previews/bull-shark.png`, `bull-ray.png` and `cownose-ray.png` (studio renders of the
actual assets with the app's lighting: top, side, front, three-quarter, underside and head close-up) and
`island-batch-v10-bull.png` (the spotted eagle ray, bull ray, three cownose rays and the bull shark as
the island's camera sees them).

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
- [WoRMS: Octopus cyanea](https://www.marinespecies.org/aphia.php?p=taxlist&tName=Octopus%20cyanea)
- [WoRMS: Sepia apama](https://www.marinespecies.org/aphia.php?p=taxlist&tName=Sepia%20apama)
- [WoRMS: Gymnothorax javanicus](https://www.marinespecies.org/aphia.php?p=taxlist&tName=Gymnothorax%20javanicus)
- [Florida Museum: great barracuda](https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/sphyraena-barracuda/)
- [NOAA Fisheries: Atlantic sailfish](https://www.fisheries.noaa.gov/species/atlantic-sailfish)
- [NOAA Fisheries: California sea lion](https://www.fisheries.noaa.gov/species/california-sea-lion)
- [Florida Museum: spotted eagle ray](https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/aetobatus-narinari/)
- [WoRMS: Mastigias papua](https://www.marinespecies.org/aphia.php?p=taxdetails&id=135288)
- [WoRMS: Amphiprion ocellaris](https://www.marinespecies.org/aphia.php?p=taxdetails&id=278398)
- [NOAA Fisheries: humpback whale](https://www.fisheries.noaa.gov/species/humpback-whale)
- [NOAA Fisheries: sperm whale](https://www.fisheries.noaa.gov/species/sperm-whale)
- [NOAA Fisheries: oceanic whitetip shark](https://www.fisheries.noaa.gov/species/oceanic-whitetip-shark)
- [NOAA Fisheries: leatherback turtle](https://www.fisheries.noaa.gov/species/leatherback-turtle)
- [NOAA Fisheries: giant manta ray](https://www.fisheries.noaa.gov/species/giant-manta-ray)
- [NOAA Fisheries: harbor seal](https://www.fisheries.noaa.gov/species/harbor-seal)
- [U.S. Fish & Wildlife Service: southern sea otter](https://www.fws.gov/species/southern-sea-otter-enhydra-lutris-nereis)
- [WoRMS: Hypsypops rubicundus](https://www.marinespecies.org/aphia.php?p=taxlist&tName=Hypsypops%20rubicundus)
- [WoRMS: Phycodurus eques](https://www.marinespecies.org/aphia.php?p=taxlist&tName=Phycodurus%20eques)
- [NOAA Fisheries: killer whale](https://www.fisheries.noaa.gov/species/killer-whale)
- [Galápagos Conservancy: marine iguana](https://www.galapagos.org/about_galapagos/about-galapagos/biodiversity/reptiles/)
- [IUCN Red List: dugong](https://www.iucnredlist.org/species/6909/160756767)
- [Florida Museum: largetooth sawfish](https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/pristis-pristis/)
- [Florida Museum: lemon shark](https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/negaprion-brevirostris/)
- [Florida Museum: southern stingray](https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/hypanus-americanus/)
- [Florida Museum: tarpon](https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/megalops-atlanticus/)
- [Florida Museum: Galápagos shark](https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/carcharhinus-galapagensis/)
- [IUCN Red List: pelagic thresher](https://www.iucnredlist.org/species/161597/68607857)
- [FishBase: Caranx ignobilis](https://www.fishbase.se/summary/Caranx-ignobilis.html)
- [FishBase: Holacanthus passer](https://www.fishbase.se/summary/Holacanthus-passer.html)

These simplified drafts still need human comparison against multiple views,
especially fin contours, mouth detail and individual marking variation, and the
swimming should be watched on physical hardware before release.
- [FishBase: grey reef shark](https://www.fishbase.se/summary/Carcharhinus-amblyrhynchos.html)
- [FishBase: blacktip reef shark](https://www.fishbase.se/summary/Carcharhinus-melanopterus.html)
- [FishBase: whitetip reef shark](https://www.fishbase.se/summary/Triaenodon-obesus.html)
- [NOAA Fisheries: hawksbill turtle](https://www.fisheries.noaa.gov/species/hawksbill-turtle)
- [FishBase: humphead wrasse](https://www.fishbase.se/summary/Cheilinus-undulatus.html)
- [FishBase: green humphead parrotfish](https://www.fishbase.se/summary/Bolbometopon-muricatum.html)
- [Florida Museum: sand tiger](https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/carcharias-taurus/)
- [NOAA Fisheries: loggerhead turtle](https://www.fisheries.noaa.gov/species/loggerhead-turtle)
- [Florida Museum: goliath grouper](https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/epinephelus-itajara/)
- [FishBase: red lionfish](https://www.fishbase.se/summary/Pterois-volitans.html)
- [FishBase: longfin batfish](https://www.fishbase.se/summary/Platax-teira.html)
- [FishBase: Aetomylaeus bovinus](https://www.fishbase.se/summary/Aetomylaeus-bovinus.html)
- [Florida Museum: bull shark](https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/carcharhinus-leucas/)
- [Florida Museum: cownose ray](https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/rhinoptera-bonasus/)

## Batch v10: carpet sharks

Three bottom-living carpet sharks, each its own design file in `scripts/art/species/` on the shark rig, with the pieces they
share (rounded fin outlines, barbels, the wobbegong's lacy beard of branching strands, spiracle slits, flat spots) in
`scripts/art/species/carpet-sharks.ts`. Built from the field marks in iNaturalist photos (the species photos and a contact
sheet of a dozen more of each, looked over by eye), Florida Museum, FishBase and WoRMS; references only, nothing copied.
They rest on the bottom for long spells (`pause` in `MOVEMENT`) and then move slowly; `STANCES` and `SPECIES_STANCES` keep them
close above the seabed, and the rig lies them down when they rest (see "Fidelity pass" below). These three have their own
budgets, 8,000 triangles and 340 KB (`BUDGETS` in `scripts/verify-marine.mjs`); every other model keeps 5,000 and 220 KB.

| Species | Model | Motion | Triangles | GLB bytes |
| --- | --- | --- | ---: | ---: |
| Nurse shark | A thick, almost cylindrical, plain dark grey-brown body paler below with a very soft mottle; a flat, wedge-shaped head (from above the sides run straight in to a square-cut snout) with a small eye in a pale lid and a pale brow, a dark spiracle slit behind it, a pale-lipped mouth underneath with a fold running back from each corner and a short, thick, pale barbel at each nostril; five gill slits; broad-based pectorals and pelvics with a hollow rear edge and a pointed tip swept back toward the tail; two pointed, backswept dorsal fins, the second a little smaller, set far back, the first over the pelvic fins; a small anal fin; a long, tapering, ribbon-like tail (a third of the length, thick enough to read from above) sweeping up and back, with a small notch near its tip and almost no lower lobe, joined to the body without a gap | Slow and sinuous: a long wave through the stout body behind a steady head (0.4 beats/s, the head following half the sway); lies on the sand for most of the time, the tail all but stopped, the pectorals laid flat and the head pumping at its gills | 5,788 | 134,500 |
| Zebra shark | A rounded, pale tan adult densely covered in small dark brown spots (clear of the ridge lines and the whole gill-slit band, smaller on the head and tail, and on the pectoral, pelvic and dorsal fins and the tail too), with five low sharp ridges, each with a thin pale line along its crest, running from behind the head onto the tail stock, a blunt, smoothly rounded snout (round from above and from the side) with a short barbel at each nostril, small eyes with a large dark spiracle behind each, lips; a big, rounded first dorsal (mottled), a smaller second one and a small anal fin; broad, rounded, wing-like pectorals; a very long, very flat tail, about half the length (a low, thin blade); every fin joins the body on a wide base set deep into it | One slow, wide wave down the long body and tail (0.36 beats/s, a long wavelength so the tail swings in a single whip); rests flat on the sand with its pectorals out, the tail barely stirring | 7,869 | 291,216 |
| Tasselled wobbegong | The flattest of the three: a very broad, flat, rounded head and trunk with big, rounded, elliptical pectoral and pelvic fins set close along the body so that with the head they make one rounded rug, ringed round the snout and the sides of the head (forward of the pectorals only) by a beard of thin, branching strands (a main strand with two or three side strands, each a flat ribbon narrowing to a pale point, in two ragged rows of different lengths, with tufts under the chin), a huge terminal mouth, small eyes close together on top and a spiracle behind each; a beige coat with a mosaic of darker beige and brown squares, rectangles and irregular polygons of mixed sizes and angles, many of them brown outlines round a beige centre, over soft darker-beige saddles; the mosaic covers the back, the tail stock, the tail and the fins; pale below | Lies on the sand like a rug, the fringe resting on it; moving, it undulates like an eel (the tightest wave, 0.34 beats/s) with the broad head still and the whole trunk swaying; the slowest of the three and the longest rests | 7,918 | 270,732 |

Review notes. Studio renders of the actual assets (the app's lighting, side, top, three-quarter and head close-ups, swim poses
and rest poses) were read against the iNaturalist photos: the nurse shark's rounded, blunt head and tiny eyes, its pointed,
backswept dorsals and thin, long upper tail lobe came from them (the first draft had round dorsals and a fan-shaped tail,
and a blunt, wide-flanged head that looked like a bulldozer; all were redrawn); the zebra shark's first draft had too few,
too small spots and a tall, flag-like tail, now a long, low blade with many round spots (seven triangles each, far
cheaper than the kit's spot, with four-sided ones reading as squares) and ridges sitting on the loft's columns so that each
is a real fold of the body; the wobbegong's tassels first came out as hair-thin needles (the blade's flat side was lying
along the surface normal, which at the head's edge points straight along the stem) and then as a regimented row of thorns.
At island scale (`docs/art-previews/island-carpet-sharks.png`, the app's camera: the three with a whitetip reef shark and a
lemon shark for scale) they tell apart by outline and colour: the nurse shark plain and rounded, the zebra shark pale and spotted
with its thread of a tail, the wobbegong a mottled rug with a shaggy edge.

Fidelity pass (round 9). Each was set beside iNaturalist photos at the same angle on one sheet and read
(sheets of render against photo, kept with the working notes: wobbegong top and three-quarter against two photos,
zebra shark top, side and three-quarter, nurse shark side, three-quarter and head). What changed and why:

- Wobbegong shape: the first pass looked like a slim fish with winglets. The head and trunk are broader and rounder (a
  half width of .15 of the body length at its widest), the pectorals and pelvics much bigger and swept back so that with the
  head they make one broad, rounded rug, as in the top photo.
- Wobbegong beard: the frilly rim of three-lobed flaps (read as a spiky collar) became a lacy beard of long, thin,
  branching ribbons (`frond` in carpet-sharks.ts: a flat strand narrowing to a point in three segments, with two or three side
  strands springing from it, bending a little toward the ground), two ragged rows down each flank, a longer row across the
  snout, and tufts under the chin: about 100 tufts, 5 triangles a strand.
- Wobbegong coat: a coat painted on the vertices cannot hold a thin line at this vertex spacing (camouflage pixels), and
  ring-with-dark-centre decals read as polka dots or leopard rings. The method is flipped: the ground is dark brown (darker
  in a few broad saddles) and the pale tone is geometry, many irregular five- to seven-sided tiles (`tile` for the body,
  `finTile` for the fins, which find a point on the fin's face again from the same plan) in slightly different tans, with small
  gaps so the dark ground shows through as the net, and the tiles inside the saddles darker.
- Wobbegong fins and beard: the fins are wide-based ellipses swept back and laid close along the body, with no straight
  cut-off edges, tiled like the body; the beard runs only along the snout and the sides of the head forward of the pectoral
  origin, shorter, with paler tips.
- Zebra shark: bolder, rounder spots (fewer, larger, none over the ridges or the gill-slit band, where a flat spot sank into the
  fold or broke into letter shapes), spots on the pectoral and pelvic fins and on both faces of the tail (`finTile`, `tailTile`),
  thinner tail stock, a bigger spiracle and eye, lips.
- Zebra shark, round 10 (owner's notes: rounder head and body, more and smaller spots, ridges as lines, a longer flatter tail, fins
  joined to the body). Head and trunk: every cross-section is now a true ellipse (the superellipse exponents were 2.1 to 2.8, which
  made flat sides and corners) and the snout an ellipse quarter in both plan and profile (`blunt()`), so it is a smooth blunt
  dome; the trunk is rounder (height about .8 of its width). Spots: 517 on the head and body (was 147), about 3.5 times as many,
  each about two thirds the old size (radius .0034 to .0066 against .0056 to .0086), laid out in half-offset rows spaced by distance
  round the body so they stay dense on the thin tail, five- or six-sided fans of 3 or 4 triangles (`speck`, `finSpeck`, `tailSpeck`,
  `midlineSpeck` in carpet-sharks.ts: no centre vertex), and 638 on the fins and tail (was 208), now on the dorsals too. Ridges: a
  slightly taller crest on the same columns (ridge height .0108), a paler crest tone with darker hollows between, and a thin pale
  ribbon along each of the five crests from behind the head to the tail stock. Tail: the trunk is shorter (the second dorsal and
  anal fin moved from s .575 and .605 to .47 and .5, the pelvics from .43 to .36, the first dorsal from .38 to .335; rig joints
  .24, .35, .47, .61, .82) and the tail blade starts at s .52: a very low, thin blade (about .06 high and .01 thick, from .1 high
  and .02 thick) rising slowly to its pointed tip, a little over 48 % of the length, on a laterally flattened stalk that runs
  inside it. Fins: dorsals, anal and pelvics set .02 to .03 deep into the body, the pectorals and pelvics with a flared root (the
  edges start forward of and behind the base and narrow into the fin over the first .04 of span) and thicker at the root, the
  fins' colour blended to the skin colour over the first third of their height or span so there is no colour seam. The hull's width
  row went from .54 to .58 (the thicker pectoral root). Sheets read: loop10/z/shots/sheet5.png (side, top, three-quarter against
  photos), sheet2/sheet3 (fin roots from top, below, front), sheet8 (head).
  Follow-up: from above the tail was a needle, so the blade is thicker side to side (about .027 across at its root, tapering to the
  tip; still the same height and length in side view); the needle at each pectoral and pelvic tip was the fin loft running its last
  `sink` of length at zero chord (the outline ended at the span, the loft at span + sink), so the paired fins' outlines now end at
  span + sink and the tips are rounded. 7,869 triangles, 291,216 bytes (sheet12, sheet13, zebra-preview.png).
- Nurse shark: smoother loft (62 rings), a paler lid and brow round the eye with the dark spiracle slit behind it, lips and
  mouth corners, short thick barbels like the photos'; plain skin (the freckles read as low-poly dots up close and were dropped),
  broad rounded pectorals; the trunk tapers from s .45 into a thick tail stock that runs inside the tail root (no step or cap), so that the tail is a long, low, tapering upper lobe a quarter
  of the length, with a small notch near the tip, joined to the body (the old broad fan left a gap seen from above).
- Resting: sharks rest by hovering above the bottom in the first pass. The shark rig now has `lie` (`SharkRig.lie`): as the
  effort falls below a walking pace the whole body sinks by `sink`, the pectorals lift to lie flat (`fins`) and the head pumps
  at the gills (`pump`, four beats a stroke). The sinks are computed from the hull so that the drawn body still clears the
  bottom under the worst case (the water too shallow for the stance's band): nurse .08, zebra .062, wobbegong .033 model units.
  Their hulls (`marine-bodies.ts`) were re-measured over the real stroke (verify:marine checks they hold the body), and the
  three stances' `band` over the bottom came down (.06, .04, .03 to .02, .015, .01), so at rest the belly, the pectorals and the
  wobbegong's fringe are within a few hundredths of the sand, instead of a body-depth above it. The pelvic fins' droop was
  halved so that they lie flat too.
- Wobbegong swimming: the whole trunk now sways (root amplitude doubled) so it moves like an eel, not like a shark with a
  stiff body.

Round 10 (owner's notes on the nurse shark and the wobbegong; the zebra shark's notes are in its own section). The reference
for the nurse shark is the photo the app itself shows (`app-nurse.jpg`; the owner's "photo from December 24th" could not be
identified), for the wobbegong the app's photo and two more from above and three-quarter. Sheets of render against photo were read
for each step.

- Nurse head: from above it is now a wedge, the sides running straight in from the gills to a snout cut off square (half width
  .018 at the tip against .08 at the gills; a small flat cap, `frontDome`, rather than a point), and from the side the snout is
  low and blunt (a boxier cross-section near the front).
- Nurse colour: darker and less olive, a grey-brown (back #665c4b, flank #766b57, belly #c3b9a0, against the olive #8a7a56 and
  #9d8c64), the fins darker, still paler below.
- Nurse fins: the pectorals and pelvics have a wide base, flush with the body, then a front edge sweeping back to a sharp tip and a
  hollow (falcate) rear edge, about a quarter shorter than the first try, lying lower and further back; both dorsals and the anal fin are pointed and swept back (`pointFin` in nurse-shark.ts).
- Nurse tail: the trunk is shorter (the dorsals, pelvics and anal fin moved forward a little, the body loft ends at .76 instead of
  .8) and the tail starts at .665, a long, slender upper lobe a third of the length, higher and steeper, still with the notch near
  its tip and no step at the join; seen from above it is a tapering ribbon (about .025 thick at the root), not a needle. The longer lever swings further, so the hull (`marine-bodies.ts`) grew from crest .38 and
  width .53 to .42 and .66.
- Wobbegong coat (shape, beard, fins and rig as before): the ground is beige and the pattern is darker beige and brown. The
  mosaic is fine and dense (about 1.7 times the patches of the first try at about two thirds of the size, with thin outlines); about
  45% of the patches are brown outlines round a beige centre (two `tile`s of the same shape, one inside the other), the rest solid
  brown or darker beige (half of those dropped to stay inside 8,000 triangles), four to six corners, stretched 0.6 to 1.9 times along or across the body; they are
  laid on the back, tail stock, fins (`finTile`) and both faces of the tail (`tailTile`), with soft darker-beige saddles on the
  ground itself and the beard following the head's colour. `finTile` and `tailTile` gained an optional last parameter (`lift`,
  default as before) so that an inner patch can sit above the outer one.

Frame cost (SwiftShader, the island card 390 x 420 at DPR 2, one of each driven by its rig, 90 frames; a relative cost only, as the
GPU is a software rasterizer): see the round's report. Triangles drawn for the three rose from 12,803 to about 19,600.

Previews: `docs/art-previews/nurse-shark.png`, `zebra-shark.png` and `tasselled-wobbegong.png` (three-quarter, top and side
views of the swimming pose) and `island-carpet-sharks.png`.

References: [Florida Museum: nurse shark](https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/ginglymostoma-cirratum/),
[Florida Museum: zebra shark](https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/stegostoma-tigrinum/),
[FishBase: tasselled wobbegong](https://www.fishbase.se/summary/Eucrossorhinus-dasypogon.html).
