import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';

import { Disclosure } from '@/components/journal/disclosure';

jest.mock('@/global.css', () => ({}));

function render() {
  let root;
  act(() => {
    root = create(
      <Disclosure label="About these records" hint="Shows where the records come from">
        <Text>Counted from public records.</Text>
      </Disclosure>,
    );
  });
  return root;
}

const text = (root) => root.root.findAllByType(Text).map((n) => [].concat(n.props.children).join('')).join(' ');
const toggle = (root) => root.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')[0];

test('starts closed, with its label showing and what it explains hidden', () => {
  const root = render();
  expect(text(root)).toContain('About these records');
  expect(text(root)).not.toContain('Counted from public records.');
  expect(toggle(root).props['aria-expanded']).toBe(false);
});

test('can carry something before its label on the same line, with what it opens below both', () => {
  let root;
  act(() => {
    root = create(
      <Disclosure label="How rare?" lead={<Text>Rare</Text>}>
        <Text>Counted from public records.</Text>
      </Disclosure>,
    );
  });
  const lines = () => root.root.findAllByType(Text).map((n) => [].concat(n.props.children).join(''));
  expect(lines()).toEqual(['Rare', 'How rare?']);
  expect(toggle(root).props.accessibilityLabel).toBe('How rare?');
  act(() => toggle(root).props.onPress());
  expect(lines()).toEqual(['Rare', 'How rare?', 'Counted from public records.']);
});

test('opens and closes on a tap, saying which it is', () => {
  const root = render();
  act(() => toggle(root).props.onPress());
  expect(text(root)).toContain('Counted from public records.');
  expect(toggle(root).props['aria-expanded']).toBe(true);
  act(() => toggle(root).props.onPress());
  expect(text(root)).not.toContain('Counted from public records.');
});
