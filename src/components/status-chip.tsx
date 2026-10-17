import { Tag } from '@/components/journal/tag';
import { useSchemeName } from '@/hooks/use-theme';
import type { SightingStatus } from '@/lib/types';
import { STATUS_COLOR, STATUS_LABEL, STATUS_TEXT } from '@/lib/verification';

/** A small tag naming a sighting's verification status. */
export function StatusChip({ status, small = false }: { status: SightingStatus; small?: boolean }) {
  const scheme = useSchemeName();
  return (
    <Tag
      label={STATUS_LABEL[status]}
      color={STATUS_COLOR[status]}
      text={STATUS_TEXT[scheme][status]}
      small={small}
      accessibilityLabel={`Verification: ${STATUS_LABEL[status]}`}
    />
  );
}
