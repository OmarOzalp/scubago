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
- **Meanders.** Some species wander rather than hold a line: `weave` swings the
  roaming course gently either way over `weavePeriod`, so the hammerhead and the
  dolphin swim in curving arcs. The island, the frame and the other animals are
  weighed after it, so a meander never takes an animal closer to anything.
- **Dives.** Animals that are deep on a dive (`src/lib/ocean-depth.ts`) are passed
  over; others start making room about 6 s before one resurfaces. The renderer
  runs the dive cycle on the school's clock, so the two always agree.
- **Breathing.** Air-breathers (the dolphin, `breathe`) come up to the surface now and
  then: every 26 s, staggered by lane, the dolphin rises for 3.2 s at a shallow angle,
  stays up for 1.8 s with its middle 0.2 below the calm surface (its dorsal fin
  breaks the surface and its back just stays under), then sinks back for 3.2 s. A
  breath is skipped unless the dolphin stays up in the water for all of it, so it
  never rises next to a dive. The rise is smooth (no jumps), and `pitch` tips its
  body up and down with it.
- **The tuna school.** A school of tuna swims with the animals, stepped in the same
  loop (see `tuna-school.md`). The large animals do not steer around it: the fish make
  room for them. The great white is the exception. Near the school, now and then (one
  encounter in five, decided when the encounter begins) it turns in and charges
  through it, then slows back to its cruise and rests at least 50 s before it can
  charge again. While charging, it still avoids the island, the frame and the other
  animals, but it leaves its lane.

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

| | Whale shark | Great white | Tiger shark | Hammerhead | Reef manta | Ocean sunfish | Green turtle | Dolphin |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `cruise` (units/s) | 0.27 | 0.50 | 0.41 | 0.43 | 0.33 | 0.23 | 0.37 | 0.47 |
| `surge` | 0 | 0.2 | 0 | 0.08 | 0 | 0 | 0 | 0.3 |
| `turnRate` (rad/s) | 0.17 | 0.50 | 0.38 | 0.52 | 0.30 | 0.16 | 0.40 | 0.62 |
| `turnEase` (1/s) | 0.25 | 0.70 | 0.50 | 0.82 | 0.45 | 0.25 | 0.55 | 0.9 |
| `bank` / `bankMax` | 0.35 / 0.09 | 0.42 / 0.20 | 0.50 / 0.20 | 0.62 / 0.24 | 1.9 / 0.38 | 0.25 / 0.07 | 0.6 / 0.14 | 0.75 / 0.30 |
| `halfLength` × `halfWidth` | 1.4 × 0.6 | 1.15 × 0.45 | 1.1 × 0.42 | 1.05 × 0.36 | 0.7 × 1.0 | 0.8 × 0.95 | 0.55 × 0.6 | 0.8 × 0.26 |
| `personalSpace` | 0.2 | 0.3 | 0.25 | 0.25 | 0.25 | 0.2 | 0.2 | 0.25 |
| `avoidance` | 0.35 | 0.9 | 0.8 | 0.85 | 0.8 | 0.5 | 1.0 | 1.0 |
| `islandClearance` | 1.3 | 0.95 | 0.85 | 1.0 | 1.2 | 1.25 | 0.9 | 0.85 |
| usual distance offshore | 1.7–2.25 | 1.35–2.05 | 1.05–1.65 | 1.25–2.0 | 1.4–2.0 | 1.55–2.1 | 1.1–1.35 | 0.95–1.75 |
| `depth` / `bob` | −0.18 / 0.065 | −0.08 / 0.03 | −0.04 / 0.04 | −0.10 / 0.05 | +0.06 / 0.09 | −0.12 / 0.085 | +0.12 / 0.06 | +0.16 / 0.10 |
| `weave` (rad, over s) | – | – | – | 0.26, 13 | – | – | – | 0.2, 9 |

The two newest species, in short:

- **Scalloped hammerhead:** more active than the whale shark and less forceful than the
  great white. It cruises at medium speed and turns in the tightest circles of the
  sharks (its turns also build fastest), with a moderate bank. It keeps to mid-water
  and comes a little closer to shore than the whale shark, meandering in smooth
  arcs rather than patrolling a line.
- **Bottlenose dolphin:** medium-fast with short bursts (`surge`), the most agile
  turner, with gentle banks. It swims highest and rises and falls the most, comes
  up to breathe, and pitches with its climbs (`pitch` 1.3, where the others use
  0.35). As a small, nimble animal it makes most of the room when passing others.

The preferred depths are layered: the dolphin shallowest, the hammerhead in
mid-water, and the whale shark deepest and farthest out, so the busiest scenes stay
readable.

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
| Curvier, wandering paths | raise `weave` (0.15–0.35 rad) or lower `weavePeriod` | Above about 0.4 an animal starts to look lost |
| More or fewer breaths | change `breathe.every` (s between breaths) | Breaths that would meet a dive are skipped |
| A higher or lower breath | change `breathe.clearance` (its middle below the calm surface) | Below about 0.15 the dolphin's back breaks the surface; above 0.3 its fin stays under |
| More or less pitch with climbs | `pitch` (rad per unit/s of rise) | Capped at 0.22 rad either way |

## Debug overlay

Set `EXPO_PUBLIC_MARINE_DEBUG=1` and restart Metro with `--clear`. The island then
shows:

- each species' clearance line (cyan) and the frame (faint white);
- for each animal, its footprint (white), desired direction (yellow), animal
  avoidance (red) and island avoidance (green).

It is drawn on top of everything and loaded only when switched on
(`src/components/home/three/marine-debug.tsx`).

To watch all eight species together without logging them, set
`EXPO_PUBLIC_ISLAND_SHOWCASE=1` (restart Metro with `--clear`). They swim as the labeled
preview in place of the collection, and each can be tapped for its close-up. Both flags
can be combined.

## Cost

The simulation costs about 20 µs per frame for 2 animals and 70 µs for 8, measured
in Node. A phone's JavaScript engine is several times slower, which is still well
under a millisecond. The shore field is built once per level, in about 10 ms.
Navigation adds no draw calls or triangles. The tuna school adds about 26 µs per frame
with 2 animals (42 µs with 6), and one instanced draw call. See
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
- a crowd of eight rarely clashing, and the eight species together;
- the dolphin breathing: brief, just below the surface, and never next to a dive.

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
