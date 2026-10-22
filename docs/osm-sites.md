# Dive sites from OpenStreetMap

**Status (October 2026):** the import pipeline is built and tested offline. It has **not been run
against Overpass yet**: the build environment blocks `overpass-api.de` and its mirrors. Until it
runs, `src/data/osm-sites.json` is an empty list, and the app shows only the 69 curated sites. No
dive site in this repository was typed in by hand; the sites the app will list are whatever
OpenStreetMap returns, and nothing else.

How tags are read is based on the OSM wiki's `sport=scuba_diving` and `scuba_diving:*` pages. The
wiki itself couldn't be fetched from here, so that part is from search-engine summaries of those
pages **[S]**, and should be checked against the live wiki and taginfo on the first real run.

## What is imported

Dive **spots** in two areas, as ScubaGo dive sites:

- the **Great Barrier Reef and inner Coral Sea**, in Australia;
- **Egypt's Red Sea coast**, the Gulf of Suez, the west shore of the Gulf of Aqaba, and the
  offshore reefs (Brothers, Daedalus, Elphinstone, Rocky Island, Zabargad, St John's).

On the wiki, a dive spot is a physical feature (a wreck, a reef, a cave entrance, a body of water)
tagged `sport=scuba_diving` and `scuba_diving:divespot=yes`. Dive **centres**
(`amenity=dive_centre`), equipment **shops** (`shop=scuba_diving`) and **clubs**
(`club=scuba_diving`) also carry `sport=scuba_diving`, so that tag alone proves nothing. The import
keeps:

1. anything with `scuba_diving:divespot=yes`;
2. a wreck (`historic=wreck`), reef (`natural=reef`) or cave entrance (`natural=cave_entrance`)
   tagged `sport=scuba_diving` with no `divespot` tag.

It leaves out, with the reason counted in the summary:

- **businesses:** any element that also has an `amenity`, `shop`, `club`, `office`, `craft` or
  `building` tag, or is a hotel, hostel, guest house, resort or marina, even if it says
  `divespot=yes`. Tags decide, never names;
- **`divespot=no`**, and `sport=scuba_diving` on anything that isn't a wreck, reef or cave entrance;
- **lakes, quarries and pools** (`water=lake`, `landuse=quarry`, `leisure=swimming_pool` and the
  like);
- **unnamed** elements, and elements with no position;
- anything **outside the regions** below, such as the Saudi, Jordanian and Israeli shores.

## The query

One Overpass request per area, so the summary can count each and a time-out only costs one of them.
`scripts/osm-sites/query.ts` builds them from the boxes in `src/lib/site-import.ts`; print them with
`npx tsx scripts/osm-sites/query.ts`. At the time of writing (query hash `020c805dd6a4`):

```
[out:json][timeout:180];
(
  nwr["scuba_diving:divespot"="yes"](-24.5,142.2,-10.7,154.5);
  nwr["sport"~"(^|;)scuba_diving(;|$)"]["historic"="wreck"](-24.5,142.2,-10.7,154.5);
  nwr["sport"~"(^|;)scuba_diving(;|$)"]["natural"~"^(reef|cave_entrance)$"](-24.5,142.2,-10.7,154.5);
);
out center;
```

```
[out:json][timeout:180];
(
  nwr["scuba_diving:divespot"="yes"](22,32,30.2,36.8);
  nwr["sport"~"(^|;)scuba_diving(;|$)"]["historic"="wreck"](22,32,30.2,36.8);
  nwr["sport"~"(^|;)scuba_diving(;|$)"]["natural"~"^(reef|cave_entrance)$"](22,32,30.2,36.8);
);
out center;
```

Choices, and why:

- **Boxes, not Egypt's boundary area.** The Great Barrier Reef box runs from 10°41'S (the Marine
  Park's northern edge) to 24°30'S, and out to 154.5°E, which takes in the inner Coral Sea reefs
  (Osprey, Bougainville, Holmes, Flinders, Marion, Saumarez, Frederick) but not the outer Coral Sea
  or the Torres Strait. The Egypt box runs from 22°N to 30.2°N and 32°E to 36.8°E. The
  `area["ISO3166-1"="EG"][admin_level=2]` filter was left out on purpose: whether OSM's Egypt
  boundary reaches the offshore reefs can't be checked from here, a miss would silently drop
  Brothers or Daedalus, and it would also pull in the Mediterranean coast and the Nile. The box also
  holds Saudi, Jordanian and Israeli shores, so the **country check** is the region rules below: a
  spot is Egyptian only if it falls inside one of ScubaGo's Egyptian region shapes.
- **`out center;`, not `out center tags;`.** Ways and relations (reefs, wrecks drawn as outlines)
  need their `center`. The `tags` verbosity leaves out geometry, and I couldn't confirm from here
  that it keeps a node's `lat`/`lon`. `out center;` is the form Overpass Turbo uses, and costs only
  the node lists of a few hundred ways. If `out center tags;` is confirmed to keep node positions it
  could replace it; `import.ts` reports "no-position" skips loudly if the choice is wrong.
- **The sport tag is matched as one item of a list** (`sport=swimming;scuba_diving` counts).
- **`divespot` values other than `yes`** are not queried. Older proposals used other values; check
  taginfo on the first run and widen the query if there are many.
- **`[timeout:180]`** is the server-side limit; the script waits 30 s longer before giving up.

**Etiquette** (the Overpass usage policy): one request at a time, 10 s between the two; a
descriptive `User-Agent` naming ScubaGo and the repository (`OVERPASS_CONTACT` adds an email or URL),
and a `Referer`; retries only after 429, 502, 503 or 504, waiting `Retry-After` or 30 s then 60 s,
three attempts at most. A response with a `remark` about a runtime error or time-out is treated as
a failure, because Overpass returns partial results with a normal status.

## Running it

```
npm run import:osm-sites   # or: npx tsx scripts/osm-sites/import.ts
```

This needs network access to an Overpass server, `https://overpass-api.de/api/interpreter` unless
`OVERPASS_URL` says otherwise. It reads and writes only files: no Supabase, no secrets.

Without network, `--input saved.json` transforms a saved Overpass response (repeat it for
several). `--out path` writes somewhere else, with the meta file beside it, and `--dry-run` prints
the summary only. `--retrieved 2026-10-22` sets the date recorded on each site, `--allow-shrink`
accepts a run that finds under half of the sites listed last time (otherwise it stops, in case the
response was cut short, since the merge would retire most of the file). `--help` lists the options.

`scripts/osm-sites/fixtures/overpass-sample.json` is a **hand-written** response with invented
`Fixture ...` names, for trying the script and for the tests. Never copy it to `osm-sites.json`.

It writes:

- `src/data/osm-sites.json`: the sites, sorted by id, one per line;
- `src/data/osm-sites.meta.json`: when it was generated, the licence and attribution, the query
  hash, the Overpass base timestamp, element counts per area, site counts per region, and how many
  elements were skipped and why.

It prints a summary: counts per area and region, every skip reason with examples, the places mapped
twice that were merged, the sites that are really seed sites, and what changed since the last file.
If OSM has fewer than about 400 sites it says so. **Coverage may well be below the ~400 hoped for**;
see the limits below. Nothing is added to make up a number.

## Ids and retiring

A site's id is `osm-<type>-<id>`, such as `osm-way-123456`. Sightings and dives point at ids (and
`sightings.site_id` has a foreign key to `dive_sites.id`), so **an id never changes and a site is
never removed from the file**.

- An element OSM no longer lists, or no longer passes the filters, is kept with `retired: true` and
  `retiredOn`. Retired sites are not in `SITES`, so they don't appear on the map or in the picker,
  but they are in `SITES_BY_ID`, so a lookup by id still finds them.
- If the element comes back, it is listed again with its newest details.
- Sites still listed take their newest name, position and tags; a re-run on another day that
  changes nothing is not counted as a change.
- OSM ids aren't permanent. A mapper who redraws a wreck as a new way gives it a new id: the old
  site is retired and the new one is added. Sightings stay with the old id.
- Imports are safe to repeat: the sites come out the same for the same input, and only
  `generatedAt` in the meta file changes.

## Duplicates

**Within the import:** elements within **150 m** with the same **normalised name** are one place
mapped twice (typically a node and a way). The one kept is a site imported before (its id and its
sightings stay put), else a node over a way over a relation, else the lower OSM id. Names are
normalised by lower-casing, dropping accents, apostrophes and punctuation, turning `&` into "and",
and dropping the words "the", "and", "reef", "dive", "site" and the ship prefixes SS, MV, MS, HMAS,
HMS, USS, USAT and SV.

**Against the 69 seeds:** an imported site is a seed if it is within **300 m** of it whatever it is
called, or within **1.5 km** with a similar name (the same once normalised, or one holds all the
words of the other, or one letter apart in a name of six letters or more). Each matches the nearest
seed only. A match is **not added as a new site**:

- it stays in `osm-sites.json` (so the OSM id is known), but `mergeSites` in
  `src/lib/site-import.ts` leaves it out of `SITES`;
- the seed gains the OSM element as an `osm` external id (`same_as`), on a copy: the seed lines in
  `sites.ts` are not edited;
- the import summary lists each pair, with the distance and the reason.

This runs each time the app starts, so a seed added later is picked up with no new import.

## Region rules

Regions are ScubaGo's own grouping, not an official boundary. The rules and their numbers are in
`src/lib/site-import.ts`; they are approximations, to be replaced by real polygons (GBRMPA, Marine
Regions) once their licences are confirmed.

**Great Barrier Reef** (10°41'S to 24°30'S): a site east of a rough line along the outer barrier is
in `coral-sea`; the rest are in a GBRMPA management area by latitude:

| Region | Latitude |
| --- | --- |
| `gbr-far-northern` | north of 14.6°S (the Park's edge to just south of the Howick Group) |
| `gbr-cairns-cooktown` | 14.6°S to 18.0°S (Lizard Island to just south of Mission Beach) |
| `gbr-townsville-whitsunday` | 18.0°S to 20.65°S (to Midge Point, south of Proserpine) |
| `gbr-mackay-capricorn` | south of 20.65°S, to the Park's southern edge |

The Coral Sea line joins (latitude, longitude) (10.7°S, 145.2°E), (13°S, 145.6°E), (14°S, 146.0°E),
(16°S, 146.4°E), (17°S, 147.0°E), (18°S, 148.2°E), (19.8°S, 149.7°E), (21°S, 153.0°E),
(22°S, 153.4°E) and (24.5°S, 153.8°E). It runs outside the outer barrier reefs and inside the Coral
Sea reefs. Whole latitude bands are used; an inland freshwater spot between 142.2°E and the coast
would be filed under the Reef (none is expected).

**Egypt** (a new `red-sea` root with no country, since the sea is shared; the children have
`country: 'Egypt'`). The first shape a point falls in wins, so the order matters:

| Region | Shape |
| --- | --- |
| `red-sea-offshore` | the Brothers (26.15–26.45°N, 34.65–35.05°E); Elphinstone (25.2–25.4°N, 34.78–34.98°E); Daedalus (24.8–25.05°N, 35.7–36.05°E); and 22–23.8°N east of 36°E (Rocky Island, Zabargad, St John's) |
| `gulf-of-suez` | 28–30.2°N, west of 33.9°E |
| `red-sea-sinai` | 27.55–29.5°N, east of 34.15°E, and west of a line drawn about down the middle of the Gulf of Aqaba, ending at Taba (Sharm el-Sheikh, Ras Mohammed, Dahab, Nuweiba, the Straits of Tiran) |
| `red-sea-hurghada` | 26.45–28°N, 33–34.4°E (Hurghada, El Gouna, Giftun, Safaga, the Strait of Gubal) |
| `red-sea-southern` | south of 26.45°N down to 22°N, west of a line about down the middle of the Red Sea (Quseir, Marsa Alam, Fury Shoals, Berenice) |

Anything outside every shape is not Egyptian for this import. That includes the Saudi, Jordanian
and Israeli shores of the Gulf of Aqaba, the Saudi coast, and Egypt's Mediterranean and Nile waters.
South of Ras Banas (23.9°N) the coast runs south-east, so the coast there east of 36°E is grouped
with the offshore reefs. A site's `region` text is its region path, such as
"Hurghada & Safaga, Red Sea", and its `country` is Australia or Egypt.

## What a site carries

Everything comes from the element's tags or from the rules above, and nothing is guessed:

- **`name`:** `name:en`, else `name`. Names in Arabic script only are kept as they are (search
  can't find them, since it matches Latin letters).
- **Position:** the node's, or the `center` of a way or relation, to five decimals.
- **Depth:** `scuba_diving:maxdepth`, else `depth`: metres, feet (converted), or a range. Nothing
  readable between 0 and 150 m, nothing shown. `scuba_diving:depth` (the usual depth) isn't used.
- **Dive types:** `historic=wreck` is a wreck, `natural=reef` a reef, `natural=cave_entrance` a
  cave, plus `scuba_diving:type` or `scuba_diving:type:wreck=yes` for the other types ScubaGo knows.
  The wiki's talk page calls `scuba_diving:type` a legacy Swiss scheme, so it can only add a type.
- **Access:** `scuba_diving:entry` (boat, shore or beach, liveaboard). **Level:**
  `scuba_diving:difficulty` when it says beginner, intermediate, advanced or technical (or a
  synonym). Search results didn't confirm that these two keys are in use **[S]**; they cost nothing
  if they aren't.
- **`blurb`:** one sentence written by the import from what is known, such as "A wreck dive near
  Hurghada in the Red Sea." OSM's `description` text is never copied.
- **`notableSpecies`:** always empty. The app generates demo sightings from that list, so imported
  sites get none, and no animal is ever claimed for them.
- **`source`:** `seed`, as the seed script writes it.
- **`sources`:** one entry per site: `OpenStreetMap contributors`, `ODbL 1.0`, a link to the
  element on openstreetmap.org, and the retrieval date. Its fields are `region` always (name,
  position and region all come from OSM) plus `depth`, `difficulty`, `dive_types` and `access` when
  a tag gave them. The site page shows this as its Sources line.
- **`externalIds`:** `{ scheme: 'osm', id: 'node/123', relation: 'same_as' }`.

## The licence: ODbL 1.0

OpenStreetMap data is © OpenStreetMap contributors, under the Open Database Licence (ODbL) 1.0.
This is the roadmap's open question about OSM, and it is **not a legal conclusion**; the roadmap
already asks for advice before this goes live. What the import assumes, to be safe:

1. **Attribution.** "© OpenStreetMap contributors" must be shown wherever these sites are shown.
   - The **site page** shows each site's source line, "OpenStreetMap contributors (ODbL 1.0)", linked
     to the element. The source name has no "©"; one constant (`OSM_SOURCE_NAME`) changes that.
   - The **map and the lists** show pins and names without any credit yet. A line such as
     "Some dive sites © OpenStreetMap contributors" is needed on the map screen, and an attribution
     screen (planned in roadmap phase 1) should list OpenStreetMap with a link to
     openstreetmap.org/copyright.
2. **Share-alike.** `osm-sites.json` is a derivative database of OSM, so it is offered under the
   ODbL. `src/data/osm-sites.LICENSE.md` says so beside the file. The repository's root `LICENSE`
   is MIT and does not cover it. Public sites are copied into the `dive_sites` table, which anyone
   can read, so whether that table must itself be offered under the ODbL is part of the question
   for a lawyer; offering the OSM-derived part is the cautious answer.
3. **Keep it open.** The ODbL asks that a publicly used derivative database stays available under
   the same licence; the file in this repository is that copy.
4. **User-added sites** go in the same table. The roadmap's phase 1 item (a licence grant for them
   in the terms of use) matters more with this import.

## After an import: seed Supabase

An imported site can only be logged against once it exists in `dive_sites`, because
`sightings.site_id` is a foreign key to it. After committing a new `osm-sites.json`, the owner runs
`npm run seed:supabase` with their own key (`SUPABASE_URL` and `SUPABASE_SECRET_KEY`). It
**upserts**: it adds and updates, never deletes. It writes the regions (the new Red Sea ones
included) before the sites, then each site's `site_field_sources` and `site_external_ids` rows. A
retired site is no longer in `SITES`, so it isn't re-sent, and its row stays in Supabase, which is
what old sightings need.

One catch: `site_external_ids` is unique on (`scheme`, `external_id`, `relation`). If a retired
site's OSM id is later claimed by a seed (because a seed was added at that place), the seed script
will hit that constraint; delete the retired site's row in `site_external_ids` first.

## What the app has to cope with

About 470 sites instead of 69. Nothing here is new, but it is worth watching (details in the
import report):

- **Map:** one native marker per site, all re-rendered when a site is picked. Memoise the markers,
  and cluster or filter by visible region.
- **Site picker:** a non-virtualised `ScrollView` of every site; a `FlatList` is better at this size.
- **Retired sites:** pages look a site up with `sites.find(...)` over the listed sites, so a
  sighting or dive at a retired site shows "not found" or a generic name, and `updateSighting` and
  `updateDive` reject it as unknown. They need a fallback to `SITES_BY_ID`.
- **Web build:** `generateStaticParams` pre-renders a page per site, so about 400 more pages.

## Known limits

- **Coverage is unknown and may be well below 400.** The roadmap's earlier probe was blocked, and
  OSM maps dive spots sparsely. The first real run will say.
- Many OSM dive spots have only a name and a position: no depth, type or access. Those sites show
  just the OSM source line and the generated blurb.
- Region lines and the Egyptian country check are approximate; a few spots near a line may be
  filed in the neighbour. After the first run, read the per-region summary and the sites near the
  Gulf of Aqaba.
- A site mapped twice with different names, or further than 150 m apart, is listed twice.
- The tags `scuba_diving:difficulty`, `scuba_diving:entry` and `scuba_diving:type` are used as
  hints. Nothing in the file is a recommendation, and the app shows "not known yet" for what is
  missing.
- There is no cross-link to Wikidata, the Australian wreck register or GBRMPA reef ids yet.
