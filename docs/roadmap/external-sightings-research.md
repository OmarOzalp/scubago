# External marine-life sightings: research

**Status:** research only, September 2026. Nothing here is integrated yet.

**How this was checked.** This environment's network policy blocked direct page fetches for most of
the sites below (including prodivecairns.com and the iNaturalist, GBIF and OBIS APIs), so no live
API probe ran. Each fact is marked:

- **[F]** read from the organization's own source, such as its docs or code on GitHub;
- **[S]** taken from search-engine results for the cited page;
- **[I]** our inference.

Nothing below is a legal conclusion. Reuse needs the rights holder's terms or written permission.

## Summary

- **Pro Dive Cairns publishes no sightings feed.** We found no public blog, "latest sightings" page,
  trip reports, RSS or newsletter archive [S]. It posts occasional wildlife videos (minke whales, for
  example) on Facebook and Instagram [S]. Pro Dive is owned by the Quicksilver Group [S], whose
  "Reef News" and "Quickies" newsletter archive sometimes mention encounters [S].
- **Only two Great Barrier Reef operators publish regular reports that name sites:**
  - Mike Ball Dive Expeditions: a weekly "Reef Report" from SpoilSport.
  - Spirit of Freedom: a report for each trip.

  Both give a **trip date range, not a date for each sighting**, and neither states any reuse
  licence [S]. Using them needs permission and manual entry.
- **Four sources can be automated today:** iNaturalist, GBIF, OBIS and the Atlas of Living
  Australia (ALA).
  - Each has an API and a licence on every record [F/S].
  - Each keeps the **observation date separate from the upload or publication date** [F].
  - For a commercial app: keep only CC0 and CC BY records, credit each one, and stay within the rate
    limits.
- **GBRMPA's Eye on the Reef** is the most authoritative Reef sightings channel, and tourism
  operators report into it [S].
  - Its terms say CC BY 4.0 "unless otherwise marked" [S].
  - There is no public API or export [S], so the data would come through a formal request.
- **Photo-ID research programs** hold exactly the who/what/where/when we want: Project Manta, Manta
  Trust / MantaMatcher, Sharkbook, the JCU Minke Whale Project, Thai Whale Sharks, LAMAVE and Bird's
  Head Seascape. They keep it under researcher control [S], so only a partnership would work.
- **Indonesia and Southeast Asia:** no operator publishes a structured feed. The reusable data is in
  OBIS, GBIF and iNaturalist [I].

## Pro Dive Cairns

- **Who they are:** a Cairns dive school and outer-reef liveaboard operator since 1983 [S].
  - Quicksilver Group has owned it outright since about 2012 [S].
  - It lists Advanced Ecotourism certification and GBRMPA "High Standard Operator" status [S].
- **Sites they name:** 19 outer-reef sites on Flynn, Thetford, Milln and Pellowe reefs [S]. Examples:
  - Milln: Whale Bommie, Petaj, Swimming Pools, Fish Town.
  - Flynn: Tracy's Bommie, Gordon's Mooring, Coral Gardens.
- **Where sightings might appear:**
  - **Website:** the pages are general (reefs, whales, the minke liveaboard, reef health), with no
    dated sightings [S].
  - **Social:** facebook.com/prodivecairns and instagram.com/prodivecairns. We could not check how
    often they post or whether posts give the observation date and site.
- **Newsletter:** none found for Pro Dive itself. Quicksilver's "Quickies" newsletter has a public
  web archive, and its "Reef News" has a Pro Dive category, but what's indexed there is company news
  [S].
- **Terms:** only booking terms were found (prodivecairns.com/tc.html). Treat all text and photos as
  needing permission.
- **Contact:** info@prodivecairns.com, +61 7 4031 5255 [S].
- **Better route [I]:** approach the **Quicksilver Group** as a whole. Its environmental arm, Reef
  Biosearch, says it has kept marine observations since 1986 and that this "evolved into" Eye on the
  Reef [S]. One agreement could then cover Pro Dive, Quicksilver Cruises and its other brands.

## Sources at a glance

| Source | What they publish | Observation date separate? | Reuse terms | Feasibility |
| --- | --- | --- | --- | --- |
| Pro Dive Cairns | Site pages; occasional social videos | No evidence | Booking terms only | Permission + manual |
| Quicksilver Group | Reef News, newsletter; occasional encounters | Only in the text | Not found | Permission + manual |
| Mike Ball Dive Expeditions | Weekly Reef Report (mikeball.com/reefreport) | Trip date range | Not found | Permission + manual |
| Spirit of Freedom | Per-trip reports naming sites and species (spiritoffreedom.com.au/trip-reports) | Trip dates in title | Not found | Permission + manual |
| Passions of Paradise, Lady Elliot Island | Irregular news, seasonal calendars | No | Not found | Context only |
| Tusa, Down Under, Reef Magic, Calypso, Silverseries, Yongala Dive | No sightings feed found | n/a | n/a | Not viable now |
| GBRMPA Eye on the Reef | Public sightings map (eotr.gbrmpa.gov.au/sightings) | Date shown; unclear which | CC BY 4.0 unless marked [S] | Data request; link out |
| iNaturalist | Research-grade observations with photos | **Yes** (`observed_on` vs `created_at`) | Per record: CC0 … all rights reserved | **API** (CC0 / CC BY only) |
| GBIF | Aggregated occurrences (incl. iNaturalist, Reef Life Survey) | **Yes** (`eventDate`) | CC0 / CC BY / CC BY-NC per dataset | **API** |
| OBIS | Marine occurrences | **Yes** | Per dataset; the full export is CC BY-NC | **API** (filter by dataset) |
| ALA | Australian occurrences (incl. Eye on the Reef, Reef Life Survey) | **Yes** | Data-provider terms prevail | **API** |
| Reef Life Survey | Survey counts by species, site and date | **Yes** (survey date) | CC BY 4.0 in one metadata copy; to confirm | Download (historical) |
| Photo-ID programs (listed above) | Encounter databases | Internal | Not found; researcher-controlled | Partnership |

## Organizations and APIs

**iNaturalist.**
- The API is "intended to support application development, not data scraping": at most 100
  requests a minute, ideally 60 or fewer, and under 10,000 a day [F].
- Licences are set per observation and per photo. Only photos served from `inaturalist-open-data`
  are openly licensed [F].
- Filters separate the observation date (`d1`/`d2`) from the upload date (`created_d1`/`created_d2`)
  [F].
- "Research grade" needs photo or sound evidence, a date and location, and community agreement at
  species level [S].
- Threatened species' locations are obscured [S].

**GBIF.**
- Licences are CC0, CC BY 4.0 or CC BY-NC 4.0 [F].
- Clients must send an identifying User-Agent. Searches that would run over 15 minutes should
  request a download instead, and downloads carry DOIs [F].
- Cite datasets, using DOIs where possible [S].

**OBIS.**
- Accepts CC0, CC BY and CC BY-NC data. Users must cite OBIS and each dataset [F].
- The full export is CC BY-NC, with per-dataset licences in `licenses.tsv` [F].

**ALA.**
- Most APIs need no authentication; protected ones need a token [F].
- Where the terms conflict, "the Data Provider Terms will prevail". Check each dataset's licence
  and credit the provider [F].

**Eye on the Reef.**
- Content is Commonwealth copyright unless marked, and CC BY 4.0 "unless otherwise marked" [S].
- Data also flows to ALA through BioCollect [S].
- Data requests go to the program coordinator [S].

**Reef Life Survey.**
- Transect counts per species, site and date, published via AODN and GBIF/OBIS [S].
- The licence is unclear: CC BY 4.0 in one copy of the metadata, "non-profit purposes" elsewhere.
  Confirm before commercial use.
- Suits "recorded here" rather than "recent" [I].

## Indonesia and Southeast Asia

- **Mantas in Indonesia:** Manta Trust's Indonesian Manta Project and Bird's Head Seascape's manta
  ID program hold thousands of identified sightings (Nusa Penida, Komodo, Raja Ampat), with no
  export or licence found [S].
- **Whale sharks:**
  - Bird's Head Seascape: photo-ID records at Cenderawasih Bay, Kaimana and Raja Ampat [S].
  - LAMAVE (Philippines): Donsol, Oslob, Southern Leyte and Palawan, catalogued in Sharkbook [S].
  - Thai Whale Sharks: collects sightings through Facebook and Sharkbook [S].

  None has a public raw feed.
- **Operators:** some (Scuba Junkie in Komodo and Sipadan, for example) keep internal dive logs but
  don't publish them [S].
- **Structured, reusable data:** OBIS, GBIF and iNaturalist [I]. Their Indonesian coverage is
  probably thinner than for the Great Barrier Reef; test with a query first.

## Recommended approach

**Rules for every source** (built into the schema in [sightings-architecture.md](sightings-architecture.md)):

- **Dates:**
  - Store the observation window (`observed_start`, `observed_end`, and a precision: day, trip
    range, month or unknown) separately from the publication, retrieval and last-checked dates.
  - Show both, for example "Observed 12–19 Feb 2026 (trip) · Published 24 Feb 2026".
  - A record without an observation date never counts as "recent".
- **Provenance label:** give every item one, for example "Dive Operator Report", "Reef Authority
  Sightings Network", "Citizen Science (iNaturalist, research grade)" or "Scientific Survey".
- **Rights:** keep each record's licence and credit line with the record.
- **Sensitive species:** show only the region.
- **Separation:** keep external records apart from divers' personal logs.

**Phase A: automated, legally simple.**
- **iNaturalist:** research grade, CC0 or CC BY observations (and photos) near each site, recent by
  observation date. A scheduled server-side job (Supabase Edge Function or cron) within the rate
  limits, with an identifying User-Agent, and each record credited and linked.
- **GBIF / ALA / OBIS:** CC0 and CC BY records, for "species recorded near this site" (not "recent").
- **Operator reports:** link out to Mike Ball's and Spirit of Freedom's reports and the Eye on the
  Reef map, without copying anything.

**Phase B: permissions and partnerships, in order:**
1. Quicksilver Group / Pro Dive Cairns, including Reef Biosearch's records.
2. An Eye on the Reef data request.
3. Mike Ball.
4. Spirit of Freedom.
5. The research programs, for seasonal-presence summaries.

What to ask each for:
- which fields we may show (species, site, dates, our own summary, a link);
- photo rights, handled separately;
- the credit wording they want;
- how often and in what form they send updates (a form, CSV or shared sheet);
- rules for sensitive species;
- a contact for corrections and takedowns;
- written confirmation that commercial use is allowed.

**Phase C: a manually reviewed source submission workflow**, for anything without an API:
- An admin enters species, site or region, observation window, publication date, organization,
  source URL, a summary in our own words, media with its rights, a confidence level and a
  sensitivity flag.
- A reviewer checks it against the source and publishes it.
- A scheduled job rechecks links and drops items out of "recent" automatically.
- Items can be retracted on request.

## Could not confirm

- **Pro Dive Cairns:** its site terms and copyright notice; how often it posts on social media and
  whether posts give dates.
- **Eye on the Reef:** whether "CC BY 4.0 unless marked" covers sightings and photos; whether the
  date shown is the observation date.
- **Reef Life Survey:** its licence.
- **Research programs:** reuse terms for the Minke Whale Project, MantaMatcher, Sharkbook and Manta
  Trust.
- **iNaturalist:** the AI-training clause in its terms (from search snippets).
- **Not researched:** Wavelength, Ocean Safari and Poseidon, because the search budget ran out.

To finish the checks, widen this environment's network access and fetch those pages, plus one
probe each against iNaturalist, GBIF and OBIS.

## Key sources

- **Pro Dive Cairns and Quicksilver:**
  - prodivecairns.com/divesites.html
  - prodivecairns.com/about
  - prodivecairns.com/contact.html
  - prodivecairns.com/tc.html
  - quicksilvergroup.com.au/news.html/category/pro-dive-cairns
  - quicksilvergroup.com.au/newsletter/index.html
  - quicksilvergroup.com.au/reef-biosearch.html
- **Other operators:**
  - mikeball.com/reefreport
  - spiritoffreedom.com.au/trip-reports/
- **Eye on the Reef:**
  - eotr.gbrmpa.gov.au/sightings
  - eotr.gbrmpa.gov.au/general/copyright
- **iNaturalist:**
  - github.com/inaturalist/iNaturalistAPI (swagger_v1.yml.ejs)
  - inaturalist.org/pages/api+recommended+practices
- **GBIF:**
  - github.com/gbif/gbif-api (License.java)
  - github.com/gbif/tech-docs (usage.adoc)
  - gbif.org/terms/data-user
- **OBIS:**
  - github.com/iobis/manual (policy.md, citing.md)
  - github.com/iobis/obis-open-data
- **ALA:**
  - github.com/AtlasOfLivingAustralia/home-static (terms-of-use)
  - support.ala.org.au
- **Reef Life Survey:**
  - reeflifesurvey.com/survey-data/
  - gbif.org/dataset/38f06820-08c5-42b2-94f6-47cc3e83a54a
- **Research programs:**
  - minkewhaleproject.org
  - mantatrust.org/mantabase
  - mantamatcher.org
  - sharkbook.ai
  - birdsheadseascape.com/indonesian-manta-id
  - lamave.org
  - thaiwhalesharks.org
