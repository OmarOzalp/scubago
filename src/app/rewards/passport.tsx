import { Redirect } from 'expo-router';

/** The passport is the Sites map's stamps: an old link lands on the map showing the sites you have dived. */
export default function PassportRoute() {
  return <Redirect href={{ pathname: '/map', params: { show: 'dived' } }} />;
}
