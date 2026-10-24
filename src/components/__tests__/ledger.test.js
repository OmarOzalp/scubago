import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { Ledger } from '@/components/journal/ledger';

jest.mock('@/global.css', () => ({}));

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

const render = async (items) => { await act(async () => { root = create(<Ledger items={items} />); }); };
const figure = (value) => root.root.findAll((n) => n.type === 'Text' && n.children?.[0] === value)[0];

test('a long figure like a total time stays on one line of its cell, shrinking to fit, instead of wrapping onto a third', async () => {
  await render([{ value: '27', label: 'Dives' }, { value: '7h 17m', label: 'Time' }, { value: '31 m', label: 'Deepest' }]);
  expect(figure('7h 17m').props.numberOfLines).toBe(1);
  expect(figure('7h 17m').props.adjustsFontSizeToFit).toBe(true);
});

test('a name may still take two lines, so it isn’t cut short', async () => {
  await render([{ value: 'Whale Shark', label: 'Rarest' }, { value: '27', label: 'Dives' }]);
  expect(figure('Whale Shark').props.numberOfLines).toBe(2);
  expect(figure('Whale Shark').props.adjustsFontSizeToFit).toBe(false);
});

test('a short figure is set at full size', async () => {
  await render([{ value: '27', label: 'Dives' }]);
  expect(figure('27').props.numberOfLines).toBe(1);
  expect(figure('27').props.adjustsFontSizeToFit).toBe(false);
});
