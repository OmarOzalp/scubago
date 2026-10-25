import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { router } from 'expo-router';
import { HomeEditor } from '@/components/home/home-editor';
import { useTip } from '@/components/home/use-tip';
import { IntroCards, useIntro } from '@/components/intro-cards';
import { SanctuaryScene } from '@/components/home/sanctuary-scene';
import { WATER } from '@/components/home/three/sanctuary-environment';
import { Icon } from '@/components/icon';
import { IconButton } from '@/components/journal/icon-button';
import { Disclosure } from '@/components/journal/disclosure';
import { Ledger } from '@/components/journal/ledger';
import { Paper } from '@/components/journal/paper';
import { ProgressBar } from '@/components/journal/progress-bar';
import { Screen, ScreenHeader, SectionHeader } from '@/components/journal/screen';
import { OceanButton } from '@/components/ocean-button';
import { ShareArchipelagoButton } from '@/components/share/share-buttons';
import { SpeciesCard } from '@/components/species-card';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useDiscoveryMoments } from '@/hooks/use-discovery-moments';
import { useHomePreferences } from '@/hooks/use-home-preferences';
import { useSceneActive } from '@/hooks/use-scene-active';
import { useTheme } from '@/hooks/use-theme';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { formatDiveNumber, milestoneName, nextMilestone } from '@/lib/dives';
import { AREAS, foundAreas, foundIslands, HOME_ISLAND, ISLANDS, isIsland, islandOf, islandResidents, type IslandId } from '@/lib/archipelago';
import { deriveHome } from '@/lib/home';
import { useAppStore, useMyDives, useMySightings, useMyUserId, useNextDiveNumber } from '@/lib/store';
import { macroResidents } from '@/lib/macro-life';
import { captureScene, HERO_SNAPSHOT } from '@/lib/scene-snapshot';
import { noneSwim, type MarineModel } from '@/lib/swimming';

/** Ink on the island's water (the scene's own colours, the same in both schemes). */
const ON_WATER = '#1F4B40';
/** The one-time tip over the island (use-tip.ts): stored once it has been shown, and taken down after this long. */
const HOME_TIP_KEY = 'scubago.homeTipSeen.v1';
const HOME_TIP_MS = 10000;

/** The share card's hero: a fresh picture of the island as it is on this card, or null (the card then draws its illustration). */
const captureHeroSnapshot = () => captureScene('home', HERO_SNAPSHOT);

export default function HomeScreen() {
  const theme = useTheme();
  const intro = useIntro();
  const mine = useMySightings();
  const owner = useMyUserId();
  const ready = useAppStore((s) => s.ready);
  const home = useMemo(() => deriveHome(mine, CATALOG_BY_ID), [mine]);
  const sites = useMemo(() => new Set(mine.filter((s) => !s.isDemo).map((s) => s.siteId)).size, [mine]);
  const saved = useHomePreferences(owner);
  const dives = useMyDives();
  const pages = dives.length;
  const nextNumber = useNextDiveNumber();
  const ahead = nextMilestone(nextNumber);
  // "3 dives to your fiftieth", only when a milestone is close; the button names the page, and that is all it needs otherwise.
  const milestoneLine = ahead && ahead.remaining === 0
    ? `Your ${milestoneName(ahead.at)} dive is next`
    : ahead && ahead.remaining <= 5
      ? `${ahead.remaining + 1} dives to your ${milestoneName(ahead.at)}`
      : null;
  const [editing, setEditing] = useState(false);
  const [paused, setPaused] = useState(false);
  // New species arriving and level-ups, played when Home is on screen (see useDiscoveryMoments).
  const moving = useSceneActive(paused || editing);
  const moments = useDiscoveryMoments({ owner, ready, residents: home.residents, sightings: mine, level: home.level, animate: moving });
  const count = home.residents.length;
  // The islands so far (Home's, and each other one once its first species is logged): the card shows
  // one at a time, chosen from the archipelago's pills. A new discovery arrives at its own island.
  const islands = useMemo(() => foundIslands(home.residents), [home.residents]);
  // A pill counts the species that swim at its island, as Rewards → Islands does ("8 of 72 residents found"): Home's
  // include the Open Ocean's and Black Sand Bay's, which have no island of their own and swim at Home (archipelago.ts).
  const pills = useMemo(() => islands.map((id) => {
    const area = AREAS.find((a) => a.id === id)!;
    return { id, name: area.name, color: area.color, count: islandResidents(home.residents, id).length };
  }), [islands, home.residents]);
  const swimAtHome = useMemo(() => foundAreas(home.residents).filter((a) => !isIsland(a.area.id)), [home.residents]);
  const [chosen, setChosen] = useState<IslandId>(HOME_ISLAND);
  const arrivingAt = moments.now ? islandOf(moments.now) : null;
  const [arrived, setArrived] = useState(arrivingAt);
  if (arrivingAt !== arrived) { setArrived(arrivingAt); if (arrivingAt) setChosen(arrivingAt); }
  const island = islands.includes(chosen) ? chosen : HOME_ISLAND, habitat = ISLANDS[island];
  const here = useMemo(() => islandResidents(home.residents, island), [home.residents, island]);
  const islandName = AREAS.find((a) => a.id === island)!.name;
  const loading = !ready || saved.loading || moments.loading;
  // Something swims here, or small life lives on the reef (seen only up close, full screen): there is something to explore.
  const small = macroResidents(here).length, none = noneSwim(here);
  const swimming = !loading && here.length > 0 && (!none || small > 0);
  // How to look around, said once: the first time an animal swims here to be tapped, and never again (use-tip.ts).
  const tip = useTip(HOME_TIP_KEY, { active: !loading && here.length > 0 && !none, hideAfter: HOME_TIP_MS });
  // Only the diver's own discoveries swim here (the showcase build, for development, brings visitors).
  const inspect = (model: MarineModel) => { tip.dismiss(); router.push({ pathname: '/inspect', params: { model, preview: '1' } }); };
  // The island full screen, to zoom in on and look around (src/app/explore.tsx): the button, or a tap on the island.
  const explore = () => { tip.dismiss(); router.push(island === HOME_ISLAND ? '/explore' : { pathname: '/explore', params: { island } }); };
  // A first run (no page, no animal yet): the hero holds the way in, and says the ocean is empty once.
  const first = !loading && pages === 0 && count === 0;
  // One short line under the island's name, only where the island needs explaining: nothing lives here yet, or what lives here can't be seen from here.
  const sceneNote = count === 0
    ? 'Animals you log come to live here.'
    : none && small > 0
      ? `${small === 1 ? 'Your small creature lives' : `Your ${small} small creatures live`} on the reef. Tap the island to find ${small === 1 ? 'it' : 'them'}.`
      : none
        ? `${here.length === 1 ? 'Your species isn’t' : `Your ${here.length} species aren’t`} drawn for the island yet.`
        : '';
  // What the Open Ocean's species add to Home's pill, for a screen reader (the pill shows only the number).
  const including = swimAtHome.length ? `, including ${swimAtHome.map(({ area, count: living }) => `${living} from ${area.name}`).join(' and ')}` : '';
  return <View style={[styles.root, { backgroundColor: theme.background }]}>
    <Screen tab>
      <ScreenHeader
        title="Your ocean"
        accessory={<View style={styles.headerButtons}>
          {!loading && <ShareArchipelagoButton name={saved.preferences.name} sightings={mine} dives={dives} ownerId={owner} captureSnapshot={captureHeroSnapshot} />}
          <IconButton icon="edit" accessibilityLabel="Customize your home" onPress={() => !loading && setEditing(true)} style={{ opacity: loading ? 0.4 : 1 }} />
        </View>}
      />

      {/* The island, mounted like a print on the page with a fine ink frame. */}
      <Paper raised padded={false} style={styles.islandCard}>
        <View style={[styles.mount, { borderColor: theme.text }]}>
          <View style={[styles.hero, { backgroundColor: WATER[habitat] }]}>
            <View style={styles.heroHeader}>
              <View style={styles.heroButtons}>
                {swimming && <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open full screen"
                  onPress={explore}
                  style={({ pressed }) => [styles.motionButton, { opacity: pressed ? 0.7 : 1 }]}>
                  <Icon name="expand" size={20} color={ON_WATER} wash="#FFFFFF" washOpacity={0.6} />
                </Pressable>}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={paused ? 'Resume ocean animation' : 'Pause ocean animation'}
                  onPress={() => setPaused((value) => !value)}
                  style={({ pressed }) => [styles.motionButton, { opacity: pressed ? 0.7 : 1 }]}>
                  <Icon name={paused ? 'play' : 'pause'} size={20} color={ON_WATER} wash="#FFFFFF" washOpacity={0.6} />
                </Pressable>
              </View>
            </View>
            <SanctuaryScene habitat={habitat} level={moments.level} residents={here} loading={loading} paused={paused || editing || loading} onInspect={inspect} onOpen={swimming ? explore : undefined}
              moments={{ featured: moments.featured, waiting: moments.waiting, now: moments.now, onArrived: moments.onArrived, tag: moments.tag, banner: moments.banner, note: moments.note, busy: moments.busy }} />
            <View style={styles.heroFooter}>
              {/* How to look around, said once over the island's water, where the animals are (it takes no room of its own). */}
              {tip.show && <View style={styles.tip} pointerEvents="none"><Text style={styles.tipText}>Tap an animal to meet it.</Text></View>}
              {/* Home's island is named by the diver (tap to rename); any other island is named for its habitat. */}
              {island === HOME_ISLAND
                ? <Pressable accessibilityRole="button" accessibilityLabel={`${saved.preferences.name}, your home`} accessibilityHint="Rename your home" onPress={() => !loading && setEditing(true)}
                  style={({ pressed }) => [styles.nameRow, { opacity: pressed ? 0.7 : 1 }]}>
                  <Text style={[styles.homeName, styles.nameText]}>{saved.preferences.name}</Text>
                  <Icon name="edit" size={18} color={ON_WATER} wash="#FFFFFF" washOpacity={0.6} />
                </Pressable>
                : <Text style={styles.homeName} accessibilityRole="header">{islandName}</Text>}
              {loading ? <Text style={styles.sceneHint}> </Text> : sceneNote ? <Text style={styles.sceneHint}>{sceneNote}</Text> : null}
              {first && <OceanButton title="Log your first dive" variant="log" icon="plus" onPress={() => router.push('/log/new')} style={styles.firstDive} />}
              {/* The archipelago so far: an island's pill shows it in the card; with only Home's, there is nothing to choose. */}
              {!loading && count > 0 && (islands.length > 1
                ? <IslandPills pills={pills} chosen={island} onChoose={setChosen} including={including} />
                : <View style={styles.areas} accessible accessibilityLabel={`${pills[0].name}, ${pills[0].count} species${including}`}>
                  <View style={[styles.areaDot, { backgroundColor: pills[0].color }]} />
                  <Text style={styles.areaName}>{pills[0].name}</Text>
                  <Text style={styles.areaCount}>{pills[0].count}</Text>
                </View>)}
            </View>
          </View>
        </View>

        <View style={styles.progress}>
          <View style={styles.progressHeading}>
            <ThemedText type="caption" style={{ flex: 1, fontSize: 17 }}>
              {loading ? 'Your explorer journey' : `${home.stage.rank} · level ${home.level}`}
            </ThemedText>
            {!loading ? <Text style={[styles.progressCount, { color: theme.tint }]}>{home.next ? `${count} / ${home.next.at}` : `${count} species`}</Text> : null}
          </View>
          {loading ? (
            <ThemedText type="small" themeColor="textSecondary">Loading your discoveries…</ThemedText>
          ) : (
            <>
              <ProgressBar
                fraction={home.fraction}
                accessibilityLabel={home.next ? `${count} of ${home.next.at} species to ${home.next.reward.toLowerCase()}` : 'Every level reached'}
                max={home.next?.at ?? count}
                now={count}
              />
              <ThemedText type="small" themeColor="textSecondary">
                {home.next ? `${home.remaining} more species for ${home.next.reward.toLowerCase()}.` : 'Your archipelago is flourishing.'}
              </ThemedText>
              {/* When nothing here can be seen swimming, what does swim, for anyone who wonders. */}
              {count > 0 && none && small === 0 && <Disclosure label="What swims here?" hint="Shows which animals the island draws">
                <ThemedText type="small" themeColor="textSecondary">Sharks, rays, reef fish and some turtles, dolphins and octopuses swim here. The rest live in your field guide.</ThemedText>
              </Disclosure>}
            </>
          )}
        </View>
      </Paper>
      {!!saved.error && !editing && <ThemedText type="small" themeColor="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">{saved.error}</ThemedText>}

      {/* Nothing here until the first animal: the island above has already said the ocean is empty (and the level is in its progress line). */}
      {count > 0 && <>
        <Ledger
          bare
          items={[
            { value: String(count), label: 'Species' },
            { value: String(home.sightingCount), label: 'Sightings' },
            { value: String(sites), label: sites === 1 ? 'Site' : 'Sites' },
          ]}
        />
        <SectionHeader
          title="Life around you"
          accessory={<Pressable accessibilityRole="link" accessibilityLabel="Your field guide" onPress={() => router.push('/field-guide')} style={styles.textButton}><ThemedText type="smallBold" themeColor="tint">Field guide ›</ThemedText></Pressable>}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.residentsScroll} contentContainerStyle={styles.residents}>
          {home.residents.map((entry) => <SpeciesCard key={entry.species.id} species={entry.species} width={124} count={entry.count} onPress={() => router.push(`/species/${entry.species.id}`)} />)}
        </ScrollView>
      </>}

      {/* The next page of the logbook, by its number (on a first run, the island's own button starts it). */}
      {!first && <View style={styles.nextPage}>
        <OceanButton title={`Log dive ${formatDiveNumber(nextNumber)}`} variant="log" icon="plus" onPress={() => router.push('/log/new')} style={styles.logButton} />
        {milestoneLine && <ThemedText type="small" themeColor="textSecondary" style={styles.milestone}>{milestoneLine}</ThemedText>}
      </View>}
    </Screen>
    {editing && <HomeEditor key={owner} preferences={saved.preferences} saving={saved.saving} error={saved.error} onSave={saved.save} onClose={() => setEditing(false)} />}
    <IntroCards visible={intro.show} onDone={intro.done} />
  </View>;
}

/** One island of the archipelago, as a pill: its habitat's colour, its name, and how many of the diver's species swim there. */
type Pill = { id: IslandId; name: string; color: string; count: number };

/**
 * The islands the diver has found, as one row of pills to choose from. It scrolls sideways (there can
 * be five, and wrapping them took the card's height), and brings the chosen island's pill to the
 * middle, as a new discovery arrives at its island without the diver touching a pill.
 */
function IslandPills({ pills, chosen, onChoose, including }: { pills: Pill[]; chosen: IslandId; onChoose: (id: IslandId) => void; including: string }) {
  const scroll = useRef<ScrollViewInstance>(null);
  const spots = useRef(new Map<IslandId, { x: number; width: number }>());
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const spot = spots.current.get(chosen);
    if (spot && width > 0) scroll.current?.scrollTo({ x: Math.max(0, spot.x + spot.width / 2 - width / 2), animated: true });
  }, [chosen, width]);
  return <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={styles.pillsScroll} contentContainerStyle={styles.pills}>
    {pills.map((pill) => {
      const selected = pill.id === chosen;
      return <Pressable key={pill.id} accessibilityRole="button" accessibilityState={{ selected }}
        accessibilityLabel={`${pill.name}${pill.count ? `, ${pill.count} species` : ''}${pill.id === HOME_ISLAND ? including : ''}. ${selected ? 'Showing this island' : 'Show this island'}`}
        onLayout={(e) => { spots.current.set(pill.id, { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width }); }}
        onPress={() => onChoose(pill.id)} style={({ pressed }) => [styles.island, selected && styles.islandChosen, { opacity: pressed ? 0.7 : 1 }]}>
        <View style={[styles.areaDot, { backgroundColor: pill.color }]} />
        <Text style={styles.areaName}>{pill.name}</Text>
        {pill.count > 0 && <Text style={styles.areaCount}>{pill.count}</Text>}
      </Pressable>;
    })}
  </ScrollView>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerButtons: { flexDirection: 'row', gap: 8 },
  islandCard: { padding: 8, paddingBottom: 14, gap: 12 },
  mount: { borderWidth: 1, borderRadius: Radius.md + 4, padding: 3 },
  hero: { borderRadius: Radius.md, overflow: 'hidden' },
  heroHeader: { paddingHorizontal: 14, paddingTop: 10, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  heroButtons: { flexDirection: 'row', gap: 8 },
  motionButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 1, borderColor: 'rgba(31,75,64,0.18)', alignItems: 'center', justifyContent: 'center' },
  heroFooter: { paddingHorizontal: 16, paddingBottom: 20, gap: 4, alignItems: 'center' },
  homeName: { color: ON_WATER, fontSize: 24, lineHeight: 30, fontFamily: Type.display, textAlign: 'center' },
  nameRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, maxWidth: '100%' },
  nameText: { flexShrink: 1 },
  sceneHint: { color: ON_WATER, fontSize: 14, lineHeight: 20, fontFamily: Type.body, textAlign: 'center', marginTop: 2 },
  // Over the island's water just above its name, like the explorer's hint; it takes no room, so nothing moves when it goes.
  tip: { position: 'absolute', top: -44, left: 0, right: 0, alignItems: 'center' },
  tipText: { color: ON_WATER, fontSize: 14, lineHeight: 20, fontFamily: Type.bodySemiBold, textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.65)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, overflow: 'hidden' },
  firstDive: { alignSelf: 'stretch', marginTop: 14 },
  // Only Home's island so far: its name and count as plain text, since there is nothing to choose.
  areas: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10 },
  // Pills, an island each, are what can be tapped; anything with no border is only said.
  pillsScroll: { alignSelf: 'stretch', flexGrow: 0, marginHorizontal: -16, marginTop: 10 },
  pills: { flexGrow: 1, justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  island: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 1, borderColor: 'rgba(31,75,64,0.18)' },
  islandChosen: { backgroundColor: '#FFFFFF', borderColor: ON_WATER, borderWidth: 1.5 },
  areaDot: { width: 8, height: 8, borderRadius: 4 },
  areaName: { color: ON_WATER, fontSize: 13, fontFamily: Type.bodySemiBold },
  areaCount: { color: ON_WATER, fontSize: 13, fontFamily: Type.bodyHeavy },
  progress: { paddingHorizontal: 8, gap: 8 },
  progressHeading: { flexDirection: 'row', gap: 10, alignItems: 'baseline' },
  progressCount: { fontFamily: Type.bodyHeavy, fontSize: 14 },
  textButton: { minHeight: 44, justifyContent: 'center' },
  residentsScroll: { marginHorizontal: -Spacing.three, flexGrow: 0 },
  residents: { gap: 10, paddingHorizontal: Spacing.three, paddingVertical: 2 },
  nextPage: { gap: 8 },
  // The tab bar's raised button logs too: this one is only the page's own way in, so it is not the loudest thing on it.
  logButton: { minHeight: 48, paddingVertical: 8 },
  milestone: { textAlign: 'center' },
});
