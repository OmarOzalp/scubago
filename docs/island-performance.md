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
npm run verify:marine
```

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

`node scripts/verify-underwater.mjs` (Node 24) checks all six real assets for
correct head/tail orientation, private geometry/materials, and independent dive
and rise uniforms. Updated timing tests distinguish descent from emergence.

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
