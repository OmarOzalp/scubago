# Dive-site database: current state, sources and plan

**Status:** research and plan, September 2026. The data hasn't been expanded yet.

Facts are marked:

- **[F]** read directly;
- **[S]** from search-engine results, where the page itself couldn't be fetched from this
  environment;
- **[I]** our inference.

Nothing here is a legal conclusion.

## How sites work today

- **Seed data:** 69 hand-curated famous sites in `src/data/sites.ts`: 12 in Indonesia, 6 in
  Australia, 5 in Thailand, 3 in the Philippines and so on.
- **Fields:** `id` (a slug), `name`, `lat`/`lng` (approximate, marker precision), `region`,
  `country`, `blurb`, `notableSpecies` (species ids) and `source` (`seed` | `user`).
- **In Supabase:** the seed sites are also in `dive_sites` (seeded by `npm run seed:supabase`), with
  a PostGIS `location` generated from lat/lng for spatial queries later.
- **User-added sites:** anyone signed in can add a site by long-pressing the map. It is saved
  locally, synced to `dive_sites` with `source = 'user'`, and visible to everyone. There is no edit
  or moderation yet.
- **Where sites show up:**
  - the Map tab (pins);
  - the "where can I see a…" species search, which uses `notableSpecies` and sightings;
  - the site page ("What divers see here" from `notableSpecies`, recent sightings);
  - the log flow's site picker.
- **Links from sightings:** `sightings.site_id` points at `dive_sites.id`, so **site ids must never
  change**.

## Target fields

| Field | Where it would live | Required? | Where the value comes from |
| --- | --- | --- | --- |
| Name | `dive_sites.name`, plus `site_aliases` for other names and languages | yes | Curated; Wikidata labels (CC0) for aliases |
| Location | `lat`, `lng`, `location` (exists), `location_precision` (exact / approximate / area) | yes | Wikidata, GBRMPA moorings (licence to check), Reef Life Survey sites, wreck registers, partners |
| Country | `country` (exists), as an ISO 3166 code | yes | Worked out from coordinates |
| Region | `region_id` pointing at a `regions` table (hierarchy, Marine Regions MRGID), with `region` text kept for display | no | Marine Regions (CC BY 4.0), curated |
| Description | `description` | no | **Original writing** (never copied) |
| Depth | `depth_min_m`, `depth_max_m` | no | Curators or partners; OSM and survey depths as hints only |
| Difficulty | `difficulty` (beginner / intermediate / advanced / technical) | no | Curators or partners |
| Dive type | `dive_types text[]` (reef, wall, wreck, drift, muck, pinnacle, cave, shore, …) | no | Curated; wreck registers; OSM tags as hints |
| Marine life | `site_species` (species, how often, source), replacing `notableSpecies` over time | no | Reef Life Survey (CC BY), CC0/CC BY GBIF/OBIS records, partners |
| Conditions | `conditions` (current, visibility, temperature, best months, access: boat/shore, permits) | no | Curators or partners; park authority data (zoning, permits) |
| Source | `site_field_sources` (field, source, licence, retrieved) | yes | Every import and edit records its origin |
| Last updated | `updated_at`, `last_reviewed_at` | yes | Automatic, plus reviewer |

Missing values stay empty. The app shows "not known yet" rather than a guess.

## Sources

| Source | Coverage | Fields | Licence / terms | Stable IDs | Verdict |
| --- | --- | --- | --- | --- | --- |
| **Wikidata** | Famous sites (Great Barrier Reef, Indonesia partly) | Names in many languages, coordinates, country, type, links to OSM and Wikipedia | **CC0** [S] | QID | **Use** as ID cross-walk and seed list |
| **Reef Life Survey** (IMOS / AODN) | Great Barrier Reef, Coral Sea, 44+ countries | Site code, name, coordinates, depth, species counts | IMOS data **CC BY 4.0**, with a required acknowledgement [S] | SiteCode | **Use** for species per site and survey sites |
| **GBRMPA "GBR Features"** | Whole Great Barrier Reef (5,376 features) | Reef names, `GBR_ID` (e.g. 19-051), polygons | CC BY 4.0 per open-AIMS; GBRMPA also mentions a commercial-use application [S] | GBR_ID | **Use** as the parent-reef gazetteer; **confirm commercial terms** |
| GBRMPA public moorings | Great Barrier Reef Marine Park | Mooring GPS positions (good stand-ins for sites) | Unconfirmed | none | After a licence check |
| **Australian Underwater Cultural Heritage Database** (AUCHD) | Australia, Oceania, parts of SE Asia | Wreck names, positions, protection status (some need permits, e.g. Yongala) | CC BY 3.0 AU [S] | Record IDs (unverified) | **Use** for wrecks, with permit flags |
| **Marine Regions** (VLIZ) | Regions (e.g. Great Barrier Reef 7579, Coral Sea 4364, Eastern Coral Triangle 21729) | Names, geometry | **CC BY 4.0** [S] | **MRGID** (persistent) | **Use** for regions |
| OpenStreetMap | Unknown (the probe was blocked); dive spots are mapped sparsely | Name, `scuba_diving:*` tags, depth | **ODbL**: share-alike for derivative databases [F] | Node/way IDs (not permanent) | **Hold**: merging OSM rows into our public table would likely make it an ODbL derivative database. Decide first. |
| Wikipedia text | — | Prose | CC BY-SA 4.0 [F] | — | Don't copy; link out |
| Thailand DNP ("dive sites in marine national parks") | Thai marine parks | Name, coordinates, open/close periods | Unconfirmed (gdcatalog.go.th) [S] | none | Promising; confirm licence |
| Indonesia and Philippines parks | Komodo, Raja Ampat, Bunaken, Tubbataha | Zoning only | — | — | Partnerships |
| Diveboard (on GBIF) | ~2,500 dive localities | Occurrences, depth | Occurrences **CC0**; its API is CC BY-NC-ND [F] | — | Hints only |
| PADI / ScubaEarth, SSI, Wannadive, Divebuddy, Zentacle | Worldwide | Rich | **Proprietary** [S] | Internal | Partnership only |
| "Dive site" APIs (RapidAPI, divesites.com) | Worldwide (claims) | id, name, lat/lng | Provenance and licence not stated [S] | Vendor IDs | Avoid |
| Operators (e.g. Pro Dive Cairns: 19 sites on 4 reefs) | Their own sites | Names, maps, depths | Copyright | — | License via partnership (names alone are facts) |
| Allen Coral Atlas | Tropical reefs | Reef-habitat maps | CC BY 4.0 [S] | — | Context only |
| WDPA / Protected Planet | Marine protected areas | Boundaries | **No commercial use** without permission [S] | WDPA ID | Avoid unless licensed |

**Takeaway:**
- No open, ready-made dive-site database exists.
- The legally clean building blocks are:
  - Wikidata (CC0) for well-known sites and stable IDs;
  - Australian government CC BY data (GBRMPA reef IDs, wreck registers, Reef Life Survey sites and
    species);
  - Marine Regions for the region hierarchy.
- Curators turn these into dive sites, adding original descriptions and conditions.
- Partners fill the rest.

## Identifiers and de-duplication

- **Canonical IDs never change.** Existing slugs stay. New sites get opaque IDs (for example ULIDs),
  with a separate human-readable slug.
  - A merged duplicate becomes a tombstone (`status = 'merged'`, `merged_into`), so old IDs and
    every sighting that points at them still resolve.
- **External IDs** go in a mapping table:
  - `site_external_ids (site_id, scheme, external_id, relation, source_version, retrieved_at, match_method, confidence, reviewed_by)`;
  - unique on `(scheme, external_id, relation)`;
  - schemes: `wikidata:Q5139931`, `rls:<SiteCode>`, `gbrmpa:<GBR_ID>`, `auchd:<id>`, `mrgid:7579`,
    `osm:node/…` (if ever used), `partner:<org>:<id>`;
  - relations: `same_as`, `on_reef`, `within_region`, `near`.
- **Hierarchy:** a `parent_id` separates areas and reefs (Osprey Reef) from sites (North Horn), so a
  site is never merged into its reef.
- **Finding duplicates:** PostGIS `ST_DWithin`, with a radius depending on type:
  - wrecks about 150 m;
  - bommies and moorings about 300 m;
  - today's approximate seed coordinates up to 1.5–2 km.

  Candidates are then scored on name similarity (`pg_trgm`), type and parent reef.
- **Auto-link only when certain:** an explicit cross-link (for example OSM's `wikidata=` tag), or
  closer than 100 m with near-identical names. Everything else goes to a review queue.
- **Record rejected pairs** in a "not a duplicate" table, so they aren't proposed again.
- **Name normalization** before matching:
  - case, accents and apostrophes;
  - "No." / "#";
  - vessel prefixes (SS, HMAS, MV);
  - local generic words (Pulau, Gili, Nusa, Ko/Koh, Hin).
- **Field-level provenance:** every value records its source, and the app's attribution screen is
  generated from it.

## Phased plan

1. **Foundations** (schema only; nothing visible changes):
   - `regions`, `site_external_ids`, `site_aliases`, `site_field_sources`, `site_species`;
   - new optional columns on `dive_sites` (see [sightings-architecture.md](sightings-architecture.md)),
     including `status` for moderation of user-added sites;
   - an attribution screen.
   - **Get legal advice** on ODbL and on GBRMPA's commercial terms.
   - **Add a licence grant for user-added sites** to the terms of use.
2. **Australia / Great Barrier Reef / Cairns** (curated, 100–250 sites):
   - positions from Wikidata, Reef Life Survey sites, GBRMPA moorings (after the licence check) and
     wreck registers (with permit flags);
   - GBRMPA reef IDs as parents;
   - "commonly seen" species from Reef Life Survey;
   - descriptions written from scratch;
   - approach two or three Cairns operators for licensed site lists.
3. **Indonesia and Southeast Asia:**
   - Wikidata items, the Thai park dataset (once the licence is confirmed), Reef Life Survey sites
     where they exist, and CC0 hints;
   - partnership outreach for Komodo, Raja Ampat, Bunaken/Lembeh and Tubbataha.
4. **The OpenStreetMap decision:** don't use it; show it as a separate, unmerged layer with
   attribution; or license the site table under ODbL.
5. **Upkeep:** partner feeds, moderated user submissions, and scheduled refreshes of CC BY sources
   pinned to a version.

## Queries to run once network access allows

- **Overpass** (dive spots from Cairns to Osprey Reef):
  `[out:json][timeout:60]; nwr["scuba_diving:divespot"](-17.6,145.3,-13.5,147.0); out count;`
- **Wikidata** (dive sites with coordinates, by country):
  `SELECT ?c (COUNT(DISTINCT ?i) AS ?n) WHERE { ?i wdt:P31/wdt:P279* wd:Q26205080; wdt:P17 ?c; wdt:P625 []. } GROUP BY ?c`
  (Q26205080 is "underwater diving site" [S]).

## Key sources

- **OpenStreetMap:**
  - openstreetmap.org/copyright
  - osmfoundation.org/wiki/Licence/Community_Guidelines
  - ODbL 1.0 text (spdx/license-list-data)
  - wiki.openstreetmap.org/wiki/Tag:sport=scuba_diving
- **Wikidata:**
  - wikidata.org/wiki/Wikidata:Licensing
  - wikidata.org/wiki/Q26205080
  - wikidata.org/wiki/Q2141554
- **Reef Life Survey / IMOS:**
  - reeflifesurvey.com/survey-data/
  - imos.org.au/conditions-of-use
  - nature.com/articles/sdata20147
- **GBRMPA and eAtlas:**
  - github.com/open-AIMS/gisaimsr
  - www2.gbrmpa.gov.au/about-us/spatial-data-information-services
  - gbrmpa.gov.au/access-and-use/moorings
- **Wrecks:**
  - dcceew.gov.au/parks-heritage/heritage/underwater-heritage/auchd
  - data.gov.au (Australian National Shipwrecks)
- **Marine Regions:**
  - marineregions.org/disclaimer.php
  - marineregions.org/mrgid.php
- **Protected areas:**
  - unep-wcmc.org/en/wdpa-data-license
- **Thailand:**
  - gdcatalog.go.th/dataset/gdpublish-dive-park
- **Commercial directories:**
  - travel.padi.com/terms
- **Diveboard:**
  - github.com/Diveboard/Documentation (API.md)
  - github.com/Datafable/diveboard-data-publication
