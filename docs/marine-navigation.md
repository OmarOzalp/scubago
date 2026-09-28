# Island navigation

How the animals around the island decide where to swim: finding their way around
each other, keeping clear of the island and islets, and turning and banking
smoothly; swimming in small groups; the dolphins' leaps; and the ocean widening as
the island levels up. Everything lives in `src/lib/marine-motion.ts`; the island's
shape and the shore-distance field are in `src/lib/island-outline.ts`, the groups in
`src/lib/marine-groups.ts`, the leap's curves in `src/lib/breach.ts` and the ocean's
growth in `src/lib/steering.ts`. Swimming gait (tail beats, wing and flipper strokes)
is separate, in `src/lib/marine-rigs.ts`.

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
- **The frame.** A rounded rectangle matching the view (`WORLD` at the first level,
  wider at higher ones: see [A growing ocean](#a-growing-ocean)). Near it, animals
  turn to run along the edge rather than straight back.
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
  body up and down with it. Now and then a breath becomes a leap clear of the water
  (see [Leaps](#leaps)).
- **Groups.** Dolphins come as pods, and a few other species in pairs or small shoals
  (see [Groups](#groups)). The species' own animal leads and steers for the group,
  with a footprint wide enough for all of it; the others follow in loose places of
  their own.
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

## Groups

A species that swims in a group is still one species: one discovery, one of the
animated species (`MAX_ANIMATED`), one tap destination (every member opens its page)
and one slot in the dive schedule. Its extra members come from a budget of their own
(`GROUP_BUDGET`: 6 extra animals, 3 where the GPU is emulated), given to the dolphins'
pods first, then hammerheads, then shoals. Each visit picks the group sizes afresh
within each species' range (`GROUP_SIZES` in `src/lib/marine-groups.ts`):

| Species | Animals | Why |
| --- | ---: | --- |
| Bottlenose and spinner dolphins | 2–3 | Dolphins travel in pods |
| Scalloped hammerhead | 1–2 | They school, so now and then a second one swims along; great hammerheads are solitary and stay alone |
| Chevron barracuda | 3–5 | Tornado schools |
| Giant trevally, bumphead parrotfish | 2–3 | Packs and herds |
| Raccoon butterflyfish | 2 | They go about in pairs |

Other candidates were left alone for now: spotted eagle rays fly in squadrons and
Munk's devil rays school, but both share the family ray model, and a squadron of
wide rays would crowd the ring of water at low levels.

**How a group swims** (`GROUP_STYLES`, per model). The leader roams, passes others in
lanes and avoids the island exactly as a lone animal does, but with its footprint and
island clearance widened to take in its followers' places, and it keeps its whole group
inside the frame: the other large animals make room for the group as one, and it keeps
clear of the island and the frame as one. (The tuna school sees each member on its own.) Each follower keeps a place
beside and behind the leader (`places`): it swims the leader's course, turning as the
leader turns plus a correction toward its place, and catches up or drops back by pace.
It keeps its own clearance from the island, islets and frame, and room from its group
and the other animals at its depth, sidestepping rather than turning back. Places
wander a little (`wander`, over `wanderPeriod`), so no two members move alike; each
member has its own tail phase and depth (`depthSpread`).

- **Trading places.** Now and then (`swapEvery`) two members trade places, or a pair's
  follower crosses to the leader's other side, over `swapTime` seconds; the one
  dropping back passes beneath (`dip`). A member crowding one ahead of it in the group
  also slips beneath it.
- **Along the shore.** A place that would put a follower inside its island clearance
  moves out to the clearance, and the group then swings its places to the open side.
  When the leader turns around (a reversal), its group turns with it and their places
  swing to its other side, where the U-turn leaves them.
- **Breathing.** Members breathe one after another, `stagger` seconds apart (2.4 s for
  dolphins), and a third member now and then stays under for a breath (`skip`).
- **Dives.** The group dives on its leader's cycle, each member 0.8 s after the one
  before, so a pod sinks one by one.

| | Dolphin pod | Hammerhead pair | Reef-fish shoal |
| --- | --- | --- | --- |
| `places` (across, behind) | (0.62, 0.55), (−0.6, 1.15) | (1.05, 1.25) | (0.34, 0.4), (−0.32, 0.55), (0.1, 0.92), (−0.38, 1.08) |
| `wander` / `wanderPeriod` | 0.16 / 13 s | 0.35 / 27 s | 0.14 / 7 s |
| `swapEvery` / `swapTime` | 38 s / 4.5 s | 80 s / 7 s | 16 s / 2.6 s |
| `dip` / `depthSpread` | 0.32 / 0.08 | 0.38 / 0.16 | 0.16 / 0.07 |
| `stagger` / `skip` | 2.4 s / 0.4 | – | – |

To add a group species, give it a range in `GROUP_SIZES`; its model needs a style in
`GROUP_STYLES` (with at least as many places as its largest group has followers).

## Leaps

Now and then a dolphin's breath becomes a leap clear of the water. Everything to tune
is `DOLPHIN_BREACH` in `src/lib/breach.ts`.

- **Rare, and decided once.** As each breath begins, the dolphin rolls once for it
  (`chance`, 0.3): a deterministic roll on the fixed simulation clock, never per frame,
  so any frame rate gives the same leaps and the same visit replays them. Each member of
  a pod rolls for its own breaths; the followers leap more often than the leader (half
  the chance for the leader, which steers for them all, and correspondingly more for the
  others), so the pod's breaths still average `chance`. A breath that rolls a leap also needs no dive near,
  nobody in its pod already leaping (one leap per pod at a time) and the pod's
  `cooldown` (60 s) since its last leap; then, within the breath's first `window`
  seconds (2.5, checked ten times a second), no other large animal close by (`crowd`)
  and a heading it can turn onto (up to about 50°) along which all of it fits: the end
  of the run-up, the arc and the plunge after it clear of the island and islets
  (`islandMargin` beyond its clearance), inside the frame (`frameEdge`), in the clear
  middle of the view short of the haze at the top and bottom (`view`), and clear of
  every other animal at each point of the leap when it gets there (`animalGap`, or
  `podGap` for its own pod). Otherwise it is an ordinary breath. A leap is never forced.
- **The run-up** (`build`, 1.6 s). It turns onto that heading (twice as nimbly as it
  usually turns), speeds up to the leap's speed, dips a little, then sweeps steeply up
  to the surface (from wherever its breath has brought it, with no jump). At `lock` (70%
  of the way) it checks the room once more. Clear, it commits: from here the arc always
  completes. Otherwise it blends into its ordinary breath over `settle` seconds.
- **The arc** (`air`, 1.05 s). A ballistic flight with its heading fixed, `length` (1.3)
  over the water with its apex `apex` (0.6) above the calm surface: it leaves the
  water at about 60°. The body follows its path (nose up out of the water, level at the
  apex, nose first back in), its tail beat stills, it stretches out and its flippers
  fold in (the rig's `air` input).
- **The plunge** (`reentry`, 2.8 s). It dives in at the speed it fell, carries on below
  its usual depth, and eases back up while slowing to its cruise; its heading frees up
  gradually. The stages meet with matching heights and vertical speeds, so there is no
  kink anywhere.
- **In a pod**, the other members keep their own pace and course while one leaps (they
  do not chase it), and it rejoins them after.
- **Water color.** The underwater tint and the waves' refraction are measured per
  vertex from the moving surface, so a body out of the water is drawn clear, and the
  tint comes back gradually along the body as it re-enters, with no pop at the water
  line; the full-quality surface layer is drawn over just the part still under it.
- **Splashes.** Leaving the water and plunging back leave a splash each (the plunge's
  stronger): a ring of foam spreading on the moving surface and thinning away, and in
  full quality a few droplets thrown up and out, all gone in about a second
  (`src/components/home/three/marine-splashes.tsx`, one pooled instanced mesh each for
  rings and droplets, not drawn while the water is calm).
- **Tapping.** A leaping dolphin is tapped on its body as always; slender animals get an
  invisible tap target over the body that moves, pitches and leaps with them.

To see leaps without waiting, set `EXPO_PUBLIC_DOLPHIN_LEAPS=1` (restart Metro with
`--clear`): every breath with room for one becomes a leap (the cooldown still holds).

## A growing ocean

As the island levels up, the ocean around it widens and the camera pulls back to
match (`OCEAN_GROWTH` in `src/lib/steering.ts`), so a growing collection gets more
room. Animals keep their size; only the space and the view grow.

| Level | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Ocean and view scale | 1 | 1.03 | 1.07 | 1.11 | 1.16 | 1.2 |
| Frame (half-sizes) | 4.9 × 4.3 | 5.05 × 4.43 | 5.24 × 4.6 | 5.44 × 4.77 | 5.68 × 4.99 | 5.88 × 5.16 |
| Extra roaming room (units) | 0 | 0.08 | 0.18 | 0.28 | 0.4 | 0.5 |

- **What grows.** The frame animals keep to (`worldFor(level)`), the outer edge of every
  species' roaming band and of the tuna school's (`roamFor(level)`), where leaps may
  happen, and the camera's view (`oceanScale(level)`, applied by `SceneCamera`). The
  seabed, water and depth map already reach well past the widest view, so no geometry
  changes and the water's cost is the same at every level.
- **Smoothly.** A new level reshapes the island at once (it grows 2.5% per level, and
  islets appear at levels 5 and 6; animals near the shore ease out of the way), while
  the frame, the roaming room and the camera ease to the new level's together, over
  about 3 s. Nobody is moved or restarted: the scene keeps its animals.
- **Taps stay easy.** Pulling back makes everything smaller on screen, so a slender
  animal's invisible tap target grows with the scale: at least 28 pt across on a phone
  at every level (`MIN_TAP` in `src/components/home/three/tap-target.ts`).

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
| More or fewer leaps | `DOLPHIN_BREACH.chance` (per breath), `cooldown` (s per pod) | A leap also needs room; crowded, low-level scenes leap least |
| A higher, longer or slower leap | `apex`, `length`, `air` | The launch angle is atan(4 × apex / length): keep it between about 35° and 65° |
| Leaps nearer the island or the view's edges | lower `islandMargin`, raise `frameEdge` or `view` | Above `view` 0.6 the leap reaches the haze at the top and bottom |
| Bigger or smaller groups | `GROUP_SIZES` (per species), `GROUP_BUDGET` (extra animals in all) | A model's style needs a place for each follower |
| Looser or tighter groups | a style's `places` and `wander` | Places closer than about 0.55 across make dolphins touch |
| More or less place trading | `swapEvery`, `swapTime`, `dip` | 0 `swapEvery` means never |
| More or less room at higher levels | `OCEAN_GROWTH.scale` and `.roam` | Keep level 6 at about 1.2 or less, so the island stays readable |
| Faster or slower level change | `OCEAN_GROWTH.ease` (1/s) | The camera and the space share it |

## Debug overlay

Set `EXPO_PUBLIC_MARINE_DEBUG=1` and restart Metro with `--clear`. The island then
shows:

- each species' clearance line (cyan), and for leapers the nearest a leap may come to
  the island (magenta);
- the frame at the current level (white), easing as the ocean grows, and the camera's
  view on the water (light blue), which widens with it;
- for each animal, its footprint (white), desired direction (yellow), animal
  avoidance (red) and island avoidance (green);
- for each group, its center and the ring its members swim within (lilac), and each
  follower's place with a line to it (violet);
- for a leap, its arc through the air at its true height (magenta) and where it lands
  (white cross).

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

Groups and leaps, measured the same way with the eight species and the tuna school
(simulation), and on the software renderer the simulators use (a 390 × 363 canvas,
median over 20 s of the scene, so animals on a dive are included as they come and go):

| | Simulation (µs per frame) | Frame on the software renderer (ms) |
| --- | ---: | ---: |
| Eight species, alone | 94 | 28.9 full, 14.8 lite |
| With the lite budget of group members (3) | 122 | 17.2 lite |
| With the full budget of group members (6) | 140 | 35.1 full |

A group member costs less to simulate than a species' own animal (it follows rather than
plans its route), but it is one more animated model to draw and skin, which is why lite
quality allows half as many. Leaps cost nothing measurable: a room check about ten times
a second while a breath that rolled a leap waits for room. Splashes draw nothing while
the water is calm, then one instanced draw call for their rings (and one for droplets in
full quality). The ocean's growth adds no geometry: the same water and seabed at every
level.

## Verifying

```sh
npx jest src/lib/__tests__/marine-motion.test.ts src/lib/__tests__/breach.test.ts \
  src/lib/__tests__/marine-groups.test.ts src/lib/__tests__/ocean-growth.test.ts
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
- the dolphin breathing: brief, just below the surface, and never next to a dive;
- leaps (`breach.test.ts`): one smooth arc, rare and decided once (the same leaps at 20
  and 60 fps), only with room (island, frame, the clear view, other animals, no dive),
  always completing once airborne, one per pod at a time with the cooldown between, the
  body's pitch through the arc, and the two splashes;
- groups (`marine-groups.test.ts`): sizes and the budget, one species with lanes of its
  own, pods holding together without jumps or clashes, followers' island clearance and
  frame, staggered breaths, and pods passing other animals;
- the growing ocean (`ocean-growth.test.ts`): the scale at every level, animals and the
  school in view and off the island at all six levels, a level change easing without
  moving anyone, and animals using the extra room.

`npm run verify:underwater` checks that slender animals' tap targets are at least 28 pt
across at levels 1 and 6, on the body, and follow it when it pitches and leaps.

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
- Leaps need a stretch of open water in the clear part of the view, so they stay rare.
  In simulation (30 visits of 20 minutes each, at levels 1, 3 and 6), a lone dolphin
  leaps about every 6 minutes and a pod on its own about every 7 or 8; a pod with two to
  four other large animals about every 13, and a lone dolphin among four others about
  every 20. Only a third to 40% of breaths are clear of a dive, and `chance` of those
  roll a leap; in company only about a third of the rolls find room, and in a pod more
  than half of the run-ups are called off at the last check, mostly because a podmate
  has come into the path. Raise `chance` for more, or set `EXPO_PUBLIC_DOLPHIN_LEAPS=1`
  to review them.
- A follower swims behind its leader's turn, so while the leader turns its heading lags
  a little, as a real pod's does; right after a reversal or a leap, the group takes a few
  seconds to settle back into its places.
