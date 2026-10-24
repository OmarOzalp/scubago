# Island navigation

How the animals around the island decide where to swim: finding their way around
each other, keeping clear of the island and islets, and turning and banking
smoothly; swimming in small groups; the dolphins' leaps; the ocean widening as
the island levels up; and the reef's own animals, which keep to the reef rather than
the open water ([Reef habitats](#reef-habitats)). Everything lives in
`src/lib/marine-motion.ts` and, for the reef, `src/lib/reef-life.ts`; the islands'
shapes and the shore-distance field are in `src/lib/island-outline.ts` (each island's own: a
simulation is told which, `shape`, and steers its animals around that one), the groups in
`src/lib/marine-groups.ts`, the leap's curves in `src/lib/breach.ts` and the ocean's
growth in `src/lib/steering.ts`. Swimming gait (tail beats, wing and flipper strokes)
is separate, in `src/lib/marine-rigs.ts`.

## How it works

The school is one small simulation, stepped at a fixed 60 Hz with interpolated
poses, so a 20 fps simulator and a 60 fps phone move animals identically. Each
step, every animal blends a few influences into one desired direction, and all
of them decide from the same snapshot:

- **Going round (the base path).** Every animal circles the whole island, all the
  way round and on round again, in a lane of its own: its own distance offshore,
  following the coast's shape there (the shore-distance field's line it is on), never
  turning back. Some go round one way and some the other (`direction`, by lane: about
  two in three one way). Its lane is a share of the way across its
  species' range (`islandClearance + roam`, the outer end farther out as the ocean
  grows), so reef fish swim close in, the sharks farther out and the biggest animals
  farthest out of all. An island's species, lanes 0, 1, 2 and on, are spread across
  their ranges by the golden ratio (the first in the middle, the next two near either
  end, each new one between those already there), and each drifts gently in and out
  of its lane (`LANE.drift` of the range over `roamPeriod`). Where the water is
  narrower than the range (the frame, or a lagoon), the lanes squeeze into what there
  is, each keeping its share. It eases into its lane briskly going out and gently
  coming in, so it never overshoots or steers so steeply that it would not go on round;
  whatever else it makes room for, at least a quarter of its course is onward round the
  island (`ONWARD`), and a little of it round the island's middle (`ONWARD_ROUND`), so a
  bay between an islet's shelf and the island's is cut across rather than doubled back
  out of.
- **Lanes (animal avoidance).** When two animals will come alongside within about
  14 s and there isn't room for both (mostly two going round opposite ways, meeting
  head on), they move into lanes a body-width apart,
  measured in distance offshore. They do it gradually, well before they meet, and
  drift back afterward. Passing side by side replaces slowing down behind or
  swerving at the last moment. Each pair keeps its sides for the whole encounter:
  the sides that move the heavier of the two less (so a turtle in a lane close in,
  with no room to go farther in, passes a whale shark on the outside), or, where
  that is the same either way or one of them leads a group (its followers trail a
  big move across), the one heading farther out takes the outside. The move is shared by
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
  turn to run along the edge the way they go round, rather than straight back; at the
  edge, where the coast's line it would follow runs on out of the view, an animal
  follows the frame's edge round instead.
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

## Depth

Animals swim in the water over the seabed under them, never in it. Where in that water, and how the
steering keeps them to places with room for them, is in `src/lib/seabed.ts` (the bottom),
`src/lib/marine-bodies.ts` (the bodies and where each lives) and the height code of
`src/lib/marine-motion.ts` (`swimHeight`, `settleHeight`).

**The bottom.** One function, `createSeabedField`, gives the seabed for the depth map the water and
seabed are drawn from (`ocean-mesh.ts` asks it) and for the animals above it, so what they swim over is
what is drawn. `createSeabed(level, shape, world)` bakes it for one island's animals once per island and
level: a grid every .1 unit with the beach, shelf, the Coral Reef's lagoon and crest (`seabedProfile`), the
bank between the islands in the explorer (`world`: all the islands and which this is), and the things standing
on it, as domes (the Coral Reef's coral heads, showpiece corals, reef rock, dens and anemones; the Shipwreck's
steamer). `floor()` is everything; `ground()` is the bare seabed, which the reef's own animals (octopus, cuttlefish,
moray, clownfish) live in and against. Looking a height up is a bilinear read of the grid, never a profile.

**The bodies.** Each model's reach from its middle is a *hull* (`HULLS`): how far its body hangs below, how far
its fins or wings, nose and tail do (a shark's tail hangs lower than its nose), how high its back or dorsal fin
reaches, and half its span and length, measured from the shipped models over a swimming stroke at cruise and in
gentle turns and climbs, rounded up. `npm run verify:marine` checks that no model has grown past its hull. Seven
points of a hull (keel, nose, tail, both sides halfway out, both fin tips), turned as the animal is drawn (roll,
then pitch, then heading), must each be at least a *margin* (`marginOf`: .03 plus .03 of its half length, so a
whale shark keeps .14 and a clownfish .04) above the seabed under it.

**Where each lives** (`STANCES`, and `stanceOf` for species that share a family model):

| Stance | Who | Swims at |
| --- | --- | --- |
| `bottom` | rays, stingrays, sawfish, guitarfish, wobbegong, zebra and nurse sharks, whitetip reef shark, groupers, lionfish, batfish, leafy seadragon, dugong, and the bottom-living fish (frogfish, stonefish, eels, jawfish, lingcod, mandarinfish) | `band` units above the lowest its body may be (.03–.12), following the bottom |
| `reef` | reef fish, angelfish, parrotfish and wrasse, turtles, trevally, barracuda, eagle rays, grey and blacktip reef sharks, lemon and sand tiger sharks, tarpon, seals, sea lions, otters, jellyfish, the iguana | `band` of the way up the water between the lowest it may be and just under the surface: .3 for the low ones (the garibaldi, the angelfish) to .9 for the jellyfish and 1 for the iguana, which swims at the surface |
| `open` | whale shark, great white, tiger, hammerhead, thresher and Galápagos sharks, mantas, mola, whales, orca, sailfish, dolphins, whitetip, leatherback | .3 (whale shark, whales) to .75 (the dolphin and the sailfish): the deeper ones deep, off the reef |

Air-breathers still come up to breathe and the dolphin still leaps: those start from wherever its depth is.

**Its height.** Each step, `survey` finds the lowest its middle may be here (`lowestMiddle`: every hull point above
the bottom under it by the margin, at its heading, pitch and roll), the same a second and a half and two and a half
seconds ahead along its way (so it climbs a slope in good time), and the highest (its back just under the surface).
It aims at its place between them (`swimHeight`), over the *envelope* of the lowest: it rises with the bottom at
once and sinks back only at .3 units/s, so it never zigzags with broken ground (and the look-ahead never lifts
it above where its back stays under the surface: the steering is what turns it from a shoal ahead). Its height eases to that as it
always did, and is never below the lowest, whatever a breath, a plunge or a dive do (`settleHeight`). Where the
water is too shallow for it (the lowest above the highest) it rides the lowest, with its back out of the water,
and the steering keeps it from such places. Its pitch follows the slope it swims along (`slope`, the climb of its
height, as the angle of its path, a little over half of it, up to .3 rad), and a breath or a dive tips it as they
always did. What is published each frame is checked once more against the bottom under where it is drawn, with
the dive's sinking added: the interpolation between two steps, the surge rocking a seadragon, none of it can
put a body below the seabed, and a body that has a tail or fin over the dry sand is nudged out along the shore.

**Where it fits** (the steering). A body too big for the water at a place (`tooShallow`: it could not swim there
along the coast, going either way, or turned either way off the coast by up to .45 rad (three headings for a small body, up to nine for the widest: close
enough that a wingtip is within about the bottom grid's own reach of its place at one of them, so a wall is not stepped over
between two), with the whole of its hull above the bottom and no more than the top fifth of its back out of the water) is *shore* to it. The island's steering field for that animal (`avoidShallows`) is the
land's distance blended with the distance to those places, which count `offset` units nearer than they are (its
island clearance and .05, less the room it keeps from them, `shallowClearOf`: .1 for a fish, up to .5 for a whale), so everything
that follows the coast follows the lagoon, the crest and the shelf as well: roaming at its distance offshore,
the predictive turning away, lanes measured offshore, the U-turn's room, followers' clearance, leaps. A whale shark
at the Coral Reef keeps beyond the reef; a clownfish keeps to the lagoon. It starts at the first water with the
room its band asks for (with no part of its body on the dry sand), or where there is most, and its band reaches
no farther than the water does (a lagoon narrower than the band puts it in the middle of the lagoon). A body taller than the deepest water there is (the sunfish, on its side) fits where the water is deepest and no
more, with whatever of it stands out of the water standing out.

**The biggest animals and the Coral Reef's shelf.** The Coral Reef's crest comes almost to the
edge of the frame, and a whale shark, a manta or a leatherback needs a unit of deep water beyond the slope outside it for its
wingtips (the hulls' `wing` and `width`). So the reef's outer slope, which ran down gently to a floor out past the frame, falls away as a steep wall just past
the coral (`OCEAN.reefCrest`: `wall`, shelf reach 1.96 to 2.16, to a floor `drop`, .6, deeper than any other island's, in
`src/lib/ocean.ts`; the island, the beach, the lagoon, the crest and its shoulder are as they were): the water just outside
the crest is deep enough for the biggest bodies from about the edge of the frame, not past it. The wall is in the one depth
field the water is drawn from and the animals swim over (`seabed-lattice.ts` has rings of its own on it, at fixed values of the
reef's measure of distance, so each is at one height round the island), so what a body avoids is what is drawn. (The seabed is
drawn without depth testing, so its triangles are drawn farthest from the camera first, `farthestFirst` in ocean-mesh.ts: a wall
that steep hides the floor beyond the crest, and drawn the other way round that floor would be painted over the crest; and what
the depth map, which is read from above, makes of a wall, is made deeper blue the deeper it really is, so that it reads as water.) With the
view zoomed out a tenth (`VIEW_ZOOM`, [A growing ocean](#a-growing-ocean)), what is left is a ring of deep water round the island,
inside the frame, all the way round for every body at the first four levels (narrowest, .16 units to spare, for the humpback, the
leatherback, the sunfish and the oceanic manta in the south at level 1), which each of them goes round in like any other animal:

- the places too shallow for it are held to exactly (`leaveShallows`: a step that takes it into them is taken back, so that it moves
  no faster than it swims: heading into the edge of its water it is turned aside, heading along it, it slides), and every body is
  held to the frame's bounds the same way (1.13 of the usual frame, or 1.09 of its own ocean, `factor` times the usual where its
  water asks for more room, `src/lib/shelf-water.ts`, at most 1.15; a pod's follower, which swings a little wide of its leader, 1.11);
- the water it keeps to is the places too shallow for it *opened* by `SPECK` (.25 units): a thin streak of them (where the coast's
  direction turns between two of the field's cells, a body heading along it swings its tail over a slope at one and not the next) is no
  shore, so what the steering follows is the water's shape, not its specks;
- held at the frame's bound with no water it fits in short of it (`HOLD_GIVE`: within .02 of its bound), it is no longer turned out of
  the shallows: it goes on round along the frame, riding over them, rather than leave the view or turn back, and keeps level while it
  has no room under it (`LEVEL_ROOM`: tipped, a long body's nose would stand out of the water).

At the last two levels the islets' shelves leave the widest bodies no such ring: the reef's wall belongs to the main island, and
where an islet's shelf is nearer the slope is the usual gentler one, to a floor about .6 shallower, so between the islets' reefs and
the frame there is water deep enough for the whale shark, the great white and the tiger shark, but not for the humpback's or the
reef manta's fins (two units and more across) all the way round: going round, they ride over the islets' shelves for part of each
lap, their backs at the surface (no wider frame helps: at the southwest islet the shelf reaches out past 1.3 of it). The tuna school
asks for less (`SCHOOL_SHELF`, a pass a unit wide in an ocean 1.1 times the usual, and its fish are kept out of water too shallow for
them). At the Coral Reef every large animal is in view (inside the camera's picture, on a phone's canvas) all the time, at every level
(`npm run verify:swim` reports the share out of view and in water too shallow for the body, per animal).

**The bottom, as the grid has it and as it is drawn.** The baked grid (`Seabed.floor`, `solid`, `ground`) holds the highest the
drawing is within a tenth of a unit of each point, so what is read between its points is never lower than the drawing: a body
that clears it clears the seabed. Over a steep slope that is a good deal higher than the drawing (the Coral Reef's outer wall
drops about two units in a third of one), which is right for a body that must not touch it and wrong for one that lies on it.
So the reef's own animals (the octopus, the cuttlefish, the moray) and the tuna school's fish, which are smaller than the grid's
reach, read and clear the bottom exactly as it is drawn (`Seabed.exact`: the very triangles of the water's seabed, found in a
grid of lists).

**Diving.** A dive no longer sinks an animal into the seabed: it sinks as far as the water under it leaves it (drawn, less half its margin, since what is drawn is not where the last step put it)
(`sink`, from `room`, easing as the bottom rises under it), and fades out of sight where it is when there is no more
room, in the same time as before. An animal on a dive is still passed over by the others (it is faded).

## Groups

A species that swims in a group is still one species: one discovery, one of the
animated species (`MAX_ANIMATED`), one tap destination (every member opens its page)
and one slot in the dive schedule. Its extra members come from a budget of their own
(`GROUP_BUDGET`: 6 extra animals, 3 where the GPU is emulated), given to the dolphins'
pods first, then the sea lions, a jellyfish swarm (alone, a jellyfish is hardly one),
hammerheads and lemon sharks, eagle rays, trevally packs and tarpon, barracuda schools and shoals. Each visit picks the group sizes
afresh within each species' range (`GROUP_SIZES` in `src/lib/marine-groups.ts`):

| Species | Animals | Why |
| --- | ---: | --- |
| Bottlenose and spinner dolphins | 2–3 | Dolphins travel in pods |
| Scalloped hammerhead | 2–3 | They school (famously at the Volcanic Pinnacle's seamounts); great hammerheads are solitary and stay alone |
| Chevron barracuda | 3–5 | Tornado schools (drawn with the great barracuda's model; great barracuda hunt alone) |
| Giant trevally | 3–5 | They hunt in packs, in tight formation (their own model and style) |
| Bumphead parrotfish | 2–3 | Herds |
| Raccoon butterflyfish | 2 | They go about in pairs |
| California sea lion | 2–3 | They play in small groups |
| Spotted eagle ray | 3–4 | They fly in squadrons |
| Tarpon | 2–4 | Small groups that roll up together to gulp air (their own model and style) |
| Lemon shark | 1–2 | Usually alone, now and then two patrolling the shallows together |
| Golden jellyfish | 4–6 | They drift in swarms (millions, in Palau's Jellyfish Lake) |

Clownfish always come as a pair, but on the reef (see [Reef habitats](#reef-habitats)),
outside this budget. Munk's devil rays school too, but share the family ray model, and
a second squadron of wide rays would crowd the ring of water at low levels.

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
  also slips beneath it. A larger animal of another species in its way, it passes over if it is the higher
  and beneath if it is the lower, by the depth `FOLLOWER_CLEAR` asks between them as they are in the water now
  (a body's stance is not its species' usual depth), starting while the two are still a unit and a half apart,
  as a change of depth is slow.
- **Along the shore.** A place that would put a follower inside its island clearance
  moves out to the clearance, and the group then swings its places to the open side.
- **Breathing.** Members breathe one after another, `stagger` seconds apart (2.4 s for
  dolphins), and a third member now and then stays under for a breath (`skip`).
- **Dives.** The group dives on its leader's cycle, each member 0.8 s after the one
  before, so a pod sinks one by one.

| | Dolphin pod | Hammerhead school | Reef-fish shoal |
| --- | --- | --- | --- |
| `places` (across, behind) | (0.62, 0.55), (−0.6, 1.15) | (1.05, 1.25), (−1.1, 2.1) | (0.34, 0.4), (−0.32, 0.55), (0.1, 0.92), (−0.38, 1.08) |
| `wander` / `wanderPeriod` | 0.16 / 13 s | 0.35 / 27 s | 0.14 / 7 s |
| `swapEvery` / `swapTime` | 38 s / 4.5 s | 80 s / 7 s | 16 s / 2.6 s |
| `dip` / `depthSpread` | 0.32 / 0.08 | 0.38 / 0.16 | 0.16 / 0.07 |
| `stagger` / `skip` | 2.4 s / 0.4 | – | – |

| | Sea lions | Eagle-ray squadron | Barracuda school | Jellyfish swarm |
| --- | --- | --- | --- | --- |
| `places` (across, behind) | (0.5, 0.45), (−0.48, 0.95) | (0.85, 0.62), (−0.85, 0.62), (0, 1.25) | (0.3, 0.35), (−0.3, 0.5), (0.05, 0.9), (−0.35, 1.05) | (0.5, 0.25), (−0.42, 0.45), (0.18, 0.85), (−0.6, 1.0), (0.55, 1.2) |
| `wander` / `wanderPeriod` | 0.22 / 8 s | 0.07 / 17 s | 0.1 / 12 s | 0.2 / 11 s |
| `swapEvery` / `swapTime` | 18 s / 3 s | never (they hold formation) | 30 s / 4 s | never |
| `dip` / `depthSpread` | 0.3 / 0.09 | 0.2 / 0.07 | 0.14 / 0.06 | 0.08 / 0.1 |
| `stagger` / `skip` | 1.6 s / 0.3 | – | – | – |

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
| Frame (half-sizes) | 5.39 × 4.73 | 5.55 × 4.87 | 5.77 × 5.06 | 5.98 × 5.25 | 6.25 × 5.49 | 6.47 × 5.68 |
| Extra roaming room (units) | 0 | 0.08 | 0.18 | 0.28 | 0.4 | 0.5 |

**The zoom.** Every level's view is a tenth wider than it was (`VIEW_ZOOM`, 1.1, in `src/lib/steering.ts`), uniformly, on every
island: the island sits a tenth smaller on screen, and the frame (`WORLD`), the camera's span (`VIEW_SPAN`, which `SceneCamera`,
`viewHeight` and `viewBounds` use), the slender animals' least tap target (`MIN_TAP`), how far the explorer's water reaches
(`EXPLORER.reach`) and the gaps between the explorer's islands (`ISLAND_PLACES`) all come from it, so the camera and the animals'
frame always agree. It is what gives the biggest bodies a ring of deep water all the way round the Coral Reef (above).

- **What grows.** The frame animals keep to (`worldFor(level)`), the outer edge of every
  species' roaming band and of the tuna school's (`roamFor(level)`), where leaps may
  happen, and the camera's view (`oceanScale(level)`, applied by `SceneCamera`). The
  seabed, water and depth map already reach well past the widest view, so no geometry
  changes and the water's cost is the same at every level.
- **Smoothly.** A new level reshapes the island at once (it grows 2.5% per level, and
  islets rise from the water at levels 5 and 6; animals near the shore ease out of the way), while
  the frame, the roaming room and the camera ease to the new level's together, over
  about 3 s. Nobody is moved or restarted: the scene keeps its animals.
- **Taps stay easy.** Pulling back makes everything smaller on screen, so a slender
  animal's invisible tap target grows with the scale: at least 28 pt across on a phone
  at every level (`MIN_TAP` in `src/components/home/three/tap-target.ts`).

## Arrivals

A species logged for the first time swims in from beyond the edge of the view when My Home next
opens, in its own way (`arrive()` and `ARRIVAL_PACE` in `src/lib/marine-motion.ts`). Until its turn
it waits out of sight, invisible and ignored by the others. The tuna school can do the same
(`holdSchool()`), and the reef's animals arrive on the reef instead ([Arriving](#arriving)). The
whole sequence, with the level-up banner and islets rising, is in
[discovery-moments.md](discovery-moments.md).

### Taking turns

An island animates at most `MAX_ANIMATED` (8) of its species. With more in the collection they take turns, one at a time, and
nobody else is moved or restarted: the scene keeps one simulation for its whole life (`src/components/home/three/marine-swimmers.tsx`;
a level change still goes through `setLevel`).

- **When.** About every 40 s of the scene on show (`TURNS` in `src/lib/swimming.ts`: `every` 40, each turn up to a quarter longer
  or shorter, each island on its own clock, so they never change together), never while a discovery moment plays (`moments.busy`),
  never while the scene is not on show, and not until the newcomer's model has loaded (it is fetched ahead).
- **Who.** The species longest on the island leaves (never a new discovery being shown), and the next in the collection that is not
  on the island comes on (round robin, so everyone gets a turn). A species leaving keeps its lane for `leave` (30) seconds.
- **Leaving** (`depart()` in `src/lib/marine-motion.ts`). It swims out to sea, away from the island and on from its way round,
  past the edge of the view, its group with it, fading out past 1.1 of the frame (`DEPART_FADE`), and is gone once out of sight
  (or at once if it is down on a dive); it is passed over by the others as it goes. The reef's own animals fade out where they are
  (`reef-life.ts`, `LEAVE_FADE`).
- **Coming on** (`add()`). It arrives from the open sea as a new discovery does (`arrive()`), at the freest place round the island,
  in its own way and with its group, and joins its lane. A reef animal arrives on the reef in its own way. The dives' staggering
  eases to the new number of species, so no animal's dive jumps.

## Reef habitats

Each species has a habitat (`habitat` in `MOVEMENT`): `open-water` (the default: every
animal above, steered here), or one of the reef's own. The reef's animals have their own
simulation, `src/lib/reef-life.ts`, which `createMarineMotion` runs beside the open
water's in the same fixed 60 Hz steps:

| Species (model) | Habitat | Where | How it moves |
| --- | --- | --- | --- |
| Day octopus (`day-octopus`) | `seabed` | Its patch of the sandy shelf beside its rock | Walks a short way, pauses, rests coiled by its rock; now and then a short jet |
| Giant cuttlefish (`giant-cuttlefish`) | `reef-edge` | Its stretch of the reef edge, where the bottom drops away, higher in the water | Hovers, glides to a new spot, rises and sinks; a rare jet |
| Giant moray (`giant-moray`) | `crevice` | Its den in the rocks, head out; now and then its other den nearby | Lies still breathing, slides out, swims along the shelf, goes in head first |
| Ocellaris clownfish (`clownfish`) | `anemone` | A pair over their anemone on the shelf | Hover rowing with their pectorals, dart about in short hops, now and then one ventures out and darts back; duck down into the tentacles when a big animal comes close |

**Kept apart from the open water.** The open-water animals, their groups, the dolphins'
leaps and the tuna school never see the reef's animals: they are not among the animals
the steering, the school's neighbors or a leap's room check look at, and they don't count
toward the open water's dive staggering or starting places. With or without reef animals,
the open water's animals and the school move exactly the same (a test checks it). The reef's
animals do notice the open water's large animals passing over them, as the camera sees them
(each animal's apparent footprint, see `ReefVisitor` and `REEF_THREAT`): sharks most, then
the dolphin, while big animals that eat neither barely count.

**Anchors and zones, no pathfinding.** The places are found once per level from the island's
outline and the seabed's profile (`reefRocks()`): each moray's two dens, facing each other
along the coast (`MORAY_DENS`), each octopus's rock (`OCTOPUS_ROCKS`) and each clownfish pair's
anemone (`ANEMONES`, at 70° and 195°, reach 0.7: the open stretches of shelf clear of the corals,
rocks and dens at every level); each cuttlefish has a stretch of reef edge (`CUTTLEFISH_REEFS`).
The anemone counts as a rock for the octopus, which walks round it. They are given as an angle around the island and a
*reach*, the seabed's own distance from the shore (`seabedProfile` in `src/lib/ocean.ts`: the
beach slopes down to the flat shelf by 0.62, and the reef edge drops away past 0.78). All are
clear of the corals and the reef rock (`SEABED_PROPS` in `island-outline.ts`, which the
environment places too), of the islets at levels 5 and 6, and of each other. An animal picks
a target inside its zone, checks the way there for room in a few places, and steers for it;
a den's mouth is aimed so that a moray coming straight out stays on the shelf. As the island
grows with the level, the rocks move out with it and so does everyone on them.

**Clear of the island, as the camera sees it.** Like the open water's, the reef's animals keep
their distance from the beach at their apparent place (the octopus's every arm: `clear` 0.62),
so nothing slips under the sand layers. Zones use the seabed's exact distance from the shore
(`shore()` on the shore field, with the islets as they are), and heights follow the bottom.

**Drawn as part of the bottom.** The seabed is drawn behind everything, so the octopus, the
moray and their rocks are set back in depth by `FLOOR_BIAS` (one unit, see `ReefLook` in
`underwater-material.ts`): an open-water animal passing over them is drawn above them, as it
is above the seabed, while they still hide each other properly and the island's beach still
covers anything behind it. The cuttlefish, which hovers higher than the open water's animals
swim, is drawn where it is. The part of a moray inside its den is cut away in the shader
(`setHide`), where the den's boulder covers the seam; its mouth is placed far enough inside the
boulder (`REEF_ROCK`) to hide the cut. Color states are a per-animal tone (`setTone`:
brightness, saturation and contrast about its own average shade). These animals use their own
program (`-reef` in the cache key); the open water's programs are untouched.

### The octopus

It rests 9–20 s beside its rock (`rest`), arms coiled and colors muted, then makes an outing of
two to four walks (`legs`) to spots on its own side of the rock (`spread` 0.5 rad, `reach`
0.5–0.98), walking at 0.075 units/s, sometimes pausing (`pause`), and walks home. At the start
of a walk, if its last jet was at least 30 s ago (`jet.cooldown`) and there is room behind it,
it may jet instead (`jet.chance` 0.4): it lines up, draws water into its mantle, pushes off
mantle first with its arms trailing (0.6 s, `jet.speed` scaled to the distance, 0.4–0.65
units), glides as its arms loosen (1.8 s), and settles back to the bottom. A jet that would
carry it off its patch stops short. A large shark close above (`wary`) makes it go still, press
flat and darken until it has passed. Its tones: walking `1, 1, 1.05`, resting `0.82, 0.85, 1.1`
(darker, muted), wary `0.7, 0.78, 1.15`, jetting `1.15, 1.18, 1` (brighter).

### The cuttlefish

It hovers 4–9 s (`hover`), looking about, its fin skirt rippling gently, then glides 0.35–1.3
units to a new spot on its stretch of reef edge (`cruise` 0.13 units/s), rising or sinking within
its band (`height`, world y −0.72 to −0.42, at least `floor` 0.16 above the bottom). A predator
close by (`startle`: a shark or the dolphin within 0.3, apparent gap) makes it swing round to face
it, flash darker and bolder (`0.82, 1.1, 1.65`), and jet backward away from it (0.55 s at up to
0.6 units/s, then a 1.4 s glide), choosing the nearest direction that leaves it room over its reef
edge; no more than once every 75 s (`jet.cooldown`). Unprompted jets come every 120–240 s
(`jet.every`). Gliding, its pattern is a little bolder (`1, 1.05, 1.22`); hovering, calm.

### The moray

It lies in its den with half its body inside (`inside` 0.5) and its head out in a gentle S,
breathing (the mouth opening and closing), looking about and sliding a touch in and out, for
35–80 s (`den`). Then, with a 30% chance (`move`), it moves: it slides out along the mouth
(0.16 units/s, `slide`), swims along the shelf toward its other den (0.2 units/s, keeping to
`reach` 0.88), swings out in front of the den's mouth to come in straight, goes in head first,
turns round out of sight (1.5–3 s) and comes out again to rest facing the way it came. A large
animal (half-length 0.9 or more) passing within 0.15 of its head (`retreat`) sends it back into
its den (`hidden` 0.82: only its head showing) until the water has been clear for 3 s.

### The clownfish

A pair (the second has a follower's lane, `followerLane(lane, 1)`, and opens the same page) live
over one anemone (`REEF_ANEMONE`: tentacles reaching 0.46 from its middle, their tips 0.17 off the
bottom), drawn by `reef-anemone.tsx` with its tentacles swaying in the swell. They hover 0.5–2.2 s
(`hover`) 0.2–0.32 above the bottom, rowing in place and turning to look about, then dart 0.08–0.3
to a new spot over the anemone (`dart` 0.34 units/s, `turnRate` 3.2 rad/s: a quick turn, a dash and
a hard stop), never more than 0.36 from its middle (`radius`). The first picks the spots; the
second keeps 0.1–0.2 from the first's next spot (`mate`). Now and then (`venture.chance` 0.12) the
first darts a little way out (0.7) and the next dart brings it back. A large animal (half-length
0.6 or more) within 0.45 of the anemone (`wary`, apparent gap) sends both down into the tentacles
(`nestle`, 0.1 off the bottom, near the middle) until the water has been clear for 2 s. Sharks,
sea lions, dolphins and the barracuda are alarming to the reef (`REEF_THREAT`); the clownfish
hide from anything big enough, as they would in their anemone.

### Arriving

A new reef discovery arrives the reef's way, not from beyond the view: the octopus edges out
from beside its rock as it fades in, arms first; the cuttlefish glides in from the deep side of
its reef edge, rising and fading in; the moray comes out of its den head first; the clownfish
pair dart in over their anemone from a little way off. With reduced motion or a paused scene it
is simply there.

### Tuning

All in `REEF` (`src/lib/reef-life.ts`). Places: `MORAY_DENS`, `OCTOPUS_ROCKS`, `CUTTLEFISH_REEFS`,
`ANEMONES`, `REEF_ROCK` and `REEF_ANEMONE` in the same file. How alarming each open-water species is: `REEF_THREAT`. Sizes in
the scene: `REEF_SIZE`. The arms', fin skirt's and body's motion: `SWIM_RIGS` in
`src/lib/marine-rigs.ts`. A third octopus or a second moray takes the next place in the list
(three rocks, two pairs of dens); only two species share the moray's model, so two pairs are
enough, and a fourth octopus shares the first's rock, resting on its other side.

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

The six newest (batch v4), each told apart by how it moves as much as by its shape:

| | Great barracuda | Sailfish | California sea lion | Spotted eagle ray | Golden jellyfish |
| --- | ---: | ---: | ---: | ---: | ---: |
| `cruise` (units/s) | 0.34 | 0.55 | 0.46 | 0.36 | 0.08 |
| `surge` | 0 | 0.15 | 0.25 | 0 | 0 |
| `turnRate` / `turnEase` | 0.45 / 0.6 | 0.5 / 0.65 | 0.75 / 1.0 | 0.34 / 0.5 | 0.14 / 0.3 |
| `bank` / `bankMax` | 0.4 / 0.14 | 0.55 / 0.22 | 0.9 / 0.45 | 1.4 / 0.32 | 0 / 0 |
| `halfLength` × `halfWidth` | 0.8 × 0.13 | 1.1 × 0.18 | 0.7 × 0.3 | 0.5 × 0.7 | 0.25 × 0.25 |
| `islandClearance` / `roam` | 0.8 / 0.1–0.75 | 1.05 / 0.35–1.1 | 0.8 / 0–0.8 | 1.0 / 0.15–0.9 | 0.7 / 0–0.75 |
| `depth` / `bob` | −0.04 / 0.025 | +0.12 / 0.03 | +0.15 / 0.09 | −0.02 / 0.07 | +0.2 / 0.05 |
| `weave` (rad, over s) | – | – | 0.3, 7 | – | 0.45, 23 |
| Group | alone | alone | 2–3 | 3–4 | 4–6 |
| Special | `pause` (lurk, dash) | `pause` (sail display, dash) | `breathe`, `barrel` | – | – |

- **Pauses** (`pause`): every `every` seconds it slows to `slow` of its cruise for `hold`
  seconds, then dashes at `burst` times its cruise for `dash` seconds (a group pauses on its
  leader's clock; never while arriving, hunting, leaping or on a dive). The **great barracuda**
  hangs almost motionless for 7 s of every 24 (`slow` 0.07, its rig's `hover` stilling the
  tail), then shoots off at 2.6× for 1.4 s. The **sailfish** slows to 0.42 for 4.5 s of every
  32 with its sail fully raised (`MarinePose.sail` 1) and rolls 0.5 rad onto its side to show
  it, alternating sides, then folds the sail flat (0) and bursts away at 2.3× for 2.2 s.
- **Barrel rolls** (`barrel`): the **sea lion** rolls a full turn about its length over 1.5 s,
  in about four of every ten 16 s windows, never while breathing, leaping or diving (the roll is
  added to its bank and interpolated the short way, so it ends where it began). It also comes up
  to breathe every 30 s (`breathe`), and twists through the tightest turns of all, its whole
  body bending.
- The **spotted eagle rays** fly a steady, deep-banked course in formation; the **jellyfish**
  drift slowly just under the surface on meandering courses, their bells pulsing; the
  **clownfish** never leave the reef (above).

Their depths layer too: the jellyfish just under the surface, the sailfish and sea lions high,
the eagle rays and barracuda in mid-water.

The Open Ocean's five (see `docs/archipelago.md`) keep well out from the island, in the deep
blue around it: the largest clearances and roams of any animals here.

| | Humpback whale | Sperm whale | Oceanic whitetip | Leatherback turtle | Oceanic manta |
| --- | ---: | ---: | ---: | ---: | ---: |
| `cruise` (units/s) | 0.3 | 0.26 | 0.38 | 0.4 | 0.3 |
| `turnRate` / `turnEase` | 0.2 / 0.3 | 0.15 / 0.25 | 0.36 / 0.45 | 0.3 / 0.42 | 0.25 / 0.4 |
| `bank` / `bankMax` | 0.55 / 0.2 | 0.3 / 0.08 | 0.45 / 0.16 | 0.5 / 0.12 | 1.7 / 0.34 |
| `halfLength` × `halfWidth` | 1.55 × 0.75 | 1.5 × 0.35 | 1.05 × 0.55 | 0.7 × 0.8 | 0.83 × 1.18 |
| `islandClearance` / `roam` | 1.45 / 0.45–1.05 | 1.5 / 0.5–1.1 | 1.15 / 0.4–1.15 | 1.2 / 0.4–1.1 | 1.35 / 0.3–1.0 |
| `depth` / `bob` | −0.14 / 0.07 | −0.2 / 0.05 | +0.06 / 0.035 | −0.03 / 0.07 | −0.04 / 0.085 |
| Special | `breathe` every 30 s, `lazyRoll` | `breathe` every 34 s, holding 3.2 s | `weave`, `surge` | – | – |

- The **humpback** sweeps through wide arcs, banked on its long white flippers, now and then
  rolling lazily onto one side, and comes up to breathe (2 s at the surface) every 30 s.
- The **sperm whale** is the least inclined to turn of all (`turnRate` 0.15, `patrol` 0.5,
  holding a line), swims deepest, and rests at the surface longest at each breath (3.2 s, every
  34 s). A breath only comes when it fits wholly between two dives, the whales' long ones less
  often than the dolphin's: alone, a humpback breathes about nine times in ten minutes and a
  sperm whale six; among six animals (shorter stretches up in the water), five and two.
- The **oceanic whitetip** cruises slowly and persistently high in the water, meandering
  (`weave` 0.16 rad over 17 s), its great pectorals held out. It shadows the tuna school, which
  keeps clear of it and startles when it comes close (`SCHOOL_REACTIONS`: threat 0.55).
- The **leatherback** strokes steadily along long, gently curving lines, farther out and deeper
  than the green turtle; its rig strokes deeper and slower, gliding longer.
- The **oceanic manta** flies like the reef manta, slower and statelier (its rig beats 0.25 times
  a second), farther out.

None of them is a danger to the reef's animals but the whitetip (`REEF_THREAT` 0.9); the whales
and the manta make the tuna flow wide around them (`gap` 0.45 and 0.25).

The Kelp Forest's five (see `docs/kelp-forest.md`) live at its island, among the kelp: the seal,
the otters, the garibaldi and the seadragon close in, the orcas patrolling outside it.

| | Harbor seal | Sea otter | Garibaldi | Leafy seadragon | Orca |
| --- | ---: | ---: | ---: | ---: | ---: |
| `cruise` (units/s) | 0.36 | 0.3 | 0.14 | 0.04 | 0.5 |
| `turnRate` / `turnEase` | 0.62 / 0.85 | 0.7 / 0.9 | 1.2 / 1.2 | 0.2 / 0.35 | 0.42 / 0.65 |
| `bank` / `bankMax` | 0.85 / 0.4 | 0.7 / 0.35 | 0.3 / 0.15 | 0.2 / 0.1 | 0.5 / 0.22 |
| `halfLength` × `halfWidth` | 0.65 × 0.22 | 0.5 × 0.2 | 0.25 × 0.1 | 0.28 × 0.1 | 1.15 × 0.45 |
| `islandClearance` / `roam` | 0.75 / 0–0.9 | 0.6 / 0–0.7 | 0.55 / 0–0.35 | 0.55 / 0–0.4 | 1.25 / 0.35–1.1 |
| `depth` / `bob` | +0.02 / 0.08 | −0.06 / 0.06 | +0.2 / 0.03 | +0.2 / 0.03 | −0.06 / 0.06 |
| Special | `breathe` every 36 s, `weave` | `breathe.float`, rafts of 2–3 | `pause`, `sway` 0.05 | `sway` 0.07 | `breathe` every 30 s, pods of 2–4, `patrol` 0.5 |

- The **harbor seal** glides in long, banking arcs in mid-water through the kelp, weaving, and
  comes up to breathe (2.4 s at the surface) every 36 s or so.
- The **sea otters** float on their backs at the surface for their whole stretch up between
  dives (`breathe.float`: the breath lasts as long as the time between dives, rather than a short
  one on a timer); floating, each is rolled belly-up (`bank` π), slowed and curled into its rest
  pose (`pose.rest`). Then they roll over and dive to forage, and come back up to float again. A
  raft keeps close, side by side (`GROUP_STYLE`).
- The **garibaldi** hovers by the rocks, darting a little way and hanging again (`pause`), and the
  **leafy seadragon** hardly travels at all; both keep near the shore, and both rock back and
  forth with the kelp's surge (`sway`: their drawn place swings along the current with the
  kelp's period, `KELP.surge`, without changing where they steer).
- The **orcas** hold a line outside the kelp (`patrol` 0.5) in a loose, staggered pod, surfacing
  one after another to breathe every 30 s.

The orca is as great a danger to the reef's animals as any (`REEF_THREAT` 1) and startles the
tuna (threat 0.7); the seal and the otter are lesser ones (0.65 and 0.55), the garibaldi and the
seadragon hardly any. Every animal swimming through the kelp pushes it aside
(`docs/kelp-forest.md`).

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
| Lanes nearer the middle of each range, or spread wider | `LANE.least` / `LANE.most` (shares of the range), `LANE.drift` | `LANE.edge` is how near the frame a lane may run (0.92 of it) |
| Turns more or less often | `TURNS.every` (s), `TURNS.jitter` | Keep `TURNS.leave` longer than a leaver takes to swim out of view (8–25 s) |
| Curvier, wandering paths | raise `weave` (0.15–0.35 rad) or lower `weavePeriod` | Above about 0.4 an animal starts to look lost |
| More or fewer breaths | change `breathe.every` (s between breaths) | Breaths that would meet a dive are skipped |
| A higher or lower breath | change `breathe.clearance` (its middle below the calm surface) | Below about 0.15 the dolphin's back breaks the surface; above 0.3 its fin stays under |
| More or less pitch with climbs | `pitch` (rad per unit/s of rise) | Capped at 0.22 rad either way |
| More or fewer leaps | `DOLPHIN_BREACH.chance` (per breath), `cooldown` (s per pod) | A leap also needs room; crowded, low-level scenes leap least |
| A higher, longer or slower leap | `apex`, `length`, `air` | The launch angle is atan(4 × apex / length): keep it between about 35° and 65° |
| Leaps nearer the island or the view's edges | lower `islandMargin`, raise `frameEdge` or `view` | Above `view` 0.6 the leap reaches the haze at the top and bottom |
| Bigger or smaller groups | `GROUP_SIZES` (per species), `GROUP_BUDGET` (extra animals in all) | A model's style needs a place for each follower |
| Longer or shorter lurks and displays | a species' `pause` (`every`, `hold`, `slow`, `burst`, `dash`, `roll`) | Keep `hold + dash + 2` under `every` |
| More or fewer barrel rolls | `barrel.every` (and the 0.6 chance in `barrel()`) | `time` below about 1.2 s reads as a twitch |
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
`EXPO_PUBLIC_ISLAND_SHOWCASE=1` (restart Metro with `--clear`). They swim as visitors in
place of the collection (a development aid: without it, an island with nothing logged has an
empty ocean), and each can be tapped for its close-up. Both flags can be combined.

## Cost

The simulation costs about 20 µs per frame for 2 animals and 70 µs for 8, measured
in Node. A phone's JavaScript engine is several times slower, which is still well
under a millisecond. The shore field is built once per level, in about 10 ms.
Navigation adds no draw calls or triangles. The tuna school adds about 26 µs per frame
with 2 animals (42 µs with 6), and one instanced draw call. See
`island-performance.md`.

Going round the island costs no more than the old wandering did: measured in Node over the four scenes of eight species
(groups at their largest) at the Coral Reef's first level, interleaved with the version before and the best of eight runs, the
scene with the tuna school takes 175 µs a step against 214 before, and the four together 639 µs against 652 (one group-heavy
scene a little more, 153 against 134: its followers meet more of the others as everyone circles). Taking turns costs nothing
while nobody is leaving; a leaver is checked against the view each step until it is gone.

The reef's simulation costs about 2–3 µs per step for an octopus or a cuttlefish and 1 µs for a
moray (Node), plus the open water's animals as visitors; its rocks are found once per level and
count. Each reef animal is one skinned draw call (1,320–1,820 triangles), and the rocks are one
more (20 triangles a boulder). On the software renderer, three reef animals cost the same as
three open-water species (18.4–20.6 ms against 19.3–21.6 ms a frame); a page of eight with three
of them came to 29.7–31.8 ms against 25.6–29.3 ms for eight open-water species in full quality,
because reef animals never dive out of sight and so are always drawn, and 17.2 ms against 17.0 in
lite.

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
  src/lib/__tests__/marine-groups.test.ts src/lib/__tests__/ocean-growth.test.ts \
  src/lib/__tests__/reef-life.test.ts
```

The tests cover:

- staying in view and clear of the island and islets, for 1–8 animals at levels 1
  and 6;
- going round: on the Coral Reef at levels 1 and 6 and on two other islands, every animal
  completes a lap within four minutes, going round at no less than half its cruising pace,
  never back against its way round for more than two seconds, some one way and some the other;
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
- turns (`swimming.test.ts`, `marine-arrival.test.ts`): round robin over everyone, a featured
  species kept, no other animal moved by a turn (positions continuous across it), the leaver
  swimming out past the edge of the view and gone, the newcomer coming in from beyond it, pods
  and the reef's animals taking turns too.

- the reef (`reef-life.test.ts`): the open water's animals and the school moving exactly as
  they would without reef animals; each reef animal keeping to its habitat at levels 1 and 6
  (on the shelf, over the reef edge, at its dens, clear of the beach as seen, on the bottom);
  the rocks clear of the props, the islets and each other at every level; the octopus's walks,
  rests and jets, and its wariness of a large shark (not of a dolphin); the cuttlefish hovering,
  gliding and jetting away from a predator; the moray's den, its move to its other den, its
  body entering the rock right at the mouth, and retreating from a large animal (not a turtle);
  the three arrivals; and a level change moving the rocks and the animals out together.

- depth (`swim-depth.test.ts`, `seabed.test.ts`, `marine-bodies.test.ts`): no body ever below the seabed as it is drawn, grazing
  it or inside an island, for every model on every island; animals at the depth they live at (bottom-dwellers near the bottom,
  the big open-water animals in deeper water); and, on the Coral Reef, the biggest animals in view and in water deep enough for
  them. `npm run verify:swim` is the exhaustive version: every model, in scenes of eight, on every island at every level, for
  minutes at a time (split it by island and level to use more than one core), reporting clips, bodies in the island's dry land,
  where animals swim by how they live in the water, and the share out of view or in water too shallow for the body.

`npm run verify:underwater` checks that slender animals' tap targets are at least 28 pt
across at levels 1 and 6, on the body, and follow it when it pitches and leaps, that the
reef's animals have their simple tap shapes (never every arm) at the same minimum, and that
their own program sets them back in depth, cuts the den and holds per-animal colors without
touching the open water's programs.

## Known limitations

- With six to eight large animals, the water ring (about 2.5 units wide on the
  sides) is too narrow for every pass to go side by side. Some passes overlap with
  one animal clearly above the other. The dive cycle hides a third or more of a
  large school at any moment, which keeps most scenes uncluttered.
- At level 6, a whale shark rounding the southwest islet can swing briefly toward
  the bottom haze, because there is little room between that islet and the view's
  corner.
- At the Coral Reef's last two levels the islets' shelves reach out to the frame, and the widest bodies (the humpback, the reef
  manta) have no water deep enough for their fins between them and the edge of the view: going round, they ride over the shelves
  there, backs at the surface, for part of each lap (in the coarse sweep at level 6, about three quarters of the time for the
  humpback and a third for the reef manta; the leatherback about 6%; the whale shark, the great white and the tiger shark never).
  Giving the islets the reef's outer wall would fix it, but the seabed's mesh is drawn in rings round the main island, which do
  not follow an islet's wall: drawn so, it shows fins.
- The slowest swimmers (the goliath grouper, the lionfish) take more than four minutes over a lap, and the leafy seadragon hardly
  goes anywhere.
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
  a little, as a real pod's does; right after a leap, the group takes a few seconds to
  settle back into its places.
- The reef's animals hold their own places, so an open-water animal may pass over a resting
  octopus or a moray's den (drawn above them), and the octopus's arms may reach under its own
  rock while it rests. The moray's den cut is judged along its body as if it were straight, which
  the den's boulder covers for its resting curve. The mouths of a moray's two dens are 1.1–1.6
  body lengths apart (the second pair, for a second moray species, the closer), so it is fully
  out between them only briefly.
- The day octopus model stands in for the other octopuses and the giant cuttlefish for the
  broadclub and flamboyant cuttlefish, with the day octopus's and giant cuttlefish's colors.
- The sailfish's sail stands up from its back, so seen from almost overhead it shows best when
  the fish crosses the view or rolls it into sight in a display; heading straight toward or away
  from the camera it is mostly the long dark body and bill. Chevron barracuda borrow the great
  barracuda's bars and blotches.
- The jellyfish dive out of sight on the island's dive schedule like every open-water species,
  though the real ones keep near the surface; their swarm is drawn from the shared group budget,
  so with several other groups logged it may be only two or three.
