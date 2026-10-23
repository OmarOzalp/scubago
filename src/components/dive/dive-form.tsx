import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { DateField } from '@/components/date-field';
import { ChoiceChips } from '@/components/dive/choice-chips';
import { FormField } from '@/components/form-field';
import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { DiveDraft, DraftField, TypedNumber } from '@/lib/dive-draft';
import { airConsumption, CURRENTS, ENTRIES, formatDiveNumber, GASES, KINDS, parseNumber, SUITS, SURFACES, TANK_MATERIALS } from '@/lib/dives';
import type { Dive } from '@/lib/types';

const LABELS: Record<TypedNumber, string> = {
  bottomTimeMin: 'Bottom time (min)',
  maxDepthM: 'Max depth (m)',
  avgDepthM: 'Average depth (m)',
  waterTempC: 'Water (°C)',
  airTempC: 'Air (°C)',
  visibilityM: 'Visibility (m)',
  o2Percent: 'Oxygen (%)',
  tankL: 'Tank (litres)',
  pressureStartBar: 'Start (bar)',
  pressureEndBar: 'End (bar)',
  weightKg: 'Weight (kg)',
};

const PLACEHOLDERS: Partial<Record<TypedNumber, string>> = {
  bottomTimeMin: 'e.g. 48',
  maxDepthM: 'e.g. 18',
  waterTempC: 'e.g. 26',
  visibilityM: 'e.g. 20',
  tankL: 'e.g. 12',
  pressureStartBar: 'e.g. 200',
  pressureEndBar: 'e.g. 60',
  o2Percent: 'e.g. 32',
  weightKg: 'e.g. 6',
};

/** The fields under "More details", which is closed until one of them has a problem to show. */
const MORE_DETAILS: DraftField[] = ['avgDepthM', 'waterTempC', 'airTempC', 'visibilityM', 'o2Percent', 'tankL', 'pressureStartBar', 'pressureEndBar', 'weightKg'];

/**
 * The page's fields. The quick ones (number, date, time in, bottom time, maximum depth, notes) are
 * always shown; "More details" opens conditions, gas and gear, the buddy and dive centre, and a
 * rating. Numbers are kept as typed; readDraft (lib/dive-draft) reads them when the page is saved.
 *
 * A `problem` is shown under the field it is about, which is outlined in red; the form opens "More
 * details" if the field is in it, focuses the field, and hands it to `onReveal` for the screen to
 * scroll to.
 */
export function DiveForm({
  draft,
  onChange,
  nextNumber,
  takenBy,
  carried,
  initiallyOpen = false,
  problem,
  onReveal,
}: {
  draft: DiveDraft;
  onChange: (patch: Partial<DiveDraft>) => void;
  /** The number a new page would get, to say when the number is the expected one. */
  nextNumber?: number;
  /** Another page with the same number. */
  takenBy?: Pick<Dive, 'number'> & { siteName?: string };
  /** What was carried over from the latest page. */
  carried?: { from: number; what: string[] };
  initiallyOpen?: boolean;
  problem?: { field: DraftField; message: string } | null;
  onReveal?: (field: View | TextInput) => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(initiallyOpen);
  // The fields' views, to take the diver to the one with a problem.
  const fields = useRef<Partial<Record<DraftField, View | TextInput | null>>>({});
  const invalid = (key: DraftField) => (problem?.field === key ? { borderColor: theme.danger } : undefined);
  const problemAt = (...keys: DraftField[]) =>
    problem && keys.includes(problem.field) ? (
      <ThemedText type="small" themeColor="danger" accessibilityLiveRegion="polite">
        {problem.message}
      </ThemedText>
    ) : null;

  // A problem under "More details" opens it (once, as it arrives: the diver can close it again).
  const [shownProblem, setShownProblem] = useState(problem);
  if (problem !== shownProblem) {
    setShownProblem(problem);
    if (problem && MORE_DETAILS.includes(problem.field)) setOpen(true);
  }
  useEffect(() => {
    if (!problem) return;
    // After the section has opened, so the field is there to find.
    const timer = setTimeout(() => {
      const node = fields.current[problem.field];
      if (!node) return;
      onReveal?.(node);
      node.focus?.();
    }, 0);
    return () => clearTimeout(timer);
  }, [problem, onReveal]);

  const number = (key: TypedNumber, keyboard: KeyboardTypeOptions = 'decimal-pad') => (
    <FormField
      ref={(node) => {
        fields.current[key] = node;
      }}
      style={invalid(key)}
      label={LABELS[key]}
      value={draft[key]}
      onChangeText={(text) => onChange({ [key]: text } as Partial<DiveDraft>)}
      keyboardType={keyboard}
      placeholder={PLACEHOLDERS[key]}
      inputMode={keyboard === 'decimal-pad' ? 'decimal' : 'text'}
      maxLength={6}
    />
  );
  // Temperatures can be below zero, and the decimal pad on iOS has no minus key.
  const signed: KeyboardTypeOptions = 'numbers-and-punctuation';
  const sac = airConsumption({
    number: 1,
    siteId: '',
    divedOn: '',
    tankL: parseNumber(draft.tankL),
    pressureStartBar: parseNumber(draft.pressureStartBar),
    pressureEndBar: parseNumber(draft.pressureEndBar),
    bottomTimeMin: parseNumber(draft.bottomTimeMin),
    avgDepthM: parseNumber(draft.avgDepthM),
    maxDepthM: parseNumber(draft.maxDepthM),
  });
  const nitrox = draft.gas === 'nitrox' || draft.gas === 'trimix';

  return (
    <View style={styles.form}>
      <View style={styles.field}>
        <Pair>
          <FormField
            ref={(node) => {
              fields.current.number = node;
            }}
            label="Dive number"
            value={draft.number}
            onChangeText={(text) => onChange({ number: text.replace(/[^0-9]/g, '') })}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={6}
            style={[styles.numberInput, invalid('number')]}
          />
          <FormField
            ref={(node) => {
              fields.current.timeIn = node;
            }}
            style={invalid('timeIn')}
            label="Time in"
            value={draft.timeIn}
            onChangeText={(timeIn) => onChange({ timeIn })}
            placeholder="e.g. 09:30"
            keyboardType="numbers-and-punctuation"
            maxLength={8}
          />
        </Pair>
        {problemAt('number', 'timeIn')}
        {takenBy ? (
          <ThemedText type="small" themeColor="danger" accessibilityLiveRegion="polite">
            {formatDiveNumber(takenBy.number)} is already a page in your log{takenBy.siteName ? ` (${takenBy.siteName})` : ''}. You can keep it, but each dive usually has its own number.
          </ThemedText>
        ) : nextNumber !== undefined && draft.number === String(nextNumber) ? (
          <ThemedText type="small" themeColor="textSecondary">
            The next number in your log.
          </ThemedText>
        ) : null}
      </View>

      <View
        ref={(node) => {
          fields.current.divedOn = node;
        }}
        collapsable={false}
        style={styles.field}>
        <DateField label="Date" value={draft.divedOn} onChange={(divedOn) => onChange({ divedOn })} />
        {problemAt('divedOn')}
      </View>

      <View style={styles.field}>
        <Pair>
          {number('bottomTimeMin', 'number-pad')}
          {number('maxDepthM')}
        </Pair>
        {problemAt('bottomTimeMin', 'maxDepthM')}
      </View>

      <FormField
        label="Notes about the dive (just for you)"
        value={draft.notes}
        onChangeText={(notes) => onChange({ notes })}
        placeholder="Drifted along the wall; turtles at the safety stop…"
        multiline
        maxLength={4000}
        style={styles.notes}
      />

      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        aria-expanded={open}
        style={({ pressed }) => [styles.more, { borderColor: theme.rule, backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}>
        <View style={styles.flex}>
          <ThemedText type="smallBold" style={{ fontFamily: Type.bodyHeavy }}>
            {open ? 'Fewer details' : 'More details'}
          </ThemedText>
          {!open ? (
            <ThemedText type="small" themeColor="textSecondary">
              Conditions, gas and gear, buddy, dive centre, rating
            </ThemedText>
          ) : null}
        </View>
        <Icon name="chevronDown" size={16} color={theme.textSecondary} weight="bold" style={open ? styles.flip : undefined} />
      </Pressable>

      {open ? (
        <View style={styles.form}>
          <Group title="Conditions" icon="waves">
            <Pair>
              {number('waterTempC', signed)}
              {number('airTempC', signed)}
            </Pair>
            {problemAt('waterTempC', 'airTempC')}
            <Pair>
              {number('visibilityM')}
              {number('avgDepthM')}
            </Pair>
            {problemAt('visibilityM', 'avgDepthM')}
            <ChoiceChips label="Current" options={CURRENTS} value={draft.current} onChange={(current) => onChange({ current })} />
            <ChoiceChips label="Surface" options={SURFACES} value={draft.surface} onChange={(surface) => onChange({ surface })} />
            <ChoiceChips label="Entry" options={ENTRIES} value={draft.entry} onChange={(entry) => onChange({ entry })} />
            <ChoiceChips label="Kind of dive" multi options={KINDS} value={draft.kinds} onChange={(kinds) => onChange({ kinds })} />
          </Group>

          <Group title="Gas and gear" icon="tank">
            <ChoiceChips
              label="Gas"
              options={GASES}
              value={draft.gas}
              onChange={(gas) => onChange(gas === 'nitrox' || gas === 'trimix' ? { gas } : { gas, o2Percent: '' })}
            />
            {nitrox ? number('o2Percent', 'number-pad') : null}
            {problemAt('o2Percent')}
            <Pair>
              {number('tankL')}
              {number('weightKg')}
            </Pair>
            {problemAt('tankL', 'weightKg')}
            <ChoiceChips label="Tank" options={TANK_MATERIALS} value={draft.tankMaterial} onChange={(tankMaterial) => onChange({ tankMaterial })} />
            <Pair>
              {number('pressureStartBar', 'number-pad')}
              {number('pressureEndBar', 'number-pad')}
            </Pair>
            {problemAt('pressureStartBar', 'pressureEndBar')}
            {sac !== undefined ? (
              <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
                About {sac} litres a minute at the surface (your air consumption on this dive).
              </ThemedText>
            ) : null}
            <ChoiceChips label="Exposure suit" options={SUITS} value={draft.suit} onChange={(suit) => onChange({ suit })} />
          </Group>

          <Group title="People" icon="buddies">
            <FormField
              label="Buddy"
              value={draft.buddyName}
              onChangeText={(buddyName) => onChange({ buddyName })}
              placeholder="Who you dived with"
              autoCapitalize="words"
              maxLength={80}
            />
            <FormField
              label="Dive centre"
              value={draft.centreName}
              onChangeText={(centreName) => onChange({ centreName })}
              placeholder="e.g. the shop or boat you dived with"
              hint="Drawn on the page as a stamp. ScubaGo doesn’t check it with the centre, and the stamp says so."
              autoCapitalize="words"
              maxLength={80}
            />
          </Group>

          <Rating value={draft.rating} onChange={(rating) => onChange({ rating })} />
        </View>
      ) : null}

      {carried ? (
        <ThemedText type="small" themeColor="textSecondary">
          {sentence(carried.what)} carried over from {formatDiveNumber(carried.from)}. Change anything that was different.
        </ThemedText>
      ) : null}
    </View>
  );
}

/** "Gear, buddy and dive centre". */
function sentence(items: string[]): string {
  const text = items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0];
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function Pair({ children }: { children: ReactNode }) {
  return <View style={styles.pair}>{Array.isArray(children) ? children.map((c, i) => <View key={i} style={styles.flex}>{c}</View>) : children}</View>;
}

/** A titled section of the form: an icon, a heading and a rule under it. */
export function Group({ title, icon, children }: { title: string; icon: IconName; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.group}>
      <View style={[styles.groupHead, { borderBottomColor: theme.rule }]}>
        <Icon name={icon} size={18} color={theme.textSecondary} wash={theme.textSecondary} washOpacity={0.2} />
        <ThemedText type="heading" accessibilityRole="header" style={styles.groupTitle}>
          {title}
        </ThemedText>
      </View>
      {children}
    </View>
  );
}

/** One to five stars; tap the chosen star again to clear the rating. */
export function Rating({ value, onChange }: { value?: number; onChange: (value: number | undefined) => void }) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="label" importantForAccessibility="no" accessibilityElementsHidden>
        How was it?
      </ThemedText>
      <View style={styles.stars} accessibilityRole="radiogroup" accessibilityLabel="Rating">
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value !== undefined && n <= value;
          return (
            <Pressable
              key={n}
              onPress={() => onChange(value === n ? undefined : n)}
              accessibilityRole="radio"
              aria-checked={value === n}
              accessibilityLabel={`${n} ${n === 1 ? 'star' : 'stars'}`}
              hitSlop={4}
              style={({ pressed }) => [styles.star, { opacity: pressed ? 0.6 : 1 }]}>
              <Icon name="star" size={30} color={on ? theme.text : theme.textSecondary} wash={on ? theme.sun : 'transparent'} washOpacity={on ? 1 : 0} weight={on ? 'duotone' : 'regular'} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.three + 2 },
  field: { gap: 6 },
  pair: { flexDirection: 'row', gap: Spacing.two + 4 },
  flex: { flex: 1 },
  numberInput: { fontFamily: Type.display, fontSize: 20 },
  notes: { minHeight: 96, textAlignVertical: 'top' },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: Radius.md,
  },
  flip: { transform: [{ rotate: '180deg' }] },
  group: { gap: Spacing.three },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 6, borderBottomWidth: 1 },
  groupTitle: { fontSize: 19, lineHeight: 24 },
  stars: { flexDirection: 'row', gap: 4 },
  star: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
