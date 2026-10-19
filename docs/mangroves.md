# The Mangroves & Seagrass

The archipelago's fourth island (`docs/archipelago.md`): a low cay of tidal mud under a dense canopy
of mangroves, standing in a warm, turquoise lagoon ringed with seagrass meadows, like the cays of
Belize and the Florida Keys. It rises the first time the diver logs a Mangroves & Seagrass species;
from then on Home's area pills switch to it, and in the explorer it lies to the south-east of the
reef, in the same ocean (`docs/island-explorer.md#one-ocean`). Its own animals (the five below, and
the tiger sharks, great hammerheads and green turtles, which used to swim at Home's reef and live
here) swim here; everything else swims at its own area's island or at Home's.

![The Mangroves & Seagrass with its animals](art-previews/island-mangroves.png)

## The island

`src/components/home/three/mangrove-coast.tsx` builds the island as one flat-shaded,
vertex-coloured mesh in the island's own (scaled) frame, from the building blocks it shares with
the Kelp Forest's and the Volcanic Pinnacle's coasts (`coast-geometry.ts`):

- **The ground.** Tidal mud only just above the water (`TOP`), a little higher inland and lumpy with
  roots, under a litter of fallen leaves; low mud banks from under the waterline (`FOOT`) to the
  shore. On the south-east side a spit of pale sand runs out (`SPIT`), where the canopy opens.
- **The canopy.** Mangrove crowns on a jittered lattice over the whole island, overlapping masses of
  glossy leaves, sunlit on top, rising gently toward the middle. Each tree has its own tone
  (`TINTS`: the paler, yellower white mangroves among the darker red and black ones), and here and
  there a gap shows the mud. Three dead mangroves, bleached silver, stand among the living.
- **Red mangroves.** All round the edge, red mangroves stand out in the water on their prop roots:
  a short trunk on a tangle of roots arching out and down into the water, dark and wet where they
  meet it, under a crown leaning out over the lagoon.
- **The spit.** A weathered boardwalk runs out from it over the shallows on posts, and two white
  egrets wade off its tip.
- From level 5 the islets (`islets()` in island-outline.ts) rise as clumps of red mangroves on their
  roots.

## The seagrass

`src/lib/seagrass.ts` places the meadows of turtle grass on the shallow shelf around the island
(`SEAGRASS`), as plain data for the renderer: tufts on a jittered grid from just off the roots out
to where the shelf drops away (`band`), in meadows with bare sand between them (wherever the
seabed's own green patches are, `seabedPatch` in ocean.ts, and in broader meadows of their own),
taller in the heart of a meadow and always under the surface (`clearance`). The same every time.

`seagrass-meadow.tsx` draws them in one mesh: each tuft a few slim blades (`seagrass-geometry.ts`),
dark green at the root to sunlit at the tip, a few dry and yellowed. They sway with the surge, a
wave travelling through the meadow, more toward their tips, on the island's water clock, so they
still when the scene does; under the water they take the depth tint and haze like the animals.
Lite quality keeps fewer tufts (`tufts.lite`) with fewer blades.

## The water

The Mangroves & Seagrass palette (`OCEAN.palettes.mangrove` in `src/lib/ocean.ts`) is warm and
green: bright turquoise-green shallows over pale sand, deepening to teal, the seabed's patches the
dark green of seagrass. It is a little clearer than the reef's (`clarity`), so the meadows show
through. The card behind the scene is a pale sea-green to match (`WATER.mangrove`). In the one
ocean, the water blends from the reef's turquoise to this teal across the open sea between them
(`docs/ocean.md`).

## Its animals

| Species | Swims | Movement |
| --- | --- | --- |
| Dugong | Slow, deep beats of the whale-like fluke, the paddle flippers steering, the heavy body barely flexing | Grazes the seagrass close in to the shore; hangs still a while, nose down; comes up to breathe every so often, lingering at the surface |
| Largetooth sawfish | Slow, sinuous sweeps of the long tail, the broad head and its saw held steady | Cruises low out over the shelf, pausing on the bottom now and then |
| Lemon shark | Easy, steady beats of the tail, a gentle weave | Patrols the shallows close to the roots; now and then two together |
| Southern stingray | Ripples the edges of its disc, a wave running back across the wings, the whip of a tail trailing | Keeps low over the sand and rests on the bottom a while |
| Tarpon | Strong, quick beats of the deeply forked tail | A small group of two to four (`GROUP_STYLES`); rolls up to the surface to gulp air |

The tiger sharks, great hammerheads (swimming as the scalloped hammerhead) and green turtles moved
here from Home's reef, where they used to swim; the West Indian manatee swims as its fellow sea cow,
the dugong. The nurse and bull sharks, the guitarfish, the seahorse and the reef squid swim as
their family's model or not yet at all.

The models and rigs are in `docs/marine-species-art.md` (batch v8); their settings in
`src/lib/marine-motion.ts`, `marine-rigs.ts` and `marine-groups.ts`.

Tests: `src/lib/__tests__/mangrove-animals.test.ts` (the island and its residents, where the
seagrass grows, the tarpon groups and lemon shark pairs, the dugong's grazing and breathing, the
tarpon's gulps of air and the stingray keeping low). `npm run verify:underwater` checks the
meadows' budget and that every blade stays under the surface.

## Known limitations

- The tide never turns: the mud and the prop roots stand at one water level.
- The dugong grazes along the seagrass but never stirs up the sand where it feeds.
- The egrets stand still.
