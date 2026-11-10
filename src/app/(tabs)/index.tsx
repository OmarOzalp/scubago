import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { router } from 'expo-router';
import { HomeEditor } from '@/components/home/home-editor';
import { useOceanAhead } from '@/components/home/ocean-ahead';
import { useTip } from '@/components/home/use-tip';
import { SanctuaryScene } from '@/components/home/sanctuary-scene';
import { WATER } from '@/components/home/three/sanctuary-environment';
import { Icon } from '@/components/icon';
import { Disclosure } from '@/components/journal/disclosure';
import { ShareArchipelagoButton } from '@/components/share/share-buttons';
import { CARD_GAP, SpeciesCard } from '@/components/species-card';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip, ChipRow } from '@/components/ui/chip';
import { IconButton } from '@/components/ui/icon-button';
import { ProgressBar } from '@/components/ui/progress';
import { Screen, ScreenTitle, Section } from '@/components/ui/screen';
import { OnWater, Radius, Size, Space, TypeScale } from '@/constants/theme';
import { useDiscoveryMoments } from '@/hooks/use-discovery-moments';
import { useHomePreferences } from '@/hooks/use-home-preferences';
import { useSceneActive } from '@/hooks/use-scene-active';
import { useTheme } from '@/hooks/use-theme';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { milestoneName, nextMilestone } from '@/lib/dives';
import { AREAS, foundAreas, foundIslands, HOME_ISLAND, ISLANDS, isIsland, islandOf, islandResidents, type IslandId } from '@/lib/archipelago';
import { deriveHome } from '@/lib/home';
import { useAppStore, useMyDives, useMySightings, useMyUserId, useNextDiveNumber } from '@/lib/store';
import { macroResidents } from '@/lib/macro-life';
import { captureScene, HERO_SNAPSHOT } from '@/lib/scene-snapshot';
import { noneSwim, type MarineModel } from '@/lib/swimming';

/** The one-time tip over the island (use-tip.ts): stored once it has been shown, and taken down after this long. */
const HOME_TIP_KEY = 'scubago.homeTipSeen.v1';
const HOME_TIP_MS = 10000;
/** How many of the newest animals Home shows (the field guide has them all). */
const NEWEST = 8;
/** A newest animal's card: three and a bit across a phone, so the row says it scrolls. */
const RESIDENT_WIDTH = 104;

/** The share card's hero: a fresh picture of the island as it is on this card, or null (the card then draws its illustration). */
const captureHeroSnapshot = () => captureScene('home', HERO_SNAPSHOT);

export default function HomeScreen() {
  const theme = useTheme();
  const mine = useMySightings();
  const owner = useMyUserId();
  const ready = useAppStore((s) => s.ready);
  const home = useMemo(() => deriveHome(mine, CATALOG_BY_ID), [mine]);
  const saved = useHomePreferences(owner);
  const dives = useMyDives();
  const pages = dives.length;
  const screenReader = useScreenReader();
  const nextNumber = useNextDiveNumber();
  const ahead = nextMilestone(nextNumber);
  // "3 dives to your fiftieth", only when a milestone is close.
  const milestoneLine = ahead && ahead.remaining === 0
    ? `Your ${milestoneName(ahead.at)} dive is next`
    : ahead && ahead.remaining <= 5
      ? `${ahead.remaining + 1} dives to your ${milestoneName(ahead.at)}`
      : null;
  const [editing, setEditing] = useState(false);
  // New species arriving and level-ups, played when Home is on screen (see useDiscoveryMoments).
  const moving = useSceneActive(editing);
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
  // The shores of every island so far, for the card to have their shader programs ready before the pills visit them (warm-up.tsx).
  const shores = useMemo(() => islands.map((id) => ISLANDS[id]), [islands]);
  const here = useMemo(() => islandResidents(home.residents, island), [home.residents, island]);
  const loading = !ready || saved.loading || moments.loading;
  // Once the island is on show and the phone is idle, the explorer's ocean is made ready (ocean-ahead.ts), so opening it finds it there.
  useOceanAhead(home.level, islands, !loading && count > 0);
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
  // "2 more animals for a coral garden": one way to say progress (the bar says the figures to a screen reader).
  const more = home.next ? `${home.remaining} more ${home.remaining === 1 ? 'animal' : 'animals'} for ${home.next.reward.toLowerCase()}` : 'Your archipelago is flourishing';
  // The newest animals first (the collection itself, rarest first, is the field guide's).
  const newest = useMemo(() => [...home.residents].sort((a, b) => b.firstSeenOn.localeCompare(a.firstSeenOn)).slice(0, NEWEST), [home.residents]);
  // Home's island is named by the diver (a pencil beside the title renames it); any other island is named for its habitat.
  // (the island the card shows: on a switch to one still to build, the title changes as its picture does, not before: SanctuaryScene's onShown)
  const [drawn, setDrawn] = useState<string>(habitat);
  const titled = drawn === habitat ? island : islands.find((id) => ISLANDS[id] === drawn) ?? island;
  const title = titled === HOME_ISLAND ? saved.preferences.name : AREAS.find((a) => a.id === titled)!.name;
  return <View style={[styles.root, { backgroundColor: theme.background }]}>
    <Screen kind="tab">
      <ScreenTitle
        title={title}
        numberOfLines={2}
        accessory={titled === HOME_ISLAND && <Pressable accessibilityRole="button" accessibilityLabel="Rename your island" onPress={() => !loading && setEditing(true)}
          style={({ pressed }) => [styles.pencil, { opacity: loading ? 0.4 : pressed ? 0.6 : 1 }]}>
          <Icon name="edit" size={20} color={theme.textTertiary} />
        </Pressable>}
        actions={<>
          {!loading && <ShareArchipelagoButton name={saved.preferences.name} sightings={mine} dives={dives} ownerId={owner} captureSnapshot={captureHeroSnapshot} />}
          <IconButton icon="account" accessibilityLabel="You" onPress={() => router.push('/you')} />
        </>}
      />

      {/* The island, as big as the page is wide: tap it (or an animal on it) to explore. */}
      <View style={[styles.hero, { backgroundColor: WATER[habitat] }]}>
        <View>
          <SanctuaryScene habitat={habitat} level={moments.level} residents={here} loading={loading} paused={editing || loading} onInspect={inspect} onOpen={swimming ? explore : undefined} warm={shores} onShown={setDrawn}
            moments={{ featured: moments.featured, waiting: moments.waiting, now: moments.now, onArrived: moments.onArrived, tag: moments.tag, banner: moments.banner, note: moments.note, busy: moments.busy }} />
          {/* A screen reader can't tap the picture of the island: the whole island is one button for it. */}
          {swimming && screenReader && <Pressable accessibilityRole="button" accessibilityLabel="Explore your islands" onPress={explore} style={StyleSheet.absoluteFill} />}
        </View>
        <View style={styles.heroFooter}>
          {/* How to look around, said once over the island's water, where the animals are (it takes no room of its own). */}
          {tip.show && <View style={styles.tip} pointerEvents="none"><Text style={styles.tipText}>Tap an animal to meet it.</Text></View>}
          {loading ? <Text style={styles.sceneHint}> </Text> : sceneNote ? <Text style={styles.sceneHint}>{sceneNote}</Text> : null}
          {first && <Button title="Log your first dive" variant="log" icon="plus" onPress={() => router.push('/log/new')} style={styles.firstDive} />}
          {/* The archipelago so far: an island's pill shows it in the card; with only Home's, there is nothing to choose. */}
          {!loading && count > 0 && (islands.length > 1
            ? <IslandPills pills={pills} chosen={island} onChoose={setChosen} including={including} water={WATER[habitat]} />
            : <View style={styles.areas} accessible accessibilityLabel={`${pills[0].name}, ${pills[0].count} species${including}`}>
              <View style={[styles.areaDot, { backgroundColor: pills[0].color }]} />
              <Text style={styles.areaName}>{pills[0].name}</Text>
              <Text style={styles.areaCount}>{pills[0].count}</Text>
            </View>)}
        </View>
      </View>

      <View style={styles.progress}>
        {loading ? (
          <ThemedText type="subhead" themeColor="textSecondary">Loading your discoveries…</ThemedText>
        ) : (
          <>
            {/* The progress line is the way to the islands: which have risen, who lives there. */}
            <Card onPress={() => router.push('/rewards/islands')} accessibilityRole="link" accessibilityLabel={`${more}. Your islands`} accessibilityHint="Opens your islands" style={styles.progressCard}>
              <View style={styles.progressText}>
                <Text style={[TypeScale.subheadStrong, styles.flex, { color: theme.text }]}>{more}</Text>
                <Icon name="chevronRight" size={16} color={theme.textTertiary} weight="bold" />
              </View>
              <ProgressBar
                fraction={home.fraction}
                accessibilityLabel={home.next ? `${count} of ${home.next.at} species to ${home.next.reward.toLowerCase()}` : 'Every level reached'}
                max={home.next?.at ?? count}
                now={count}
              />
            </Card>
            {/* When nothing here can be seen swimming, what does swim, for anyone who wonders. */}
            {count > 0 && none && small === 0 && <Disclosure label="What swims here?" hint="Shows which animals the island draws">
              <ThemedText type="subhead" themeColor="textSecondary">Sharks, rays, reef fish and some turtles, dolphins and octopuses swim here. The rest live in your field guide.</ThemedText>
            </Disclosure>}
          </>
        )}
      </View>
      {!!saved.error && !editing && <ThemedText type="subhead" themeColor="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">{saved.error}</ThemedText>}

      {/* Nothing here until the first animal: the island above has already said it is empty. */}
      {count > 0 && <Section title="New on your island" action={{ label: 'Field guide', accessibilityLabel: 'Your field guide', onPress: () => router.push('/field-guide') }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="newest-animals" style={styles.residentsScroll} contentContainerStyle={styles.residents}>
          {newest.map((entry) => <SpeciesCard key={entry.species.id} species={entry.species} width={RESIDENT_WIDTH} count={entry.count} onPress={() => router.push(`/species/${entry.species.id}`)} />)}
        </ScrollView>
        {milestoneLine && <ThemedText type="footnote" themeColor="textSecondary" style={styles.milestone}>{milestoneLine}</ThemedText>}
      </Section>}
    </Screen>
    {editing && <HomeEditor key={owner} preferences={saved.preferences} saving={saved.saving} error={saved.error} onSave={saved.save} onClose={() => setEditing(false)} />}
  </View>;
}

/** Whether a screen reader is on (it can't tap the island's picture, so the island offers a button). */
function useScreenReader() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    void Promise.resolve(AccessibilityInfo.isScreenReaderEnabled?.()).then((value) => { if (live) setOn(!!value); }, () => {});
    const subscription = AccessibilityInfo.addEventListener?.('screenReaderChanged', setOn);
    return () => { live = false; subscription?.remove?.(); };
  }, []);
  return on;
}

/** One island of the archipelago, as a pill: its habitat's colour, its name, and how many of the diver's species swim there. */
type Pill = { id: IslandId; name: string; color: string; count: number };

/**
 * The islands the diver has found, as one row of pills to choose from. It scrolls sideways (there can
 * be five, and wrapping them took the card's height), and brings the chosen island's pill to the
 * middle, as a new discovery arrives at its island without the diver touching a pill.
 */
function IslandPills({ pills, chosen, onChoose, including, water }: { pills: Pill[]; chosen: IslandId; onChoose: (id: IslandId) => void; including: string; water: string }) {
  const scroll = useRef<ScrollViewInstance>(null);
  const spots = useRef(new Map<IslandId, { x: number; width: number }>());
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const spot = spots.current.get(chosen);
    if (spot && width > 0) scroll.current?.scrollTo({ x: Math.max(0, spot.x + spot.width / 2 - width / 2), animated: true });
  }, [chosen, width]);
  return <ChipRow ref={scroll} centered fade={water} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={styles.pills}>
    {pills.map((pill) => {
      const selected = pill.id === chosen;
      // Over the scene's water, which is the same in both schemes: the chips are drawn light in both.
      return <Chip key={pill.id} scheme="light" label={pill.name} dot={pill.color} count={pill.count > 0 ? pill.count : undefined} selected={selected}
        accessibilityLabel={`${pill.name}${pill.count ? `, ${pill.count} species` : ''}${pill.id === HOME_ISLAND ? including : ''}. ${selected ? 'Showing this island' : 'Show this island'}`}
        onLayout={(e) => { spots.current.set(pill.id, { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width }); }}
        onPress={() => onChoose(pill.id)} />;
    })}
  </ChipRow>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  // The pencil belongs to the title: 44 to hit, drawn small and quiet beside it.
  pencil: { width: Size.hit, height: Size.hit, alignItems: 'center', justifyContent: 'center', marginVertical: -4 },
  // As wide as the page: no frame round the island.
  hero: { marginHorizontal: -Space.s4, overflow: 'hidden' },
  heroFooter: { paddingHorizontal: Space.s4, paddingBottom: Space.s5, gap: Space.s1, alignItems: 'center' },
  sceneHint: { ...TypeScale.subhead, color: OnWater.ink, textAlign: 'center', marginTop: 2 },
  // Over the island's water just above its name, like the explorer's hint; it takes no room, so nothing moves when it goes.
  tip: { position: 'absolute', top: -44, left: 0, right: 0, alignItems: 'center' },
  tipText: { ...TypeScale.subheadStrong, color: OnWater.ink, textAlign: 'center', backgroundColor: OnWater.veil, paddingHorizontal: Space.s3, paddingVertical: 6, borderRadius: Radius.pill, overflow: 'hidden' },
  firstDive: { alignSelf: 'stretch', marginTop: Space.s3 },
  // Only Home's island so far: its name and count as plain text, since there is nothing to choose.
  areas: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: Space.s2, minHeight: Size.chip },
  pills: { alignSelf: 'stretch', marginTop: Space.s2 },
  areaDot: { width: 8, height: 8, borderRadius: Radius.pill },
  areaName: { ...TypeScale.footnoteStrong, color: OnWater.ink },
  areaCount: { ...TypeScale.footnote, color: OnWater.ink },
  progress: { gap: Space.s2 },
  progressCard: { gap: Space.s3, minHeight: Size.hit },
  progressText: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // The cards reach the screen's edges as they scroll; 8 above them leaves room for a "New" tag over a tile's corner.
  residentsScroll: { marginHorizontal: -Space.s4, flexGrow: 0 },
  residents: { gap: CARD_GAP, paddingHorizontal: Space.s4, paddingTop: Space.s2 },
  milestone: { textAlign: 'center' },
});
