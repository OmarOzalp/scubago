import { BufferGeometry, Color, Float32BufferAttribute, Material, Mesh, Object3D, Vector3 } from 'three';

/** Bind-pose length coordinates travel with the skin, keeping the fade attached to the animal. */
export function prepareUnderwater(instance: Object3D) {
  const depth = { value: 0 };
  const surfacing = { value: 0 };
  const tint = { value: new Color('#75BDBA') };
  const materials = new Map<Material, Material>();
  const geometries: BufferGeometry[] = [];
  const meshes: Mesh[] = [];
  const point = new Vector3();
  let tail = Infinity, head = -Infinity;
  instance.updateMatrixWorld(true);
  instance.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    meshes.push(object);
    const positions = object.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
      tail = Math.min(tail, point.z); head = Math.max(head, point.z);
    }
  });
  for (const object of meshes) {
    const geometry = object.geometry.clone();
    geometries.push(geometry);
    const positions = geometry.attributes.position;
    const along = new Float32Array(positions.count);
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
      along[i] = (point.z - tail) / Math.max(head - tail, .0001);
    }
    geometry.setAttribute('diveAlong', new Float32BufferAttribute(along, 1));
    object.geometry = geometry;
    const own = (source: Material) => {
      if (!materials.has(source)) {
        const material = source.clone();
        material.transparent = true;
        material.forceSinglePass = true;
        material.onBeforeCompile = (shader) => {
          shader.uniforms.diveDepth = depth;
          shader.uniforms.surfacing = surfacing;
          shader.uniforms.waterTint = tint;
          shader.vertexShader = `attribute float diveAlong;\nuniform float diveDepth;\nuniform float surfacing;\nvarying float submersion;\n${shader.vertexShader}`
            .replace('#include <begin_vertex>', `#include <begin_vertex>
              submersion = smoothstep(0.0, .45, diveDepth * 1.45 - (1.0 - diveAlong));
              float emergence = smoothstep(0.0, .45, (1.0 - diveDepth) * 1.45 - (1.0 - diveAlong));
              submersion = mix(submersion, 1.0 - emergence, surfacing);`);
          shader.fragmentShader = `uniform vec3 waterTint;\nvarying float submersion;\n${shader.fragmentShader}`
            .replace('#include <opaque_fragment>', `
              outgoingLight = mix(outgoingLight, waterTint, submersion * .8);
              diffuseColor.a *= 1.0 - submersion;
              if (diffuseColor.a < .005) discard;
              #include <opaque_fragment>`);
        };
        material.customProgramCacheKey = () => 'marine-head-first-dive-v1';
        materials.set(source, material);
      }
      return materials.get(source)!;
    };
    object.material = Array.isArray(object.material) ? object.material.map(own) : own(object.material);
    object.renderOrder = 1;
  }
  return { depth, tint, surfacing, setDepth: (value: number, rising = false) => { depth.value = value; surfacing.value = rising ? 1 : 0; }, dispose: () => {
    materials.forEach((material) => material.dispose());
    geometries.forEach((geometry) => geometry.dispose());
  } };
}
