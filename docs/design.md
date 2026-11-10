# Tide: ScubaGo's design system (v2)

ScubaGo should look like a calm, careful product: crisp, consistent and rounded, with the ocean as its
identity (the island, lagoon teal, coral for logging, navy ink). Every screen is built from **one set of
tokens** and **one set of primitives**; a screen never invents its own size, colour or style.

Open **`/design`** (not linked from the app) to see every primitive in its states, in the scheme the
phone is in. Look at it, light and dark, before and after changing a primitive.

## Rules

1. **One of each.** One page colour, one card, one row, one button family, one chip, one input, one
   header pattern. If a screen needs something new, add it to `src/components/ui/` and the gallery.
2. **A surface is lifted by colour and a soft shadow, never a border and a shadow together.** In dark,
   cards have a hairline and no shadow.
3. **Colour carries meaning.** Lagoon = act. Coral = log a dive (only). Sun = new. Rarity colours =
   rarity. Nothing else is coloured.
4. **Serif only where the app speaks as a title**: screen titles, the name on a detail page, big figures.
   Everything you tap or read is Figtree. Italic Fraunces only for scientific names.
5. **A 4-pt grid, and every value from a token.** No literal `fontSize`, `fontFamily`, `borderRadius`,
   hex colour or `boxShadow` in a screen or component: `src/__tests__/design-tokens.test.js` fails on them.
6. **Calm motion.** 120 to 200 ms, eased, nothing bounces; nothing moves under Reduce Motion.
7. **44 to hit**, always (a chip looks 36 and is 44; an icon button looks 40 and is 44).
8. **No text cut mid-word.** Two lines and an ellipsis at the end, or let it wrap.

## Tokens (`src/constants/theme.ts`)

| Token | What |
| --- | --- |
| `Colors[scheme]` | `background` (page: sea mist `#F3F6F8` / night `#0B1524`), `backgroundElement` (cards, rows, inputs, bars), `backgroundSelected` (pressed, sunken fills), `cardBorder` / `rule` (hairlines), `text`, `textSecondary`, `textTertiary` (placeholders, chevrons; never essential text), `tint` (links, coloured text), `lagoon` + `lagoonSoft`, `coral` + `coralSoft`, `sun` + `sunSoft`, `danger` + `dangerSoft`, `turquoise` (progress), `twilight`, `deep`, `stamp`, `wash`. Contrast figures are in the comments. Read them with `useTheme()`. |
| `OnFill[scheme]` | Text on a filled colour (`lagoon`, `coral`, `sun`, `ink` for a navy chip…). |
| `TypeScale` | `display` 30/36 serif, `title` 22/28 serif, `figure` 28/32 serif, `headline` 17/22, `body` 16/22, `bodyStrong` 16/22 (600), `button` (700), `callout` 15/20, `subhead` 14/19, `subheadStrong` 14/18, `footnote` 13/18, `footnoteStrong` 13/18, `scientific` (italic serif, callout size), `hero` (display x1.4, reward screens only). Nothing under 13. |
| `Space` | `s1` 4, `s2` 8, `s3` 12, `s4` 16, `s5` 20, `s6` 24, `s8` 32, `s12` 48. Gutter 16; sections 32 apart; a section's header 12 above its content; sibling cards 12 apart; card padding 16; row padding 12. |
| `Radius` | `sm` 10 (tags, thumbnails, icon tiles), `md` 14 (buttons, inputs, art tiles), `lg` 20 (cards, grouped lists), `xl` 28 (sheets, hero panels), `pill`. |
| `Size` | `hit` 44, `buttonLg` 52, `buttonMd` 44, `input` 52, `chip` 36, `rowMin` 56, `iconButton` 40, `iconTile` 40, `thumb` 44, `icon` 22, `iconBar` 24. |
| `Elevation[scheme]` | `card` and `raised` shadows (`raised` for what floats: the Log button, sheets, a card over the map). |
| `Motion` | `press` 120 ms, `standard` 200 ms, the easing, and the 0.98 press scale. |
| `OnWater` | Ink and veil for text over the island scene's own water (the same in both schemes). |

`ThemedText` takes the scale's names (`<ThemedText type="headline">`). The old names still compile and
draw as v2 styles: `small` = subhead, `smallBold` = subheadStrong, `heading` = headline, `caption` =
callout, `label` = footnoteStrong (secondary), `number` = figure, `subtitle` = title. New code uses the
new names.

## Primitives (`src/components/ui/`)

Import each from its own file (`@/components/ui/button`), or several from `@/components/ui`. Each is
typed, named for screen readers, 44 to hit, and drawn for light and dark.

| Primitive | Props (the main ones) | Use |
| --- | --- | --- |
| `Screen` | `kind` `'tab' \| 'pushed' \| 'modal'`, `scroll`, `contentStyle`, ScrollView props | Every screen. Page colour, safe areas, 16 gutter, 16 between blocks, room for the tab bar. |
| `ScreenTitle` | `title`, `subtitle?`, `actions?` (IconButtons), `accessory?` (beside the title) | A screen's `display` title; actions centre on its first line. A pushed page prints it 8 under the bar. |
| `Section` | `title`, `action?` `{ label, onPress, accessibilityLabel? }`, `accessory?`, `flush?` | A headline over content, 12 above it, 32 from what came before (`flush` drops the extra 16). |
| `Card` | `padded`, `level` `'card' \| 'raised'`, `onPress?`, a11y props, `style` | The one card. With `onPress` it is one button and scales to 0.98. |
| `List`, `ListRow` | Row: `title`, `subtitle?`, `subtitleLines`, `meta?` `{ text, color }`, `leading?` (icon name for a 40 tile, or a 44 thumbnail node), `trailing?` (`'chevron'` default, `'none'`, a node), `value?`, `switchValue?`, `onPress`, `selected`, `position?` | One grouped card of rows with inset hairlines. Replaces "a bordered card per row". In a FlatList give each row its `position` (`first`/`middle`/`last`/`only`). A switch row is one switch. |
| `IconTile` | `icon`, `tone` `'lagoon' \| 'coral' \| 'sun' \| 'neutral'`, `size` | The 40 tile at the start of a row (soft fill, icon in tint). |
| `Button` | `title`, `onPress`, `variant` `'primary' \| 'log' \| 'secondary' \| 'plain' \| 'destructive' \| 'destructivePlain'`, `size` `'lg' \| 'md'`, `icon?`, `loading?`, `disabled?` | The one button family. `log` only for logging a dive. Stretches in a column, sizes to its label in a row. |
| `IconButton` | `icon`, `onPress`, `accessibilityLabel` (required), `on` `'page' \| 'bar'`, `disabled?` | 40 round, 44 to hit. `page`: white with a card shadow; `bar`: plain, on a bar or a card. |
| `Chip`, `ChipRow` | Chip: `label`, `selected`, `onPress`, `count?`, `dot?`, `scheme?`. Row: `accessibilityLabel`, `fade?`, `centered?`, `ref` | The one chip (pill 36; selected is filled with the ink colour). A ChipRow scrolls sideways to the screen's edges with a soft fade. |
| `Segmented` | `options`, `value`, `onChange`, `accessibilityLabel`, `kind` `'tabs' \| 'choice'` | Sunken track, white thumb. |
| `TextField` | `label`, `helper?`, `error?`, TextInput props | Label above, 52 high, tint ring while focused, error announced. |
| `SearchField` | `value`, `onChangeText`, `placeholder`, `onSubmit?`, `onCancel?`, `onPress?` (a button that opens the search) | Sunken, no border, magnifier, a clear button once something is typed. |
| `Tag` | `label`, `tone` `'neutral' \| 'lagoon' \| 'coral' \| 'sun' \| 'danger'`, or `color` + `text` (rarity), `dashed?` | A 24 pill naming a state. "New" is `tone="sun"`. |
| `ProgressBar`, `ProgressRing` | `fraction`, `accessibilityLabel`, `max`, `now` (bar); `label?` (ring) | 6 high, turquoise on a sunken track. |
| `Notice` | `children`, `icon?`, `onDismiss?` | A banner on sunSoft that the diver can close. |
| `EmptyState` | `icon`, `title`, `message?`, `action?` | A 56 tile, a headline, one line, one button. No dashed boxes. |
| `TabBar` | (expo-router's tab bar props) | White bar, hairline, 24 icons, selected in tint with a filled icon, the raised coral Log circle. |
| `SpeciesCard` (`src/components/species-card.tsx`) | `species`, `width`, `count`, `isNew?`, `onPress` | A square art tile (seen: soft rarity tint; still to find: sunken, pencil outline), the rarity dot, a "New" tag on the corner, and the name in two lines that never break inside a word. Grids use `useCardGrid` and `CARD_GAP`. |

Helpers: `useSurface()` (the card surface as a style, for a surface that isn't a Card, such as the map's
frame), `usePressScale()` (press feedback for a custom pressable), `continuous` (iOS squircle corners).

The old journal pieces (`journal/chip`, `journal/tag`, `journal/progress-bar`, `journal/icon-button`,
`journal/paper`, `ocean-button`, `segmented`, `NewBadge`, `journal/tab-bar`) now draw as the primitives
above, so unmigrated screens already lose border-plus-shadow cards and outlined buttons. Don't use them in
new code; `LinkRow` and `ScreenHeader`/`SectionHeader` still exist for unmigrated screens.

## How to build (or migrate) a screen

1. Wrap it in `<Screen kind=…>` and start with a `ScreenTitle` (tab screens and pushed pages) or rely on
   the stack's bar title (modals). Stack options live in `src/app/_layout.tsx`: page-colour bar, no
   shadow, a back chevron, a Figtree headline for a modal's title; a pushed page sets `headerTitle: ''`
   and prints its own `ScreenTitle`.
2. Group content into `Section`s; lists of things are one `List` of `ListRow`s, never a card per row.
3. Use `Button` for actions (one primary per screen at most), `Chip`s in a `ChipRow` for filters,
   `SearchField` / `TextField` for input, `Tag` for states, `EmptyState` when there is nothing yet.
4. Text: `ThemedText` with a scale name, or `TypeScale.x` spread into a style. Colours from `useTheme()`.
   Spacing from `Space`, sizes from `Size`, radii from `Radius`.
5. Take the file off `src/__tests__/design-tokens.allowlist.json` (the test fails while a clean file is
   still listed), keep accessible names and test ids as they were, and run the screen's tests.
6. Look at it: build the web app and screenshot it light and dark (`/design` too). Check alignment to
   the grid, gutters, no text cut mid-word, equal card heights, no border with a shadow, the title's place.

## What stays its own

Drawing code keeps its own fixed sizes and colours and is exempt from the token test: the 3D scenes
(`src/components/home/three/`), the species plates and art (`src/lib/plates/`, `species-art.tsx`,
`island-art.tsx`), the share cards (`src/components/share/card-*`, their fixed `CARD_COLORS` keep the
paper look), the passport stamp motif (`journal/stamp.tsx`), badge emblems and medals.

## Species art

Every species has its own plate, drawn like a hand-tinted engraving (see [species-plates.md](species-plates.md));
a species still to find is the same plate as a pencil outline. On a `SpeciesCard` the plate sits on its
tile; a diver's own species keeps its group's drawing.

## Navigation

Five tabs drawn by the app on every platform: Home, Sites, the raised coral **Log** button, Logbook and
Field guide (`TabBar`). The Logbook keeps its book of paper sheets on a desk
(`src/components/logbook/`); it is drawn, like the stamps, and is not a list screen.
