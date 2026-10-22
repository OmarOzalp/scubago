# Species art direction and production plan

Approved direction: recognizable, polished stylized animals with accurate shapes
and markings. Collection cards use actual photographs. The island uses animated
3D animals. Photographs must not be replaced with AI illustrations presented as
real wildlife.

## Current inventory

The catalog contains **120 species** (119, plus the giant cuttlefish added with the
reef animals). All 120 have photos under CC0, CC BY or CC BY-SA (October 2026), each
looked over by eye on contact sheets for the right animal, alive and visible; 16 were
chosen by hand (`OVERRIDES` in `scripts/fetch-species-photos.ts`). Twenty-five animated GLBs now exist: three family
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

Rebuild: `npm run build:species` (or `-- --only=tiger-shark`). Verify exports:
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
