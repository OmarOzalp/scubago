# The tuna school

One school of tuna swims around the island with the large animals. It schools, roams the ocean,
makes room for the big animals and reacts to the sharks. Now and then a great white charges
through it. The school scatters and then regroups.

| Where | What |
| --- | --- |
| `src/lib/tuna-school.ts` | The school's simulation, its settings (`TUNA_SCHOOL`), how it treats each species (`SCHOOL_REACTIONS`) and the great white's hunting settings (`GREAT_WHITE_HUNT`) |
| `src/lib/marine-motion.ts` | Steps the school with the animals; the great white's hunt (encounter, charge, exit, cooldown) |
| `src/lib/steering.ts` | Frame, apparent-depth and smoothing helpers shared by both simulations |
| `src/components/home/three/tuna-geometry.ts` | The low-poly tuna |
| `src/components/home/three/school-material.ts` | Swimming in the vertex shader, and the island's water tint |
| `src/components/home/three/tuna-school-mesh.tsx` | Draws the whole school as one instanced mesh |

The school is ambient life. It is not a discovery, it appears on every island (the preview and your
collection alike), and tapping it does nothing. Set `TUNA_SCHOOL.size` to 0 to leave it out.

## The tuna

The tuna is built at runtime from a few hundred vertex-colored triangles, with no textures:

- a spindle-shaped body with a pointed snout and a slim, keeled tail stock;
- a deeply forked crescent tail;
- a low first dorsal fin, sickle-shaped second dorsal and anal fins, and long, slim pectorals;
- five small yellow finlets above and below the tail stock, and dark eyes.

Coloring is metallic blue over the whole upper body, a pale iridescent band just below the midline
and silver beneath. From above, the school reads dark blue, and it flashes paler as fish roll into
turns. Faint specular highlights slide over backs and flanks. Each fish is 0.52 long (a great white
is 2.5), give or take 8%.

Sizes:

- **Full quality:** 167 triangles and 135 vertices per fish.
- **Lite quality** (the simulators and emulators, where every small triangle costs): 83 triangles.
  The body has six sides instead of eight, fewer rings, and no finlets or eyes. Those details are
  under two pixels there anyway.

**Swimming happens in the vertex shader.** Each fish carries its tail phase, amplitude and body
bend, and from those the shader draws:

- a wave that grows toward the tail and travels back along the body;
- a slight counter-sway of the head;
- a curve of the whole body into turns.

Tail beats speed up with swimming speed (about 2.4 per second at cruise and 5 when fleeing). They
beat a little harder while a fish accelerates, and ease back as it slows. Fish pitch as they rise
and sink, and roll gently into turns.

The school shares the island's water with the other animals: the same depth tint, refraction, lite
surface tint and top and bottom haze. It never dives, so it can be opaque, and the whole school is
one draw call.

## Normal schooling

A lead point, never seen, roams the ocean the way the large animals do. Each fish holds a place in
a loose oval that trails behind the lead along the path it actually swam. So the school stays
elongated, bends into an arc when the lead turns, and U-turns as a wave that runs from front to
back. Each place drifts slowly within the school, and the whole oval breathes, looser and tighter,
over about 47 s. Around that shape, each fish:

- keeps its distance from its neighbors (`separationRadius`);
- matches its neighbors' heading, within 0.75 units;
- swims with the school's heading along the trail (`alignmentStrength`);
- closes on its place (`cohesionStrength`);
- adds a little noise of its own.

Fish differ in size, tail phase and rate, pace (±6%), depth in the school and where their place
sits. A school is never a synchronized block: neighbors turn a moment apart and spacing varies.

Where the water between the shore and the frame is narrower than the school (at level 6 the islets
come close to the frame), the school slims into a stream along the middle and lengthens a little.

## Wandering

- **Path.** The lead circles the island at a distance offshore that drifts slowly between 1.35 and
  2.2 units (`roam`), over two overlapping periods. A gentle wander of up to ±30° bends the path, so
  it never repeats exactly.
- **Depth.** The school rises and sinks by up to 0.22 (`depthRange`), over 43 s and 101 s.
- **Pace.** It speeds up and slows over 31 s.
- **Reversals.** Every 85 s or so (`reverseEvery`) the school makes a broad U-turn out to sea, when
  it is calm, compact and has room. It also reverses when the way ahead is closed (a threat, or
  water too narrow even for a stream) instead of looping.
- **Island.** It keeps off the island and islets like the large animals do: predictive steering
  from three points along its course, judged where the camera shows it. Each fish also has its own
  safety net that starts turning it away early and never lets it into the beach. Fish may come
  closer to shore than the whale shark (their center 0.5 from the dry sand, `fishClearance`) and
  pass islets a little closer still.
- **Frame.** It stays inside the frame.
- **Stragglers.** A fish cut off from the school, by an islet or a crowd of animals, hurries back:
  up to about twice its cruising speed, following the lead's trail. When it is far round the island,
  it swims along the coast whichever way meets the school sooner, head-on if chasing would take
  long. If the lead ever runs away from most of its school, it moves to the front of the largest
  group, as a real school follows its majority.

## Seeing the large animals

- **Once per step, for the whole school.** Animals within about 3.4 units of the school
  (`alertRadius`, plus their own half-length and the school's spread) count as near; animals deep
  on a dive are ignored. The strongest nearby threat
  sets the school's alert level (0 to 1).
- **Per fish.** Each fish then checks only those near animals. There is no scan of the whole world,
  no physics, no raycasts and no pathfinding.

The school has four moods, with hysteresis so a mood never flickers:

| Mood | When | What the fish do |
| --- | --- | --- |
| calm | nothing threatening near | cruise, school, wander |
| alert | a shark is near | the school tightens by up to 30%, swims up to 25% faster and turns away from the shark's path, out of its way as well as away from it |
| panic | a fish's fright is over 0.5 (a charge, or a shark right alongside) | fleeing fish break formation (below) |
| recover | the 7 s after a panic (`regroupTime`) | the school is loose, then closes in again |

Every species has a reaction in `SCHOOL_REACTIONS`:

| Species | `threat` | `gap` | How the school treats it |
| --- | ---: | ---: | --- |
| Great white | 1 | 0.40 | Alert when near, turns away, keeps its distance; a fish it passes right by starts (fright up to 0.45, below panic); it may charge (below) |
| Tiger shark | 0.6 | 0.38 | Alert, turns gently away, keeps more room; the nearest fish may start slightly, never panic; it never charges |
| Whale shark | 0 | 0.30 | Not a threat: fish flow around it; its size splits the school gently, and there is no alarm |
| Reef manta | 0 | 0.22 | Mostly ignored; fish avoid overlapping it and slip round its wide wings rather than being pushed ahead of them |
| Ocean sunfish | 0 | 0.25 | Ignored, apart from keeping clear |
| Green turtle | 0 | 0.15 | Ignored, apart from keeping clear |

A harmless animal in the school's path also steers the whole school around it a little, more for
bigger animals.

## The great white's hunt

Each great white has a small state machine in `marine-motion.ts`: normal → encounter → charge →
exit → normal.

**Encounter.** It begins when the shark comes within 3 units of the school's center
(`encounterRadius`, plus the school's spread) after having been away. "Away" means beyond
4.8 units (`releaseRadius`) or deep on a dive. The shark must be in sight and not about to dive,
and it must not be resting after a charge. Nothing can start or re-roll an encounter until the
shark has left.

**The 20%.** When an encounter begins, it is decided once whether it will become a charge:
`attackRoll(lane, seed, encounter) < attackProbability` (0.2). The roll is deterministic for the
shark, the scene's seed and the encounter number, so a scene replays exactly. The app draws the
seed once per launch, so each visit differs. Nothing is rolled per frame. Over 12 simulated half
hours, 21% of encounters were armed.

**Charge.**

- **Turn in.** An armed shark swings toward the school. It launches when the charge fits: in view
  for the whole charge, the school within about 1.6 rad of its heading and 0.7–5.5 units away, and
  a clear line through the school and beyond, off the island and inside the frame. If no such
  moment comes within 15 s, the encounter stays a pass.
- **Aim.** It aims at the school's middle, a little toward its front, leading the school by where
  it will be.
- **Line up, then rush.** It turns up to 30% more sharply than usual (`chargeTurn`), then
  accelerates hard to 2.1× its cruise (`chargeSpeed`).
- **Commit.** About 1.3 units short of the school it commits to a straight line and stops following
  the fish, so it drives through and past rather than homing like a missile.
- **Obstacles.** The island, the frame and the other animals are still avoided throughout.
- **End.** The charge ends once the shark is past its aim point, or after 7 s (`chargeDuration`).

About four in five armed encounters find their moment. The others pass because the shark is heading
away or about to dive. So about 17% of encounters end in a charge, one every few minutes when a
great white shares the island.

**Exit and rest.** The shark slows gradually back to its cruise and returns to its normal
navigation. It starts no new encounter for 50 s (`cooldown`), and none until it has left the
school's surroundings.

The shark's tail beats faster during the charge, because its swim rig follows speed.

## Scatter

The fish read a charge from the rush itself, not from the turn in, so the school is caught by
surprise. A fish close to the path the shark is about to take (within 1.1 units of the next
1.1 seconds of its path, `panicRadius`) is frightened at once. The startle spreads from fish to
fish at 45% strength per link, so the reaction ripples outward without making the whole school
bolt.

A frightened fish flees with a blend of five things:

- to its own side of the shark's path, which splits the school around the shark;
- away from the shark, a little;
- its own momentum;
- some noise of its own;
- up or down, to its side of the shark's depth.

At full fright a fish reaches 2.7× its cruising speed (`panicSpeed`), accelerates at up to
3.2 units/s² and turns at up to 4.5 rad/s. Formation is dropped while frightened: hold on its place
falls to 8%. The shark punches a hole through the school, and two streams curl past it.

## Regrouping

1. **Panic, 0–2 s.** Once the danger is past, each fish's fright fades over 1.4 s (`panicFade`),
   so flight speed falls away.
2. **Loose, 2–5 s.** The school spreads, up to 1.9× wider and slower-paced. The pull on each fish's
   place returns quickly, but the places themselves are loose.
3. **Closing in, 5–10 s.** Over the rest of the 7 s regroup time, the shape tightens back to calm.
   Stragglers hurry back.

The lead slows while the school is spread, so the fish catch up. In the simulated half hours, a
median of 96% of the fish were back in one group 2 s after a charge ended, and 100% from 8 s on. In
about one charge in ten a few stragglers take longer to rejoin.

## Performance

- **Rendering.** One instanced draw call: 4,676 triangles at full quality, 2,324 in lite. No
  per-frame allocation: the matrices and swim attributes are rewritten in place.
- **Simulation.**
  - Steps at 30 Hz inside the 60 Hz loop, interpolated to every frame like the animals: 20 and
    60 fps give identical motion.
  - Allocation-free: typed arrays and reused objects.
  - Separation, neighbor alignment and startle spreading are computed over all pairs, which is
    378 for 28 fish.
  - Each fish checks only the few near animals. Shore samples rotate through the school, with fish
    near the shore sampled every step.
  - Expensive decisions run once per step for the whole school: threats, the lead's course. Some
    run less often still: the check for a lost lead once a second, each fish's drift once a second.
- **Cost.** In Node, the school adds about 26 µs per 60 Hz step with the two preview animals and
  about 42 µs with all six. Allow several times that on a phone's JavaScript engine: still well
  under a millisecond per frame. See `island-performance.md` for render timings.
- **Size.** 28 fish reads as a school without clutter. 20 costs almost the same, and 40 adds about
  13 µs and more overlap.

## Tuning guide

Change the values in `src/lib/tuna-school.ts`. Everything else follows from them.

| To get… | Change | Notes |
| --- | --- | --- |
| A larger school | raise `TUNA_SCHOOL.size` (e.g. 36), and `shape` by about 10% per 8 fish | Keeps the spacing; the cost grows slowly (see above) |
| A smaller school | lower `size` (e.g. 18–20), and `shape` a little | Below about 15 it reads as a few fish, not a school |
| Tighter schooling | lower `separationRadius` (0.28–0.3) and `shape`, or raise `cohesionStrength` (1.2–1.5) | Much below 0.28, fish overlap visibly |
| Looser schooling | raise `separationRadius` (0.38–0.42) and `shape`, or lower `cohesionStrength` (0.7) | `alignmentStrength` keeps a loose school heading together |
| Stronger scatter | raise `panicRadius` (1.3–1.5) and `panicSpeed` (1.4) | A wider hole, and more of the school bolts |
| Weaker scatter | lower `panicRadius` (0.8–0.9) or `panicSpeed` (1.0) | The shark brushes through a tighter hole |
| Longer recovery | raise `panicFade` (2) and `regroupTime` (10–12) | The loose phase lasts longer |
| Shorter recovery | lower `regroupTime` (4–5) and `panicFade` (1) | Snaps back quickly |
| More frequent attacks | raise `GREAT_WHITE_HUNT.attackProbability` (0.3), or lower `cooldown` (30) | About four in five armed encounters become charges |
| Less frequent attacks | lower `attackProbability` (0.1), or raise `cooldown` (90) | 0 turns charges off; the shark still alerts the school |
| A faster, harder charge | raise `chargeSpeed` (2.4) or `chargeTurn` (1.5) | Keep `chargeTurn` modest, or the charge starts to home in like a missile |
| Stronger tiger shark avoidance | raise the tiger shark's `threat` (0.8) and `gap` (0.5) in `SCHOOL_REACTIONS` | Its `threat` × 0.45 is the start a close pass gives the nearest fish; keep it under about 1 to stay below panic |
| Wider berth for any animal | raise its `gap` | Bigger gaps split the school more often in a crowded ocean |
| School nearer or farther offshore | change `roam`; keep `fishClearance` at least 0.45 | `fishClearance` is the closest a fish's center comes to dry sand |
| Faster or slower cruising | `cruiseSpeed` (and `tailBeat`, the beat at cruise) | The tail beat follows speed automatically |

## Debug overlay

Set `EXPO_PUBLIC_MARINE_DEBUG=1` and restart Metro with `--clear`, as for the large animals (see
`marine-navigation.md`). The overlay also shows:

- the school's lead and heading (light blue);
- a cross at the school's center, colored by mood: blue calm, yellow alert, red panic, violet
  regrouping;
- for a great white stalking an encounter that will become a charge, an orange line to the school,
  turning red while it charges.

## Verifying

```sh
npx jest src/lib/__tests__/tuna-school.test.ts
```

The tests cover:

- the school holding together, in view, off the island and islets and below the surface, at levels
  1 and 6;
- turn, speed and roll limits, even when fleeing;
- a whale shark causing no alarm, and a tiger shark only alert;
- a non-attacking great white never panicking the school;
- charges being fast but capped, driving through or close by the school, causing panic, followed by
  regrouping, and at least `cooldown` apart;
- the roll coming up about 20% of the time and never changing during an encounter;
- 20 vs 60 fps equivalence;
- leaving the school out.

## Known limitations

- **Crowded scenes.** With six large animals in the narrow ring, the school spends about a tenth of
  its time in two groups for a few seconds (up to about half a minute) while it flows around them.
  That is natural for a school, but it happens more than in a quieter ocean.
- **Misses.** About one charge in ten brushes past the school's edge rather than through its middle,
  because the shark commits to its line and the fish move.
- **One school.** The school is designed as one; a second would need the two to avoid each other.
- **Surface.** Fish never break the surface or jump.
