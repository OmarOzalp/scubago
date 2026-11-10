import type { SupabaseClient } from '@supabase/supabase-js';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChoiceChips } from '@/components/dive/choice-chips';
import { FactRow } from '@/components/dive/fact-row';
import { SignaturePad } from '@/components/dive/signature';
import { FormField } from '@/components/form-field';
import { formatDate } from '@/components/sighting-row';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { Radius, Space, TypeScale } from '@/constants/theme';
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
      <Card padded={false} level="raised">
        <View style={styles.head}>
          <View style={[styles.numberBox, { backgroundColor: theme.backgroundSelected }]}>
            <Text style={[TypeScale.stamp, { color: theme.textSecondary }]}>NO.</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={[TypeScale.figure, { color: theme.text }]}>
              {shown.number.toLocaleString('en')}
            </Text>
          </View>
          <View style={styles.flex}>
            <Text style={[TypeScale.title, { color: theme.text }]}>{siteName}</Text>
            <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>From @{shown.owner}’s logbook</Text>
          </View>
        </View>
        <FactRow icon="calendar" label="Date" separator labelWidth={64}>
          {formatDate(shown.divedOn)}
        </FactRow>
        {facts.length ? (
          <FactRow icon="depth" label="Dive" separator labelWidth={64}>
            {facts.join(' · ')}
          </FactRow>
        ) : null}
        {shown.buddyName ? (
          <FactRow icon="buddies" label="Buddy" separator labelWidth={64}>
            {shown.buddyName}
          </FactRow>
        ) : null}
        {shown.centreName ? (
          <FactRow icon="stamp" label="Centre" separator labelWidth={64}>
            {shown.centreName}
          </FactRow>
        ) : null}
      </Card>

      {shown.signed ? (
        <Notice icon="checkCircle">You’ve already signed this page.</Notice>
      ) : (
        <>
          <Notice icon="info">Only sign if you were on this dive with @{shown.owner}. They’ll see your name, your signature and your username.</Notice>
          <View style={styles.stack}>
            <FormField label="Your name" value={name} onChangeText={setName} placeholder="As you sign it" autoCapitalize="words" maxLength={80} />
            <ChoiceChips label="On this dive you were" options={ROLE_OPTIONS} value={role} onChange={setRole} />
            <SignaturePad onChange={setSvg} onDrawing={onDrawing} label="Your signature" />
            <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>ScubaGo doesn’t check certifications: what you say you were is shown as you wrote it.</Text>
            <Button
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Space.s4, padding: Space.s4 },
  numberBox: { minWidth: 72, borderRadius: Radius.md, paddingHorizontal: Space.s2, paddingVertical: Space.s2, alignItems: 'center' },
  stack: { gap: Space.s4 },
});
