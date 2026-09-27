import { useContext, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { DynamicDrawUsage, Euler, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { TUNA_SCHOOL, type TunaSchool } from '@/lib/tuna-school';
import { createOceanUniforms } from './ocean-mesh';
import { OceanContext } from './ocean-context';
import { useSceneQuality } from './scene-quality';
import { createSchoolMaterial } from './school-material';
import { createTunaGeometry } from './tuna-geometry';

/**
 * The tuna school, drawn as one instanced mesh (a single draw call): each frame copies the
 * simulation's poses (src/lib/tuna-school.ts, stepped by the marine motion before this runs) into
 * the instance matrices and the per-fish swim attribute. No allocation per frame.
 */
export function TunaSchoolMesh({ school }: { school: TunaSchool }) {
  const ocean = useContext(OceanContext);
  const lite = useSceneQuality() === 'lite';
  const view = useMemo(() => {
    const geometry = createTunaGeometry(lite);
    const swim = new InstancedBufferAttribute(new Float32Array(school.size * 4), 4).setUsage(DynamicDrawUsage);
    geometry.setAttribute('swim', swim);
    const material = createSchoolMaterial(ocean ?? createOceanUniforms(), lite);
    const mesh = new InstancedMesh(geometry, material, school.size);
    mesh.name = 'tuna-school';
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    // The fish spread around the island; bounds would need recomputing every frame for no gain.
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    const matrix = new Matrix4(), position = new Vector3(), rotation = new Euler(0, 0, 0, 'YXZ'), quaternion = new Quaternion(), scale = new Vector3();
    return {
      mesh,
      /** Copy the school's current poses into the instances. */
      update() {
        const pose = school.pose;
        for (let i = 0; i < school.size; i++) {
          // Yaw, then pitch about the fish's own lateral axis (positive = nose down), then roll into the turn.
          rotation.set(pose.pitch[i], pose.heading[i], pose.roll[i]);
          quaternion.setFromEuler(rotation);
          const length = TUNA_SCHOOL.length * school.sizes[i];
          matrix.compose(position.set(pose.x[i], pose.y[i], pose.z[i]), quaternion, scale.set(length, length, length));
          mesh.setMatrixAt(i, matrix);
          swim.setXYZW(i, pose.phase[i], pose.amp[i], pose.bend[i], 0);
        }
        mesh.instanceMatrix.needsUpdate = true;
        swim.needsUpdate = true;
      },
      dispose() { geometry.dispose(); material.dispose(); mesh.dispose(); },
    };
  }, [school, ocean, lite]);
  useEffect(() => () => view.dispose(), [view]);
  useFrame(() => view.update());

  return <primitive object={view.mesh} dispose={null} />;
}
