# The archipelago

Home is the diver's archipelago: the areas of the ocean their animals live in, each named for
the kind of place a diver meets them. Every species in the catalog lives in one area
(`src/lib/archipelago.ts`), and an area appears with the first species logged from it, so
the archipelago grows with the diver's own dives. There is no choosing it: the habitat picker
that used to offer a sandy island, a coral lagoon or a rocky cove is gone.

| Area | What it is | Who lives there | Species |
| --- | --- | --- | ---: |
| Coral Reef | A sandy palm island ringed with coral (Home's island today) | Reef sharks, the wobbegong, reef manta, hawksbill turtle, Napoleon wrasse, bumphead parrotfish, clownfish, angelfish and triggerfish, giant moray, day octopus, giant clam, Christmas tree worms, banded sea krait; golden jellyfish in a marine lake | 34 |
| Open Ocean | The deep blue all around the islands | Whale shark, oceanic whitetip, mako and silky sharks, oceanic manta and devil rays, humpback and sperm whales, dolphins, sailfish, yellowfin tuna, mola mola, leatherback and olive ridley turtles | 15 |
| Kelp Forest | A cold, rocky coast of towering kelp | Great white and basking sharks, orca, sea lions, harbor seals, sea otters, leafy and weedy seadragons, garibaldi, giant sea bass, wolf eel, lingcod, giant Pacific octopus, giant cuttlefish | 14 |
| Mangroves & Seagrass | A warm, shallow lagoon of mangrove roots and seagrass | Dugong, manatee, green turtle, tiger, lemon, nurse and bull sharks, great hammerhead, sawfish, southern stingray, guitarfish, tarpon, seahorse, reef squid | 14 |
| Volcanic Pinnacle | A black lava island in strong currents | Schooling scalloped hammerheads, Galápagos and thresher sharks, eagle rays, marbled rays, barracuda, giant trevally, dogtooth tuna, king angelfish, chambered nautilus, marine iguanas | 11 |
| Black Sand Bay | A volcanic sand and rubble slope | Frogfish, mimic, coconut and blue-ringed octopuses, flamboyant cuttlefish, mandarinfish, garden eels, stonefish, ghost pipefish, pygmy seahorse, nudibranchs, harlequin and mantis shrimp | 23 |
| Shipwreck | An old wreck on the sand | Sand tiger sharks, goliath and giant groupers, great barracuda, lionfish, batfish, green moray, spiny lobster, loggerhead turtle | 9 |

A species that lives in more than one kind of place (green turtles graze seagrass and rest on
reefs) has one home, where divers meet it most. The test in
`src/lib/__tests__/archipelago.test.ts` checks that every species in the catalog has exactly
one, and that every area has residents.

## On Home

Under the island's hint, a row of pills names the areas the diver has found, in the order
they rose, each with a coloured dot (`color`, never the only cue) and how many of the diver's
species live there, then how many areas are still to discover ("+5 to discover"). Screen
readers hear it as one line ("Your archipelago: Coral Reef, 2 species; Open Ocean, 1 species;
5 more areas to discover"). The explorer's label reads "Exploring · " and the home's name.

The island on Home is the Coral Reef, drawn with the sandy island's shores (`HOME_SHORE`).
The other shores (`HABITATS`: the coral lagoon and the rocky cove) stay for the archipelago's
other islands. Levels still grow the island and its sea as the collection grows; the rewards
at levels 5 and 6 are its islets.

## Next

The islands of the other areas, each rising in the same sea as its first species is logged:
the Open Ocean's animals first, then the Kelp Forest's island and its animals.
