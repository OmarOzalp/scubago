# Rarity from encounters

Each of the 120 catalogue animals has a tier (common, uncommon, rare, epic, legendary). The tier was
assigned by hand. It is now worked out from **how often the animal is recorded at dive sites in its own
waters**, using **iNaturalist** (research-grade observations) and **OBIS** (the Ocean Biodiversity
Information System). A build-time script asks both about every dive site in `src/data/sites.ts`,
once, and bundles the answer. Nothing is asked on the phone, so the tiers do not depend on what a device
happens to have cached.

**Status (22 October 2026): run live against both services, tiers applied.** 69 dive sites (the seeded
ones), 106 of 120 animals tiered, 14 left on their hand-assigned tier. It passes the sanity check below
with caveats that are listed under [Biases and limits](#biases-and-limits). The OpenStreetMap import has
not run yet (`src/data/osm-sites.json` is empty), so the sample is the 69 seeds; see
[Rerunning after the OpenStreetMap import](#rerunning-after-the-openstreetmap-import).

How this relates to the per-site client: [real-sightings.md](real-sightings.md) summarises what is
recorded near *one* dive site, on the phone. Its `observed-rarity.ts` tiers an animal by the share of the
sites the diver has opened. This is the same idea (a share of dive sites) computed once, at build time,
over every site and restricted to where the animal lives.

## What the tiers mean

A tier says **how often the animal is recorded near dive sites in its own waters, compared with the other
animals in the catalogue.** It is a ranking, not a probability of seeing the animal on a dive, and not a
conservation status. The animals that have a share are ranked by it and cut into percentile bands, most
often recorded first:

| Tier | Share of the ranked animals | Of the 106 ranked today | Hand-assigned (same 106) |
| --- | --- | --- | --- |
| Common | the most recorded 28% | 30 | 32 |
| Uncommon | the next 21% | 22 | 22 |
| Rare | the next 26% | 28 | 29 |
| Epic | the next 15% | 15 | 14 |
| Legendary | the least recorded 10% | 11 | 9 |

The 14 animals without a share keep their hand-assigned tier, so the app shows 31 common, 25 uncommon, 30
rare, 20 epic and 14 legendary (hand-assigned: 33, 25, 31, 19, 12). 64 of the 106 tiers differ from the
hand-assigned ones: 24 are one tier more common, 5 are two more common and 1 is three more common; 22 are
one tier rarer and 12 are two rarer.

## Why worldwide counts are not the tier

The first version ranked the 120 animals by **worldwide** iNaturalist observations and observers and OBIS
records. That measures how much an animal is photographed, tracked and surveyed, not how likely a diver is
to meet it. The run on 22 October 2026 (`src/data/real-rarity.json`, kept as evidence) put the whale shark
among the *most* recorded animals in the catalogue:

| Animal | iNaturalist observations (observers) | OBIS records | Worldwide rank gave | Hand-assigned |
| --- | --- | --- | --- | --- |
| Whale Shark | 2,654 (1,668) | 17,225 | Common | Legendary |
| Humpback Whale | 41,225 (13,719) | 534,792 | Common | Legendary |
| Orca | 10,965 (5,178) | 34,364 | Common | Legendary |
| Sperm Whale | 3,320 (1,704) | 115,740 | Common | Legendary |
| Leatherback Turtle | 1,915 (1,188) | 24,931 | Common | Legendary |
| Great White Shark | 1,266 (561) | 14,957 | Uncommon | Legendary |
| Dugong | 970 (475) | 21,520 | Uncommon | Legendary |
| Palette Surgeonfish (Blue Tang) | 661 (398) | 1,024 | Epic | Common |
| Spotted Garden Eel | 645 (296) | 778 | Epic | Common |

Everyone photographs a whale shark and almost nobody photographs a garden eel, but a diver on a reef in
the Indo-Pacific meets the eel far more often. 90 of the 120 tiers changed, mostly the wrong way. So those
counts are **not** used as tiers. They are kept as supporting evidence: the species page shows them on a
second line ("2,654 iNaturalist observations and 845 OBIS records worldwide"), and the file keeps a log
score of them (`score`) for anyone who wants a ranking of how recorded an animal is. `REAL_RARITY`, and
so `CATALOG`, never read that file's score; `real-rarity.json` carries no `tier` field.

## The method

For every dive site in `SITES` (`src/data/sites.ts`; any list, whatever its size):

1. **Ask.** iNaturalist `observations/species_counts` within **5 km** of the site (research grade,
   `verifiable`, the marine iconic groups, the `iconic_taxa` filter of `src/lib/external-sightings/inaturalist.ts`),
   read up to 20 pages of 200 taxa, and the OBIS `checklist` for a box of the same radius around the
   site (`size=1000`, `obis.ts`). Both go through `buildSiteSightings`, the code the app uses for a
   site's page, so taxa are matched to catalogue ids by the existing name matcher and synonym table, and
   a subspecies row is not counted twice. The script adds three names the synonym table does not know
   (see [Names](#names)).
2. **Recorded.** An animal is *recorded* at a site when **at least 3 records** from one source are
   near it: three iNaturalist observations, or three OBIS records. The two sources are not added up,
   because OBIS holds iNaturalist's observations too.
3. **Used sites.** A site is used only if its sources listed at least **20 species-level taxa** (marine
   animals of any kind, not only the catalogue's). A site where nearly nothing is recorded says nobody
   posts there, not that the animals are absent: a lake, a quarry, a remote reef.
4. **Basin.** Each used site is put in one of seven ocean basins by latitude and longitude (below).
5. **Its waters.** An animal's waters are the basins where it is recorded at a used site, **plus** the
   basins of every site that lists it in `notableSpecies` (the app's own curation, so an animal the data
   never records is still placed where it is known to live). Only basins with a used site count.
6. **Share.** (used sites in its waters where it is recorded) ÷ (used sites in its waters).
7. **Enough sites.** An animal needs at least **5** used sites in its waters. Otherwise it is
   *unresolved*, keeps its catalogue tier, and the file lists it with the reason. An animal with no
   waters at all (recorded nowhere, notable nowhere) is unresolved too: no data is not rarity.
8. **Tier.** Animals that have a share are ranked and cut into percentile bands (below).

### The radius

5 km. A dive boat anchors, a diver surfaces and a photograph is geotagged within a few kilometres of the
site's marker (site coordinates are marker-precision, not navigation-precision), and a much wider circle
would start counting the next reef and the open sea between. The in-app client uses 3 km; the build uses
5 km because the markers are approximate and because a build can afford the extra pages. It is a
constant (`DEFAULT_RADIUS_KM`, `--radius`), recorded in the output (`method.radiusKm`). Radius 5 was not
compared with other radii: a different one needs a new run, and the shares of animals recorded at only a
handful of sites move with it. The OBIS box is a square that holds the circle (about 27% larger in area).

### The basins

Explicit latitude and longitude rules (`basinOf` in `src/lib/encounter-rarity.ts`), tried in this order.
The limits are the poleward edge of tropical water, not of the tropics. Sites in a lake or quarry fall
into whichever rule their coordinates meet and are dropped by the used-sites rule.

| Basin (id) | Rule | Used sites today |
| --- | --- | --- |
| Tropical Eastern Pacific (`tropical-east-pacific`) | 6 S to 27 N, east of 140 W, on the Pacific side of the Americas | 6 |
| Tropical West Atlantic and Caribbean (`tropical-west-atlantic`) | 25 S to 32.5 N, 98 W to 30 W, on the Atlantic side of the Americas | 11 |
| Tropical Eastern Atlantic (`tropical-east-atlantic`) | 18 S to 27 N, 30 W to 20 E | 0 |
| Tropical Indo-Pacific, Red Sea included (`tropical-indo-pacific`) | 32 S to 30 N, east of 20 E or west of 140 W | 42 |
| Temperate and cold North Pacific (`temperate-north-pacific`) | what is left, north of the equator, east of 100 E or west of 100 W | 4 |
| Temperate and cold North Atlantic with the Mediterranean (`temperate-north-atlantic`) | what is left, north of the equator, between 100 W and 100 E | 2 |
| Temperate and cold southern waters (`temperate-southern`) | what is left, south of the equator | 2 |

"The Pacific side of the Americas" is west of 98 W, or the South American coast south of 8.4 N and west of
66 W, or south of a line across Central America through ten points from the Isthmus of Tehuantepec to the
Panama–Colombia border (`AMERICAS_DIVIDE`). It is coarse there (tens of km), and far from the isthmus it
decides nothing. The consequences worth knowing: Aliwal Shoal and Protea Banks (30 S) are Indo-Pacific,
because the warm Agulhas current reaches East London (33 S), while Cape Town, Sydney, the Poor Knights and
Rapid Bay are temperate; the Red Sea runs to 30 N, and the Mediterranean (north of 30.5 N) is North Atlantic;
California's kelp (33 N) and Japan north of 30 N are North Pacific; Bermuda is Caribbean, Charleston is
not. The tests (`src/lib/__tests__/encounter-rarity.test.ts`) check 83 real places against these rules.

### The tiers

**Percentile bands, not absolute thresholds.** A share is a count over a small number of sites (6 of 11
Caribbean sites, 15 of 42 Indo-Pacific ones), so it moves a lot with what happens to be in the site list,
the radius and how many people post to iNaturalist near each site. An absolute cut ("common from 40%")
would move every animal's tier whenever the site list grew, and 69 seeds make a poor place to calibrate
one. A rank is more honest about what the number can carry: *more or less often recorded than the other
animals here*. It also keeps what the rewards and the collection were built for, a catalogue where about
one animal in ten is legendary. The bands are the hand-assigned shares rounded to whole percents
(`RARITY_BANDS`: 28, 21, 26, 15, 10), cut at `round(cumulative % × n / 100)` of the n animals that have a
share (for 106 animals, after the 30th, 52nd, 80th and 95th).

The price is that the bands say nothing absolute: the legendary tenth is the least recorded tenth *of what
was measured*, whatever the shares are. The share and the sites are therefore always shown with the tier
("Rare: recorded near 6 of 41 Indo-Pacific dive sites"), so the number behind a tier is visible.

**Ties take the tier at the middle of their block** (the mid-rank). Many animals share a share (a count
over 42 sites has few values), and three animals are recorded at none of the sites in their waters. The
old rule for worldwide counts, "ties take the commoner tier", would put a block of never-recorded animals
in the band where the block *starts*, which can be well above legendary. The mid-rank is symmetric and
does not depend on the order of the ties. With fewer than 20 ranked animals nobody is tiered, because
percentiles of three animals mean nothing.

What the bands came to on 22 October 2026:

| Tier | Share of the sites in an animal's waters | Animals |
| --- | --- | --- |
| Common | 45% to 91% | 30 |
| Uncommon | 26% to 42% | 22 |
| Rare | 11% to 26% | 28 |
| Epic | 6.5% to 10% | 15 |
| Legendary | 0% to 4.8% | 11 |

(A tier's edges overlap by rounding and by the mid-rank of ties: two animals at 26% can sit either side
of a cut.)

## The sanity check

The question: does the metric measure how likely a diver is to meet the animal, or only how much it is
photographed? Two lists of animals whose standing nobody argues about (`scripts/real-rarity/sanity.ts`,
printed by every run). They judge a result and are never an input. **No tier was adjusted to pass.**

- Iconic big animals divers rarely meet: whale shark, humpback, sperm whale, orca, great white, basking
  shark, dugong, leatherback, oceanic manta, mola mola. They should mostly be **rare or rarer**.
- Reef staples in their waters: clownfish, blue tang (palette surgeonfish), moorish idol, giant moray,
  lionfish, French and queen angelfish. They should mostly be **common or uncommon**.

"Mostly" is two thirds of the animals that have a tier.

| Animal | Its waters | Recorded near | Share | Tier | Hand-assigned | First version (1 record) |
| --- | --- | --- | --- | --- | --- | --- |
| Whale Shark | Indo-Pacific, Eastern Pacific, Southern temperate | 11 of 50 | 22% | **Rare** | Legendary | Uncommon (28/61) |
| Humpback Whale | Indo-Pacific, Eastern Pacific, North Pacific, North Atlantic | 14 of 54 | 26% | **Rare** | Legendary | Rare (22/67) |
| Sperm Whale | Caribbean | 1 of 11 | 9% | **Epic** | Legendary | Legendary (4/55) |
| Orca | Eastern Pacific, North Pacific, North Atlantic | 5 of 12 | 42% | **Uncommon** | Legendary | Uncommon (10/25) |
| Great White Shark | Indo-Pacific, North Pacific | 3 of 46 | 7% | **Epic** | Legendary | Epic (7/54) |
| Basking Shark | none: recorded nowhere | | | unresolved, keeps Legendary | Legendary | Legendary (1/42) |
| Dugong | Indo-Pacific | 3 of 42 | 7% | **Epic** | Legendary | Epic (7/42) |
| Leatherback Turtle | Caribbean | 1 of 11 | 9% | **Epic** | Legendary | Rare (2/11) |
| Oceanic Manta Ray | Indo-Pacific, Eastern Pacific, Southern temperate | 5 of 50 | 10% | **Epic** | Epic | Rare (13/50) |
| Ocean Sunfish (Mola Mola) | Indo-Pacific, North Pacific | 6 of 46 | 13% | **Rare** | Epic | Rare (11/54) |
| Ocellaris Clownfish | Indo-Pacific | 15 of 42 | 36% | **Uncommon** | Common | Uncommon (17/42) |
| Palette Surgeonfish (Blue Tang) | Indo-Pacific | 11 of 42 | 26% | **Uncommon** | Common | Rare (17/53) |
| Moorish Idol | Indo-Pacific, Eastern Pacific | 35 of 48 | 73% | **Common** | Common | Common (40/48) |
| Giant Moray | Indo-Pacific, Eastern Pacific | 30 of 48 | 63% | **Common** | Common | Common (36/48) |
| Red Lionfish | Indo-Pacific, Caribbean | 37 of 53 | 70% | **Common** | Common | Common (42/53) |
| French Angelfish | Caribbean | 10 of 11 | 91% | **Common** | Common | Common (10/11) |
| Queen Angelfish | Caribbean | 7 of 11 | 64% | **Common** | Uncommon | Common (10/11) |

**Result: 8 of the 9 iconic animals that have a tier are rare or rarer (the orca is uncommon; the basking
shark has no tier), and all 7 staples are common or uncommon. It passes.** What it does not do:

- The orca is *uncommon*, and the whale shark is only *rare*. Both are recorded repeatedly near the sites
  where they live (orcas near Monterey, La Jolla, Skjervøy and the Galápagos, whale sharks near Thailand's
  and the Maldives' pinnacles). That is what the metric measures, and it is more than a diver's chance of
  meeting one. See [Biases and limits](#biases-and-limits).
- The hand-assigned tiers are not the standard. They put the whale shark and the orca in the legendary
  tier by reputation. The data says they are among the more often recorded of the big animals near dive
  sites. The tiers are the ranking of the data, and the species page shows the numbers behind each.

### How the method got here

The method was run three times on the live records. The first version was exactly the one asked for;
the records it needs are cheap to recompute offline from the per-site file
(`--input src/data/encounter-rarity.sites.json --dry-run`), so each variant can be reproduced.

1. **One record is enough** (`--min-records 1`), both sources. 8 of 10 iconic animals rare or rarer and 6 of 7
   staples common or uncommon: it passes the two-thirds rule. But a single stray record counts as much
   as hundreds. The whale shark was **uncommon** (28 of 61 sites: a one-off OBIS row at most of them) and
   the blue tang was *rare*.
2. **At least 3 records from one source** (shipped). The whale shark moves to rare (11 of 50), the blue
   tang to uncommon, and 8 of 9 and 7 of 7 pass. The number 3 is the least that says "repeatedly" rather
   than "once"; it was chosen after seeing run 1, for that reason, and applies to every animal alike. The
   orca stays uncommon.
3. **Other sources, same 3 records** (not shipped): iNaturalist alone gives the whale shark 6% (epic) and
   leaves 19 animals unresolved; OBIS alone gives the humpback uncommon and the orca common. All variants
   pass the two-thirds rule, so the result does not hang on one source; the combined one ranks the iconic
   animals best and leaves the fewest animals unresolved.

The radius (5 km) and the basins were not varied. A larger or smaller radius needs a new run of the script
(`--radius`), and the shares of animals recorded at a handful of sites move with it.

## Who gets a tier

Of the 120 animals, 106 have a tier and 14 are unresolved. Unresolved animals keep their catalogue tier in
the app, and are listed in the file with the reason:

- No site records it and none lists it as notable (three animals: basking shark, largetooth sawfish, giant guitarfish).
- Fewer than 5 used sites in its waters: only 4 in the North Pacific (six animals: harbor seal, sea otter,
  garibaldi, giant sea bass, lingcod, giant Pacific octopus) and only 2 in the southern temperate basin
  (five: shortfin mako, marbled electric ray, leafy and weedy seadragons, giant cuttlefish). These are the
  cold-water animals; the seeds hold few cold-water sites.
- A site list with fewer than 20 animals having a share gives no tier at all.

An animal recorded at *none* of the used sites in its waters has a share of 0 and is tiered (munk's devil
ray, olive ridley turtle and marine iguana are legendary at 0 of 6, 0 of 42 and 0 of 6). That is "not
recorded at any of these sites", not "never recorded".

Never tiered: the "unlisted" id.

## Running it

```
NODE_USE_ENV_PROXY=1 NODE_NO_WARNINGS=1 npx tsx scripts/real-rarity/encounters.ts     # or: npm run fetch:encounter-rarity
```

`NODE_USE_ENV_PROXY=1` makes Node's `fetch` use the environment's proxy; leave it out on a machine with
direct access. It needs network access to `api.inaturalist.org` and `api.obis.org`. About 3.8 requests a
site (a busy coast needs several pages of iNaturalist taxa), so the 69 seeds take around **6 minutes**.

| Option | Meaning |
| --- | --- |
| `--input <file>` | Recompute from a saved per-site file (`encounter-rarity.sites.json`) or a checkpoint, with no network. |
| `--out <file>` | Where to write the tiers. Default `src/data/encounter-rarity.json`. The per-site records go beside it (`<out>.sites.json`), the checkpoint is `<out>.partial.json`. |
| `--dry-run` | Print the summary and the sanity table; write nothing, not even a checkpoint. |
| `--fresh` | Ignore a checkpoint and start over. |
| `--radius <km>` | Search radius (default 5). |
| `--no-obis` | Ask iNaturalist only. |
| `--presence either\|inaturalist\|obis` | Which source makes an animal recorded (offline, among the sources the file holds). |
| `--min-records <n>` | Records that make an animal recorded at a site (default 3). |
| `--min-site-taxa <n>` | Taxa a site must list to be used (default 20). |
| `--min-sites <n>` | Used sites an animal's waters must hold (default 5). |
| `--max-pages <n>` | Pages of 200 iNaturalist taxa read per site (default 20). |
| `--only <site ids>` | Ask about just these sites; a dry run unless `--out` is given. |
| `--allow-incomplete` | Write the files even if some sites could not be asked; they are left out. |
| `--contact <text>` | An email or URL for the User-Agent (or set `REAL_RARITY_CONTACT`). |

**Politeness.** One request at a time, at least **1.1 s** between starts (the iNaturalist guideline is about
one a second; OBIS publishes no figure, so it gets the same). A **429** waits for `Retry-After`; a 5xx, a
time-out (30 s) or a dropped connection waits 5 s, doubling, for up to 5 tries. A site that still fails is
left for the next run; five in a row stops the run. The client and queue are those of the worldwide script
(`scripts/real-rarity/client.ts`, `src/lib/external-sightings/queue.ts`).

**Resume.** After each site the script saves `<out>.partial.json` (gitignored: `src/data/*.partial.json`).
Run it again and it skips the sites already asked. The checkpoint is deleted when the files are written. A
checkpoint made with another radius, page limit or source set is refused.

**Offline.** `--input src/data/encounter-rarity.sites.json` never touches the network, so a change to the
minimums, the presence source, the bands or the basins can be tried on the records of the last run. Use it
on a real run's records, never on a hand-written file into the real files.

## Rerunning after the OpenStreetMap import

`SITES` is the 69 seeds followed by the imported sites (`src/data/osm-sites.json`, empty until the import
has run). The script reads `SITES`, so nothing changes in it:

```
npm run import:osm-sites                     # fills src/data/osm-sites.json
NODE_USE_ENV_PROXY=1 NODE_NO_WARNINGS=1 npm run fetch:encounter-rarity
```

For about 400 more sites it is roughly 1,500 requests, **half an hour to three quarters**, resumable. Then:

1. Read the summary it prints: sites used and left out, used sites per basin, the unresolved animals, the
   tier counts, and the sanity table. If the sanity check does not pass, do not commit the tiers; see below.
2. Look at the basins. The ~400 sites will include the Mediterranean, the Red Sea, Southeast Asia, the
   Caribbean and others the seeds barely touch. Check a few coordinates against `basinOf` (add a place to
   the test table if a rule is wrong), and that no used basin has too few sites.
3. Commit `src/data/encounter-rarity.json` and `src/data/encounter-rarity.sites.json`. Only the first is
   imported by the app; the second (about 80 KB for 69 sites, perhaps half a megabyte for 470) is evidence
   and the input for offline recomputes, and is not bundled.
4. Run `npx jest`. The rewards tests pin the hand-assigned tiers and do not move.

To switch the tiers off while keeping the evidence (the app then shows the catalogue tiers), write the file
with `applied: false` and a `notApplied` reason: pass `notApplied` to `buildEncounterData`, or set the two
fields by hand. `REAL_RARITY` is then empty and the species page says the tier is ScubaGo's own estimate.

### How the larger sample helps

The 69 seeds are the world's famous sites, chosen by hand for what lives there. For a measure that asks
how many dive sites record an animal, that is a biased sample:

- **They overrepresent megafauna.** Many seeds are named for a whale shark, manta, hammerhead or tiger shark
  spot, and the `notableSpecies` lists name those animals at those sites. So the big animals are recorded at
  a larger share of *these* sites than at a typical dive site, and their tiers are too common. The
  ordinary dive sites that make up most of the 400 have the reef staples and few megafauna; the shares of
  the big animals will fall and the tiers will go rarer, which is the correction the sanity check wants.
- **They underrepresent the cold.** Four North Pacific, two North Atlantic and two southern temperate
  sites cannot say much about kelp, seals, seadragons or cold-water sharks: 11 of the 14 unresolved animals
  are cold-water ones, and the orca's share rests on 12 sites. A few hundred sites in Europe, the Mediterranean, Japan,
  Australia, New Zealand and the Pacific North-West fill those basins.
- **They are mostly the Indo-Pacific (42 of 67).** A Caribbean share is out of 11 sites and moves in
  steps of 9 points. With dozens of sites in each basin, a share stops jumping with one site.
- **Small-site noise.** Remote seeds (the Brothers, Manta Alley) list too few taxa to be used. Hundreds
  of sites near towns, with local divers posting, are better recorded.

It does not help with: iNaturalist's coverage (sites near towns are better recorded than far reefs, so
the two get different share scales); marine mammals recorded from boats; or the choice of radius.

## Biases and limits

- **Recorded is not met.** A share counts sites with three or more records near them, over all years.
  It says an animal turns up near a site, not that a diver sees it on a dive. A reef fish and a whale
  with the same share are not equally likely on a given dive.
- **Boat and shore records.** Whales, dolphins, seals and sea turtles are recorded from boats and the
  shore as much as from the water, and OBIS holds survey and tracking rows. That is why the orca is
  uncommon (it is recorded often near Monterey and Skjervøy) and why the whale shark is rare. The
  rank is "how often is it recorded near dive sites", which includes sightings from the surface.
- **Observer effort.** iNaturalist records follow people. A site near a town with an active community
  looks richer than a remote one; the used-sites rule drops the barest, not the uneven. Charismatic animals
  are photographed more, so they look commoner; cryptic ones, and ones research grade cannot confirm, look
  rarer.
- **The seeds are the famous sites** (above), so megafauna are too common and cold water is missing.
- **Waters are where it is recorded or notable, so the share is optimistic for animals recorded in
  one small basin.** An animal's waters are chosen from its own records, so a basin where it is recorded at
  least once always counts, while a basin where it could live but was never recorded does not. For an
  animal in only a small basin this raises the share. The 5-site minimum and the percentile ranking limit
  it; a larger sample removes most of it.
- **A stray basin.** One animal recorded in a far basin by three records adds that basin's sites to its
  waters and lowers its share a little (the whale shark's waters include two southern temperate sites).
- **Truncated lists.** iNaturalist lists were read in full for all 69 sites (the longest has 2,247 taxa).
  The OBIS checklist is capped at `size=1000` (taxa, most records first) and `offset` is not honoured, so
  at 17 busy sites the tail is cut. Animals with few OBIS records at those sites are missed by OBIS, but
  iNaturalist, read in full, still sees them, and a record counts only at 3 or more. The OBIS `total` can
  exceed the rows even when the list is not cut (203 against 197 at Richelieu Rock), so a list is flagged as
  cut only at 1,000 taxa.
- **Counts drift.** iNaturalist grows every day. Tiers are ranks, so most hold still; rerun now and then.
  The file records when it was made.
- **Names.** iNaturalist renames taxa. Looking up the taxon of every catalogue animal found three, all
  cuttlefish, now called *Ascarosepion* (broadclub, giant and flamboyant cuttlefish), which the synonym
  table (`src/lib/external-sightings/synonyms.ts`) does not know. The script adds them to its own matcher
  (`CURRENT_INATURALIST_NAMES` in `scripts/real-rarity/encounter-sites.ts`), so they count here. **The
  app's own matcher has the same gap**: those three read as recorded nowhere on a site's page until the
  three lines are added to `synonyms.ts`.
- **A snapshot at build time,** shipped with the app. A new tier needs a new build.

## The files

`src/data/encounter-rarity.json` (about 21 KB, imported by the app):

```
{
  "version": 1,
  "generatedAt": "<ISO date>",             // null in a file with nothing generated
  "applied": false, "notApplied": "<why>", // only when the tiers are switched off
  "input": null,                           // the per-site file it was read from, if not the network
  "sources": { "inaturalist": {...}, "obis": {...} },    // credit, licence, terms
  "method": { summary, radiusKm, sources, presence, minRecordsPerSite, minSiteTaxa, minSitesInWaters,
              sitesAsked, sitesUsed, sitesPerBasin, basins: [{ id, name, rule }], bands, minSpecies, ties },
  "species": {
    "<catalogue id>": { "share": 0.2157, "sites": 51, "recordedAt": 11, "basins": ["tropical-indo-pacific"], "tier": "rare" }
  },
  "unresolved": [ { "id", "scientificName", "reason" } ]
}
```

Every catalogue animal is in `species` or in `unresolved`, never both and never neither. `sites` is the
used sites in its waters, `recordedAt` the ones that record it, `share` is `recordedAt / sites`
rounded to four places. `species` is in catalogue order, one per line.

`src/data/encounter-rarity.sites.json` (evidence, not imported by the app): per site, its coordinates, how many
taxa each source listed, whether a list was cut, and the counts of the catalogue animals found
(`{ "whale-shark": { "inaturalist": 3, "obis": 13 } }`). No observation, observer, photo or name beyond
the catalogue's is stored.

`src/data/real-rarity.json` (evidence, imported by the species page for the second line): per animal, the
worldwide `inaturalist.observations`, `observers`, `taxonId` and `obis.records`, and a log `score`.
**No `tier`.** `scripts/real-rarity/fetch.ts` writes it (`npm run fetch:real-rarity`, about 520 requests,
ten minutes). Its entries were fetched live on 22 October 2026; the earlier version of the script also wrote
a percentile `tier` from them, which was removed by recomputing the file from its own counts.

## The library

`src/lib/encounter-rarity.ts` (pure; nothing reads the network): `basinOf`, `BASINS`, `isRecordedAt`,
`siteEffort`, `encounterShares` (the share), `tiersFromShares`, `bandCounts`, `RARITY_BANDS`,
`buildEncounterData`, `parseEncounterData` (strict: a damaged file is `null`, never half-used),
`encounterTiersApplied`.

`src/lib/real-rarity.ts` (what the app imports):

| Export | Does |
| --- | --- |
| `REAL_RARITY` | `ReadonlyMap<speciesId, Rarity>` of the bundled encounter file, computed once. **Empty** when the file has not been generated, has its tiers switched off (`applied: false`) or is damaged. `CATALOG` applies it. |
| `realRarity(data?)` | The same for any encounter data. Never throws. |
| `realRarityEntry(id, data?, worldwide?)` | The encounter tier and numbers for one animal, with its worldwide counts beside them. Undefined when there is nothing true to say. |
| `describeRarityEvidence(entry)` | "Rare: recorded near 6 of 41 Indo-Pacific dive sites". Two basins are named ("Indo-Pacific and Caribbean"); three or more say "dive sites in its waters" with the basins in brackets; an animal recorded at none says "not recorded near any of the 41 ... dive sites". |
| `describeWorldwideCounts(entry)` | The second line: "2,654 iNaturalist observations and 845 OBIS records worldwide". Undefined without worldwide counts. |
| `rarityObservedNote(entry)` | The share card's note: "Recorded near 6 of 41 Indo-Pacific dive sites", at most 60 characters (`OBSERVED_NOTE_MAX`); it drops the basin, then "in its waters", rather than overrun. |
| `scoreSpecies`, `parseRealRarityData`, `readRawCounts`, `buildRealRarityData`, `REAL_RARITY_SOURCES` | The worldwide counts: score, strict reading, the script's `--input` and output, and the credit texts. |
| `rarityDifferences(catalog, tiers)` | Where a tier differs from the hand-assigned one, biggest first, for review. |

The scripts are in `scripts/real-rarity/`: `encounters.ts` (entry), `encounters-cli.ts` (the run),
`encounter-sites.ts` (one site, the per-site file, the name matcher), `sanity.ts` (the check), and, for the
worldwide counts, `fetch.ts`, `cli.ts`, `requests.ts` and `client.ts`. Tests:
`src/lib/__tests__/encounter-rarity.test.ts` (basins, shares, minimum sites, bands, the file),
`encounter-script.test.ts` (the script, offline `--input` to a scratch `--out`, the checkpoint, the sanity
check) and `real-rarity.test.ts` (REAL_RARITY, the evidence wording, the worldwide file). Every fixture in them
is hand-written and says so.

## How it feeds the rewards and the share cards

The rewards engine takes an optional `observed` map, species id to tier, and
`effectiveRarity(species, observed)` returns that tier when there is one and the catalogue's otherwise (see
[rewards.md](rewards.md)). The tiers are applied once, where the catalogue is built (`CATALOG` in
`src/lib/catalog.ts`): every screen, the share cards and the rewards read `species.rarity`, so they all
show the encounter tier, and the hand-assigned one for the 14 animals without one or while the tiers are
switched off. `scripts/seed-supabase.ts` seeds the same tier to the remote catalogue.

Changing tiers changes which rarity badges an old log earns (the whale shark no longer earns "first
legendary"); see the note in [rewards.md](rewards.md) about not revoking what was celebrated. The rewards
tests mock the encounter file empty so they keep testing the engine against the hand-assigned tiers.

The species page says where the tier comes from, under the rarity chip
(`src/components/sightings/rarity-source.tsx`, fed by `realRarityEntry(id)`):

- **With a tier:** "Rare: recorded near 6 of 41 Indo-Pacific dive sites.", then, if the worldwide file has
  the animal, "2,654 iNaturalist observations and 845 OBIS records worldwide.", then "A ranking among
  ScubaGo's animals, not a promise of seeing one." and a link to Data & credits. The discovery card's
  note is `rarityObservedNote`.
- **Without one** (unresolved, switched off, file empty or damaged): "Rarity is ScubaGo's own estimate for
  now." No numbers and no link, so a hand-assigned tier is never passed off as data.

## Credits and licences

The counts are facts, so they carry no licence of their own; ScubaGo still credits where they come from,
and `sources` in the file says so.

- **iNaturalist:** "Observations by iNaturalist observers (inaturalist.org)". Only research-grade counts
  are used. No observation, photo or observer name is stored. Terms: https://www.inaturalist.org/terms.
- **OBIS:** "OBIS and its data providers (obis.org)", cited as "OBIS. Ocean Biodiversity Information System.
  Intergovernmental Oceanographic Commission of UNESCO. https://obis.org". OBIS datasets carry their own
  licences (CC0, CC BY, CC BY-NC); only counts are stored, never a record or a dataset. Policy:
  https://manual.obis.org/policy.html.
- **Dive sites** are ScubaGo's seeds and, once imported, © OpenStreetMap contributors (ODbL;
  [osm-sites.md](osm-sites.md)); only their coordinates are used here.

ScubaGo is not endorsed by either. The Data & credits screen carries these credits and describes how the
rarity is worked out. The texts match `src/lib/external-sightings/attribution.ts`.

## Not verified against the live APIs

Run live on 22 October 2026, so the request shapes are confirmed: `species_counts` with `lat`, `lng`,
`radius`, `iconic_taxa` and `page`; the OBIS `checklist` with a WKT `geometry` and `size=1000`. Still
open: the `offset` parameter of the OBIS checklist is accepted but ignored (the same rows come back);
the OBIS `total` field of a checklist is not the number of rows returned; the rate limits of both services
are untested beyond one request a 1.1 seconds (one 'no connection' was retried in the run, no 429 was met).
