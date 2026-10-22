import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Type } from '@/constants/theme';
import { AREAS, areaOf } from '@/lib/archipelago';
import { lighten, mix } from '@/lib/art-color';
import { CATEGORY_LABEL, RARITY_COLOR, RARITY_ORDER } from '@/lib/rarity';
import { artFor } from '@/lib/species-art';
import type { Species } from '@/lib/types';

import { CardSpeciesArt } from './card-art';
import { cardDate } from './card-data';
import { BODY_SIZE, CARD_COLORS, CardCanvas, CardText, nameLayout, PlateMount, TierLabel, useCardPalette } from './card-kit';

export interface DiscoveryCardProps {
  species: Pick<Species, 'id' | 'commonName' | 'scientificName' | 'category' | 'rarity'>;
  /** yyyy-mm-dd the diver first saw it. */
  firstSeenOn: string;
  /** Where they first saw it. */
  siteName?: string;
  /** The order it joined their collection: 1 for the first species. */
  collectionNumber: number;
  /** A line about the species from real data ("Recorded at 4% of Red Sea sites"); left out when absent. */
  observedNote?: string;
  /** 'auto' dresses epic and legendary finds in the twilight page; the rest are on paper. */
  tone?: 'auto' | 'paper' | 'twilight';
}

const FACT_ROW = 62;
const NOTE_BLOCK = 92;
const GAP = 16;
const SCIENTIFIC = 56;
/** How far the tier tab hangs over the plate's frame. */
const TAB_OVERLAP = 32;

/**
 * "A new discovery": one species the diver has found, as a plate in a frame edged in its rarity
 * colour, its names, tier, when and where they first saw it, and where it sits in their collection.
 * 1080×1350.
 */
export function DiscoveryCard({ species, firstSeenOn, siteName, collectionNumber, observedNote, tone = 'auto' }: DiscoveryCardProps) {
  const dark = tone === 'twilight' || (tone === 'auto' && RARITY_ORDER.indexOf(species.rarity) >= RARITY_ORDER.indexOf('epic'));
  const areaInfo = AREAS.find((a) => a.id === areaOf(species.id));
  const { wash, seed } = artFor(species);
  const note = observedNote?.trim();

  const name = nameLayout(species.commonName);
  const namesHeight = name.lines * name.lineHeight + SCIENTIFIC;
  const factsHeight = (areaInfo ? 3 : 2) * FACT_ROW + (areaInfo ? 2 : 1) * 2;
  const tabHeight = 68;
  // The plate's frame takes what the other blocks leave.
  const blocks = [tabHeight - TAB_OVERLAP, namesHeight, factsHeight, ...(note ? [NOTE_BLOCK] : [])];
  const mountHeight = BODY_SIZE.height - blocks.reduce((sum, h) => sum + h, 0) - blocks.length * GAP;
  const plateWidth = Math.min(BODY_SIZE.width - 120, Math.round(((mountHeight - 24 - 76) * 200) / 128));

  return (
    <CardCanvas tone={dark ? 'twilight' : 'paper'} eyebrow="A new discovery" gap={GAP}>
      <PlateMount rarity={species.rarity} wash={mix(lighten(wash, 0.5), RARITY_COLOR[species.rarity], 0.16)} washSeed={seed} width={BODY_SIZE.width} height={mountHeight}>
        <View style={styles.category}>
          <Text allowFontScaling={false} style={styles.categoryText}>
            {CATEGORY_LABEL[species.category]}
          </Text>
        </View>
        <View style={{ marginTop: 22 }}>
          <CardSpeciesArt species={species} width={plateWidth} />
        </View>
      </PlateMount>

      <View style={{ height: tabHeight - TAB_OVERLAP, zIndex: 1 }}>
        <TierLabel rarity={species.rarity} style={{ marginTop: -TAB_OVERLAP }} />
      </View>

      <View style={{ height: namesHeight, alignItems: 'center' }}>
        <CardText kind="title" numberOfLines={name.lines} style={{ fontSize: name.size, lineHeight: name.lineHeight, textAlign: 'center' }}>
          {species.commonName}
        </CardText>
        <CardText kind="italic" tone="soft" numberOfLines={1} style={styles.scientific}>
          {species.scientificName}
        </CardText>
      </View>

      <View>
        <Fact icon="calendar" first>{`First seen ${cardDate(firstSeenOn)}${siteName ? ` · ${siteName}` : ''}`}</Fact>
        <Fact icon="logbook">{`No. ${collectionNumber} in my collection`}</Fact>
        {areaInfo ? <Fact dot={areaInfo.color}>{`Lives in the ${areaInfo.name}`}</Fact> : null}
      </View>

      {note ? (
        <View style={[styles.note, { height: NOTE_BLOCK }]}>
          <Icon name="binoculars" size={46} color={CARD_COLORS.ink} wash={CARD_COLORS.sun} washOpacity={0.9} />
          <Text allowFontScaling={false} numberOfLines={2} style={styles.noteText}>
            {note}
          </Text>
        </View>
      ) : null}
    </CardCanvas>
  );
}

function Fact({ icon, dot, first, children }: { icon?: IconName; dot?: string; first?: boolean; children: string }) {
  const palette = useCardPalette();
  return (
    <View style={[styles.fact, { height: FACT_ROW, borderTopWidth: first ? 0 : 2, borderTopColor: palette.rule }]}>
      <View style={styles.factIcon}>
        {icon ? (
          <Icon name={icon} size={42} color={palette.ink} wash={palette.tone === 'twilight' ? CARD_COLORS.sun : CARD_COLORS.wash} washOpacity={palette.tone === 'twilight' ? 0.55 : 0.85} />
        ) : (
          <View style={[styles.dot, { backgroundColor: dot, borderColor: palette.ink }]} />
        )}
      </View>
      <CardText kind="bodyBold" numberOfLines={2} style={styles.factText}>
        {children}
      </CardText>
    </View>
  );
}

const styles = StyleSheet.create({
  category: { position: 'absolute', left: 30, top: 22 },
  categoryText: { fontFamily: Type.label, fontSize: 28, lineHeight: 34, letterSpacing: 3.4, textTransform: 'uppercase', color: CARD_COLORS.soft },
  scientific: { height: SCIENTIFIC, lineHeight: SCIENTIFIC - 4, textAlign: 'center' },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 22 },
  factIcon: { width: 46, alignItems: 'center' },
  factText: { flex: 1, fontSize: 36, lineHeight: 44 },
  dot: { width: 30, height: 30, borderRadius: 15, borderWidth: 2.5 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 22, borderRadius: 22, borderWidth: 2.5, borderColor: CARD_COLORS.sandEdge, backgroundColor: CARD_COLORS.sand, paddingHorizontal: 28 },
  noteText: { flex: 1, fontFamily: Type.displayItalic, fontSize: 38, lineHeight: 46, color: CARD_COLORS.ink },
});
