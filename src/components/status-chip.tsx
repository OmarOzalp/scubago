import { StyleSheet, Text, View } from 'react-native';

import { STATUS_COLOR, STATUS_LABEL } from '@/lib/verification';
import type { SightingStatus } from '@/lib/types';

/** Small colored pill naming a sighting's verification status. */
export function StatusChip({ status, small = false }: { status: SightingStatus; small?: boolean }) {
  const color = STATUS_COLOR[status];
  return (
    <View
      style={[styles.chip, { backgroundColor: `${color}22`, borderColor: color }]}
      accessibilityLabel={`Verification: ${STATUS_LABEL[status]}`}>
      <Text style={[styles.label, { color, fontSize: small ? 10 : 12 }]}>{STATUS_LABEL[status]}</Text>
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
