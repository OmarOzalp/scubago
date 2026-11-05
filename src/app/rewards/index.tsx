import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * The Rewards screen is gone: its badges and collections are the Field guide's Badges and Sets views.
 * Old links still land: `/rewards` opens the Badges, `/rewards?tab=collections` the Sets.
 */
export default function RewardsRoute() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  return <Redirect href={{ pathname: '/field-guide', params: { view: tab === 'collections' ? 'sets' : 'badges' } }} />;
}
