import { act } from 'react';

/** Opens a page's "…" menu (found by its label) and chooses a row, waiting out the pause before the row runs. */
export async function chooseFromMenu(scope, menuLabel, rowLabel) {
  // `scope` is a rendered tree or any part of one (the open leaf of a book, say), whatever has a findAll.
  const find = (test) => (scope.root ?? scope).findAll(test);
  const press = (label) =>
    find((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label)[0];
  const menu = find((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && menuLabel.test(n.props.accessibilityLabel ?? ''))[0];
  if (!menu) throw new Error(`No menu button matching ${menuLabel}`);
  await act(async () => menu.props.onPress());
  const row = press(rowLabel);
  if (!row) throw new Error(`No menu row "${rowLabel}"`);
  await act(async () => row.props.onPress());
  await act(async () => new Promise((resolve) => setTimeout(resolve, 400)));
}
