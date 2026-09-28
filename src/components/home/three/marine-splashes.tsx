import { useContext, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferGeometry, Color, DynamicDrawUsage, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial,
  OctahedronGeometry, ShaderMaterial,
} from 'three';
import type { MarineMotion } from '@/lib/marine-motion';
import { OCEAN, waveTerms } from '@/lib/ocean';
import { OceanContext } from './ocean-context';

/**
 * Splashes where a leaping dolphin breaks the surface (the motion records them; see breach.ts).
 * Each is a ring of foam spreading on the water and thinning away, and in full quality a few
 * droplets thrown up and out; all are gone in about a second. Pooled: one ring mesh and one
 * droplet mesh for every splash at once, nothing allocated per frame, and not drawn at all while
 * the water is calm.
 */
export const SPLASH = {
  /** How long a splash lasts (s). */
  life: 1.1,
  /** How far its ring spreads at full strength (units), and how wide the ring starts (fraction of that). */
  radius: .62, width: .4,
  /** Droplets per splash (full quality), how high they are thrown (units/s up at full strength) and gravity (units/s²). */
  droplets: 7, lift: 1.7, gravity: 6.5,
};

const RING_SEGMENTS = 28;
const TERMS = waveTerms();

/** Height of the moving surface at (x, z): the water shader's waves, without allocating. */
function surfaceAt(x: number, z: number, time: number) {
  let y = OCEAN.surfaceLevel;
  for (const w of TERMS) y += w.amplitude * Math.sin(w.k * (w.dx * x + w.dz * z) - w.omega * time + w.phase);
  return y;
}

const RING_VERTEX = /* glsl */ `
attribute float aEdge;
attribute vec2 aSplash;
varying float vFade;
void main() {
  // aSplash: age (0..1) and strength. The ring races out, then slows, and thins as it goes.
  float age = aSplash.x, spread = 1.0 - pow(1.0 - age, 2.4);
  float outer = mix(.16, 1.0, spread), inner = outer * (1.0 - ${SPLASH.width.toFixed(2)} * (1.0 - age) * (1.0 - age) - .04);
  float r = mix(inner, outer, aEdge);
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position.x * r, 0.0, position.z * r, 1.0);
  vFade = (1.0 - age) * (1.0 - age) * mix(.7, 1.0, aSplash.y);
}`;
const RING_FRAGMENT = /* glsl */ `
uniform vec3 uFoam;
varying float vFade;
void main() {
  gl_FragColor = vec4(uFoam, .9 * vFade);
  #include <colorspace_fragment>
}`;

function ringGeometry() {
  const positions: number[] = [], edges: number[] = [], index: number[] = [];
  for (let i = 0; i < RING_SEGMENTS; i++) {
    const t = i / RING_SEGMENTS * Math.PI * 2, x = Math.cos(t), z = Math.sin(t);
    positions.push(x, 0, z, x, 0, z);
    edges.push(0, 1);
    const a = i * 2, b = ((i + 1) % RING_SEGMENTS) * 2;
    index.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aEdge', new Float32BufferAttribute(edges, 1));
  geometry.setIndex(index);
  return geometry;
}

export function MarineSplashes({ motion, lite = false }: { motion: MarineMotion; lite?: boolean }) {
  const ocean = useContext(OceanContext);
  const view = useMemo(() => {
    const pool = motion.splashes.length, foam = new Color(OCEAN.palettes.island.foam);
    const rings = new InstancedMesh(ringGeometry(), new ShaderMaterial({
      vertexShader: RING_VERTEX, fragmentShader: RING_FRAGMENT, uniforms: { uFoam: { value: foam } }, transparent: true, depthWrite: false,
    }), pool);
    const state = new InstancedBufferAttribute(new Float32Array(pool * 2), 2).setUsage(DynamicDrawUsage);
    rings.geometry.setAttribute('aSplash', state);
    rings.instanceMatrix.setUsage(DynamicDrawUsage);
    const drops = lite ? null : new InstancedMesh(new OctahedronGeometry(1, 0), new MeshBasicMaterial({ color: foam }), pool * SPLASH.droplets);
    drops?.instanceMatrix.setUsage(DynamicDrawUsage);
    // Drawn after the water surface, so the foam lies on top of it; nothing is drawn while there are no splashes.
    for (const mesh of [rings, drops]) if (mesh) { mesh.renderOrder = 3; mesh.frustumCulled = false; mesh.count = 0; }
    const matrix = new Matrix4();
    return {
      rings, drops,
      /** Lay out every splash still under way, at the water's moving surface. */
      update() {
        const now = motion.clock(), time = ocean?.uOceanTime.value ?? now;
        let ring = 0, drop = 0;
        for (let i = 0; i < pool; i++) {
          const splash = motion.splashes[i], age = (now - splash.time) / SPLASH.life;
          if (!(age >= 0 && age < 1)) continue;
          const y = surfaceAt(splash.x, splash.z, time) + .004, size = SPLASH.radius * (.65 + .35 * splash.strength);
          matrix.makeScale(size, 1, size).setPosition(splash.x, y, splash.z);
          rings.setMatrixAt(ring, matrix);
          state.setXY(ring, age, splash.strength);
          ring++;
          if (!drops) continue;
          // Droplets fly up and out on their own arcs and shrink away; none are drawn once back in the water.
          const t = age * SPLASH.life;
          for (let k = 0; k < SPLASH.droplets; k++) {
            const angle = (k + .37 * i) / SPLASH.droplets * Math.PI * 2, reach = (.35 + .3 * ((k * 7 + i * 3) % 5) / 4) * splash.strength;
            const height = SPLASH.lift * splash.strength * (.7 + .3 * ((k * 3 + i) % 4) / 3) * t - SPLASH.gravity * t * t / 2;
            if (height < 0 && t > .05) continue;
            const scale = .035 * (.8 + .4 * splash.strength) * (1 - .6 * age);
            matrix.makeScale(scale, scale, scale).setPosition(splash.x + Math.cos(angle) * reach * t * 1.6, y + Math.max(0, height), splash.z + Math.sin(angle) * reach * t * 1.6);
            drops.setMatrixAt(drop++, matrix);
          }
        }
        rings.count = ring;
        if (ring) { rings.instanceMatrix.needsUpdate = true; state.needsUpdate = true; }
        if (drops) { drops.count = drop; if (drop) drops.instanceMatrix.needsUpdate = true; }
      },
      dispose() {
        for (const mesh of [rings, drops]) if (mesh) { mesh.geometry.dispose(); (mesh.material as { dispose(): void }).dispose(); mesh.dispose(); }
      },
    };
  }, [motion, ocean, lite]);
  useEffect(() => () => view.dispose(), [view]);
  useFrame(() => view.update());

  return <>
    <primitive object={view.rings} dispose={null} />
    {view.drops && <primitive object={view.drops} dispose={null} />}
  </>;
}
