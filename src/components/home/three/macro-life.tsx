import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Box3, Group, Mesh, Vector3, type Material } from 'three';
import { MACRO, macroHomes, macroPresence, type MacroKind, type MacroSpecies } from '@/lib/macro-life';
import { buildMacro } from './macro-creatures';
import { OceanContext } from './ocean-context';
import { useSceneQuality } from './scene-quality';
import { MIN_TAP, TAP_SLOP } from './tap-target';
import { FLOOR_BIAS, prepareUnderwater } from './underwater-material';

/**
 * Which way each home faces (local +z, rad from the world's +z). Most face the camera, so that the
 * sea fan is seen flat on and the lobster and the mantis shrimp come out toward it; the clam lies
 * across the view.
 */
const YAW: Partial<Record<MacroKind, number>> = { clam: Math.PI / 2, dancer: .6, chromodoris: -.4 };
/** Above this much in view a tap opens a creature's page; below the lower figure, a tap on its home zooms in to find it (with a margin, so it doesn't flicker). */
const TAPPABLE = [.5, .35] as const;
/** How far in a tap on a home zooms (points per unit): the creature well in view. */
const FOCUS = MACRO.clear * 1.6;
/** The island camera's slant (from (0, 12, 6) to (0, -.15, 0)): a point this far below the water's middle plane shows this far farther down the screen. */
const SLANT = 6 / 12.15;

/**
 * The reef's small life in the island explorer (macro-life.ts, macro-creatures.ts): each logged
 * macro species in its home on the shelf. Homes always show; the creatures come into view as the
 * explorer zooms in close (`zoom`, read every frame). From farther out a tap on a home zooms in on
 * it (`onFocus`); once the creature is in view, a tap on it (or its home) opens its page. They take
 * on the water like the reef's rocks and anemones, and move only while the scene is `active` (not
 * with reduced motion, nor in the background).
 */
export function MacroLife({ level, species, zoom, tapScale, active, onPress, onFocus }: {
  level: number; species: readonly MacroSpecies[];
  /** The explorer's zoom now (screen points per world unit). */
  zoom: () => number;
  /** How much larger than MIN_TAP a tap target must be in the world to keep its size on screen (tapScaleAt). */
  tapScale: number;
  active: boolean; onPress: (species: MacroSpecies) => void;
  /** Look closely at a point on the water (the middle plane the explorer moves over), at least this zoomed in. */
  onFocus?: (x: number, z: number, zoom: number) => void;
}) {
  const ocean = useContext(OceanContext);
  const lite = useSceneQuality() === 'lite';
  // A new list with the same species (a re-render) keeps the creatures as they are.
  const key = species.join(',');
  const list = useMemo(() => key.split(',').filter(Boolean) as MacroSpecies[], [key]);
  const life = useMemo(() => {
    const creatures = macroHomes(level, list).map((home) => {
      const model = buildMacro(home.kind, lite), root = new Group();
      root.add(model.home, model.body);
      // Its tap target covers it and its home, measured before it is moved into place.
      const box = new Box3().setFromObject(root), middle = box.getCenter(new Vector3()), half = box.getSize(new Vector3()).multiplyScalar(.5);
      root.position.set(home.x, home.floor, home.z);
      root.rotation.y = YAW[home.kind] ?? 0;
      root.updateMatrixWorld(true);
      const originals: Mesh[] = [];
      root.traverse((o) => { if ((o as Mesh).isMesh) originals.push(o as Mesh); });
      const geometries = originals.map((m) => m.geometry);
      // Homes take on the water's color a little; the creatures, bright as they are, barely.
      const looks = [prepareUnderwater(model.home, ocean ?? undefined, lite, { bias: FLOOR_BIAS, seabed: .25 }), prepareUnderwater(model.body, ocean ?? undefined, lite, { bias: FLOOR_BIAS, seabed: .08 })];
      geometries.forEach((geometry) => geometry.dispose());
      const fading = new Set<Material>();
      model.body.traverse((o) => { if ((o as Mesh).isMesh) fading.add((o as Mesh).material as Material); });
      return { home, model, root, looks, fading: [...fading], middle, half };
    });
    return {
      creatures,
      /** Fade the creatures to `presence` and move everything to time t (s). */
      update(presence: number, t: number) {
        for (const c of creatures) {
          c.model.body.visible = presence > .01;
          for (const material of c.fading) material.opacity = presence;
          c.model.animate(t);
        }
      },
      dispose() { creatures.forEach((c) => c.looks.forEach((look) => look.dispose())); },
    };
  }, [level, list, ocean, lite]);
  useEffect(() => () => life.dispose(), [life]);

  const time = useRef(0);
  const [tappable, setTappable] = useState(false);
  useFrame((_, delta) => {
    const presence = macroPresence(zoom());
    if (active) time.current += Math.min(delta, .1);
    life.update(presence, time.current);
    if (tappable ? presence < TAPPABLE[1] : presence > TAPPABLE[0]) setTappable(!tappable);
  });

  const least = MIN_TAP * tapScale;
  return <>{life.creatures.map((c) => <group key={c.home.species}>
    <primitive object={c.root} />
    <group position={[c.home.x, c.home.floor, c.home.z]} rotation={[0, YAW[c.home.kind] ?? 0, 0]}>
      <mesh visible={false} position={c.middle} scale={[2 * Math.max(c.half.x, least), 2 * Math.max(c.half.y, least), 2 * Math.max(c.half.z, least)]}
        onClick={(event) => {
          if (event.delta > TAP_SLOP) return;
          event.stopPropagation();
          // Its home, seen in the middle of the screen (the explorer looks at the plane above it).
          if (tappable) onPress(c.home.species);
          else onFocus?.(c.home.x, c.home.z + SLANT * (-.15 - c.home.floor - c.middle.y), FOCUS);
        }}>
        <boxGeometry />
      </mesh>
    </group>
  </group>)}</>;
}
