import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { HomeEditor } from '@/components/home/home-editor';
import { IntroCards, useIntro } from '@/components/intro-cards';
import { SanctuaryScene } from '@/components/home/sanctuary-scene';
import { WATER } from '@/components/home/three/sanctuary-environment';
import { Icon } from '@/components/icon';
import { IconButton } from '@/components/journal/icon-button';
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
import { deriveHome, HOME_STAGES } from '@/lib/home';
import { useAppStore, useMyDives, useMySightings, useMyUserId, useNextDiveNumber } from '@/lib/store';
import { macroResidents } from '@/lib/macro-life';
import { captureScene, HERO_SNAPSHOT } from '@/lib/scene-snapshot';
import { noneSwim, type MarineModel } from '@/lib/swimming';

/** Ink on the island's water (the scene's own colours, the same in both schemes). */
const ON_WATER = '#1F4B40';

/** The share card's hero: a fresh picture of the island as it is on this card, or null (the card then draws its illustration). */
const captureHeroSnapshot = () => captureScene('home', HERO_SNAPSHOT);

export default function HomeScreen() {
  const theme = useTheme();
  const intro = useIntro();
  const backendEnabled = useAppStore((s) => s.backendEnabled);
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
  // "Two dives to your fiftieth" when a milestone is close; otherwise what the log holds.
  const logLine = ahead && ahead.remaining === 0
    ? `Your ${milestoneName(ahead.at)} dive is next`
    : ahead && ahead.remaining <= 5
      ? `${ahead.remaining + 1} dives to your ${milestoneName(ahead.at)}`
      : pages === 0
        ? 'Your first page is waiting'
        : `${nextNumber - 1} dives in your log`;
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
  const islandsToRaise = Object.keys(ISLANDS).length - islands.length;
  const [chosen, setChosen] = useState<IslandId>(HOME_ISLAND);
  const arrivingAt = moments.now ? islandOf(moments.now) : null;
  const [arrived, setArrived] = useState(arrivingAt);
  if (arrivingAt !== arrived) { setArrived(arrivingAt); if (arrivingAt) setChosen(arrivingAt); }
  const island = islands.includes(chosen) ? chosen : HOME_ISLAND, habitat = ISLANDS[island];
  const here = useMemo(() => islandResidents(home.residents, island), [home.residents, island]);
  const islandName = AREAS.find((a) => a.id === island)!.name;
  const loading = !ready || saved.loading || moments.loading;
  // Only the diver's own discoveries swim here (the showcase build, for development, brings visitors).
  const inspect = (model: MarineModel) => router.push({ pathname: '/inspect', params: { model, preview: '1' } });
  // Something swims here, or small life lives on the reef (seen only up close, full screen): there is something to explore.
  const small = macroResidents(here).length, none = noneSwim(here);
  const swimming = !loading && here.length > 0 && (!none || small > 0);
  // The island full screen, to zoom in on and look around (src/app/explore.tsx): the button, or a tap on the island.
  const explore = () => router.push(island === HOME_ISLAND ? '/explore' : { pathname: '/explore', params: { island } });
  // A first run (no page, no animal yet): the hero holds the way in, and says the ocean is empty once.
  const first = !loading && pages === 0 && count === 0;
  const sceneHint = count === 0
    ? first
      ? 'Your ocean is empty for now. The animals you meet on your first dive come to live here.'
      : 'Your ocean is empty for now. Log a dive with the animals you saw, and they come to live here.'
    : none && small > 0
      ? `${small === 1 ? 'Your small creature lives' : `Your ${small} small creatures live`} on the reef, too small to see from here: tap the island to go full screen and zoom in close to find ${small === 1 ? 'it' : 'them'}.`
      : none
        ? `Your ${count === 1 ? 'species isn’t' : `${count} species aren’t`} drawn for the island yet. Sharks, rays, reef fish and some turtles, dolphins and octopuses swim here, and small reef life lives up close in the full-screen view; the rest live in your field guide.`
        : small > 0
          ? 'Tap a swimming resident to revisit your discovery, or anywhere else to go full screen and find the small life on the reef'
          : 'Tap a swimming resident to revisit your discovery, or anywhere else to go full screen';
  return <View style={[styles.root, { backgroundColor: theme.background }]}>
    <Screen tab>
      <ScreenHeader
        eyebrow="Growing with every dive"
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
              <View style={styles.pill}><View style={styles.liveDot} /><Text style={styles.pillText}>YOUR SANCTUARY</Text></View>
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
              {/* Home's island is named by the diver (tap to rename); any other island is named for its habitat. */}
              {island === HOME_ISLAND
                ? <Pressable accessibilityRole="button" accessibilityLabel={`${saved.preferences.name}, your home`} accessibilityHint="Rename your home" onPress={() => !loading && setEditing(true)}
                  style={({ pressed }) => [styles.nameRow, { opacity: pressed ? 0.7 : 1 }]}>
                  <Text style={[styles.homeName, styles.nameText]}>{saved.preferences.name}</Text>
                  <Icon name="edit" size={18} color={ON_WATER} wash="#FFFFFF" washOpacity={0.6} />
                </Pressable>
                : <Text style={styles.homeName} accessibilityRole="header">{islandName}</Text>}
              <Text style={styles.heroSubtitle}>{loading ? ' ' : home.stage.place}</Text>
              <Text style={styles.sceneHint}>{loading ? ' ' : sceneHint}</Text>
              {first && <OceanButton title="Log your first dive" variant="log" icon="plus" onPress={() => router.push('/log/new')} style={styles.firstDive} />}
              {/* The archipelago so far: an island's pill shows it in the card; with only Home's, there is nothing to choose. */}
              {!loading && count > 0 && (islands.length > 1
                ? <IslandPills pills={pills} chosen={island} onChoose={setChosen} />
                : <View style={styles.areas} accessible accessibilityLabel={`${pills[0].name}, ${pills[0].count} species`}>
                  <View style={[styles.areaDot, { backgroundColor: pills[0].color }]} />
                  <Text style={styles.areaName}>{pills[0].name}</Text>
                  <Text style={styles.areaCount}>{pills[0].count}</Text>
                </View>)}
              {/* The species of areas with no island of their own are in Home's count, not pills of their own. */}
              {!loading && island === HOME_ISLAND && swimAtHome.length > 0 && <Text style={styles.swimAtHome}>
                Includes {swimAtHome.map(({ area, count: living }) => `${living} from ${area.name}`).join(' and ')}
              </Text>}
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
                {home.next
                  ? `${home.remaining} more new ${home.remaining === 1 ? 'species' : 'species'} to unlock ${home.next.reward.toLowerCase()}.`
                  : 'Your archipelago is flourishing. Every new discovery adds another story to your ocean.'}
              </ThemedText>
              {/* The same count as Rewards → Islands ("4 of 5 raised"). */}
              {count > 0 && <ThemedText type="small" themeColor="textSecondary">
                {islandsToRaise > 0 ? `${islands.length} of ${islands.length + islandsToRaise} islands raised · ${islandsToRaise} more to discover` : `All ${islands.length} islands raised`}
              </ThemedText>}
            </>
          )}
        </View>
      </Paper>
      {!!saved.error && !editing && <ThemedText type="small" themeColor="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">{saved.error}</ThemedText>}

      <Ledger
        bare
        items={[
          { value: loading ? '–' : String(count), label: 'Species' },
          { value: loading ? '–' : String(home.sightingCount), label: 'Sightings' },
          { value: loading ? '–' : String(sites), label: sites === 1 ? 'Site' : 'Sites' },
          { value: loading ? '–' : String(home.level).padStart(2, '0'), label: 'Level', accessibilityLabel: loading ? 'Level loading' : `Level ${home.level}` },
        ]}
      />

      {/* Nothing here until the first animal: the island above has already said the ocean is empty. */}
      {count > 0 && <>
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
        <View style={styles.nextHead} accessible accessibilityLabel={`Next in your logbook: dive ${nextNumber}. ${logLine}`}>
          <ThemedText type="label">Next in your logbook</ThemedText>
          <View style={styles.nextLine}>
            <Text style={[styles.nextNumber, { color: theme.text }]}>{formatDiveNumber(nextNumber)}</Text>
            <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>{logLine}</ThemedText>
          </View>
        </View>
        <OceanButton title={`Log dive ${formatDiveNumber(nextNumber)}`} variant="log" icon="plus" onPress={() => router.push('/log/new')} />
      </View>}

      <View style={styles.journeyHeader}><ThemedText type="label">Species to grow your island</ThemedText></View>
      <View style={styles.journey}>
        {/* Reached stages get a tick as well as the filled dot, so it isn't told by colour alone. */}
        {HOME_STAGES.map((stage, index) => {
          const reached = !loading && home.level > index;
          return <View key={stage.at} style={styles.journeyStep} accessible accessibilityLabel={`Level ${index + 1}, ${stage.at} species${reached ? ', reached' : ''}`}>
            <View style={[styles.journeyDot, reached ? { backgroundColor: theme.lagoon, borderColor: theme.lagoon } : { borderColor: theme.rule, backgroundColor: theme.backgroundElement }]}>
              {reached ? <Icon name="check" size={16} color="#FFFFFF" weight="bold" /> : <Text style={[styles.journeyNumber, { color: theme.text }]}>{index + 1}</Text>}
            </View>
            <Text style={[styles.journeyCount, { color: theme.textSecondary }]}>{stage.at}</Text>
          </View>;
        })}
      </View>
      <ThemedText type="caption" themeColor="textSecondary" style={{ textAlign: 'center', marginTop: -4 }}>A collection journey, one encounter at a time.</ThemedText>
    </Screen>
    {editing && <HomeEditor key={owner} preferences={saved.preferences} saving={saved.saving} error={saved.error} onSave={saved.save} onClose={() => setEditing(false)} />}
    <IntroCards visible={intro.show} onDone={intro.done} syncAvailable={backendEnabled} />
  </View>;
}

/** One island of the archipelago, as a pill: its habitat's colour, its name, and how many of the diver's species swim there. */
type Pill = { id: IslandId; name: string; color: string; count: number };

/**
 * The islands the diver has found, as one row of pills to choose from. It scrolls sideways (there can
 * be five, and wrapping them took the card's height), and brings the chosen island's pill to the
 * middle, as a new discovery arrives at its island without the diver touching a pill.
 */
function IslandPills({ pills, chosen, onChoose }: { pills: Pill[]; chosen: IslandId; onChoose: (id: IslandId) => void }) {
  const scroll = useRef<ScrollView>(null);
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
        accessibilityLabel={`${pill.name}${pill.count ? `, ${pill.count} species` : ''}. ${selected ? 'Showing this island' : 'Show this island'}`}
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
  heroHeader: { paddingHorizontal: 14, paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroButtons: { flexDirection: 'row', gap: 8 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2E8B6F' },
  pillText: { color: ON_WATER, letterSpacing: 1.4, fontSize: 12, fontFamily: Type.label },
  motionButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 1, borderColor: 'rgba(31,75,64,0.18)', alignItems: 'center', justifyContent: 'center' },
  heroFooter: { paddingHorizontal: 16, paddingBottom: 20, gap: 4, alignItems: 'center' },
  homeName: { color: ON_WATER, fontSize: 24, lineHeight: 30, fontFamily: Type.display, textAlign: 'center' },
  nameRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, maxWidth: '100%' },
  nameText: { flexShrink: 1 },
  heroSubtitle: { color: ON_WATER, fontSize: 14, lineHeight: 20, fontFamily: Type.bodySemiBold, textAlign: 'center' },
  sceneHint: { color: ON_WATER, fontSize: 13, lineHeight: 18, fontFamily: Type.body, textAlign: 'center', marginTop: 6 },
  firstDive: { alignSelf: 'stretch', marginTop: 14 },
  // Only Home's island so far: its name and count as plain text, since there is nothing to choose.
  areas: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10 },
  // Pills, an island each, are what can be tapped; anything with no border is only said.
  pillsScroll: { alignSelf: 'stretch', flexGrow: 0, marginHorizontal: -16, marginTop: 10 },
  pills: { flexGrow: 1, justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  island: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 1, borderColor: 'rgba(31,75,64,0.18)' },
  islandChosen: { backgroundColor: '#FFFFFF', borderColor: ON_WATER, borderWidth: 1.5 },
  swimAtHome: { color: ON_WATER, fontSize: 13, lineHeight: 18, fontFamily: Type.body, textAlign: 'center', marginTop: 8 },
  areaDot: { width: 8, height: 8, borderRadius: 4 },
  areaName: { color: ON_WATER, fontSize: 13, fontFamily: Type.bodySemiBold },
  areaCount: { color: ON_WATER, fontSize: 13, fontFamily: Type.bodyHeavy },
  progress: { paddingHorizontal: 8, gap: 8 },
  progressHeading: { flexDirection: 'row', gap: 10, alignItems: 'baseline' },
  progressCount: { fontFamily: Type.bodyHeavy, fontSize: 14 },
  textButton: { minHeight: 44, justifyContent: 'center' },
  residentsScroll: { marginHorizontal: -Spacing.three, flexGrow: 0 },
  residents: { gap: 10, paddingHorizontal: Spacing.three, paddingVertical: 2 },
  nextPage: { gap: 10 },
  nextHead: { gap: 2 },
  nextLine: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  nextNumber: { fontFamily: Type.display, fontSize: 26, lineHeight: 32 },
  journeyHeader: { alignItems: 'center', marginTop: 8 },
  journey: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  journeyStep: { alignItems: 'center', gap: 6 },
  journeyDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  journeyNumber: { fontFamily: Type.display, fontSize: 15 },
  journeyCount: { fontFamily: Type.bodyBold, fontSize: 12 },
});
