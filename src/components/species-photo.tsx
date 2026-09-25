import { useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import type { Species } from '@/lib/types';

/** A real species photo; missing images stay explicit instead of showing a different animal. */
export function SpeciesPhoto({ species }: { species: Species }) {
  const [failedSource, setFailedSource] = useState<string>();
  const uri = species.photoUrl;
  return <View style={styles.frame}>
    {uri && failedSource !== uri ? <Image
      key={uri}
      source={{ uri }}
      accessibilityLabel={`Photo of ${species.commonName}`}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      cachePolicy="memory-disk"
      onError={() => setFailedSource(uri)}
    /> : <Text style={styles.placeholder}>Photo unavailable</Text>}
  </View>;
}

const styles = StyleSheet.create({
  frame: { width: '100%', height: 78, borderRadius: 10, overflow: 'hidden', backgroundColor: '#E8EEE6', alignItems: 'center', justifyContent: 'center' },
  placeholder: { color: '#526B61', fontSize: 10, textAlign: 'center', padding: 8 },
});
