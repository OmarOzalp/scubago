# Accessibility conventions

ScubaGo should work with VoiceOver and TalkBack, with large text, without colour, and for people
who turn motion off. These are the rules the screens follow; new screens should too.

## Building blocks

| Use | For | What it gives you |
| --- | --- | --- |
| `OceanButton` | Any button with a text label | Button role, disabled state, 48pt height, optional `accessibilityLabel` |
| `FormField` | Every text input | A visible label that is also the field's accessible name, and a hint that stays visible (a placeholder disappears once you type) |
| `Segmented` | Two or three tabs | Tab roles, selected state, an outline on the selected tab |
| `announce()` (`lib/announce.ts`) | Errors, "saved", step changes | Reads the message aloud on iOS and Android. Pair it with `accessibilityLiveRegion="polite"` on the visible text, which covers the web app |
| `confirmAction()` (`lib/confirm.ts`) | Anything that can't be undone | A confirm dialog that also works in the web app |

## Rules

- **Every `Pressable` has a role** (`button`, `link`, `tab`, `checkbox`, `radio`) and, when its text
  alone is unclear out of context, an `accessibilityLabel` ("Remove Reef Manta Ray", not "✕").
- **State is in `accessibilityState`**: `selected` for tabs and chips, `checked` for checkboxes and
  radios, `disabled` for anything inert.
- **Rows read as one sentence.** A list row sets one label with everything on it (species, site,
  date, "with photo", "waiting to sync"), so the screen reader doesn't stop on five fragments.
- **Screen titles and section titles are headings** (`accessibilityRole="header"`), so they can be
  jumped between.
- **Decorative things are hidden**: species avatars next to a name, emoji used as decoration, "›"
  separators (`importantForAccessibility="no"` plus `accessibilityElementsHidden`).
- **Text is 12pt or larger**, never `allowFontScaling={false}`, and boxes use `minHeight` rather
  than `height`, so larger text grows the box instead of being clipped.
- **Contrast is 4.5:1 or better** for text. Use the theme's `text`, `textSecondary`, `danger` and
  `tint` colours (light and dark variants are in `constants/theme.ts`), and `RARITY_TEXT` /
  `STATUS_TEXT` for coloured chip text. `RARITY_COLOR`, `STATUS_COLOR` and the map pin teal are for
  rings and fills, not text. White text goes on `Ocean.primary` (`#0E7490`, 5.4:1).
- **Never colour alone.** Seen and unseen species differ by photo vs. emoji too; reached journey
  stages get a tick.
- **Touch targets are at least 44×44pt**, with `hitSlop` where the visible shape is smaller.
- **Motion respects Reduce Motion**: the 3D scene starts still (`useSceneActive`), and modals use
  `useReducedMotion()` to skip their slide or fade.
- **Anything done by a gesture has a button too**: adding a site is a button as well as a long
  press, and the map has a List view.

## The 3D island

The scene is one labelled image whose description gives the level and how many species live there.
Every animal on it is also a button in "Life around you" below. The label sits inside the scene's
error boundary, so if 3D fails, the fallback and its "Try again" button stay reachable.

## Checking

There is no automated accessibility lint yet. Before shipping a screen:

- try it with VoiceOver (Settings → Accessibility → VoiceOver) and with the largest text size
  (Settings → Accessibility → Display & Text Size → Larger Text);
- check new colours with a contrast checker against the background they sit on, in light and dark
  mode.
