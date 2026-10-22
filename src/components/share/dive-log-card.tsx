import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { Type } from '@/constants/theme';
import type { Species } from '@/lib/types';

import { cardDate, MAX_DIVE_SPECIES, trimNumber } from './card-data';
import { PlateTile } from './card-tile';
import { BODY_SIZE, CARD_COLORS, CardCanvas, CardText, useCardPalette } from './card-kit';

export interface DiveLogCardProps {
  /** The diver's number for this dive. */
  number: number;
  siteName: string;
  /** "Ras Mohammed, Egypt". */
  region?: string;
  /** yyyy-mm-dd. */
  divedOn: string;
  maxDepthM?: number;
  bottomTimeMin?: number;
  waterTempC?: number;
  visibilityM?: number;
  /** Everything seen on the dive, rarest first: the card shows a few as plates and says "+N more". */
  species: Pick<Species, 'id' | 'commonName' | 'category' | 'rarity'>[];
  /** Draws the dive centre's stamp, which says NOT VERIFIED: the app draws it from the name the diver wrote. */
  centreName?: string;
  buddyName?: string;
  /** The dive's own notes. Left off unless the diver chose to share them. */
  notes?: string;
  /** Animals were logged on the dive but are all private and left off: the blank page says so rather than "nothing logged". */
  keptPrivate?: boolean;
}

const GAP = 18;
const TITLE_MIN = 190;
const NUMBER_BOX = 250;
const TITLE_GAP = 34;
const LEDGER_HEIGHT = 124;
const LABEL_ROW = 40;
const COLUMNS = 3;
const TILE_GAP = 20;

/** The dive log's page, as a card: its number in the ruled margin box, the site and day, what was measured, the animals seen, and the centre's stamp. 1080×1350. */
export function DiveLogCard(props: DiveLogCardProps) {
  const { number, siteName, region, divedOn, species, centreName, buddyName, keptPrivate } = props;
  const notes = props.notes?.trim();
  const measures = [
    props.maxDepthM !== undefined ? { value: trimNumber(props.maxDepthM), unit: 'm', label: 'Max depth' } : null,
    props.bottomTimeMin !== undefined ? { value: String(props.bottomTimeMin), unit: 'min', label: 'Bottom time' } : null,
    props.waterTempC !== undefined ? { value: trimNumber(props.waterTempC), unit: '°C', label: 'Water temp' } : null,
    props.visibilityM !== undefined ? { value: trimNumber(props.visibilityM), unit: 'm', label: 'Visibility' } : null,
  ].filter((m): m is { value: string; unit: string; label: string } => !!m);

  // Up to six plates; past that the last tile says how many more.
  const more = species.length > MAX_DIVE_SPECIES ? species.length - (MAX_DIVE_SPECIES - 1) : 0;
  const shown = species.slice(0, more ? MAX_DIVE_SPECIES - 1 : species.length);
  const tiles = shown.length + (more ? 1 : 0);
  const rows = Math.max(1, Math.ceil(tiles / COLUMNS));
  const footHeight = centreName ? 184 : buddyName ? 100 : 0;
  const notesHeight = notes ? 112 : 0;

  // The site's name takes one or two lines beside the number box, and the title block grows to hold them.
  const siteSize = siteName.length <= 16 ? 76 : siteName.length <= 26 ? 64 : 54;
  const siteLine = Math.round(siteSize * 1.06);
  const siteLines = Math.min(2, Math.ceil((siteName.length * 0.52 * siteSize) / (BODY_SIZE.width - NUMBER_BOX - TITLE_GAP)));
  const titleHeight = Math.max(TITLE_MIN, 34 + siteLines * siteLine + (region ? 44 : 0) + 16);

  const blocks = [titleHeight, ...(measures.length ? [LEDGER_HEIGHT] : []), ...(footHeight ? [footHeight] : []), ...(notes ? [notesHeight] : [])];
  const gridHeight = BODY_SIZE.height - blocks.reduce((sum, h) => sum + h, 0) - (blocks.length + 1) * GAP - LABEL_ROW - 6;
  // Fewer than three animals get wider tiles, so a short page doesn't look empty.
  const columns = Math.max(1, Math.min(COLUMNS, tiles));
  const tileWidth = Math.min(430, (BODY_SIZE.width - (columns - 1) * TILE_GAP) / columns);
  const tileHeight = Math.min(Math.floor(tileWidth * 0.9), Math.floor((gridHeight - (rows - 1) * TILE_GAP) / rows));

  return (
    <CardCanvas eyebrow="Dive log" gap={GAP}>
      <View style={[styles.title, { height: titleHeight }]}>
        <View style={styles.numberBox}>
          <Text allowFontScaling={false} style={styles.no}>
            NO.
          </Text>
          <Text allowFontScaling={false} numberOfLines={1} style={[styles.number, { fontSize: numberSize(number) }]}>
            {number.toLocaleString('en')}
          </Text>
        </View>
        <View style={styles.titleText}>
          <CardText kind="label" tone="soft" numberOfLines={1}>
            {cardDate(divedOn)}
          </CardText>
          <CardText kind="title" numberOfLines={2} style={{ fontSize: siteSize, lineHeight: siteLine }}>
            {siteName}
          </CardText>
          {region ? (
            <CardText kind="small" tone="soft" numberOfLines={1}>
              {region}
            </CardText>
          ) : null}
        </View>
      </View>

      {measures.length ? <Measures items={measures} /> : null}

      <View style={styles.seen}>
        <View style={[styles.labelRow, { height: LABEL_ROW }]}>
          <CardText kind="label" tone="soft">
            Seen on this dive
          </CardText>
          {species.length ? (
            <CardText kind="label" tone="soft">
              {species.length} {species.length === 1 ? 'animal' : 'animals'}
            </CardText>
          ) : null}
        </View>
        {species.length === 0 ? (
          <BlankPage keptPrivate={keptPrivate} />
        ) : (
          <View style={styles.gridArea}>
            <View style={styles.grid}>
              {shown.map((s) => (
                <PlateTile key={s.id + s.commonName} species={s} width={tileWidth} height={tileHeight} />
              ))}
              {more ? <MoreTile count={more} width={tileWidth} height={tileHeight} /> : null}
            </View>
          </View>
        )}
      </View>

      {notes ? (
        <View style={[styles.notes, { height: notesHeight }]}>
          <Text allowFontScaling={false} numberOfLines={3} style={styles.notesText}>
            {notes}
          </Text>
        </View>
      ) : null}

      {footHeight ? (
        <View style={[styles.foot, { height: footHeight }]}>
          <View style={styles.buddy}>
            {buddyName ? (
              <>
                <CardText kind="label" tone="soft">
                  Dived with
                </CardText>
                <CardText kind="italic" numberOfLines={1} style={styles.buddyName}>
                  {buddyName}
                </CardText>
                <View style={styles.buddyRule} />
              </>
            ) : null}
          </View>
          {centreName ? <CentreStampMark name={centreName} divedOn={divedOn} number={number} /> : null}
        </View>
      ) : null}
    </CardCanvas>
  );
}

/** The number's size, so even "12,345" fits the margin box. */
const numberSize = (n: number) => Math.min(112, Math.floor(214 / (0.58 * n.toLocaleString('en').length)));

/** A page with nothing on it yet: ruled lines waiting to be written on. */
function BlankPage({ keptPrivate }: { keptPrivate?: boolean }) {
  const palette = useCardPalette();
  return (
    <View style={[styles.empty, { borderColor: palette.rule }]}>
      <CardText kind="italic" tone="soft" style={{ fontSize: 38, lineHeight: 48, textAlign: 'center' }}>
        {keptPrivate ? 'The animals from this dive are in my private log.' : 'No sightings logged on this page yet.'}
      </CardText>
      <Svg width={BODY_SIZE.width} height={420} style={StyleSheet.absoluteFill}>
        {Array.from({ length: 7 }, (_, i) => (
          <Line key={i} x1={24} x2={BODY_SIZE.width - 24} y1={118 + i * 58} y2={118 + i * 58} stroke={palette.rule} strokeWidth={2} />
        ))}
      </Svg>
    </View>
  );
}

/** The dive's figures, ruled off from each other like the totals of a logbook page. Whatever is missing is left out. */
function Measures({ items }: { items: { value: string; unit: string; label: string }[] }) {
  const palette = useCardPalette();
  return (
    <View style={[styles.measures, { height: LEDGER_HEIGHT, borderColor: palette.ink }]}>
      {items.map((m, i) => (
        <View key={m.label} style={[styles.measure, i > 0 && { borderLeftWidth: 2, borderLeftColor: palette.rule }]}>
          <View style={styles.measureValue}>
            <Text allowFontScaling={false} numberOfLines={1} style={[styles.measureNumber, { color: palette.ink }]}>
              {m.value}
            </Text>
            <Text allowFontScaling={false} numberOfLines={1} style={[styles.measureUnit, { color: palette.soft }]}>
              {m.unit}
            </Text>
          </View>
          <Text allowFontScaling={false} numberOfLines={1} style={[styles.measureLabel, { color: palette.soft }]}>
            {m.label.toUpperCase()}
          </Text>
        </View>
      ))}
    </View>
  );
}

function MoreTile({ count, width, height }: { count: number; width: number; height: number }) {
  const palette = useCardPalette();
  return (
    <View style={[styles.more, { width, height, borderColor: palette.soft }]} accessibilityLabel={`${count} more`}>
      <Text allowFontScaling={false} style={[styles.moreText, { color: palette.ink }]}>
        {`+${count}`}
      </Text>
      <CardText kind="label" tone="soft">
        more
      </CardText>
    </View>
  );
}

/** A small stable number from text, so a centre's stamp always lands the same way (the same as the app's). */
function hashOf(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) >>> 0;
  return h;
}

/** The look of a centre's stamp for a name: its angle, ink and shape, as the app draws it on the dive's page. */
export function stampLook(name: string): { rotate: number; ink: string; oval: boolean } {
  const h = hashOf(name.toLowerCase());
  return { rotate: ((h % 17) - 8) * 1.1, ink: h % 3 === 0 ? CARD_COLORS.tint : CARD_COLORS.stamp, oval: h % 2 === 0 };
}

const STAMP_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * A dive centre's stamp, as in a passport, drawn from the name the diver wrote: the same stamp the
 * dive's page shows, at card size. It says on its face that it is NOT VERIFIED: no centre stamped it.
 */
function CentreStampMark({ name, divedOn, number }: { name: string; divedOn: string; number: number }) {
  const { rotate, ink, oval } = stampLook(name);
  const [y, m, d] = divedOn.split('-').map(Number);
  const date = `${String(d).padStart(2, '0')} ${STAMP_MONTHS[m - 1]} ${y}`;
  return (
    <View
      accessibilityLabel={`Stamp: ${name}, ${date.toLowerCase()}, dive ${number}. Drawn from the name the diver wrote; not verified by the centre.`}
      style={[styles.stamp, { borderColor: ink, borderRadius: oval ? 96 : 18, transform: [{ rotate: `${rotate}deg` }] }]}>
      <View style={[styles.stampInner, { borderColor: ink, borderRadius: oval ? 90 : 12, paddingHorizontal: oval ? 40 : 22 }]}>
        <Text allowFontScaling={false} numberOfLines={2} style={[styles.stampName, { color: ink }]}>
          {name.toUpperCase()}
        </Text>
        <View style={[styles.stampRule, { backgroundColor: ink }]} />
        <Text allowFontScaling={false} style={[styles.stampLine, { color: ink }]}>
          {date} · NO. {number.toLocaleString('en')}
        </Text>
        <Text allowFontScaling={false} style={[styles.stampSmall, { color: ink }]}>
          NOT VERIFIED
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { flexDirection: 'row', alignItems: 'center', gap: TITLE_GAP },
  numberBox: { width: NUMBER_BOX, height: TITLE_MIN - 8, borderWidth: 3.5, borderColor: CARD_COLORS.ink, borderRadius: 26, backgroundColor: CARD_COLORS.sheet, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, gap: 2 },
  no: { fontFamily: Type.label, fontSize: 32, lineHeight: 38, letterSpacing: 3, color: CARD_COLORS.soft },
  number: { fontFamily: Type.display, color: CARD_COLORS.ink, letterSpacing: -1, textAlign: 'center' },
  titleText: { flex: 1, gap: 2 },
  measures: { flexDirection: 'row', alignItems: 'stretch', borderTopWidth: 3.5, borderBottomWidth: 3.5, backgroundColor: `${CARD_COLORS.sheet}CC` },
  measure: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  measureValue: { flexDirection: 'row', alignItems: 'baseline', height: 84 },
  measureNumber: { fontFamily: Type.display, fontSize: 76, lineHeight: 84 },
  measureUnit: { fontFamily: Type.bodyBold, fontSize: 34, lineHeight: 44, marginLeft: 6 },
  measureLabel: { fontFamily: Type.label, fontSize: 25, lineHeight: 30, letterSpacing: 2 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seen: { flex: 1 },
  gridArea: { flex: 1, justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: TILE_GAP },
  more: { borderStyle: 'dashed', borderWidth: 3, borderRadius: 26, alignItems: 'center', justifyContent: 'center', gap: 4 },
  moreText: { fontFamily: Type.display, fontSize: 84, lineHeight: 92 },
  empty: { flex: 1, borderWidth: 3, borderStyle: 'dashed', borderRadius: 26, alignItems: 'center', paddingHorizontal: 40, paddingTop: 36, marginTop: 6, overflow: 'hidden' },
  notes: { borderRadius: 20, borderWidth: 2.5, borderColor: CARD_COLORS.sandEdge, backgroundColor: CARD_COLORS.sand, paddingHorizontal: 28, justifyContent: 'center' },
  notesText: { fontFamily: Type.displayItalic, fontSize: 34, lineHeight: 40, color: CARD_COLORS.ink },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  buddy: { flex: 1, maxWidth: 440, gap: 2 },
  buddyName: { fontSize: 54, lineHeight: 62 },
  buddyRule: { height: 3, backgroundColor: CARD_COLORS.ink, opacity: 0.55, marginTop: 2 },
  stamp: { borderWidth: 3.5, padding: 4, alignSelf: 'center', maxWidth: 460 },
  stampInner: { borderWidth: 1.5, paddingVertical: 12, alignItems: 'center', gap: 2 },
  stampName: { fontFamily: Type.label, fontSize: 28, lineHeight: 34, letterSpacing: 2.2, textAlign: 'center' },
  stampRule: { height: 2, alignSelf: 'stretch', marginVertical: 5, opacity: 0.8 },
  stampLine: { fontFamily: Type.label, fontSize: 24, lineHeight: 30, letterSpacing: 1.6 },
  stampSmall: { fontFamily: Type.label, fontSize: 24, lineHeight: 30, letterSpacing: 3.4, marginTop: 2 },
});
