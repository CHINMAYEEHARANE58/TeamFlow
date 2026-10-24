import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from './db';
import { notify } from './events';

describe.skipIf(!process.env.TEST_DATABASE_URL)('notification preferences', () => {
 let userId: string, workspaceId: string, address: string;
 beforeAll(async () => {
  address = `notifications-${crypto.randomUUID()}@example.test`;
  userId = (await db.user.create({ data: { name: 'Recipient', email: address } })).id;
  workspaceId = (await db.workspace.create({ data: { name: 'Notification test', memberships: { create: { userId, role: 'OWNER' } } } })).id;
 });
 afterAll(async () => {
  if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
  if (userId) await db.user.delete({ where: { id: userId } });
  if (address) await db.emailJob.deleteMany({ where: { to: address } });
 });
 it('keeps email enabled when in-app notices are disabled', async () => {
  await db.notificationPreference.create({ data: { userId, inAppEnabled: false, emailEnabled: true } });
  await notify(userId, workspaceId, 'Task assigned', 'Review work', '/tasks/example');
  expect(await db.notification.count({ where: { userId } })).toBe(0);
  expect(await db.emailJob.count({ where: { to: address } })).toBe(1);
  await db.notificationPreference.update({ where: { userId }, data: { emailEnabled: false } });
  await notify(userId, workspaceId, 'Task updated', 'Review work', '/tasks/example');
  expect(await db.emailJob.count({ where: { to: address } })).toBe(1);
 });
});
