import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet } from 'react-native';
import { useFrame, useThree } from '@react-three/fiber';
import type { Habitat } from '@/lib/home';
import { pictureFor, useHomeScene } from './home-start';
import { markOnce } from './three/scene-marks';

/** How long the picture fades into the live scene (ms; at once with Reduce Motion). */
const FADE_MS = 450;
/** However things go, the live scene shows after this long (ms): the picture never stays up for good. */
const LONGEST_MS = 4000;

/** Whether Reduce Motion is on (false until the setting has been read). */
function useReduceMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (live) setReduced(value); }, () => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { live = false; subscription?.remove(); };
  }, []);
  return reduced;
}

/**
 * Home's card at launch (home-start.ts): the last picture of this island at this level (while the collection is still
 * `loading`, at the level it was kept at), kept on the device, over the live scene until the scene has drawn itself
 * with its animals (`armed`: its seabed and its animals' models are in),
 * then cross-faded away. No picture (a first launch, another island or level, or the explorer: `enabled` false): the
 * live scene at once. While the picture covers the scene (`unseen`), an animal joining it is simply there; after, it
 * swims in.
 */
export function useInstantPicture({ enabled, level, habitat, loading, armed }: { enabled: boolean; level: number; habitat: Habitat; loading: boolean; armed: boolean }) {
  const scene = useHomeScene();
  const reduced = useReduceMotion();
  // While the collection is still being read the level isn't known yet: the kept picture's is the best guess.
  const find = () => (scene ? pictureFor(scene, loading ? scene.picture?.level ?? level : level, habitat) : null);
  // The picture this card opened with (decided once: it is never shown again once the live scene is).
  const [phase, setPhase] = useState<'deciding' | 'picture' | 'fading' | 'live'>(() => (!enabled ? 'live' : scene === undefined ? 'deciding' : find() ? 'picture' : 'live'));
  const [shown, setShown] = useState(() => (enabled ? find() : null));
  const [opacity] = useState(() => new Animated.Value(1));
  if (phase === 'deciding' && scene !== undefined) {
    const found = find();
    setPhase(found ? 'picture' : 'live');
    if (found) setShown(found);
  }
  // Drawn with its animals (FrameWatch), or taking too long: fade to the live scene.
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    if (phase !== 'picture' && phase !== 'deciding') return;
    const timer = setTimeout(() => setDrawn(true), LONGEST_MS);
    return () => clearTimeout(timer);
  }, [phase]);
  if (drawn && phase === 'picture') setPhase('fading');
  if (drawn && phase === 'deciding') setPhase('live');
  useEffect(() => {
    if (phase !== 'fading') return;
    const fade = Animated.timing(opacity, { toValue: 0, duration: reduced ? 0 : FADE_MS, useNativeDriver: true });
    fade.start(({ finished }) => { if (finished) setPhase('live'); });
    return () => fade.stop();
  }, [phase, opacity, reduced]);
  // A picture that can't be shown (gone from the device) is no picture.
  const onError = () => { if (phase === 'picture' || phase === 'deciding') { setShown(null); setPhase('live'); } };
  return {
    /** The picture to lay over the scene, or null. */
    picture: phase === 'live' || !shown ? null : shown,
    opacity, onError,
    /** The scene is still behind the picture (or about to be). */
    unseen: phase === 'deciding' || phase === 'picture',
    /** Watch for the scene's first frame with its animals (in the canvas: FrameWatch). */
    watching: armed && (phase === 'picture' || phase === 'deciding'),
    onDrawn: () => setDrawn(true),
    /** The live scene is on show (the picture gone, or fading). */
    live: phase === 'live' || phase === 'fading',
  };
}

/**
 * In the canvas: once `watching`, calls `onDrawn` after the scene has drawn two frames (its animals in the first are on
 * screen by the second), asking for them if the scene only draws on demand (still, or paused).
 */
export function FrameWatch({ watching, onDrawn }: { watching: boolean; onDrawn: () => void }) {
  const invalidate = useThree((state) => state.invalidate);
  const frames = useRef(0);
  const latest = useRef(onDrawn);
  useEffect(() => { latest.current = onDrawn; });
  useEffect(() => {
    frames.current = 0;
    if (watching) invalidate();
  }, [watching, invalidate]);
  useFrame(() => {
    if (!watching || frames.current >= 2) return;
    frames.current += 1;
    if (frames.current === 2) latest.current();
    else invalidate();
  });
  return null;
}

/** The picture over the card's scene: no taps, nothing to say to a screen reader (the scene says it). */
export function InstantPicture({ uri, opacity, onError }: { uri: string; opacity: Animated.Value; onError: () => void }) {
  return <Animated.Image source={{ uri }} onError={onError} onLoad={() => markOnce('scubago:picture')} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    pointerEvents="none" resizeMode="stretch" style={[StyleSheet.absoluteFill, { opacity }]} />;
}
