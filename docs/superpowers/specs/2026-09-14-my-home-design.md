# My Home

User approved the island sanctuary direction in conversation on 2026-09-14.

My Home becomes the opening tab; Map and My Log remain available. A softly shaded
SVG island sits in turquoise water. Choose Sandy Island, Coral Lagoon, or Rocky Cove
and edit the home name. Preferences persist on this device, scoped to the current
owner. Progress is derived from personal, non-demo sightings of known species.

Each distinct species adds a resident. Category-specific silhouettes swim slowly
around the island; tapping opens the existing species detail. Show up to 12 residents
at once, rotating larger collections, with all accessible through the collection.
Respect reduced motion and stop animations when the screen is unfocused/backgrounded.

Growth milestones: 0 (New Explorer / little island), 3 (Reef Scout / coral garden),
8 (Ocean Wanderer / wider shallows), 15 (Reef Guardian / grove), 30 (Ocean Expert /
satellite island), 60 (Ocean Legend / archipelago). These are collection ranks,
not dive qualifications. Repeat sightings remain counted in the log but do not
increase the unique-species progression. Show the next reward and remaining count.

Use Expo SDK 57, React Native, react-native-svg 15.15.4, and existing animation APIs.
Keep the scene, creature art, progression, and saved preferences separate. No backend
schema change. Handle loading, empty collections, failed preference saves, large
collections, dark mode, small screens, and accessibility labels.

Verify progression boundaries, duplicates, demo/unknown filtering, preference parsing,
TypeScript, Jest, bundling, and an interactive visual review where available.
