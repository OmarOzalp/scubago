import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CreatureArt } from '@/components/home/creature-art';
import { HomeEditor } from '@/components/home/home-editor';
import { IslandScene } from '@/components/home/island-scene';
import { useHomePreferences } from '@/hooks/use-home-preferences';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { deriveHome, HABITATS, HOME_STAGES } from '@/lib/home';
import { useAppStore, useMySightings, useMyUserId } from '@/lib/store';
import { BottomTabInset } from '@/constants/theme';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === 'dark';
  const colors = dark ? { bg: '#142620', ink: '#E0E9D9', muted: '#A3B9AA', card: '#21372D', border: '#344D3E' } : { bg: '#F6F7F0', ink: '#254C40', muted: '#6C8073', card: '#FFFFFF', border: '#DEE5D9' };
  const mine = useMySightings();
  const owner = useMyUserId();
  const ready = useAppStore((s) => s.ready);
  const home = useMemo(() => deriveHome(mine, CATALOG_BY_ID), [mine]);
  const saved = useHomePreferences(owner);
  const [editing, setEditing] = useState(false);
  const [paused, setPaused] = useState(false);
  const habitat = HABITATS.find((h) => h.id === saved.preferences.habitat)!;
  const count = home.residents.length;
  const loading = !ready || saved.loading;
  return <View style={[styles.root, { backgroundColor: colors.bg }]}>
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 22, paddingBottom: BottomTabInset + insets.bottom + 28 }]}>
      <View style={styles.header}>
        <View style={{ gap: 5 }}><Text style={[styles.eyebrow, { color: colors.muted }]}>YOUR OCEAN, GROWING WITH YOU</Text><Text style={[styles.title, { color: colors.ink }]}>My Home</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Customize your home" disabled={loading} onPress={() => setEditing(true)} style={[styles.edit, { borderColor: colors.border, opacity: loading ? .4 : 1 }]}><Text style={{ color: colors.ink, fontSize: 13, fontWeight: '500' }}>Customize ↗</Text></Pressable>
      </View>

      <View style={[styles.hero, { backgroundColor: habitat.water }]}>
        <View style={styles.heroHeader}><View style={styles.pill}><View style={styles.liveDot} /><Text style={styles.pillText}>YOUR SANCTUARY</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={paused ? 'Resume ocean animation' : 'Pause ocean animation'} accessibilityState={{ selected: paused }} onPress={() => setPaused((value) => !value)} style={styles.motionButton}><Text style={styles.motionText}>{paused ? 'Play' : 'Pause'}</Text></Pressable>
        </View>
        {loading ? <View style={styles.loading}><ActivityIndicator color="#356D60" /><Text style={styles.heroSubtitle}>Finding your little corner of the ocean…</Text></View> : <IslandScene habitat={habitat.id} level={home.level} residents={home.residents} paused={paused || editing} />}
        <View style={styles.heroFooter}><Text style={styles.homeName}>{saved.preferences.name}</Text><Text style={styles.heroSubtitle}>{loading ? habitat.name : `${habitat.name}  ·  ${home.stage.place}`}</Text>
          <Text style={styles.sceneHint}>{loading ? ' ' : count ? 'Tap a little resident to revisit your discovery' : 'Your first discovery will bring these waters to life'}</Text>
        </View>
      </View>
      {!!saved.error && !editing && <Text accessibilityRole="alert" style={{ color: dark ? '#E6A495' : '#A43F36' }}>{saved.error}</Text>}

      <View style={[styles.rankCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.rankTop}>
          <View style={[styles.levelBadge, { backgroundColor: dark ? '#344D3E' : '#ECF1E5' }]}><Text style={[styles.levelSmall, { color: colors.muted }]}>LEVEL</Text><Text style={[styles.levelNumber, { color: colors.ink }]}>{loading ? '–' : home.level.toString().padStart(2, '0')}</Text></View>
          <View style={{ flex: 1, gap: 4 }}><Text style={[styles.rankName, { color: colors.ink }]}>{loading ? 'Your explorer journey' : home.stage.rank}</Text><Text style={[styles.body, { color: colors.muted }]}>{loading ? 'Loading your discoveries…' : `${count} species discovered · ${home.sightingCount} sightings`}</Text></View>
          <Text style={[styles.rankMark, { color: colors.muted }]}>✧</Text>
        </View>
        {!loading && <>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.progressHeading}><Text style={[styles.nextLabel, { color: colors.ink }]}>{home.next ? `Next: ${home.next.reward.toLowerCase()}` : 'Your archipelago is flourishing'}</Text><Text style={[styles.body, { color: colors.muted }]}>{home.next ? `${count} / ${home.next.at}` : 'Level 6'}</Text></View>
          <View accessibilityRole="progressbar" accessibilityLabel="Progress to your next island expansion" accessibilityValue={{ min: 0, max: 100, now: Math.round(home.fraction * 100) }} style={[styles.track, { backgroundColor: dark ? '#344D3E' : '#EAF0E5' }]}><View style={[styles.fill, { width: `${home.fraction * 100}%` }]} /></View>
          <Text style={[styles.body, { color: colors.muted }]}>{home.next ? `${home.remaining} new species to grow your home a little more.` : 'Every new discovery adds another story to your ocean.'}</Text>
        </>}
      </View>

      <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: colors.ink }]}>Life around you</Text><Pressable accessibilityRole="button" onPress={() => router.push('/logbook')} style={styles.textButton}><Text style={[styles.link, { color: colors.muted }]}>Collection ↗</Text></Pressable></View>
      {count > 0 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.residents}>
        {home.residents.map(({ species }) => <Pressable key={species.id} accessibilityRole="button" accessibilityLabel={`View ${species.commonName}`} onPress={() => router.push(`/species/${species.id}`)} style={[styles.residentCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <CreatureArt species={species} size={65} /><Text numberOfLines={2} style={[styles.residentName, { color: colors.ink }]}>{species.commonName}</Text>
        </Pressable>)}
      </ScrollView> : <View style={[styles.empty, { borderColor: colors.border }]}><Text style={[styles.emptyTitle, { color: colors.ink }]}>A quiet ocean. A world to discover.</Text><Text style={[styles.body, { color: colors.muted, textAlign: 'center', maxWidth: 270 }]}>Log the marine life you meet, and watch your little home come alive.</Text></View>}

      <Pressable accessibilityRole="button" onPress={() => router.push('/log/new')} style={({ pressed }) => [styles.logButton, { opacity: pressed ? .8 : 1 }]}><Text style={styles.logText}>＋  Log a discovery</Text><Text style={styles.logArrow}>↗</Text></Pressable>
      <View style={styles.journeyHeader}><Text style={[styles.eyebrow, { color: colors.muted }]}>A LITTLE MORE OCEAN, EVERY TIME</Text></View>
      <View style={styles.journey}>
        {HOME_STAGES.map((stage, index) => <View key={stage.at} style={styles.journeyStep}><View style={[styles.journeyDot, { backgroundColor: !loading && home.level > index ? '#668E70' : colors.border }]}><Text style={{ color: !loading && home.level > index ? '#FFFFFF' : colors.muted, fontSize: 10 }}>{index + 1}</Text></View><Text style={[styles.journeyCount, { color: colors.muted }]}>{stage.at} species</Text></View>)}
      </View>
      <Text style={[styles.footnote, { color: colors.muted }]}>A collection journey, one encounter at a time.</Text>
    </ScrollView>
    {editing && <HomeEditor key={owner} preferences={saved.preferences} saving={saved.saving} error={saved.error} onSave={saved.save} onClose={() => setEditing(false)} />}
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1 }, content: { paddingHorizontal: 22, width: '100%', maxWidth: 650, alignSelf: 'center', gap: 22 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  eyebrow: { fontSize: 8, letterSpacing: 1.8, fontWeight: '600' }, title: { fontSize: 34, fontWeight: '500', letterSpacing: -1.3 }, edit: { borderWidth: 1, borderRadius: 30, minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' },
  hero: { borderRadius: 28, overflow: 'hidden' }, heroHeader: { paddingHorizontal: 19, paddingTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6 }, liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#4E8771' }, pillText: { color: '#3E7164', letterSpacing: 1.8, fontSize: 8, fontWeight: '600' },
  motionButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' }, motionText: { fontSize: 11, color: '#3E7164' }, loading: { height: 310, alignItems: 'center', justifyContent: 'center', gap: 16 },
  heroFooter: { paddingHorizontal: 16, paddingBottom: 24, gap: 5, alignItems: 'center' }, homeName: { color: '#285D51', fontSize: 25, letterSpacing: -.7, fontWeight: '500', textAlign: 'center' }, heroSubtitle: { color: '#42786C', fontSize: 11, textAlign: 'center', lineHeight: 17 }, sceneHint: { color: '#477B70', fontSize: 9, textAlign: 'center', marginTop: 8 },
  rankCard: { padding: 18, borderRadius: 21, borderWidth: 1, gap: 12 }, rankTop: { flexDirection: 'row', alignItems: 'center', gap: 14 }, levelBadge: { width: 52, height: 59, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 2 }, levelSmall: { fontSize: 7, letterSpacing: 1.7, fontWeight: '700' }, levelNumber: { fontSize: 25, fontWeight: '500' }, rankName: { fontSize: 18, fontWeight: '500', letterSpacing: -.4 }, rankMark: { fontSize: 32 }, body: { fontSize: 11, lineHeight: 18 }, divider: { height: 1, marginVertical: 1 }, progressHeading: { flexDirection: 'row', gap: 10, justifyContent: 'space-between' }, nextLabel: { fontSize: 11, fontWeight: '500', flex: 1 }, track: { height: 5, borderRadius: 3, overflow: 'hidden' }, fill: { height: '100%', backgroundColor: '#81A37A', borderRadius: 3 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: -12 }, sectionTitle: { fontSize: 20, fontWeight: '500', letterSpacing: -.5 }, textButton: { minHeight: 44, justifyContent: 'center' }, link: { fontSize: 11 },
  residents: { gap: 10 }, residentCard: { width: 104, minHeight: 110, borderRadius: 17, borderWidth: 1, padding: 10, alignItems: 'center', justifyContent: 'center', gap: 8 }, residentName: { fontSize: 10, lineHeight: 14, textAlign: 'center' }, empty: { borderWidth: 1, borderStyle: 'dashed', padding: 23, alignItems: 'center', gap: 8, borderRadius: 18 }, emptyTitle: { fontSize: 14, fontWeight: '500', textAlign: 'center' },
  logButton: { borderRadius: 17, backgroundColor: '#285E4E', minHeight: 56, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, logText: { color: '#FFFFFF', fontSize: 14, fontWeight: '500' }, logArrow: { color: '#CDDECE', fontSize: 20 }, journeyHeader: { alignItems: 'center', marginTop: 10 }, journey: { flexDirection: 'row', justifyContent: 'space-between' }, journeyStep: { alignItems: 'center', gap: 8 }, journeyDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, journeyCount: { fontSize: 8 }, footnote: { fontSize: 10, textAlign: 'center', marginTop: -4 },
});
