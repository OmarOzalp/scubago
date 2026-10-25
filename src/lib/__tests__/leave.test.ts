import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { router } from 'expo-router';

import { leave } from '@/lib/leave';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) } }));

const mocked = router as unknown as { back: jest.Mock; replace: jest.Mock; canGoBack: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('leave', () => {
  test('goes back to the screen underneath when there is one', () => {
    leave('/logbook');
    expect(mocked.back).toHaveBeenCalledTimes(1);
    expect(mocked.replace).not.toHaveBeenCalled();
  });

  // A bare router.back() here was "GO_BACK was not handled": the diver stayed on a screen whose job was done.
  test('opened straight from a link (nothing underneath), it goes on to the fallback instead', () => {
    mocked.canGoBack.mockReturnValueOnce(false);
    leave('/logbook');
    expect(mocked.back).not.toHaveBeenCalled();
    expect(mocked.replace).toHaveBeenCalledWith('/logbook');
  });

  test('the fallback is Home unless one is given', () => {
    mocked.canGoBack.mockReturnValueOnce(false);
    leave();
    expect(mocked.replace).toHaveBeenCalledWith('/');
  });
});
