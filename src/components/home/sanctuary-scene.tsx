import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { useFrame, useThree } from '@react-three/fiber';
import { SceneCanvas as Canvas } from './three/scene-canvas';
import { useSceneQuality } from './three/scene-quality';
import { WATER } from './three/sanctuary-environment';
import { SceneBoundary, SceneUnavailable } from './scene-boundary';
import { SceneCamera } from './three/scene-camera';
import { IslandPerfBadge } from './island-perf-badge';
import { FrameReport, IslandPerfProbe, ScenePerformance } from './three/scene-performance';
import { GovernorHold } from './three/governor';
import { perfMark, perfReport, type EpisodeKind } from '@/lib/perf-report';
import { EXPLORER_MARKS, HOME_MARKS, markOnce, markStep, SceneMarksContext, whenMarked, type SceneMark } from './three/scene-marks';
import { createStager, STAGE, type Stager } from './three/stager';
import { WarmUp, type WarmUpOptions } from './three/warm-up';
import { StagingProvider } from './three/staging';
import { router } from 'expo-router';
import { DiscoveryNote, LevelUpBanner, NewTag } from './discovery-overlays';
import { IslandScene } from './island-scene';
import { MacroLife } from './three/macro-life';
import { MarineSwimmers, type Arrivals } from './three/marine-swimmers';
import { SanctuaryEnvironment, type SceneIsland } from './three/sanctuary-environment';
import { TapAnywhere } from './three/tap-anywhere';
import { useMarineModels } from './three/use-marine-models';
import { preloadSeabedBakes, useSeabedReady } from './three/seabed-assets';
import { EXPLORER_REACH } from '@/lib/seabed-bake';
import { habitatsOf } from '@/lib/seabed-depth';
import type { MarineModels } from './three/marine-loader';
import { useSceneActive, useSceneVisible } from '@/hooks/use-scene-active';
import type { WaterReach } from '@/lib/explorer-view';
import { HOME_SHORE, type Habitat } from '@/lib/home';
import { shapeFor } from '@/lib/island-outline';
import { useOceanPaused } from '@/lib/ocean-pause';
import { captureFrame, captureScene, registerSceneCapture, releaseSnapshot } from '@/lib/scene-snapshot';
import { rememberExplorerPicture, rememberHomePicture, rememberHomeScene } from './home-start';
import { IDLE_MS } from './ocean-ahead';
import { useIdle } from './use-idle';
import { FrameWatch, InstantPicture, useInstantPicture } from './instant-picture';
import { MACRO_SPECIES, macroResidents, type MacroSpecies } from '@/lib/macro-life';
import { clamp, oceanScale, variation } from '@/lib/steering';
import {
  ageLineup, hasSchool, lineupSwimmers, MAX_ANIMATED, SCHOOL_SPECIES, schoolSpeciesFor, startLineup, swimsInSchool, syncLineup, takeTurn, TURNS,
  type Lineup, type MarineModel,
} from '@/lib/swimming';
import type { DexEntry } from '@/lib/types';

/**
 * Only the diver's own discoveries swim here: a new island's ocean is empty until the first one.
 * For reviewing the island's animals together, EXPO_PUBLIC_ISLAND_SHOWCASE=1 (restart Metro with
 * --clear) brings every species model as a visitor, whatever the collection holds (development only).
 */
const SHOWCASE = process.env.EXPO_PUBLIC_ISLAND_SHOWCASE === '1';
/** Frame timing over the card, for measuring the island on real phones (set in the EAS preview profile). */
const ISLAND_PERF = process.env.EXPO_PUBLIC_ISLAND_PERF === '1';
const SHOWCASE_SWIMMERS = (['whale-shark', 'great-white-shark', 'tiger-shark', 'reef-manta', 'mola-mola', 'green-turtle', 'scalloped-hammerhead', 'bottlenose-dolphin',
  'great-barracuda', 'sailfish', 'california-sea-lion', 'spotted-eagle-ray', 'golden-jellyfish',
  // The Open Ocean's animals, far out from the island.
  'humpback-whale', 'sperm-whale', 'oceanic-whitetip', 'leatherback-turtle', 'oceanic-manta',
  // The Kelp Forest's (shown on Home's island in the showcase, though they live at their own).
  'harbor-seal', 'sea-otter', 'garibaldi', 'leafy-seadragon', 'orca',
  'marine-iguana', 'galapagos-shark', 'thresher-shark', 'giant-trevally', 'king-angelfish',
  'dugong', 'sawfish', 'lemon-shark', 'southern-stingray', 'tarpon', 'bull-shark', 'bull-ray', 'cownose-ray',
  // The reef's animals keep to their own places on the reef (reef-life.ts): the moray's den, the octopus's rock, the cuttlefish's reef edge, the clownfish's anemone.
  'giant-moray', 'day-octopus', 'giant-cuttlefish', 'clownfish'] as const)
  .map((model, lane) => ({ model, lane }));
/** And the reef's small life, every one, in the explorer. */
const SHOWCASE_MACRO = Object.keys(MACRO_SPECIES) as MacroSpecies[];

/** A mostly overhead orthographic view gives the island an illustrated 2.5D appearance. */
export const SCENE_CAMERA = { position: [0, 12, 6] as [number, number, number], zoom: 31, near: .1, far: 60 };

/** The discovery moments the scene plays (see useDiscoveryMoments): arrivals and their "New" tag. */
export type SceneMoments = Pick<Arrivals, 'waiting' | 'now' | 'onArrived'> & {
  /** New species with a guaranteed place on the island while they arrive. */
  featured: readonly string[];
  tag: { speciesId: string; label: string } | null;
  /** A level-up banner over the island, and a note along its bottom. */
  banner: { level: number; reward: string; visible: boolean } | null;
  note: string | null;
  /** Moments are playing: the island's animals don't take turns meanwhile. */
  busy: boolean;
};

const SCHOOLED = SCHOOL_SPECIES.filter(swimsInSchool);
const NONE: readonly string[] = [];
/** No animal's model loaded yet: the scene swims on, and each joins as its own arrives. */
const NO_MODELS: MarineModels = {};
/** How long the card's scene is on show with all its animals before its picture is kept for the next launch (ms). */
const PICTURE_AFTER_MS = 3000;
/** The same for the explorer's opening view: sooner, as it is only a picture of the view while it has not been moved. */
const EXPLORER_PICTURE_AFTER_MS = 1500;
/** How long the explorer's picture may take to be drawn and read back (ms): nothing waits for it. */
const EXPLORER_CAPTURE_TIMEOUT_MS = 10000;
/** How long after the explorer is built the phone is left alone before the shader programs the other islands need are linked (ms; see Warm). */
const EXPLORER_WARM_AFTER_MS = 1000;
/** Where the tag sits over its animal (px): centered above it, kept inside the card. */
const TAG = { above: 46, margin: 8, height: 24 };

/** How long (s, of the scene on show) until island `index`'s next turn (`turns` taken so far): about TURNS.every, jittered, the first of each island at its own time. */
const turnAfter = (index: number, turns: number) => TURNS.every * (turns === 0 ? .45 + .5 * variation(index + 11, 0) : 1 - TURNS.jitter + 2 * TURNS.jitter * variation(index + 3, turns));

/**
 * Each island's lineup (see Lineup in swimming.ts): who is on it now, kept in step with the collection and the featured new species
 * (`featured`, at the first island). While `run` (the scene on show, no discovery moment playing), one species at a time takes its
 * turn on the island, each island on its own clock; a turn waits until the newcomer's model is loaded (`ready`), and the new featured
 * species is never the one to leave.
 */
function useLineups(places: readonly ScenePlace[], featured: readonly string[], run: boolean, ready: (model: MarineModel) => boolean) {
  const [kept, setKept] = useState<ReadonlyMap<string, Lineup>>(() => new Map());
  // In step with the collection (the same lineup when nothing changed, so this settles at once).
  const now = places.map((place, i) => {
    const was = kept.get(place.key), keep = i === 0 ? featured : NONE;
    return was ? syncLineup(was, place.residents, MAX_ANIMATED, keep) : startLineup(place.residents, MAX_ANIMATED, keep);
  });
  if (places.some((place, i) => kept.get(place.key) !== now[i])) setKept(new Map(places.map((place, i) => [place.key, now[i]])));
  // The timer reads the latest of everything (and keeps each island's clock: seconds on show since its last turn, and when the next is due).
  const latest = useRef({ places, featured, ready, kept });
  useEffect(() => { latest.current = { places, featured, ready, kept }; });
  const clocks = useRef(new Map<string, { shown: number; due: number }>());
  // An animal leaving counts its seconds down every second, but nothing on screen changes until it is gone: the lineups aged since the
  // state last changed are kept here, not set, so the scene is not rendered again every second (with an animal leaving somewhere most of
  // the time, the explorer's whole tree was: a measured 7 ms of a frame on average under an interpreter).
  const aged = useRef<{ from: ReadonlyMap<string, Lineup>; value: ReadonlyMap<string, Lineup> } | null>(null);
  useEffect(() => {
    if (!run) return;
    const timer = setInterval(() => {
      const { places: islands, featured: keep, ready: loaded, kept: state } = latest.current;
      const lineups = aged.current?.from === state ? aged.current.value : state;
      let changed = false, shown = false;
      const next = new Map(lineups);
      islands.forEach((place, i) => {
        const was = lineups.get(place.key);
        if (!was) return;
        const clock = clocks.current.get(place.key) ?? { shown: 0, due: turnAfter(i, 0) };
        clocks.current.set(place.key, clock);
        clock.shown += 1;
        let lineup = ageLineup(was, 1);
        if (clock.shown >= clock.due) {
          const turn = takeTurn(lineup, place.residents, i === 0 ? keep : NONE);
          // The newcomer comes once its model is ready (it is asked for ahead of its turn); until then the turn waits.
          if (turn !== lineup && loaded(turn.shown[turn.shown.length - 1].model)) {
            lineup = turn;
            clock.shown = 0; clock.due = turnAfter(i, turn.turns);
          }
        }
        if (lineup !== was) {
          next.set(place.key, lineup); changed = true;
          // (who is on the island, or who is still leaving it, is what the scene draws)
          if (lineup.shown !== was.shown || lineup.leaving.length !== was.leaving.length) shown = true;
        }
      });
      if (shown) { aged.current = null; latest.current.kept = next; setKept(next); }
      else if (changed) aged.current = { from: state, value: next };
    }, 1000);
    return () => clearInterval(timer);
  }, [run]);
  return now;
}

/**
 * The island explorer (src/app/explore.tsx) draws the archipelago full screen: its own camera
 * (ExplorerCamera, which goes inside the islands' ocean) in place of the card's, tap targets sized
 * for its zoom (tapScaleAt), and the reef's small life (MacroLife), which comes into view as it
 * zooms in (`zoom`, its points per world unit now).
 */
export type ExplorerScene = {
  camera: ReactNode; tapScale: number; zoom: () => number;
  /** How far its water reaches from every island's middle (waterReach in explorer-view.ts: farther on a wide screen). */
  reach: WaterReach;
  /** Look closely at a point on the water (x, z): ease over and in to at least `zoom`. */
  focus: (x: number, z: number, zoom: number) => void;
  /** Where the camera is: the islands (their keys) nearest it first, and how many are in or near the view. What is built first, and when the camera nears another. */
  near?: () => { order: readonly string[]; near: number };
  /**
   * Its opening view's key for the kept picture (explorerViewKey), null until the screen is measured (no key given: no picture). The picture
   * is let go once the view has moved (`opening` false: nothing has moved it yet; `watch`: hear it move).
   */
  pictureKey?: string | null;
  opening?: () => boolean;
  watch?: (listener: () => void) => () => void;
  /** Whether a finger is down or the camera is easing: the idle warm-up leaves its next program until it is not. */
  busy?: () => boolean;
};

/** An island in the scene's ocean (its middle, world units, and its shores) and the species living there. */
export type ScenePlace = { key: string; habitat: Habitat; x: number; z: number; residents: DexEntry[] };

/**
 * Home's card tells the Share flow how to take its picture (src/lib/scene-snapshot.ts) for as long as
 * it can: the scene is drawn and on show, and not in the cheap 'lite' tier of an emulator, where reading
 * the picture back would stall the software renderer. It reads the renderer only when asked.
 */
function SnapshotRegistrar({ name, ready }: { name: 'home' | 'explorer'; ready: boolean }) {
  const get = useThree((state) => state.get);
  const lite = useSceneQuality() === 'lite';
  useEffect(() => {
    if (!ready || lite) return;
    return registerSceneCapture(name, (request) => {
      const { gl, scene, camera } = get();
      return captureFrame({ gl, scene, camera }, request);
    });
  }, [name, ready, lite, get]);
  return null;
}

/**
 * In the canvas: links the shader programs the islands' materials need before they are drawn (three/warm-up.tsx; a program is built the first
 * time something is drawn with it, and the frame that does it stops until the GL thread has built it). It draws one kind of program a frame, so it
 * never holds a frame up. A new list of shores (`key`) warms the kinds it needs that were not done before.
 */
function Warm(options: Omit<WarmUpOptions, 'quality'> & { paced?: boolean; paused?: () => boolean }) {
  const quality = useSceneQuality();
  return <WarmUp {...options} quality={quality} />;
}

/** Asks for a frame as the scene comes back on show (its frame loop was stopped while it was out of sight; one on demand would otherwise wait for something to ask). */
function Wake({ visible }: { visible: boolean }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => { if (visible) invalidate(); }, [visible, invalidate]);
  return null;
}

/** How long at most an island switch keeps the last picture of the island it leaves (ms), however long the next one takes to build. */
const HOLD_MAX_MS = 1500;

/**
 * Keeps the canvas showing its last drawn frame while the island switched to on Home's card has its coast and what grows on it still to build
 * (a first visit: an island built before is there in the first frame). Drawn meanwhile, the card showed the island's place in the sea as a hole,
 * the card's paper through the water, for as long as the coast took to build: hundreds of ms on a phone. A useFrame of positive priority
 * takes over the drawing from R3F, and this one draws nothing: the frame loop, the swimming and the building go on, and the screen (a browser's
 * canvas, or Expo GL's view, until its next frame is presented) keeps the island it leaves. Once the new island is whole, or after
 * HOLD_MAX_MS, it lets go and R3F draws again.
 */
export function HoldDrawing({ stager, island, onDone }: { stager: Stager; island: string; onDone: () => void }) {
  const invalidate = useThree((state) => state.invalidate);
  const state = useRef({ frames: 0, start: 0, done: false });
  const latest = useRef(onDone);
  useEffect(() => { latest.current = onDone; });
  const finish = useCallback(() => {
    if (state.current.done) return;
    state.current.done = true;
    latest.current();
    invalidate();
  }, [invalidate]);
  useEffect(() => {
    const timer = setTimeout(finish, HOLD_MAX_MS);
    return () => clearTimeout(timer);
  }, [finish]);
  useFrame(() => {
    const value = state.current;
    if (value.done) return;
    if (!value.start) value.start = performance.now();
    value.frames++;
    // (the first frames come before the island's parts have said what they have to build)
    if (value.frames > 2 && !stager.pending(island, [STAGE.coast, STAGE.props])) finish();
    else if (performance.now() - value.start > HOLD_MAX_MS) finish();
  }, 1);
  return null;
}

/** How long at most the explorer's first open keeps its veil (ms), however long its islands take to build. */
const VEIL_MAX_MS = 8000;
/** How long the veil takes to fade (ms; at once with Reduce Motion). */
const VEIL_FADE_MS = 400;

/**
 * In the canvas: calls `onWhole` once the islands `inView()` names have their coasts and what grows on them built (the first frames, which come
 * before the islands have said what they have to build, are not counted), or after VEIL_MAX_MS. It draws as usual (the veil is a view over it).
 */
export function IslandsWhole({ stager, inView, onWhole }: { stager: Stager; inView: () => readonly string[]; onWhole: () => void }) {
  const state = useRef({ frames: 0, start: 0, done: false });
  const latest = useRef({ inView, onWhole });
  useEffect(() => { latest.current = { inView, onWhole }; });
  useFrame(() => {
    const value = state.current;
    if (value.done) return;
    if (!value.start) value.start = performance.now();
    value.frames++;
    const whole = value.frames > 2 && latest.current.inView().every((island) => !stager.pending(island, [STAGE.coast, STAGE.props]));
    if (whole || performance.now() - value.start > VEIL_MAX_MS) { value.done = true; latest.current.onWhole(); }
  });
  return null;
}

/** Marks the scene's first drawn frame (scene-marks.ts), and for the performance report the first frame and the completion of an open or a switch. */
function FirstFrame({ mark, episode, complete }: { mark: SceneMark; episode: EpisodeKind; complete: () => boolean }) {
  useFrame(() => {
    markOnce(mark);
    perfReport.step(episode, 'frame');
    if (perfReport.waiting(episode, 'complete') && complete()) perfReport.step(episode, 'complete');
  });
  return null;
}

export function SanctuaryScene({ habitat, level, residents, islands, paused = false, loading = false, onInspect, onOpen, moments, explorer, warm }: {
  habitat: Habitat; level: number; residents: DexEntry[]; paused?: boolean; loading?: boolean; onInspect: (model: MarineModel) => void;
  /**
   * The shores of every island the collection has (Home's card shows one at a time, from the pills): once Home's island has been on show with its animals
   * and the phone is idle, the shader programs each of them needs are linked, so a first visit to another links none. Defaults to the island shown.
   */
  warm?: readonly Habitat[];
  /**
   * Every island in the ocean, each with its own residents (the explorer's archipelago). Unless
   * given, the habitat's island alone, home to `residents`. Discovery moments play at the first.
   */
  islands?: readonly ScenePlace[];
  /** A tap anywhere on the island that no animal takes (the Home card: open it full screen). */
  onOpen?: () => void;
  moments?: SceneMoments; explorer?: ExplorerScene;
}) {
  const active = useSceneActive(paused);
  // (an ocean the person stopped on the You screen is paused, not still for Reduce Motion: it can still be photographed)
  const oceanPaused = useOceanPaused();
  const visible = useSceneVisible();
  // Once it has been on show, a scene that is not (another screen is over it, or the app is in the background) draws nothing at all, not a frame
  // on demand either: a screen that is kept (Home's under the explorer, the explorer's under Home) is asleep, and takes no CPU or GPU.
  const [shownOnce, setShownOnce] = useState(false);
  if (visible && !shownOnce) setShownOnce(true);
  const asleep = shownOnce && !visible;
  const places = islands ?? [{ key: habitat, habitat, x: 0, z: 0, residents }];
  const preview = SHOWCASE;
  const visitors = SHOWCASE_SWIMMERS;
  const busy = !!moments?.busy;
  // Each island's animals: who is on it now and who is leaving at the end of a turn (useLineups). Logged tuna are shown by
  // the school rather than as a swimmer of their own; a tap on it opens their species. A new discovery arriving has a place
  // of its own. No tuna unless one is logged (the showcase shows every animal, the school included, at the first island).
  const [models, setModels] = useState<MarineModels | null>(null);
  const turns = useLineups(places, moments?.featured ?? NONE, active && !busy && !loading && !!models, (model) => !!models?.[model]);
  const lineups = places.map((place, i) => ({
    place,
    swimmers: lineupSwimmers(turns[i]),
    schoolSpecies: schoolSpeciesFor(place.residents),
    school: preview ? i === 0 : hasSchool(place.residents),
  }));
  const swimmers = lineups.flatMap((lineup) => lineup.swimmers);
  const onIsland = swimmers.filter((s) => !s.leaving).length;
  const school = lineups.some((lineup) => lineup.school);
  // The models of everyone in the scene, and of whoever comes on at each island's next turn (loaded ahead of it).
  const upNext = preview ? [] : turns.flatMap((lineup, i) => {
    const turn = takeTurn(lineup, places[i].residents, i === 0 ? moments?.featured ?? NONE : NONE);
    return turn === lineup ? [] : [turn.shown[turn.shown.length - 1].model];
  });
  const shownModels = (preview ? visitors : swimmers.filter((s) => !s.leaving)).map((s) => s.model);
  const requested = loading ? [] : [...shownModels, ...upNext];
  const loaded = useMarineModels(requested), { failed, retry } = loaded;
  // (the turns, above, need to know which are loaded)
  if (loaded.models !== models) setModels(loaded.models);
  // The ocean is built once its seabed, built ahead of time, is loaded (at launch, for the island Home shows), or at once when there is none to wait for.
  const geometry = JSON.stringify(places.map(({ x, z, habitat: shores }) => ({ x, z, habitat: shores })));
  const oceanIslands = useMemo(() => JSON.parse(geometry) as { x: number; z: number; habitat: Habitat }[], [geometry]);
  // Home's card (`home`: its own island, which the card opens on and which is kept for the next launch; not another chosen
  // from the pills) opens on its last picture until the live scene has drawn itself with its animals (instant-picture.tsx).
  // While the collection is still being read the level isn't known: nothing is built until it is (an ocean built at the first
  // level would be built again at the level read, and a phone takes seconds over each), and the kept picture, where there is one, covers the wait.
  const card = !explorer && !preview, home = card && habitat === HOME_SHORE;
  const seabedReady = useSeabedReady(level, oceanIslands, explorer?.reach, !loading);
  const everyoneIn = shownModels.every((model) => !!models?.[model]);
  // The scene is built in steps (stager.ts, staging.tsx): the ocean with the first frame, then the islands in view, one coast (in slices), one
  // swimming start and one animal at a time, then one set of props, then the rest. `staged` says when all in view is built.
  const marks = explorer ? EXPLORER_MARKS : HOME_MARKS;
  const [stager] = useState(() => createStager({ focus: explorer?.near, trace: markStep }));
  useEffect(() => { stager.setFocus(explorer?.near); }, [stager, explorer?.near]);
  const staged = useSyncExternalStore(stager.subscribe, stager.getState, stager.getState);
  useEffect(() => { if (staged.done) markOnce(marks.built); }, [staged.done, marks]);
  // For the performance report (src/lib/perf-report.ts): an island switch on Home's card is timed from the switch to the scene built with all its animals.
  const episode: EpisodeKind = explorer ? 'explorer' : 'switch';
  const switched = useRef(habitat);
  // (and the canvas keeps the island it leaves until the new one is whole: HoldDrawing)
  const [seenHabitat, setSeenHabitat] = useState(habitat);
  const [holding, setHolding] = useState<string | null>(null);
  // The explorer's first open with no picture kept of its view: a veil of the sea's colour over the islands in view until they are whole (their
  // places in the water were empty, the paper showing through, for a second or two while their coasts built), then it fades.
  const [veil, setVeil] = useState<'on' | 'fading' | 'off'>(() => (explorer ? 'on' : 'off'));
  const [veilOpacity] = useState(() => new Animated.Value(1));
  if (seenHabitat !== habitat) {
    setSeenHabitat(habitat);
    setHolding(card && shownOnce ? habitat : null);
  }
  useEffect(() => {
    if (!card || switched.current === habitat) return;
    switched.current = habitat;
    perfReport.begin('switch', habitat);
  }, [card, habitat]);
  // The shader programs for what the scene may come to show are linked while the phone is idle (see Warm). Home's card: for every island the collection has, once its
  // first animal has been on show (as the explorer's ocean is made ahead, ocean-ahead.ts). The explorer: for every island once it is all built (measured: warming the
  // islands in view under the picture delayed the first animal by about 2 s on the web, its stand-ins not matching all the programs the scene then makes; EXPO_PUBLIC_EXPLORER_WARM=view does).
  const [firstAnimal, setFirstAnimal] = useState(false);
  useEffect(() => {
    if (!card || explorer) return;
    let live = true;
    void whenMarked(marks.animal).then(() => { if (live) setFirstAnimal(true); });
    return () => { live = false; };
  }, [card, explorer, marks]);
  const idle = useIdle(explorer ? staged.done : firstAnimal, explorer ? EXPLORER_WARM_AFTER_MS : IDLE_MS);
  const shores = [...new Set(explorer ? places.map((place) => place.habitat) : warm ?? [habitat])];
  // (EXPO_PUBLIC_EXPLORER_WARM=view: the explorer's shores in view as its canvas is ready, the island it opens on and those near it; see Warm below)
  const [inView, setInView] = useState<readonly Habitat[] | null>(null);
  if (explorer && seabedReady && visible && !inView && process.env.EXPO_PUBLIC_EXPLORER_WARM === 'view') {
    const { order, near } = explorer.near?.() ?? { order: places.map((place) => place.key), near: 1 };
    const keys = new Set(order.slice(0, Math.max(1, near)));
    setInView([...new Set(places.filter((place) => keys.has(place.key)).map((place) => place.habitat))]);
  }
  // The explorer's opening view, kept as a picture too (instant-picture.tsx) for the same view of the same islands.
  const viewKey = explorer && !preview ? explorer.pictureKey : undefined;
  const picture = useInstantPicture({
    // (the explorer's picture covers the wait for the collection too, as Home's: its key says which islands and level it is of, once they are known)
    enabled: home || (!!explorer && viewKey !== undefined), level, habitat, loading,
    armed: seabedReady && !loading && (failed || everyoneIn) && staged.settled,
    explorer: explorer ? { key: viewKey ?? null } : undefined,
  });
  // What arrives under a picture of the scene is simply there; what arrives while it is on show grows in.
  useEffect(() => { stager.show(!picture.unseen); }, [stager, picture.unseen]);
  // A picture of where the explorer opened is no picture of where it has moved to.
  const latest = useRef({ explorer, picture });
  useEffect(() => { latest.current = { explorer, picture }; });
  const watch = explorer?.watch;
  useEffect(() => {
    if (!watch) return;
    return watch(() => {
      const { explorer: current, picture: showing } = latest.current;
      if (current?.opening && !current.opening()) showing.dismiss();
    });
  }, [watch]);
  // What Home shows is kept for the next launch: its island, level and animals' models (home-start.ts)...
  const requestedKey = [...new Set(requested)].sort().join(',');
  useEffect(() => {
    if (home && !loading) rememberHomeScene(level, habitat, requestedKey ? requestedKey.split(',') as MarineModel[] : []);
  }, [home, loading, level, habitat, requestedKey]);
  // Once it is on show, what it may need next loads ahead: the island's seabed at the next level, and in the explorer.
  useEffect(() => {
    if (card && picture.live && !loading) void preloadSeabedBakes(level, [habitat], EXPLORER_REACH);
  }, [card, picture.live, loading, level, habitat]);
  // ...and a picture of it, a few seconds after it is on show (once for each island and level while the card is up). The picture leaves out what
  // moves (stillOnly), so it waits for the island to be whole, not for every animal: it used to wait for three seconds in which no animal's model
  // was loading, which a collection with discoveries still arriving one after another seldom had (the picture was then not replaced, in about
  // half of the measured visits; with nothing arriving, every time).
  const pictured = useRef(new Set<string>());
  // (the canvas's size, for the picture's)
  const size = useRef({ width: 0, height: 0 });
  const scene = `${level}|${habitat}`;
  useEffect(() => {
    if (!home || !picture.live || loading || !active || pictured.current.has(scene)) return;
    let timer: ReturnType<typeof setTimeout>;
    const take = () => {
      const { width, height } = size.current;
      if (width < 1 || height < 1) return;
      // (its coast and what grows on it still building: look again in a second)
      if (stager.pending(habitat, [STAGE.coast, STAGE.props])) { timer = setTimeout(take, 1000); return; }
      pictured.current.add(scene);
      void captureScene('home', { width: Math.round(width * 2), height: Math.round(height * 2), stillOnly: true }).then(async (uri) => {
        if (!uri) return;
        try { await rememberHomePicture(uri, level, habitat); } finally { releaseSnapshot(uri); }
      });
    };
    timer = setTimeout(take, PICTURE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [home, picture.live, loading, active, scene, level, habitat, stager]);
  // The explorer's, of its opening view, once all in view is built and the view is where it opened: unless one was shown and was good.
  const [pictureLoaded, setPictureLoaded] = useState(false);
  useEffect(() => {
    if (!viewKey || !picture.live || !everyoneIn || loading || !active || !staged.settled || pictureLoaded || pictured.current.has(viewKey)) return;
    const opening = () => latest.current.explorer?.opening?.() ?? true;
    if (!opening()) return;
    const timer = setTimeout(() => {
      const { width, height } = size.current;
      if (width < 1 || height < 1 || !opening()) return;
      pictured.current.add(viewKey);
      // (nobody waits for it, as Share does for Home's: the whole screen's size of the whole archipelago's water may take a slow GPU longer than that)
      void captureScene('explorer', { width: Math.round(width * 2), height: Math.round(height * 2), stillOnly: true }, EXPLORER_CAPTURE_TIMEOUT_MS).then(async (uri) => {
        if (!uri) return;
        try { await rememberExplorerPicture(uri, viewKey); markOnce('scubago:explorer-picture'); } finally { releaseSnapshot(uri); }
      });
    }, EXPLORER_PICTURE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [viewKey, picture.live, everyoneIn, loading, active, staged.settled, pictureLoaded]);

  // The "New" tag: the canvas reports its animal's place on screen every frame.
  const [tag] = useState(() => ({ x: new Animated.Value(-1000), y: new Animated.Value(-1000), inView: new Animated.Value(0) }));
  const layout = useRef({ width: 0, height: 0, tag: 120, seen: 0 });
  const anchor = useCallback((x: number, y: number, inView: boolean) => {
    const l = layout.current;
    l.seen += ((inView ? 1 : 0) - l.seen) * .15;
    tag.x.setValue(clamp(x - l.tag / 2, TAG.margin, Math.max(TAG.margin, l.width - l.tag - TAG.margin)));
    tag.y.setValue(clamp(y - TAG.above, TAG.margin, Math.max(TAG.margin, l.height - TAG.height - TAG.margin)));
    tag.inView.setValue(l.seen);
  }, [tag]);
  // The tag and the note keep their last words while they fade out.
  const [label, setLabel] = useState('');
  if (moments?.tag && moments.tag.label !== label) setLabel(moments.tag.label);
  const [note, setNote] = useState('');
  if (moments?.note && moments.note !== note) setNote(moments.note);
  // Without the 3D scene there is nothing to swim in: an arrival is done at once.
  const now = moments?.now ?? null, onArrived = moments?.onArrived;
  useEffect(() => {
    if (now && (failed || preview)) onArrived?.(now);
  }, [now, failed, preview, onArrived]);
  const arrivals: Arrivals | undefined = moments && !preview ? {
    waiting: moments.waiting, now: moments.now, onArrived: moments.onArrived, instant: !active, visible,
    tag: moments.tag ? { speciesId: moments.tag.speciesId, anchor } : null,
  } : undefined;

  // Built, with everyone the scene asked for: the end of an open or a switch, and on Home's own island the "all its animals" milestone.
  const complete = !loading && seabedReady && staged.done && (failed || everyoneIn);
  const completeNow = useRef(complete);
  useEffect(() => { completeNow.current = complete; });
  useEffect(() => { if (home && complete && visible) perfMark('home-animals'); }, [home, complete, visible]);
  // The "New" tag goes with its animal: only over the island the animal lives on (an island switched to on Home is another), and not over
  // the picture that stands in for the scene at launch (it has no animals) or the frame held during a switch.
  const tagged = moments?.tag?.speciesId;
  const tagShown = !!tagged && !preview && !picture.unseen && holding === null && places[0].residents.some((r) => r.species.id === tagged);
  // (a picture kept of the view covers the build itself: no veil then, and none once the explorer has been built)
  if (veil === 'on' && (picture.picture || staged.done)) setVeil('off');
  useEffect(() => {
    if (veil !== 'fading') return;
    const fade = Animated.timing(veilOpacity, { toValue: 0, duration: active ? VEIL_FADE_MS : 0, useNativeDriver: Platform.OS !== 'web' });
    fade.start(({ finished }) => { if (finished) setVeil('off'); });
    return () => fade.stop();
  }, [veil, picture.picture, staged.done, veilOpacity, active]);
  const fallback = <IslandScene habitat={habitat} level={level} residents={residents} paused={paused} />;
  const frame = explorer ? styles.fill : styles.scene;
  if (failed) return <View style={frame}><SceneUnavailable onRetry={retry}>{fallback}</SceneUnavailable></View>;
  const onLayout = (event: { nativeEvent: { layout: { width: number; height: number } } }) => {
    layout.current.width = event.nativeEvent.layout.width;
    layout.current.height = event.nativeEvent.layout.height;
    size.current = { width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height };
  };

  const tuna = school ? ', and a school of tuna' : '';
  // The reef's small life lives only in the explorer, too small for the card: at each island, its own.
  const macroAt = (place: ScenePlace, i: number) => (!explorer ? [] : preview ? (i === 0 ? SHOWCASE_MACRO : []) : macroResidents(place.residents));
  const macro = places.flatMap(macroAt);
  const small = macro.length === 0 ? '' : macro.length === 1 ? ', and a small creature on the reef to find up close' : `, and ${macro.length} small creatures on the reef to find up close`;
  const explore = explorer ? `${small}. Pinch or use the zoom buttons to look closer, and drag to look around${places.length > 1 ? ' and sail between the islands' : ''}` : '';
  const everyone = places.reduce((sum, place) => sum + place.residents.length, 0);
  const where = places.length > 1 ? `${places.length} islands at level ${level}` : `Level ${level} ${habitat}`;
  const description = (loading ? 'Your island; loading your discoveries' : preview
    ? `${where} with ${SHOWCASE_SWIMMERS.length} visiting species (showcase)${tuna}`
    : everyone === 0
      ? `${where}, its ocean still empty`
      : `${where}, home to ${everyone} discovered species, ${onIsland} swimming${tuna}`) + explore;
  // Each island's animals (and small life, in the explorer) live at its place in the ocean.
  const sceneIslands: SceneIsland[] = lineups.map(({ place, swimmers: here, schoolSpecies, school: schooling }, i) => ({
    key: place.key, habitat: place.habitat, x: place.x, z: place.z,
    content: <>
      {!loading && <MarineSwimmers models={models ?? NO_MODELS} active={active} unseen={picture.unseen} level={level} tapScale={explorer?.tapScale} shape={shapeFor(place.habitat)}
        world={places.length > 1 ? { islands: places.map(({ x, z, habitat: shores }) => ({ x, z, habitat: shores })), index: i, reach: explorer?.reach } : undefined}
        residents={preview
          ? (i === 0 ? visitors.map((s) => ({ ...s, id: s.model, onPress: () => onInspect(s.model) })) : [])
          : here.map((s) => ({ ...s, id: s.species.id, onPress: () => router.push(`/species/${s.species.id}`) }))}
        onSchoolPress={() => router.push(`/species/${schoolSpecies}`)} school={schooling} schoolSpecies={SCHOOLED} arrivals={i === 0 ? arrivals : undefined} />}
    </>,
    // The reef's small life comes last (staging.tsx).
    small: explorer && !loading && macroAt(place, i).length > 0
      ? <MacroLife level={level} species={macroAt(place, i)} shape={shapeFor(place.habitat)} zoom={explorer.zoom} tapScale={explorer.tapScale} active={active}
        onPress={(id) => router.push(`/species/${id}`)} onFocus={(x, z, zoom) => explorer.focus(place.x + x, place.z + z, zoom)} />
      : undefined,
  }));

  // The 3D view is one labelled image for screen readers. The label sits inside the error boundary,
  // so if the scene fails, its fallback and "Try again" button can still be reached.
  return <View style={frame} onLayout={onLayout}>
    <SceneBoundary fallback={fallback}>
      <View style={styles.canvas} accessible accessibilityRole="image" accessibilityLabel={description}>
      <Canvas orthographic flat {...(Platform.OS === 'web' ? { dpr: 1.25 } : {})} frameloop={asleep ? 'never' : active && !loading ? 'always' : 'demand'} camera={SCENE_CAMERA}
        gl={{ antialias: Platform.OS === 'web' }}
        onCreated={({ camera }) => camera.lookAt(0, -.15, 0)} style={styles.canvas}>
        <StagingProvider stager={stager} hidden={!visible}><SceneMarksContext.Provider value={marks}>
        {/* The view pulls back as the island levels up and its ocean widens. */}
        {!explorer && <SceneCamera scale={oceanScale(level)} />}
        {onOpen && !explorer && <TapAnywhere onTap={onOpen} />}
        {/* The Share button's picture of the card (and the explorer's of its opening view). A paused island can still be photographed; one that is still for Reduce Motion is not. */}
        <SnapshotRegistrar name={explorer ? 'explorer' : 'home'} ready={visible && !loading && (active || paused || oceanPaused)} />
        <Wake visible={visible} />
        {veil === 'on' && explorer && seabedReady && !loading && <IslandsWhole stager={stager} onWhole={() => setVeil('fading')} inView={() => {
          const { order, near } = explorer.near?.() ?? { order: places.map((place) => place.key), near: places.length };
          return order.slice(0, Math.max(1, near));
        }} />}
        {holding === habitat && <HoldDrawing stager={stager} island={habitat} onDone={() => setHolding(null)} />}
        <FirstFrame mark={marks.frame} episode={episode} complete={() => completeNow.current && stager.getState().done} />
        <FrameReport name={explorer ? 'explorer' : 'home'} />
        <GovernorHold hold={!visible || !active || loading || !staged.done || picture.unseen} />
        <FrameWatch watching={picture.watching} onDrawn={picture.onDrawn} />
        {__DEV__ && <ScenePerformance ready={!!models && !loading} active={active} />}
        {ISLAND_PERF && <IslandPerfProbe />}
        {/* The animals swim inside their island's water, which tints and refracts them. */}
        <SanctuaryEnvironment habitat={habitat} level={level} active={active} growIn={active && !loading} reach={explorer?.reach} islands={sceneIslands} ready={seabedReady}>
          {explorer?.camera}
        </SanctuaryEnvironment>
        {/* After the environment, so its lights are in the scene. The explorer is a GL context of its own, so it links its programs afresh at every open, all of them once it
            is built and idle (so that sailing to an island first seen links none), or, with EXPO_PUBLIC_EXPLORER_WARM=view, those of the islands in view as soon as its canvas
            is ready, under the picture, and the rest then. Its ocean blends the waters of all its islands. Home's keeps its programs across islands, so one warm-up for
            every island is enough, with its one water. */}
        {seabedReady && visible && explorer && (idle || inView) && <Warm paced paused={explorer.busy} key={idle ? `all:${shores.join()}` : 'view'} habitats={idle ? shores : inView ?? shores} waters={habitatsOf(oceanIslands).length} school={school} />}
        {seabedReady && visible && card && idle && <Warm key={shores.join()} habitats={shores} waters={1} school={school} />}
        </SceneMarksContext.Provider></StagingProvider>
      </Canvas>
      </View>
    </SceneBoundary>
    {veil !== 'off' && !picture.picture && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: WATER[habitat], opacity: veilOpacity }]} />}
    {picture.picture && <InstantPicture uri={picture.picture} opacity={picture.opacity} onError={picture.onError} onLoad={() => { setPictureLoaded(true); perfReport.step(episode, 'picture'); }} />}
    {!!label && <NewTag label={label} x={tag.x} y={tag.y} inView={tag.inView} visible={tagShown}
      onWidth={(width) => { layout.current.tag = width; }} />}
    {moments?.banner && <LevelUpBanner {...moments.banner} still={!active} />}
    {!!note && <DiscoveryNote text={note} visible={!!moments?.note} still={!active} />}
    {ISLAND_PERF && <IslandPerfBadge />}
  </View>;
}

const styles = StyleSheet.create({
  scene: { width: '100%', aspectRatio: 420 / 390 },
  fill: { flex: 1 },
  canvas: { flex: 1 },
});
