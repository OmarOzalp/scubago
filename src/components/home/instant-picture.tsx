import { useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet } from 'react-native';
import { useFrame, useThree } from '@react-three/fiber';
import type { Habitat } from '@/lib/home';
import { explorerPictureFor, pictureFor, useHomeScene } from './home-start';
import { markOnce } from './three/scene-marks';
import { StagerContext } from './three/staging';

/** How long the picture fades into the live scene (ms; at once with Reduce Motion). */
const FADE_MS = 450;
/** However things go, the live scene shows after this long (ms): the picture never stays up for good. */
const LONGEST_MS = 4000;
/** The explorer's, which covers the building of every island in view (seconds on a phone, the first time): it stays up until they are all in. */
const EXPLORER_LONGEST_MS = 12000;

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
 *
 * The island explorer does the same with the picture of its opening view (`explorer`: the key of the view it opens on, explorerViewKey,
 * null until the screen's size is known): shown at once, over the scene being built, and let go the moment the view is moved
 * (`dismiss`: a picture of where it opened is no picture of where it is).
 */
export function useInstantPicture({ enabled, level, habitat, loading, armed, explorer }: {
  enabled: boolean; level: number; habitat: Habitat; loading: boolean; armed: boolean; explorer?: { key: string | null };
}) {
  const scene = useHomeScene();
  const reduced = useReduceMotion();
  // While the collection is still being read the level isn't known yet: the kept picture's is the best guess. The explorer's view
  // is known once the screen has been measured.
  const find = () => (!scene ? null : explorer ? (explorer.key ? explorerPictureFor(scene, explorer.key) : null)
    : pictureFor(scene, loading ? scene.picture?.level ?? level : level, habitat));
  const unknown = scene === undefined || (!!explorer && explorer.key === null);
  // The picture this card opened with (decided once: it is never shown again once the live scene is).
  const [phase, setPhase] = useState<'deciding' | 'picture' | 'fading' | 'live'>(() => (!enabled ? 'live' : unknown ? 'deciding' : find() ? 'picture' : 'live'));
  const [shown, setShown] = useState(() => (enabled ? find() : null));
  const [opacity] = useState(() => new Animated.Value(1));
  if (phase === 'deciding' && !unknown) {
    const found = find();
    setPhase(found ? 'picture' : 'live');
    if (found) setShown(found);
  }
  // Drawn with its animals (FrameWatch), or taking too long: fade to the live scene.
  const [drawn, setDrawn] = useState(false);
  const longest = explorer ? EXPLORER_LONGEST_MS : LONGEST_MS;
  useEffect(() => {
    if (phase !== 'picture' && phase !== 'deciding') return;
    const timer = setTimeout(() => setDrawn(true), longest);
    return () => clearTimeout(timer);
  }, [phase, longest]);
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
    /** The picture is no longer of what the scene shows (the explorer's view moved): let it go now. */
    dismiss: () => setDrawn(true),
    /** The live scene is on show (the picture gone, or fading). */
    live: phase === 'live' || phase === 'fading',
  };
}

/**
 * In the canvas: once `watching`, calls `onDrawn` after the scene has drawn two frames (its animals in the first are on
 * screen by the second), asking for them if the scene only draws on demand (still, or paused). Frames drawn while the scene's stager is
 * not settled (something in view still to build) are not counted, whatever `watching` last said.
 */
export function FrameWatch({ watching, onDrawn }: { watching: boolean; onDrawn: () => void }) {
  const invalidate = useThree((state) => state.invalidate);
  const stager = useContext(StagerContext);
  const frames = useRef(0);
  const latest = useRef(onDrawn);
  useEffect(() => { latest.current = onDrawn; });
  useEffect(() => {
    frames.current = 0;
    if (watching) invalidate();
  }, [watching, invalidate]);
  useFrame(() => {
    // (what is still to be built counts as it is now, not as the scene last said: the canvas's first frames come before its islands have said what
    // they have to build, and a scene that is not settled has not drawn what is in view)
    if (!watching || frames.current >= 2 || stager?.getState().settled === false) return;
    frames.current += 1;
    if (frames.current === 2) latest.current();
    else invalidate();
  });
  return null;
}

/** The picture over the card's scene: no taps, nothing to say to a screen reader (the scene says it). */
export function InstantPicture({ uri, opacity, onError, onLoad }: { uri: string; opacity: Animated.Value; onError: () => void; onLoad?: () => void }) {
  return <Animated.Image source={{ uri }} onError={onError} onLoad={() => { markOnce('scubago:picture'); onLoad?.(); }} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    pointerEvents="none" resizeMode="stretch" style={[StyleSheet.absoluteFill, { opacity }]} />;
}
