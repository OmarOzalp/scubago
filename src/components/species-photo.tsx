import { useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { Radius, Space, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Species } from '@/lib/types';

/** A real species photo; missing images stay explicit instead of showing a different animal. */
export function SpeciesPhoto({ species }: { species: Species }) {
  const theme = useTheme();
  const [failedSource, setFailedSource] = useState<string>();
  const uri = species.photoUrl;
  return (
    <View style={[styles.frame, { backgroundColor: theme.backgroundSelected }]}>
      {uri && failedSource !== uri ? (
        <Image
          key={uri}
          source={{ uri }}
          accessibilityLabel={`Photo of ${species.commonName}`}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          onError={() => setFailedSource(uri)}
        />
      ) : (
        <Text style={[styles.placeholder, { color: theme.textSecondary }]}>Photo unavailable</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', height: 78, borderRadius: Radius.sm, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  placeholder: { ...TypeScale.footnote, textAlign: 'center', padding: Space.s2 },
});
