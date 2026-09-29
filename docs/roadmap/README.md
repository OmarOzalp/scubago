# ScubaGo roadmap: from dive log to dive-planning companion

**The goal.** A diver planning a Cairns trip opens ScubaGo and does four things:

- explores the real dive sites in the region;
- sees what marine life is commonly found at each;
- sees recent sightings from dive operators and the ScubaGo community, clearly labeled by where
  they came from;
- after diving, logs what they saw in seconds, even offline.

Their discoveries grow their species collection and island. With a photo or a buddy's
confirmation, they also add to the verified community picture.

## Documents

| Document | What it covers | Status |
| --- | --- | --- |
| [../ios-distribution.md](../ios-distribution.md) | Getting the app onto iPhones: Expo Go vs builds, the Apple account, EAS, TestFlight, Supabase checks, the tester checklist | **Phase 1, done** |
| [dive-site-data.md](dive-site-data.md) | Current site schema, target fields, legitimate sources and licences, IDs and de-duplication | Research and plan |
| [external-sightings-research.md](external-sightings-research.md) | Pro Dive Cairns and other operators, Eye on the Reef, iNaturalist, GBIF, OBIS, ALA, photo-ID programs; what may be reused and how | Research |
| [sightings-architecture.md](sightings-architecture.md) | Provenance, verification (photos, buddy codes), statuses, RLS, moderation, duplicates, UI | Proposed design |
| [sightings-schema-draft.sql](sightings-schema-draft.sql) / [sightings-schema-scenario.sql](sightings-schema-scenario.sql) | The design as runnable SQL, and a 15-check scenario (passes on a local copy of the real migrations) | Draft, tested |
| [offline-dive-logging.md](offline-dive-logging.md) | The dive-logging redesign: problem, goals, flows, offline-first technicalities, questions, phases | **Planned, not implemented** |

## Phases

| # | Work | Priority | Status | Depends on | Pieces (one small PR each) |
| --- | --- | --- | --- | --- | --- |
| 1 | Physical devices, EAS, Supabase readiness | Immediate | **Done** (this pass) | — | Build config; key guard; sign-in fix; no invented sightings; photo GPS stripping (iOS); canvas fix; perf badge; Supabase checks; PostGIS hardening (0003); account deletion (0004); icon and splash |
| 2 | Dive-site database expansion | High | **2a done** (migration 0005, site page details and sources, tests that forbid unsourced details); 2b/2c planned | 2a before 2b/2c; 2b needs network access to the data sources | 2a: schema foundations (`regions`, `site_external_ids`, `site_aliases`, `site_field_sources`, `site_species`, new optional columns, moderation `status` for user sites, attribution screen). 2b: curated GBR/Cairns sites (100–250). 2c: Indonesia and SE Asia. |
| 3 | Research external sighting providers | High | **Research done** | — | Follow-ups: confirm the pages that were blocked (Pro Dive's terms, Eye on the Reef copyright, the Reef Life Survey licence); probe the APIs; write to Quicksilver / Pro Dive and send an Eye on the Reef data request |
| 4 | Provenance and database architecture | High | **Designed; draft tested** | 2a for regions (region text works until then) | 4a: `staff`, `regions`, external tables, `public_sightings` view (additive). 4b: `sightings.status` + column privileges + edit trigger (additive; the public-read switch waits for 5c). 4c: `sighting_details` (notes move out of the public row). |
| 5 | Community verification | High | **5a done** (migration 0006, [buddy-verification.md](../buddy-verification.md)); 5b/5c planned | 4 | 5a: buddy codes (RPCs, "Ask a buddy", enter-a-code screen, status chips). 5b: photo evidence (private bucket, upload with metadata, moderator queue). 5c: public reads switch to `public_sightings`; drop the old public policy once testers have updated. |
| 6 | External sightings ingestion MVP | High | Planned | 4 (and 3's permissions for operator data) | 6a: manual source submission and review (staff form, or the table editor at first). 6b: scheduled iNaturalist import (CC0/CC BY, research grade) in an Edge Function. |
| 7 | Sightings UI | Medium | Planned | 4, plus 5 or 6 for content | Provenance labels; "Recent Marine Life" on site pages; recent reports on species pages; filters once there is data |
| 8 | Offline dive-logging design | Planning | **Document written** | — | Discovery interviews next; then the foundations phase from the document |

### What can run in parallel

- **Data work** (2b/2c curation, the legal checks, partner outreach) runs alongside **schema work**
  (4), as long as 2a lands first.
- **Verification (5) and ingestion (6)** both build on 4 but touch different tables, so they can
  proceed in parallel.
- **Offline-logging foundations** (the operation outbox and attachment queue) are independent of
  4–7, except that `dive_logs` should follow the draft schema so the two meet cleanly.
- **Keep every migration additive:**
  - existing rows get defaults, and nothing is dropped until the app no longer reads it;
  - each phase extends `supabase/checks/audit.sql`, and the isolation check where relevant;
  - after every migration, run `npm run check:supabase` and the two SQL checks.

## Needs your accounts, money or decision

- **Apple Developer Program:** US$99/year, needed for iPhone builds for others, TestFlight and the
  App Store.
- **Expo / EAS:** the free tier covers a modest number of builds a month. Paid plans add more
  builds and faster queues.
- **Bundle identifier and app name:** confirm `com.omarozalp.scubago` and "ScubaGo" before the
  first App Store Connect record.
- **Supabase:**
  - apply migrations 0003–0004 and seed the catalog;
  - later, a custom SMTP provider for password-reset email (Resend, Postmark, Amazon SES; most have
    free tiers);
  - Edge Function secrets for the iNaturalist import (phase 6b).
- **Legal and policy:**
  - a privacy policy (required by App Store Connect) and terms of use, including the licence divers
    grant for sightings, photos and user-added sites;
  - advice on OpenStreetMap's ODbL and on GBRMPA's commercial-use terms before importing those
    datasets.
- **Partnerships:** contact with the Quicksilver Group / Pro Dive Cairns (their Reef Biosearch arm
  holds long-running observation records), and an Eye on the Reef data request. Operator content is
  never scraped or republished without written permission.
- **Moderation:** who reviews photo evidence and flagged items at first (probably you), and how
  quickly.
- **This coding environment:** its network policy blocks docs.expo.dev, expo.dev and several data
  sources. To allow them, open the environment menu in the session title bar → Edit → Network
  access. Allow docs.expo.dev and the data hosts (openstreetmap.org, wikidata.org, gbif.org,
  inaturalist.org, api.obis.org, prodivecairns.com, eotr.gbrmpa.gov.au), or choose a broader level.
