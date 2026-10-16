# Reef Journal: how ScubaGo looks

ScubaGo looks like a diver's logbook that has been out on the boat: warm paper and navy ink, with
the bright colours of a reef. Headings are set in a serif, everything you read in a clean sans,
and small logbook labels in a typewriter face. Species are drawn as detailed field-guide
illustrations. It should feel crafted and calm, and stay easy to read for any diver.

## Where things live

| What | Where |
| --- | --- |
| Colours, type families, radii, shadows, spacing | `src/constants/theme.ts` |
| Text styles (`display`, `heading`, `caption`, `label`, `number`, …) | `src/components/themed-text.tsx` |
| Icons (Phosphor, duotone) | `src/components/icon.tsx` |
| Paper card, stamp, seal, wash, chip, tag, ledger, link row, icon button, progress bar and ring, screen headers, tab bar | `src/components/journal/` |
| Buttons (`primary`, `log`, `secondary`, `quiet`) | `src/components/ocean-button.tsx` |
| Species drawings | `src/lib/species-illustrations.ts` (one drawing per animal group), `src/lib/species-art.ts` (each species' drawing, colours and markings; `composeArt`), `src/components/species-art.tsx` (draws it) |

## Colour

Light is **paper**: background `#FBF6EC`, cards `#FFFDF8`, ink `#1D2B45`. Dark is **night dive**:
background `#0F1B2E`, cards `#16253D`, ink `#EEF3F8`. Both carry the same reef colours: lagoon
(main actions, links), coral (logging and celebrating), sun (new things), turquoise (progress),
twilight (the new-species moment) and stamp red. Text on a coloured fill uses `OnFill[scheme]`.
Every text pair is at least 4.5:1; check new ones before using them.

Use theme tokens through `useTheme()`; the only fixed colours are on surfaces that have their own
colour in both schemes (the island's water, the twilight page).

## Type

Each weight is its own font family, so styles set `fontFamily` (or a ThemedText `type`), never
`fontWeight` or `fontStyle`:

- **Fraunces** (serif): screen titles (`display`), section titles (`heading`), figures (`number`),
  species names on cards. Its italic (`caption`) is for scientific names and gentle notes.
- **Figtree** (sans): everything you read, buttons, tab labels.
- **Courier Prime** (typewriter): small capitals only (`label`): eyebrows over titles, form field
  labels, logbook dates. Never for sentences.

Native waits for the fonts behind the splash screen; the web build renders straight away and
swaps them in.

## Shape and surfaces

Corners are gently rounded, never bubbly (`Radius`: tags 6, buttons and inputs 10–14, cards 18).
A card is a sheet of paper on the page (`Paper`): a thin border and a soft shadow; the one card a
screen is about can be `raised`. Tappable cards (`PaperButton`) sink a point when pressed.

## Icons

Phosphor icons in their duotone weight: an ink line with a soft wash of colour. Import a new icon
into `icon.tsx` by its own path (so only used icons are bundled) and give it a plain name. The
current tab's icon sits on a watercolour wash.

## Species art

Each animal group has one detailed drawing in a 200×128 box (about fifty: requiem shark, whale
shark, hammerhead, manta, turtle, dolphin, orca, angelfish, tuna, seahorse, octopus, nudibranch and
so on), drawn from the angle people know it by: sharks, fish and whales from the side facing left,
rays, hammerheads and turtles from above with the head up. A drawing is layers of plain SVG paths:
far-side fins, the body (shaded from a darker back to a paler belly, or lit from the middle when
seen from above), the belly, markings, shade and shine, the outline, near fins, fine lines (gills,
fin rays, scales) and eyes.

A species picks its group's drawing in `species-art.ts` and paints it with its own palette (back,
belly, an accent for fins or patches, fin tips) and pattern (spots, bands, bars, mottling, rings…),
kept inside the body outline. Fine lines are left off small plates; a species still to find is a
dashed pencil outline of the same drawing.

To check drawings, render the preview sheet (see the comment at the top of
`species-illustrations.ts`), which draws them through the same `composeArt` as the app.

## Motion

Calm and crafted, and only where it means something: a stamp thunks onto a record, a progress bar
inks itself in, a new species' card turns over, bubbles rise behind it. Everything is off under
Reduce Motion (`useReducedMotion()`), where things simply appear in place.

## Navigation

Five tabs drawn by the app on every platform: Home, Explore, the raised coral **Log dive** button,
Logbook and Field guide (`src/components/journal/tab-bar.tsx`). Tab screens use
`<Screen tab>`, which leaves room for the safe area at the top and the raised button at the
bottom.
