// Stands in for @react-three/fiber when the island meshes are built outside the app (scripts/bake-meshes.ts, scripts/verify-meshes.ts, run with
// scripts/tsconfig.meshes.json): the real one loads react-native. The builders never use a canvas, only the hooks the components import.
export const useFrame = () => {};
export const useThree = (select?: (state: unknown) => unknown) =>
  select ? select({ size: { width: 390, height: 363 }, invalidate() {}, camera: null, get: () => ({}) }) : {};
