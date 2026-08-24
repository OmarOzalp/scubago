import { describe, expect, it } from '@jest/globals';
import { usernameForUser } from '@/lib/auth';

describe('usernameForUser', () => {
  it('derives a stable, valid username from the auth uid', () => {
    expect(usernameForUser('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe('diver-a1b2c3d4');
  });
  it('always fits the 3..24 char DB constraint', () => {
    const name = usernameForUser('xy');
    expect(name.length).toBeGreaterThanOrEqual(3);
    expect(name.length).toBeLessThanOrEqual(24);
  });
});
