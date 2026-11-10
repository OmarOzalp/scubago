import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { FieldLabel } from '@/components/form-field';
import { Icon, type IconName } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { useSurface } from '@/components/ui/surface';
import { OnFill, Radius, Scrim, Size, Space, TypeScale } from '@/constants/theme';
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
  const today = localIsoDate(new Date());
  const yesterday = shiftIsoDate(today, -1);
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.field}>
      <FieldLabel header>{label}</FieldLabel>
      <View style={styles.row}>
        <Chip role="radio" label="Today" selected={value === today} onPress={() => onChange(today)} />
        <Chip role="radio" label="Yesterday" selected={value === yesterday} onPress={() => onChange(yesterday)} />
        <Chip
          label={longDate(value)}
          selected={value !== today && value !== yesterday}
          onPress={() => setOpen(true)}
          accessibilityLabel={`Date: ${longDate(value, 'long')}. Choose another date`}
        />
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
  const sheet = useSurface('raised', Radius.xl);
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
          style={[sheet, styles.card]}
          onPress={() => undefined}
          accessible={false}>
          <View style={styles.header}>
            <NavButton icon="yearBack" a11y="Previous year" onPress={() => move(-12)} />
            <NavButton icon="chevronLeft" a11y="Previous month" onPress={() => move(-1)} />
            <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header" accessibilityLiveRegion="polite">
              {title}
            </Text>
            <NavButton icon="chevronRight" a11y="Next month" onPress={() => move(1)} disabled={atMax} />
            <NavButton icon="yearForward" a11y="Next year" onPress={() => move(12)} disabled={atMax} />
          </View>
          <View style={styles.grid} importantForAccessibility="no" accessibilityElementsHidden>
            {WEEKDAYS.map((d, i) => (
              <Text key={i} style={[styles.weekday, { color: theme.textSecondary }]}>
                {d}
              </Text>
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
                  style={[styles.day, selected && { backgroundColor: theme.lagoon, borderRadius: Radius.sm }, iso === max && !selected && { backgroundColor: theme.backgroundSelected, borderRadius: Radius.sm }]}>
                  <Text style={[selected ? styles.dayStrong : styles.dayText, { color: selected ? OnFill[scheme].lagoon : future ? theme.textTertiary : theme.text }]}>{Number(iso.slice(8))}</Text>
                </Pressable>
              );
            })}
          </View>
          <Button title="Cancel" variant="plain" size="md" onPress={onClose} style={styles.cancel} />
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
  field: { gap: Space.s2 },
  // The chips are 44 to hit and 36 to look at: the 8 between rows shows as the 8 between columns.
  row: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Space.s2, alignItems: 'center' },
  backdrop: { flex: 1, backgroundColor: Scrim, justifyContent: 'center', padding: Space.s4 },
  card: { padding: Space.s4, gap: Space.s2, maxWidth: 420, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { ...TypeScale.headline, flex: 1, textAlign: 'center' },
  nav: { minWidth: Size.hit, minHeight: Size.hit, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { ...TypeScale.footnoteStrong, width: '14.2857%', textAlign: 'center' },
  day: { width: '14.2857%', minHeight: Size.hit, alignItems: 'center', justifyContent: 'center' },
  dayText: { ...TypeScale.subhead },
  dayStrong: { ...TypeScale.subheadStrong },
  cancel: { alignSelf: 'center' },
});
