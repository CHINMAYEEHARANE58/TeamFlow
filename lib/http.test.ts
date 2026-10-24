import { describe, expect, it } from 'vitest';
import { BodyTooLargeError, readJsonBody } from './http';

describe('bounded JSON requests', () => {
 it('parses a streamed body without Content-Length', async () => {
  const request = new Request('http://localhost/api', {
   method: 'POST',
   body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"title":')); controller.enqueue(new TextEncoder().encode('"work"}')); controller.close(); } }),
   // Node requires this for a streamed request body.
   duplex: 'half',
  } as RequestInit);
  expect(request.headers.has('content-length')).toBe(false);
  expect(await readJsonBody(request)).toEqual({ title: 'work' });
 });
 it('rejects oversized bodies even without Content-Length', async () => {
  const request = new Request('http://localhost/api', { method: 'POST', body: 'x'.repeat(100) });
  await expect(readJsonBody(request, 50)).rejects.toBeInstanceOf(BodyTooLargeError);
 });
 it('rejects malformed JSON', async () => {
  const request = new Request('http://localhost/api', { method: 'POST', body: '{bad' });
  await expect(readJsonBody(request)).rejects.toBeInstanceOf(SyntaxError);
 });
});
