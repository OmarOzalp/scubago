import { expect, test } from '@jest/globals';
import { inspectionModel } from '@/lib/marine-art';

test('inspection resolves species before a conflicting model query', () => {
  expect(inspectionModel({ species: 'whale-shark', model: 'tiger-shark' })).toBe('whale-shark');
  expect(inspectionModel({ species: 'tiger-shark' })).toBe('tiger-shark');
  expect(inspectionModel({ species: 'reef-manta' })).toBe('reef-manta');
  expect(inspectionModel({ species: 'great-white-shark' })).toBe('great-white-shark');
  expect(inspectionModel({ model: 'great-white-shark' })).toBe('great-white-shark');
  expect(inspectionModel({ model: 'reef-fish' })).toBe('reef-fish');
});

test('invalid, repeated, missing, and unsupported inspection queries are safe', () => {
  expect(inspectionModel({})).toBeNull();
  expect(inspectionModel({ model: '__proto__' })).toBeNull();
  expect(inspectionModel({ model: 'missing' })).toBeNull();
  expect(inspectionModel({ model: ['shark', 'manta'] })).toBeNull();
  expect(inspectionModel({ species: 'missing', model: 'shark' })).toBeNull();
  expect(inspectionModel({ species: 'green-turtle' })).toBeNull();
});
