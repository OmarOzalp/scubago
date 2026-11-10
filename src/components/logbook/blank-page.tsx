import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/ui/notice';
import { Space } from '@/constants/theme';

/** The first page of an empty log: blank, with the one way to write on it. */
export function BlankPage() {
  return (
    <View style={styles.page}>
      <EmptyState
        icon="logbook"
        title="Your first page is blank"
        message="Log a dive and what you saw to write it here."
        action={{ title: 'Log a dive', onPress: () => router.push('/log/new'), variant: 'log', icon: 'plus' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: Space.s6 },
});
