import 'dotenv/config';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import { WebSocket, WebSocketServer } from 'ws';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { cursorIsNewer, eventCursor, parseEventCursor } from '../lib/realtime-cursor';

if (!process.env.DATABASE_URL || !process.env.REDIS_URL || !process.env.APP_URL) throw new Error('DATABASE_URL, REDIS_URL and APP_URL are required');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const subscriber = new Redis(process.env.REDIS_URL);
const sockets = new Map<WebSocket, { userId: string; workspaceId: string; sessionId: string; cursor: string; ready: boolean; pending: EventMessage[] }>();
type EventMessage = { id: string; workspaceId: string; type: string; entityId: string };
const server = createServer((_request, response) => { response.writeHead(200, { 'content-type': 'text/plain' }); response.end('TeamFlow realtime ready') });
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
const cookie = (value: string | undefined, name: string) => value?.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const allowedOrigin = (value: string | undefined) => {
 try { if (!value) return false; const actual = new URL(value); const expected = new URL(process.env.APP_URL!); return actual.origin === expected.origin || process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(actual.hostname) && actual.port === expected.port } catch { return false }
};

async function valid(state: { userId: string; workspaceId: string; sessionId: string }) {
 const [session, membership] = await Promise.all([
  db.session.findFirst({ where: { id: state.sessionId, userId: state.userId, expiresAt: { gt: new Date() } }, select: { id: true } }),
  db.membership.findUnique({ where: { userId_workspaceId: { userId: state.userId, workspaceId: state.workspaceId } }, select: { id: true } }),
 ]);
 return !!session && !!membership;
}

function send(socket: WebSocket, state: { cursor: string }, event: EventMessage) {
 if (socket.readyState !== WebSocket.OPEN || !cursorIsNewer(event.id, state.cursor)) return;
 state.cursor = event.id;
 socket.send(JSON.stringify({ event: 'change', id: event.id, type: event.type, entityId: event.entityId }));
}

async function replay(socket: WebSocket, state: { workspaceId: string; cursor: string }) {
 let count = 0;
 while (socket.readyState === WebSocket.OPEN && count < 1000) {
  const parsed = parseEventCursor(state.cursor);
  if (!parsed) break;
  const events = await db.workspaceEvent.findMany({ where: { workspaceId: state.workspaceId, OR: [{ createdAt: { gt: parsed.time } }, { createdAt: parsed.time, id: { gt: parsed.id } }] }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 100 });
  for (const event of events) send(socket, state, { id: eventCursor(event.createdAt, event.id), workspaceId: event.workspaceId, type: event.type, entityId: event.entityId });
  count += events.length;
  if (events.length < 100) break;
 }
 if (count >= 1000) socket.close(1013, 'Continuing replay');
}

server.on('upgrade', async (request, socket, head) => {
 try {
  if (!allowedOrigin(request.headers.origin)) throw new Error('Origin denied');
  const url = new URL(request.url || '/', 'http://localhost');
  if (url.pathname !== '/realtime') throw new Error('Invalid path');
  const token = cookie(request.headers.cookie, 'teamflow_session');
  if (!token) throw new Error('No session');
  const session = await db.session.findUnique({ where: { tokenHash: hash(token) }, select: { id: true, userId: true, expiresAt: true } });
  if (!session || session.expiresAt <= new Date()) throw new Error('Session expired');
  const selected = cookie(request.headers.cookie, 'teamflow_workspace');
  const membership = await db.membership.findFirst({ where: { userId: session.userId, ...(selected ? { workspaceId: selected } : {}) }, orderBy: { id: 'asc' }, select: { workspaceId: true } });
  if (!membership) throw new Error('No workspace');
  const after = parseEventCursor(url.searchParams.get('after'));
  const initial = after ? `${after.time.getTime()}:${after.id}` : `${Date.now()}:~`;
  wss.handleUpgrade(request, socket, head, client => {
   const state = { userId: session.userId, workspaceId: membership.workspaceId, sessionId: session.id, cursor: initial, ready: false, pending: [] as EventMessage[] };
   sockets.set(client, state);
   client.on('close', () => sockets.delete(client));
   client.on('error', () => sockets.delete(client));
   void replay(client, state).then(() => { state.ready = true; state.pending.sort((a, b) => cursorIsNewer(a.id, b.id) ? 1 : -1).forEach(event => send(client, state, event)); state.pending = [] }).catch(() => client.close(1011, 'Replay failed'));
  });
 } catch { socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy() }
});

subscriber.subscribe('teamflow:realtime:events').then(() => console.log('TeamFlow realtime subscribed'));
subscriber.on('message', (_channel, value) => {
 try {
  const event = JSON.parse(value) as EventMessage;
  if (!parseEventCursor(event.id)) return;
  for (const [socket, state] of sockets) if (state.workspaceId === event.workspaceId) {
   if (state.ready) send(socket, state, event); else state.pending.push(event);
  }
 } catch (error) { console.error('Invalid realtime event', error) }
});
const interval = setInterval(() => { for (const [socket, state] of sockets) void valid(state).then(ok => { if (!ok) socket.close(1008, 'Access revoked') }).catch(() => socket.close(1011, 'Authorization failed')) }, 30_000);
const port = Number(process.env.REALTIME_PORT || 3001);
server.listen(port, process.env.REALTIME_HOST || '127.0.0.1', () => console.log(`TeamFlow WebSocket service listening on ${port}`));
async function shutdown() { clearInterval(interval); for (const socket of sockets.keys()) socket.close(1001, 'Shutting down'); wss.close(); server.close(); await subscriber.quit(); await db.$disconnect() }
process.on('SIGTERM', () => { void shutdown() });
process.on('SIGINT', () => { void shutdown() });
