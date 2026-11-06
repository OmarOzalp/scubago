/**
 * Every species' plate: how to build its drawing and the colours it's tinted with.
 */
import { requiem, shark } from './shark';
import { SHARKS } from './species/sharks';
import { SHARKS_TOP } from './species/sharks-top';
import { RAYS } from './species/rays';
import { TURTLES } from './species/turtles';
import { MAMMALS } from './species/mammals';
import { BIG_FISH } from './species/bigfish';
import { REEF_FISH_1 } from './species/reef1';
import { ODD_FISH } from './species/oddfish';
import { REEF_FISH_2 } from './species/reef2';
import { CEPHALOPODS } from './species/cephalopods';
import { INVERTS } from './species/inverts';
import { REPTILES } from './species/reptiles';
import { MORE_SHARKS } from './species/sharks-more';
import { MORE_RAYS } from './species/rays-more';
import { MORE_MAMMALS } from './species/mammals-more';
import { MORE_FISH } from './species/fish-more';
import type { Palette, PlateGeom } from './types';

export interface PlateDef {
  build: () => PlateGeom;
  palette: Palette;
}

export const PLATES: Record<string, PlateDef> = {
  requiem: { build: () => shark(requiem), palette: { back: '#7D8A93', belly: '#F2EEE4' } },
  ...SHARKS,
  ...SHARKS_TOP,
  ...RAYS,
  ...TURTLES,
  ...MAMMALS,
  ...BIG_FISH,
  ...REEF_FISH_1,
  ...ODD_FISH,
  ...REEF_FISH_2,
  ...CEPHALOPODS,
  ...INVERTS,
  ...REPTILES,
  ...MORE_SHARKS,
  ...MORE_RAYS,
  ...MORE_MAMMALS,
  ...MORE_FISH,
};
