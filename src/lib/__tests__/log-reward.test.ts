import { describe, expect, test } from '@jest/globals';

import { HOME_STAGES, levelForCount } from '@/lib/home';
import { islandGrowth, nameList, rarityFind } from '@/lib/log-reward';

describe('rarityFind', () => {
  test('says the tier and that it was a find', () => {
    expect(rarityFind('rare')).toBe('Rare find');
    expect(rarityFind('legendary')).toBe('Legendary find');
    expect(rarityFind('common')).toBe('Common find');
  });
});

describe('islandGrowth', () => {
  test('says nothing when nothing new joined', () => {
    expect(islandGrowth(5, 5)).toBeNull();
  });

  test('counts the animals left to the next level from the stages Home uses', () => {
    const growth = islandGrowth(4, 6)!;
    expect(levelForCount(6)).toBe(2);
    expect(growth.text).toBe(`Your island grew: ${HOME_STAGES[2].at - 6} more animals to the next level`);
    expect(growth.levelUp).toBe(false);
    expect(growth.bar).toBe(true);
    // 6 of the way from 3 to 8.
    expect(growth.fraction).toBeCloseTo(3 / 5);
    expect(growth.from).toBeCloseTo(1 / 5);
  });

  test('one animal left is singular', () => {
    expect(islandGrowth(6, 7)!.text).toBe('Your island grew: 1 more animal to the next level');
  });

  test('a new level is named, and the bar starts empty', () => {
    const growth = islandGrowth(2, 3)!;
    expect(growth.text).toBe('Your island grew to level 2');
    expect(growth.levelUp).toBe(true);
    expect(growth.bar).toBe(false);
    expect(growth.unlock).toBe(HOME_STAGES[1].reward);
    expect(growth.from).toBe(0);
  });

  test('the last level has no next to count towards', () => {
    const last = HOME_STAGES[HOME_STAGES.length - 1].at;
    const growth = islandGrowth(last + 1, last + 3)!;
    expect(growth.text).toBe('Your island grew');
    expect(growth.bar).toBe(false);
    expect(growth.fraction).toBe(1);
  });
});

describe('nameList', () => {
  test('reads as a sentence, and counts the rest when there are many', () => {
    expect(nameList(['Whale Shark'])).toBe('Whale Shark');
    expect(nameList(['A', 'B'])).toBe('A and B');
    expect(nameList(['A', 'B', 'C'])).toBe('A, B and C');
    expect(nameList(['A', 'B', 'C', 'D', 'E'])).toBe('A, B and 3 more');
  });
});
