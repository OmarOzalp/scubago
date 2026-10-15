import { StyleSheet, Text, View } from 'react-native';

import { useSchemeName } from '@/hooks/use-theme';
import { STATUS_COLOR, STATUS_LABEL, STATUS_TEXT } from '@/lib/verification';
import type { SightingStatus } from '@/lib/types';

/** Small colored pill naming a sighting's verification status. */
export function StatusChip({ status, small = false }: { status: SightingStatus; small?: boolean }) {
  const scheme = useSchemeName();
  const color = STATUS_COLOR[status];
  return (
    <View
      style={[styles.chip, { backgroundColor: `${color}22`, borderColor: color }]}
      accessibilityLabel={`Verification: ${STATUS_LABEL[status]}`}>
      <Text style={[styles.label, { color: STATUS_TEXT[scheme][status], fontSize: small ? 12 : 13 }]}>
        {STATUS_LABEL[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  label: {
    fontWeight: '700',
  },
});
