# Real sightings at dive sites

ScubaGo can show what has really been recorded near a dive site, from two open sources:
**iNaturalist** (research-grade observations by its community) and **OBIS** (the Ocean Biodiversity
Information System). Records are matched to the 120 catalogue animals by scientific name, kept on the
device so they work offline, and credited to the people and organisations who made them.

**Status: the data layer is built and tested; no screen uses it yet. It has never been run against
the live iNaturalist or OBIS servers**: this environment could not reach either host, so the clients
were written from the documented APIs and tested only against small hand-written responses. See
[Not yet verified against the live APIs](#not-yet-verified-against-the-live-apis) before relying on
it. The research behind the licensing rules is in
[roadmap/external-sightings-research.md](roadmap/external-sightings-research.md); how this relates
to ScubaGo's own verified sightings is in [roadmap/sightings-architecture.md](roadmap/sightings-architecture.md).

## Where the code is

| Piece | File |
| --- | --- |
| The hook a screen uses | `src/hooks/use-site-sightings.ts` |
| Types: `SiteSightings`, `RecentSighting`, `SourceStatus` | `src/lib/external-sightings/types.ts` |
| Loading a site: cache, refresh, de-duplication | `src/lib/external-sightings/service.ts` |
| iNaturalist client and licence filtering | `src/lib/external-sightings/inaturalist.ts` |
| OBIS client | `src/lib/external-sightings/obis.ts` |
| Name matching, and the renames table | `names.ts`, `synonyms.ts` |
| Merging both sources into one summary | `summary.ts` |
| The offline cache | `cache.ts` |
| The polite request queue | `queue.ts` |
| Rarity from real data | `observed-rarity.ts` |
| Credit and licence texts for a credits screen | `attribution.ts` |
| Tests | `src/lib/__tests__/external-sightings-*.test.ts` |

## What is shown, and where it comes from

For each dive site the app builds one summary (`SiteSightings`) of the area within a radius of the
site. The radius is 3 km unless a caller asks for another (between 0.5 and 50 km).

- **Species recorded nearby.** Each catalogue animal that either source has records of, with:
  - iNaturalist: how many research-grade observations lie within the radius, and the date of the
    newest openly licensed one we hold (when that observation is among the recent ones below);
  - OBIS: how many records lie inside a box around the site.

  The list is ordered by evidence: animals both sources know first, then more iNaturalist
  observations, then more OBIS records.
- **Recent observations.** Up to 20 of the newest openly licensed iNaturalist observations of
  catalogue animals, newest first, at most 3 of any one animal. Each has the date it was seen, the
  observer's name, a link to the observation, its licence, a ready credit line, how far from the site
  it was (whole km) and, if its photo is openly licensed, a small photo with its credit.
- **How each source did.** Whether it answered, when, why not if it did not, the credit line, a
  one-sentence licence note, and a link to the same data on the source's own site.
- **Unmatched.** How many species-level taxa in each source are not in the catalogue. Taxa above
  species (a genus, a family) are ignored and not counted.

Nothing is ever invented. If a source is down, its part is missing or comes from the cache; with no
cache and no connection the hook reports `offline` and `summary` is `null`.

**Dates.** A sighting's date is the day the animal was seen (`observed_on`). The day it was uploaded
(`created_at`) is never read. An observation without an observation date is dropped, so it can
never look "recent".

## Licences and credits

The rules follow the research doc: for anything shown one record at a time, keep only **CC0** and
**CC BY** and credit every one.

- **iNaturalist observations.** Asked for with `license=cc0,cc-by`, and checked again on every
  record. CC BY-NC, CC BY-SA, CC BY-ND and all-rights-reserved observations are dropped. Each kept
  observation is credited to its observer ("© Ada Diver, CC BY 4.0 (iNaturalist)") and links to its
  page, `https://www.inaturalist.org/observations/<id>`.
- **iNaturalist photos.** A photo has its own licence. It is kept only if that licence is CC0 or CC BY
  *and* it is served from iNaturalist's open-data bucket (`inaturalist-open-data`); any other photo
  is left out and the observation is shown without one. The photo's own attribution string from
  iNaturalist is kept with it.
- **iNaturalist counts.** The number of observations near a site is a count of facts, so it includes
  every licence. No individual record, photo or name comes from the uncounted ones.
- **OBIS.** Only counts of records per species are used. They are aggregated facts, credited to
  "OBIS and its data providers". No individual OBIS record, dataset or photo is shown, because OBIS
  datasets carry their own licences (some are CC BY-NC) and handling each one is not done.
- **Texts for a credits screen** are in `attribution.ts`: `INATURALIST_CREDIT`, `OBIS_CREDIT`,
  `OBIS_CITATION`, `LICENCES` (names and links), and `REAL_SIGHTINGS_FOOTNOTE`. Each carries links to
  the source, its terms and its guidelines. ScubaGo is not endorsed by either source, and the texts
  say so.

The cache re-checks these rules when it reads a summary back, so a damaged or edited cache cannot
bring a non-open licence or an unknown photo host onto the screen.

## How a site is loaded

`useSiteSightings(site)` calls `sightingsService.load(site)`:

1. Read the cached summary. If there is one, hand it over at once.
2. If it is fresh, stop. If it is stale, missing, or made for a different radius, refresh.
3. A refresh asks both sources at the same time, each through its own lane of the request queue:
   - iNaturalist `GET /v1/observations/species_counts` (up to 3 pages of 200 species, most observed
     first), then, if any catalogue animals turned up, `GET /v1/observations` for the newest openly
     licensed observations of just those animals (their iNaturalist taxon ids come from the counts);
   - OBIS `GET /v3/checklist` for a polygon around the site.
4. Merge what came back into a summary and store it.

The requests for the example site (latitude -16.5, longitude 145.9) are:

- `https://api.inaturalist.org/v1/observations/species_counts?lat=-16.5&lng=145.9&radius=3&quality_grade=research&verifiable=true&iconic_taxa=Actinopterygii,Animalia,Mammalia,Mollusca,Reptilia&per_page=200`
- `https://api.inaturalist.org/v1/observations?lat=-16.5&lng=145.9&radius=3&quality_grade=research&verifiable=true&license=cc0,cc-by&order_by=observed_on&order=desc&per_page=30&taxon_id=<ids from the counts>`
- `https://api.obis.org/v3/checklist?geometry=POLYGON((145.8719%20-16.5269,145.9281%20-16.5269,145.9281%20-16.4731,145.8719%20-16.4731,145.8719%20-16.5269))`

**The OBIS box.** OBIS takes a polygon, not a circle, so the search area is a box around the site,
half a side of one radius each way. A degree of longitude shrinks towards the poles, so the east-west
reach is divided by the cosine of the latitude. The box is about a quarter larger in area than the
circle iNaturalist searches. Near the antimeridian it becomes two boxes (a `MULTIPOLYGON`).

**Matching names.** A scientific name is reduced to its lower-case binomial: author strings,
subgenera and subspecies are dropped ("Mobula alfredi (Krefft, 1868)" and "Chelonia mydas japonica"
become "mobula alfredi" and "chelonia mydas"), and anything not a species ("Mobula", "Mobula sp.",
"Mobula cf. alfredi", hybrids) is set aside. Each catalogue animal matches its own name, plus the
renames in `synonyms.ts`: former genera (Manta alfredi and Manta birostris are now Mobula; Eugomphodus
and Odontaspis taurus are Carcharias taurus), spelling variants, and splits (the Pacific goliath grouper
*Epinephelus quinquefasciatus* counts as the goliath grouper). A test requires every target to be a
real catalogue id.

Four entries are deliberate lumps rather than renames, because divers log these animals under one
catalogue entry: the Indo-Pacific bottlenose dolphin (*Tursiops aduncus*), the orange clownfish
(*Amphiprion percula*, "Nemo"), the devil firefish (*Pterois miles*) and the hoodwinker sunfish
(*Mola tecta*). Delete a line in `synonyms.ts` to make the matching stricter.

## Caching and offline use

- **Where.** AsyncStorage, one key per site, `scubago.realSightings.v1.<siteId>`, plus an index key
  that remembers the order of use. At most **300 sites** are kept; adding more removes the least
  recently used. Reading a site counts as using it.
- **How long.** A summary whose sources all answered is good for **7 days**. If a source failed, or
  the recent list could not be read, the summary is tried again after **1 hour**.
- **Stale-while-revalidate.** The cached summary is shown immediately (`stale` status if it is old),
  and the refresh runs behind it. When it succeeds the screen changes to `ready`.
- **When a refresh fails.** The cache is left as it is and the error is reported (`offline` for no
  connection or a timeout, `error` for anything else), with the cached summary still available. If
  only one source fails, the other still updates, and the failed one keeps its older data: its
  status reads `ok` with an `error` and its old `fetchedAt`. After a failed refresh the same site
  is not tried again for a minute unless `refresh()` is called.
- **Corrupt entries** (not JSON, wrong version, wrong site, missing parts) are ignored and removed.
  A lost or damaged index is rebuilt from the stored keys. Storage failures are never errors.
- **Sharing.** Two screens asking for the same site at once cause one set of requests. Leaving a
  screen cancels its request, unless another is still waiting for it.

## Rate limits

- **iNaturalist** asks for about one request a second (at most 100 a minute, under 10,000 a day).
  Requests to it start at least **1.1 s** apart, one at a time. A site costs two to five requests;
  fetching all 69 seeded sites would take roughly three to five minutes.
- **OBIS** publishes no figure. Requests to it start at least 0.5 s apart, one at a time.
- The two hosts are queued separately, so they run side by side.
- A **429** holds that host back for the time in `Retry-After` (a minute if none). A wait of more than
  15 s is not waited out: the request fails at once and shows as an error, so a diver is not left
  watching a spinner.
- A request that has not answered in 20 s is given up on.
- `sightingsService.prefetch(sites)` refreshes missing and stale sites one after another, for a
  background top-up. It stops at the first sign of no connection.

## Privacy

- **No coordinates are kept.** An observation's position is used once, to work out its distance from
  the site, and dropped. The summary holds "within N km" (rounded up to whole km) and nothing else.
  The only coordinates anywhere in a summary are the site's own, inside the link back to iNaturalist.
- **Obscured locations.** iNaturalist hides the true place of threatened species and of observations
  whose observer asked for it. For those, no distance is given at all (`locationObscured` is true),
  because an obscured position says nothing true about how near it was.
- **Observers** are shown by the name or login they chose on iNaturalist, as the licence requires.
- Nothing is sent to either source but the site's position, the search radius and the search filters.
  No account, key or user information is involved.

## Rarity from real data

`observedRarity(summaries, CATALOG)` returns, for each catalogue animal, `{ tier, share, sites }`:
the share of summarised sites where it was recorded (an iNaturalist observation or an OBIS record
within the radius). `observedTiers(...)` returns just `Map<speciesId, Rarity>` (typed
`ReadonlyMap<string, Rarity>`), the form the rewards engine takes.

| Tier | Recorded at |
| --- | --- |
| Common | 25% of sites or more |
| Uncommon | 10% to under 25% |
| Rare | 4% to under 10% |
| Epic | 1.5% to under 4% |
| Legendary | under 1.5%, but at least once |

- **Enough data first.** With fewer than **10** summarised sites, the map is empty and the catalogue
  tiers stand. A site counts only if at least one source answered; each site counts once, from its
  newest summary.
- **Absence is not rarity.** An animal recorded at no summarised site is left out, so it keeps its
  catalogue tier: no records means the data is thin, not that the animal is rare.
- **Scoping.** Pass `{ siteIds }` to judge sites against a region's own sites (the 10-site minimum
  applies to the region). Without it every summary counts.
- **The numbers are first guesses.** They were picked so that with the 69 seeded sites an animal seen
  at one site is legendary and one at 18 or more is common (`RARITY_THRESHOLDS`). They should be tuned
  once real data is in, and the result compared with the catalogue tiers before it replaces them.
- To work it out across many sites: `observedTiers(await readCachedSummaries(siteIds), CATALOG)`
  uses only what is cached; `prefetch` fills the cache first.

## Not yet verified against the live APIs

Everything below is from the documentation and memory, and needs one real call to confirm:

1. **iNaturalist.** Parameter names (`quality_grade`, `verifiable`, `license`, `order_by=observed_on`,
   `order`, `per_page`, `taxon_id`, `lat`/`lng`/`radius` in km); that `per_page=200` is accepted by
   `species_counts`; the fields read (`results[].count`, `results[].taxon.{id,name,rank}`,
   `total_results`; observations: `id`, `observed_on`, `quality_grade`, `license_code`, `user.{login,name}`,
   `taxon.{id,name,rank}`, `geojson.coordinates` as [lng, lat], `obscured`, `geoprivacy`,
   `taxon_geoprivacy`, `photos[].{url,license_code,attribution}`); that photo URLs for openly licensed
   photos are on `inaturalist-open-data.*` (if not, photos silently disappear); that
   `species_counts` rolls subspecies into their species.
2. **OBIS.** That `/v3/checklist` accepts `geometry` as WKT (including `MULTIPOLYGON`), returns
   `{ total, results: [{ scientificName, acceptedNameUsage, records, taxonRank }] }`, and how many
   rows it returns without a `size` (a `size` or `after` paging may be needed); that `records` counts
   a record under its own taxon, so subspecies rows add up.
3. **Browsers.** That both hosts answer cross-origin requests from a web build. Only an `Accept`
   header is sent, so no pre-flight is needed.
4. **Terms.** The links in `attribution.ts` for the OBIS policy and citation pages
   (`manual.obis.org`), and OBIS's wording for citation, should be opened and checked.
5. **The synonym list** is taxonomy from memory. Check it against WoRMS and iNaturalist's taxonomy.

## Known limitations

- **Not tested live** (above). First run it against one site and read the result before building on it.
- **Where the counts are cut off.** `species_counts` reads at most 600 species per site, most
  observed first; near a busy coast the many land species can crowd out rarely observed marine ones.
  A source with more taxa than it read reports `truncated`. A filter to marine groups, or
  more pages, is the fix once the live responses are seen. OBIS is read in one page.
- **The recent list** only covers openly licensed observations, so "newest" means newest of those. It
  holds up to 30 observations of the animals the counts found, before the cap of 20 and 3 per animal.
- **No OBIS dates.** Only record counts; there is no "last recorded" for OBIS (a per-species
  `GET /v3/occurrence` call would cost one request per animal).
- **Counts are not effort-corrected.** Many observations at a popular site, or one keen observer, make
  an animal look more common. The share of sites is a blunt measure, worse for regional animals.
- **The box is not a circle**, and positions in the seed data are site-marker precision, so a few
  hundred metres of error either way is normal.
- **No User-Agent is sent.** iNaturalist asks apps to identify themselves; browsers do not allow it
  and native builds would need an agreed contact. `createSightingsService({ headers })` can add one.
- **Whole-site data only.** Nothing separates dives from snorkelling, depth, or season.
- **No cache clearing in the interface.** `clearCachedSightings()` exists for a settings screen.

## Using it from a screen

```ts
const { summary, status, refresh } = useSiteSightings(site);
```

- `summary` is `null` until there is something real to show. `species[].speciesId` is a catalogue id:
  look it up in `CATALOG_BY_ID`.
- `status`: `idle` (no site), `loading` (nothing yet), `stale` (old copy, refreshing), `ready`,
  `offline` or `error` (refresh failed, `summary` may still hold the cached copy).
- Show `recent[].credit` and link to `recent[].url`; show a photo only with its `attribution`.
- Show "observed <date>" from `observedOn`, and a distance only as "within N km" when
  `distanceKm` is present.
- Wherever any of it appears, link to a credits screen built from `attribution.ts`.
