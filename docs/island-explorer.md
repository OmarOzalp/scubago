# Island explorer

The diver's island full screen, to zoom in on and look around. It opens from the
full-screen button (four arrows, "Explore your ocean full screen") beside the pause
button on the Home card, once an animal is swimming there, and closes with ✕. (It is
not the **Explore** tab, which is the map of dive sites.) The island, its animals and
their behavior are Home's: the explorer draws the same `SanctuaryScene`, with its own
camera and water that reaches past every edge of the screen. The route is
`src/app/explore.tsx`; the camera maths, the gestures and every tunable are in
`src/lib/explorer-view.ts` (`EXPLORER`); the camera itself is
`src/components/home/three/explorer-camera.tsx`.

## Using it

| To | Touch | Mouse (web) | Buttons |
| --- | --- | --- | --- |
| Look closer or farther | Pinch, about the fingers | Wheel (or a trackpad pinch), about the pointer | **+** and **−** (1.6× a press) |
| Look closer at a spot | Double tap (2×) | Double click | |
| Look around | Drag (let go fast to glide on), with one finger or several | Drag | |
| See the whole ocean again | Double tap when all the way in | | **⌖** "Show the whole ocean" |
| Revisit a discovery | Tap the animal | Click it | |

It opens all the way out: the whole ocean and every animal in view, the water filling
the screen. Pinch in from there to see the smaller things, and back out. A hint
("Pinch or double-tap to look closer · drag to look around") shows for five seconds.

## How it works

**The view.** A view is the point on the water in the middle of the screen (x, z) and
the zoom, in screen points per world unit. The camera keeps Home's angle (from
(0, 12, 6) looking at (0, −0.15, 0)) and moves over that point. Looking down at an
angle foreshortens the water's depth, so a drag up the screen covers
`depthStretch` (about 1.115) times the water a drag sideways does; the gestures use it
so the water under the fingers stays under them.

**All the way out, and in.** All the way out is where it opens: the swimming area and
`frame` (0.6 units) of water around it in view, so every animal is on screen, whatever
the island's level. All the way in, the screen's shorter side spans `closest` (1.6
units): an animal up close.

| Screen | Level | Zoom range (pt/unit) | Water across × deep, all the way out |
| --- | ---: | --- | --- |
| Phone, 390 × 844 | 1 | 35 – 244 (6.9×) | 11 × 26.5 units |
| Phone, 390 × 844 | 6 | 30 – 244 (8.1×) | 13 × 31.3 units |
| Tablet, 1180 × 820 | 6 | 79 – 513 (6.5×) | 14.9 × 11.5 units |
| Laptop, 1440 × 900 | 1 | 102 – 563 (5.5×) | 14.1 × 9.8 units |

The Home card shows the island at 31 pt per unit (`SCENE_CAMERA`), so a phone opens
about as the card frames it, taller, and zooms in about seven times.

**Water to every edge.** A tall phone all the way out sees far more depth than the
Home card's water covers (it stops at `OCEAN.waterExtent`, 8.6 units, which the card's
view never reaches past, and fades its top and bottom into the card). So in the
explorer the water reaches `reach` (18 units) each way from the island's middle, the
deep floor under it, and there is no haze: open water runs to every edge of the
screen at every zoom, and the view never goes past it. The Home card's own water is
unchanged.

**How far across.** The middle of the view may roam until the view's edges are `margin`
(2 units) past the swimming area, or at the water's edge if that is nearer
(`panLimit`): an animal at the edge of its range is in full view, and a phone zoomed in
a little can move up and down as well as across.

**The fingers.** The explorer follows the fingers themselves, from the first touch
(`touch`, every time any finger moves, lands or lifts), rather than waiting for a
pinch or a drag to be recognized and then catching up in a jump:

- Their middle drags the water and their spread zooms about it. The new view is found
  in one go, keeping the water that was under their middle under it at the new zoom,
  and only then kept inside the limits (`followFingers`), so the limits of the old zoom
  never stop a move the new one allows.
- When a finger lands or lifts, the fingers' middle jumps, so the view stays exactly
  where it is and carries on from there.
- Fingers closer together than `pinchFloor` (12 pt from their middle) only drag: real
  fingers are never much closer, and at that size a wobble would snap the zoom.
- Let go of a single finger moving fast (over `flick`, 250 pt/s, measured over its last
  `sample` 100 ms, and only if it hadn't stopped) and the view glides on at that speed
  (at most `topSpeed`, 2,500 pt/s) and slows (`friction`). Nothing glides after a
  pinch, or after a touch the system takes away.

A drag and a pinch gesture are still attached, but only to claim the touch once it
moves or spreads, so that looking around never also taps an animal.

**Tap targets.** Slender animals have invisible tap targets at least 28 pt across
(`MIN_TAP`, see [island navigation](marine-navigation.md#a-growing-ocean)). In the
explorer they keep that size on screen at any zoom (`tapScaleAt`), so close up they hug
the body instead of covering its neighbours. The explorer tells them its zoom only when
a move ends (the fingers lift, an eased move settles; the mouse wheel as it turns), so
the island is never re-drawn by React in the middle of a pinch, which on a phone would
stall it. A press that moves more than `TAP_SLOP` (8 px) is a drag, not a tap.

**Buttons and taps.** Buttons and double taps ease to their goal (`ease`, the zoom eased
in log space so it feels even); a finger coming down stops any glide or eased move
where it is. The mouse wheel zooms at once, about the pointer (`zoomAt`).

**Drawing.** The canvas draws continuously while the animals swim. When they are still
(Reduce Motion, or still loading) the island draws only on demand, so the camera asks
for a frame on every move, and keeps asking while a glide or an eased move settles.
Home's own island pauses while the explorer is open (its screen loses focus). The
explorer's larger water is about 8,700 vertices against the card's 2,058, and its
seabed 2,784 against 2,400.

## Accessibility

- Every gesture has a button: zoom in, zoom out and show the whole ocean, each 44 pt
  with a label. Close is a labelled button too.
- With Reduce Motion on, the animals hold still as they do on Home, buttons and double
  taps jump to their goal instead of sweeping, nothing glides, and the hint disappears
  instead of fading.
- The scene is one labelled image for screen readers, as on Home; its description adds
  how to look closer and around.

## Tuning

| `EXPLORER` | Default | What it does |
| --- | ---: | --- |
| `reach` | 18 | How far the explorer's water reaches from the island's middle (units, each way) |
| `edge` | 0.3 | How close the water's own edge may come to the screen's (units) |
| `frame` | 0.6 | Water around the swimming area all the way out (units) |
| `margin` | 2 | How far past the swimming area the view may roam (units, up to the water's edge) |
| `closest` | 1.6 | Water the shorter side spans all the way in (units); lower to zoom closer |
| `step`, `doubleTap` | 1.6, 2 | Zoom per button press, and per double tap (×) |
| `ease` | 6 | How quickly a button's or double tap's move settles (1/s) |
| `friction` | 4.5 | How quickly a glide slows (1/s) |
| `flick`, `topSpeed` | 250, 2500 | Slowest release that glides, and the fastest glide (pt/s) |
| `sample` | 100 | How far back the release speed is measured (ms) |
| `pinchFloor` | 12 | Fingers closer than this (pt from their middle) only drag |

## Verifying

```sh
npx jest src/lib/__tests__/explorer-view.test.ts src/components/home/__tests__/explore-screen.test.js
```

The tests cover:

- opening all the way out with the whole swimming area in view and water to every edge,
  on phones (levels 1 and 6, tall and short), tablets and laptops;
- panning and zooming about a point, and the limits;
- one finger keeping the water under it, move by move;
- two fingers zooming with their spread and keeping the water between them as they
  move; fingers almost together only dragging;
- a finger landing or lifting never moving the view, and no glide after a pinch;
- a fast release gliding (no faster than the top speed); a slow one, one that stopped
  first, or a cancelled one staying put;
- 400 random multi-finger sessions (drags, pinches, twists, fingers landing and lifting)
  on three screens: after every touch, the water under the fingers is still under them
  unless a limit stopped it, the zoom changed exactly as their spread did, nothing
  moved when a finger landed or lifted, and the view stayed inside its limits;
- tap targets hearing the zoom only when a pinch ends;
- buttons and double taps easing in and back out, the wheel, and showing the whole ocean;
- every move heard (for on-demand drawing), and Reduce Motion jumping instead of sweeping;
- the screen: starting all the way out, the buttons, tap targets following the zoom,
  closing, and the hint.

`npm run verify:ocean` checks the Home card's water (still 2,058 vertices), and
`npm run verify:underwater` the 28 pt tap minimum at levels 1 and 6.

## Known limitations

- It explores the one island the diver chose on Home. More islands, one per habitat,
  are the next step towards an archipelago.
- Far out, the open water is the same deep blue all the way to the edge: there is
  nothing out there yet.
- Home's island stays mounted, paused, while the explorer is open, so two GL contexts
  are alive at once.
- Opening an animal's page from the explorer pushes it above the explorer, and back
  returns to the explorer where it was.
