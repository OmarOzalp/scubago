# Real sightings at dive sites

ScubaGo can show what has really been recorded near a dive site, from two open sources:
**iNaturalist** (research-grade observations by its community) and **OBIS** (the Ocean Biodiversity
Information System). Records are matched to the 120 catalogue animals by scientific name, kept on the
device so they work offline, and credited to the people and organisations who made them.

**Status: built, tested, shown on every dive site's page (see [Screens](#screens)), and checked
against the live iNaturalist and OBIS APIs** (see [Checked against the live APIs](#checked-against-the-live-apis)). The research behind the licensing rules is in
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
- `https://api.obis.org/v3/checklist?geometry=POLYGON((145.8719%20-16.5269,145.9281%20-16.5269,145.9281%20-16.4731,145.8719%20-16.4731,145.8719%20-16.5269))&size=1000`

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

## Checked against the live APIs

On 22 October 2026 the clients ran against the live services for SS Yongala, Cod Hole, Shark &
Yolanda Reef and the Blue Hole (Dahab):

1. **iNaturalist.** The parameters, fields and paging work as written. `species_counts` took
   `per_page=200` and returned 190 to 330 marine taxa per site, 11 to 23 of them catalogue animals
   (at Shark & Yolanda Reef: the bluespotted ribbontail ray, sea goldie, giant moray, Napoleon wrasse,
   circular batfish and more). Recent CC0 / CC BY observations came back with observers, dates and
   open photos on `inaturalist-open-data.s3.amazonaws.com`. Some sites have none under an open
   licence (SS Yongala), and then the list is simply empty.
2. **OBIS.** `/v3/checklist` takes the WKT box and returns `{ total, results: [{ scientificName,
   acceptedNameUsage, taxonRank, records, … }] }`, but only **10 rows unless `size` is given**: the
   client now asks for `size=1000` (`CHECKLIST_SIZE`), a whole reef's list (469 taxa off Ras
   Mohammed). A box with more than 1000 taxa (SS Yongala) is marked `truncated`.
3. **Browsers.** Both hosts answer `Access-Control-Allow-Origin: *`, so the web build can call them.

Still to check by hand: the OBIS policy and citation links in `attribution.ts`, and the synonym list
against WoRMS and iNaturalist's taxonomy.

## Known limitations

- **Not tested live** (above). First run it against one site and read the result before building on it.
- **Where the counts are cut off.** `species_counts` reads at most 600 species per site, most
  observed first; near a busy coast the many land species can crowd out rarely observed marine ones.
  A source with more taxa than it read reports `truncated`. A later page that fails is not that: the
  pages before it are kept, the source reports an `error`, and it is tried again within the hour. A filter to marine groups, or
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

## Screens

The data layer now has two screens. Neither shows anything the data layer did not return: with no
summary there is no list, and a source that did not answer is named, never counted as "no records".

### The site page: "Marine life recorded here"

`src/app/site/[id].tsx` renders `SiteSightingsSection` (`src/components/sightings/`) between "What
divers see here" and the "Log a sighting here" button, so it sits beside the curated list and above the
page's own ScubaGo sightings. For a site with no curated `notableSpecies` (the imported OpenStreetMap
sites) the curated list is simply absent and this section is the page's "what's here".

The section is labelled **Public records** and says in its first lines that the records are not ScubaGo
sightings and are not checked by ScubaGo. It is drawn by `RealSightingsView`, which takes
`summary`, `status` and callbacks as props (no hook, no network), so every state can be drawn from a
hand-written summary. `SiteSightingsSection` is the thin piece that calls `useSiteSightings(site)`.

| File | Job |
| --- | --- |
| `format.ts` | `buildModel(summary, status, now)`: what to draw, and the wording helpers. Pure. |
| `real-sightings-view.tsx` | The section, its states and its footer. |
| `species-evidence-list.tsx` | The animals: plate, name, one line per source, newest date, link to the species page. First 8, then "Show all N". |
| `recent-observations.tsx` | The first 5 recent observations: species, date, "within N km", credit, optional photo and its credit, link to iNaturalist. |
| `states.tsx` | Placeholder, "couldn't reach", empty, notices, "Updated N days ago". |
| `open-external.ts`, `link-line.tsx` | Open a secure link (in-app browser on a phone, a new tab on the web). |

What each state shows:

| Hook says | The section shows |
| --- | --- |
| `loading`, no summary | Three ruled placeholder lines and "Looking up public records…". No spinner. The lines breathe, unless Reduce Motion is on. |
| `ready` | The animals, the recent observations, "See more on iNaturalist", the credit line, "Updated today / N days ago". |
| `stale` | The cached copy with "Updated N days ago · refreshing…". |
| `offline` / `error` with a summary | The cached copy, a note ("You're offline. Showing records saved 3 days ago." or "Couldn't refresh the public records…") and "Try again" (calls `refresh`). |
| `offline` / `error`, no summary | "Couldn't reach the public records right now." with a one-line reason and "Try again". Nothing is credited or counted. |
| `ready`, nothing matched | "No public records of catalogue species within N km yet." (naming the source that answered, if the other did not). On a site with no curated list it adds that ScubaGo has no list either. |
| `idle` | Nothing. |

Per-source flags are respected. A source with `ok: false` is named ("OBIS couldn't be reached, so its
records aren't included") and left out of the credit line. A source with `ok` and an `error` says its
records are from an earlier day. A `truncated` source says a rarely recorded animal may be missing. If
iNaturalist answered but no recent observation is openly licensed, the counts stay and a line says so.

What is and is not shown:

- Evidence is "N iNaturalist observations" and "N records in OBIS datasets", one line each. The credit line
  at the foot is the `attribution` text of each source that answered, followed by "Data & credits".
- "Newest on file" is `lastObservedOn`: the newest openly licensed observation the app holds, not the
  newest observation anywhere.
- A recent observation shows `credit` as given, its observation date (`formatDate`), "within N km" only when
  `distanceKm` exists (never for an obscured place) and a link to its iNaturalist page. A photo is drawn
  only from an https address and only with its `photo.attribution`; if it fails to load, its credit line goes
  with it.
- Links are opened only if they are on `https://www.inaturalist.org/` (observations, the explore link taken
  from the iNaturalist `SourceStatus.url`). Species or observations that are not in the catalogue, or whose
  date is not `yyyy-mm-dd`, are dropped before drawing. Coordinates are never drawn.
- Not shown: `unmatched` (it counts land animals and others, which would read as marine life), catalogue
  rarity (it would sit oddly next to real counts), and any individual OBIS record.

### Data & credits: `src/app/credits.tsx`

Registered in `src/app/_layout.tsx`. Covers iNaturalist and its observers (the `attribution.ts` description,
the CC0 / CC BY policy, licence and terms links), OBIS and its data providers (description, citation, policy
and citing links), OpenStreetMap ("Dive site locations © OpenStreetMap contributors, available under the Open
Database License (ODbL)", linking to openstreetmap.org/copyright), and species photographs (described
generally: credited to the photographer, with the licence iNaturalist gives it), then
`REAL_SIGHTINGS_FOOTNOTE`. It is linked from the section's footer and from the site page's Sources block.

### Tests

`src/components/__tests__/real-sightings-section.test.js` (every state, with the hook mocked),
`real-sightings-credits.test.js`, `real-sightings-site-page.test.js` (a site with no curated species).
The screens were reviewed in a web export with a temporary preview route and hand-written sample data; that
route is deleted. The live iNaturalist and OBIS responses have still not been seen, so the layout has only
been checked against the shapes in `types.ts`.

### Known gaps

- The status paragraph at the top of this page ("no screen uses it yet") predates these screens.
- The species photographs on species pages (`species-photos.json`) carry the licence iNaturalist gives each
  one, and most are not CC0 or CC BY. The credits screen describes them accurately and does not claim
  otherwise; whether they may stay is a decision for the project, not for this screen.

## See also: rarity from encounters

The share-of-sites rarity above needs many sites summarised on the device. A separate tier for every
catalogue animal, from how often it is recorded at the dive sites in its own waters, is worked out once at
build time over every site in `src/data/sites.ts` and bundled with the app. It is in
[real-rarity.md](real-rarity.md). It reuses this folder's `species_counts` and OBIS checklist clients,
name matching and synonym table (and `buildSiteSightings`), and produces the same
`ReadonlyMap<speciesId, Rarity>` the rewards engine takes as `observed`. Worldwide iNaturalist and OBIS
counts are kept there as supporting evidence only: they measure how much an animal is photographed, not
how likely a diver is to meet it, and set no tier.

One thing found on the way belongs here: iNaturalist has renamed three catalogue cuttlefish to
*Ascarosepion* (`ascarosepion latimanus`, `ascarosepion apama`, `ascarosepion pfefferi`). The synonym table
does not know the new names yet, so a site's page misses them. The encounter script adds them to its own
matcher; adding the same three lines to `synonyms.ts` fixes the page.

## The species page: "Recorded near dive sites"

A species page (`src/app/species/[id].tsx`) turns the same cache around: instead of "what is recorded
near this site" it answers "which of the sites I have opened record this animal". It sits after the
diver's own "Where it's been seen" and before the delete-my-log block, under the eyebrow **Public
records**, and says in its first lines that the records are saved on this phone for dive sites already
opened, that opening more site pages adds more, and that they are not the diver's sightings and not
checked by ScubaGo.

**It never uses the network.** `useSpeciesRecords(speciesId, sites)` (`src/hooks/use-species-records.ts`)
lists the cached site ids (`listCachedSiteIds()` in `cache.ts`: the index, rebuilt from the stored keys if
lost), reads them with `readCachedSummaries` (which does not change their order), keeps the entry for
this species from each, and matches the site ids to the app's dive sites. Nothing is fetched, so the
page stays fast and the two APIs are only ever asked by a dive-site page. It reads again each time the
screen comes back into view (`useFocusEffect`, because a site page opened meanwhile may have saved
more), keeps what it showed while it does, and drops a read that is still running when the screen goes
away. It returns `{ status, sites, checked }` and never throws.

| Status | The section shows |
| --- | --- |
| `loading` | Two ruled placeholder lines and "Checking the records saved on this phone…". No spinner. |
| `ready` | "Recorded near 3 of the 12 sites you've opened", then up to **6** sites (name, region and country, "38 iNaturalist observations · 12 OBIS records", "Within 3 km · Newest on file: 12 Mar 2026"), "Show all N", and the credit line of the sources that appear with a link to Data & credits. A row opens the site's page. |
| `empty`, `checked` is 0 | "Open a dive site's page to see what's been recorded there." Nothing is counted or credited. |
| `empty`, `checked` > 0 | "No public records of Reef Manta Ray at the 3 dive sites you've opened. Not finding one here doesn't mean it isn't there." |
| `error` | "Couldn't read the public records saved on this phone just now." |

- **Ordering.** Most iNaturalist observations first, then most OBIS records, then name.
- **`checked`** is the number of saved summaries, for sites the app still knows, that a source answered
  for. A summary of a site that has since been deleted cannot be named or opened and is neither listed
  nor counted. A summary in which neither source answered says nothing about the animal and is not
  counted.
- **Newest on file** is the later of the summary's `lastObservedOn` for the animal and the newest of
  the `recent` observations of it, so as on a site page it is the newest *openly licensed* observation
  the app holds, not the newest observation anywhere. It is left out when there is none.
- **Within N km** is the summary's search radius, so a count is never read as "at the site".
- **Storage that cannot be read** is, as everywhere in `cache.ts`, "nothing saved": the hook reports
  `empty` with `checked` 0. `error` is for anything else that goes wrong while reading. (A transient
  `getItem` failure inside `readCachedSightings` still removes that entry, which is that module's
  existing handling of an unreadable entry and was left alone.)
- **If `prefetch` is ever wired to a screen**, summaries will be saved for sites the diver did not
  open, and the section's wording ("the dive sites you've already opened") will need to change.

Files: `src/components/sightings/species-records.tsx` (`SpeciesRecords`, which takes its data as props,
and `SpeciesRecordsSection`, which calls the hook), `src/hooks/use-species-records.ts`. Tests:
`src/components/__tests__/species-records.test.js` (hook, pure helpers and every state, with
hand-written summaries) and `species-records-screen.test.js` (the page). The layout was reviewed in a
web export with a temporary preview route and hand-written sample data; that route is deleted.

