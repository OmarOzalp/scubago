# Rarity from encounters

Each of the 120 catalogue animals has a tier (common, uncommon, rare, epic, legendary). The tier was
assigned by hand. It is now worked out from **how often the animal is recorded at dive sites in its own
waters**, using **iNaturalist** (research-grade observations) and **OBIS** (the Ocean Biodiversity
Information System). A build-time script asks both about every dive site in `src/data/sites.ts`,
once, and bundles the answer. Nothing is asked on the phone, so the tiers do not depend on what a device
happens to have cached.

**Status (22 October 2026): run live over all 329 dive sites (the 69 seeds and 260 OpenStreetMap sites),
method revised, tiers applied.** 106 of the 120 animals are tiered and 14 stay on their hand-assigned
tier. The first run over 329 sites **failed** the sanity check (5 of 9 iconic animals rare or rarer). The cause
was the Red Sea, which the method lumped into the rest of the Indo-Pacific; it is now its own province. The
recomputed tiers pass the check: 8 of the 9 iconic animals that have a tier are rare or rarer (the orca is the
miss) and 6 of 7 staples are common or uncommon (the moorish idol is the miss). They carry known weaknesses,
listed under [the sanity check](#the-sanity-check) and [Biases and limits](#biases-and-limits).

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
| Epic | the next 15% | 16 | 14 |
| Legendary | the least recorded 10% | 10 | 9 |

The 14 animals without a share keep their hand-assigned tier (1 common, 3 uncommon, 2 rare, 5 epic, 3
legendary), so the app shows **31 common, 25 uncommon, 30 rare, 21 epic and 13 legendary** (hand-assigned for
all 120: 33, 25, 31, 19, 12). **68 of the 106 tiers differ from the hand-assigned ones**: 21 are one tier more
common, 9 are two more common and 1 is four more common (the orca); 23 are one tier rarer and 14 are two rarer.
The largest moves are the orca (legendary to common), the whale shark, humpback, sperm whale, leatherback and
chambered nautilus (legendary to rare), the reef manta (epic to uncommon), the Galapagos shark, the bottlenose
dolphin and the Napoleon wrasse (rare to common), and the scalloped hammerhead, the olive ridley turtle, the wolf
eel, the Pikachu nudibranch and the golden jellyfish (rare to legendary).

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
   (see [Biases and limits](#biases-and-limits)).
2. **Recorded.** An animal is *recorded* at a site when **at least 3 records** from one source are
   near it: three iNaturalist observations, or three OBIS records. The two sources are not added up,
   because OBIS holds iNaturalist's observations too.
3. **Used sites.** A site is used only if its sources listed at least **20 species-level taxa** (marine
   animals of any kind, not only the catalogue's). A site where nearly nothing is recorded says nobody
   posts there, not that the animals are absent: a lake, a quarry, a remote reef.
4. **Province.** Each used site is put in one of eight biogeographic provinces (called basins in the code)
   by latitude and longitude. The Red Sea is its own (below).
5. **Its waters.** An animal's waters are the provinces where it is recorded at a used site, **plus** the
   provinces of every site that lists it in `notableSpecies` (the app's own curation, so an animal the
   data never records is still placed where it is known to live). Only provinces with a used site count.
6. **Share.** (used sites in its waters where it is recorded) ÷ (used sites in its waters).
7. **Enough sites.** An animal needs at least **5** used sites in its waters. Otherwise it is *unresolved*,
   keeps its catalogue tier, and the file lists it with the reason. An animal with no waters at all (recorded
   nowhere, notable nowhere) is unresolved too: no data is not rarity.
8. **Tier.** Animals that have a share are ranked and cut into percentile bands (below).

### What changed after the 329-site run, and why

The first run over all 329 sites (the 69 seeds plus 260 OpenStreetMap sites, 241 of the 329 in Egypt's Red
Sea, 25 more on the Great Barrier Reef) wrote tiers that **failed** the sanity check: whale shark uncommon, sperm
whale uncommon, orca common, leatherback uncommon, blue tang rare, clownfish uncommon; 5 of 9 iconic animals
rare or rarer, 6 of 7 staples common or uncommon. Three faults were diagnosed. One is fixed in the method; two are
taken up below as a choice that was made.

1. **The Red Sea is its own province (fixed).** The first version had one "Tropical Indo-Pacific, Red Sea
   included" province, which suited 69 seeds with six Red Sea sites and did not suit 241 (231 used). The blue tang
   (*Paracanthurus hepatus*) and the ocellaris clownfish do not live in the Red Sea, and the data agrees:
   **none of the 231 used Red Sea sites records either**, while 19 and 27 of the other 62 used sites do. Lumped in,
   the Red Sea made them look absent from four fifths of the sites in their waters: the blue tang was *rare* at 19 of
   293 sites (6%) and the clownfish *uncommon* at 27 of 293 (9%). Now the Red Sea is a province, an animal's waters
   include it only if the animal is recorded there (or listed as notable there), and the blue tang reads 19 of 62
   sites (31%, *uncommon*) and the clownfish 27 of 62 (44%, *common*). That alone moves the sanity check from
   5 of 9 and 6 of 7 to 8 of 9 and 6 of 7.
2. **Clustered sites over-count one area (considered; the share still counts every site).** Dozens of Egyptian
   sites lie within a few kilometres of each other and read the same records within 5 km. The method can group them
   into cells (below, `--cells`), and that analysis was done. The shipped share counts sites. Reason: dense diving
   areas have more mapped sites because more diving happens there, so a site-weighted share approximates "the chance
   of an animal being recorded near a given mapped dive site", which is the quantity a diver cares about. Counting
   cells gives a rarely dived remote area the same weight as Hurghada. This takes mapping density in OpenStreetMap
   to be a stand-in for dive activity, which has not been measured, and it leaves the double reading of shared
   records in place (see [Biases and limits](#biases-and-limits)). It is a choice of question, not a repair.
3. **Small samples (kept as they were).** The minimum stays at 5 used sites. The Caribbean has 11 sites and the
   cold provinces 2 to 6; the sperm whale and the leatherback are 1 of 11 and the orca 5 of 12. They are tiered,
   and one record can move any of them (see [The minimum](#the-minimum)): that is a limit of the data, shown
   with the tier ("recorded near 1 of 11 Caribbean dive sites"), not something this method repairs. A higher minimum
   is one flag (`--min-sites 20`) and is in the alternatives below.

The bands (28, 21, 26, 15, 10), the radius, the 3-record rule, the 20-taxa rule and the tie rule did not change.

### The radius

5 km. A dive boat anchors, a diver surfaces and a photograph is geotagged within a few kilometres of the
site's marker (site coordinates are marker-precision, not navigation-precision), and a much wider circle
would start counting the next reef and the open sea between. The in-app client uses 3 km; the build uses
5 km because the markers are approximate and because a build can afford the extra pages. It is a
constant (`DEFAULT_RADIUS_KM`, `--radius`), recorded in the output (`method.radiusKm`). Radius 5 was not
compared with other radii: a different one needs a new run, and the shares of animals recorded at only a
handful of sites move with it. The OBIS box is a square that holds the circle (about 27% larger in area).

### The provinces

Explicit latitude and longitude rules (`basinOf` in `src/lib/encounter-rarity.ts`), tried in this order. The
limits are the poleward edge of tropical water, not of the tropics. Sites in a lake or quarry fall into
whichever rule their coordinates meet and are dropped by the used-sites rule.

| Province (id) | Rule | Used sites |
| --- | --- | --- |
| Red Sea, with the Gulfs of Suez and Aqaba (`red-sea`) | inside the polygon `RED_SEA`: 12.5 N to 30.2 N, between lines drawn inland of the Egyptian, Sudanese and Eritrean coast and beyond the Sinai, Jordanian, Saudi and Yemeni coast; it ends at Bab-el-Mandeb | 231 |
| Tropical Eastern Pacific (`tropical-east-pacific`) | 6 S to 27 N, east of 140 W, on the Pacific side of the Americas | 6 |
| Tropical West Atlantic and Caribbean (`tropical-west-atlantic`) | 25 S to 32.5 N, 98 W to 30 W, on the Atlantic side of the Americas | 11 |
| Tropical Eastern Atlantic (`tropical-east-atlantic`) | 18 S to 27 N, 30 W to 20 E | 0 |
| Tropical Indo-Pacific, without the Red Sea (`tropical-indo-pacific`) | 32 S to 30 N, east of 20 E or west of 140 W, outside the Red Sea | 62 |
| Temperate and cold North Pacific (`temperate-north-pacific`) | what is left, north of the equator, east of 100 E or west of 100 W | 4 |
| Temperate and cold North Atlantic with the Mediterranean (`temperate-north-atlantic`) | what is left, north of the equator, between 100 W and 100 E | 2 |
| Temperate and cold southern waters (`temperate-southern`) | what is left, south of the equator | 2 |

**The Red Sea polygon** is 22 points (`RED_SEA`), a ring drawn a few tenths of a degree outside the coast so a
reef on the coast is inside and the desert behind it is not. It is tested first, with ray casting. The north edge
is 30.2 N: Suez and Eilat (29.5 to 30 N) are in and the Mediterranean coast of Egypt (31 N and up) is out. The south
edge is 12.5 N, just short of Bab-el-Mandeb (12.6 N): the Gulf of Aden (Djibouti, Aden, Socotra) is out and stays
Indo-Pacific. The tests check 20 places inside (Ras Mohammed, Dahab, Eilat, Aqaba, Suez, Hurghada, Marsa Alam,
Daedalus, Port Sudan, Dahlak, Jeddah, the Farasan Islands, Perim and more), the land and sea around it that must be
out (Luxor, Lake Nasser, Cairo, Medina, Asmara, Obock, Port Said, the Dead Sea), a Coral Triangle, a Western Indian
Ocean and a Caribbean point in their own provinces, and that every Egyptian site in `SITES` is in it and no other
country's is. (Egypt has 241 sites in the app: 6 seeds and 235 imported ones. The OpenStreetMap import table in
[osm-sites.md](osm-sites.md) sums to 243 Egyptian rows because 8 of the 268 imported rows were seeds already.)

**Splits considered and not made.**

- *Gulf of Aden.* No dive site of the 329 is there, and its fauna mixes the Red Sea's and the Arabian Sea's.
  It stays Indo-Pacific until sites there say otherwise.
- *Western Indian Ocean against the Coral Triangle and the Pacific.* The data holds **5** used sites in the
  west Indian Ocean (three in the Maldives, two in South Africa) among the 62 other Indo-Pacific sites. A province
  of 5 sites is at the minimum, so an animal could be tiered on little else, and the Indo-Pacific shares
  would change by at most 5 of 62 sites. The Indo-Pacific still lumps animals with narrower ranges than the
  province (the west Indian Ocean, Polynesia, the Great Barrier Reef): the Red Sea bias in miniature, and now small.
- *Persian Gulf, Mediterranean sub-basins, Eastern Atlantic.* No or almost no sites.

"The Pacific side of the Americas" is west of 98 W, or the South American coast south of 8.4 N and west of
66 W, or south of a line across Central America through ten points from the Isthmus of Tehuantepec to the
Panama–Colombia border (`AMERICAS_DIVIDE`). It is coarse there (tens of km), and far from the isthmus it
decides nothing. The consequences worth knowing: Aliwal Shoal and Protea Banks (30 S) are Indo-Pacific,
because the warm Agulhas current reaches East London (33 S), while Cape Town, Sydney, the Poor Knights and
Rapid Bay are temperate; the Mediterranean (north of 30.5 N) is North Atlantic; California's kelp (33 N) and
Japan north of 30 N are North Pacific; Bermuda is Caribbean, Charleston is not. The tests
(`src/lib/__tests__/encounter-rarity.test.ts`) check 107 real places against these rules.

### Cells (optional: `--cells <km>`)

`groupIntoCells(points, cellKm)` links used sites **within `cellKm` of each other, directly or through a chain
of such sites** (single linkage, by great-circle distance), within one province. Each linked group is a cell. With
`--cells 10` (10 km is twice the 5 km search radius, so it links exactly the sites whose search circles touch)
the share and the minimum count cells instead of sites: an animal is *recorded in a cell* when any used site in
it has it. It is **off by default** (`cellKm: 0`) and kept as an analysis, tested end to end. Two sites 3 km apart
are always one cell, two sites 30 km apart are two unless something links them, the result does not depend on
the order of the sites, and a cell cut by a province line counts once in each province. The 318 used sites make
**93 cells at 10 km**: 28 in the Red Sea (231 sites, 8.3 to a cell), 40 in the rest of the Indo-Pacific (62
sites; 30 Australian sites are 11 cells), and one per site elsewhere. The largest cell holds 46 sites over 32 km
and the widest spans 52 km (35 sites): single linkage chains along a coast, and the log reports both when cells
are on. A fixed 10 km grid was tried first and dropped: it put sites 3 km apart in two cells 36% of the time (12% at
1 km), because a grid line happens to fall between them.

What it gave, computed offline from the same records:

| Variant | Animals tiered | Iconic rare or rarer | Staples common or uncommon | Result | Misses |
| --- | --- | --- | --- | --- | --- |
| **Shipped: sites, minimum 5** | 106 | 8 of 9 | 6 of 7 | passes | orca, moorish idol |
| Cells of 10 km, minimum 5 | 106 | 7 of 9 | 7 of 7 | passes | humpback, orca |
| Cells of 10 km, minimum 8 | 101 | 7 of 9 | 7 of 7 | passes | humpback, orca |
| Cells of 10 km, minimum 20 | 83 | 4 of 6 | 5 of 5 | passes | whale shark, humpback |
| Cells of 0.5 km (about one per site), minimum 5 | 106 | 8 of 9 | 7 of 7 | passes | orca |

**Why it was not chosen.** For the reason under [What changed](#what-changed-after-the-329-site-run-and-why): a
cell gives a remote, rarely dived reef the same weight as the busiest part of the Red Sea coast, and the quantity
wanted is the chance at a mapped dive site. At the minimum of 20 cells that suited the small provinces, the whale shark and the humpback came
out *uncommon* and **37 animals** were left on their hand-assigned tier (against 14); at a minimum of 5 cells
only the humpback and the orca missed. All of those variants pass the sanity check, so the verdict does not rest
on this choice. The moorish idol is a miss only when sites are counted: at 20% it sits near the line between
uncommon and rare, and cells of 0.5 km (which merge a few near-duplicate sites) put it back among the staples that pass.

### The minimum

An animal's share rests on the used sites in its waters, so a small sample gives a share that one site can swing.
One site is 1/n of the share: 9 points at 11 sites (the Caribbean), 2 at 62 (the Indo-Pacific). `--stability`
measures what that does: it drops one site from each animal's waters (once a site where it is recorded, once one
where it is not) and asks whether its tier would change, against everyone else's unchanged shares. On the 329 sites,
with every animal that has waters included (`--stability --min-sites 1`):

| Sites in the animal's waters | Animals | Tier changes if one site is dropped | By two tiers or more |
| --- | --- | --- | --- |
| 1 to 4 (southern 2, North Pacific 4) | 11 | 6 (55%) | 4 |
| 5 to 9 (Eastern Pacific 6) | 5 | 2 (40%) | 0 |
| 10 to 19 (Caribbean 11, the orca's 12, the Christmas tree worm's 17) | 18 | 4 (22%) | 0 |
| 20 to 39 | none | | |
| 40 or more (Indo-Pacific 62, with the Red Sea 293, and beyond) | 83 | 9 (11%) | 0 |

The minimum is **5 sites**, the one the first version used. It leaves out the animals whose waters are the southern
temperate and North Pacific provinces (11 animals, the first group above) and tiers the Eastern Pacific and
Caribbean ones on 6 and 11 sites, where a single site moves the tier of two in five (Eastern Pacific) and one in
five (Caribbean). That is the weak part of the result: **the sperm whale and the leatherback are *rare* on one
record at one of 11 Caribbean sites, the orca *common* on 5 of 12**, and the shares are shown with the tiers
so a reader can see it. A higher minimum is one flag: 8 and 10 give 101 animals tiered and the same sanity
verdict (8 of 9, 6 of 7); 20 gives 83 tiered and 5 of 6, 5 of 5 (the humpback missing). The sanity check does not
choose between them.

### The tiers

**Percentile bands, not absolute thresholds.** A share is a count over a small number of sites (19 of 62
Indo-Pacific sites, 52 of 301 for the whale shark), so it moves a lot with what happens to be in the site list,
the radius and how many people post to iNaturalist near each site. An absolute cut ("common from 40%")
would move every animal's tier whenever the site list grew. A rank is more honest about what the number can
carry: *more or less often recorded than the other animals here*. It also keeps what the rewards and the
collection were built for, a catalogue where about one animal in ten is legendary. The bands are the
hand-assigned shares rounded to whole percents (`RARITY_BANDS`: 28, 21, 26, 15, 10), cut at
`round(cumulative % × n / 100)` of the n animals that have a share (for 106 animals, after the 30th, 52nd, 80th and
95th). They were kept: nothing in the diagnosis is about the bands.

The price is that the bands say nothing absolute: the legendary tenth is the least recorded tenth *of what
was measured*, whatever the shares are. The share and the sites are therefore always shown with the tier
("Rare: recorded near 6 of 41 Indo-Pacific dive sites"), so the number behind a tier is visible.

**Ties take the tier at the middle of their block** (the mid-rank). Many animals share a share (a count
over 62 sites has few values), and some are recorded at none of the sites in their waters. The old rule for
worldwide counts, "ties take the commoner tier", would put a block of never-recorded animals in the band
where the block *starts*, which can be well above legendary. The mid-rank is symmetric and does not depend on
the order of the ties. With fewer than 20 ranked animals nobody is tiered, because percentiles of three
animals mean nothing.

What the bands came to on 22 October 2026:

| Tier | Share of the sites in an animal's waters | Animals |
| --- | --- | --- |
| Common | 42% to 91% | 30 |
| Uncommon | 20% to 40% | 22 |
| Rare | 9.1% to 20% | 28 |
| Epic | 3.1% to 8.2% | 16 |
| Legendary | 0% to 3.0% | 10 |

(A tier's edges overlap by rounding and by the mid-rank of ties: two animals at 20% can sit either side of a cut.)

## The sanity check

The question: does the metric measure how likely a diver is to meet the animal, or only how much it is
photographed? Two lists of animals whose standing nobody argues about (`scripts/real-rarity/sanity.ts`,
printed by every run). They judge a result and are never an input. **No tier was adjusted to pass.**

- Iconic big animals divers rarely meet: whale shark, humpback, sperm whale, orca, great white, basking
  shark, dugong, leatherback, oceanic manta, mola mola. They should mostly be **rare or rarer**.
- Reef staples in their waters: clownfish, blue tang (palette surgeonfish), moorish idol, giant moray,
  lionfish, French and queen angelfish. They should mostly be **common or uncommon**.

"Mostly" is two thirds of the animals that have a tier. Unresolved animals are not counted either way.

| Animal | Its waters | Recorded near | Share | Tier | Hand-assigned | Before: 329 sites, one Indo-Pacific |
| --- | --- | --- | --- | --- | --- | --- |
| Whale Shark | Indo-Pacific, Red Sea, Eastern Pacific, Southern temperate | 52 of 301 sites | 17% | **Rare** | Legendary | Uncommon (52/301, 17%) |
| Humpback Whale | Indo-Pacific, Eastern Pacific, North Pacific, North Atlantic | 14 of 74 sites | 19% | **Rare** | Legendary | Rare (14/305, 5%) |
| Sperm Whale | Caribbean | 1 of 11 sites | 9% | **Rare** | Legendary | Uncommon (1/11, 9%) |
| Orca | Eastern Pacific, North Pacific, North Atlantic | 5 of 12 sites | 42% | **Common** | Legendary | Common (5/12, 42%) |
| Great White Shark | Indo-Pacific, North Pacific | 3 of 66 sites | 5% | **Epic** | Legendary | Legendary (3/297, 1%) |
| Basking Shark | none: recorded nowhere | unresolved | | keeps Legendary | Legendary | unresolved |
| Dugong | Indo-Pacific, Red Sea | 17 of 293 sites | 6% | **Epic** | Legendary | Rare (17/293, 6%) |
| Leatherback Turtle | Caribbean | 1 of 11 sites | 9% | **Rare** | Legendary | Uncommon (1/11, 9%) |
| Oceanic Manta Ray | Indo-Pacific, Red Sea, Eastern Pacific, Southern temperate | 5 of 301 sites | 2% | **Legendary** | Epic | Epic (5/301, 2%) |
| Ocean Sunfish (Mola Mola) | Indo-Pacific, North Pacific | 6 of 66 sites | 9% | **Rare** | Epic | Epic (6/297, 2%) |
| Ocellaris Clownfish | Indo-Pacific | 27 of 62 sites | 44% | **Common** | Common | Uncommon (27/293, 9%) |
| Palette Surgeonfish (Blue Tang) | Indo-Pacific | 19 of 62 sites | 31% | **Uncommon** | Common | Rare (19/293, 6%) |
| Moorish Idol | Indo-Pacific, Red Sea, Eastern Pacific | 59 of 299 sites | 20% | **Rare** | Common | Uncommon (59/299, 20%) |
| Giant Moray | Indo-Pacific, Red Sea, Eastern Pacific | 212 of 299 sites | 71% | **Common** | Common | Common (212/299, 71%) |
| Red Lionfish | Indo-Pacific, Red Sea, Caribbean | 233 of 304 sites | 77% | **Common** | Common | Common (233/304, 77%) |
| French Angelfish | Caribbean | 10 of 11 sites | 91% | **Common** | Common | Common (10/11, 91%) |
| Queen Angelfish | Caribbean | 7 of 11 sites | 64% | **Common** | Uncommon | Common (7/11, 64%) |

**Result: 8 of the 9 iconic animals that have a tier are rare or rarer (the orca is common; the basking shark has
no tier), and 6 of the 7 staples are common or uncommon (the moorish idol is rare). It passes.** The "Before" column
differs from the new one only where the Red Sea changes the animal's waters or the other animals' ranks (the whale
shark is the same share, 17%, and moves from uncommon to rare because the ranking around it changed). What to
read into it:

- **The Red Sea split is the repair.** The blue tang and the clownfish, whose waters no longer include 231 Red Sea
  sites that never record them, move from rare and uncommon to uncommon and common; the whale shark and the
  dugong move with the ranking.
- **Two of the passing iconic animals pass on one record.** The sperm whale and the leatherback are *rare* at 1 of
  11 Caribbean sites. The data says "recorded once"; the tier says "rare". Seen as the small-sample problem it is
  (see [The minimum](#the-minimum)), not as evidence about whales.
- **The orca is a real miss.** 5 of 12 sites in three cold provinces. It is recorded repeatedly from boats near the
  places where it lives (Monterey, La Jolla, Skjervøy, the Galápagos).
- **The moorish idol is a real miss, with a cause.** It is listed as notable at Red Sea seeds, so the Red Sea's 231
  sites are in its waters, but not one of them records it. 59 of 299 is 20%; without the Red Sea it would be 59 of 68
  (87%). Either the matcher does not know the name the Red Sea form is filed under (the synonym table lists *Zanclus
  canescens* as a former name; whether iNaturalist now files Red Sea records under another name was not checked, no
  network) or the curation is wrong. It was not adjusted.
- The hand-assigned tiers are not the standard. They put the whale shark and the orca in the legendary tier by
  reputation. The data says they are among the more often recorded of the big animals near dive sites. The tiers
  are the ranking of the data, and the species page shows the numbers behind each.

### Sensitivity

The result under other choices, computed offline from the same records (`--min-sites`, `--cells`, `--presence`,
`--min-records`). These are checks on the shipped method, not alternatives it was chosen from.

| Variant | Animals tiered | Iconic rare or rarer | Staples common or uncommon | Result | Misses |
| --- | --- | --- | --- | --- | --- |
| **Shipped: sites, minimum 5** | 106 | 8 of 9 | 6 of 7 | passes | orca, moorish idol |
| Minimum 8 or 10 | 101 | 8 of 9 | 6 of 7 | passes | orca, moorish idol |
| Minimum 12 | 85 | 5 of 7 | 5 of 5 | passes | humpback, orca |
| Minimum 20 | 83 | 5 of 6 | 5 of 5 | passes | humpback |
| iNaturalist records only | 102 | 6 of 7 | 6 of 7 | passes | orca, moorish idol |
| OBIS records only | 106 | 8 of 9 | 7 of 7 | passes | orca |
| One record is enough (the first version's rule) | 108 | 8 of 10 | 6 of 7 | passes | whale shark, orca, moorish idol |
| Cells, see above | 83 to 106 | | | passes | |

Nothing here fails. The three rows of the minimum show how much of the pass is the orca, the sperm whale and the
leatherback: with the Caribbean and the cold provinces out (minimum 20) it is 5 of 6.

### How the method got here

The method was run on the live records several times. The first three were on the 69 seeds and settled the
rule for "recorded"; the fourth is the 329-site run and this revision. The per-site file makes each variant
cheap to recompute offline (`--input src/data/encounter-rarity.sites.json --dry-run`).

1. **One record is enough** (`--min-records 1`), both sources, on the 69 seeds. 8 of 10 iconic animals rare or
   rarer and 6 of 7 staples common or uncommon: it passes the two-thirds rule. But a single stray record counts
   as much as hundreds. The whale shark was **uncommon** (28 of 61 sites: a one-off OBIS row at most of them) and
   the blue tang was *rare*.
2. **At least 3 records from one source** (shipped on the 69 seeds, kept). The whale shark moved to rare (11
   of 50), the blue tang to uncommon, and 8 of 9 and 7 of 7 passed. The number 3 is the least that says
   "repeatedly" rather than "once"; it was chosen after seeing run 1, for that reason, and applies to every animal alike.
3. **Other sources, same 3 records** (not shipped): iNaturalist alone gave the whale shark 6% (epic) and left 19
   animals unresolved; OBIS alone gave the humpback uncommon and the orca common. All variants passed the
   two-thirds rule, so the result did not hang on one source; the combined one ranked the iconic animals best
   and left the fewest animals unresolved.
4. **329 sites** (this document). The first re-run failed (5 of 9, 6 of 7). Three faults were diagnosed from the
   failed run and checked against the per-site records (no Red Sea site records the blue tang or the clownfish).
   The Red Sea was made a province; cells were built, tried (a grid, then single linkage, each with a higher
   minimum) and kept as an option; the minimum stayed at 5. The shipped variant is the one that counts dive
   sites, for the reason given above, and was chosen over cells on that reason and not on the sanity table, which
   all the variants pass. **No tier was adjusted.**

The radius (5 km) was not varied. A larger or smaller radius needs a new run of the script (`--radius`), and
the shares of animals recorded at a handful of sites move with it.

## Who gets a tier

Of the 120 animals, 106 have a tier and 14 are unresolved. Unresolved animals keep their catalogue tier in
the app, and are listed in the file with the reason:

- No site records it and none lists it as notable (three animals: basking shark, largetooth sawfish, giant guitarfish).
- Fewer than 5 used sites in its waters: only 4 in the North Pacific (six animals: harbor seal, sea otter,
  garibaldi, giant sea bass, lingcod, giant Pacific octopus) and only 2 in the southern temperate province (five:
  shortfin mako, marbled electric ray, leafy and weedy seadragons, giant cuttlefish). These are the cold-water
  animals; the sites hold few cold-water sites.
- A site list with fewer than 20 animals having a share gives no tier at all.

An animal recorded at *none* of the used sites in its waters has a share of 0 and is tiered (the olive ridley turtle
is legendary at 0 of 62, Munk's devil ray at 0 of 6): that is "not recorded at any of these sites", not "never recorded".
The Eastern Pacific animals (6 sites) and the Caribbean ones (11) are tiered on very few sites; see
[The minimum](#the-minimum).

Never tiered: the "unlisted" id.

## Running it

```
NODE_USE_ENV_PROXY=1 NODE_NO_WARNINGS=1 npx tsx scripts/real-rarity/encounters.ts     # or: npm run fetch:encounter-rarity
```

`NODE_USE_ENV_PROXY=1` makes Node's `fetch` use the environment's proxy; leave it out on a machine with
direct access. It needs network access to `api.inaturalist.org` and `api.obis.org`. About 3.8 requests a
site (a busy coast needs several pages of iNaturalist taxa), so 329 sites take about half an hour to
three quarters.

To recompute the tiers from the records of the last run (no network; the records file is not touched, the tiers
file is):

```
npx tsx scripts/real-rarity/encounters.ts --input src/data/encounter-rarity.sites.json --dry-run     # look
npx tsx scripts/real-rarity/encounters.ts --input src/data/encounter-rarity.sites.json                # write src/data/encounter-rarity.json
npx tsx scripts/real-rarity/encounters.ts --input src/data/encounter-rarity.sites.json --out /tmp/try.json --cells 10 --min-sites 8
```

| Option | Meaning |
| --- | --- |
| `--input <file>` | Recompute from a saved per-site file (`encounter-rarity.sites.json`) or a checkpoint, with no network. It never writes the per-site file. |
| `--out <file>` | Where to write the tiers. Default `src/data/encounter-rarity.json`. The per-site records go beside it (`<out>.sites.json`) after a live run, the checkpoint is `<out>.partial.json`. |
| `--dry-run` | Print the summary and the sanity table; write nothing, not even a checkpoint. |
| `--fresh` | Ignore a checkpoint and start over. |
| `--radius <km>` | Search radius (default 5). |
| `--no-obis` | Ask iNaturalist only. |
| `--presence either\|inaturalist\|obis` | Which source makes an animal recorded (offline, among the sources the file holds). |
| `--min-records <n>` | Records that make an animal recorded at a site (default 3). |
| `--min-site-taxa <n>` | Taxa a site must list to be used (default 20). |
| `--min-sites <n>` | Used sites an animal's waters must hold (default 5; cells, with `--cells`). Works offline. |
| `--cells <km>` | Analysis, off by default: count cells instead of sites, where sites within `<km>` of each other, directly or through a chain, are one cell. 10 is twice the search radius. Works offline. |
| `--stability` | Also print how many tiers change if one site (one cell) is dropped, by the size of an animal's waters. Use `--min-sites 1` to include the small provinces. |
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
minimums, the cell reach, the presence source, the bands or the provinces can be tried on the records of the last
run. Use it on a real run's records, never on a hand-written file into the real files. A test recomputes the
checked-in tiers from the checked-in records and fails if the two disagree, so run the offline command after
any change to the method or to `encounter-rarity.sites.json`.

## After the OpenStreetMap import

`SITES` is the 69 seeds followed by the imported sites (`src/data/osm-sites.json`: 260 new sites, 235 in Egypt's
Red Sea and 25 on the Great Barrier Reef). The script reads `SITES`, so nothing changes in it:

```
npm run import:osm-sites                     # fills src/data/osm-sites.json
NODE_USE_ENV_PROXY=1 NODE_NO_WARNINGS=1 npm run fetch:encounter-rarity
```

It is resumable. After a run:

1. Read the summary it prints: sites used and left out (11 of 329 listed under 20 taxa), used sites per
   province, the unresolved animals, the tier counts, and the sanity table. If the sanity check does not pass, do
   not commit the tiers; see below.
2. Look at the provinces. Check a few coordinates against `basinOf` (add a place to the test table if a rule is
   wrong), and that no province an animal's tier rests on has too few sites.
3. Commit `src/data/encounter-rarity.json` and `src/data/encounter-rarity.sites.json`. Only the first is
   imported by the app; the second (about 320 KB for 329 sites) is evidence and the input for offline
   recomputes, and is not bundled.
4. Run `npx jest`. The rewards tests mock the encounter file empty so they keep testing the engine against
   the hand-assigned tiers.

To switch the tiers off while keeping the evidence (the app then shows the catalogue tiers), write the file
with `applied: false` and a `notApplied` reason: pass `notApplied` to `buildEncounterData`, or set the two
fields by hand. If the sanity check ever fails with a method that cannot honestly be fixed, restore the last
tiers that passed instead. `REAL_RARITY` is then empty and the species page says the tier is ScubaGo's own estimate.

### What the larger sample did

The 69 seeds are the world's famous sites, chosen by hand for what lives there. Predicted: the ordinary sites that
make up most of an import have the reef staples and few megafauna, so the shares of the big animals fall. Found:
the whale shark was recorded at 11 of 50 seed sites (22%) and at 52 of 301 (17%) of the 329. The tiers did not follow
on their own, because the import also brought a problem the seeds could not show:

- **The import is 73% Egyptian Red Sea** (241 of 329 sites, 6 of them seeds), 10 of them under the 20-taxa bar.
  That is why the Red Sea had to be its own province, and why 231 of the 318 used sites are in one country.
- **The cold and the Caribbean did not grow.** North Pacific 4, North Atlantic 2, southern 2, Eastern Pacific 6,
  Caribbean 11: 11 of the 14 unresolved animals live in the North Pacific and southern provinces (the other 3 are never
  recorded), and the tiers of the Eastern Pacific and Caribbean ones rest on a handful of sites. Importing dive sites in California, British Columbia, Europe,
  Japan, New Zealand, southern Australia and the Caribbean is what firms them up.
- **Remote seeds list too few taxa to be used** (the Brothers, Manta Alley), and so do 9 of the imported sites.

## Biases and limits

- **Recorded is not met.** A share counts sites with three or more records near them, over all years.
  It says an animal turns up near a site, not that a diver sees it on a dive. A reef fish and a whale
  with the same share are not equally likely on a given dive.
- **Boat and shore records.** Whales, dolphins, seals and sea turtles are recorded from boats and the
  shore as much as from the water, and OBIS holds survey and tracking rows. That is why the orca is *common*
  (it is recorded often near Monterey, Skjervøy and the Galápagos) and the whale shark only *rare*. The rank
  is "how often is it recorded near dive sites", which includes sightings from the surface.
- **Observer effort.** iNaturalist records follow people. A site near a town with an active community
  looks richer than a remote one; the used-sites rule drops the barest, not the uneven. Charismatic animals
  are photographed more, so they look commoner; cryptic ones, and ones research grade cannot confirm, look
  rarer.
- **Every site counts, so a densely mapped area counts many times.** The share is the chance at a mapped dive site,
  which weights an area by how many sites it has. That is the intended question (dense areas are dived more), but it
  assumes mapping density in OpenStreetMap follows dive activity, which has not been measured, and the sites of one
  area read the same records within 5 km: the largest group of Red Sea sites within 10 km of each other has 46 sites
  over 32 km, and 231 of the 318 used sites are Red Sea sites. An animal recorded anywhere in a busy area looks
  common. `--cells` shows the same data with each area counted once.
- **The Red Sea is one country and 73% of the sites.** All 241 Red Sea sites are in Egypt: none in Sudan, Eritrea,
  Saudi Arabia, Jordan or Israel. An animal that lives in both the Red Sea and the rest of the Indo-Pacific has
  231 of its 293 sites in Egyptian waters, the most photographed in the Red Sea. The Great Barrier Reef is the other
  mass of sites (30 Australian ones).
- **The provinces are still coarse.** The Indo-Pacific lumps the west Indian Ocean (5 used sites), the Coral
  Triangle, the Great Barrier Reef and Polynesia; an animal with a narrower range than that is under-counted
  by the same arithmetic that hurt the blue tang, in miniature. The Gulf of Aden and the Persian Gulf have no site.
- **Waters are where it is recorded or notable, so the share is optimistic for animals recorded in
  one small basin, and an animal can be placed in a province where it is never recorded.** An animal's waters are
  chosen from its own records, so a province where it is recorded at least once always counts, while a province
  where it could live but was never recorded does not. And a seed's `notableSpecies` can put an animal in a
  province the data never records it in: the moorish idol is listed at Red Sea seeds and has **no** record at any
  of the 231 Red Sea sites, which is why it is *rare* at 59 of 299 (see [the sanity check](#the-sanity-check)).
- **Small samples are tiered.** The Eastern Pacific (6 sites) and the Caribbean (11) animals are ranked on a handful
  of sites, and 1 of 11 is 9%. One record there moves a tier in two cases in five (Eastern Pacific) and one in five
  (Caribbean). The share and the sites are shown with each tier; a higher `--min-sites` leaves these on their
  catalogue tier.
- **A stray basin.** One animal recorded in a far basin by three records adds that basin's sites to its
  waters and lowers its share a little (the whale shark's waters include two southern temperate sites).
- **Thin provinces are not tiered** (14 animals, all cold water or never recorded) and keep their hand-assigned tier.
  The app mixes data tiers and hand tiers; only the species page says which.
- **Truncated lists.** iNaturalist lists were read in full for the 69 seeds (the longest has 2,247 taxa).
  The OBIS checklist is capped at `size=1000` (taxa, most records first) and `offset` is not honoured, so
  at busy sites the tail is cut. Animals with few OBIS records at those sites are missed by OBIS, but
  iNaturalist, read in full, still sees them, and a record counts only at 3 or more. The OBIS `total` can
  exceed the rows even when the list is not cut (203 against 197 at Richelieu Rock), so a list is flagged as
  cut only at 1,000 taxa.
- **Counts drift.** iNaturalist grows every day. Tiers are ranks, so most hold still; rerun now and then.
  The file records when it was made.
- **Names.** iNaturalist renames taxa. Looking up the taxon of every catalogue animal found three, all
  cuttlefish, now called *Ascarosepion* (broadclub, giant and flamboyant cuttlefish), which the synonym
  table (`src/lib/external-sightings/synonyms.ts`) did not know. The script adds them to its own matcher
  (`CURRENT_INATURALIST_NAMES` in `scripts/real-rarity/encounter-sites.ts`), so they count here.
- **A snapshot at build time,** shipped with the app. A new tier needs a new build.

## The files

`src/data/encounter-rarity.json` (about 24 KB, imported by the app):

```
{
  "version": 1,
  "generatedAt": "<ISO date>",             // null in a file with nothing generated
  "applied": false, "notApplied": "<why>", // only when the tiers are switched off
  "input": "encounter-rarity.sites.json",  // the per-site file it was read from, if not the network
  "sources": { "inaturalist": {...}, "obis": {...} },    // credit, licence, terms
  "method": { summary, radiusKm, sources, presence, minRecordsPerSite, minSiteTaxa, minSitesInWaters, cellKm (0: off),
              sitesAsked, sitesUsed, sitesPerBasin, basins: [{ id, name, rule }], bands, minSpecies, ties,
              // only with --cells: cellsUsed, cellsPerBasin, largestCell, widestCell },
  "species": {
    "<catalogue id>": { "share": 0.3065, "sites": 62, "recordedAt": 19, "basins": ["tropical-indo-pacific"], "tier": "uncommon" }
  },
  "unresolved": [ { "id", "scientificName", "reason" } ]
}
```

Every catalogue animal is in `species` or in `unresolved`, never both and never neither. `sites` is the used
sites in its waters (cells, with `--cells`) and `recordedAt` the ones that record it, `share` is `recordedAt / sites`
rounded to four places. `species` is in catalogue order, one per line.

`src/data/encounter-rarity.sites.json` (evidence, not imported by the app): per site, its coordinates, how many
taxa each source listed, whether a list was cut, and the counts of the catalogue animals found
(`{ "whale-shark": { "inaturalist": 3, "obis": 13 } }`). No observation, observer, photo or name beyond
the catalogue's is stored. It is the input of every offline recompute, and the provinces and cells are worked out
from its coordinates, so changing them needs no new fetch.

`src/data/real-rarity.json` (evidence, imported by the species page for the second line): per animal, the
worldwide `inaturalist.observations`, `observers`, `taxonId` and `obis.records`, and a log `score`.
**No `tier`.** `scripts/real-rarity/fetch.ts` writes it (`npm run fetch:real-rarity`, about 520 requests,
ten minutes). Its entries were fetched live on 22 October 2026; the earlier version of the script also wrote
a percentile `tier` from them, which was removed by recomputing the file from its own counts.

## The library

`src/lib/encounter-rarity.ts` (pure; nothing reads the network): `basinOf` (with the `RED_SEA` polygon), `BASINS`,
`isRecordedAt`, `siteEffort`, `encounterShares` (the share), `groupIntoCells` and `distanceKm` (the optional cells),
`tiersFromShares`, `bandCounts`, `RARITY_BANDS`, `buildEncounterData`, `parseEncounterData` (strict: a damaged
file is `null`, never half-used), `encounterTiersApplied`.

`src/lib/real-rarity.ts` (what the app imports):

| Export | Does |
| --- | --- |
| `REAL_RARITY` | `ReadonlyMap<speciesId, Rarity>` of the bundled encounter file, computed once. **Empty** when the file has not been generated, has its tiers switched off (`applied: false`) or is damaged. `CATALOG` applies it. |
| `realRarity(data?)` | The same for any encounter data. Never throws. |
| `realRarityEntry(id, data?, worldwide?)` | The encounter tier and numbers for one animal, with its worldwide counts beside them. Undefined when there is nothing true to say. |
| `describeRarityEvidence(entry)` | "Rare: recorded near 6 of 41 Indo-Pacific dive sites". Two basins are named ("Indo-Pacific and Red Sea"); three or more say "dive sites in its waters" with the basins in brackets; an animal recorded at none says "not recorded near any of the 41 ... dive sites". |
| `describeWorldwideCounts(entry)` | The second line: "2,654 iNaturalist observations and 845 OBIS records worldwide". Undefined without worldwide counts. |
| `rarityObservedNote(entry)` | The share card's note: "Recorded near 6 of 41 Indo-Pacific dive sites", at most 60 characters (`OBSERVED_NOTE_MAX`); it drops the basin, then "in its waters", rather than overrun. |
| `scoreSpecies`, `parseRealRarityData`, `readRawCounts`, `buildRealRarityData`, `REAL_RARITY_SOURCES` | The worldwide counts: score, strict reading, the script's `--input` and output, and the credit texts. |
| `rarityDifferences(catalog, tiers)` | Where a tier differs from the hand-assigned one, biggest first, for review. |

The wording says "dive sites" and the numbers are sites: it is true as shipped. A file written with `--cells`
counts cells in the same fields, and that wording would then overstate; do not bundle one.

The scripts are in `scripts/real-rarity/`: `encounters.ts` (entry), `encounters-cli.ts` (the run),
`encounter-sites.ts` (one site, the per-site file, the name matcher), `sanity.ts` (the check), `stability.ts`
(the leave-one-out table), and, for the worldwide counts, `fetch.ts`, `cli.ts`, `requests.ts` and `client.ts`.
Tests: `src/lib/__tests__/encounter-rarity.test.ts` (provinces, cells, shares, the minimum, bands, the file),
`encounter-script.test.ts` (the script, offline `--input` to a scratch `--out`, provinces and cells end to end, the
checked-in tiers against the checked-in records, the checkpoint, the stability table, the sanity check) and
`real-rarity.test.ts` (REAL_RARITY, the evidence wording, the worldwide file). Every fixture in them is hand-written
and says so.

## How it feeds the rewards and the share cards

The rewards engine takes an optional `observed` map, species id to tier, and
`effectiveRarity(species, observed)` returns that tier when there is one and the catalogue's otherwise (see
[rewards.md](rewards.md)). The tiers are applied once, where the catalogue is built (`CATALOG` in
`src/lib/catalog.ts`): every screen, the share cards and the rewards read `species.rarity`, so they all
show the encounter tier, and the hand-assigned one for the 14 animals without one or while the tiers are
switched off. `scripts/seed-supabase.ts` seeds the same tier to the remote catalogue.

Changing tiers changes which rarity badges an old log earns (the whale shark no longer earns "first
legendary"; seeing a grey reef shark, now epic, earns "first rare"); see the note in [rewards.md](rewards.md)
about not revoking what was celebrated. The rewards tests (`rewards-badges`, `rewards-islands`,
`rewards-evaluate`) mock the encounter file empty so they keep testing the engine against the hand-assigned tiers.

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
