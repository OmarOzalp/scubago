import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, Modal, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OceanButton } from '@/components/ocean-button';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Shadow } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import * as share from '@/lib/share';

import { CARD_SIZE, type ShareResult } from './card-spec';

/** The share service the preview uses; the tests pass mocks. */
export interface ShareApi {
  shareCard: (target: unknown, options?: { title?: string; fileName?: string; prepared?: unknown }) => Promise<ShareResult>;
  saveCard: (target: unknown, options?: { title?: string; fileName?: string; prepared?: unknown }) => Promise<ShareResult>;
  prepareCard: (target: unknown) => Promise<unknown>;
  /** Whether Download is offered (the web). */
  canSaveCard: boolean;
}

export interface SharePreviewProps {
  visible: boolean;
  onClose: () => void;
  /** The sheet's heading ("Share your discovery"). */
  title: string;
  /** What a screen reader says for the card, which it can't read itself. */
  cardLabel: string;
  /** The card, drawn at its design size (1080×1350). */
  children: ReactNode;
  /** The PNG's name without `.png`. */
  fileName?: string;
  /** false while the card is still getting ready (an image loading); Share waits. */
  ready?: boolean;
  /** A sentence under the card ("1 private sighting is left off"). */
  note?: string;
  /** The share service; defaults to the app's. */
  api?: ShareApi;
}

const MAX_SCALE = 0.62;

/** Whether the phone asks for less motion (it can change while the app is open). */
function useReduceMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => live && setReduced(on), () => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      live = false;
      subscription?.remove();
    };
  }, []);
  return reduced;
}

/**
 * The preview of a card before it goes out: the card shown scaled to fit the screen, with Share (and
 * Download on the web) and Close.
 *
 * The card is laid out once, at its full design size, inside a frame that scales it down for the
 * eye. What is captured is the card's own view, not the frame, so the picture is full size however
 * small the preview is.
 */
export function SharePreview({ visible, onClose, ...props }: SharePreviewProps) {
  const reduced = useReduceMotion();
  if (!visible) return null;
  return (
    <Modal visible animationType={reduced ? 'none' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <PreviewBody onClose={onClose} reduced={reduced} {...props} />
    </Modal>
  );
}

const defaultApi: ShareApi = { shareCard: share.shareCard, saveCard: share.saveCard, prepareCard: share.prepareCard, canSaveCard: share.canSaveCard };

function PreviewBody({ onClose, reduced, title, cardLabel, children, fileName, ready = true, note, api = defaultApi }: Omit<SharePreviewProps, 'visible'> & { reduced: boolean }) {
  const theme = useTheme();
  const scheme = useSchemeName();
  const insets = useSafeAreaInsets();
  const dims = useWindowDimensions();
  const cardRef = useRef<View>(null);
  const prepared = useRef<unknown>(null);
  const alive = useRef(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  // The room for the card, measured; a window-sized guess until then.
  const [stage, setStage] = useState({ width: Math.min(dims.width, MaxContentWidth) - 40, height: dims.height - 380 });

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Where the browser needs it, draw the picture while the diver looks at the card.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api.prepareCard(cardRef).then((picture) => {
        if (!cancelled) prepared.current = picture;
      }, () => {});
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ready, api]);

  const onStage = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setStage((was) => (Math.abs(was.width - width) < 1 && Math.abs(was.height - height) < 1 ? was : { width, height }));
  }, []);

  const scale = Math.max(0.1, Math.min(MAX_SCALE, stage.width / CARD_SIZE.width, stage.height / CARD_SIZE.height));
  const frame = { width: Math.round(CARD_SIZE.width * scale), height: Math.round(CARD_SIZE.height * scale) };

  const run = async (action: ApiAction) => {
    if (busy || !ready) return;
    setBusy(true);
    setMessage(null);
    const options = { title, fileName, prepared: prepared.current };
    let result: ShareResult;
    try {
      result = await (action === 'share' ? api.shareCard(cardRef, options) : api.saveCard(cardRef, options));
    } catch {
      // The service doesn't throw; this is for one that does.
      result = { status: 'error', message: 'Something went wrong. Please try again.' };
    }
    if (!alive.current) return;
    setBusy(false);
    if (result.status === 'error' || result.status === 'unavailable') {
      setMessage({ text: result.message ?? 'Something went wrong. Please try again.', failed: true });
      announce(result.message);
    } else if (result.status === 'saved') {
      setMessage({ text: result.message ?? 'Saved.', failed: false });
      announce(result.message);
    }
  };

  const shareTitle = busy ? 'Making your picture…' : ready ? 'Share' : 'Getting it ready…';

  return (
    <View
      accessibilityViewIsModal
      style={[styles.screen, { backgroundColor: theme.background, paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
      <View style={styles.column}>
        <View style={styles.header}>
          <ThemedText type="label">Preview</ThemedText>
          <ThemedText type="heading" accessibilityRole="header">
            {title}
          </ThemedText>
        </View>

        <View style={styles.stage} onLayout={onStage}>
          {/* The card at full size, scaled down inside a frame that is the size of what you see. */}
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={cardLabel}
            style={[styles.frame, frame, { boxShadow: Shadow[scheme].raised, borderColor: theme.rule }]}>
            <View
              aria-hidden
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ width: CARD_SIZE.width, height: CARD_SIZE.height, transformOrigin: 'top left', transform: [{ scale }], pointerEvents: 'none' }}>
              <View ref={cardRef} collapsable={false} style={{ width: CARD_SIZE.width, height: CARD_SIZE.height }}>
                {children}
              </View>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          {message ? (
            <ThemedText type="small" themeColor={message.failed ? 'danger' : 'tint'} accessibilityLiveRegion="polite" accessibilityRole={message.failed ? 'alert' : undefined} style={styles.centered}>
              {message.text}
            </ThemedText>
          ) : note ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
              {note}
            </ThemedText>
          ) : null}
          {busy && !reduced ? <ActivityIndicator color={theme.tint} accessibilityLabel="Making your picture" /> : null}
          <OceanButton
            title={shareTitle}
            icon="share"
            disabled={busy || !ready}
            accessibilityLabel={busy ? 'Making your picture' : 'Share this card'}
            accessibilityHint="Opens your phone’s share options with the picture"
            onPress={() => void run('share')}
          />
          {api.canSaveCard ? (
            <OceanButton
              title="Download"
              icon="download"
              variant="secondary"
              disabled={busy || !ready}
              accessibilityLabel="Download this card as a picture"
              onPress={() => void run('save')}
            />
          ) : null}
          <OceanButton title="Close" variant="quiet" accessibilityLabel="Close the preview" onPress={onClose} />
        </View>
      </View>
    </View>
  );
}

type ApiAction = 'share' | 'save';

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20 },
  column: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: 12 },
  header: { gap: 2 },
  stage: { flex: 1, minHeight: 120, alignItems: 'center', justifyContent: 'center' },
  frame: { borderRadius: Radius.md, borderWidth: 1, overflow: 'hidden' },
  footer: { gap: 10 },
  centered: { textAlign: 'center' },
});
