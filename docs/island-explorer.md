# Island explorer

The diver's island full screen, to zoom in on and look around. It opens from the
full-screen button (four arrows, "Explore your ocean full screen") beside the pause
button on the Home card, once an animal is swimming there, and closes with ✕. (It is
not the **Explore** tab, which is the map of dive sites.) The island, its animals and their behavior are Home's: the
explorer draws the same `SanctuaryScene` and only replaces its camera. The route is
`src/app/explore.tsx`; the camera maths and every tunable are in `EXPLORER` in
`src/lib/explorer-view.ts`; the camera itself is
`src/components/home/three/explorer-camera.tsx`.

## Using it

| To | Touch | Mouse (web) | Buttons |
| --- | --- | --- | --- |
| Look closer or farther | Pinch, about the fingers | Wheel (or a trackpad pinch), about the pointer | **+** and **−** (1.6× a press) |
| Look closer at a spot | Double tap (2×) | Double click | |
| Look around | Drag; let go mid-drag to glide on | Drag | |
| See the whole ocean again | Double tap when all the way in | | **⌖** "Show the whole ocean" |
| Revisit a discovery | Tap the animal | Click it | |

A hint ("Pinch or double-tap to look closer · drag to look around") shows for five
seconds when it opens. Two fingers both pinch and pan, so a two-finger move zooms and
slides at once.

## How it works

**The view.** A view is the point on the water in the middle of the screen (x, z) and
the zoom, in screen points per world unit. The camera keeps Home's angle (from
(0, 12, 6) looking at (0, −0.15, 0)) and moves over that point. Looking down at an
angle foreshortens the water's depth, so a drag up the screen covers
`depthStretch` (about 1.115) times the water a drag sideways does; panning and zooming
use it so the spot under the finger stays under it.

**How far out.** All the way out, the screen is all water: the view never shows past
the water surface's edge (`OCEAN.waterExtent`, 8.6 units, less `edge`). It shows the
whole swimming area plus `margin` when the screen's shape allows. A tall phone shows
the area's full depth and a slice of its width, and pans across the rest:

| Screen | Level | Zoom range (pt/unit) | Water across × deep, all the way out | All the way in |
| --- | ---: | --- | --- | --- |
| Phone, 390 × 844 | 1 | 57 – 177 (3.1×) | 6.9 × 16.6 units | 2.2 units across |
| Tablet, 1180 × 820 | 6 | 78 – 373 (4.8×) | 15.1 × 11.7 units | 2.2 units down |
| Laptop, 1440 × 900 | 1 | 100 – 409 (4.1×) | 14.3 × 10 units | 2.2 units down |

The Home card shows the island at 31 pt per unit (`SCENE_CAMERA`), so on a phone the
explorer starts nearly twice as close as the card and goes nearly six times as close.

**How far across.** The view's edges stay inside the swimming area plus `margin`
(`panLimit`), so an animal at the edge of its range is in full view and the water's
own edge never is.

**Moves.** A drag or pinch moves the view at once. Letting go mid-drag glides on at the
finger's speed and slows (`friction`). Buttons and double taps ease to their goal
(`ease`, zoom eased in log space so it feels even); a finger coming down stops any
glide or eased move where it is.

**Tap targets.** Slender animals have invisible tap targets at least 28 pt across
(`MIN_TAP`, see [island navigation](marine-navigation.md#a-growing-ocean)). In the
explorer they keep that size on screen at any zoom (`tapScaleAt`), so close up they
hug the body instead of covering its neighbours. The explorer reports its zoom only
when it has changed by a tenth or more, or when a move ends, so the targets follow it
without a React render every frame. A press that moves more than `TAP_SLOP` (8 px) is
a drag, not a tap, so looking around never opens an animal's page.

**Haze.** On the Home card the top and bottom of the view fade into haze; the explorer
fills the screen, so it keeps only a thin fade (`haze`).

**Drawing.** The canvas draws continuously while the animals swim. When they are
still (Reduce Motion, or still loading) the island draws only on demand, so the camera
asks for a frame on every move, and keeps asking while a glide or an eased move
settles. Home's own island pauses while the explorer is open (its screen loses focus).

## Accessibility

- Every gesture has a button: zoom in, zoom out and show the whole ocean, each 44 pt
  with a label. Close is a labelled button too.
- With Reduce Motion on, the animals hold still as they do on Home, buttons and double
  taps jump to their goal instead of sweeping, a drag stops where the finger lifts, and
  the hint disappears instead of fading.
- The scene is one labelled image for screen readers, as on Home; its description adds
  how to look closer and around.

## Tuning

| `EXPLORER` | Default | What it does |
| --- | ---: | --- |
| `margin` | 0.7 | Water kept in view beyond the swimming area (units) |
| `edge` | 0.3 | How close the water surface's edge may come to the screen's (units) |
| `closest` | 2.2 | Water the shorter side spans all the way in (units); lower to zoom closer |
| `step` | 1.6 | Zoom per button press (×) |
| `doubleTap` | 2 | Zoom per double tap (×) |
| `ease` | 6 | How quickly a button's or double tap's move settles (1/s) |
| `friction` | 3.2 | How quickly a glide slows (1/s) |
| `haze` | [0.88, 1.04] | Where the top and bottom haze begins and ends (clip space) |

## Verifying

```sh
npx jest src/lib/__tests__/explorer-view.test.ts src/components/home/__tests__/explore-screen.test.js
```

The tests cover:

- the depth stretch matching the island camera;
- all the way out, never showing past the water on phones, tablets and laptops, and a
  phone showing the area's full depth;
- panning keeping the spot under the finger and stopping at the limits;
- a pinch keeping the spot between the fingers in place, and the zoom limits;
- the controller: starting at the whole ocean once it knows the screen, buttons easing,
  flings gliding and stopping, double taps zooming in and back out, and the zoom
  reported as it changes;
- every move heard (for on-demand drawing), and Reduce Motion jumping instead of sweeping;
- the screen: starting at the whole ocean, the buttons, tap targets following the zoom,
  closing, and the hint.

`npm run verify:underwater` still checks the 28 pt tap minimum at levels 1 and 6.

## Known limitations

- It explores the one island the diver chose on Home. More islands, one per habitat,
  are the next step towards an archipelago.
- On a phone the zoom range is about 3×; the smallest animals (clownfish) fill a fifth
  of the screen all the way in. Small reef life, drawn only up close, will want
  `closest` lower.
- Home's island stays mounted, paused, while the explorer is open, so two GL contexts
  are alive at once.
- Opening an animal's page from the explorer pushes it above the explorer, and back
  returns to the explorer where it was.
