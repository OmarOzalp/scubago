import { useMemo, useState } from 'react';
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
import { SpeciesCard } from '@/components/species-card';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useDiscoveryMoments } from '@/hooks/use-discovery-moments';
import { useHomePreferences } from '@/hooks/use-home-preferences';
import { useSceneActive } from '@/hooks/use-scene-active';
import { useTheme } from '@/hooks/use-theme';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { formatDiveNumber, milestoneName, nextMilestone } from '@/lib/dives';
import { deriveHome, HABITATS, HOME_STAGES } from '@/lib/home';
import { useAppStore, useMyDives, useMySightings, useMyUserId, useNextDiveNumber } from '@/lib/store';
import { noneSwim, type MarineModel } from '@/lib/swimming';

/** Ink on the island's water (the scene's own colours, the same in both schemes). */
const ON_WATER = '#1F4B40';

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
  const pages = useMyDives().length;
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
  const habitat = HABITATS.find((h) => h.id === saved.preferences.habitat)!;
  const count = home.residents.length;
  const loading = !ready || saved.loading || moments.loading;
  // Only the diver's own discoveries swim here (the showcase build, for development, brings visitors).
  const inspect = (model: MarineModel) => router.push({ pathname: '/inspect', params: { model, preview: '1' } });
  const sceneHint = count === 0
    ? 'Your ocean is empty for now. Log a sighting and that animal comes to live here.'
    : noneSwim(home.residents)
      ? `Your ${count === 1 ? 'species isn’t' : `${count} species aren’t`} drawn for the island yet. Sharks, rays, reef fish and some turtles, dolphins and octopuses swim here; the rest live in your field guide.`
      : 'Tap a swimming resident to revisit your discovery';
  return <View style={[styles.root, { backgroundColor: theme.background }]}>
    <Screen tab>
      <ScreenHeader
        eyebrow="Growing with every dive"
        title="Your ocean"
        accessory={<IconButton icon="edit" accessibilityLabel="Customize your home" onPress={() => !loading && setEditing(true)} style={{ opacity: loading ? 0.4 : 1 }} />}
      />

      {/* The island, mounted like a print on the page with a fine ink frame. */}
      <Paper raised padded={false} style={styles.islandCard}>
        <View style={[styles.mount, { borderColor: theme.text }]}>
          <View style={[styles.hero, { backgroundColor: WATER[habitat.id] }]}>
            <View style={styles.heroHeader}>
              <View style={styles.pill}><View style={styles.liveDot} /><Text style={styles.pillText}>YOUR SANCTUARY</Text></View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={paused ? 'Resume ocean animation' : 'Pause ocean animation'}
                onPress={() => setPaused((value) => !value)}
                style={({ pressed }) => [styles.motionButton, { opacity: pressed ? 0.7 : 1 }]}>
                <Icon name={paused ? 'play' : 'pause'} size={20} color={ON_WATER} wash="#FFFFFF" washOpacity={0.6} />
              </Pressable>
            </View>
            <SanctuaryScene habitat={habitat.id} level={moments.level} residents={home.residents} loading={loading} paused={paused || editing || loading} onInspect={inspect}
              moments={{ featured: moments.featured, waiting: moments.waiting, now: moments.now, onArrived: moments.onArrived, tag: moments.tag, banner: moments.banner, note: moments.note, busy: moments.busy }} />
            <View style={styles.heroFooter}>
              <Text style={styles.homeName}>{saved.preferences.name}</Text>
              <Text style={styles.heroSubtitle}>{loading ? habitat.name : `${habitat.name}  ·  ${home.stage.place}`}</Text>
              <Text style={styles.sceneHint}>{loading ? ' ' : sceneHint}</Text>
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

      <SectionHeader
        title="Life around you"
        accessory={<Pressable accessibilityRole="link" accessibilityLabel="Your field guide" onPress={() => router.push('/field-guide')} style={styles.textButton}><ThemedText type="smallBold" themeColor="tint">Field guide ›</ThemedText></Pressable>}
      />
      {count > 0 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.residentsScroll} contentContainerStyle={styles.residents}>
        {home.residents.map((entry) => <SpeciesCard key={entry.species.id} species={entry.species} width={124} count={entry.count} onPress={() => router.push(`/species/${entry.species.id}`)} />)}
      </ScrollView> : <View style={[styles.empty, { borderColor: theme.rule }]}>
        <ThemedText type="heading" style={{ textAlign: 'center' }}>A quiet ocean. A world to discover.</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', maxWidth: 280 }}>Log the marine life you meet, and watch your little home come alive.</ThemedText>
      </View>}

      {/* The next page of the logbook, by its number. */}
      <View style={styles.nextPage}>
        <View style={styles.nextHead} accessible accessibilityLabel={`Next in your logbook: dive ${nextNumber}. ${logLine}`}>
          <ThemedText type="label">Next in your logbook</ThemedText>
          <View style={styles.nextLine}>
            <Text style={[styles.nextNumber, { color: theme.text }]}>{formatDiveNumber(nextNumber)}</Text>
            <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>{logLine}</ThemedText>
          </View>
        </View>
        <OceanButton title={`Begin entry ${formatDiveNumber(nextNumber)}`} variant="log" icon="plus" accessibilityLabel={`Log a dive, entry ${nextNumber}`} onPress={() => router.push('/log/new')} />
      </View>

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

const styles = StyleSheet.create({
  root: { flex: 1 },
  islandCard: { padding: 8, paddingBottom: 14, gap: 12 },
  mount: { borderWidth: 1, borderRadius: Radius.md + 4, padding: 3 },
  hero: { borderRadius: Radius.md, overflow: 'hidden' },
  heroHeader: { paddingHorizontal: 14, paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2E8B6F' },
  pillText: { color: ON_WATER, letterSpacing: 1.4, fontSize: 12, fontFamily: Type.label },
  motionButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 1, borderColor: 'rgba(31,75,64,0.18)', alignItems: 'center', justifyContent: 'center' },
  heroFooter: { paddingHorizontal: 16, paddingBottom: 20, gap: 4, alignItems: 'center' },
  homeName: { color: ON_WATER, fontSize: 24, lineHeight: 30, fontFamily: Type.display, textAlign: 'center' },
  heroSubtitle: { color: ON_WATER, fontSize: 14, lineHeight: 20, fontFamily: Type.bodySemiBold, textAlign: 'center' },
  sceneHint: { color: ON_WATER, fontSize: 13, lineHeight: 18, fontFamily: Type.body, textAlign: 'center', marginTop: 6 },
  progress: { paddingHorizontal: 8, gap: 8 },
  progressHeading: { flexDirection: 'row', gap: 10, alignItems: 'baseline' },
  progressCount: { fontFamily: Type.bodyHeavy, fontSize: 14 },
  textButton: { minHeight: 44, justifyContent: 'center' },
  residentsScroll: { marginHorizontal: -Spacing.three, flexGrow: 0 },
  residents: { gap: 10, paddingHorizontal: Spacing.three, paddingVertical: 2 },
  empty: { borderWidth: 1.5, borderStyle: 'dashed', padding: 22, alignItems: 'center', gap: 8, borderRadius: Radius.lg },
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
