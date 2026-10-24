import 'dotenv/config';
import Redis from 'ioredis';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { eventCursor, parseEventCursor } from '../lib/realtime-cursor';

if (!process.env.REDIS_URL || !process.env.DATABASE_URL) throw new Error('REDIS_URL and DATABASE_URL are required');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const redis = new Redis(process.env.REDIS_URL);
const key = 'teamflow:realtime:cursor';
let running = true;
process.on('SIGINT', () => { running = false });
process.on('SIGTERM', () => { running = false });

async function main() {
 let cursor = (await redis.get(key)) || `${Date.now() - 60_000}:~`;
 while (running) {
  const parsed = parseEventCursor(cursor);
  if (!parsed) throw new Error('Invalid stored realtime cursor');
  const events = await db.workspaceEvent.findMany({
   where: { OR: [{ createdAt: { gt: parsed.time } }, { createdAt: parsed.time, id: { gt: parsed.id } }] },
   orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 100,
  });
  for (const event of events) {
   const id = eventCursor(event.createdAt, event.id);
   await redis.publish('teamflow:realtime:events', JSON.stringify({ id, workspaceId: event.workspaceId, type: event.type, entityId: event.entityId }));
   await redis.set(key, id);
   cursor = id;
  }
  if (events.length < 100) await new Promise(resolve => setTimeout(resolve, 1000));
 }
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => { await redis.quit(); await db.$disconnect() });
