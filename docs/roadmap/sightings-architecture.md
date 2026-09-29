# Sightings: provenance, verification and the database behind them

**Status:** proposed, September 2026. Not implemented.

The design is written as runnable SQL in [`sightings-schema-draft.sql`](sightings-schema-draft.sql)
and tested with [`sightings-schema-scenario.sql`](sightings-schema-scenario.sql), which passes 15 of
15 checks. Both ran on a local Postgres 16 + PostGIS copy of migrations 0001–0004, inside a
transaction that was rolled back. The draft becomes real migrations in phases
([README.md](README.md)).

## Where we are today

| Area | Today |
| --- | --- |
| Species | `species`: a curated catalog of 119 species, read-only for the app. |
| Dive sites | `dive_sites`: 69 curated sites plus user-added ones (public; no moderation). See [dive-site-data.md](dive-site-data.md). |
| Dive logs | **None.** A "sighting" is the only unit (species + site + date + optional notes/photo). |
| Sightings | `sightings`: every row is **public** (username, species, site, date, notes, photo URL). There is no status and no provenance. Offline-first: SQLite outbox → Supabase. |
| Photos | Public bucket `sighting-photos/<uid>/…`. The app shows 📷 as a "credibility" hint only. |
| External data | **None.** Until this pass, the demo data invented "community" sightings; builds with a backend no longer show it. |
| Users | `profiles` (username); email + password sign-in. There are no roles or moderators. |

## Principles

1. **Personal logging is never restricted.** Anything a diver saw goes straight into their own log,
   offline too.
2. **Public information is earned.** Only verified community sightings and published external
   reports are public. An unverified sighting is visible to its owner only, with its status shown.
3. **Provenance on every public item.** Who reported it, what supports it, when it was *observed*,
   and when it was *published*. External labels describe where a report came from. They never imply
   that ScubaGo has scientifically verified it.
4. **Status is derived, never written by the app.** Database functions compute it from evidence,
   attestations and moderator decisions. Row-level security and column privileges stop any client
   from setting it.
5. **Nothing is destroyed to get there.** New tables and columns come with defaults, and existing
   rows become "unverified" (see Migration below).

## Entities

```
auth.users ─ profiles ─┬─ dive_logs ─┬─ sightings ─┬─ evidence (photos, private bucket)
                       │             │             ├─ verification_requests ─ attestations
                       │             │             ├─ sighting_details (private notes)
                       │             │             └─ encounters (same animal event, many divers)
                       ├─ flags (user reports)
staff (moderators) ── moderation_decisions (audit log)
species, dive_sites, regions (Marine Regions IDs), site_* tables (dive-site-data.md)
external_sources ─ external_reports ─ external_sightings
public_sightings (view) = verified community sightings ∪ published external sightings
```

- **`dive_logs`**: optional parent of sightings, and the basis of the logging redesign
  ([offline-dive-logging.md](offline-dive-logging.md)).
  - Client-generated IDs, like sightings today, so they can be created offline.
  - Visible only to the owner.
- **`sightings`** (the existing table, evolved rather than replaced) gains:
  - `dive_log_id`;
  - `status` (`unverified` · `evidence_submitted` · `confirmed` · `accepted` · `rejected` ·
    `disputed`);
  - `status_changed_at`;
  - `encounter_id`.

  Clients get column-level INSERT and UPDATE privileges on the *facts* only, never `status`.
  Changing the species, site or date resets the status and voids earlier support, via a trigger.
- **`sighting_details`**: private notes, owner-only. Notes move here from `sightings` over time,
  because verified sightings become public and a diver's notes shouldn't be.
- **`encounters`**: groups sightings of the same animal event by different divers (the same species,
  site and day, linked by an attestation or a moderator). Public counts use encounters, so a boat of
  eight divers isn't eight whale sharks.
- **`evidence`**: photo evidence.
  - The original goes to a **private** bucket (`sighting-evidence/<uid>/…`) readable only by its
    owner and moderators, so metadata such as capture time and position helps review without being
    exposed.
  - Checks on submission are advisory flags, not verdicts: `no_metadata`, `date_mismatch` (capture
    date far from the sighting date), `far_from_site`, and `reused_file` (the same SHA-256 hash on
    another sighting). A perceptual hash can be added later for near-duplicates.
  - A moderator accepts or rejects the evidence. An accepted photo can get a metadata-free public
    copy if the owner chooses.
  - No automated species recognition for now.
- **`verification_requests` and `attestations`**: buddy and instructor confirmation (below).
- **`staff`, `moderation_decisions`, `flags`**:
  - `staff`: moderators and admins, checked through `is_staff()`.
  - `moderation_decisions`: every decision with its reason.
  - `flags`: any user can report a public item as wrong or inappropriate.
- **`external_sources`, `external_reports`, `external_sightings`**:
  - A source is an organization, with its agreement status and credit line.
  - A report is one publication (a trip report, newsletter, social post or dataset record), with
    `published_at`, `retrieved_at`, `last_checked_at`, licence, commercial-use status and a review
    status.
  - An external sighting is one species in that report. It has a site or region, a location
    precision, an **observation window** (`observed_start`/`observed_end` and a precision: day,
    range, month or unknown), a confidence level (A: media checked; B: professional report; C:
    second-hand), media rights, a sensitivity flag and `recent_until`.

  Only staff (or server-side jobs using the secret key, never the app) write these.
- **`public_sightings`** (a view): the one public read path. It combines verified community
  sightings and published external sightings in common columns:
  - provenance and support label;
  - species, site or region;
  - observation window and precision;
  - publication date, reporter and source URL.

  Sensitive external sightings hide the exact site.

## What happens to a sighting

| Status | In the diver's log | In public sightings | How it gets there |
| --- | --- | --- | --- |
| **Unverified** | Yes | No | Default on logging; also after editing what, where or when |
| **Evidence submitted** | Yes ("under review") | No (pending) | A photo was attached and awaits review |
| **Confirmed** | Yes | **Yes**: Community Verified, "Confirmed by a dive buddy" | At least one eligible buddy or instructor said "I saw it" |
| **Accepted** | Yes | **Yes**: Community Verified, "Photo reviewed" | A moderator accepted the photo evidence |
| **Rejected** | Yes, with the reason | No | A moderator rejected the evidence, or the sighting |
| **Disputed** | Yes, with the reason | No | Conflicting information; a moderator is looking |

`refresh_sighting_status()` computes the status in this order of precedence:

1. the latest moderator decision on the sighting (reject or dispute) while it stands;
2. accepted evidence;
3. a "saw it" attestation;
4. evidence waiting for review;
5. rejected evidence;
6. unverified.

A "did not see it" from a buddy doesn't dispute a sighting (buddies miss things). "I wasn't there"
flags it for a moderator.

## Verification

### Method A: photo evidence

1. From a sighting, the diver adds one or more photos.
2. The app reads the capture time and position on the device.
3. It uploads the **original** to the private evidence bucket and records it as `evidence`
   (sighting, user, file hash, capture time, advisory flags).
4. The status becomes `evidence_submitted`.
5. A moderator reviews it, with the flags, in a queue:
   - accept: the status becomes `accepted` and the sighting becomes public;
   - reject: the owner sees the reason.

Attaching a photo alone never verifies a sighting.

### Method B: buddy or instructor confirmation

1. The diver taps "Ask a buddy" on a sighting (later: on a whole dive).
2. `create_verification_request()` returns a **10-character code** such as `G2QF0-XJRYR`:
   - Crockford base32, 50 random bits;
   - shown as a code and as a link `scubago://verify/<code>` to share by message or read out on the
     boat;
   - **only its SHA-256 hash is stored**;
   - it expires in 7 days and is single-use by default (up to 10 uses for a group dive);
   - a diver can have at most 20 open requests.
3. The buddy opens the link or types the code **while signed in**. They see what is claimed
   (species, site, date, the diver's username), then choose their role (buddy, instructor,
   divemaster) and answer "I saw it", "I didn't see it" or "I wasn't on this dive".
4. `attest()` records the answer as an **attestation**, not as proof, and recomputes the status.
5. Abuse prevention (all proven by the scenario):
   - the owner can never confirm their own sighting;
   - accounts less than a day old can't confirm yet;
   - wrong, expired or used codes are refused, and **10 wrong codes in an hour lock the account out
     for that hour**;
   - a verifier confirms a given sighting only once;
   - editing the sighting voids its attestations.
6. Later:
   - cap how often the same pair of divers confirm each other, and show moderators confirmation
     loops;
   - verified professionals (an instructor number checked manually) whose confirmations carry more
     weight;
   - optionally, "log it too": the buddy's own sighting is linked into the same encounter.

## External reports

- **Automated sources** (e.g. iNaturalist research grade, CC0 or CC BY only) are ingested by a
  scheduled server-side job (Edge Function or cron with the secret key):
  - one `external_reports` row per record, with `(source_id, external_id)` unique, so reruns never
    duplicate;
  - the observation date comes from the source's observation field, never its upload date.
- **Manual sources** (operator trip reports, newsletters sent with permission) are entered by staff
  in a small form, or the Supabase table editor at first:
  - a summary in our own words;
  - observation window and precision;
  - publication date and source URL;
  - media rights, confidence and sensitivity.

  A second person reviews before publishing. A scheduled job rechecks links, and items drop out of
  "recent" after `recent_until`. Items can be retracted on request.
- See [external-sightings-research.md](external-sightings-research.md) for which sources allow what.

## Row-level security

| Table | Read | Write |
| --- | --- | --- |
| species, dive_sites, regions, external_sources | everyone | staff / seed scripts only (site suggestions go through moderation) |
| sightings | owner (all statuses); public reads go through `public_sightings` | owner inserts and edits **facts** only (column privileges); status only via functions |
| sighting_details, dive_logs | owner | owner |
| evidence | owner and staff | owner adds to **their own** sightings; status only via staff functions |
| verification_requests | requester | only via `create_verification_request()` |
| attestations | verifier and the sighting's owner | only via `attest()` |
| verification_attempts | nobody | only via `attest()` |
| encounters | everyone | functions / staff |
| external_reports, external_sightings | everyone, when published | staff, or server jobs with the secret key |
| moderation_decisions | staff | staff functions |
| flags | reporter and staff | the reporter adds their own |
| staff | yourself | admins (SQL) |

Every function runs as SECURITY DEFINER with an empty `search_path`, fully qualified names, and
EXECUTE granted only where needed. `supabase/checks/audit.sql` grows with each phase to cover
these tables and functions.

## Duplicates and multiple divers

- **One encounter, many divers:**
  - an attestation that links two divers' sightings puts them in one encounter;
  - moderators can also merge candidate pairs (same species, site and day);
  - public counts and "recent" lists count encounters.
- **External duplicates:**
  - automated sources dedupe by `(source_id, external_id)`;
  - manual entry warns about the same source, species and site or region with overlapping dates.
- **Across provenances:** an operator report and a verified community sighting of the same event
  both appear, grouped under the species ("2 reports"), each with its own label.

## Moderation

- **Queues:** evidence to review, open flags, external reports in review, suggested dive sites.
- **Tools:** at first the Supabase dashboard plus staff SQL functions; later a small in-app
  moderator screen, shown only to `is_staff()` users.
- **Audit trail:** every decision is logged with its reason in `moderation_decisions`.

## Migration from today (non-destructive)

1. Add the new tables and columns with defaults. Existing sightings become `unverified`, and
   nothing is dropped.
2. Point the app's public views (map, site pages, species search) at `public_sightings`, and "My
   Log" at the owner's own rows.
3. **Keep the old "sightings are public" policy** until testers have updated to that app version:
   older builds still read `sightings` directly. Then drop it.
4. Copy notes into `sighting_details`, move the app to it, then drop `sightings.notes` in a later
   migration.
5. Move new photos to the evidence flow. Existing public photos stay where they are.

## Interface

- **Provenance labels** reuse the existing pill style (like `RarityChip`: tinted fill, colored
  border):
  - **Dive Operator Report**: "Reported by Pro Dive Cairns · Observed 12–14 Sep · Published 16 Sep";
  - **Research / Monitoring**;
  - **Citizen Science** (e.g. iNaturalist research grade);
  - **Community Verified**: "Confirmed by a dive buddy" or "Photo reviewed";
  - **Unverified**: only in your own log.
- **Your own log:** a quiet status chip on each row (Unverified · Under review · Confirmed · Photo
  accepted · Not accepted, with its reason).
  - After saving, an optional prompt offers "Add a photo" or "Ask a buddy". It never blocks.
- **Site page:**
  - **Recent Marine Life**: one row per species with the most recent report of each provenance, and
    "observed N days ago" (never the publication date presented as the observation date);
  - "What divers see here" (commonly seen);
  - "Your sightings here".
- **Species page:** recent reports across sites and regions.
- **Filters** (only once the data exists):
  - all, operator reports, or verified community;
  - species;
  - last 7, 30 or 90 days;
  - region.

```
Recent Marine Life · Milln Reef                          (illustrative)
  Reef manta ray   [Dive Operator Report]  Pro Dive Cairns · observed 3–5 days ago
  Green turtle     [Community Verified]    Confirmed by a dive buddy · 2 days ago
  (Your hammerhead [Unverified] appears only in your own log)
```

## Open questions

- **Public profile:** should verified sightings show the diver's username, or "a ScubaGo diver"
  unless they opt in?
- **Encounter detection:** how far to automate it (same day and site, or also a time window from
  dive logs)?
- **Moderators:** who they are at the start (you), and what response time testers are told to
  expect.
- **Photo licence:** do accepted photos become public by default, or only with a per-photo opt-in?
  Which licence do divers grant ScubaGo in the terms?
- **Species outside the catalog:** handling taxa from external sources that aren't in the catalog
  (`species_id` null with `taxon_name`): hidden, or shown as "other"?
