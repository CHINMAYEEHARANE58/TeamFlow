import type { NextRequest } from 'next/server';

export class BodyTooLargeError extends Error {}

export async function readJsonBody(request: Request, maxBytes = 65_536): Promise<unknown> {
 const reader = request.body?.getReader();
 if (!reader) return null;
 const decoder = new TextDecoder();
 let size = 0;
 let text = '';
 while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  size += value.byteLength;
  if (size > maxBytes) {
   await reader.cancel();
   throw new BodyTooLargeError('Body too large');
  }
  text += decoder.decode(value, { stream: true });
 }
 text += decoder.decode();
 return JSON.parse(text);
}

export function sameOrigin(request: NextRequest): boolean {
 const origin = request.headers.get('origin');
 if (!origin) return false;
 try {
  const supplied = new URL(origin);
  if (process.env.NODE_ENV === 'production') {
   const expected = new URL(process.env.APP_URL!);
   return supplied.origin === expected.origin;
  }
  return supplied.host === request.headers.get('host');
 } catch {
  return false;
 }
}
