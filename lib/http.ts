import type { NextRequest } from 'next/server';

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
