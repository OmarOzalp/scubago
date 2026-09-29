# Getting ScubaGo onto real iPhones

This guide covers how to build ScubaGo, put it on an actual iPhone and hand it to testers. It
also covers how to check that the Supabase project is set up safely after a reset. Commands are
for EAS CLI 24.x (`npm install -g eas-cli`, or `npx eas-cli@latest …`).

## 1. What you can test where

| Way | What you need | Cost | Good for | Not good for |
| --- | --- | --- | --- | --- |
| **Expo Go** (App Store app) with `npx expo start` | An Expo account, signed in both in the terminal (`npx expo login`) and in Expo Go. From SDK 57, iOS Expo Go only runs projects when both sides use the same account. | Free | Everyday development on your phone: screens, sign-in, logging, the island's look. Every native module ScubaGo uses (expo-gl, expo-sqlite, maps, image picker, reanimated) is built into Expo Go. | Performance numbers (the JS runs in development mode inside Expo Go). The app's own name, icon, splash and permission texts. Testers (they would need your laptop's dev server). |
| **Simulator build** (`eas build -p ios --profile simulator`) | An Expo account; **no Apple account** | Free (EAS free tier) | Checking the real release build on your Mac. | Performance: the simulator draws GL in software on your Mac's CPU, so the island falls back to its "lite" tier. |
| **Your iPhone through Xcode** (`npx expo run:ios --device`) | A Mac with Xcode and a free Apple ID ("Personal Team") | Free | A one-off try on your own phone before paying. | Anyone else. The app stops launching after 7 days, and a free Apple ID allows only a few devices. |
| **Preview build** (`eas build -p ios --profile preview`) | **Apple Developer Program**, and each iPhone registered with `eas device:create` | US$99/year (Apple) | Measuring the island on real hardware (the performance badge is on); you and a few friends' registered iPhones. | Many testers: every device must be registered, and each new device needs a rebuild. |
| **TestFlight** (`eas build -p ios --profile production` + `eas submit -p ios`) | **Apple Developer Program**, and an app record in App Store Connect | Included | Real testers. Internal testers (up to 100 App Store Connect users) can install as soon as the build is processed. External testers (up to 10,000, by email or a public link) need Beta App Review on the first build of each version. Builds expire after 90 days. | Quick iteration: every change is a new build. |

A **development build** (a custom Expo Go with your app's native code) is only needed once ScubaGo
uses a native module that Expo Go lacks. Today it uses none, so Expo Go plus preview or TestFlight
builds cover everything. When a native module arrives (for example, an image-processing library for
evidence photos), add `expo-dev-client` with `npx expo install expo-dev-client` and a `development`
profile (`"developmentClient": true, "distribution": "internal"`).

## 2. The Apple Developer Program

- **Do you have it?** Sign in at <https://developer.apple.com/account>. An active membership shows
  "Apple Developer Program" with a renewal date. A free Apple ID shows only the agreement and your
  profile.
- **Joining:** <https://developer.apple.com/programs/enroll/>, US$99 a year (or your country's
  price). You need an Apple ID with two-factor authentication.
  - **Individual:** your name is shown as the seller. This is the quickest option, and approval
    usually comes within about two days.
  - **Organization:** your company's name is shown. It needs a D-U-N-S number and takes longer.
- **What needs it:** preview (ad hoc) builds on iPhones, TestFlight and the App Store.
- **What doesn't:** Expo Go, simulator builds, and a 7-day Xcode install with a free Apple ID.

## 3. One-time setup

```bash
npm install -g eas-cli
eas login            # the same Expo account you use in Expo Go
eas init             # links the project to EAS; writes the project ID into app.json (commit it)
```

- **Bundle identifier:** `com.omarozalp.scubago` (in `app.json`). Change it now if you prefer
  another. Once App Store Connect has an app with this identifier, it can never be renamed.
- **The app's name on the home screen:** "ScubaGo". The App Store name must be unique across the
  whole store. If "ScubaGo" is taken, App Store Connect lets you pick a longer store name (for
  example "ScubaGo: Dive Log"), while the home screen keeps "ScubaGo".

### Supabase settings for builds

EAS doesn't upload your `.env` file (it's git-ignored), so builds get their settings from EAS
environment variables. Only two settings go in, and both are public by design:

```bash
eas env:set --environment preview --environment production --visibility plaintext \
  --name EXPO_PUBLIC_SUPABASE_URL --value https://YOUR-PROJECT-REF.supabase.co
eas env:set --environment preview --environment production --visibility plaintext \
  --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value sb_publishable_…
```

(`eas env:push --environment preview --path .env`, then the same with `--environment production`,
copies them from your `.env` instead.)

- **Never** store the secret key (`sb_secret_…`) or the legacy service_role key in EAS for this
  app. No build step needs it.
- Everything named `EXPO_PUBLIC_*` is compiled into the app, where anyone can read it. Every EAS
  build runs `npm run check:env` (the `eas-build-post-install` hook), and the build **fails** in
  either of these cases:
  - a privileged key, a database URL or a secret-sounding `EXPO_PUBLIC_` name shows up anywhere the
    app could include it;
  - a preview or production build is missing its Supabase settings, so it would quietly run without
    sign-in or sync.
- The app also refuses a privileged key at runtime.
- `eas integrations:supabase:connect` can write these variables for you. Only use it with
  `--link <project-ref>` to point at your existing project. Without `--link` it can create a new
  project.

## 4. Building and installing

**Simulator (no Apple account):**

```bash
eas build -p ios --profile simulator
eas build:run -p ios --latest     # installs it on a simulator you pick
```

**Your iPhone (preview build, Apple Developer Program):**

1. Run `eas device:create` and open the link it prints on the iPhone. That registers the device.
2. Run `eas build -p ios --profile preview`. The first time, EAS asks you to sign in with your Apple
   ID, then creates and manages the signing certificate and provisioning profile for you.
3. Open the build page (link or QR code) on the iPhone and install.
4. iOS asks you to turn on Developer Mode (Settings → Privacy & Security → Developer Mode, then
   restart) before it opens an ad hoc build.
5. To add someone's iPhone later: they open a new `eas device:create` link, then you build again.

**TestFlight:**

```bash
eas build -p ios --profile production       # the build number counts up by itself
eas submit -p ios --latest                  # uploads to App Store Connect
# or both at once, with a note for testers:
eas build -p ios --profile production --auto-submit --what-to-test "Try logging a sighting and watch the island"
```

- The first submit signs in to App Store Connect and can create the app record.
- Processing takes a few minutes to about half an hour. Then add testers in App Store Connect →
  TestFlight.
- **Internal testers:** people you add as users of your App Store Connect team. They can install
  as soon as the build is processed.
- **External testers:** anyone, by email or public link. Before the first external build, fill in
  "Test Information":
  - a feedback email and a short description of the app;
  - sign-in details for a test account, so the reviewer can try sync;
  - a privacy policy URL, which App Store Connect asks for.
- **Feedback:** testers take a screenshot in the app and choose "Share Beta Feedback".
  - Read it in App Store Connect, or with `eas testflight:feedback`.
  - Crashes are in App Store Connect, or `eas testflight:crashes`.

## 5. Measuring the island on a real iPhone

Most performance work so far was measured in simulators and software-rendered benchmarks. On a
phone, use a **preview build**: its Sanctuary card shows a small badge that refreshes every two
seconds.

```
60 fps · 0 slow · full
JS 4.1 ms (max 9.0) · GL 3.2 ms · 31 draws · 12.3k tris
```

- **fps** is frames drawn per second.
- **slow** counts frames that took longer than 25 ms (visible hitches).
- **full / lite** is the quality tier. Real iPhones get "full"; simulators get "lite".
- **JS** is the JavaScript work per frame: animal motion, rigs and building the frame. Above about
  10 ms means the JS thread is the limit.
- **GL** is how long Expo GL's queue takes to finish a frame, sampled once a second. Above about
  12 ms with low JS means the GPU is the limit (the ocean shaders, and anti-aliasing: see below).
- **draws / tris** are draw calls and triangles for the frame.

What to try, noting the iPhone model each time:

- a fresh launch;
- a collection with 8 animals swimming;
- island level 1 and level 6 (the camera pulls back and the ocean grows);
- a pod of dolphins leaping, and the tuna school during a great white's charge;
- five minutes in, since phones slow down as they warm up;
- Low Power Mode;
- battery use over ten minutes (Settings → Battery).

An older iPhone (an 11 or XR, say) is the most useful second data point. Screenshots of the badge,
sent through TestFlight feedback or by message, carry all the numbers.

Two related fixes:

- The island's canvas on iPhones no longer renders a third more pixels than it shows (the
  `flex: 0` fix).
- An earlier investigation (`claude/fix-ios-island-render`) found that 4× anti-aliasing may stay on
  for iOS, because of how React Three Fiber creates the GL view. It is unverified and not changed
  here. If GL time is high on a real phone, it is the next thing to try.

## 6. Supabase after a reset

Work through these in order. Nothing here recreates or resets the project.

1. **Keys.** In Project Settings → API Keys, copy the **publishable** key (`sb_publishable_…`)
   into `.env` as `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and into EAS (above).
   - The **secret** key is only for seeding. Pass it on the command line (step 3); never keep it in
     a file.
   - Run `npm run check:env` to check your local settings.
2. **Schema.** Run `npx supabase login`, then `npx supabase link --project-ref YOUR-PROJECT-REF`.
   Then `npx supabase db push` applies whichever of the migrations in `supabase/migrations/` the
   project doesn't have yet:
   - 0001: schema and row-level security;
   - 0002: account-deletion cascades and photo limits;
   - 0003: protects PostGIS's table;
   - 0004: in-app account deletion;
   - 0005: dive-site details, regions, external IDs and sources.

   If the earlier migrations were pasted into the SQL editor, the CLI has no record of them, and
   `db push` would try to run 0001 again. First mark the ones already in place:
   `npx supabase migration repair --status applied 0001 0002`. The audit below shows which are in
   place. **Never** run `supabase db reset --linked`: it wipes the live database.
3. **Catalog.** Sightings point at species and dive sites, so an empty catalog makes every upload
   fail. The script only upserts, so it's safe to run again:
   `SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co SUPABASE_SECRET_KEY=sb_secret_… npm run seed:supabase`.
4. **Authentication.**
   - Authentication → Sign In / Providers → Email: enabled, with **"Confirm email" off**. ScubaGo's
     sign-in creates the account on first use and expects a session straight away. With
     confirmation on, the app now says so instead of half-signing people in.
   - New users must be allowed to sign up.
   - The app asks for passwords of 6+ characters.
5. **Check it.**
   - `npm run check:supabase` checks from outside with the publishable key: that the key works, the
     auth settings, the seeded catalog, that anonymous writes are refused by row-level security,
     and that the photo bucket exists. It changes nothing.
   - In the SQL editor, run `supabase/checks/audit.sql` (read-only). Every row should be `ok` or
     `info`; fix any `ACTION`.
   - In the SQL editor, run `supabase/checks/rls-isolation.sql`. It ends in an intentional error
     that reads "RLS isolation check: 15 passed, 0 failed". The error rolls the check back, so
     nothing is saved.
   - In the dashboard, check Advisors → Security Advisor (or run `eas integrations:supabase:advisors`
     once linked).

### What the security model is today

- **Reading:** species, dive sites, profiles (usernames) and **all sightings** (species, site,
  date, notes, photo URL) can be read by anyone. That's ScubaGo's original "public by default"
  design; tell testers. The sighting-verification work (docs/roadmap/) makes unverified sightings
  private.
- **Writing:** only the owner can create, edit or delete a sighting or their profile, or add a site
  in their own name. Nobody can edit the catalog from the app. The isolation check proves each of
  these.
- **Photos:** the bucket is public-read, limited to 10 MB and image types. Each user can write only
  inside their own folder. On iOS, photos are re-encoded before upload, so the location a photo was
  taken at never reaches the bucket. **Android still keeps it:** before Android testing, re-encode
  there too (for example with `expo-image-manipulator`).
- **Sessions:** kept on the device in AsyncStorage (inside the iOS app sandbox, not in the
  Keychain) and refreshed only while the app is in the foreground. Sign-out and account deletion
  clear it. Moving it to the Keychain (`expo-secure-store`) is an optional hardening step for later.
- **Account deletion:** in the app (Account → Delete account), once migration 0004 is applied. It
  removes the user's photos, then their account, which takes their profile and sightings with it.
  Dive sites they added stay, without their name.

## 7. Before inviting real testers

Done in this pass:

- [x] EAS profiles, bundle identifier, display name, export-compliance answer, permission texts
- [x] No privileged key can be built into the app (build check and runtime refusal)
- [x] No invented community sightings once the real backend is configured
- [x] Photo location metadata stripped on iOS
- [x] Clear sign-in error if the project requires email confirmation
- [x] In-app account deletion (after migration 0004)
- [x] Placeholder ScubaGo icon and splash instead of Expo's logo
- [x] Performance badge in preview builds; the canvas no longer over-renders on iPhones
- [x] Supabase checks: `check:supabase`, `audit.sql`, `rls-isolation.sql`

Your part:

- [ ] Apple Developer Program, if you aren't enrolled
- [ ] Confirm the bundle identifier and app name
- [ ] `eas init`, then set the two EAS environment variables
- [ ] Apply migrations 0003 and 0004, seed the catalog, run the three checks
- [ ] A privacy policy page (App Store Connect asks for its URL). It should cover:
  - what's collected: email, username, sightings with notes, photos and sites;
  - that sightings are public;
  - how to delete an account.
- [ ] Fill in the App Privacy questionnaire in App Store Connect
- [ ] A feedback route: TestFlight's built-in feedback, plus an email address for testers

Soon after:

- [ ] **Password reset.** It needs an email provider for Supabase: custom SMTP such as Resend,
  Postmark or Amazon SES. Supabase's built-in sender is meant for testing, is heavily rate-limited
  and may only deliver to your own team's addresses (check the current Supabase docs). Then add a
  "Forgot password" flow in the app.
- [ ] Android: strip photo location metadata before any Android testing
- [ ] Crash reporting beyond TestFlight's (for example Sentry): optional
- [ ] Sign in with Apple is *not* required: Apple asks for it only when an app offers other
  third-party sign-ins.
