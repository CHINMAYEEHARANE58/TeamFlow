import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import WebSocket from 'ws';
import { db } from './db';

const enabled = !!process.env.TEST_DATABASE_URL && !!process.env.TEST_REDIS_URL;
describe.skipIf(!enabled)('Redis WebSocket realtime', () => {
 let server: ChildProcess, bridge: ChildProcess;
 let userId: string, workspaceId: string, otherWorkspaceId: string, token: string;
 const port = 31111;
 const endpoint = `ws://127.0.0.1:${port}/realtime`;
 const origin = 'http://127.0.0.1:3000';
 const connect = (after: string) => new Promise<WebSocket>((resolve, reject) => {
  const socket = new WebSocket(`${endpoint}?after=${encodeURIComponent(after)}`, { headers: { Origin: origin, Cookie: `teamflow_session=${token}; teamflow_workspace=${workspaceId}` } });
  socket.once('open', () => resolve(socket));
  socket.once('error', reject);
 });
 const message = (socket: WebSocket) => new Promise<{ id: string; type: string }>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Realtime event timed out')), 10_000);
  socket.once('message', data => { clearTimeout(timer); resolve(JSON.parse(data.toString())) });
  socket.once('error', error => { clearTimeout(timer); reject(error) });
 });
 beforeAll(async () => {
  const user = await db.user.create({ data: { name: 'Realtime test', email: `realtime-${randomBytes(8).toString('hex')}@example.test`, emailVerifiedAt: new Date() } });
  userId = user.id;
  const workspace = await db.workspace.create({ data: { name: 'Realtime test', memberships: { create: { userId, role: 'OWNER' } } } });
  workspaceId = workspace.id;
  const otherWorkspace = await db.workspace.create({ data: { name: 'Other realtime workspace', memberships: { create: { userId, role: 'OWNER' } } } });
  otherWorkspaceId = otherWorkspace.id;
  token = randomBytes(32).toString('base64url');
  await db.session.create({ data: { userId, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 60_000) } });
  const env = { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, REDIS_URL: process.env.TEST_REDIS_URL, APP_URL: origin, REALTIME_PORT: String(port), REALTIME_HOST: '127.0.0.1' };
  server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/realtime-server.ts'], { cwd: process.cwd(), env, stdio: 'ignore' });
  bridge = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/realtime-bridge.ts'], { cwd: process.cwd(), env, stdio: 'ignore' });
  for (let attempt = 0; attempt < 50; attempt++) {
   if (server.exitCode !== null || bridge.exitCode !== null) throw new Error('Realtime process exited');
   try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break } catch { /* still starting */ }
   await new Promise(resolve => setTimeout(resolve, 100));
  }
  await new Promise(resolve => setTimeout(resolve, 300));
 }, 15_000);
 afterAll(async () => {
  server?.kill('SIGTERM'); bridge?.kill('SIGTERM');
  if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
  if (otherWorkspaceId) await db.workspace.delete({ where: { id: otherWorkspaceId } });
  if (userId) await db.user.delete({ where: { id: userId } });
 });
 it('rejects an unauthenticated upgrade', async () => {
  const status = await new Promise<number>((resolve, reject) => {
   const socket = new WebSocket(endpoint, { headers: { Origin: origin } });
   socket.once('unexpected-response', (_request, response) => resolve(response.statusCode || 0));
   socket.once('error', reject);
  });
  expect(status).toBe(403);
 });
 it('delivers workspace changes and replays after reconnect', async () => {
  let socket = await connect(`${Date.now()}:~`);
  const firstMessage = message(socket);
  await db.workspaceEvent.create({ data: { workspaceId, type: 'task.created', entityId: 'first', payload: {} } });
  const first = await firstMessage;
  expect(first.type).toBe('task.created');
  socket.close();
  await db.workspaceEvent.create({ data: { workspaceId, type: 'task.updated', entityId: 'second', payload: {} } });
  socket = await connect(first.id);
  const second = await message(socket);
  expect(second.type).toBe('task.updated');
  expect(second.id).not.toBe(first.id);
  socket.close();
 }, 15_000);
 it('does not deliver events from another selected workspace', async () => {
  const socket = await connect(`${Date.now()}:~`);
  const next = message(socket);
  await db.workspaceEvent.create({ data: { workspaceId: otherWorkspaceId, type: 'task.private', entityId: 'hidden', payload: {} } });
  await db.workspaceEvent.create({ data: { workspaceId, type: 'task.visible', entityId: 'visible', payload: {} } });
  expect((await next).type).toBe('task.visible');
  socket.close();
 }, 15_000);
});
