import { useEffect } from 'react';
import { addAfterEffect, useThree } from '@react-three/fiber';
import type { Material, Object3D, WebGLRenderer } from 'three';

/**
 * Keeps the shader programs a canvas has linked for as long as the canvas lives, so that going back to an island links
 * nothing new. three.js frees a program the moment the last material using it is disposed, and a card that switches
 * islands disposes every material of the island it leaves (animals, coast, ocean): each switch back linked the same
 * ten or so programs all over again, the animals' and the ocean's among the biggest shaders in the app.
 *
 * A built-in material's program is found again by its name (`lambert,...` plus the material's own `customProgramCacheKey`),
 * so it is enough to count one more use of it: it is then never freed. A ShaderMaterial's is found by the numbers three.js
 * gives its source code, and forgets them (so the same code gets new ones, and its old program is never found again)
 * once the last material with that code is disposed: for those, the first material seen with each program is kept
 * alive instead (its `dispose` does nothing), and the next ocean, built with the same code, finds the program the
 * first one made. What stays is a program per kind of material seen (ten to thirty over a whole session), and the
 * kept materials, which hold only the ocean's uniforms (the same object the live ocean has).
 */
export function createProgramKeeper() {
  /** Programs given their extra use, and those a ShaderMaterial has already been looked for. */
  const pinned = new WeakSet<object>(), looked = new WeakSet<object>();
  /** The materials kept alive for ShaderMaterial programs, by the program's key. */
  const kept = new Map<string, Material>();
  const named = (key: string) => /^[A-Za-z]/.test(key);
  return {
    kept,
    /** Called after each frame: gives new programs their extra use and keeps the ShaderMaterials behind the others. */
    keep(renderer: WebGLRenderer, scene: Object3D) {
      const programs = renderer.info.programs;
      if (!programs) return;
      let unseen = false;
      for (const program of programs) {
        if (named(program.cacheKey)) {
          if (!pinned.has(program)) { pinned.add(program); program.usedTimes++; }
        } else if (!kept.has(program.cacheKey) && !looked.has(program)) { looked.add(program); unseen = true; }
      }
      if (!unseen) return;
      scene.traverse((object) => {
        const own = (object as { material?: Material | Material[] }).material;
        if (!own) return;
        for (const material of Array.isArray(own) ? own : [own]) {
          if (!(material as { isShaderMaterial?: boolean }).isShaderMaterial || !renderer.properties.has(material)) continue;
          const key = (renderer.properties.get(material) as { currentProgram?: { cacheKey?: string } }).currentProgram?.cacheKey;
          if (!key || named(key) || kept.has(key)) continue;
          kept.set(key, material);
          material.dispose = () => {};
        }
      });
    },
  };
}

/** In the canvas: keeps its programs (see createProgramKeeper). */
export function ProgramKeeper() {
  const gl = useThree((state) => state.gl), scene = useThree((state) => state.scene);
  useEffect(() => {
    const keeper = createProgramKeeper();
    return addAfterEffect(() => keeper.keep(gl, scene));
  }, [gl, scene]);
  return null;
}
