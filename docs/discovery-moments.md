# Discovery moments on My Home

Logging a species you've never seen before, then tapping **Visit my home**, plays a short sequence
on the island:

1. If the discovery took the island to a new level, a banner reads **"Island Level 4 — New Growth
   Unlocked"** with what the level brings ("A lush island grove").
2. The island grows into the level. New coral, rocks and palms grow in; a new islet (levels 5
   and 6) rises out of the water with its palm, while the camera pulls back a little.
3. The new animal swims in from the edge of the ocean in its own way, with a small **New** tag
   that follows it. The reef's animals arrive on the reef instead: an octopus edges out from beside
   its rock, a cuttlefish glides in from the deep side of the reef edge, a moray comes out of its
   den head first.
4. The island goes back to its usual life.

Nothing replays: each moment is saved as done once it has played.

## Where the code is

| Piece | File |
| --- | --- |
| Which moments are owed and their order (pure, tested) | `src/lib/discoveries.ts` |
| Playing them on My Home: timing, what's saved when | `src/hooks/use-discovery-moments.ts` |
| A guaranteed place for an arriving species | `pickSwimmers(…, featured)` in `src/lib/swimming.ts` |
| The arrival itself (out of sight, swimming in, settling) | `arrive()` in `src/lib/marine-motion.ts` (the reef's: `src/lib/reef-life.ts`) |
| The tuna school arriving | `hold()` / `release()` in `src/lib/tuna-school.ts` |
| Growth: things rising or growing in | `src/components/home/three/unlock.tsx`, `islet-material.ts` |
| Banner, New tag, note | `src/components/home/discovery-overlays.tsx` |

## Which moments are owed

The collection is derived from sightings, so moments come from comparing it with a small record kept
per diver on the device (AsyncStorage, `scubago:discoveries:v1:<user>`). The record holds when
tracking began, which species have been celebrated, and the last level celebrated.

- **New species:** in the collection, not yet celebrated, and it joined after tracking began. It
  joins at its first sighting, or at the edit that changed a sighting to it.
- **Already owned:** another sighting of a species you have never triggers anything.
- **Restored or synced older logs** (a new install, a sign-in): species that joined before tracking
  began are taken as read, quietly, and so is any level they bring.
- **Deleted:** a species that leaves the collection is forgotten. If its sighting is deleted before
  Home was opened, its arrival (and any level-up it caused) never plays. Logging it again later is
  a discovery again.
- **Level-ups:** owed only when the level rises because of new discoveries. A level that falls
  (deletions) is followed quietly.
- **Offline:** all local; logging offline works the same.
- **Closing the app early:** anything not yet played is still owed next time. Each step is saved as
  done only after it has played.

## The sequence

| Step | Time | Notes (`MOMENT_TIMING`) |
| --- | --- | --- |
| Settle after Home comes into view | 0.35 s | Lets a closing sheet finish |
| Banner alone | 1.8 s | The island still shows the old level |
| Banner while the island grows | 3.8 s | Growth takes 3.5 s (2 s in lite quality) |
| Each arrival | until it has swum in | 7–20 s, depending on the species; 45 s limit |
| New tag after arriving | 5 s | Then it fades |
| Between moments | 0.7 s | |

- **At most three arrivals per visit** (`ARRIVALS_PER_VISIT`). Any further new species, and any the
  island has no animal for (a nudibranch, a dugong), get one short note: "New in your collection:
  Hawksbill Turtle".
- **Two new species** arrive one after the other, in the order they were logged.
- **Tuna** arrive as the whole school, once, however many tuna species are new; the tag follows the
  school.
- The island's paging (8 animals at a time, rotating every 30 s) holds still while moments play.

## Guaranteed on screen, within the budget

An arriving species is given a featured place (`pickSwimmers(residents, page, MAX_ANIMATED,
featured)`). If it isn't on the page showing, it takes the page's last place, so the island never
animates more than `MAX_ANIMATED` (8) animals. The featured place lasts for the visit; the next page
change returns to the usual rotation.

It waits out of sight from the moment the collection changes: invisible, and ignored by the other
animals and the school. On its turn, `arrive()` places it just beyond what the camera shows (working
out the view from the canvas's shape and the ocean's scale), straight out past its place near the
island, heading in. It then swims in using its own movement and rig:

| Species | Entrance (`ARRIVAL_PACE`, × cruise) |
| --- | --- |
| Great white | 1.35: powerful strokes |
| Tiger shark, hammerhead | 1.15 |
| Dolphins | 1.25: the pod arrives together |
| Whale shark, manta, turtle, sunfish | 1: slow, gliding, flipper-driven, as they swim |

It doesn't dive on the way in, then gets a full stretch at the surface before its dives resume. Out
of sight it covers ground 1.5× faster (`UNSEEN_PACE`), so nobody waits long for a slow animal.

## The New tag

A small pill, "**New** Reef Manta Ray", 46 px above the animal. It is kept inside the card, fades in
once the animal is in view, and fades after it has settled. Its position is projected from the 3D
scene every frame. It never covers the animal.

## Islets rising

What each level adds is wrapped in `<Unlock at={level} kind="rise" | "grow">`. Items already there
when the island is first shown are simply there. Items unlocked while it is on screen rise from
0.7 units under the water (islets, carrying their palms) or grow from nothing (coral, rocks, palms),
with an ease in and out. While an islet rises, anything below the moving waterline takes on the
water's colour and fades with depth (`islet-material.ts`), so the waterline crosses it as it comes
up. The islet's own materials are put back once it's in place. Geometry is never rebuilt: only
transforms change.

## Reduced motion, a paused scene, lite quality

- **Reduced motion or paused:** the progression still happens. The banner fades without sliding,
  new growth simply appears, arrivals are placed straight in their spots, and the tag and note
  still show.
- **Lite quality** (emulated GPUs): the same sequence, a shorter growth (2 s), and the waterline
  measured from the calm surface.
- **No 3D** (the fallback island): arrivals count as done straight away, so the banner and notes
  still play.

## Tests

`src/lib/__tests__/discoveries.test.ts` (what's owed), `marine-arrival.test.ts` (arrivals,
the school, featured places), `src/hooks/__tests__/use-discovery-moments.test.js` (the sequence,
no replays) and `src/components/home/__tests__/unlock.test.js` (the islet's final position).
