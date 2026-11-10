import { Component, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { continuous } from '@/components/ui/surface';
import { Elevation, OnWater, Radius, Space, TypeScale } from '@/constants/theme';

/** The scene could not be drawn: a note over the empty water with the one thing to do about it. */
export function SceneUnavailable({ onRetry, children }: { onRetry: () => void; children?: ReactNode }) {
  return <View style={styles.container}>
    {children}
    <View style={styles.message}>
      <Text style={styles.text}>The 3D ocean couldn’t load.</Text>
      <Button title="Try again" size="md" onPress={onRetry} style={styles.retry} />
    </View>
  </View>;
}

export class SceneBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.warn('3D scene unavailable', error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <SceneUnavailable onRetry={() => this.setState({ failed: false })}>{this.props.fallback}</SceneUnavailable>;
  }
}

// Over the island's water, so in the water's own ink on a near-opaque panel, in both schemes.
const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', minHeight: 200, justifyContent: 'center' },
  message: {
    position: 'absolute', bottom: Space.s3, left: Space.s4, right: Space.s4, alignItems: 'center', gap: Space.s3,
    padding: Space.s4, borderRadius: Radius.lg, ...continuous, backgroundColor: OnWater.panel, boxShadow: Elevation.light.card,
  },
  text: { ...TypeScale.callout, color: OnWater.ink, textAlign: 'center' },
  retry: { alignSelf: 'stretch' },
});
