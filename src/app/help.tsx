import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Paper } from '@/components/journal/paper';
import { Screen, ScreenHeader } from '@/components/journal/screen';
import { ThemedText } from '@/components/themed-text';

/** The help page: ScubaGo's own ideas in a line each. Dive terms are not explained: divers know them. */
export const HELP_ITEMS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'island', title: 'Your island', body: 'Every animal you log comes to live on your island. Tap it to explore.' },
  { icon: 'plus', title: 'Logging', body: 'Tap Log, pick the site, tick every animal you saw. It works without a signal.' },
  { icon: 'fieldGuide', title: 'Field guide', body: 'The animals you have met, and the ones still to find.' },
  { icon: 'signature', title: 'Buddy signatures', body: 'A buddy can sign a dive page, or confirm a sighting with its code.' },
  { icon: 'stamp', title: 'Passport', body: 'A new dive site earns a stamp.' },
  { icon: 'sync', title: 'No account needed', body: 'Everything works without one. Signing in backs up your log and syncs it to your other devices.' },
];

export default function HelpScreen() {
  return (
    <Screen>
      <ScreenHeader title="How ScubaGo works" />
      <Paper style={styles.card}>
        {HELP_ITEMS.map((item) => (
          <View key={item.title} style={styles.item} accessible accessibilityLabel={`${item.title}. ${item.body}`}>
            <Icon name={item.icon} size={24} />
            <View style={styles.text}>
              <ThemedText type="smallBold">{item.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {item.body}
              </ThemedText>
            </View>
          </View>
        ))}
      </Paper>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 18 },
  item: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  text: { flex: 1, gap: 2 },
});
