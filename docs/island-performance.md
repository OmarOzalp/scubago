# Island rendering and loading

The September 2026 refinement keeps the Quaternius swim rigs but presents them
from a higher orthographic camera with diffuse materials. The island uses flat,
asymmetric shoreline layers and broad palm leaves. Live shadow maps and the
full-screen animated caustic shader have been removed.

The scene mounts while discovery data and model assets load, rather than waiting
behind both loading gates. Animals appear once collection data is ready; already
parsed models are available synchronously when a scene is revisited. Existing
timeout, retry, focus, background, and reduced-motion behavior remains in place.

## Asset budgets

| Asset | Previous bytes | Current bytes | Current triangles |
| --- | ---: | ---: | ---: |
| Shark | 335,524 | 104,888 | 2,840 |
| Manta | 381,604 | 129,328 | 3,104 |
| Reef fish | 300,004 | 96,412 | 2,508 |

Combined downloads dropped from 1,017,132 to 330,628 bytes (67.5%). One subdivision
level preserves smooth silhouettes and skin weights. The original source files
are retained. Re-export without studio renders using:

```sh
blender --background --factory-startup --python scripts/art/prepare-marine.py -- --export-only
python3 scripts/art/refine-reef-fish.py
node scripts/art/slim-marine.mjs --only=shark,manta,reef-fish
npm run verify:marine
```

`refine-reef-fish.py` post-processes the exported reef-fish GLB (body 1.35x wider, eyes
smaller and set into the head) without touching bones or animation; run it after every
Blender export, since the export rewrites the file. Slim the three last (see Instant start below).

The verifier checks actual vertex deformation, loop seams, normalization,
independent skeletons, and budgets of 5,000 triangles / 220,000 bytes per rig.
The studio PNGs in art-previews predate this refinement; use the app to review
the current appearance.

## Observed performance and limits

On this Mac's Chrome development preview, warm reloads loaded and parsed the
three animals in 26–128ms. A 120-frame sample of the two visiting animals
averaged about 120fps with no frames over 25ms, 32 draw calls, and 6,540 triangles.
These are short desktop measurements, not cold-start or phone benchmarks. The
web drawing resolution is capped at 1.25 pixels per CSS pixel. Native rendering
now uses the layout-based resolution cap described below.

Development builds log local-only asset and frame timings prefixed with
`[island]`. The first-frame timer starts inside the canvas, so it excludes app
startup and GL context creation. It must not be described as launch time.

Expo's initial development compilation still takes time after a cold start or
cache clear. Keep the dev server running and avoid `--clear` for routine previews.
No native device frame-rate measurement has been made for this refinement.

Validation: 70 Jest tests, TypeScript, iOS/web export, actual rig verification,
and browser checks of the island, pause/resume, and animal close-up screens.

## Follow-up: close-up readability

The inspection camera now looks across the animal from a lower angle, with the
rig turned farther sideways. This exposes the reef fish's body, fins and tail
instead of presenting its narrow top silhouette. Warm sky / cool water
hemisphere lighting replaces uniform ambient fill, with a stronger directional
key to make the animals' curved surfaces easier to read. These changes retain
the existing geometry, shared diffuse materials and shadow-free rendering.

Verified this follow-up in the browser at desktop and 390 × 844 phone viewport
sizes: the island and visiting animals render, and reef fish, shark and manta
close-ups remain visible. TypeScript, lint on the three changed components,
all 70 Jest tests and all three GLB rig checks pass. This follow-up has not been
visually tested on a native device.

## Simulator animation correction

Reproduced a static GL image on the iPhone 17 Pro / iOS 26.5 simulator while the
JavaScript frame counter and world matrices continued advancing. A native thread
sample showed the GL worker busy in software triangle rendering, with queued
draw work delaying presentation. The JavaScript FPS logger therefore did not
measure actual displayed frame rate.

`SceneCanvas` now caps native drawing resolution at one physical pixel per
displayed point on simulators/emulators and two on physical devices, and native
multisampling is disabled. Expo owns the GL buffer, and Fiber's native Canvas
ignores the web DPR override: the wrapper lays out a smaller GL view and scales
it back to the intended visible size. Camera fitting follows the smaller layout.
The web Canvas remains unchanged.

Verified visibly changing swimmer positions over time and pause/resume on the
booted iPhone simulator. Real-device performance and maximum-resident load still
need measurement. No diagnostic text or blocking GL reads remain in the app.

## Water surface and staggered dives

The sanctuary now draws one translucent water plane above the swimmers and below
its dry shoreline. A single mesh of gently moving ripple strips creates broken surface highlights;
no custom fragment shader, reflection pass, textures or postprocessing are used.
An initial per-pixel wave shader stalled the simulator software renderer and
was replaced with this two-draw-call version. Depth testing preserves
the island, and the surface does not intercept animal taps.

`sampleDive` staggers 38-second cycles by lane. Small collections spend more time
near the surface; with eight residents, approximately two to five are clearly
visible at a time. Animals descend and fade, remain hidden briefly, then return.
Each swimmer owns its fading materials so cached assets and other swimmers are
unaffected; those materials are disposed on unmount. Hidden swimmers cannot be
tapped. Close-ups remain fully visible. Pause/background behavior stops both
the water clock and the dive clock. Real iPhone GPU performance remains unmeasured.

With the extra alpha-blended water, even the lightweight version could overwhelm
simulator GL at 60 queued frames per second. Native simulator canvases now use a
20 Hz invalidation timer and demand rendering, while retaining one physical pixel
per displayed point. Physical iPhones retain the existing continuous loop and
2-pixel-per-point cap. The timer stops when the scene pauses or unmounts. A fake
clock test checks the 20-frame schedule and zero scheduled frames while paused.

## Directional underwater color

The water tint is now 27% at the center, feathered toward the scene edges so it
blends into the surrounding card. Each animal gets an isolated length attribute
and a small extension of its existing material: submersion mixes its lit color
into the habitat's water color and reduces alpha progressively from head to tail.
The rise phase uses a separate emergence gradient, so the head appears first as
well. A slight nose-down/nose-up pitch accompanies each direction. Close-ups keep
the unmodified material. This adds no animal draw calls or full-screen shader.

`npm run verify:underwater` checks all seven real assets for correct head/tail
orientation, private geometry/materials, and independent dive and rise uniforms.
Updated timing tests distinguish descent from emergence.

## Shared cruising behavior

The visible school now advances once per frame before individual animals render.
Species have different cruising rates, with slow pace changes and independently
changing route widths. A swimmer eases off as it approaches the animal ahead;
initial positions are spread around the island. Turns are rate-limited, banking
follows the turn, and tail/wing animation responds to cruising effort. The
existing independent head-first dive/emergence cycles and water effects remain.

This is a lightweight spacing system, not a full collision/physics simulation:
animals share a circulation direction, and silhouettes can still overlap in
projection. Tests simulate one, three and eight animals for five minutes, checking
center spacing, shoreline clearance, scene bounds, finite coordinates, turn rate,
pause and background resume. Simulator motion and pause/resume were also checked.

A second route pass adds species-scaled bends along each circuit: whale sharks
sweep broadly while mantas weave more. Additional ten-minute simulations cover
eight whale sharks and eight reef fish, and a 20 Hz versus 60 Hz comparison checks
that frame rate does not materially change route positions.

## Species rigs

The tiger, whale and great white sharks and the reef manta are driven by procedural
rigs instead of clip playback. Each frame, a swimmer's rig computes 12 (sharks) or
17 (manta) bone rotations from a handful of trigonometric terms and writes them to
its cloned skeleton; eight swimmers cost a few hundred rotation updates, far below
the skinning and draw cost. Assets stay within the existing budgets: 3,096–4,084
triangles, 136,800–212,504 bytes, one skinned vertex-colored draw call, no textures.
Pause, background and reduced motion freeze the rigs with the rest of the scene
(zero elapsed time means zero rig steps). Native frame timing with these rigs has
not been measured on a physical device.

## Low-poly ocean

The flat water plane, ripple strips and underwater shore rings are replaced by a
faceted ocean (details and tuning in `docs/ocean.md`):

- a jittered water lattice (2,058 vertices) displaced per vertex by four crossing
  wave layers;
- a low-poly seabed backdrop (2,400 vertices);
- a 128 × 128 depth map baked from the shoreline once per level.

This adds two draw calls. Both use custom shaders, so the earlier "no custom
fragment shader" constraint no longer holds. To stay clear of the per-pixel wave
cost that stalled the simulator, waves, Fresnel reflection and foam break-up are
all evaluated per vertex. Each pixel does one depth-map lookup, a
derivative-based facet normal, one highlight term and blending, with no discard,
render targets or screen reads.

Swimmers now render inside the environment and share its uniforms. Their
existing materials gain a depth tint, desaturation, a refraction offset and the
edge haze, with no extra draw calls. The dive fade now starts after a short
delay, and pitch follows the vertical velocity.

Verified in headless Chromium (SwiftShader) and in the exported web app:

- `npm run verify:ocean` passes (levels 1–6);
- `npm run verify:underwater`, `npm run verify:marine`, all Jest tests,
  TypeScript and lint on the changed files pass.

The iOS simulator's software renderer and physical devices have not been
measured with the new ocean. Check that first. If the simulator struggles,
raising `facetSize` and lowering the simulator canvas resolution are the
cheapest levers.

## Simulator frame pacing and lite quality

After the ocean pass, the home scene stopped animating on the iOS simulator. The simulator
draws GL in software, so the problem was measured the same way. The app's real scene ran in
headless Chromium on SwiftShader, a CPU renderer, pinned to one core. The canvas was
390 × 363 px, which matches the simulator's one pixel per point. Frames were stepped manually,
and a one-pixel read-back waited for each frame to finish.

| Scene (2 preview animals) | ms per frame |
| --- | ---: |
| Before the species and ocean work (`16b0b8a`) | 25 |
| After the ocean pass, full quality | 84 |
| Lite quality (this change) | 32 |
| Lite quality, 4 species animals | 37 |

Where the 84 ms went:

- **Ocean, about 66 ms.** Seabed about 31, surface about 37. Each full-screen layer costs 8–10 ms
  just to cover the screen, plus about 23 ms of per-pixel shading.
- **Two species animals, about 16 ms.** The per-vertex wave math is about 1.4 ms of that per
  animal. The species models cost about 35% more than the family models.
- **Island, about 3 ms.**

The expensive part was the new water, not mainly the fish.

The picture froze rather than just slowing down because expo-gl queues GL work for a worker
thread. The old 20 Hz timer requested frames regardless of whether the previous one had
finished drawing, so frames piled up. Two fixes:

- **Frame pacing (simulator only).** `SceneCanvas` renders each frame itself and waits on
  expo-gl's `flushEXP()`, which returns once all queued GL work has run. Only then does it
  schedule the next frame, at least 50 ms apart and leaving the JS thread idle for about 80% of
  the frame's cost. Any remaining excess becomes a lower frame rate instead of a frozen picture.
  Development builds log
  `[island] simulator GL: …ms per frame, about …fps` every 60 frames.
- **Lite quality on software GPUs.** This is the default on the simulator and emulators;
  `scene-quality.ts` controls it. The static seabed and water colors are baked per level into
  one 128² texture and drawn as a single opaque layer. The waves still move per vertex: facet
  shade is flat per triangle and highlights are smooth. Animals skip per-vertex wave math and
  carry the surface tint in their own shader, since there is no separate surface pass. Physical
  devices and web keep full quality.

To compare the tiers anywhere, set `EXPO_PUBLIC_SCENE_QUALITY=lite` or `full` and restart Metro
with `--clear`. Metro caches the inlined value otherwise. Verified:

- 109 Jest tests pass, including pacing tests with a simulated slow GL worker.
- `verify:ocean` checks the lite map at every level; `verify:underwater` checks the lite animal
  shaders.
- Forced-lite and full web exports both render.

The fixes have not yet been run on the iOS simulator itself, and physical-device timings are
still unmeasured. The species models were not simplified: the benchmark showed they are the
smaller cost, and lighter versions would ship extra assets for the simulator alone.


## Ocean sunfish, green turtle and steering navigation

Two species drafts join the island, and the shared circulation ring described under
"Shared cruising behavior" is replaced by steering navigation (see
`docs/marine-navigation.md`). Animals now keep lanes to pass one another, keep a
species-specific distance from the island and islets, and turn and bank smoothly.

- **Assets.** The ocean sunfish is 1,832 triangles and 79,480 bytes; the green turtle is
  1,226 triangles and 93,228 bytes. Each is one skinned, vertex-colored draw call, and
  each is lighter than any shark.
- **Simulation.** About 20 µs per frame for 2 animals and 70 µs for 8, measured in
  Node; allow several times that on a phone's JavaScript engine. The shore-distance
  field is built once per level, in about 10 ms. There are no per-frame allocations
  beyond small snapshot objects.
- **Rendering is unchanged by navigation.** Same scene before and after, on the
  SwiftShader benchmark above (390 × 363, one core):

| Scene, lite quality | Before (`cb8f164`) | After |
| --- | ---: | ---: |
| 2 preview animals | 36.2 ms | 36.6 ms |
| 6 species animals | 50.1 ms | 52.6 ms |

JavaScript time per frame is 1.0–1.6 ms in both. The differences are within run-to-run
noise; this machine measures about 4 ms slower than the earlier table. At full
quality, 2 animals take 94 ms and 6 take 109 ms. Each extra animal adds one draw call
and about 3 ms of CPU-rendered skinning and shading, which a phone GPU does not notice.
Physical-device timing is still unmeasured.

## Tuna school

The school of tuna (see `docs/tuna-school.md`) is one instanced mesh: one draw call for all 28 fish.
Each fish is a runtime mesh of 167 triangles, so 4,676 for the school. In lite quality the fish is
83 triangles, 2,324 for the school: six body sides instead of eight, fewer rings, and no finlets
or eyes, which are under two pixels there. The matrices and per-fish swim attributes are rewritten
in place each frame, with no allocation. The simulation steps at 30 Hz inside the animals' 60 Hz
loop, interpolated like the animals, and allocates nothing per step.

Measured on the SwiftShader benchmark above (390 × 363, one core, the two preview animals):

| Scene | No school | 28 fish |
| --- | ---: | ---: |
| Lite quality | 33.4 ms | 37.0 ms |
| Full quality | 86.6 ms | 94.8 ms |
| JavaScript per frame (included above) | 1.05 ms | 1.35 ms |

Timings vary by about 2 ms between runs. The school costs about as much as one more large
animal, on a renderer where every small triangle costs. With the full 167-triangle fish in lite
quality it cost 5–7 ms, which is why lite quality uses the lighter fish. On a phone GPU, 4,700
triangles and one draw call are negligible.

Measured in Node, the simulation adds about 26 µs per frame with the two preview animals and
42 µs with all six. Allow several times that on a phone's JavaScript engine, which is still well
under a millisecond. School size barely changes the cost: 20 fish cost about the same as 28, and
40 add about 13 µs. Profiling set the design: the frame test, angle wrapping and per-fish
trigonometry dominated the first version, and each now runs once per step or only where needed.

Set `TUNA_SCHOOL.size` in `src/lib/tuna-school.ts` lower to lighten the scene further, or to 0 to
leave the school out. Physical-device timing is still unmeasured.

## Instant start (October 2026)

The animals are on screen as soon as they can be, and Home's ocean is never rebuilt.

### Slimmer models

Every marine GLB is slimmed by `scripts/art/slim-marine.mjs` (run it after `npm run build:species`
or a Blender export): gltf-transform's dedup, prune (every node kept, so the rigs find their bones),
weld, resample (animation keys within 1e-5 of a straight line) and quantize (KHR_mesh_quantization,
read natively by three's GLTFLoader: positions 16-bit, normals 8-bit, vertex colours 16-bit, skin
weights bytes summing to exactly 255). No Draco or meshopt: their decoders need WebAssembly, which
Hermes lacks.

| | Before | After |
| --- | ---: | ---: |
| All 51 models | 7.97 MB | 4.71 MB |
| Parse, all 51, interpreter (`node --jitless`, the closest to Hermes), warm | 128 ms | 38 ms |
| Parse, all 51, interpreter, cold (first parse of each) | 184 ms | 61 ms |
| Parse, all 51, JIT (Node), warm | 31 ms | 34 ms |

Most of a parse without a JIT was GLTFLoader renormalizing every skinned vertex's weights. Weights
stored as bytes summing to 255 come through that pass unchanged, so `marine-loader.ts` skips it
while a model parses (`marine-assets.test.ts` checks every shipped vertex). The bodies are the same:
over every triangle corner, in the bind pose, under the procedural rig and through the Swim clip,
the largest difference is 0.0005 model units (a hundredth of a pixel on Home), normals within 0.4°,
colours within 0.2 of a step; renders of all 51 in their pose and mid-swim differ only in a few
anti-aliased edge pixels. `npm run verify:marine` reports the same as before.

### The seabed built ahead of time

Showing an island the first time used to work out its seabed: the lattice the seabed is drawn from and
the animals swim over (seabed-lattice.ts), the depth map's texels, the water's shoaling and the animals'
grid of the bottom. The Coral Reef's lattice was also worked out twice (once for the drawn seabed, once
for the animals: their caches had different keys). Now the two share one, and `scripts/bake-seabed.ts`
writes what each island alone at each level works out (and Home's island alone in the explorer, at a
phone's reach) to `assets/baked/seabed/*.bin` (6.4 MB in all; one file, 160 to 310 KB, is loaded for the
island on show). Once loaded (`seabed-assets.ts`), a scene uses it instead: the very same numbers. The
`seabed-bake-*.test.ts` tests compare every file with the computation, so a bake left stale by a change
to the seabed fails them: run `npx tsx scripts/bake-seabed.ts` again. Without a bake (several islands in
the explorer, another reach), everything is worked out as before.

Building a scene, in the app's order (depth map, seabed mesh, water, the animals' seabed, the swimming's
start with three animals), in Node: the interpreter (`--jitless`) is the closer to Hermes.

| | Before | After |
| --- | ---: | ---: |
| Coral Reef, level 1, interpreter | 8.4 s | 0.9 s |
| Coral Reef, level 6, interpreter | 11.7 s | 1.15 s |
| Kelp Forest, level 1, interpreter | 1.86 s | 0.62 s |
| Coral Reef, level 1, JIT | 582 ms | 239 ms |

What is left is mostly the swimming's own start (its shore fields and the distance fields for each body).

### Animals as they are ready, from launch

- **One by one.** `useMarineModels` hands the scene each model as soon as it is loaded; it no longer waits
  for the whole set. The ocean and the school swim on meanwhile, and each animal joins as its own model
  arrives: one already on the island whose model has only now loaded comes into view where it is, rising
  out of the deep blue head first over 1.6 s (`AnimatedMarine`'s `emerge`, the dive's own emergence); a
  newcomer at the end of another's turn still swims in from the open sea. While Home's picture still covers
  the scene (below), or with the scene still or paused, it is simply there. One model failing still shows
  the illustrated island with its "Try again".
- **At launch.** What Home's card showed last is kept on the device (`home-start.ts`: its island, level and
  animals' models). The root layout calls `startHome()` (one import, one call in `src/app/_layout.tsx`):
  it reads that record and starts loading those models and that island's seabed bake straight away, during
  the splash, while the collection is still being read. Nothing waits for it. Once Home is on show, the
  next level's bake and Home's island in the explorer load ahead.
- **The picture.** About three seconds after Home's own island is on show with all its animals, the card
  takes its picture (scene-snapshot.ts's capture) and keeps it: on a phone a PNG in the app's documents,
  on the web a small JPEG in storage. At the next launch the card shows it at once, until the live scene
  has drawn itself with its animals, then cross-fades (`instant-picture.tsx`; at once with Reduce Motion;
  in any case after 4 s). Only a picture of the same island is shown; while the collection is still being
  read it is taken to be the level the picture was kept at, and once it is known the live scene shows what
  is true. Under the picture nothing is built that no one would see.
- **Timing marks.** `performance.mark('scubago:scene-frame' | 'scubago:picture' | 'scubago:first-animal')`
  (`scene-marks.ts`), once each per launch, for measuring.

### Measured on the web

Time from opening the app to each mark, in Chromium with software WebGL (SwiftShader), a phone-sized
window and a collection at level 3 on Home's island with seven animals; before and after builds run in
turn. "Second launch" reopens the app after a first visit has kept the record and picture.

| | Before | After |
| --- | ---: | ---: |
| First launch: first animal on screen | 3.05 s | 2.93 s |
| Second launch: Home's island on screen (the scene's first frame / the picture) | 1.66 s | 0.99 s |
| Second launch: first live animal | 3.06 s | 2.16 s |
| CPU slowed 4x, first launch: first animal | 7.4–7.5 s | 6.7–6.8 s |
| CPU slowed 4x, second launch: first live animal | 5.6–6.1 s | 3.5–3.7 s |
| CPU slowed 4x, second launch: the picture | — | 1.4 s |

Medians of three runs (two at 4x, both shown). The web's JIT already parses models and works out a
single island quickly, so the first launch gains little there; the larger gains are on Hermes, which has
no JIT (see the interpreter rows above). At 4x one second launch had no picture: the first visit was
closed before all its animals had arrived, so none was taken.

Home's ocean is never rebuilt: with Home's island paused, going to the Field guide and the Logbook tabs
and opening and closing the explorer leaves it paused, its animals exactly where they were (the same
picture to the pixel, before and after this work).

### Limits

- The explorer with several islands in reach still works out its seabed (about 1.2 s with a JIT, much
  longer on an interpreter); only Home's island alone is baked for it. (It is now worked out once for each
  set of islands and level and kept, and about 40% quicker the first time: see "Building less" below.)
- With Reduce Motion the island is still, and a still island is not photographed (as for Share), so the
  card takes no new picture; one kept earlier is still shown and replaced at once.
- Physical-device timing is still unmeasured.


## Drawing less (November 2026)

The card and the explorer drew every refresh (60 a second) however still the sea was, rebuilt each
animal's tap target at every redraw, left a bone texture behind for every animal that went, and
relinked the same shader programs at every switch of island. None of it changes how anything looks.

- **30 frames a second at rest** (`frame-pacer.tsx`). `SceneCanvas` runs its canvas on demand and a
  `FramePacer` asks for each frame, a little before it is due, `1000 / 30` ms after the start of the last.
  Everything is worked out from the time between frames (the swimming's own fixed step included), so
  animals swim at the same speed at any rate. The explorer draws at every refresh while a finger is
  on it (`explorer.touching`) or its view eases or glides (`explorer.moving`: a zoom button, "show the
  whole ocean", a tap on a reef creature), as it always asked to; the pacer puts its own next frame back
  after any frame, so the two never add up. A scene that is hidden, paused or behind another screen still
  asks for nothing. The animal close-up (`inspect`) keeps `fps={60}`. The simulator keeps its own pace
  (it waits for the GL worker). The slow-frame count of the dev log and the `ISLAND_PERF` badge is
  relative to the rate (`slowFrameMs`: 50 ms at 30 a second).
- **Bone textures.** `AnimatedMarine` frees its clone's skeletons when it unmounts (`skeleton-dispose.ts`).
- **Tap targets.** An animal's tap target depends on whether it has a handler, not on the closure the
  scene hands down at every render, and the body it is worked out from is measured once for each parsed
  model (`tapTarget`'s `source`): measuring skins every vertex. A rebuild used to measure the body
  wherever the animal was by then, in the world, so the oval of a reef fish ended up elsewhere in the
  ocean and a dolphin lost its own; it is now always the body at rest, which is what the first build gave.
- **Shader programs** (`program-keeper.tsx`). A canvas keeps what it has linked: a built-in material's
  program gets one more use, and the first material seen with each ShaderMaterial program stays alive
  (its code gets new numbers in three.js's cache once its last material goes, so the old program would
  never be found again). Going back to an island links nothing.

Measured in a browser with software WebGL (SwiftShader) and a collection at level 3 on three islands
(mid3), before and after builds run in turn:

| | Before | After |
| --- | ---: | ---: |
| Card at rest, frames a second (draw skipped: this machine's rasterizer can't do 60) | 59 | 30 |
| Card at rest, main-thread work (ms a second) | 150 | 98 |
| Explorer at rest / finger resting / dragging / glide over, frames a second | 57 / 60 / 60 / 60 | 28.5 / 60 / 60 / 30 |
| The scene's own work for 6 s of scene time (no drawing), interpreter / JIT, Coral Reef level 3 | 597-633 / 262-269 ms | 401-447 / 136-144 ms |
| GL calls for a frame: card / explorer | 148 / 359 | 146 / 376 |
| GL calls a second at rest: card / explorer (calls a frame x frames a second) | 8,700 / 20,500 | 4,400 / 10,700 |
| Tap targets built, island mounted then redrawn twice (9-10 animals) | 27-30 | 9-10 |
| Tap targets built through a run of 6 island switches and 2 explorer opens | 197 | 81 |
| Measuring bodies, first mount / every later mount, interpreter | 125-140 / 130-175 ms | 111-120 / 0 ms |
| Measuring bodies, first mount / every later mount, JIT | 36-42 / 14-18 ms | 29-52 / 0 ms |
| GL textures live in the card's context after 6 island switches | 36 | 5 |
| Textures live after 2 explorer opens and closes (all contexts) | 82 | 19 |
| Programs linked by 6 island switches (13 at first) | 63 | 14 |
| Revisit of an island links | 8-9 programs | none |

The animals' places agree to 1e-15 between the real scene stepped at 60 and at 30 a second after the
first seconds, and they swim the same distance each second. Stills of the card and the explorer before
and after look the same; the card without its animals, frozen, after six switches is the same pixel for
pixel but for a 30 x 25 patch of what moves by its own clock. The `ISLAND_PERF` badge reads
"60 fps · 0 slow" before and "30 fps · 0 slow" after (it would have counted every frame slow, late for 60).

The 4 textures left by each explorer open are three.js's own empty textures of the explorer's lost GL
context, not animals'.

Not done: the first measuring of a body still skins its vertices (about 14 ms a model in the
interpreter, once for each model a session meets); the explorer's programs, which it links afresh at
every open because it is a second GL context; unifying the animals' program variants (open water and reef
differ in code, not only in flags). On a phone to time: the card's and the explorer's feel at 30 a second,
the explorer under a finger, the first switch to each island.

## Building less (November 2026)

On a phone the islands' JavaScript is the wait: the explorer rebuilt its whole archipelago at every open
(about 18 s under `node --jitless`, the closest stand-in for Hermes, with five islands; four fifths of it
the seabed's maths, two fifths the one function that measures how far a point is from a shore), Home built its
ocean twice on a first launch, and every island pill rebuilt everything. None of it changes how anything looks
or swims: every number the islands and animals are made from is the same (477 fingerprints: every coast,
coral, kelp and seagrass mesh at every level, full and lite, each mounted twice; depth maps; lattices; the
animals' paths in Home's and the explorer's worlds), and `npm run verify:swim` still finds 0 clipped, 0 on
land, 0 grazing (a subset of it is byte-identical before and after).

- **A faster, exact shore distance** (`shoreDistance`, island-outline.ts). A shoreline's edges are kept in
  runs of eight with a bounding box each; a point looks first in the run that held its last nearest edge,
  then only in runs whose box could hold a nearer one, and counts crossings only in runs its row falls in.
  The very same numbers, bit for bit, as walking every edge (`shoreDistanceByEdges`, kept as the oracle and
  tested on 100,000 points over every shape and level). Runs of eight were the quickest of 4, 6, 8, 12 and 16.
- **Exact trims.** `bankDepth` leaves out a platform, saddle, cay or rock that cannot change the answer (a
  `pruned` flag turns it off for the tests); the direction away from the shallows, which most fields are never
  asked for, is worked out when first asked (`distanceTo`); the depth map's region weights make nothing per texel.
- **Worked out once.** `coralHeads(level)` (frozen, shared) and `shorePolygons` are found once; the depth map
  works out no coral heads where it is baked; the seagrass search skips ground too far from every shore.
- **Nothing is built until the level is known** (`sanctuary-scene.tsx`). Home without a kept picture, and a
  cold explorer, built the ocean at the first level while the collection loaded and again at the real one.
- **The explorer's ocean is kept** (`seabed-depth.ts`): the last eight sets of islands' depth maps and, for each,
  the last three reaches of water, let go of with the baked seabeds (0.3 MB for a lone island, 2.9 MB for the
  explorer's five).
- **Built geometry is shared** (`geometry-cache.ts`): coasts, corals, kelp and seagrass are made once and
  handed to every mount, canvas and island pill. A mesh never disposes a shared geometry itself
  (`useHeldGeometry`): it is disposed, its graphics-card buffers freed in every renderer, only once it has left
  the cache and nothing holds it. Bounded at 24 geometries and 24 MB, least recently used first; all five
  islands at level 6 hold 13 geometries and 15.8 MB (9.6 MB at lite quality). A coast that differs between
  levels only by its islets is made once for each number of islets.

Measured with the same harness on the original and the changed tree, runs alternating (`node --jitless` on
the process's CPU time; V8 on wall time, where the first run of a fresh process is mostly the engine warming
up, so its differences are small and noisy), median of three, before -> after:

| | jitless | V8 |
| --- | ---: | ---: |
| Home's island built cold, level 1 / 3 / 6: reef | 1.90 / 1.96 / 2.56 -> 1.44 / 1.48 / 1.83 s | 0.45 / 0.49 / 0.61 -> 0.39 / 0.52 / 0.53 s |
| mangrove | 2.20 / 2.13 / 2.50 -> 1.53 / 1.52 / 1.72 s | 0.48 / 0.42 / 0.50 -> 0.47 / 0.41 / 0.45 s |
| kelp | 1.11 / 1.15 / 1.31 -> 0.99 / 0.95 / 1.06 s | 0.30 / 0.30 / 0.31 -> 0.28 / 0.28 / 0.35 s |
| volcanic | 0.93 / 0.97 / 1.06 -> 0.91 / 0.83 / 0.94 s | 0.27 / 0.26 / 0.31 -> 0.26 / 0.27 / 0.28 s |
| wreck | 0.96 / 0.95 / 1.19 -> 0.77 / 0.87 / 0.87 s | 0.24 / 0.24 / 0.26 -> 0.24 / 0.24 / 0.27 s |
| Explorer, first open, 5 islands, level 1 / 3 / 6 | 17.9 / 18.7 / 29.1 -> 11.4 / 11.5 / 14.7 s | 1.97 / 1.87 / 2.36 -> 1.61 / 1.61 / 1.77 s |
| 3 islands | 11.5 / 12.0 / 18.3 -> 7.1 / 7.1 / 9.5 s | 1.27 / 1.20 / 1.63 -> 1.18 / 1.19 / 1.32 s |
| 1 island (baked) | 2.0 / 2.0 / 2.5 -> 1.4 / 1.5 / 1.9 s | 0.41 / 0.48 / 0.63 -> 0.42 / 0.53 / 0.60 s |
| Explorer's ocean (depth map, seabed, water), 5 islands, level 3: first open / every open after | 11.6 / 9.0 -> 6.2 / 0.06 s | 1.12 / 0.64 -> 0.92 / 0.02 s |
| level 6: first open / every open after | 21.9 / 16.9 -> 8.8 / 0.06 s | 1.51 / 0.92 -> 1.06 / 0.02 s |
| Second mount of the eight island parts, level 3 | 2.56 -> 0.08 s | |
| Home's island pills, level 3, first visit: reef / kelp / volcanic / mangrove / wreck | 1.91 / 1.03 / 0.94 / 2.03 / 0.95 -> 1.42 / 0.93 / 0.86 / 1.63 / 0.71 s | |
| going back to the reef / the kelp | 1.35 / 0.45 -> 0.22 / 0.10 s | 0.47 / 0.19 -> 0.11 / 0.03 s |

In a browser with software WebGL (SwiftShader) on the web build, the app's own timing marks and the
browser's long tasks, median of three runs in turn at full speed (and two at 4x slower CPU, in brackets):
the cold explorer's first animal 3.7 -> 3.1 s (4x, mean of two: 10.8 -> 8.4 s) and its longest blocking task
1.5 -> 1.1 s; opening the explorer from Home a second time blocks the main thread for 1.4 -> 0.56 s (4x, mean
of two: 5.7 -> 1.5 s); Home on a first launch shows its first animal at 2.4 s either way at full speed (the
first ocean builds in a fraction of a second on the web's JIT, alongside the collection loading), and at 4x
slower CPU in 7.7 -> 5.9 s (mean of two): the slower the engine, the more the one build instead of two saves.
Home with a kept picture is unchanged (1.8 s). Stills of Home and the explorer before and after show the
same islands, corals, forests and boats in the same places.

Not done: the animals' simulation is still started for every island at every mount (about 0.55 s an island
under `--jitless`, 0.09 s more for each animal after the first), the first mount of each island's coast and
props (the corals' own copy for the water's tint is 60 ms a mount even from the cache), the explorer's
five-island ocean the first time (6.2 s of the 11.5 s at level 3 under `--jitless`: it has no bake), islets and the level-4 palm, which are small and still built at each mount. On a phone to
time: Home on a first launch and after a level-up, the explorer's first open with one, three and five
islands, and its second open, going back to an island pill, and memory after a session of opening the explorer
(`geometryCacheSize()` in geometry-cache.ts reports what is kept).
