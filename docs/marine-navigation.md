# Island navigation

How the animals around the island decide where to swim: finding their way around
each other, keeping clear of the island and islets, and turning and banking
smoothly. Everything lives in `src/lib/marine-motion.ts`; the island's shape and
the shore-distance field are in `src/lib/island-outline.ts`. Swimming gait (tail
beats, wing and flipper strokes) is separate, in `src/lib/marine-rigs.ts`.

## How it works

The school is one small simulation, stepped at a fixed 60 Hz with interpolated
poses, so a 20 fps simulator and a 60 fps phone move animals identically. Each
step, every animal blends a few influences into one desired direction, and all
of them decide from the same snapshot:

- **Roaming (the base path).** An animal follows the coastline's shape at its own
  distance offshore. That distance drifts slowly within the species' band
  (`islandClearance + roam`, over `roamPeriod`), so animals explore, cross paths
  and appear from different sides. Now and then an animal reverses its circling
  direction (`reverseEvery`). It turns around only where the U-turn fits, and
  never while it is passing another animal.
- **Lanes (animal avoidance).** When two animals will come alongside within about
  14 s and there isn't room for both, they move into lanes a body-width apart,
  measured in distance offshore. They do it gradually, well before they meet, and
  drift back afterward. Passing side by side replaces slowing down behind or
  swerving at the last moment. Each pair keeps its sides for the whole encounter.
  The one heading farther out takes the outside. The move is shared by
  *heft* (footprint area ÷ turn rate), so smaller, nimbler animals make most of
  the room: a great white does about 80% of the moving around a whale shark, and a
  whale shark barely moves for a turtle.
- **Close calls.** Anything the lanes do not settle, such as an animal cutting
  across, gets a short look-ahead (3 s) sidestep toward the same side as its lane.
  An animal catching up with one it cannot pass eases to that one's pace, then
  passes where the water widens.
- **Depth, sparingly.** Only where the water is too narrow to pass side by side,
  the animal that already swims higher rises up to 0.16 and the other sinks up to
  0.1, eased over a couple of seconds. A manta glides over a whale shark; a turtle
  passes above it.
- **Island and islets.** A shore-distance field (a coarse grid, looked up
  bilinearly) gives each animal its distance to shore and the direction away
  from it. Steering is predictive: from three points along its course, the
  animal estimates how soon it would reach its clearance line. It turns to run
  along the coast, harder the sooner that would be. Swimming parallel to the shore,
  however close, triggers nothing, so there is no clamping or bouncing. Islets
  blend into the field with a smooth minimum, which fills the narrow channels
  (animals go around the outside). Because islets are small sandbars without a
  wet-sand fringe, animals may pass them a little closer: their footprint plus 0.25.
- **The frame.** A rounded rectangle matching the view (`WORLD`). Near it,
  animals turn to run along the edge rather than straight back.
- **What the camera sees.** The camera looks down at an angle, so an animal a
  meter below the beach appears about 0.4 units closer to the viewer than it
  is. The island and the frame are judged at that apparent position, which is
  what stops animals slipping visually under the island's far (north) shore.
- **Dives.** Animals that are deep on a dive (`src/lib/ocean-depth.ts`) are passed
  over; others start making room about 6 s before one resurfaces. The renderer
  runs the dive cycle on the school's clock, so the two always agree.

**Turning and banking.** The desired direction is smoothed (about 0.5 s), then
the heading follows it through a rate-limited, nearly critically damped turn: the
turn rate eases toward `turnEase × error` and never exceeds `turnRate`. Turns
build, hold and settle without overshoot or jitter. A big course change ahead
slows the animal by up to 30%, which tightens the turn. A half turn keeps to the
side with more room (checked one turning circle out), and switches only if that
side becomes blocked. Roll follows the turn rate (`bank`, capped at `bankMax`,
eased at `bankEase`), around any resting `tilt` (the sunfish swims on its side).

## Species settings

All in `MOVEMENT` (`src/lib/marine-motion.ts`). Distances are world units: the
island is about 4.3 across, and a whale shark is 3 long.

| | Whale shark | Great white | Tiger shark | Reef manta | Ocean sunfish | Green turtle |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `cruise` (units/s) | 0.27 | 0.50 | 0.41 | 0.33 | 0.23 | 0.37 |
| `turnRate` (rad/s) | 0.17 | 0.50 | 0.38 | 0.30 | 0.16 | 0.40 |
| `turnEase` (1/s) | 0.25 | 0.70 | 0.50 | 0.45 | 0.25 | 0.55 |
| `bank` / `bankMax` | 0.35 / 0.09 | 0.42 / 0.20 | 0.50 / 0.20 | 1.9 / 0.38 | 0.25 / 0.07 | 0.6 / 0.14 |
| `halfLength` × `halfWidth` | 1.4 × 0.6 | 1.15 × 0.45 | 1.1 × 0.42 | 0.7 × 1.0 | 0.8 × 0.95 | 0.55 × 0.6 |
| `personalSpace` | 0.2 | 0.3 | 0.25 | 0.25 | 0.2 | 0.2 |
| `avoidance` | 0.35 | 0.9 | 0.8 | 0.8 | 0.5 | 1.0 |
| `islandClearance` | 1.3 | 0.95 | 0.85 | 1.2 | 1.25 | 0.9 |
| usual distance offshore | 1.7–2.25 | 1.35–2.05 | 1.05–1.65 | 1.4–2.0 | 1.55–2.1 | 1.1–1.35 |
| `depth` | −0.18 | −0.08 | −0.04 | +0.06 | −0.12 | +0.12 |

How these map to the usual names: `cruise` is cruise speed, and `turnRate` and
`turnEase` are turn speed. `halfLength`/`halfWidth` are the body radius, as an
ellipse, because these animals are long or wide. `personalSpace` is the avoidance
radius beyond the body, `avoidance` is avoidance strength, and `depth` is
preferred depth. `bob`/`bobPeriod` set depth variation and vertical drift, and
`bank` sets banking. Animation frequency and amplitude are `SWIM_RIGS` in
`src/lib/marine-rigs.ts`.

Clearance is measured from the animal's center to the dry-sand line (at its
apparent position). It must stay above the footprint half-width plus about 0.1
for the wet-sand fringe, or fins will slip under the beach. Lanes never go closer
than the clearance plus 0.2, which is why the manta's and turtle's usual ranges
start above their bands.

## Tuning quick reference

| To get… | Change | Notes |
| --- | --- | --- |
| Animals farther apart | raise `personalSpace` (0.1–0.2 at a time) | Wider lanes also mean more passes overlap in depth where the water is narrow |
| Animals closer together | lower `personalSpace` | Keep it at 0.15 or more, or fins will touch |
| Large animals farther offshore | raise `islandClearance`, or both `roam` values | Keep `islandClearance + roam[1]` under about 2.6, or the frame caps it |
| Smaller animals nearer shore | lower `roam` (and `islandClearance`, down to half-width + 0.25) | e.g. the turtle's `[0, .45]` |
| Faster turning | raise `turnRate` (top rate) and `turnEase` (responsiveness) together | The current ratio, `turnEase` ≈ 1.4 × `turnRate`, keeps turns building and settling gently |
| Slower, wider turning | lower `turnRate`; lower `turnEase` for lazier arcs | Below about 0.15 rad/s, an animal struggles around level 6 islets |
| Stronger avoidance | raise `avoidance`, or `LANE_LOOKAHEAD` (earlier lane changes) | Heft decides who yields; raise a species' `turnRate` to make it yield more |
| Weaker avoidance | lower `avoidance` | The whale shark's 0.35 already reads as unbothered |
| More banking | raise `bank` (roll per rad/s of turn) and `bankMax` | The manta uses 1.9 / 0.38 |
| Less banking | lower `bankMax` | 0.07–0.09 reads as nearly level (sunfish, whale shark) |
| More depth separation | raise the 0.16 / −0.1 lift in `steer()` | Keep it small, so depth stays a last resort |
| More frequent direction changes | lower `reverseEvery` | 0 means never (the whale shark) |

## Debug overlay

Set `EXPO_PUBLIC_MARINE_DEBUG=1` and restart Metro with `--clear`. The island then
shows:

- each species' clearance line (cyan) and the frame (faint white);
- for each animal, its footprint (white), desired direction (yellow), animal
  avoidance (red) and island avoidance (green).

It is drawn on top of everything and loaded only when switched on
(`src/components/home/three/marine-debug.tsx`).

## Cost

The simulation costs about 20 µs per frame for 2 animals and 70 µs for 8, measured
in Node. A phone's JavaScript engine is several times slower, which is still well
under a millisecond. The shore field is built once per level, in about 10 ms.
Rendering is unchanged: the same draw calls and triangles as before. See
`island-performance.md`.

## Verifying

```sh
npx jest src/lib/__tests__/marine-motion.test.ts
```

The tests cover:

- staying in view and clear of the island and islets, for 1–8 animals at levels 1
  and 6;
- turn-rate and roll limits;
- pause and background frames;
- each species' personality and distance offshore;
- 20 vs 60 fps equivalence;
- a great white passing a whale shark;
- nimbler animals making more room;
- the preview pair never meeting at the same depth;
- a crowd of eight rarely clashing.

## Known limitations

- With six to eight large animals, the water ring (about 2.5 units wide on the
  sides) is too narrow for every pass to go side by side. Some passes overlap with
  one animal clearly above the other. The dive cycle hides a third or more of a
  large school at any moment, which keeps most scenes uncluttered.
- At level 6, a whale shark rounding the southwest islet can swing briefly toward
  the bottom haze, because there is little room between that islet and the view's
  corner.
- In crowded scenes an animal may make a small (4–8°) corrective S-curve every
  half minute or so while lanes settle.
