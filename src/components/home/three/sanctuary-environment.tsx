import { useMemo } from 'react';
import { DoubleSide, Shape } from 'three';
import type { Habitat } from '@/lib/home';
import { WaterSurface } from './water-surface';

export const WATER: Record<Habitat, string> = { island: '#C5E3DF', lagoon: '#B9DEDC', cove: '#C5DCD3' };

function shoreline() {
  const shape = new Shape();
  shape.moveTo(-2.1, -.1);
  shape.bezierCurveTo(-2.25, .85, -1.3, 1.5, -.35, 1.42);
  shape.bezierCurveTo(.3, 1.38, .5, .98, 1.12, 1.02);
  shape.bezierCurveTo(2.02, 1.07, 2.32, .25, 1.9, -.42);
  shape.bezierCurveTo(1.55, -.98, .75, -1.16, .15, -1.36);
  shape.bezierCurveTo(-.92, -1.65, -1.96, -1.07, -2.1, -.1);
  return shape;
}

/** Flat shoreline layers suggest depth without a shadow map or water shader. */
function ShoreLayer({ scale = 1, y, color, offset = [0, 0] }: {
  scale?: number; y: number; color: string; offset?: [number, number];
}) {
  const shape = useMemo(() => shoreline(), []);
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[offset[0], y, offset[1]]} scale={scale}>
    <shapeGeometry args={[shape, 12]} /><meshBasicMaterial color={color} />
  </mesh>;
}

/** Broad leaves and a short trunk stay readable from above. */
function Palm({ position, scale = 1, rotation = 0 }: {
  position: [number, number, number]; scale?: number; rotation?: number;
}) {
  const leaf = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(.35, .31, 1.02, .04);
    shape.quadraticCurveTo(.56, -.23, 0, 0);
    return shape;
  }, []);
  return <group position={position} scale={scale} rotation={[0, rotation, 0]}>
    <mesh position={[.12, -.01, .12]} rotation={[-Math.PI / 2, 0, 0]} scale={[.85, .6, 1]}>
      <circleGeometry args={[1, 20]} /><meshBasicMaterial color="#C4CBA3" />
    </mesh>
    <mesh position={[0, .38, 0]} rotation={[0, 0, -.12]}>
      <cylinderGeometry args={[.045, .065, .78, 6]} /><meshLambertMaterial color="#AE9164" />
    </mesh>
    <group position={[.05, .78, 0]}>
      {Array.from({ length: 6 }, (_, i) => <group key={i} rotation={[0, i * Math.PI / 3, 0]}>
        <mesh rotation={[-Math.PI / 2, -.12, 0]}>
          <shapeGeometry args={[leaf, 6]} /><meshBasicMaterial color={i % 2 ? '#719C78' : '#8FB18A'} side={DoubleSide} />
        </mesh>
      </group>)}
    </group>
  </group>;
}

function Rock({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return <mesh position={position} scale={[scale, scale * .55, scale * .8]} rotation={[0, .5, .1]}>
    <icosahedronGeometry args={[1, 0]} /><meshLambertMaterial color="#A3B6A6" />
  </mesh>;
}
function Coral({ position, color = '#CBAA96' }: { position: [number, number, number]; color?: string }) {
  return <group position={position}>{[-1, 0, 1].map((i) => <mesh key={i}
    position={[i * .14, 0, Math.abs(i) * .06]} rotation={[-Math.PI / 2, 0, i * .3]} scale={[.12, .22, 1]}>
    <circleGeometry args={[1, 8]} /><meshBasicMaterial color={color} />
  </mesh>)}</group>;
}

export function SanctuaryEnvironment({ habitat, level, active, inspect = false }: {
  habitat: Habitat; level: number; active: boolean; inspect?: boolean;
}) {
  return <>
    <color attach="background" args={[WATER[habitat]]} />
    <hemisphereLight args={['#F4F7EC', '#5E8F91', 1.15]} />
    <directionalLight position={[-3, 8, 4]} intensity={1.7} />
    {!inspect && <WaterSurface active={active} habitat={habitat} />}
    {!inspect && <group scale={1 + (level - 1) * .025}>
      <ShoreLayer scale={1.42} y={-.72} color={habitat === 'cove' ? '#B0CEC0' : '#A8D3C9'} />
      <ShoreLayer scale={1.23} y={-.70} color="#BCDCD0" />
      <ShoreLayer scale={1.09} y={-.68} color="#D6E6D4" />
      <ShoreLayer scale={1.035} y={-.12} color="#D9CEAB" offset={[.025, .06]} />
      <ShoreLayer y={-.06} color="#F0E6C9" />
      <ShoreLayer scale={.68} y={-.04} color={habitat === 'cove' ? '#BDC8A3' : '#E5DEB7'} offset={[-.25, -.14]} />
      {habitat === 'cove' ? <>
        <Rock position={[-.3, .17, -.2]} scale={.6} /><Rock position={[-.86, .06, -.05]} scale={.35} />
        <Palm position={[.6, -.015, -.1]} scale={.64} />
      </> : <>
        <Palm position={[-.5, -.015, -.25]} scale={.8} rotation={.3} />
        <Palm position={[.52, -.01, -.4]} scale={.6} rotation={1.2} />
      </>}
      <Rock position={[-1.3, 0, .3]} scale={.2} />
      <Rock position={[1.15, 0, -.2]} scale={.13} />
      {habitat === 'lagoon' && <mesh position={[.45, -.02, .62]} rotation={[-Math.PI / 2, 0, -.3]} scale={[.65, .32, 1]}>
        <circleGeometry args={[1, 24]} /><meshBasicMaterial color="#A8D3C9" />
      </mesh>}
      {(level >= 2 || habitat === 'lagoon') && <>
        <Coral position={[-2.1, -.65, 1.25]} /><Coral position={[2.2, -.65, .65]} color="#8CB7A5" />
      </>}
      {level >= 3 && <><Rock position={[-2.1, -.57, -1.3]} scale={.25} /><Coral position={[1.5, -.65, 1.65]} /></>}
      {level >= 4 && <Palm position={[-.55, -.01, .6]} scale={.46} rotation={2.5} />}
      {level >= 5 && <group position={[2.65, 0, -2]} scale={.3}>
        <ShoreLayer y={-.1} color="#F0E6C9" /><Palm position={[0, 0, 0]} scale={.8} />
      </group>}
      {level >= 6 && <group position={[-2.8, 0, 2.1]} scale={.26}>
        <ShoreLayer y={-.1} color="#F0E6C9" /><Palm position={[0, 0, 0]} scale={.7} />
      </group>}
    </group>}
  </>;
}
