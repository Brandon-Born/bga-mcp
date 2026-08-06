import { expect, test } from 'vitest';

test('BGA-005 test gate blocks a failing suite', () => {
  expect('failing test').toBe('blocked completion');
});
