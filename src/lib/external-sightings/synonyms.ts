/**
 * Scientific names that real records use for a catalogue species but that are not the name in
 * src/data/species.ts: former names, spelling variants, and species that were split or are lumped
 * together by divers. Each key is a normalised binomial (see normalizeScientificName); each value is
 * a catalogue species id. The catalogue's own names are matched without being listed here.
 *
 * Written from taxonomic knowledge, not from a live check against the sources: when a name turns
 * out wrong or missing, fix it here. The test in external-sightings-matching.test.ts keeps every
 * target a real catalogue id.
 */
export const SYNONYMS: Readonly<Record<string, string>> = {
  // ── Sharks ────────────────────────────────────────────────────────────────
  'galeocerdo cuvieri': 'tiger-shark', // spelling variant
  'isurus glaucus': 'shortfin-mako', // former name
  'odontaspis taurus': 'sand-tiger-shark', // former genus
  'eugomphodus taurus': 'sand-tiger-shark', // former genus
  'stegostoma fasciatum': 'zebra-shark', // name in use until the 2020s
  'stegostoma varium': 'zebra-shark', // name in use briefly before tigrinum

  // ── Rays ──────────────────────────────────────────────────────────────────
  'manta alfredi': 'reef-manta', // Manta was folded into Mobula in 2017
  'manta birostris': 'oceanic-manta',
  'pristis microdon': 'sawfish', // Indo-Pacific largetooth sawfish, now Pristis pristis
  'pristis perotteti': 'sawfish', // Atlantic largetooth sawfish, now Pristis pristis
  'aetobatus ocellatus': 'spotted-eagle-ray', // the Indo-Pacific split from A. narinari (2013)
  'aetobatus laticeps': 'spotted-eagle-ray', // the eastern Pacific split from A. narinari
  'taeniura meyeni': 'marbled-ray', // former genus
  'dasyatis americana': 'southern-stingray', // former genus
  'taeniura lessoni': 'bluespotted-ribbontail-ray', // the northern Australian split from T. lymma (2016)
  'rhinobatos typus': 'giant-guitarfish', // former genus

  // ── Turtles ───────────────────────────────────────────────────────────────
  'chelonia agassizii': 'green-turtle', // eastern Pacific "black turtle", a form of the green turtle

  // ── Mammals ───────────────────────────────────────────────────────────────
  'tursiops aduncus': 'bottlenose-dolphin', // Indo-Pacific bottlenose: divers log both as "bottlenose dolphin"
  'physeter catodon': 'sperm-whale', // former name
  'phoca richardii': 'harbor-seal', // Pacific harbour seal, split from P. vitulina by some authors

  // ── Big fish ──────────────────────────────────────────────────────────────
  'mola ramsayi': 'mola-mola', // southern sunfish, now Mola alexandrini; logged as "sunfish"
  'mola alexandrini': 'mola-mola',
  'mola tecta': 'mola-mola', // hoodwinker sunfish, logged as "sunfish"
  'istiophorus albicans': 'sailfish', // Atlantic sailfish, now treated as the same species
  'epinephelus quinquefasciatus': 'goliath-grouper', // Pacific goliath grouper, split from E. itajara
  'promicrops itajara': 'goliath-grouper', // former genus
  'promicrops lanceolatus': 'giant-grouper', // former genus
  'sphyraena genie': 'chevron-barracuda', // spelling variant of qenie

  // ── Reef fish ─────────────────────────────────────────────────────────────
  'amphiprion percula': 'clownfish', // "Nemo": divers log both clownfish under one entry
  'zanclus canescens': 'moorish-idol', // former name
  'pterois miles': 'lionfish', // devil firefish, the lionfish of the Red Sea and Indian Ocean
  'antennarius commersoni': 'giant-frogfish', // spelling variant
  'taenioconger hassi': 'garden-eel', // former genus
  'paracanthurus theuthis': 'blue-tang', // former name
  'ostracion cubicus': 'yellow-boxfish', // original spelling
  'anthias squamipinnis': 'sea-goldie', // former genus

  // ── Cephalopods ───────────────────────────────────────────────────────────
  'octopus dofleini': 'giant-pacific-octopus', // former genus
  'octopus lunulatus': 'blue-ringed-octopus', // former genus
  'octopus marginatus': 'coconut-octopus', // former genus

  // ── Macro ─────────────────────────────────────────────────────────────────
  'hymenocera elegans': 'harlequin-shrimp', // junior synonym
};
