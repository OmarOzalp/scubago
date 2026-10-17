# Species plates

Every species in the catalogue has its own plate: a drawing in the manner of a hand-tinted
engraving from an old field guide. The test for every plate is the one a diver would apply: **can
you tell what animal it is without reading the label?** Each plate is posed to show the marks that
make that species itself, and the marks are drawn large enough to survive at card size.

## How a plate is made

Plates are geometry built from code, not image files, so they stay sharp at every size, colour
themselves from a palette, and can be redrawn as a pencil outline for a species still to find.

| File | What it does |
| --- | --- |
| `src/lib/plates/kit.ts` | Points, splines (Catmull-Rom, with sharp corners where marked), resampling, clipping, hatching, blobs |
| `src/lib/plates/soft.ts` | Soft bodies: ellipses melted into one smooth outline (octopus mantles, sea slugs, jellyfish arms) |
| `src/lib/plates/side.ts` | A side-view trunk as a strip (back and belly edges sampled together), fins spliced into its outline, contour engraving |
| `src/lib/plates/marks.ts` | Spots, bars, patches and bands placed on a trunk or inside any shape |
| `src/lib/plates/shark.ts`, `topshark.ts` | Sharks from the side (a requiem base that species vary), and from above (hammerheads, wobbegong, sawfish, guitarfish) |
| `src/lib/plates/ray.ts`, `turtle.ts` | Rays from above (disc, cephalic fins, tail), turtles from above (scute pattern, head scales, flippers) |
| `src/lib/plates/fish.ts`, `eel.ts` | Bony fish (spined and soft rays, ten tail shapes, scales, lateral line), eels along a curving spine |
| `src/lib/plates/cephalopod.ts` | Octopus arms as tapering tubes with sucker rows webbed into the crown; cuttlefish and squid mantles with a rippling fin |
| `src/lib/plates/species/*.ts` | Each species: its proportions, fins, pose and markings, with a note of its field marks |
| `src/lib/plates/registry.ts` | Species id → plate builder and palette |
| `src/lib/plates/render.ts` | Geometry → SVG shapes: washes, engraving, outline, eyes; pencil mode; detail thinning |
| `src/lib/plates/index.ts` | What the app uses: a cache, and a queue that draws plates between frames |

A plate is drawn in a 200×128 box, in this order: far-side fins and limbs, the body, median fins,
the trunk's wash, tints (belly, patches), engraving, markings, the ink outline (heavier on the
shadowed side), near-side fins and limbs, fine lines (gills, mouths, sutures) and the eyes.

The style rules:

- **Colour is a wash**, mixed a little towards sepia and then towards the paper, more for light
  colours than dark ones, so a black orca stays black and a yellow boxfish stays yellow without
  either looking printed.
- **Engraved lines swell and taper** like burin cuts (filled slivers, not strokes), close together
  in shadow (the back and belly edges) and sparse on the lit flank.
- **Detail follows size.** Below about 150 points wide every other engraving line goes; below 95
  more; fine scales and growth lines only appear on large plates.
- **Pencil mode** (a species not yet found) is the same plate as a dashed grey outline on the page's
  own paper, with no colour.

## How each group is told apart

The field marks behind each plate were researched per species. The decisive ones:

- **Sharks.** Whale shark: broad flat head with the mouth at the very front, white spots in a
  checkerboard between pale stripes, ridges along the flank. Great white: pointed conical snout,
  black eye, sharp grey-over-white boundary, crescent tail. Basking: the gaping mouth and huge gill
  slits. Tiger: blunt square snout, dark bars. Mako: needle snout, lunate tail, metallic blue.
  Thresher: the tail as long as the body. Oceanic whitetip: big rounded white-tipped fins. Sand
  tiger: ragged teeth and two equal dorsals. Lemon: yellow, two near-equal dorsals. Grey reef: black
  trailing edge on the tail. Blacktip and whitetip reef: black or white tips. Nurse: barbels and
  dorsals far back. Hammerheads, wobbegong: drawn from above for the head.
- **Rays.** Reef and oceanic manta by their shoulder patches (reef: soft, oceanic: a sharp T);
  devil ray smaller; eagle ray white spots and a long whip tail; marbled ray round
  and marbled; southern stingray a diamond; ribbontail blue spots; sawfish its saw; guitarfish its
  shark-like back half; electric ray round with two dorsals on a thick tail.
- **Turtles.** Scute count and overlap (hawksbill's overlapping scutes and hooked beak), head scales,
  shell shape (loggerhead's big head, olive ridley's round shell, leatherback's ridges).
- **Mammals.** Dolphin beaks and dorsal fins, the humpback's long pectorals, the sperm whale's box
  head, the orca's patches, the dugong's fluke against the manatee's round paddle, seal and sea lion
  hind flippers.
- **Bony fish.** Silhouette first (the mola's truncated body, the batfish's disc, the trumpetfish's
  stick), then the one pattern a diver remembers: clownfish bars, emperor angelfish stripes, the
  queen angelfish's crown, the raccoon butterflyfish's mask, clown triggerfish spots, lionfish
  spines. Look-alike groupers are separated by colour and markings (giant: yellow fins; goliath:
  dark oblique bars; potato cod: big dark blotches).
- **Cephalopods.** Octopuses by arm length, skin and one mark each: the day octopus's eyespot, the
  giant Pacific's folds and knobbly outline, the blue rings, the mimic's banded whip arms, the
  coconut octopus in its shell. Cuttlefish: the giant's six flaps over each eye and zebra bars, the
  broadclub's pale saddle and raised first arms, the flamboyant's back flaps and walking pose. The
  bigfin squid's oval fin, the bobtail's ear fins, the nautilus's striped coil and hood.
- **Invertebrates and reptiles.** Anna's chromodoris's banded margin, the Pikachu nudibranch's
  sheathed rhinophores, the Spanish dancer's flared skirt, the harlequin shrimp's petal claws, the
  mantis shrimp's folded club, the spiny lobster's whip antennae, the Christmas tree worm's two
  spirals, the giant clam's waving lips, the golden jellyfish's oral arms, the krait's rings and
  yellow snout, the marine iguana's crest and salt crust.

## Changing or adding a plate

1. Find the species in `src/lib/plates/species/` (the registry says which file). Each one starts
   with a comment listing its field marks; keep the drawing true to them.
2. Change its proportions, fins or markings. Builders take control points in their own units; the
   plate is fitted to the box afterwards, so only the shape matters.
3. Review it: `npm run plates:sheet -- /tmp/plates.html <species-id> …` writes a sheet with each plate
   large, at card size and in pencil. Compare it with photos of the real animal, and check the card
   size especially: that is where look-alikes blur.
4. `npx jest src/lib/__tests__/species-plates.test.ts` checks every species has a plate that fits the
   box, draws without broken numbers, and comes out the same every time.

A new species needs a plate in the registry; until it has one the app draws its group's drawing
from `src/lib/species-art.ts`, as it does for species divers add themselves.

## In the app

`SpeciesArt` (`src/components/species-art.tsx`) asks `requestPlate` for the drawing at the width
it is shown at. Building a plate takes from 2 to 80 ms on a desktop and several times that on a
phone, so requests are queued and drawn about 8 ms at a time between frames; a plate appears as
soon as its turn comes, and is cached for the session (the geometry per species, the drawing per
size and state). Runs of shapes with the same colour are joined into one path, which keeps a plate
to about 50 SVG elements.

Found plates are always tinted against the plate paper (`#F6F0E2`), so their colours are the same
in light and dark mode; a pencil outline sits on the page's own paper.
