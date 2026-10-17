import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { OnFill, Radius, Shadow, Spacing } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import { longDate, monthGrid } from '@/lib/calendar';
import { localIsoDate, shiftIsoDate } from '@/lib/sighting-edit';

const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
  // 2024-01-01 was a Monday.
  new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(undefined, { weekday: 'narrow', timeZone: 'UTC' }),
);

/**
 * When something was seen: one-tap Today / Yesterday, or any earlier day from a calendar. Future
 * days can't be chosen. Built in JavaScript so it looks and works the same in Expo Go, on Android
 * and on the web.
 */
export function DateField({ value, onChange, label = 'When' }: { value: string; onChange: (iso: string) => void; label?: string }) {
  const theme = useTheme();
  const today = localIsoDate(new Date());
  const yesterday = shiftIsoDate(today, -1);
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.field}>
      <ThemedText type="label" accessibilityRole="header">
        {label}
      </ThemedText>
      <View style={styles.row}>
        <QuickDate label="Today" selected={value === today} onPress={() => onChange(today)} />
        <QuickDate label="Yesterday" selected={value === yesterday} onPress={() => onChange(yesterday)} />
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Date: ${longDate(value, 'long')}. Choose another date`}
          style={({ pressed }) => [styles.pick, { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement, borderColor: theme.rule }]}>
          <Icon name="calendar" size={18} />
          <ThemedText type="smallBold">{longDate(value)}</ThemedText>
          <Icon name="chevronDown" size={14} color={theme.textSecondary} weight="bold" />
        </Pressable>
      </View>
      {open ? (
        <Calendar
          value={value}
          max={today}
          onClose={() => setOpen(false)}
          onPick={(iso) => {
            onChange(iso);
            setOpen(false);
          }}
        />
      ) : null}
    </View>
  );
}

function QuickDate({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      aria-checked={selected}
      style={[
        styles.quick,
        { backgroundColor: selected ? theme.text : theme.backgroundElement, borderColor: selected ? theme.text : theme.rule },
      ]}>
      <ThemedText type="smallBold" style={{ color: selected ? theme.background : theme.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function Calendar({
  value,
  max,
  onPick,
  onClose,
}: {
  value: string;
  max: string;
  onPick: (iso: string) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const scheme = useSchemeName();
  const [y0, m0] = value.split('-').map(Number);
  const [cursor, setCursor] = useState({ year: y0, month: m0 - 1 });
  const maxMonth = max.slice(0, 7);
  const monthKey = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`;
  const move = (months: number) => {
    const d = new Date(Date.UTC(cursor.year, cursor.month + months, 1));
    const next = { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    if (`${next.year}-${String(next.month + 1).padStart(2, '0')}` > maxMonth) {
      setCursor({ year: Number(maxMonth.slice(0, 4)), month: Number(maxMonth.slice(5, 7)) - 1 });
    } else setCursor(next);
  };
  const title = new Date(Date.UTC(cursor.year, cursor.month, 1)).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const atMax = monthKey >= maxMonth;
  const cells = monthGrid(cursor.year, cursor.month);

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose} accessibilityViewIsModal>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close the calendar" accessibilityRole="button">
        {/* A Pressable that does nothing keeps taps inside the card from closing it. */}
        <Pressable
          style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.cardBorder, boxShadow: Shadow[scheme].raised }]}
          onPress={() => undefined}
          accessible={false}>
          <View style={styles.header}>
            <NavButton icon="yearBack" a11y="Previous year" onPress={() => move(-12)} />
            <NavButton icon="chevronLeft" a11y="Previous month" onPress={() => move(-1)} />
            <ThemedText type="heading" style={styles.title} accessibilityRole="header" accessibilityLiveRegion="polite">
              {title}
            </ThemedText>
            <NavButton icon="chevronRight" a11y="Next month" onPress={() => move(1)} disabled={atMax} />
            <NavButton icon="yearForward" a11y="Next year" onPress={() => move(12)} disabled={atMax} />
          </View>
          <View style={styles.grid} importantForAccessibility="no" accessibilityElementsHidden>
            {WEEKDAYS.map((d, i) => (
              <ThemedText key={i} type="label" style={styles.weekday}>
                {d}
              </ThemedText>
            ))}
          </View>
          <View style={styles.grid}>
            {cells.map((iso, i) => {
              if (!iso) return <View key={`blank-${i}`} style={styles.day} />;
              const future = iso > max;
              const selected = iso === value;
              return (
                <Pressable
                  key={iso}
                  onPress={() => onPick(iso)}
                  disabled={future}
                  accessibilityRole="button"
                  accessibilityLabel={longDate(iso, 'long')}
                  aria-selected={selected}
                  aria-disabled={future}
                  style={[styles.day, selected && { backgroundColor: theme.lagoon, borderRadius: Radius.sm }, iso === max && !selected && { borderWidth: 1.5, borderColor: theme.rule, borderRadius: Radius.sm }]}>
                  <ThemedText
                    type={selected ? 'smallBold' : 'small'}
                    themeColor={future ? 'textSecondary' : 'text'}
                    style={[selected && { color: OnFill[scheme].lagoon }, future && { opacity: 0.5 }]}>
                    {Number(iso.slice(8))}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" style={styles.cancel}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Cancel
            </ThemedText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function NavButton({ icon, a11y, onPress, disabled = false }: { icon: IconName; a11y: string; onPress: () => void; disabled?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      aria-disabled={disabled}
      style={styles.nav}>
      <Icon name={icon} size={18} weight="bold" color={disabled ? theme.textSecondary : theme.text} style={disabled && { opacity: 0.4 }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, alignItems: 'center' },
  quick: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pick: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 27, 46, 0.55)', justifyContent: 'center', padding: Spacing.three },
  card: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.three, gap: Spacing.two, maxWidth: 420, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, textAlign: 'center' },
  nav: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: '14.2857%', textAlign: 'center' },
  day: { width: '14.2857%', minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  cancel: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.three },
});
