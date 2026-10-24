import { describe, expect, it } from 'vitest';
import { cursorIsNewer, eventCursor, parseEventCursor } from './realtime-cursor';

describe('durable realtime cursor', () => {
 it('orders events with matching timestamps by id', () => {
  const time = new Date('2026-01-01T00:00:00.000Z');
  const first = eventCursor(time, 'a');
  const second = eventCursor(time, 'b');
  expect(cursorIsNewer(second, first)).toBe(true);
  expect(cursorIsNewer(first, second)).toBe(false);
 });
 it('rejects malformed or future cursors', () => {
  expect(parseEventCursor('bad')).toBeNull();
  expect(parseEventCursor(`${Date.now() + 120_000}:a`)).toBeNull();
 });
});
