import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SpeciesPhoto } from '@/components/species-photo';
import { HomeEditor } from '@/components/home/home-editor';
import { IntroCards, useIntro } from '@/components/intro-cards';
import { SanctuaryScene } from '@/components/home/sanctuary-scene';
import { WATER } from '@/components/home/three/sanctuary-environment';
import { useDiscoveryMoments } from '@/hooks/use-discovery-moments';
import { useHomePreferences } from '@/hooks/use-home-preferences';
import { useSceneActive } from '@/hooks/use-scene-active';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { deriveHome, HABITATS, HOME_STAGES } from '@/lib/home';
import { useAppStore, useMySightings, useMyUserId } from '@/lib/store';
import { showsPreview, type MarineModel } from '@/lib/swimming';
import { BottomTabInset } from '@/constants/theme';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === 'dark';
  // muted: 5.4:1 on the light background (was 3.9:1), 7:1 on the dark one.
  const colors = dark ? { bg: '#142620', ink: '#E0E9D9', muted: '#A3B9AA', card: '#21372D', border: '#344D3E' } : { bg: '#F6F7F0', ink: '#254C40', muted: '#56695D', card: '#FFFFFF', border: '#DEE5D9' };
  const intro = useIntro();
  const backendEnabled = useAppStore((s) => s.backendEnabled);
  const mine = useMySightings();
  const owner = useMyUserId();
  const ready = useAppStore((s) => s.ready);
  const home = useMemo(() => deriveHome(mine, CATALOG_BY_ID), [mine]);
  const saved = useHomePreferences(owner);
  const [editing, setEditing] = useState(false);
  const [paused, setPaused] = useState(false);
  // New species arriving and level-ups, played when My Home is on screen (see useDiscoveryMoments).
  const moving = useSceneActive(paused || editing);
  const moments = useDiscoveryMoments({ owner, ready, residents: home.residents, sightings: mine, level: home.level, animate: moving });
  const habitat = HABITATS.find((h) => h.id === saved.preferences.habitat)!;
  const count = home.residents.length;
  const loading = !ready || saved.loading || moments.loading;
  const preview = !loading && showsPreview(home.residents);
  const inspect = (model: MarineModel) => router.push({ pathname: '/inspect', params: { model, preview: '1' } });
  // A preview with species logged means none of them has island art yet: say so, rather than "not your collection".
  const previewHint = count
    ? `Your ${count === 1 ? 'species doesn’t' : `${count} species don’t`} swim on the island yet: sharks, rays, reef fish and some turtles, dolphins and octopuses do. Until one arrives, a whale shark and reef manta are visiting.`
    : 'A whale shark and reef manta are visiting. Your first discovery makes these waters yours.';
  return <View style={[styles.root, { backgroundColor: colors.bg }]}>
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 22, paddingBottom: BottomTabInset + insets.bottom + 28 }]}>
      <View style={styles.header}>
        <View style={{ gap: 5 }}><Text style={[styles.eyebrow, { color: colors.muted }]}>YOUR OCEAN, GROWING WITH YOU</Text><Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>My Home</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Customize your home" disabled={loading} onPress={() => setEditing(true)} style={[styles.edit, { borderColor: colors.border, opacity: loading ? .4 : 1 }]}><Text style={{ color: colors.ink, fontSize: 14, fontWeight: '500' }}>Customize ↗</Text></Pressable>
      </View>

      <View style={[styles.hero, { backgroundColor: WATER[habitat.id] }]}>
        <View style={styles.heroHeader}><View style={styles.pill}><View style={[styles.liveDot, preview && styles.previewDot]} /><Text style={styles.pillText}>{preview ? (count ? 'VISITORS FOR NOW' : 'PREVIEW') : 'YOUR SANCTUARY'}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={paused ? 'Resume ocean animation' : 'Pause ocean animation'} accessibilityState={{ selected: paused }} onPress={() => setPaused((value) => !value)} style={styles.motionButton}><Text style={styles.motionText}>{paused ? 'Play' : 'Pause'}</Text></Pressable>
        </View>
        <SanctuaryScene habitat={habitat.id} level={moments.level} residents={home.residents} loading={loading} paused={paused || editing || loading} onInspect={inspect}
          moments={{ featured: moments.featured, waiting: moments.waiting, now: moments.now, onArrived: moments.onArrived, tag: moments.tag, banner: moments.banner, note: moments.note, busy: moments.busy }} />
        <View style={styles.heroFooter}><Text style={styles.homeName}>{saved.preferences.name}</Text><Text style={styles.heroSubtitle}>{loading ? habitat.name : `${habitat.name}  ·  ${home.stage.place}`}</Text>
          <Text style={styles.sceneHint}>{loading ? ' ' : preview ? previewHint : 'Tap a swimming resident to revisit your discovery'}</Text>
          {preview && <View style={styles.previewRow}>
            {([['whale-shark', 'Whale shark'], ['reef-manta', 'Reef manta']] as const).map(([model, name]) => <Pressable key={model} accessibilityRole="button" accessibilityLabel={`Take a closer look at the ${name.toLowerCase()} preview`} onPress={() => inspect(model)} style={({ pressed }) => [styles.previewButton, { opacity: pressed ? .7 : 1 }]}><Text style={styles.previewButtonText}>{name} ↗</Text></Pressable>)}
          </View>}
        </View>
      </View>
      {!!saved.error && !editing && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: dark ? '#E6A495' : '#A43F36' }}>{saved.error}</Text>}

      <View style={[styles.rankCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.rankTop}>
          <View accessible accessibilityLabel={loading ? 'Level loading' : `Level ${home.level}`} style={[styles.levelBadge, { backgroundColor: dark ? '#344D3E' : '#ECF1E5' }]}><Text style={[styles.levelSmall, { color: colors.muted }]}>LEVEL</Text><Text style={[styles.levelNumber, { color: colors.ink }]}>{loading ? '–' : home.level.toString().padStart(2, '0')}</Text></View>
          <View style={{ flex: 1, gap: 4 }}><Text style={[styles.rankName, { color: colors.ink }]}>{loading ? 'Your explorer journey' : home.stage.rank}</Text><Text style={[styles.body, { color: colors.muted }]}>{loading ? 'Loading your discoveries…' : `${count} species discovered · ${home.sightingCount} sightings`}</Text></View>
          <Text importantForAccessibility="no" accessibilityElementsHidden style={[styles.rankMark, { color: colors.muted }]}>✧</Text>
        </View>
        {!loading && <>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.progressHeading}><Text style={[styles.nextLabel, { color: colors.ink }]}>{home.next ? `Next: ${home.next.reward.toLowerCase()}` : 'Your archipelago is flourishing'}</Text><Text style={[styles.body, { color: colors.muted }]}>{home.next ? `${count} / ${home.next.at}` : 'Level 6'}</Text></View>
          <View accessibilityRole="progressbar" accessibilityLabel="Progress to your next island expansion" accessibilityValue={{ min: 0, max: 100, now: Math.round(home.fraction * 100) }} style={[styles.track, { backgroundColor: dark ? '#344D3E' : '#EAF0E5' }]}><View style={[styles.fill, { width: `${home.fraction * 100}%` }]} /></View>
          <Text style={[styles.body, { color: colors.muted }]}>{home.next ? `${home.remaining} new species to grow your home a little more.` : 'Every new discovery adds another story to your ocean.'}</Text>
        </>}
      </View>

      <View style={styles.sectionHeader}><Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.ink }]}>Life around you</Text><Pressable accessibilityRole="button" accessibilityLabel="Your collection" onPress={() => router.push('/logbook')} style={styles.textButton}><Text style={[styles.link, { color: colors.muted }]}>Collection ↗</Text></Pressable></View>
      {count > 0 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.residents}>
        {home.residents.map(({ species }) => <Pressable key={species.id} accessibilityRole="button" accessibilityLabel={`View ${species.commonName}`} onPress={() => router.push(`/species/${species.id}`)} style={[styles.residentCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SpeciesPhoto species={species} /><Text numberOfLines={2} style={[styles.residentName, { color: colors.ink }]}>{species.commonName}</Text>
        </Pressable>)}
      </ScrollView> : <View style={[styles.empty, { borderColor: colors.border }]}><Text style={[styles.emptyTitle, { color: colors.ink }]}>A quiet ocean. A world to discover.</Text><Text style={[styles.body, { color: colors.muted, textAlign: 'center', maxWidth: 270 }]}>Log the marine life you meet, and watch your little home come alive.</Text></View>}

      <Pressable accessibilityRole="button" accessibilityLabel="Log a discovery" onPress={() => router.push('/log/new')} style={({ pressed }) => [styles.logButton, { opacity: pressed ? .8 : 1 }]}><Text style={styles.logText}>＋  Log a discovery</Text><Text style={styles.logArrow} importantForAccessibility="no">↗</Text></Pressable>
      <View style={styles.journeyHeader}><Text style={[styles.eyebrow, { color: colors.muted }]}>A LITTLE MORE OCEAN, EVERY TIME</Text></View>
      <View style={styles.journey}>
        {/* Reached stages get a tick as well as the darker dot, so it isn't told by colour alone. */}
        {HOME_STAGES.map((stage, index) => {
          const reached = !loading && home.level > index;
          return <View key={stage.at} style={styles.journeyStep} accessible accessibilityLabel={`Level ${index + 1}, ${stage.at} species${reached ? ', reached' : ''}`}><View style={[styles.journeyDot, { backgroundColor: reached ? '#3F6B4C' : colors.border }]}><Text style={{ color: reached ? '#FFFFFF' : colors.ink, fontSize: 12, fontWeight: '600' }}>{reached ? '✓' : index + 1}</Text></View><Text style={[styles.journeyCount, { color: colors.muted }]}>{stage.at} species</Text></View>;
        })}
      </View>
      <Text style={[styles.footnote, { color: colors.muted }]}>A collection journey, one encounter at a time.</Text>
    </ScrollView>
    {editing && <HomeEditor key={owner} preferences={saved.preferences} saving={saved.saving} error={saved.error} onSave={saved.save} onClose={() => setEditing(false)} />}
    <IntroCards visible={intro.show} onDone={intro.done} syncAvailable={backendEnabled} />
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1 }, content: { paddingHorizontal: 22, width: '100%', maxWidth: 650, alignSelf: 'center', gap: 22 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  eyebrow: { fontSize: 12, letterSpacing: 1.4, fontWeight: '600' }, title: { fontSize: 34, fontWeight: '500', letterSpacing: -1.3 }, edit: { borderWidth: 1, borderRadius: 30, minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' },
  hero: { borderRadius: 28, overflow: 'hidden' }, heroHeader: { paddingHorizontal: 19, paddingTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6 }, liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#4E8771' }, pillText: { color: '#1F4B40', letterSpacing: 1.4, fontSize: 12, fontWeight: '700' },
  motionButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' }, motionText: { fontSize: 14, fontWeight: '600', color: '#1F4B40' }, loading: { height: 310, alignItems: 'center', justifyContent: 'center', gap: 16 },
  previewDot: { backgroundColor: '#C98A3A' }, previewRow: { flexDirection: 'row', gap: 8, marginTop: 10 }, previewButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: 'rgba(255,255,255,.7)', justifyContent: 'center' }, previewButtonText: { color: '#1F4B40', fontSize: 14, fontWeight: '600' },
  heroFooter: { paddingHorizontal: 16, paddingBottom: 24, gap: 5, alignItems: 'center' }, homeName: { color: '#1F4B40', fontSize: 25, letterSpacing: -.7, fontWeight: '500', textAlign: 'center' }, heroSubtitle: { color: '#1F4B40', fontSize: 14, textAlign: 'center', lineHeight: 20 }, sceneHint: { color: '#1F4B40', fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 8 },
  rankCard: { padding: 18, borderRadius: 21, borderWidth: 1, gap: 12 }, rankTop: { flexDirection: 'row', alignItems: 'center', gap: 14 }, levelBadge: { minWidth: 56, minHeight: 60, paddingHorizontal: 4, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 2 }, levelSmall: { fontSize: 11, letterSpacing: 1, fontWeight: '700' }, levelNumber: { fontSize: 25, fontWeight: '500' }, rankName: { fontSize: 18, fontWeight: '500', letterSpacing: -.4 }, rankMark: { fontSize: 32 }, body: { fontSize: 14, lineHeight: 20 }, divider: { height: 1, marginVertical: 1 }, progressHeading: { flexDirection: 'row', gap: 10, justifyContent: 'space-between' }, nextLabel: { fontSize: 14, fontWeight: '600', flex: 1 }, track: { height: 5, borderRadius: 3, overflow: 'hidden' }, fill: { height: '100%', backgroundColor: '#81A37A', borderRadius: 3 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: -12 }, sectionTitle: { fontSize: 20, fontWeight: '500', letterSpacing: -.5 }, textButton: { minHeight: 44, justifyContent: 'center' }, link: { fontSize: 14, fontWeight: '600' },
  residents: { gap: 10 }, residentCard: { width: 112, minHeight: 116, borderRadius: 17, borderWidth: 1, padding: 10, alignItems: 'center', justifyContent: 'center', gap: 8 }, residentName: { fontSize: 12, lineHeight: 16, textAlign: 'center' }, empty: { borderWidth: 1, borderStyle: 'dashed', padding: 23, alignItems: 'center', gap: 8, borderRadius: 18 }, emptyTitle: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  logButton: { borderRadius: 17, backgroundColor: '#285E4E', minHeight: 56, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, logText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' }, logArrow: { color: '#CDDECE', fontSize: 20 }, journeyHeader: { alignItems: 'center', marginTop: 10 }, journey: { flexDirection: 'row', justifyContent: 'space-between' }, journeyStep: { alignItems: 'center', gap: 8 }, journeyDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, journeyCount: { fontSize: 12 }, footnote: { fontSize: 13, textAlign: 'center', marginTop: -4 },
});
