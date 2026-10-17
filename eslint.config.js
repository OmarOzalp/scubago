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
  {
    // The scene tests mock three.js components as host elements (<swimmer model onPress>,
    // <rocks morays octopuses>, <probe quality>) and read the props back; they are not DOM.
    files: ["src/components/home/__tests__/*.test.js"],
    rules: {
      "react/no-unknown-property": ["warn", { ignore: ["model", "onPress", "morays", "octopuses", "quality"] }],
    },
  },
  {
    // Jest provides these globals to test files (some tests import them from @jest/globals instead).
    files: ["**/__tests__/**/*.{js,jsx,ts,tsx}", "**/*.test.{js,jsx,ts,tsx}"],
    languageOptions: {
      globals: {
        jest: "readonly",
        expect: "readonly",
        test: "readonly",
        it: "readonly",
        describe: "readonly",
        beforeAll: "readonly",
        beforeEach: "readonly",
        afterAll: "readonly",
        afterEach: "readonly",
      },
    },
  },
  {
    // The rigged marine models are Metro assets (metro.config.js adds glb to assetExts), required
    // like the images and fonts eslint-config-expo already allows.
    files: ["src/components/home/three/marine-loader.ts"],
    rules: { "@typescript-eslint/no-require-imports": ["warn", { allow: ["\\.glb$"] }] },
  },
]);
