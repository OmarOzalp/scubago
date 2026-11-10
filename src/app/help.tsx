import { type IconName } from '@/components/icon';
import { List, ListRow } from '@/components/ui/list';
import { Screen, ScreenTitle } from '@/components/ui/screen';

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
      <ScreenTitle title="How ScubaGo works" />
      <List>
        {HELP_ITEMS.map((item) => (
          <ListRow key={item.title} leading={item.icon} title={item.title} subtitle={item.body} subtitleLines={3} trailing="none" />
        ))}
      </List>
    </Screen>
  );
}
