import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { StyleSheet } from 'react-native';
import { create } from 'react-test-renderer';

import {
  Button,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  IconButton,
  List,
  ListRow,
  Notice,
  ProgressBar,
  ScreenTitle,
  SearchField,
  Section,
  Segmented,
  Tag,
  TextField,
} from '@/components/ui';
import { SpeciesCard } from '@/components/species-card';
import { Size } from '@/constants/theme';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { RARITY_COLOR } from '@/lib/rarity';

// The theme module imports the web stylesheet, which Jest can't parse.
jest.mock('@/global.css', () => ({}));
// Reanimated's native half can't load under Jest: its animated View is a plain one here.
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  useReducedMotion: () => true,
  default: { View: require('react-native').View, createAnimatedComponent: (c) => c },
  useSharedValue: (v) => ({ set: () => {}, get: () => v }),
  useAnimatedProps: () => ({}),
  withDelay: (_d, v) => v,
  withTiming: (v) => v,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

const render = async (el) => { await act(async () => { root = create(el); }); };
/** The pressable (host-level props with an onPress) whose label or role matches. */
const pressables = () => [...new Map(root.root.findAll((n) => n.props && typeof n.props.onPress === "function" && n.props.accessibilityRole).map((n) => [n.props.onPress, n])).values()];
const byLabel = (label) => pressables().find((n) => n.props.accessibilityLabel === label);
const box = (node, pressed = false) => StyleSheet.flatten(typeof node.props.style === 'function' ? node.props.style({ pressed }) : node.props.style);
const texts = () => root.root.findAll((n) => n.props && n.type === 'Text').map((n) => [n.props.children].flat().join(''));

describe('Button', () => {
  test('presses, and is a button by role at 52 (lg) or 44 (md)', async () => {
    const onPress = jest.fn();
    await render(<Button title="Save dive" onPress={onPress} />);
    const button = pressables()[0];
    expect(button.props.accessibilityRole).toBe('button');
    expect(box(button).minHeight).toBe(52);
    await act(async () => button.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
    await act(async () => root.update(<Button title="Save dive" size="md" onPress={onPress} />));
    expect(box(pressables()[0]).minHeight).toBe(44);
  });

  test('disabled or loading: says so, and the press is switched off', async () => {
    await render(<Button title="Save" loading onPress={() => {}} />);
    const node = root.root.findAll((n) => n.props.accessibilityState?.busy === true)[0];
    expect(node.props.disabled).toBe(true);
    expect(node.props.accessibilityState.disabled).toBe(true);
    expect(texts()).toContain('Save');
    await act(async () => root.update(<Button title="Save" disabled onPress={() => {}} />));
    const off = root.root.findAll((n) => n.props.accessibilityState?.disabled === true)[0];
    expect(off.props.disabled).toBe(true);
    expect(box(off).opacity).toBe(0.4);
  });

  test('every variant has a label colour that is not its fill, and no outline', async () => {
    for (const variant of ['primary', 'log', 'secondary', 'plain', 'destructive', 'destructivePlain']) {
      await render(<Button title="Go" variant={variant} onPress={() => {}} />);
      const style = box(pressables()[0]);
      const label = StyleSheet.flatten(root.root.findAll((n) => n.type === 'Text')[0].props.style);
      expect(label.color).not.toBe(style.backgroundColor);
      expect(style.borderWidth ?? 0).toBe(0);
      await act(async () => root.unmount());
      root = null;
    }
  });
});

describe('IconButton and Chip', () => {
  test('an icon button is named and 44 to hit', async () => {
    await render(<IconButton icon="share" accessibilityLabel="Share this page" onPress={() => {}} />);
    const node = byLabel('Share this page');
    expect(Math.min(box(node).width, box(node).height)).toBeGreaterThanOrEqual(Size.hit);
  });

  test('a chip says whether it is on, shows its count, and is 44 to hit though it looks 36', async () => {
    const onPress = jest.fn();
    await render(
      <ChipRow accessibilityLabel="Islands">
        <Chip label="Coral Reef" count={8} dot="#2EC4B6" selected onPress={onPress} />
        <Chip label="Kelp Forest" selected={false} onPress={() => {}} />
      </ChipRow>,
    );
    const [on, off] = pressables();
    expect(on.props['aria-selected']).toBe(true);
    expect(on.props.accessibilityState.selected).toBe(true);
    expect(off.props['aria-selected']).toBe(false);
    expect(box(on).minHeight).toBeGreaterThanOrEqual(44);
    expect(texts()).toEqual(expect.arrayContaining(['Coral Reef', '8', 'Kelp Forest']));
    await act(async () => on.props.onPress());
    expect(onPress).toHaveBeenCalled();
    // The row is one scroller, named for a screen reader.
    expect(root.root.findAll((n) => n.props.horizontal && n.props.accessibilityLabel === 'Islands').length).toBeGreaterThan(0);
  });
});

describe('Segmented', () => {
  test('tabs by default, radios as a choice; a press hands on the value', async () => {
    const onChange = jest.fn();
    const options = [{ value: 'a', label: 'Animals' }, { value: 's', label: 'Sets' }];
    await render(<Segmented accessibilityLabel="Show" value="a" onChange={onChange} options={options} />);
    const tabs = root.root.findAll((n) => n.props.accessibilityRole === 'tab' && typeof n.props.onPress === 'function');
    expect(tabs.map((t) => t.props['aria-selected'])).toEqual(expect.arrayContaining([true, false]));
    await act(async () => tabs.find((t) => t.props['aria-selected'] === false).props.onPress());
    expect(onChange).toHaveBeenCalledWith('s');
    await act(async () => root.update(<Segmented kind="choice" value="s" onChange={onChange} options={options} />));
    const radios = root.root.findAll((n) => n.props.accessibilityRole === 'radio' && typeof n.props.onPress === 'function');
    expect(radios.some((r) => r.props['aria-checked'] === true)).toBe(true);
    // 34 to see, 44 to hit.
    const slop = radios[0].props.hitSlop;
    expect(Size.segmented - 6 + slop.top + slop.bottom).toBeGreaterThanOrEqual(44);
  });
});

describe('List and ListRow', () => {
  test('rows in a List get a hairline above each one but the first; a row is read as title and subtitle', async () => {
    const onPress = jest.fn();
    await render(
      <List>
        <ListRow leading="sync" title="Back up and sync" subtitle="Backed up" onPress={onPress} />
        <ListRow title="Dives before ScubaGo" value="21" onPress={() => {}} />
      </List>,
    );
    const rows = root.root.findAllByType(ListRow);
    expect(rows.map((r) => r.props.separator)).toEqual([false, true]);
    const first = byLabel('Back up and sync. Backed up');
    expect(first.props.accessibilityRole).toBe('button');
    expect(box(first).minHeight).toBeGreaterThanOrEqual(Size.rowMin);
    await act(async () => first.props.onPress());
    expect(onPress).toHaveBeenCalled();
    expect(texts()).toContain('21');
  });

  test('a switch row is one switch: the row toggles, and says whether it is on', async () => {
    const toggle = jest.fn();
    await render(<ListRow leading="waves" title="Animate the ocean" switchValue onPress={toggle} />);
    const row = byLabel('Animate the ocean');
    expect(row.props.accessibilityRole).toBe('switch');
    expect(row.props.accessibilityState.checked).toBe(true);
    await act(async () => row.props.onPress());
    expect(toggle).toHaveBeenCalled();
  });

  test('a row of a windowed group draws its own corners', async () => {
    await render(<ListRow title="3 Pools" position="first" onPress={() => {}} />);
    expect(box(byLabel('3 Pools')).borderTopLeftRadius).toBeGreaterThan(0);
    expect(box(byLabel('3 Pools')).borderBottomLeftRadius).toBe(0);
  });
});

describe('Fields', () => {
  test('a search field clears with a 44 button once something is typed, and can be cancelled', async () => {
    const onChange = jest.fn();
    const onCancel = jest.fn();
    await render(<SearchField value="" onChangeText={onChange} placeholder="Search by name" onCancel={onCancel} />);
    expect(byLabel('Clear search')).toBeUndefined();
    await act(async () => root.update(<SearchField value="manta" onChangeText={onChange} placeholder="Search by name" onCancel={onCancel} />));
    const clear = byLabel('Clear search');
    expect(Math.min(box(clear).width, box(clear).height)).toBeGreaterThanOrEqual(44);
    await act(async () => clear.props.onPress());
    expect(onChange).toHaveBeenCalledWith('');
    await act(async () => byLabel('Cancel search').props.onPress());
    expect(onCancel).toHaveBeenCalled();
  });

  test('a search field can be a button that opens the search', async () => {
    const open = jest.fn();
    await render(<SearchField value="" placeholder="Search dive sites or animals" onPress={open} />);
    const node = byLabel('Search dive sites or animals');
    expect(node.props.accessibilityRole).toBe('search');
    await act(async () => node.props.onPress());
    expect(open).toHaveBeenCalled();
  });

  test('a text field is named by its label, and an error is announced', async () => {
    await render(<TextField label="Depth (m)" value="140" onChangeText={() => {}} error="Too deep" />);
    expect(root.root.findAll((n) => n.props.accessibilityLabel === 'Depth (m)').length).toBeGreaterThan(0);
    expect(root.root.findAll((n) => n.props.accessibilityRole === 'alert').length).toBeGreaterThan(0);
  });
});

describe('Screen furniture', () => {
  test('a screen title and a section title are headers; a section link is a link', async () => {
    const open = jest.fn();
    await render(
      <>
        <ScreenTitle title="You" />
        <Section title="New on your island" action={{ label: 'Field guide', accessibilityLabel: 'Your field guide', onPress: open }} />
      </>,
    );
    const headers = root.root.findAll((n) => n.type === 'Text' && n.props?.accessibilityRole === 'header').map((n) => n.props.children);
    expect(headers).toEqual(['You', 'New on your island']);
    const link = byLabel('Your field guide');
    expect(link.props.accessibilityRole).toBe('link');
    expect(box(link).minHeight).toBeGreaterThanOrEqual(44);
    await act(async () => link.props.onPress());
    expect(open).toHaveBeenCalled();
  });

  test('a card is a plain surface, or one button when it has onPress', async () => {
    const onPress = jest.fn();
    await render(<Card onPress={onPress} accessibilityLabel="Open">x</Card>);
    expect(byLabel('Open').props.accessibilityRole).toBe('button');
    // Light: a shadow and no border, never both.
    const style = box(byLabel('Open'));
    expect(style.boxShadow).toBeTruthy();
    expect(style.borderWidth ?? 0).toBe(0);
  });

  test('a notice closes; an empty state has its one action; a progress bar says its figures', async () => {
    const close = jest.fn();
    const act1 = jest.fn();
    await render(
      <>
        <Notice onDismiss={close}>The map is in the iOS and Android apps.</Notice>
        <EmptyState icon="fieldGuide" title="No animals yet" message="Animals you log appear here." action={{ title: 'Log a dive', onPress: act1 }} />
        <ProgressBar fraction={0.5} accessibilityLabel="4 of 8 species" max={8} now={4} />
        <Tag label="New" tone="sun" />
      </>,
    );
    await act(async () => byLabel('Close this note').props.onPress());
    expect(close).toHaveBeenCalled();
    await act(async () => pressables().find((n) => n.props.accessibilityRole === 'button' && n.props.accessibilityLabel === undefined).props.onPress());
    expect(act1).toHaveBeenCalled();
    const bar = root.root.findAll((n) => n.props?.accessibilityRole === 'progressbar')[0];
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 8, now: 4 });
    expect(texts()).toContain('New');
  });
});

describe('SpeciesCard', () => {
  const shark = CATALOG_BY_ID.get('brownbanded-bamboo-shark');
  test('says the name, rarity and whether it is seen; shows rarity as a dot only, and no coloured edge', async () => {
    await render(<SpeciesCard species={shark} width={110} count={2} isNew onPress={() => {}} />);
    const card = byLabel(`${shark.commonName}, ${shark.rarity}, seen 2 times, new`);
    expect(card).toBeDefined();
    expect(box(card).borderTopWidth ?? 0).toBe(0);
    const dot = root.root.findAll((n) => n.props.testID === 'rarity-dot' && typeof n.type === 'string')[0];
    expect(StyleSheet.flatten(dot.props.style).backgroundColor).toBe(RARITY_COLOR[shark.rarity]);
    expect(texts()).toContain('New');
    expect(texts().some((t) => /×|Rare|Common|Epic/.test(t))).toBe(false);
  });

  test('a name takes two lines at most, ellipsized at the end, and always keeps both lines so a grid lines up', async () => {
    await render(<SpeciesCard species={shark} width={110} count={0} onPress={() => {}} />);
    const name = root.root.findAll((n) => n.type === 'Text' && n.props.children === shark.commonName)[0];
    const style = StyleSheet.flatten(name.props.style);
    expect(name.props.numberOfLines).toBe(2);
    expect(name.props.ellipsizeMode).toBe('tail');
    expect(style.minHeight).toBe(2 * style.lineHeight);
    expect(style.fontSize).toBe(14);
  });

  test('an animal still to find sits on a white surface with a hairline (never a grey fill); a seen one is tinted and has no edge', async () => {
    await render(<SpeciesCard species={shark} width={110} count={0} onPress={() => {}} />);
    const tile = (r) => r.root.findAll((n) => typeof n.type === 'string' && n.props.style && StyleSheet.flatten(n.props.style).height === 110 && StyleSheet.flatten(n.props.style).width === 110)[0];
    const unseen = StyleSheet.flatten(tile(root).props.style);
    expect(unseen.backgroundColor).toBe('#FFFFFF');
    expect(unseen.borderWidth).toBeGreaterThan(0);
    await act(async () => root.unmount());
    await render(<SpeciesCard species={shark} width={110} count={1} onPress={() => {}} />);
    const seen = StyleSheet.flatten(tile(root).props.style);
    expect(seen.backgroundColor).not.toBe('#FFFFFF');
    expect(seen.borderWidth ?? 0).toBe(0);
  });

  test('a narrow card can let a long name take a third line', async () => {
    await render(<SpeciesCard species={shark} width={100} count={0} nameLines={3} onPress={() => {}} />);
    const name = root.root.findAll((n) => n.type === 'Text' && n.props.children === shark.commonName)[0];
    expect(name.props.numberOfLines).toBe(3);
    expect(StyleSheet.flatten(name.props.style).minHeight).toBe(2 * StyleSheet.flatten(name.props.style).lineHeight);
  });
});

describe('options added for the Log flow', () => {
  const shark = CATALOG_BY_ID.get('brownbanded-bamboo-shark');
  test('a SpeciesCard that picks is a checkbox with a ring and a tick once selected, and reads its own label', async () => {
    await render(<SpeciesCard species={shark} width={110} count={1} role="checkbox" selected accessibilityLabel={shark.commonName} onPress={() => {}} />);
    const card = byLabel(shark.commonName);
    expect(card.props.accessibilityRole).toBe('checkbox');
    expect(card.props['aria-checked']).toBe(true);
    expect(root.root.findAll((n) => n.props.testID === 'picked-tick' && typeof n.type === 'string')).toHaveLength(1);
  });

  test('a SpeciesCard with no handler is a plain block: not a button, with its note under the name', async () => {
    await render(<SpeciesCard species={shark} width={110} count={1} note={{ text: 'Rare find', color: '#000' }} />);
    expect(pressables()).toHaveLength(0);
    expect(texts()).toContain('Rare find');
  });

  test('a ListRow can wrap its title to two lines, carry something under the subtitle, and say it is expanded', async () => {
    await render(<ListRow title="A long name" titleLines={2} subtitle="Where" below={<Tag label="Waiting to sync" />} expanded onPress={() => {}} />);
    const title = root.root.findAll((n) => n.type === 'Text' && n.props.children === 'A long name')[0];
    expect(title.props.numberOfLines).toBe(2);
    expect(texts()).toContain('Waiting to sync');
    expect(pressables()[0].props['aria-expanded']).toBe(true);
  });

  test('a Chip can be a radio or a checkbox, and a TextField can be marked invalid without a message or hide its label', async () => {
    await render(
      <>
        <Chip role="radio" label="Calm" selected onPress={() => {}} />
        <TextField label="Search" labelHidden invalid value="" onChangeText={() => {}} />
      </>,
    );
    expect(pressables()[0].props.accessibilityRole).toBe('radio');
    expect(pressables()[0].props['aria-checked']).toBe(true);
    expect(texts()).not.toContain('Search');
    const input = root.root.findAll((n) => n.type === 'TextInput')[0];
    expect(input.props.accessibilityLabel).toBe('Search');
    expect(StyleSheet.flatten(input.props.style).borderColor).toBeDefined();
  });
});
