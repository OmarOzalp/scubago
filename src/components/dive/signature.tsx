import { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isSignaturePath, SIGNATURE_BOX, signaturePath } from '@/lib/dives';

type Point = [number, number];

/**
 * A box to sign in with a finger (or a mouse on the web). Strokes are kept in the signature box's
 * own units (300 × 100), so a signature drawn on a small phone looks the same on a tablet.
 * `onDrawing` says when a stroke starts and ends, so a scrolling page can hold still meanwhile.
 */
export function SignaturePad({
  onChange,
  onDrawing,
  label = 'Signature',
}: {
  /** The signature as path data, or null when the box is empty. */
  onChange: (svg: string | null) => void;
  onDrawing?: (drawing: boolean) => void;
  label?: string;
}) {
  const theme = useTheme();
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const width = useRef(1);
  const offset = useRef<Point>([0, 0]);
  const live = useRef<Point[][]>([]);

  const toBox = (e: GestureResponderEvent): Point => {
    const scale = SIGNATURE_BOX.width / width.current;
    // Page coordinates less where the stroke began: locationX jumps once a finger leaves the box.
    return [(e.nativeEvent.pageX - offset.current[0]) * scale, (e.nativeEvent.pageY - offset.current[1]) * scale];
  };
  const publish = (next: Point[][]) => {
    live.current = next;
    setStrokes(next);
  };
  const end = () => {
    onDrawing?.(false);
    onChange(signaturePath(live.current));
  };
  // The box keeps the touch for as long as the finger is down: a scrolling page mustn't take it.
  const responder = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (e: GestureResponderEvent) => {
      offset.current = [e.nativeEvent.pageX - e.nativeEvent.locationX, e.nativeEvent.pageY - e.nativeEvent.locationY];
      onDrawing?.(true);
      publish([...live.current, [toBox(e)]]);
    },
    onResponderMove: (e: GestureResponderEvent) => {
      const all = live.current;
      if (all.length === 0) return;
      publish([...all.slice(0, -1), [...all[all.length - 1], toBox(e)]]);
    },
    onResponderRelease: end,
    onResponderTerminate: end,
  };

  const clear = () => {
    publish([]);
    onChange(null);
  };
  const d = signaturePath(strokes);

  return (
    <View style={styles.field}>
      <View style={styles.head}>
        <ThemedText type="label" style={styles.flex}>
          {label}
        </ThemedText>
        {strokes.length > 0 ? (
          <Pressable onPress={clear} accessibilityRole="button" accessibilityLabel="Clear the signature" hitSlop={8} style={styles.clear}>
            <Icon name="close" size={14} color={theme.tint} weight="bold" />
            <ThemedText type="smallBold" themeColor="tint">
              Clear
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
      <View
        {...responder}
        onLayout={(e: LayoutChangeEvent) => {
          width.current = Math.max(1, e.nativeEvent.layout.width);
        }}
        accessible
        accessibilityLabel={strokes.length ? `${label}: signed` : `${label}: empty. Sign with your finger in this box.`}
        style={[
          styles.pad,
          { backgroundColor: theme.backgroundElement, borderColor: strokes.length ? theme.tint : theme.rule },
          // The browser mustn't scroll or select text while someone signs.
          Platform.OS === 'web' ? ({ touchAction: 'none', userSelect: 'none', cursor: 'crosshair' } as object) : null,
        ]}>
        {/* The children never take the touch, so locationX is always measured from the box. */}
        <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]} aria-hidden>
          <Svg width="100%" height="100%" viewBox={`0 0 ${SIGNATURE_BOX.width} ${SIGNATURE_BOX.height}`}>
            <Line x1="16" y1="78" x2="284" y2="78" stroke={theme.rule} strokeWidth={1} strokeDasharray="4 4" />
            {d ? <Path d={d} stroke={theme.text} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" /> : null}
          </Svg>
          {strokes.length === 0 ? (
            <View style={styles.placeholder}>
              <Icon name="signature" size={20} color={theme.textSecondary} wash={theme.textSecondary} washOpacity={0.15} />
              <ThemedText type="small" themeColor="textSecondary">
                Sign here
              </ThemedText>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** A signature as it was drawn, in ink on the page. Draws nothing for path data the app wouldn't make. */
export function SignatureView({ svg, height = 64, color }: { svg?: string; height?: number; color?: string }) {
  const theme = useTheme();
  if (!isSignaturePath(svg)) return null;
  return (
    <View aria-hidden style={{ height, aspectRatio: SIGNATURE_BOX.width / SIGNATURE_BOX.height, maxWidth: '100%' }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${SIGNATURE_BOX.width} ${SIGNATURE_BOX.height}`}>
        <Path d={svg} stroke={color ?? theme.text} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', minHeight: 24 },
  flex: { flex: 1 },
  clear: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
  pad: {
    width: '100%',
    aspectRatio: SIGNATURE_BOX.width / SIGNATURE_BOX.height,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  placeholder: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 18,
  },
});
