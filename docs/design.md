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
| Species plates | `src/lib/plates/` (one engraved plate per species; see [species-plates.md](species-plates.md)), `src/components/species-art.tsx` (draws it). Divers' own species fall back to the group drawings in `src/lib/species-illustrations.ts` and `src/lib/species-art.ts` |

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

Every species in the catalogue has its own plate, drawn like a hand-tinted engraving in an old field
guide: fine tapering engraved lines for shading, muted washes of colour that keep dark animals dark,
a confident ink outline and a bright eye. Each plate shows the animal from the angle that shows what
makes it that species (the whale shark's broad flat head and checkerboard of spots, the great
white's pointed conical snout, the hammerhead's head from above, the coconut octopus in its shell),
so a diver can tell what it is without reading the label. A species still to find is the same plate
as a dashed pencil outline; fine detail is thinned out on small plates.

Plates are built from code in `src/lib/plates/` (builders for sharks, rays, turtles, bony fish, eels,
cephalopods and the rest, with each species' field marks in `species/`), drawn into a 200×128 box and
rendered by `SpeciesArt` with react-native-svg. [species-plates.md](species-plates.md) explains how
they are made, how each group is told apart, and how to review a change (`npm run plates:sheet`).

A species a diver adds themselves has no plate and keeps its group's drawing from
`species-art.ts`, painted in its colours.

## Motion

Calm and crafted, and only where it means something: a stamp thunks onto a record, a progress bar
inks itself in, a new species' card turns over, bubbles rise behind it. Everything is off under
Reduce Motion (`useReducedMotion()`), where things simply appear in place.

## Navigation

Five tabs drawn by the app on every platform: Home, Explore, the raised coral **Log dive** button,
Logbook and Field guide (`src/components/journal/tab-bar.tsx`). Tab screens use
`<Screen tab>`, which leaves room for the safe area at the top and the raised button at the
bottom.
