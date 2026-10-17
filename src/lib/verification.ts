import type { Sighting, SightingStatus } from '@/lib/types';

export const STATUS_LABEL: Record<SightingStatus, string> = {
  unverified: 'Unverified',
  evidence_submitted: 'Evidence in review',
  confirmed: 'Buddy verified',
  accepted: 'Verified',
  rejected: 'Not accepted',
  disputed: 'Disputed',
};

export const STATUS_COLOR: Record<SightingStatus, string> = {
  unverified: '#8E9AA6',
  evidence_submitted: '#B7791F',
  confirmed: '#2E8B57',
  accepted: '#2E8B57',
  rejected: '#C0392B',
  disputed: '#C0392B',
};

/** Status colors for text, at least 4.5:1 on the app's backgrounds and on a tinted chip. */
export const STATUS_TEXT: Record<'light' | 'dark', Record<SightingStatus, string>> = {
  light: {
    unverified: '#4B5563', evidence_submitted: '#92400E', confirmed: '#166534', accepted: '#166534',
    rejected: '#B42318', disputed: '#B42318',
  },
  dark: {
    unverified: '#C3CAD2', evidence_submitted: '#FCD34D', confirmed: '#86EFAC', accepted: '#86EFAC',
    rejected: '#FF8A7A', disputed: '#FF8A7A',
  },
};

/** One line on what the status means, in plain words. */
export const STATUS_EXPLANATION: Record<SightingStatus, string> = {
  unverified: 'The diver’s own report. No one else has confirmed it yet.',
  evidence_submitted: 'Photo evidence is waiting for review.',
  confirmed: 'Another diver on the same dive confirmed seeing it too.',
  accepted: 'Photo evidence was reviewed and supports the identification.',
  rejected: 'The evidence reviewed didn’t support this identification.',
  disputed: 'This sighting has been questioned and is being looked at.',
};

export function statusOf(s: Pick<Sighting, 'status'>): SightingStatus {
  return s.status ?? 'unverified';
}

/** A failed sync caused by having no connection (as opposed to a problem with the change itself). */
export function isConnectionProblem(message: string | null | undefined): boolean {
  return !!message && /network|fetch|timed? ?out|offline|internet|connection|abort/i.test(message);
}
