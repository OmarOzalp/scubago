import { View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { SpeciesArt } from '@/components/species-art';
import type { AreaId } from '@/lib/archipelago';
import { AREAS } from '@/lib/archipelago';
import type { Emblem } from '@/lib/rewards';
import type { Category } from '@/lib/types';

type Plate = { id: string; category: Category };

/** Emblems that are animals are drawn with the species' own engraved plate. */
const PLATES: Partial<Record<Emblem, Plate>> = {
  shark: { id: 'grey-reef-shark', category: 'shark' },
  ray: { id: 'reef-manta', category: 'ray' },
  turtle: { id: 'hawksbill-turtle', category: 'turtle' },
  mammal: { id: 'bottlenose-dolphin', category: 'mammal' },
  cephalopod: { id: 'day-octopus', category: 'cephalopod' },
  reef: { id: 'clownfish', category: 'fish' },
};

/** The rest are Phosphor icons. */
const ICONS: Record<Exclude<Emblem, keyof typeof PLATES>, IconName> = {
  book: 'logbook',
  star: 'star',
  gem: 'gem',
  crown: 'crown',
  night: 'night',
  wreck: 'anchor',
  dive: 'tank',
  compass: 'explore',
  globe: 'everyone',
  wave: 'waves',
  island: 'island',
};

/** Each habitat's collection is shown by an animal that lives there. */
const AREA_PLATES: Record<AreaId, Plate> = {
  'coral-reef': { id: 'moorish-idol', category: 'fish' },
  'open-ocean': { id: 'whale-shark', category: 'shark' },
  'kelp-forest': { id: 'garibaldi', category: 'fish' },
  mangroves: { id: 'common-seahorse', category: 'fish' },
  'volcanic-pinnacle': { id: 'scalloped-hammerhead', category: 'shark' },
  'black-sand-bay': { id: 'mandarinfish', category: 'fish' },
  shipwreck: { id: 'lionfish', category: 'fish' },
};

/** The colour of an area: its collection's medal and its dot (the badge's `areaId` and the collection's say which). */
export function areaColor(area: AreaId): string {
  return AREAS.find((a) => a.id === area)!.color;
}

/**
 * The picture on a medal or a collection plate. `found` false draws it in pencil: a dashed outline
 * for an animal, a faint line icon otherwise. Decorative.
 */
export function EmblemArt({
  emblem,
  area,
  size,
  ink,
  pencil,
  found = true,
  paper,
}: {
  emblem: Emblem;
  area?: AreaId;
  /** The emblem's box, in points. */
  size: number;
  /** Outline colour for an icon. */
  ink: string;
  /** Pencil colour for an icon still to earn. */
  pencil: string;
  found?: boolean;
  /** The paper behind a pencil animal. */
  paper: string;
}) {
  const plate = area ? AREA_PLATES[area] : PLATES[emblem];
  return (
    <View aria-hidden style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
      {plate ? (
        <SpeciesArt species={plate} width={size * 1.32} found={found} paper={paper} />
      ) : (
        <Icon
          name={ICONS[emblem as keyof typeof ICONS]}
          size={size * 0.78}
          color={found ? ink : pencil}
          weight={found ? 'duotone' : 'regular'}
          wash={found ? undefined : pencil}
          washOpacity={found ? 0.6 : 0.18}
        />
      )}
    </View>
  );
}
