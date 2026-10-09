import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  celebrateLevel,
  featuredSpecies,
  introduce,
  joinedAt,
  parseDiscoveryState,
  planMoments,
  reconcile,
  startDiscoveries,
  type DiscoveryState,
  type Moment,
} from '@/lib/discoveries';
import { HOME_STAGES } from '@/lib/home';
import { islandPresence } from '@/lib/swimming';
import type { DexEntry, Sighting } from '@/lib/types';

/** How long each part of a moment lasts (ms). */
export const MOMENT_TIMING = {
  /** After My Home comes into view, before the first moment (a closing sheet settles). */
  settle: 350,
  /** The level-up banner alone, before the island starts growing. */
  banner: 1800,
  /** The island growing into its new level (islets rising, the ocean widening), banner still up. */
  grow: 3800,
  /** The "New" tag stays on an animal this long after it has arrived. */
  tag: 5000,
  /** An arrival that never reports back (the 3D scene unavailable, say) moves on after this. */
  arrivalLimit: 45000,
  /** The note for species the island can't show. */
  note: 4200,
  /** Between moments. */
  gap: 700,
};

type Phase = 'banner' | 'grow' | 'arriving' | 'settling' | 'note' | 'gap';
type Visit = { steps: Moment[] | null; index: number; phase: Phase | null; arrived: string[] };

const firstPhase = (moment: Moment | undefined): Phase | null =>
  !moment ? null : moment.kind === 'level' ? 'banner' : moment.kind === 'arrive' ? 'arriving' : 'note';

/**
 * The discovery moments owed on My Home, played while it is on screen: a level-up banner and the
 * island growing into the new level, then each new species arriving with a "New" tag (see
 * src/lib/discoveries.ts for which are owed and why). Each is saved as done once it has played, so
 * closing the app part-way plays the rest next time, and reopening Home never replays one.
 * `animate` false (reduced motion, or the scene paused) shows them without movement.
 */
export function useDiscoveryMoments({ owner, ready, residents, sightings, level, animate }: {
  owner: string; ready: boolean; residents: DexEntry[]; sightings: Sighting[]; level: number; animate: boolean;
}) {
  const key = `scubago:discoveries:v1:${owner}`;
  const [record, setRecord] = useState<{ key: string; state: DiscoveryState | null; loaded: boolean }>({ key: '', state: null, loaded: false });
  const collection = useMemo(() => residents.map((r) => r.species.id), [residents]);
  const byId = useMemo(() => new Map(residents.map((r) => [r.species.id, r.species])), [residents]);

  const persist = useCallback((state: DiscoveryState) => {
    AsyncStorage.setItem(key, JSON.stringify(state)).catch((e) => console.warn('could not save discovery moments', e));
  }, [key]);
  const save = useCallback((state: DiscoveryState) => {
    setRecord({ key, state, loaded: true });
    persist(state);
  }, [key, persist]);

  // Load this diver's record at once (before the log itself is ready, so the island never shows a level
  // whose level-up is still owed); a diver seen for the first time here starts with what they have now.
  const [missing, setMissing] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(key).then((raw) => {
      if (cancelled) return;
      const stored = parseDiscoveryState(raw);
      if (stored) setRecord({ key, state: stored, loaded: true });
      else setMissing(key);
    }).catch(() => {
      if (!cancelled) setRecord({ key, state: null, loaded: true });
    });
    return () => { cancelled = true; };
  }, [key]);
  const latestCollection = useRef({ collection, level });
  useEffect(() => { latestCollection.current = { collection, level }; });
  useEffect(() => {
    if (!ready || missing !== key) return;
    const timer = setTimeout(() => {
      setMissing(null);
      save(startDiscoveries(latestCollection.current.collection, latestCollection.current.level, new Date().toISOString()));
    }, 0);
    return () => clearTimeout(timer);
  }, [ready, missing, key, save]);

  const state = record.key === key ? record.state : null;
  const joined = useMemo(() => joinedAt(sightings), [sightings]);
  const owed = useMemo(() => (state ? reconcile(state, collection, joined) : null), [state, collection, joined]);
  // Keep the stored record in step with the collection (quiet introductions, forgotten species, a lower
  // level); what's owed is already worked out from it above.
  useEffect(() => {
    if (owed?.changed) persist(owed.state);
  }, [owed, persist]);
  const plan = useMemo(
    () => (owed ? planMoments(owed, (id) => { const species = byId.get(id); return species ? islandPresence(species) : null; }) : []),
    [owed, byId],
  );

  // A visit: from My Home coming into focus until it loses it. Moments play only during one.
  const [visit, setVisit] = useState<Visit | null>(null);
  useFocusEffect(useCallback(() => {
    setVisit({ steps: null, index: 0, phase: null, arrived: [] });
    return () => setVisit(null);
  }, []));
  const latest = useRef({ plan, owed });
  useEffect(() => { latest.current = { plan, owed }; });

  // Start (or, with new discoveries since, restart) the visit's moments once it is known what's owed.
  const finished = !!visit?.steps && visit.index >= visit.steps.length;
  useEffect(() => {
    if (!visit || !owed || (visit.steps && !finished) || plan.length === 0) return;
    const timer = setTimeout(() => setVisit((v) => {
      if (!v || (v.steps && v.index < v.steps.length)) return v;
      const steps = latest.current.plan;
      return { ...v, steps, index: 0, phase: firstPhase(steps[0]) };
    }), MOMENT_TIMING.settle);
    return () => clearTimeout(timer);
  }, [visit, owed, plan, finished]);

  const step = visit?.steps?.[visit.index];
  const phase = visit?.phase ?? null;
  const next = useCallback(() => setVisit((v) => {
    if (!v?.steps) return v;
    const index = v.index + 1;
    return { ...v, index, phase: firstPhase(v.steps[index]) };
  }), []);

  // Play the current step: each phase ends on a timer (or, arriving, when the scene reports back).
  useEffect(() => {
    if (!step || !phase) return;
    const after = (ms: number, then: () => void) => {
      const timer = setTimeout(then, ms);
      return () => clearTimeout(timer);
    };
    const record = (update: (s: DiscoveryState) => DiscoveryState) => {
      const current = latest.current.owed?.state;
      if (current) save(update(current));
    };
    if (step.kind === 'level') {
      if (phase === 'banner') return after(animate ? MOMENT_TIMING.banner : MOMENT_TIMING.banner * .7, () => setVisit((v) => v && { ...v, phase: 'grow' }));
      if (phase === 'grow') return after(animate ? MOMENT_TIMING.grow : MOMENT_TIMING.banner, () => {
        record((s) => celebrateLevel(s, step.to));
        setVisit((v) => v && { ...v, phase: 'gap' });
      });
    } else if (step.kind === 'arrive') {
      if (phase === 'arriving') return after(MOMENT_TIMING.arrivalLimit, () => setVisit((v) => v && { ...v, phase: 'settling' }));
      if (phase === 'settling') return after(MOMENT_TIMING.tag, () => {
        record((s) => introduce(s, step.speciesIds));
        setVisit((v) => v && { ...v, phase: 'gap', arrived: [...v.arrived, ...step.speciesIds] });
      });
    } else if (phase === 'note') {
      return after(MOMENT_TIMING.note, () => {
        record((s) => introduce(s, step.speciesIds));
        setVisit((v) => v && { ...v, phase: 'gap' });
      });
    }
    if (phase === 'gap') return after(MOMENT_TIMING.gap, next);
  }, [step, phase, animate, save, next]);

  const arriving = step?.kind === 'arrive' && (phase === 'arriving' || phase === 'settling') ? step : null;
  const onArrived = useCallback((speciesId: string) => setVisit((v) => {
    const current = v?.steps?.[v.index];
    return v && current?.kind === 'arrive' && current.speciesIds[0] === speciesId && v.phase === 'arriving' ? { ...v, phase: 'settling' } : v;
  }), []);

  // The level the island shows: the one last celebrated until the level-up plays, then the new one.
  const growing = step?.kind === 'level' && phase !== 'banner';
  const shownLevel = owed?.levelUp && !growing ? owed.levelUp.from : level;
  const levelStep = visit?.steps?.find((m): m is Extract<Moment, { kind: 'level' }> => m.kind === 'level');
  const bannerUp = step?.kind === 'level' && (phase === 'banner' || phase === 'grow');
  const noteStep = step?.kind === 'note' && phase === 'note' ? step : null;
  const noteNames = noteStep?.speciesIds.map((id) => byId.get(id)?.commonName ?? id) ?? [];
  const featured = useMemo(() => [...new Set([...featuredSpecies(plan), ...(visit?.arrived ?? [])])], [plan, visit?.arrived]);
  const waiting = useMemo(() => plan.flatMap((m) => (m.kind === 'arrive' ? m.speciesIds : [])), [plan]);
  const tagSpecies = arriving ? byId.get(arriving.speciesIds[0]) : undefined;

  return {
    /** Still reading this diver's record: hold the island's animals until it's known who arrives. */
    loading: record.key !== key || !record.loaded,
    /** The level the island shows (held at the last celebrated one until its level-up plays). */
    level: shownLevel,
    /** A level-up banner, while one plays (and briefly after, to fade). */
    banner: levelStep ? { level: levelStep.to, reward: HOME_STAGES[levelStep.to - 1]?.reward ?? '', visible: bannerUp } : null,
    /** New species with a featured place on the island this visit (see pickSwimmers). */
    featured,
    /** Species waiting out of sight until their turn to arrive. */
    waiting,
    /** The species arriving now, and the "New" tag over it. */
    now: arriving?.speciesIds[0] ?? null,
    tag: tagSpecies ? { speciesId: tagSpecies.id, label: arriving!.speciesIds.length > 1 ? `${tagSpecies.commonName} and more` : tagSpecies.commonName } : null,
    onArrived,
    /** A note about new species the island can't show. */
    note: noteNames.length ? `New in your collection: ${listNames(noteNames)}` : null,
    /** Moments are playing: hold the island's paging still. */
    busy: !!visit?.steps && visit.index < visit.steps.length,
  };
}

function listNames(names: string[]) {
  if (names.length <= 2) return names.join(' and ');
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}
