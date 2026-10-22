import { useEffect, useId, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { IslandArt } from '@/components/home/island-art';
import { Type } from '@/constants/theme';
import { HOME_ISLAND, type IslandId } from '@/lib/archipelago';
import type { Habitat } from '@/lib/home';
import type { Species } from '@/lib/types';

import { ISLAND_COUNT, trimNumber } from './card-data';
import { PlateTile } from './card-tile';
import { BODY_SIZE, CARD_COLORS, CardCanvas, CardText, nameLayout, useCardPalette } from './card-kit';

export interface ArchipelagoCardProps {
  /** The diver's name for their island. */
  name: string;
  /** Their rank at this level ("Reef Scout"). */
  rank?: string;
  level: number;
  speciesCount: number;
  /** How many of the archipelago's islands they have found. */
  islandsFound: number;
  islandsTotal?: number;
  sitesDived: number;
  /** Their rarest finds, rarest first; the card shows up to three. */
  rarest: Pick<Species, 'id' | 'commonName' | 'category' | 'rarity'>[];
  /** The islands they have found, for the illustration (Home's first). */
  islands?: IslandId[];
  /**
   * A picture of the 3D scene: an image URI (a `file://` path, `data:` or `blob:` URI) of the island
   * as it looks on Home, about 2.1:1 (the frame is 868×406; 1736×812 or more keeps it sharp). It is cropped to fill the
   * hero frame, centred. Without one, the hero is an illustration composed from the island art.
   */
  snapshot?: string;
  /** Called once the hero is ready to be captured: at once without a snapshot, or when it has loaded (or failed to). */
  onSettled?: () => void;
}

const GAP = 18;
const TITLE_HEIGHT = 150;
const LEDGER_HEIGHT = 124;
const LABEL_ROW = 36;
const TILE_HEIGHT = 262;
const FRAME = 10;

/** The shore each island's illustration is drawn with: the rocky and lagoon shores tell the islands apart. */
const ART: Record<IslandId, Habitat> = {
  'coral-reef': 'island',
  'kelp-forest': 'cove',
  'volcanic-pinnacle': 'cove',
  mangroves: 'lagoon',
  shipwreck: 'island',
};

/** The diver's archipelago as a card: the island and its name, how far it has grown, and their three rarest finds. 1080×1350. */
export function ArchipelagoCard({ name, rank, level, speciesCount, islandsFound, islandsTotal = ISLAND_COUNT, sitesDived, rarest, islands = [HOME_ISLAND], snapshot, onSettled }: ArchipelagoCardProps) {
  const finds = rarest.slice(0, 3);
  const title = nameLayout(name, 104);
  const titleHeight = TITLE_HEIGHT - 104 + title.lines * title.lineHeight;
  const blocks = [titleHeight, LEDGER_HEIGHT, ...(finds.length ? [LABEL_ROW + TILE_HEIGHT] : [])];
  const heroHeight = BODY_SIZE.height - blocks.reduce((sum, h) => sum + h, 0) - blocks.length * GAP;

  return (
    <CardCanvas eyebrow="My archipelago" gap={GAP}>
      <View style={{ height: titleHeight, alignItems: 'center', justifyContent: 'center' }}>
        <CardText kind="title" numberOfLines={title.lines} style={{ fontSize: title.size, lineHeight: title.lineHeight, textAlign: 'center' }}>
          {name}
        </CardText>
        {rank ? (
          <CardText kind="label" tone="soft" numberOfLines={1} style={styles.rank}>
            {rank}
          </CardText>
        ) : null}
      </View>

      <Hero height={heroHeight} islands={islands} level={level} snapshot={snapshot} onSettled={onSettled} />

      <View style={[styles.ledger, { height: LEDGER_HEIGHT }]}>
        <Figure value={String(level)} label="Level" first />
        <Figure value={String(speciesCount)} label="Species" />
        <Figure value={String(islandsFound)} unit={`/${islandsTotal}`} label="Islands" />
        <Figure value={String(sitesDived)} label={sitesDived === 1 ? 'Site dived' : 'Sites dived'} />
      </View>

      {finds.length ? (
        <View>
          <View style={[styles.labelRow, { height: LABEL_ROW }]}>
            <CardText kind="label" tone="soft">
              My rarest finds
            </CardText>
          </View>
          <View style={styles.finds}>
            {finds.map((s) => (
              <PlateTile key={s.id} species={s} width={(BODY_SIZE.width - 2 * FIND_GAP) / 3} height={TILE_HEIGHT} tier />
            ))}
          </View>
        </View>
      ) : null}
    </CardCanvas>
  );
}

const FIND_GAP = 20;

function Figure({ value, unit, label, first }: { value: string; unit?: string; label: string; first?: boolean }) {
  const palette = useCardPalette();
  return (
    <View style={[styles.figure, !first && { borderLeftWidth: 2, borderLeftColor: palette.rule }]}>
      <View style={styles.figureValue}>
        <Text allowFontScaling={false} numberOfLines={1} style={[styles.figureNumber, { color: palette.ink }]}>
          {value}
        </Text>
        {unit ? (
          <Text allowFontScaling={false} numberOfLines={1} style={[styles.figureUnit, { color: palette.soft }]}>
            {unit}
          </Text>
        ) : null}
      </View>
      <Text allowFontScaling={false} numberOfLines={1} style={[styles.figureLabel, { color: palette.soft }]}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

// ── The hero ─────────────────────────────────────────────────────────────────────────────────────

/** Where each island sits in the illustration (centre, as shares of the frame) and how wide it is (a share of the frame's height). */
const SLOTS: { x: number; y: number; w: number }[] = [
  { x: 0.5, y: 0.5, w: 1.28 },
  { x: 0.17, y: 0.34, w: 0.64 },
  { x: 0.84, y: 0.7, w: 0.62 },
  { x: 0.83, y: 0.26, w: 0.5 },
  { x: 0.2, y: 0.78, w: 0.52 },
];

function Hero({ height, islands, level, snapshot, onSettled }: { height: number; islands: IslandId[]; level: number; snapshot?: string; onSettled?: () => void }) {
  const id = `hr${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const width = BODY_SIZE.width;
  const innerW = width - 2 * FRAME;
  const innerH = height - 2 * FRAME;
  // A snapshot covers the illustration once it has loaded; if it fails, the illustration stays.
  const [shot, setShot] = useState<'loading' | 'loaded' | 'failed'>(snapshot ? 'loading' : 'failed');
  const [lastShot, setLastShot] = useState(snapshot);
  if (snapshot !== lastShot) {
    setLastShot(snapshot);
    setShot(snapshot ? 'loading' : 'failed');
  }
  useEffect(() => {
    if (shot !== 'loading') onSettled?.();
  }, [shot, onSettled]);

  const list = [HOME_ISLAND, ...islands.filter((i) => i !== HOME_ISLAND)].slice(0, SLOTS.length);
  return (
    <View style={[styles.hero, { width, height }]}>
      <View style={styles.heroInner}>
        <Svg width={innerW} height={innerH} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#D9F2EC" />
              <Stop offset="0.5" stopColor="#A6DCD6" />
              <Stop offset="1" stopColor="#74C2C9" />
            </LinearGradient>
          </Defs>
          <Rect width={innerW} height={innerH} fill={`url(#${id}w)`} />
          <Path
            d={waves(innerW, innerH)}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={3}
            strokeLinecap="round"
            opacity={0.5}
          />
        </Svg>
        {list.map((island, i) => {
          // A lone island is drawn larger, to fill the water.
          const slot = list.length === 1 ? { x: 0.5, y: 0.52, w: 1.62 } : SLOTS[i];
          const w = slot.w * innerH;
          return (
            <View key={island} style={{ position: 'absolute', left: slot.x * innerW - w / 2, top: slot.y * innerH - (w * 390) / 840, width: w, height: (w * 390) / 420 }}>
              <IslandArt habitat={ART[island]} level={island === HOME_ISLAND ? level : Math.min(level, 3)} />
            </View>
          );
        })}
        {snapshot && shot !== 'failed' ? (
          <Image
            source={{ uri: snapshot }}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
            onLoad={() => setShot('loaded')}
            onError={() => setShot('failed')}
            style={[StyleSheet.absoluteFill, { opacity: shot === 'loaded' ? 1 : 0 }]}
          />
        ) : null}
      </View>
    </View>
  );
}

/** A few strokes of surf scattered across the water, the same every time. */
function waves(w: number, h: number): string {
  const marks: [number, number][] = [[0.08, 0.2], [0.34, 0.1], [0.62, 0.18], [0.9, 0.12], [0.12, 0.88], [0.46, 0.9], [0.74, 0.86], [0.25, 0.55], [0.7, 0.5], [0.93, 0.5]];
  return marks.map(([x, y]) => `M${trimNumber(x * w)} ${trimNumber(y * h)}q18 -8 36 0 18 8 36 0`).join('');
}

const styles = StyleSheet.create({
  rank: { marginTop: 6 },
  hero: { borderRadius: 34, borderWidth: 3.5, borderColor: CARD_COLORS.ink, backgroundColor: CARD_COLORS.sheet, padding: FRAME },
  heroInner: { flex: 1, borderRadius: 24, overflow: 'hidden' },
  ledger: { flexDirection: 'row', borderTopWidth: 3.5, borderBottomWidth: 3.5, borderColor: CARD_COLORS.ink, backgroundColor: `${CARD_COLORS.sheet}CC` },
  figure: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  figureValue: { flexDirection: 'row', alignItems: 'baseline', height: 80 },
  figureNumber: { fontFamily: Type.display, fontSize: 72, lineHeight: 80 },
  figureUnit: { fontFamily: Type.bodyBold, fontSize: 36, lineHeight: 44 },
  figureLabel: { fontFamily: Type.label, fontSize: 25, lineHeight: 30, letterSpacing: 2 },
  labelRow: { justifyContent: 'center' },
  finds: { flexDirection: 'row', gap: FIND_GAP, justifyContent: 'center' },
});
