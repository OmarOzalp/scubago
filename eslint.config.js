// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // React Three Fiber JSX (<mesh position=…>, <meshStandardMaterial roughness=…>) uses
    // three.js object properties as props; the DOM-oriented rule cannot know them.
    files: [
      "src/components/home/three/**/*.tsx",
      "src/components/home/sanctuary-scene.tsx",
      "src/app/inspect.tsx",
    ],
    rules: { "react/no-unknown-property": "off" },
  },
]);
