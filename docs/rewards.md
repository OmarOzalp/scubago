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
`tier` and `ladder`) and `earned`, `earnedOn` (yyyy-mm-dd), `progress` (`have` is held at `need`
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

A collection is a named set of species with `found` / `total`, `foundIds`, `missingIds`, `completed`,
`completedOn` and a `hint`. Members are listed in the collection's own order.

| Kind | Sets | Members |
| --- | --- | --- |
| area | One per archipelago area (7) | The area's residents (`residentsOf`) |
| family | Sharks, rays, turtles, marine mammals, cephalopods | Every catalog species of that `category`, so new species join automatically |
| curated | Reef sharks | Grey, blacktip and whitetip reef sharks |
| | Mantas & devils | Reef manta, oceanic manta, Munk's devil ray |
| | Hammerheads | Scalloped and great hammerhead |
| | Wreck regulars | The Shipwreck's residents |
| | Red Sea classics | Sea goldie, Napoleon wrasse, oceanic whitetip, scalloped hammerhead, pelagic thresher, emperor angelfish, Moorish idol |

The Red Sea classics are species the seed Red Sea sites list and divers know them for, picked by
hand, not counted from records. A collection with no members in the catalog (or fewer than its
minimum: three for the Red Sea classics) is left out, along with its badge.

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
`residentsFound` / `residentsTotal`, `next` (up to three unfound residents with their effective
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
record of what was earned (see below).

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
- The Wreck regulars and the Shipwreck area are the same nine species today, so completing one
  completes the other, with two badges.
- The dive-number ladder (1 to 500) is not the bookplate `MILESTONES` in `src/lib/dives.ts`.
- A site missing from the lookup is invisible to places; one in no badge region and with no country
  is grouped as "Elsewhere".
- Nothing is stored: the date a badge was earned is worked out again each time, so editing or
  deleting a sighting can move or remove it.
