import { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export function SceneUnavailable({ onRetry, children }: { onRetry: () => void; children?: ReactNode }) {
  return <View style={styles.container}>
    {children}
    <View style={styles.message}>
      <Text style={styles.text}>The 3D ocean couldn’t load.</Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}>
        <Text style={styles.button}>Try again</Text>
      </Pressable>
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
const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', minHeight: 200, justifyContent: 'center' },
  message: { position: 'absolute', bottom: 12, left: 12, right: 12, borderRadius: 14, backgroundColor: '#edf4e9', padding: 12, alignItems: 'center', gap: 6 },
  text: { color: '#365e4c', fontSize: 12 },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 22 },
  button: { color: '#285e4e', fontSize: 13, fontWeight: '600' },
});
