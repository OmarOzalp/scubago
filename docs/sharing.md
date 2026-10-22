# Sharing

A diver can share three things as a picture, 1080×1350 (4:5, a feed-friendly portrait) with the
ScubaGo name on it: their **archipelago**, one **discovery** (a species they found) and one **dive
page** from their logbook. The cards are drawn in the Reef Journal look ([design.md](design.md)):
warm paper, navy ink, Fraunces headings, a typewriter face for labels, rarity-coloured edges, ruled
lines, stamps and a watercolour wash.

The code:

- `src/components/share/`
  - `discovery-card.tsx`, `dive-log-card.tsx`, `archipelago-card.tsx`: the three cards. Each is a
    plain component drawn at its design size (1080×1350).
  - `card-kit.tsx`: what they share: the page (paper, wash, a double-ruled border, the wordmark, the
    footer line), the type, the tier label and the framed plate. `card-tile.tsx` is the small plate
    with its name; `card-art.tsx` draws a species' plate for a card.
  - `card-data.ts`: works out what goes on a card from the diver's records (and what never does).
  - `card-spec.ts`: the size, the share result and the messages, shared by the cards and the service.
  - `share-preview.tsx`: the modal that shows a card before it goes out.
  - `share-buttons.tsx`: the three Share buttons, which build a card from the records a screen
    already has.
- `src/lib/share.ts` (iOS and Android) and `src/lib/share.web.ts` (web): the share service.
- The buttons: the species page (only once the diver has shared a sighting of the species), a dive's
  page, and Home (a round button beside "customize", once the diver has a species).

## What goes on a card, and what never does

A card goes out into the world, so only what the diver has shared goes on it (`card-data.ts`):

- A sighting marked private (`visibility: 'private'`) is left out of everything: the species it found,
  the counts, the dates, the animals on a dive's page. A species the diver has only seen on a private
  sighting has no discovery card and no Share button. The preview says how many private sightings
  were left off ("1 private sighting is left off this card.").
- Sighting notes and photos are never put on a card: the cards have no place for either, so
  `notesPrivate` and `photoPrivate` need no checking.
- A dive's own notes stay off. `diveCardData(dive, site, sightings, { includeNotes: true })` and the
  card's `notes` prop are there for a diver who chooses to share them; nothing in the app sets them yet.
- No coordinates, only the site's name and region. No signatures: a buddy's name is shown only as the
  "Dived with" line the diver typed.
- Example sightings (`isDemo`) and other divers' sightings are never the diver's.
- A dive centre's stamp is drawn exactly as the dive's page draws it (same angle, ink and shape for the
  same name, `stampLook`) and keeps reading **NOT VERIFIED**: the app draws it from the name the diver
  wrote, and no centre has checked it.

A card is a picture, not a screen. It uses fixed colours (`CARD_COLORS`, never `useTheme()`), so it is
the same in light and dark mode, and its text ignores the phone's font-size setting
(`allowFontScaling={false}`), so the layout is the one that was designed. The smallest lettering is
25 to 28 px: about 9 to 10 pt when the card shows at phone width.

## The cards

Each card takes plain props, so another part of the app can draw one from its own data.

**`DiscoveryCard`** (`species`, `firstSeenOn`, `siteName?`, `collectionNumber`, `observedNote?`,
`tone?`): the species plate large in a frame edged in its rarity colour, the common name with the
scientific name in italic, the tier label in the tier's colour, "First seen 12 Mar 2026 · Ras
Mohammed", "No. 23 in my collection" (the order it joined the collection) and the area it lives in.
Epic and legendary finds are on the **twilight** page (`tone="auto"`); `tone` forces either page.
`observedNote` is a slot for a line of real data ("Recorded at 4% of Red Sea sites"), set in a sand
strip under the facts. It is left out when empty, and nothing is made up.

**`DiveLogCard`** (`number`, `siteName`, `region?`, `divedOn`, `maxDepthM?`, `bottomTimeMin?`,
`waterTempC?`, `visibilityM?`, `species`, `centreName?`, `buddyName?`, `notes?`): the dive's number in
the ruled `NO.` margin box, the site, region and day, the figures that were written (the others are
left out), the animals seen as small plates with their names (up to six; past that the sixth tile says
"+N more"), the buddy and the centre stamp. `species` is every animal seen, rarest first.

**`ArchipelagoCard`** (`name`, `rank?`, `level`, `speciesCount`, `islandsFound`, `islandsTotal?`,
`sitesDived`, `rarest`, `islands?`, `snapshot?`, `onSettled?`): the island's name, the hero picture,
level, species, islands found out of five and sites dived, and the three rarest finds as small plates.

### The hero, and the 3D snapshot

Without a `snapshot` the hero is an illustration composed from `IslandArt`: Home's island large, the
other islands the diver has found around it. With one, the picture covers the illustration once it
has loaded; if it fails to load the illustration stays.

For whoever captures the 3D scene: pass **`snapshot`** as an image URI (a `file://` path, a `data:` URI
or a `blob:` URL; anything React Native's `<Image>` can show). The hero frame is about 868×406 design pixels
(2.1:1; a little shorter when the island's name takes two lines): the image is cropped to fill it,
centred, so frame the island in the middle and leave room at the sides. 1736×812 pixels or more keeps
it sharp. `ShareArchipelagoButton` takes the same
`snapshot` prop and passes it through; Share waits until the picture has loaded or failed
(`onSettled`), so the shared PNG never has a half-loaded hero. The picture is only used, never
stored.

## Preview and share

`SharePreview` is a modal showing the card scaled to fit the screen, with **Share** (and **Download** on
the web) and **Close**, built from the app's `OceanButton`.

The card is laid out once at its full design size, inside a frame that scales it down for the eye
(`transform: scale`, origin top left). What is captured is the card's own view (the inner one, which
has no transform), so the picture is full size however small the preview is. The preview:

- shows a busy state while the picture is made ("Making your picture…", a spinner unless the phone has
  Reduce Motion on), and a polite message, also read aloud (`announce`), if it fails;
- disables Share while the card isn't ready (the hero picture still loading);
- describes the card to a screen reader as a single image (the card's own text is hidden from it);
- doesn't slide in under Reduce Motion (`AccessibilityInfo`).

## The share service

```ts
import { shareCard, saveCard, prepareCard, canSaveCard } from '@/lib/share';

const result = await shareCard(cardRef, { title: 'Share your discovery', fileName: 'scubago-reef-manta-ray' });
// result.status: 'shared' | 'saved' | 'cancelled' | 'unavailable' | 'error'; result.message for the last three
```

It never throws: the result says what happened, and `message` is a sentence for the diver. Everything it
touches is passed in (`ShareDeps`: `capture`, `isAvailable`, `share`; on the web `capture`, `nav`,
`download`, `makeFile`), so the tests run it with mocks. `src/components/share/card-spec.ts` has the
size, the messages and the helpers.

**iOS and Android** (`share.ts`):

1. `expo-sharing`'s `isAvailableAsync()`: if not, `unavailable`.
2. `react-native-view-shot`'s `captureRef(ref, { format: 'png', result: 'tmpfile', quality: 1, width, height })`.
   - Android counts the size in pixels: 1080×1350. iOS counts it in points and draws at the screen's
     scale, so it is asked for 1080÷scale (360×450 on a 3× phone) to get a 1080×1350 PNG, not 3240×4050.
     `captureSize()` works this out.
   - The capture draws the view itself, not its parents, so the preview's scale doesn't touch it.
3. `shareAsync(file://…, { mimeType: 'image/png', UTI: 'public.png', dialogTitle })`. iOS gives the
   capture as a bare path, so `file://` is put in front when it is missing.

A phone doesn't say whether the diver posted or backed out of the sheet: `shared` means the sheet was
shown and closed. The temporary file is left for the system to clear (an Android app may still be
reading it when the sheet closes). Both native modules are `require`d when first used, so a screen with a
Share button doesn't load them. There is no config plugin to add: `expo-sharing`'s plugin is only for
receiving shares, and sending needs none (Android's file provider is in the library's own manifest).

**Web** (`share.web.ts`):

1. The card's element is drawn into a canvas with **html2canvas** (the library `react-native-view-shot`
   uses on the web, installed with it) at 1080×1350. view-shot's own web capture draws a transformed
   parent at its small size and sets the text at full size inside it, so `share.web.ts` calls
   html2canvas itself and, in the copy of the page it draws from, takes the scale and clipping off the
   card's parents (`unscaleParents`). Fonts, the SVG plates, washes, stamps and gradients come out as
   they look on screen.
2. Where the browser can share files (`navigator.canShare({ files })`: Safari, Chrome on Android and
   Windows), the **Web Share API** opens its share dialog with the PNG as a `File`.
3. Otherwise (desktop Firefox and Chrome on Linux or macOS), or when the browser refuses the share, the
   PNG is **downloaded** (an anchor with `download`), and the preview says "Saved to your downloads."
4. **Download** always downloads.

Browsers want a share to start within a few seconds of the tap, and drawing a card can take longer, so
the preview draws the picture as it opens (`prepareCard`) and Share uses it. Tapping before it is ready
draws it then; a late share the browser refuses falls back to the download. html2canvas is loaded on
first use (a separate chunk), not with the app.

## Checking a change

- `npx jest src/lib/__tests__/share src/components/__tests__/share-`: the service on both platforms,
  the cards' text and privacy, the preview, the buttons and the three screens.
- To look at the cards, add a temporary route that renders each one at 1080×1350 with sample data from
  the catalogue and the seed sites, export the web build and screenshot it. A card should still read at
  a quarter of its size (the screenshot shrunk to about 540 px wide).
- Not covered by tests, and worth a pass on a device: the iOS and Android capture and share sheet
  (`captureSize` is derived from view-shot's native code, not run), and the web share dialog on Safari
  and Chrome for Android.
