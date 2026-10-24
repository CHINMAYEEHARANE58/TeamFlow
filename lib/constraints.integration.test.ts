import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from './db';

describe.skipIf(!process.env.TEST_DATABASE_URL)('database integrity constraints', () => {
 let userId: string, workspaceId: string, projectId: string, taskId: string;
 beforeAll(async () => {
  userId = (await db.user.create({ data: { name: 'Constraints', email: `constraints-${crypto.randomUUID()}@example.test` } })).id;
  const workspace = await db.workspace.create({ data: { name: 'Constraints', memberships: { create: { userId, role: 'OWNER' } }, projects: { create: { name: 'Project' } } }, include: { projects: true } });
  workspaceId = workspace.id;
  projectId = workspace.projects[0].id;
  taskId = (await db.task.create({ data: { title: 'Valid', projectId } })).id;
 });
 afterAll(async () => {
  if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
  if (userId) await db.user.delete({ where: { id: userId } });
 });
 it('rejects invalid points, self-dependencies, and reversed sprint dates', async () => {
  await expect(db.task.create({ data: { title: 'Invalid points', projectId, storyPoints: -1 } })).rejects.toThrow();
  await expect(db.taskDependency.create({ data: { taskId, dependsOnId: taskId } })).rejects.toThrow();
  await expect(db.sprint.create({ data: { projectId, name: 'Invalid dates', startDate: new Date('2026-10-24'), endDate: new Date('2026-10-23') } })).rejects.toThrow();
 });
});
