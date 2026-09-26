# Island ocean

The water around the island on My Home: how it is built, what it costs, and
which numbers to change to tune it. Every tunable lives in `OCEAN` in
`src/lib/ocean.ts`; the meshes and shaders are in
`src/components/home/three/ocean-mesh.ts`, and the animals' water response is in
`underwater-material.ts`.

## How it works

**Surface.** A jittered triangle lattice (about 2,050 vertices, `facetSize` 0.42)
is displaced in the vertex shader by four wave layers: a broad swell, a cross
swell, a medium chop and a small ripple. Each layer has its own heading,
wavelength and speed, and their periods are not multiples of one another, so the
pattern travels across the water and never pulses in place. Crests roll forward
only slightly (`roll`), which keeps the water calm rather than choppy. Waves fade
out over the beach (`waveShoaling`), so the waterline laps gently. Each triangle
is shaded with its own flat normal, which gives the low-poly facets.

**Depth.** `buildDepthField(level)` bakes a 128 × 128 map from the island's
shoreline, including the islets at higher levels. It holds the water depth, the
beach height above the surface and seagrass patches. The seabed profile runs from
the beach down to a sandy shelf, then to a reef edge, then deepens smoothly into
open water. The shelf width varies around the coast (`shelfVariation`), so the
shallows follow the island's geology instead of forming a perfect ring.

**Color.** Water color goes from `shallow` to `mid` to `deep` with depth
(`shoreDepthRange`). The seabed's sand fades into that color as the water deepens
(`seabedVisibility`), which produces the turquoise halo around the island. The
seabed is a low-poly radial terrain drawn first, without depth testing. Its
geometry adds relief and facet light, but it can never hide an animal, even one
diving below the modeled floor.

**Surface layer.** The surface itself is mostly clear (`opacity`: 0.16 in the
shallows, 0.3 over deep water) and uses premultiplied blending, so what is below
stays visible. It adds:

- a restrained Fresnel sky reflection that grows slightly toward the far water;
- soft sun highlights on only the few facets tilted toward the sun (`specular`);
- a thin, broken foam line at the waterline (`foam`).

The top and bottom of the view haze into the card color (`edgeFade`).

**Animals.** Swimmers render inside `SanctuaryEnvironment` and read the same
uniforms through `OceanContext`. Each vertex measures its depth below the moving
surface. Deeper parts take on more of the water color (`underwater.tintStrength`,
`visibility`, `clearDepth`) and lose saturation (`desaturation`), and a small
refraction offset follows the local wave slope (`distortion`). A diving animal
first sinks into the blue, then fades head first. Pitch follows the animal's
actual rise and fall, and its gentle vertical drift runs on its own clock,
separate from the waves.

**Cost.** The ocean adds two draw calls, the surface (about 3,900 triangles) and
the seabed (about 4,600). Waves are evaluated per vertex, and reflection and foam
break-up are per vertex too. Each surface or seabed pixel does one depth-map
lookup, one facet normal and a few blend terms. There are no render targets,
screen reads or post-processing, and animals add no draw calls.

## Tuning quick reference

| To get… | Change first | Then |
| --- | --- | --- |
| Bigger waves | `waves.large.amplitude` (keep the four amplitudes summing under ~0.08) | `waves.medium.amplitude` for more facet play |
| Slower waves | every `waves.*.speed` by the same factor | longer `wavelength` for broader swells |
| Clearer water | lower `opacity.deep` / `opacity.shallow` | raise `seabedVisibility` |
| Bluer water | `palettes.<habitat>.mid` and `.deep` toward blue | lower `shoreDepthRange.deep` so blue arrives sooner |
| More turquoise shallows | a more saturated `palettes.<habitat>.shallow` | raise `shoreDepthRange.mid`; widen `seabed.shelfWidth` |
| Deeper underwater visibility | raise `underwater.visibility` | raise `underwater.clearDepth`; lower `tintStrength` |
| More or less reflection | `reflection.strength` | `specular.strength` for the facet highlights |
| Crisper or softer facets | `facetShading` | `specular.softness` (0 = crisp, 1 = smooth) |
| Less shore foam | `foam.strength` (0 disables it) | `foam.depth` for the band width |

Keep `specular.tilt` above about three times `specular.spread`. Otherwise flat
water catches the sun too, and the whole surface washes out.

## Verifying

```sh
npx jest src/lib/__tests__/ocean.test.ts   # calm, traveling, unsynchronized waves; seabed profile; palettes
npm run verify:ocean       # real meshes and depth maps for levels 1–6: budgets, shoaling, depth
npm run verify:underwater  # every GLB: dive fade orientation, private materials, shared ocean uniforms
```

Native frame timing with the new ocean has not been measured on a device or the
iOS simulator yet (see `island-performance.md`).
