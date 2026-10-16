import type { SupabaseClient } from '@supabase/supabase-js';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChoiceChips } from '@/components/dive/choice-chips';
import { SignaturePad } from '@/components/dive/signature';
import { FormField } from '@/components/form-field';
import { Icon } from '@/components/icon';
import { Paper } from '@/components/journal/paper';
import { OceanButton } from '@/components/ocean-button';
import { formatDate } from '@/components/sighting-row';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  lookUpDiveCode,
  SIGN_OUTCOME_MESSAGE,
  SIGNER_ROLE_LABEL,
  SIGNER_ROLES,
  signWithCode,
  type DivePreview,
  type SignerRole,
} from '@/lib/dive-signature-api';
import { formatDepth, formatDiveNumber, formatMinutes } from '@/lib/dives';
import { verificationError } from '@/lib/verification-api';

const ROLE_OPTIONS = SIGNER_ROLES.map((id) => ({ id, label: SIGNER_ROLE_LABEL[id] }));

/**
 * A buddy signs a diver's page from their own phone, with the code the diver sent: they see the
 * page's number, site, date and numbers, write their name, say what they were and sign. The server
 * checks the code and that the page hasn't changed since they looked (migration 0009).
 */
export function RemoteSign({
  client,
  code,
  preview: shown,
  siteName,
  onSigned,
  onPreview,
  onProblem,
  onDrawing,
}: {
  client: SupabaseClient;
  code: string;
  preview: DivePreview;
  siteName: string;
  onSigned: () => void;
  /** The page as it is now, after it changed under the buddy. */
  onPreview: (preview: DivePreview | null) => void;
  onProblem: (message: string | null) => void;
  onDrawing: (drawing: boolean) => void;
}) {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [role, setRole] = useState<SignerRole | undefined>('buddy');
  const [svg, setSvg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sign = async () => {
    if (!name.trim() || !svg || busy) return;
    setBusy(true);
    onProblem(null);
    try {
      const outcome = await signWithCode(client, code, { name, role: role ?? 'other', svg }, shown);
      if (outcome === 'ok') onSigned();
      else if (outcome === 'changed') {
        // Show the page as it is now; they sign again if it's still right.
        const found = await lookUpDiveCode(client, code);
        onPreview(found.preview ?? null);
        onProblem(SIGN_OUTCOME_MESSAGE[found.preview ? 'changed' : found.outcome === 'ok' ? 'invalid_code' : found.outcome]);
      } else {
        if (outcome !== 'already_signed') onPreview(null);
        onProblem(SIGN_OUTCOME_MESSAGE[outcome]);
      }
    } catch (e) {
      onProblem(verificationError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const facts = [
    shown.timeIn ? `In ${shown.timeIn}` : null,
    shown.maxDepthM !== undefined ? `${formatDepth(shown.maxDepthM)} deep` : null,
    shown.bottomTimeMin ? formatMinutes(shown.bottomTimeMin) : null,
  ].filter(Boolean);

  return (
    <>
      {/* The page from the diver's logbook, as they wrote it. */}
      <Paper raised padded={false}>
        <View style={styles.head}>
          <View style={[styles.numberBox, { borderColor: theme.text }]}>
            <Text style={[styles.no, { color: theme.textSecondary }]}>NO.</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.number, { color: theme.text }]}>
              {shown.number.toLocaleString('en')}
            </Text>
          </View>
          <View style={styles.flex}>
            <ThemedText style={styles.site}>{siteName}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              From @{shown.owner}’s logbook
            </ThemedText>
          </View>
        </View>
        <Fact icon="calendar" label="Date">
          {formatDate(shown.divedOn)}
        </Fact>
        {facts.length ? (
          <Fact icon="depth" label="Dive">
            {facts.join(' · ')}
          </Fact>
        ) : null}
        {shown.buddyName ? (
          <Fact icon="buddies" label="Buddy">
            {shown.buddyName}
          </Fact>
        ) : null}
        {shown.centreName ? (
          <Fact icon="stamp" label="Centre">
            {shown.centreName}
          </Fact>
        ) : null}
      </Paper>

      {shown.signed ? (
        <Paper tone="sand" style={styles.note}>
          <Icon name="checkCircle" size={22} color={theme.tint} />
          <ThemedText style={styles.flex}>You’ve already signed this page.</ThemedText>
        </Paper>
      ) : (
        <>
          <Paper tone="sand" style={styles.note}>
            <Icon name="info" size={22} wash={theme.sun} />
            <ThemedText type="small" style={styles.flex}>
              Only sign if you were on this dive with @{shown.owner}. They’ll see your name, your signature and your username.
            </ThemedText>
          </Paper>
          <View style={styles.stack}>
            <FormField label="Your name" value={name} onChangeText={setName} placeholder="As you sign it" autoCapitalize="words" maxLength={80} />
            <ChoiceChips label="On this dive you were" options={ROLE_OPTIONS} value={role} onChange={setRole} />
            <SignaturePad onChange={setSvg} onDrawing={onDrawing} label="Your signature" />
            <ThemedText type="caption" themeColor="textSecondary">
              ScubaGo doesn’t check certifications: what you say you were is shown as you wrote it.
            </ThemedText>
            <OceanButton
              title={busy ? 'Signing…' : `Sign ${formatDiveNumber(shown.number)}`}
              icon={busy ? undefined : 'signature'}
              variant="log"
              disabled={busy || !name.trim() || !svg}
              onPress={() => void sign()}
            />
          </View>
        </>
      )}
    </>
  );
}

function Fact({ icon, label, children }: { icon: 'calendar' | 'depth' | 'buddies' | 'stamp'; label: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.fact, { borderTopColor: theme.rule }]}>
      <Icon name={icon} size={18} color={theme.textSecondary} wash={theme.textSecondary} washOpacity={0.2} />
      <ThemedText type="label" style={styles.factLabel}>
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={styles.factValue}>
        {children}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: Spacing.three },
  numberBox: { minWidth: 70, borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: 8, paddingVertical: 4, alignItems: 'center' },
  no: { fontFamily: Type.label, fontSize: 12, letterSpacing: 1 },
  number: { fontFamily: Type.display, fontSize: 28, lineHeight: 34 },
  site: { fontFamily: Type.display, fontSize: 22, lineHeight: 28 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: Spacing.three, borderTopWidth: 1 },
  factLabel: { minWidth: 56 },
  factValue: { flex: 1, textAlign: 'right' },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stack: { gap: Spacing.three },
});
