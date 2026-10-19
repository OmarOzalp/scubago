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

**Depth.** `buildDepthField(level, islands)` bakes a 128 × 128 map from the island's
shoreline (larger with more islands: see [Islands in one ocean](#islands-in-one-ocean)),
including the islets at higher levels. It holds the water depth, the
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
refraction offset follows the wave slope (`distortion`), read at the animal's own middle so the
whole animal shifts together: read at each vertex, a long whale's body bent with every passing
wave, which showed close up in the explorer. A diving animal
first sinks into the blue, then fades head first. Pitch follows the animal's
actual rise and fall, and its gentle vertical drift runs on its own clock,
separate from the waves.

**Cost.** The ocean adds two draw calls, the surface (about 3,900 triangles) and
the seabed (about 4,600). Waves are evaluated per vertex, and reflection and foam
break-up are per vertex too. Each surface or seabed pixel does one depth-map
lookup, one facet normal and a few blend terms. There are no render targets,
screen reads or post-processing, and animals add no draw calls.

## Islands in one ocean

One ocean can hold several islands (`OceanIsland`: a middle and a habitat): one on Home's
card, every island found in the explorer (`docs/island-explorer.md#one-ocean`).

- **Depth.** The map reaches 9 units past every island's middle at the same 7.1 texels a
  unit (`DEPTH`), so with the Coral Reef and the Kelp Forest it is 139 × 217, and with the
  Volcanic Pinnacle too, 167 × 302. Each texel's
  depth comes from the nearest island's shore, measured in that island's own frame, so its
  shelf is the one its kelp and reef animals stand on; past 10 units from an island
  (`ISLAND_REACH`) only open-ocean depth is left of its shelf, so its shore isn't measured.
  `uOceanDepthArea` says where the map lies (x0, z0, width, depth).
- **Whose water.** A second map beside it (the region map) holds each texel's share of up to
  four waters (`OCEAN_REGIONS`, one channel each, in the order of `field.habitats`): an
  island's own palette around it, giving way to the next across the open sea between them
  (`REGION_BLEND`, 1.2 units). The surface and seabed shaders blend the palettes' colours
  (`REGION_COLORS`: shallow, mid, deep, sand, wet sand, seagrass, sky) and clarity by those
  shares (`REGION_GLSL`); the lite map bakes the same blend.
- **Each island's things.** Everything at an island (its animals, kelp, reef rocks and rising
  islets) reads its own uniforms (`islandOceanUniforms`): the ocean's own waves, clock, depth
  map and haze, but the island's own palette and clarity, so an otter fades into the Kelp
  Forest's cold green and a manta into the reef's turquoise.
- **Seabed and water.** Around one island alone, as before. With several, each island's
  radial terrain stops halfway to its neighbour (less its own size) and a coarse grid of deep
  floor lies under the open sea; the surface lattice covers the box `reach` units past every
  island. With the two islands in the explorer, the water is about 12,300 vertices and the
  seabed 4,900 (16-bit indices allow 65,536).

With one island the maps, meshes and pixels are exactly as they were.

## Quality tiers

GPUs emulated in software (the iOS simulator, Android emulators) get a **lite** tier; physical
devices and browsers get **full** quality (`src/components/home/three/scene-quality.ts`). Lite
keeps the palette, halo, waves and animal tinting, but:

- the static seabed and water colors are baked into one texture per level, and the ocean is
  drawn as a single opaque layer over the wave lattice;
- facet shading is held flat per triangle and highlights are evaluated per vertex;
- animals skip the per-vertex wave math and take the surface tint in their own shader.

On a CPU renderer this cuts the frame cost from about 84 ms to about 32 ms. Force a tier with
`EXPO_PUBLIC_SCENE_QUALITY=lite` or `full`, then restart Metro with `--clear`. See
`island-performance.md` for measurements.

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
