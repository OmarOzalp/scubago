import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import type { Habitat } from '@/lib/home';
import { advanceSwimTime } from '@/lib/swimming';

/** Two cheap draws: translucent water and a single mesh of broken ripple highlights. */
export function WaterSurface({ active, habitat }: { active: boolean; habitat: Habitat }) {
  const ripples = useRef<Mesh>(null);
  const material = useRef<MeshBasicMaterial>(null);
  const elapsed = useRef(0);
  // Ease the tint into the card background at the far/near edges, avoiding a rectangular seam.
  const waterGeometry = useMemo(() => {
    const plane = new PlaneGeometry(40, 40, 1, 40);
    const positions = plane.attributes.position;
    const colors = new Float32Array(positions.count * 4);
    for (let i = 0; i < positions.count; i++) {
      const t = Math.max(0, Math.min(1, (5.6 - Math.abs(positions.getY(i))) / 1.5));
      colors.set([1, 1, 1, t * t * (3 - 2 * t)], i * 4);
    }
    plane.setAttribute('color', new Float32BufferAttribute(colors, 4));
    return plane;
  }, []);
  useEffect(() => () => waterGeometry.dispose(), [waterGeometry]);
  const geometry = useMemo(() => {
    const positions: number[] = [], indices: number[] = [];
    for (let row = 0; row < 11; row++) {
      const start = -7 + (row % 3) * .8;
      const length = 7 + (row % 4) * 1.2;
      const base = positions.length / 3;
      for (let step = 0; step <= 24; step++) {
        const fraction = step / 24;
        const x = start + length * fraction;
        const z = (row - 5) * 1.3 + Math.sin(x * .65 + row) * .22 + x * .24;
        const width = Math.sin(fraction * Math.PI) * .026;
        positions.push(x, 0, z - width, x, 0, z + width);
        if (step < 24) {
          const i = base + step * 2;
          indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
        }
      }
    }
    const result = new BufferGeometry();
    result.setAttribute('position', new Float32BufferAttribute(positions, 3));
    result.setIndex(indices);
    return result;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame((_, delta) => {
    elapsed.current = advanceSwimTime(elapsed.current, delta, active);
    const time = elapsed.current;
    if (ripples.current) ripples.current.position.set(Math.sin(time * .16) * .22, -.175, Math.cos(time * .12) * .18);
    if (material.current) material.current.opacity = .10 + Math.sin(time * .23) * .025;
  });
  return <>
    <mesh geometry={waterGeometry} position={[0, -.18, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2} raycast={() => {}}>
      <meshBasicMaterial color={habitat === 'cove' ? '#70AAA2' : '#61B8BE'} vertexColors transparent opacity={.27} depthWrite={false} />
    </mesh>
    <mesh ref={ripples} geometry={geometry} position={[0, -.175, .18]} renderOrder={3} raycast={() => {}}>
      <meshBasicMaterial ref={material} color="#E9FAF5" transparent opacity={.10} depthWrite={false} />
    </mesh>
  </>;
}
