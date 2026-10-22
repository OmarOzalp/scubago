# Rewards

Four kinds of reward make the logbook feel rewarding: **badges**, **collections**, a **site
passport** and **island unlocks**. All of them are worked out from the diver's sightings and dives
by plain functions in `src/lib/rewards/` (no React, store, storage or network), so the same log
always gives the same rewards, and the screens that show them only draw what they are given.

```ts
const { badges, collections, passport, islands } = evaluateRewards({ sightings, dives, sites, catalog, observed });
const fresh = newlyEarned(rememberedIds, badges); // what to celebrate now
```

## What goes in

| Input | What it is |
| --- | --- |
| `sightings`, `dives` | The diver's log, as passed: demo sightings count if the caller passes them and not otherwise |
| `sites` | Every dive site that can be named, by id: seed, the diver's own and imported ones |
| `catalog` | `CATALOG_BY_ID` |
| `observed` | Optional: species id to the rarity tier worked out from real public sightings records (iNaturalist, OBIS) |
| `regions` | Optional: defaults to `REGIONS_BY_ID` |

- A sighting of "something else" (`unlisted`) or of a species the catalog lacks never counts for a
  species reward. It still counts as a sighting, and for places.
- Days come from `sightedOn` and `divedOn`, never from when the page was written; a tie on a day
  goes to whichever was logged first (`createdAt`). The order of the input does not matter.
- Place rewards read `regionId` (walking `parentId` up to the root), `country` and the free-text
  `region`, never a site id, so the sites imported for the Great Barrier Reef and the Red Sea need
  no change here. A visit to a site missing from `sites` is left out of the places, so evaluate once
  the sites have loaded.

## Badges

Each badge result carries its definition (`id`, `title`, `description`, `kind`, `emblem`, optional
`tier` and `ladder`, and `areaId` on the badge of an area's collection, which its medal takes the area's colour and animal from) and `earned`, `earnedOn` (yyyy-mm-dd), `progress` (`have` is held at `need`
once earned) and, until earned, a `hint` for the next step ("3 more reef sharks"). `emblem` is a key
the screen maps to a picture. Rungs of a ladder share a `ladder` key and are listed easiest first.
Badge ids never change: the screen stores them to remember what it has celebrated.

| Kind | Badges | Earned when | `earnedOn` |
| --- | --- | --- | --- |
| first | First sighting; first shark, ray, turtle, sea mammal; first rare, epic, legendary find; first night dive; first wreck dive | The first sighting of any kind; of a catalog species of that category; of a species whose *effective* rarity is at least that tier; a dive of kind `night`; a dive of kind `wreck` or at a site with dive type `wreck` | The day it first happened |
| milestone | 10, 25, 50, 100 species; dive No. 1, 10, 25, 50, 100, 250, 500 | Different catalog species logged; a logged dive whose `number` (the diver's lifetime count) has reached it | The day the nth species was first logged; the day of the first dive that reached the number |
| place | 5, 10, 25, 50 dive sites; 3, 5 countries; Great Barrier Reef; Red Sea; GBR explorer and Red Sea explorer, 5, 15 and 40 sites | Distinct sites, from dives and sightings alike; distinct countries; any site in the region; distinct sites in the region | The day the nth was first visited |
| collection | One for completing each collection | Every species in it logged | The day its last missing species was first logged |

A first sighting counts a sighting of "something else", because it is the first page written, not a
species.

## Collections

A collection is a named set of species with `found` / `total`, `memberIds`, `foundIds`, `missingIds`,
`completed`, `completedOn` and a `hint`. `memberIds` is every species the catalog has for the set in
the collection's own order (an area's residents, the catalog's order for a family, the source's order
for a hand-picked set); `foundIds` and `missingIds` are its two halves, in that same order, so a screen
can lay the animals out once and paint the found ones. An area's collection also carries `areaId`.

| Kind | Sets | Members |
| --- | --- | --- |
| area | One per archipelago area (7) | The area's residents (`residentsOf`) |
| family | Sharks, rays, turtles, marine mammals, cephalopods | Every catalog species of that `category`, so new species join automatically |
| curated | Reef sharks | Grey, blacktip and whitetip reef sharks |
| | Mantas & devils | Reef manta, oceanic manta, Munk's devil ray |
| | Hammerheads | Scalloped and great hammerhead |
| | Red Sea classics | Sea goldie, Napoleon wrasse, oceanic whitetip, scalloped hammerhead, pelagic thresher, emperor angelfish, Moorish idol |

No two collections hold the same species: finishing one must not finish another and earn two
badges. (There used to be a "Wreck regulars" set that was the Shipwreck area's nine residents
again; it is gone, and the Shipwreck's collection is the area's.) A test keeps it so.

The Red Sea classics are species the seed Red Sea sites list and divers know them for, picked by
hand, not counted from records. A collection with no members in the catalog (or fewer than its
`minMembers`) is left out, along with its badge. `minMembers` defaults to 1, so a family with a
single species is still a family; a hand-picked set says what it needs: three for the Red Sea
classics, and two for the Hammerheads. The Hammerheads are a pair on purpose: the catalog has only the
scalloped and the great hammerhead, but they live on two different islands (the Volcanic Pinnacle and
the Mangroves & Seagrass), so the set is a reason to look at both, and "Hammer pair" is its badge. It
exists only while the catalog holds both, so one that loses a member drops out rather than becoming
a "set" of one.

## Site passport

Visited sites are grouped by top-level region: a site's `regionId` is walked up its `parentId` chain
to the root. A site with no region that is in a badge region (below) goes on that region's page, so
the seed Red Sea sites and imported ones share one; any other site goes on its country's.

Each group has an `id` (`region:great-barrier-reef`, `country:thailand`), a `name`, its `stamps`,
`knownSites` (the sites in the lookup in that group, visited or not, for "3 of 41") and first and
last visit days. Groups and the stamps in them are sorted most recently visited first. A stamp
holds the site, `firstVisitedOn`, `lastVisitedOn`, `visits` (distinct days across dives and
sightings), `dives` and `speciesIds` (in the order first seen). `siteStamp(siteId, input)` gives
one site's stamp for its own page.

The badge regions are a small table, `REGION_BADGES`, keyed by region id:

| Region | In it when | Otherwise |
| --- | --- | --- |
| `great-barrier-reef` | The site's region, or one above it, has that id or is named like "Great Barrier Reef" | Country Australia and region text "Great Barrier Reef" |
| `red-sea` | The same, with id `red-sea` or a name with "Red Sea" | Country Egypt, Sudan, Saudi Arabia, Jordan, Israel or Eritrea, and region text naming the Red Sea, a gulf of it, or a dive area on it (Ras Mohammed, Dahab, Marsa Alam, Hurghada and others) |

## Island unlocks

Each island in `ISLANDS` gets `unlocked`, `unlockedOn`, `raisedBy` (the species that raised it),
`blurb` (the area's words from `AREAS`), `residentsFound` / `residentsTotal`, `next` (up to three unfound residents with their effective
rarity, easiest first: lowest rarity, then catalog order) and, while locked, a `requirement` line
("Log any Kelp Forest animal, such as a Lingcod."). The rules are Home's own, so the result matches
`foundIslands`: the Coral Reef is always unlocked (and has no `unlockedOn`), and every other island
rises with the first species logged from its area. Residents are the species that swim at the island
(`islandOf`), so the Coral Reef's include the Open Ocean's and Black Sand Bay's, which have no island.

## Rarity from real data

`effectiveRarity(species, observed)` is the observed tier when there is one, else the catalog's.
Both the rare, epic and legendary firsts and the island `next` hints use it. The observed tiers come
from real public sightings records (iNaturalist, OBIS), worked out elsewhere; until they are
available every reward uses the catalog's rarity, which is set by hand, not counted from records.

## Celebrating

`newlyEarned(previousIds, badges)` returns the badges earned now that were not in `previousIds`, in
list order, and `earnedIds(badges)` gives the ids to remember. On the first run, remember what is
already earned without celebrating it. Treat the remembered ids, not a fresh evaluation, as the
record of what was earned (see below). The ids are only ever looked up, never required to exist, so
the id of a badge that has been retired (`collection-set-wreck-regulars`) just stays in the record
and never matches anything; its page, `/rewards/collection-set-wreck-regulars`, says "Badge not found".

## Where the code is

| Piece | File |
| --- | --- |
| `evaluateRewards`, `evaluate*`, and everything the screens import | `src/lib/rewards/index.ts` |
| Badge definitions, evaluation, `newlyEarned` | `src/lib/rewards/badges.ts` |
| Collections | `src/lib/rewards/collections.ts` |
| Passport and `siteStamp` | `src/lib/rewards/passport.ts` |
| Islands | `src/lib/rewards/islands.ts` |
| Regions, `REGION_BADGES`, grouping | `src/lib/rewards/places.ts` |
| The one chronological pass the rest share | `src/lib/rewards/facts.ts` |
| `effectiveRarity` | `src/lib/rewards/effective-rarity.ts` |

Tests: `src/lib/__tests__/rewards-*.test.ts` (badges, places, collections, passport, islands and the
whole call), on small hand-written logs.

## Known limitations

- Observed rarity applies to the whole log, so a new tier can earn a rarity badge for an old
  sighting, or take one away. Keep what the diver has seen celebrated, and do not revoke it.
- The Red Sea has no region in `src/data/regions.ts` yet, and the seed Red Sea sites have no
  `regionId`, so they are found by country and region text. Give the imported sites a `regionId` under
  a `red-sea` region and the text fallback stops mattering.
- The dive-number ladder (1 to 500) is not the bookplate `MILESTONES` in `src/lib/dives.ts`.
- A site missing from the lookup is invisible to places; one in no badge region and with no country
  is grouped as "Elsewhere".
- Nothing is stored: the date a badge was earned is worked out again each time, so editing or
  deleting a sighting can move or remove it.

## Screens

The screens only draw what the engine gives them: the components in `src/components/rewards/` take
`badges`, `collections`, `passport` or `islands` as props, and the routes are thin wrappers that
fetch them with `useRewards()`.

| Route | Shows | File |
| --- | --- | --- |
| `/rewards` | Totals, links to the passport and islands, then **Badges** and **Collections** (`?tab=collections` opens the second) | `src/app/rewards/index.tsx` |
| `/rewards/[badge]` | One badge in full: a large medal, the day it was earned or the progress and hint, its ladder, and a link to its collection or the passport | `src/app/rewards/[badge].tsx` |
| `/rewards/collections/[id]` | One collection: the ring, then the species found and the ones still to find, each opening its species page | `src/app/rewards/collections/[id].tsx` |
| `/rewards/passport` | The site passport: a page per region or country, a stamp per site, "3 of 41 sites stamped" | `src/app/rewards/passport.tsx` |
| `/rewards/islands` | Each island: locked or raised, residents found out of total, the requirement line, and "look for" plates | `src/app/rewards/islands.tsx` |

Entry points: a "Badges & passport" row on the Logbook tab, and "Collections" on the Field guide tab.
Both quote the real counts (`summarize` in `src/components/rewards/summary.ts`) and say nothing until
the log has loaded.

- **Badges** are medals: a scalloped rim in the tier's metal (bronze, silver, gold, with pips so colour
  is never the only cue), the emblem on a tinted face, the day earned in typewriter capitals. Firsts
  have a coral rim, places lagoon, collections twilight (an area's collection in the area's colour).
  A badge not earned yet is a dashed pencil outline with the progress inked over it as an arc, and
  "3 OF 5" underneath. Ladders are one row with their rungs along a line. `emblem` keys map to a
  Phosphor icon, or for an animal to its species plate (`emblem.tsx`).
- **Collections** are cards: a progress ring, "3 of 9 found", the hint, and the animals as small plates in
  the collection's own order (`memberIds`), found ones painted and the rest dashed pencil. A completed one
  carries a "Complete" stamp. A big collection shows its first eleven and "+N". The page for one lists
  what is found and what is still to find, each in that order.
- **The passport** draws a rubber stamp per site (`site-stamp.tsx`): double ruled, angled and inked red
  or lagoon from the site's id, with the name, the day of the first visit and the number of days visited.
  A stamp opens the site's page. Only visited sites are stamped; "of 41" is the engine's `knownSites`.
- **Islands** reuse `IslandArt` for a 2D picture (under a mist with a lock while locked), with the area's
  `blurb` under it. Each island has its own drawing (`src/components/home/island-art.tsx`): the Coral
  Reef a forested cay with a jetty in a turquoise lagoon inside a ring of reef and surf; the Kelp Forest
  a grey headland of cliffs and cypresses with sea stacks, among floating kelp on dark green water; the
  Volcanic Pinnacle a black cone steaming from its crater over cobalt water; the Mangroves & Seagrass a
  low green canopy on arching prop roots among seagrass meadows; the Shipwreck a white-sand crescent
  with a red-banded lighthouse and a broken steamer in its bight. They grow with `level` (more coral,
  trees, kelp and rocks, a wider shelf, then two islets) in at most about 250 shapes.

### Celebrating a new badge

`useNewBadges({ owner, badges, ready })` (`src/hooks/use-new-badges.ts`) keeps the ids of the badges
the diver has seen in AsyncStorage, one record per user id (`scubago:badges-seen:v1:<id>`). The first
time, with no record, it takes what is earned as seen, quietly. It returns `fresh` (earned, not yet
seen) and `markSeen()`; the record only ever grows.

The log screen (`src/app/log/new.tsx`) calls it when it opens, before anything is saved, so the record
is that of before the dive. Its saved step then shows `NewBadgesCelebration`: the medal drops in on a
sun wash (the one new badge by name and day, several together), marks them seen as it appears, and
keeps showing them on that page. "See all badges" goes to `/rewards`. The Rewards screen marks
what it showed as seen when it closes, so a badge earned some other way (a sync from another phone)
wears a "New" ribbon once. Under Reduce Motion nothing moves.

Do not call `useNewBadges` on a screen the diver reaches only after saving: with no record it would
take the new badges as already seen.

### Rarity from real data

`useRewards()` (`src/hooks/use-rewards.ts`) passes no `observed` rarity yet. When it exists, return it
from `useObservedRarity()` in that file: nothing else changes.

### Preview

For a look at the screens over a sample log without signing in, build a temporary route that runs
`evaluateRewards` over a hand-written log and renders `BadgesView`, `CollectionsView`, `PassportView`,
`IslandsView`, `BadgeDetailView` and `NewBadgesBanner` with it. The web build runs in demo mode with
none of the diver's own sightings, so the real routes show the empty state there.

Tests: `src/components/__tests__/rewards-badges.test.js` and `rewards-places.test.js` (the components, over
a small log), `src/hooks/__tests__/use-rewards.test.js` and `use-rewards-new-badges.test.js`.
