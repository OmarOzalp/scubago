import { Tag } from '@/components/journal/tag';
import { useSchemeName } from '@/hooks/use-theme';
import { RARITY_COLOR, RARITY_LABEL, RARITY_TEXT } from '@/lib/rarity';
import type { Rarity } from '@/lib/types';

/** A small tag naming the rarity tier, in its colour. */
export function RarityChip({ rarity, small = false }: { rarity: Rarity; small?: boolean }) {
  const scheme = useSchemeName();
  return (
    <Tag
      label={RARITY_LABEL[rarity]}
      color={RARITY_COLOR[rarity]}
      text={RARITY_TEXT[scheme][rarity]}
      small={small}
      accessibilityLabel={`${RARITY_LABEL[rarity]} species`}
    />
  );
}
