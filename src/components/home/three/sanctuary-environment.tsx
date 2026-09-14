import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, CatmullRomCurve3, Color, DoubleSide, Float32BufferAttribute, ShaderMaterial, TubeGeometry, Vector3 } from 'three';
import type { Habitat } from '@/lib/home';
import { advanceSwimTime } from '@/lib/swimming';

function makeFrond() {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const breadth = Math.sin(Math.PI * t) * .18;
    const z = Math.sin(t * Math.PI) * .22 - t * t * .28;
    positions.push(t * 1.35, -breadth, z, t * 1.35, 0, z + .035, t * 1.35, breadth, z);
    if (i < 14) {
      const a = i * 3;
      indices.push(a,a+3,a+1,a+1,a+3,a+4,a+1,a+4,a+2,a+2,a+4,a+5);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  return geometry;
}

function Palm({ position, scale = 1, rotation = 0 }: { position: [number,number,number]; scale?: number; rotation?: number }) {
  const trunk = useMemo(() => new TubeGeometry(new CatmullRomCurve3([
    new Vector3(0,0,0),new Vector3(.05,.6,.03),new Vector3(.22,1.4,.02),new Vector3(.19,2.1,0),
  ]),16,.065,7,false),[]);
  const frond = useMemo(() => makeFrond(),[]);
  return <group position={position} scale={scale} rotation={[0,rotation,0]}>
    <mesh geometry={trunk} castShadow><meshStandardMaterial color="#9e845b" roughness={.95} /></mesh>
    <group position={[.19,2.1,0]}>
      {Array.from({length:9},(_,i) => <group key={i} rotation={[0,i*Math.PI*2/9,0]}><mesh geometry={frond} rotation={[-Math.PI/2,0,.08 + (i%2)*.15]} castShadow><meshStandardMaterial side={DoubleSide} color={i%2 ? '#508468' : '#72976b'} roughness={.86} /></mesh></group>)}
      <mesh position={[0,-.06,0]} scale={[.11,.14,.11]}><sphereGeometry args={[1,10,8]} /><meshStandardMaterial color="#8a7950" /></mesh>
    </group>
  </group>;
}

function Rock({ position, scale, color = '#94a397' }: { position: [number,number,number]; scale: [number,number,number]; color?: string }) {
  return <mesh position={position} scale={scale} rotation={[.15,.8,.2]} castShadow receiveShadow><icosahedronGeometry args={[1,1]} /><meshStandardMaterial color={color} roughness={.96} /></mesh>;
}
function Coral({ position, color = '#c79789', scale = 1 }: { position: [number,number,number]; color?: string; scale?: number }) {
  return <group position={position} scale={scale}>{[-1,0,1].map((i) => <group key={i} rotation={[0,0,i*.5]}><mesh position={[i*.075,.15,0]} castShadow><capsuleGeometry args={[.035,.3,3,6]} /><meshStandardMaterial color={color} roughness={.88} /></mesh><mesh position={[i*.075,.28,0]} rotation={[0,0,.65]}><capsuleGeometry args={[.025,.14,3,6]} /><meshStandardMaterial color={color} /></mesh></group>)}</group>;
}

function Seabed({ habitat, active }: { habitat: Habitat; active: boolean }) {
  const material = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(() => ({
    time: { value: 0 },
    deep: { value: new Color(habitat === 'lagoon' ? '#63b8c4' : habitat === 'cove' ? '#8baea6' : '#7fc8be') },
    shallow: { value: new Color('#d3e7cb') },
  }),[habitat]);
  useFrame((_,delta) => {
    if (material.current) material.current.uniforms.time.value = advanceSwimTime(material.current.uniforms.time.value,delta,active);
  });
  return <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.72,0]} receiveShadow>
    <planeGeometry args={[200,200]} />
    <shaderMaterial ref={material} uniforms={uniforms} vertexShader={`varying vec3 world; void main(){ vec4 p=modelMatrix*vec4(position,1.);world=p.xyz;gl_Position=projectionMatrix*viewMatrix*p; }`} fragmentShader={`
      varying vec3 world; uniform float time; uniform vec3 deep; uniform vec3 shallow;
      void main(){
        vec2 p=world.xz;float shore=1.-smoothstep(1.3,4.2,length(p*vec2(.85,1.)));
        vec3 color=mix(deep,shallow,shore*.72);
        float a=sin(p.x*5.+sin(p.y*3.+time*.24))+sin(p.y*5.-sin(p.x*3.-time*.19));
        float b=sin(p.x*8.+p.y*3.+time*.16)*sin(p.y*6.-p.x*2.-time*.13);
        float caustic=pow(1.-abs(a)*.5,12.)*.075+pow(abs(b),14.)*.035;
        color+=caustic;gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`} />
  </mesh>;
}

export function SanctuaryEnvironment({ habitat, level, active, inspect = false }: { habitat: Habitat; level: number; active: boolean; inspect?: boolean }) {
  return <>
    <color attach="background" args={[habitat === 'cove' ? '#b5cec5' : '#aadbd2']} />
    <ambientLight intensity={.8} />
    <hemisphereLight args={['#e0f5f1','#71917d',1.8]} />
    <directionalLight position={[-3,8,4]} intensity={3} castShadow shadow-mapSize={[1024,1024]} shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={8} shadow-camera-bottom={-8} shadow-normalBias={.03} shadow-bias={-.0002} />
    <Seabed habitat={habitat} active={active} />
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.70,0]} receiveShadow><planeGeometry args={[100,100]} /><shadowMaterial transparent opacity={.16} /></mesh>
    {!inspect && <group scale={1 + (level-1)*.025}>
      <mesh position={[0,-.18,0]} scale={[2.25,.40,1.65]} castShadow receiveShadow><sphereGeometry args={[1,48,24]} /><meshStandardMaterial color="#e9dbb7" roughness={1} /></mesh>
      <mesh position={[-.15,.07,-.2]} scale={[1.53,.16,1.05]} receiveShadow><sphereGeometry args={[1,40,20]} /><meshStandardMaterial color={habitat === 'cove' ? '#b3b99b' : '#eee3c7'} roughness={1} /></mesh>
      {habitat === 'cove' ? <><Rock position={[.1,.38,-.3]} scale={[.72,.85,.65]} /><Rock position={[-.6,.25,-.25]} scale={[.55,.47,.5]} color="#acb6a2" /><Palm position={[.7,.2,.1]} scale={.6} /></> : <><Palm position={[-.35,.2,-.3]} scale={.85} /><Palm position={[.45,.18,-.1]} scale={.66} rotation={1.7} /></>}
      <Rock position={[-1.15,.1,-.35]} scale={[.35,.25,.3]} />
      <Rock position={[.9,.06,.65]} scale={[.23,.14,.21]} color="#c7c7aa" />
      {habitat === 'lagoon' && <mesh position={[.3,.12,.64]} rotation={[-Math.PI/2,0,0]} scale={[.75,.35,1]}><circleGeometry args={[1,48]} /><meshStandardMaterial color="#8dcec3" roughness={.45} /></mesh>}
      {(level>=2 || habitat==='lagoon') && <><Coral position={[-1.9,-.48,1.4]} /><Coral position={[-2.2,-.52,1.0]} scale={.7} color="#d4b391" /><Coral position={[2,-.5,.8]} scale={1.3} color="#94ae85" /></>}
      {level>=3 && <><Rock position={[-2.2,-.54,-1.3]} scale={[.4,.18,.3]} color="#a5b9a1" /><Coral position={[1.4,-.4,1.85]} scale={.8} /></>}
      {level>=4 && <Palm position={[-.85,.18,.2]} scale={.54} rotation={2.5} />}
      {level>=5 && <group position={[2.65,-.12,-2]} scale={.38}><mesh scale={[1.3,.3,1]} receiveShadow><sphereGeometry args={[1,32,16]} /><meshStandardMaterial color="#e9dbb7" roughness={1} /></mesh><Palm position={[0,.2,0]} scale={.8} /></group>}
      {level>=6 && <group position={[-2.8,-.12,2.1]} scale={.32}><mesh scale={[1.3,.3,1]} receiveShadow><sphereGeometry args={[1,32,16]} /><meshStandardMaterial color="#e9dbb7" roughness={1} /></mesh><Palm position={[0,.2,0]} scale={.7} /></group>}
    </group>}
  </>;
}
