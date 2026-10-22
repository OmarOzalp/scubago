# Rarity from real data

Each of the 120 catalogue animals has a tier (common, uncommon, rare, epic, legendary) that was
assigned by hand. This turns it into a tier worked out from how often the animal is recorded at all,
by **iNaturalist** (research-grade observations) and **OBIS** (the Ocean Biodiversity Information
System). A build-time script asks both once and bundles the answer; a small library turns the
bundle into tiers. Nothing is asked on the phone, so the tiers do not depend on what a device
happens to have cached.

**Status (October 2026): built and tested offline, and not yet run against the live services.**
This environment blocks `api.inaturalist.org` and `api.obis.org`, so `src/data/real-rarity.json` is
checked in empty (`{ "generatedAt": null, "species": {} }`), the library returns an empty map for
it, and every animal keeps its hand-assigned tier. No count in this repository was typed in: the
tests use small hand-written fixtures (marked as such), and the script has only ever been run on
those. Run it from a machine that can reach both hosts (see [Running it](#running-it)).

The API documentation could not be read from here either. `WebFetch` could not resolve either host,
and a web search returned only third-party material (the R package `robis`, `pyinaturalist`, an ALA
mirror of the iNaturalist reference). The request shapes are therefore from the documented APIs as I
know them, and a few details need one real call to confirm; see
[Not yet verified against the live APIs](#not-yet-verified-against-the-live-apis).

How this relates to the per-site client: [real-sightings.md](real-sightings.md) summarises what has
been recorded *near a dive site*, and its `observed-rarity.ts` tiers an animal by the share of
summarised sites it appears at, which needs at least 10 sites on the device. This is the global
tier that does not.

## What the tiers mean

A tier says **how often the animal is recorded in the open data, worldwide, compared with the other
animals in the catalogue.** It is a ranking, not a probability of seeing the animal on a dive, and
not a conservation status. The 120 animals are ranked by a score (below) and cut into percentile
bands, most recorded first:

| Tier | Share of the catalogue | Of the 120 today | Hand-assigned today |
| --- | --- | --- | --- |
| Common | the most recorded 28% | 34 | 33 (27.5%) |
| Uncommon | the next 21% | 25 | 25 (20.8%) |
| Rare | the next 26% | 31 | 31 (25.8%) |
| Epic | the next 15% | 18 | 19 (15.8%) |
| Legendary | the least recorded 10% | 12 | 12 (10.0%) |

The bands are the hand-assigned shares rounded to whole percents, so the shape of the collection
stays the same and only who sits where changes. Legendary stays the rarest tenth, and it stays that
way because it is a percentile: whatever the counts turn out to be, about one animal in ten is
legendary. The edges are `round(cumulative % × n / 100)` of the species that have a tier, so with 120
species the cuts fall after the 34th, 59th, 90th and 108th. `bandCounts(n)` gives the split for any
`n`.

## Where the counts come from

For each catalogue animal, under its scientific name and the other names the synonym table gives it
(below), one source each:

| Source | What is counted | Request |
| --- | --- | --- |
| iNaturalist | Research-grade observations of the taxon and everything below it, worldwide | `GET /v1/observations?taxon_id=…&quality_grade=research&verifiable=true&per_page=0`, reading `total_results` |
| iNaturalist | Distinct observers of those observations | `GET /v1/observations/observers?taxon_id=…&quality_grade=research&verifiable=true&per_page=0`, reading `total_results` |
| OBIS | Occurrence records under any of the names | `GET /v3/occurrence?scientificname=…&size=0`, reading `total` |

The iNaturalist taxon is found first with `GET /v1/taxa?q=<name>&rank=species&is_active=true&per_page=10`.
A result is trusted only if it is an active species called the name asked for, or lists it as another
name (`matched_term`); anything else is a fuzzy hit and is ignored.

The requests for *Rhincodon typus* (the whale shark), exactly as the script sends them. The taxon id
comes from the first answer, so it is shown as `<id>`:

```
https://api.inaturalist.org/v1/taxa?q=Rhincodon%20typus&rank=species&is_active=true&per_page=10
https://api.inaturalist.org/v1/observations?taxon_id=<id>&quality_grade=research&verifiable=true&per_page=0
https://api.inaturalist.org/v1/observations/observers?taxon_id=<id>&quality_grade=research&verifiable=true&per_page=0
https://api.obis.org/v3/occurrence?scientificname=Rhincodon%20typus&size=0
```

**Synonyms.** The names come from `src/lib/external-sightings/synonyms.ts`, so the global count is
of the same animals the app counts at a dive site. Reef manta is asked for as *Mobula alfredi* and
*Manta alfredi*; the ocean sunfish as *Mola mola*, *Mola ramsayi*, *Mola alexandrini* and *Mola
tecta* (one of the table's four deliberate lumps). Two things keep a renamed animal from counting
twice:

- every name is resolved to an iNaturalist taxon, and the taxon ids are de-duplicated before the
  counts are asked for, in one request (`taxon_id=5,9`);
- OBIS gets all the names in one comma-separated `scientificname`, so a record is counted once
  however many of the names it fits.

A synonym that the matcher gives to a different catalogue animal is left out, as in the app.
`namesForSpecies` builds the list (`scripts/real-rarity/requests.ts`).

## The score

```
score = 0.40 × log10(1 + observers)
      + 0.25 × log10(1 + observations)
      + 0.35 × min(log10(1 + records), 5)
```

`observers` and `observations` are iNaturalist's; `records` is OBIS's. The score is rounded to three
decimals, so a saved file always recomputes to the same tiers, and is 0 only with no evidence at all.
`scoreSpecies` in `src/lib/real-rarity.ts`. Why it is built this way:

- **Logs.** Counts run from a handful to hundreds of thousands. On a log scale a tenfold increase
  adds the same amount, so a few enormous numbers cannot swamp the rest. Each count never lowers the
  score when it goes up.
- **iNaturalist is biased to charismatic animals.** People photograph a whale shark or a manta far
  more than a goby, so raw observations overstate the showy animals. Distinct *observers* gets the
  largest weight (0.40): one keen diver posting 400 photos of one reef counts once.
- **OBIS is biased to surveys.** Most of its records are survey and monitoring rows, so a reef fish
  that a programme counts on every transect piles up hundreds of thousands of records, and tracked
  sharks, turtles and whales add a row per position. So its log stops at 5 (100,000 records) and its
  weight (0.35) is below iNaturalist's combined 0.65. Each source covers the other's blind spot and
  neither can decide the score alone. A species with five million OBIS rows and nothing else scores
  below one with 1,000 iNaturalist observations by 500 observers (a test checks this).
- **Observers missing.** If the observers count could not be fetched, the observations carry its
  weight too, so such a file is on the same scale. Observers can never exceed observations.

The weights and the cap are first guesses, picked for the reasons above, not tuned on data. Tune them
(`SCORE_WEIGHTS`, `OBIS_LOG_CAP`) once the first real run can be compared with the hand-assigned tiers.

## Who gets a tier

An animal gets a tier only if iNaturalist resolved its name to a taxon **and** its score is above 0.
Otherwise it is listed under `unresolved` with the reason and **keeps its catalogue tier** in the app:
no records says the data is thin, or that a name did not match, not that the animal is rare.

- No iNaturalist taxon matched any of its names: probably a rename the synonym table lacks. An
  OBIS-only score would make it look rare for the wrong reason.
- Zero research-grade observations and zero OBIS records.
- A request failed. The file is not written and the checkpoint is kept, unless `--allow-incomplete`,
  which writes it and lists those species here.
- In a region: no record there.

Equal scores share a tier, **the more common one**, so a tie never pushes an animal into a rarer band
than one it ties with and legendary cannot grow by ties. With fewer than **20** species scored
(`MIN_SPECIES_FOR_TIERS`) nobody is tiered, because percentiles of three animals mean nothing. The
"unlisted" species (id `unlisted`, "something else") is never scored or tiered.

OBIS holding no record under any name is *not* a reason to withhold a tier (iNaturalist still
answered), but the run prints those animals so their names can be checked.

## Running it

It needs network access to both hosts. From the repository root:

```
npx tsx scripts/real-rarity/fetch.ts
```

About 520 requests (160 names to resolve, then 3 counts for each of the 120 animals), one at a time,
so roughly **ten minutes**. The first time, look at one animal before committing to the whole run:

```
npx tsx scripts/real-rarity/fetch.ts --only whale-shark --dry-run
```

| Option | Meaning |
| --- | --- |
| `--input <file>` | Recompute from saved counts, with no network: the script's own output, a checkpoint, or a hand-made file. Any `score` and `tier` in it are ignored and worked out again. |
| `--out <file>` | Where to write. Default `src/data/real-rarity.json` (`src/data/real-rarity.<region>.json` with `--region`). |
| `--region gbr\|red-sea` | Count inside a box only (below). |
| `--only <ids>` | Fetch just these catalogue ids; a dry run unless `--out` is given. |
| `--dry-run` | Print the summary and write nothing, not even a checkpoint. |
| `--fresh` | Ignore a checkpoint and start over. |
| `--allow-incomplete` | Write the file even if some species could not be fetched; they are listed as unresolved. |
| `--min-species <n>` | Fewest scored species that may be placed in bands (default 20). For small hand-made files. |
| `--contact <text>` | An email or URL for the User-Agent (or set `REAL_RARITY_CONTACT`). |

**Politeness.** One request at a time, to either host, at least **1.1 s** between starts (the
iNaturalist guideline is about one a second; OBIS publishes no figure, so it gets the same). The
User-Agent names ScubaGo and the repository. A **429** waits for `Retry-After` (else 30 s, doubling);
a **5xx**, a time-out (30 s) or a dropped connection waits 5 s, doubling, for up to 5 tries. A request
that still fails stops that species, not the run. Five species in a row failing stops the run: the
network is down. It uses the request queue from `src/lib/external-sightings/queue.ts` (all hosts in
one lane) and its error types.

**Resume.** After each species the script saves `<out>.partial.json` (a file of raw counts, which
`--input` can read). Run it again and it skips the species already fetched. The checkpoint is deleted
when the final file is written. A checkpoint made for a different region is refused. Species whose
name matched nothing are not saved, so they are asked again after you fix the synonym table. Add
`src/data/*.partial.json` to `.gitignore`.

**Offline.** `--input saved.json` never touches the network, so a tuning change (weights, bands) can be
tried on the counts from the last run. Use it on a real run's output, never on a hand-written fixture
into the real file: `scripts/real-rarity/fixtures/raw-sample.json` is made-up numbers for tests.

**After a run,** read the summary it prints: the tier counts against the hand-assigned ones, every
unresolved species with its reason, the animals OBIS has nothing for, and the species whose tier
differs from the catalogue, biggest first (`rarityDifferences`). Fix names in `synonyms.ts` and run
again; review the differences before the real tiers replace the hand-assigned ones; then commit
`src/data/real-rarity.json`.

### Regions

`--region gbr` or `--region red-sea` takes every count inside a bounding box
(iNaturalist `nelat`, `nelng`, `swlat`, `swlng`; OBIS `geometry` as a WKT polygon), so a region's own
tiers can be computed later. The taxon lookup stays worldwide.

| Region | Box (south, west, north, east) |
| --- | --- |
| `gbr` | −24.5, 142.2, −10.7, 154.5: the Great Barrier Reef and inner Coral Sea, the box the OpenStreetMap import uses |
| `red-sea` | 12.5, 32.2, 30.2, 43.8: the Red Sea with the Gulf of Suez and the Gulf of Aqaba, stopping short of the Mediterranean and the Gulf of Aden |

The boxes are coarse and take in some land and neighbouring water. Tiers are percentiles among the
animals recorded *in that region*; an animal with no record there gets none. The output carries
`"region": "gbr"`, and `realRarity(thatFile)` reads it like the global one. **Nothing in the app
uses a regional file yet.** The region ids are not wired to dive sites or to `regions.ts`.

## The file

`src/data/real-rarity.json`. The shape, with types where there would be numbers:

```
{
  "version": 1,
  "generatedAt": "<ISO date>",            // null in the file as checked in
  "region": null,                         // "gbr" | "red-sea" for a regional file
  "input": null,                          // the saved file the counts were read from, if not the network
  "sources": { "inaturalist": { name, url, api, credit, licence, terms },
               "obis": { name, url, api, credit, citation, licence, terms } },
  "method": { summary, score, weights, obisLogCap, bands, bandsOrder, minSpecies, ties, scope },
  "species": {
    "<catalogue id>": {
      "inaturalist": { "observations": <n>, "observers": <n>, "taxonId": <n>, "taxonIds": [<n>] },
      "obis": { "records": <n> },
      "score": <number>, "tier": "<common … legendary>"
    }
  },
  "unresolved": [ { "id", "scientificName", "reason" } ]
}
```

`taxonIds` appears only when more than one iNaturalist taxon was counted (a lump). Every catalogue
animal is in `species` or in `unresolved`, never both and never neither. `species` is in catalogue
order, one per line, so a re-run is a small diff.

## The library

`src/lib/real-rarity.ts`. Pure; nothing reads the network.

| Export | Does |
| --- | --- |
| `scoreSpecies(counts)` | The score above. |
| `tiersFromScores(scores, { minSpecies }?)` | Percentile bands over a map or object of scores; ties, zeros and "unlisted" handled as above. |
| `bandCounts(n)`, `tierCounts(tiers)`, `RARITY_BANDS`, `MIN_SPECIES_FOR_TIERS` | The band sizes and a tally. |
| `realRarity(data?)` | `ReadonlyMap<speciesId, Rarity>` from the file (default: the bundled one). Empty when `generatedAt` is null or the data is damaged. Never throws. |
| `REAL_RARITY` | `realRarity()` of the bundled file, computed once. Use this in a hook: a new map on every render would make a memo that depends on it recompute. |
| `parseRealRarityData(json)` | The strict check behind `realRarity`: any malformed species, tier, score or count rejects the whole file (`null`), so a damaged file is never half-used. |
| `rarityDifferences(catalog, tiers)` | Where the real tier differs from the hand-assigned one, biggest first, for review. Species with no real tier are not differences. |
| `readRawCounts(json)`, `buildRealRarityData(options)` | What the script's `--input` and output use. |

The script is `scripts/real-rarity/`: `fetch.ts` (entry), `cli.ts` (the run), `requests.ts` (URLs and
readers), `client.ts` (the polite client), `fixtures/raw-sample.json` (hand-written, for tests).
Tests: `src/lib/__tests__/real-rarity.test.ts`.

## How it feeds the rewards and the share cards

The rewards engine takes an optional `observed` map, species id to tier, and
`effectiveRarity(species, observed)` returns that tier when there is one and the catalogue's
otherwise (see [rewards.md](rewards.md)). `realRarity()` returns exactly that map, empty until the
data exists, so passing it changes nothing until the script has run and then changes every reward
that reads a rarity: the "first rare / epic / legendary" badges and the island hints.

The tiers are applied once, where the catalogue is built (`CATALOG` in `src/lib/catalog.ts`): every
screen, the share cards and the rewards read `species.rarity`, so they all show the real tier once it
exists, and the hand-assigned one until then (and for any species without a real tier).
`scripts/seed-supabase.ts` seeds the same tier to the remote catalogue, the Data & credits screen
credits iNaturalist and OBIS for the counts, and `npm run fetch:real-rarity` runs the script.
`useObservedRarity()` in `src/hooks/use-rewards.ts` is left for per-region tiers.

When both exist, the per-site `observedTiers` (real-sightings.md) can be layered over the global tiers
for a diver's own region. Changing tiers changes which rarity badges an old log earns; see the note in
[rewards.md](rewards.md) about not revoking what was celebrated.

## Credits and licences

The counts are facts, so they carry no licence of their own; ScubaGo still credits where they come
from, and `sources` in the file says so.

- **iNaturalist:** "Observations by iNaturalist observers (inaturalist.org)". Only research-grade
  counts are used. No observation, photo or observer name is stored. Terms:
  https://www.inaturalist.org/terms.
- **OBIS:** "OBIS and its data providers (obis.org)", cited as "OBIS. Ocean Biodiversity Information
  System. Intergovernmental Oceanographic Commission of UNESCO. https://obis.org". OBIS datasets carry
  their own licences (CC0, CC BY, CC BY-NC); only a total is stored, never a record or a dataset.
  Policy: https://manual.obis.org/policy.html.

ScubaGo is not endorsed by either. The texts match `src/lib/external-sightings/attribution.ts`.

## Not yet verified against the live APIs

Everything here is from the documentation as I know it. One real call each should confirm:

1. **iNaturalist `per_page=0`.** The reference lists `per_page` as 1 to 200. If 0 is refused (400 or
   422) the script asks again with 1 (it does this for every count), so the worst case is one wasted
   request.
2. **`/v1/taxa`.** That `q` also matches a taxon's former names, returned with `matched_term` (this is
   how a synonym resolves to the current taxon); that `rank=species` and `is_active=true` are accepted;
   the fields read (`id`, `name`, `rank`, `is_active`, `matched_term`, `observations_count`).
3. **`taxon_id` with several ids,** and that it includes descendants (subspecies).
4. **`/v1/observations/observers`:** that `total_results` is the number of different observers. If the
   endpoint refuses the request (a 4xx), the observers count is left out for that species, with a note.
5. **`nelat`/`nelng`/`swlat`/`swlng`** on both iNaturalist endpoints, for `--region`.
6. **OBIS `size=0`** returns `{ total, results: [] }` (refused sizes fall back to 1); that
   `scientificname` takes a comma-separated list and counts the union; whether it matches only the
   accepted (WoRMS) name, in which case a former name adds nothing (harmless); and `geometry` as WKT
   on `/occurrence` for `--region`.
7. **Rate limits,** OBIS's especially, and whether either host wants an API key or contact in the
   User-Agent for a run this size.
8. **The synonym list** is taxonomy from memory (see real-sightings.md). The first run's "no
   iNaturalist taxon matched" list is the quickest test of it.

## Known limitations

- **Effort bias.** Records follow observers. Animals of popular dive areas (the Red Sea, Indonesia,
  the Caribbean, California) and charismatic animals (sharks, rays, turtles, nudibranchs) are
  recorded far more than equally common animals of cold, deep or remote water. The score softens this
  (distinct observers, a capped OBIS log) but cannot remove it.
- **Global, not local.** An animal can be common at the dive sites where it lives and still rank low
  worldwide: a wobbegong, a garibaldi. The tier is not "how likely here". Per-site rarity is
  real-sightings.md's; `--region` is a step towards per-region.
- **Research grade needs an identification other people agree on,** so cryptic and hard-to-photograph
  animals are under-counted on iNaturalist, and OBIS is weighted down for the opposite reason.
- **A ranking, not a measure.** Percentile bands put 10% of the catalogue in legendary whatever the
  counts say; an animal can be legendary only because the other 119 are recorded more.
- **Counts drift.** iNaturalist grows every day. Tiers are ranks, so most hold still, but re-run now
  and then; the file records when it was made.
- **Names.** An animal whose taxon moves (a split, a new genus) can fall out, and shows up as
  unresolved. The lumps in `synonyms.ts` mean a few catalogue entries count more than one species.
- **A snapshot at build time,** shipped with the app. A new tier needs a new build.

## On the species page

The species page says where its tier comes from, under the rarity chip
(`src/components/sightings/rarity-source.tsx`, fed by `realRarityEntry(id)` in `real-rarity.ts`):

- **With a real tier:** "Rare, ranked from 2,314 iNaturalist observations by 1,102 observers and 845
  OBIS records worldwide", then "A ranking among ScubaGo's animals, not a promise of seeing one.", and a
  link to Data & credits. The sentence is `describeRarityEvidence(entry)`: numbers have thousands
  separators, a source that was not counted is left out (not shown as 0), a source that was asked and
  held nothing says "no OBIS records", and an entry with no counts names the sources without numbers.
- **Without one** (the file is empty, as checked in; the species is `unresolved`; the file is damaged):
  "Rarity is ScubaGo's own estimate for now." No numbers and no link, so a hand-assigned tier is never
  passed off as data.

`realRarityEntry(id, data?)` returns the species' entry only from a generated, worldwide file: `undefined`
when `generatedAt` is null, when the file is damaged, when it is a regional file (its counts are not
worldwide) and for the "unlisted" id. The bundled file is checked once, not on every call.

**The discovery card's note.** When the species has a real tier, the page passes
`rarityObservedNote(entry)` as `observedNote` to `ShareDiscoveryButton`: "Ranked Rare from 2,314
iNaturalist observations worldwide". It is held to 60 characters (`OBSERVED_NOTE_MAX`; the card sets the
note in two lines of italic type): if "worldwide" would not fit it is dropped, and if the count would not
fit either the line reads "Ranked Rare from public records worldwide". With no iNaturalist observations it
uses the OBIS record count; with no counts, no number. Without a real tier nothing is passed and the card
has no note.

Tests: `src/lib/__tests__/real-rarity.test.ts` ("the evidence behind one species' tier", hand-written
entries) and `src/components/__tests__/species-records-screen.test.js` (the page, with a stand-in for
`realRarityEntry` because the bundled file is empty).

