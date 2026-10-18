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
| Look around | Drag with one finger (let go fast to glide on), or move two fingers together | Drag | |
| See the whole ocean again | Double tap when all the way in | | **⌖** "Show the whole ocean" |
| Revisit a discovery | Tap the animal | Click it | |

A hint ("Pinch or double-tap to look closer · drag to look around") shows for five
seconds when it opens. It opens as the Home card frames the island, so nothing jumps
when it opens; pinch in from there to look closer, or out to see a little more ocean.

## How it works

**The view.** A view is the point on the water in the middle of the screen (x, z) and
the zoom, in screen points per world unit. The camera keeps Home's angle (from
(0, 12, 6) looking at (0, −0.15, 0)) and moves over that point. Looking down at an
angle foreshortens the water's depth, so a drag up the screen covers
`depthStretch` (about 1.115) times the water a drag sideways does; panning and zooming
use it so the spot under the finger stays under it.

**Where it opens, and how far out.** It opens as the Home card frames the island:
the swimming area (`CARD_SPAN`, 10.8 units at the first level, more as the ocean grows)
across the screen's shorter side, the same rule `SceneCamera` uses for the card. From
there it zooms out to `furthest` (0.7) of that, but never so far that the screen's sides
show past the water surface's edge (`OCEAN.waterExtent`, 8.6 units, less `edge`). A
landscape screen already sees the water's full width as it opens, so it starts all the
way out.

| Screen | Level | Zoom range (pt/unit) | Opens at | Water across × deep as it opens | All the way in |
| --- | ---: | --- | ---: | --- | --- |
| Phone, 390 × 844 | 1 | 25 – 177 (7×) | 36 | 10.8 × 26 units | 2.2 units across |
| Tablet, 1180 × 820 | 6 | 71 – 373 (5.2×) | 71 | 16.6 × 12.9 units | 2.2 units down |
| Laptop, 1440 × 900 | 1 | 87 – 409 (4.7×) | 87 | 16.6 × 11.6 units | 2.2 units down |

**Seeing past the water.** A tall phone sees more depth than the water has (26 units
deep against 17.2), so its top and bottom look past the water's near and far edges.
The haze comes in to meet them (`hazeFor`): it is complete just before each edge,
and the scene's background beyond is the same color, so the view fades into the card's
pale water as the Home card's does, never ending in a line. Closer in, the haze is the
explorer's usual thin band (`haze`).

**How far across.** The middle of the view may roam until the view's edges are `margin`
(2 units) past the swimming area, or at the water's edge if that is nearer
(`panLimit`): an animal at the edge of its range is in full view, and a tall phone,
once zoomed in a little, can move up and down as well as across.

**Moves.** One finger drags the view at once; let go fast (over `flick`, 250 pt/s) and it
glides on at the finger's speed (at most `topSpeed`, 2,500 pt/s) and slows (`friction`);
let go slowly and it stays. Two fingers pinch: the pinch alone both zooms about the
fingers and moves with them, so the water under them stays under them, and the
one-finger drag waits until it is over. When a finger lands or lifts mid-pinch, the
fingers' middle jumps, so the move starts again from there; the finger left down
after a pinch starts afresh too, and nothing glides after a pinch. Buttons and double
taps ease to their goal (`ease`, zoom eased in log space so it feels even); a finger
coming down stops any glide or eased move where it is. The mouse wheel zooms at once,
about the pointer (`zoomAt`).

**Tap targets.** Slender animals have invisible tap targets at least 28 pt across
(`MIN_TAP`, see [island navigation](marine-navigation.md#a-growing-ocean)). In the
explorer they keep that size on screen at any zoom (`tapScaleAt`), so close up they
hug the body instead of covering its neighbours. The explorer reports its zoom only
when it has changed by a tenth or more, or when a move ends, so the targets follow it
without a React render every frame. A press that moves more than `TAP_SLOP` (8 px) is
a drag, not a tap, so looking around never opens an animal's page.

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
| `margin` | 2 | How far past the swimming area the view may roam (units, up to the water's edge) |
| `edge` | 0.3 | How close the water surface's edge may come to the screen's sides (units) |
| `furthest` | 0.7 | How far out it zooms, as a share of the Home card's zoom |
| `closest` | 2.2 | Water the shorter side spans all the way in (units); lower to zoom closer |
| `step` | 1.6 | Zoom per button press (×) |
| `doubleTap` | 2 | Zoom per double tap (×) |
| `ease` | 6 | How quickly a button's or double tap's move settles (1/s) |
| `friction` | 4.5 | How quickly a glide slows (1/s) |
| `flick`, `topSpeed` | 250, 2500 | Slowest release that glides, and the fastest glide (pt/s) |
| `haze` | [0.88, 1.04] | Where the top and bottom haze begins and ends (clip space), unless the water's edge is on screen |

## Verifying

```sh
npx jest src/lib/__tests__/explorer-view.test.ts src/components/home/__tests__/explore-screen.test.js
```

The tests cover:

- the depth stretch matching the island camera;
- opening as the Home card frames the island, zooming out a little past it, never past
  the water at the sides, on phones, tablets and laptops;
- the haze complete before the water's edges whenever they are on screen, and thin
  closer in;
- panning keeping the spot under the finger, stopping a little past the swimming area,
  and a phone zoomed in a little moving up and down;
- a pinch keeping the spot between the fingers in place, and the zoom limits;
- two fingers zooming and moving the view together, without a jump as fingers come and
  go, the drag waiting out the pinch, and no glide after it;
- a fast release gliding (no faster than the top speed) and a slow one staying;
- the controller: starting at the overview once it knows the screen, buttons easing,
  double taps going all the way in and back out, and the zoom reported as it changes;
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
