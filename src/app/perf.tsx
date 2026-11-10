import { useEffect, useState } from 'react';
import { PixelRatio, Platform, Share, StyleSheet, View, useWindowDimensions } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { Stack } from 'expo-router';

import { PaperButton } from '@/components/journal/paper';
import { Screen, ScreenHeader, SectionHeader } from '@/components/journal/screen';
import { ThemedText } from '@/components/themed-text';
import { buildLine, formatReport, perfReport, reportSections, type ReportEnv } from '@/lib/perf-report';

/** Where the JavaScript runs: Expo Go, a development build or a standalone (store or TestFlight) build. */
function environment() {
  if (Platform.OS === 'web') return 'Web browser';
  switch (Constants.executionEnvironment) {
    case ExecutionEnvironment.StoreClient: return 'Expo Go';
    case ExecutionEnvironment.Standalone: return 'Standalone build';
    case ExecutionEnvironment.Bare: return 'Development or bare build';
    default: return String(Constants.executionEnvironment ?? 'unknown');
  }
}

/** React Native's own startup timing, on the same clock as the report's marks, where the runtime has it. */
function startup(): ReportEnv['startup'] {
  try {
    const timing = (globalThis.performance as { rnStartupTiming?: ReportEnv['startup'] } | undefined)?.rnStartupTiming;
    return timing ? { startTime: timing.startTime, executeJavaScriptBundleEntryPointStart: timing.executeJavaScriptBundleEntryPointStart, endTime: timing.endTime } : null;
  } catch {
    return null;
  }
}

/**
 * Performance report: what this phone measured this session (how soon the app and its islands came up, each explorer open and island switch,
 * the frame rate and frame times of each scene, whether the JavaScript is a development build), as plain rows and as one text block to send.
 * Nothing links here yet (the You screen will); `/perf` opens it. Reading it costs nothing until it is opened.
 */
export default function PerfScreen() {
  const window = useWindowDimensions();
  const env: ReportEnv = {
    dev: __DEV__, environment: environment(), platform: Platform.OS, os: Device.osVersion ?? String(Platform.Version ?? ''),
    device: [Device.modelName, Device.isDevice ? null : '(simulator)'].filter(Boolean).join(' ') || 'unknown',
    app: `${Constants.expoConfig?.version ?? '?'}${Constants.expoConfig?.runtimeVersion ? ` (runtime ${String(Constants.expoConfig.runtimeVersion)})` : ''}`,
    startup: startup(), screen: `${Math.round(window.width)} x ${Math.round(window.height)} pt at ${PixelRatio.get()}x`,
  };
  // The numbers as they are now, read again every two seconds while the screen is open.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 2000);
    return () => clearInterval(timer);
  }, []);
  const [sent, setSent] = useState('');
  const text = formatReport(perfReport, env);
  // The web can copy; a phone has no clipboard without another package, so it hands the text to the share sheet (Copy is one of its actions).
  const canCopy = Platform.OS === 'web' && typeof navigator !== 'undefined' && !!navigator.clipboard;
  const send = async () => {
    try {
      if (canCopy) { await navigator.clipboard.writeText(text); setSent('Copied.'); return; }
      const result = await Share.share({ message: text });
      if (result.action === Share.sharedAction) setSent('Shared.');
    } catch {
      setSent('Could not share the report.');
    }
  };
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Performance report', headerTitle: '' }} />
      <ScreenHeader title="Performance report" />
      <ThemedText type="label">{buildLine(env)}</ThemedText>
      <PaperButton onPress={send} accessibilityLabel={canCopy ? 'Copy report' : 'Share report'} style={styles.button}>
        <ThemedText type="smallBold">{canCopy ? 'Copy report' : 'Share report'}</ThemedText>
      </PaperButton>
      {!!sent && <ThemedText type="small">{sent}</ThemedText>}
      {reportSections(perfReport, env).map((section) => (
        <View key={section.title} style={styles.section}>
          <SectionHeader title={section.title} />
          {section.rows.map(([label, value], i) => (
            <View key={`${label}-${i}`} style={styles.row}>
              <ThemedText type="small" style={styles.label}>{label}</ThemedText>
              <ThemedText type="small" style={styles.value} selectable>{value}</ThemedText>
            </View>
          ))}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  button: { marginTop: 12, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' },
  section: { marginTop: 20, gap: 4 },
  row: { flexDirection: 'row', gap: 12 },
  label: { flex: 1 },
  value: { flex: 1.3, textAlign: 'right' },
});
