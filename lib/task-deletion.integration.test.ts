import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from './db';
import { deleteLeafTask } from './task-deletion';

describe.skipIf(!process.env.TEST_DATABASE_URL)('task deletion', () => {
 let owner: string, member: string, outsider: string, workspace: string, parent: string, child: string;
 beforeAll(async () => {
  const stamp = crypto.randomUUID();
  const users = await Promise.all(['owner', 'member', 'outsider'].map(name => db.user.create({ data: { name, email: `${name}-${stamp}@example.test`, emailVerifiedAt: new Date() } })));
  [owner, member, outsider] = users.map(user => user.id);
  const created = await db.workspace.create({ data: { name: 'Delete test', memberships: { create: [{ userId: owner, role: 'OWNER' }, { userId: member, role: 'MEMBER' }] }, projects: { create: { name: 'Delete test project' } } }, include: { projects: true } });
  workspace = created.id;
  const parentTask = await db.task.create({ data: { title: 'Parent', projectId: created.projects[0].id } });
  const childTask = await db.task.create({ data: { title: 'Child', projectId: created.projects[0].id, parentId: parentTask.id } });
  parent = parentTask.id;
  child = childTask.id;
 });
 afterAll(async () => {
  if (workspace) await db.workspace.delete({ where: { id: workspace } });
  if (owner) await db.user.deleteMany({ where: { id: { in: [owner, member, outsider] } } });
 });
 it('enforces role, version, and child safeguards before deleting', async () => {
  expect((await deleteLeafTask(outsider, child, 0)).kind).toBe('forbidden');
  expect((await deleteLeafTask(member, child, 0)).kind).toBe('forbidden');
  expect((await deleteLeafTask(owner, child, 1)).kind).toBe('conflict');
  expect((await deleteLeafTask(owner, parent, 0)).kind).toBe('has_subtasks');
  expect((await deleteLeafTask(owner, child, 0)).kind).toBe('deleted');
  expect((await deleteLeafTask(owner, parent, 0)).kind).toBe('deleted');
  expect(await db.task.count({ where: { id: { in: [parent, child] } } })).toBe(0);
  expect(await db.auditLog.count({ where: { workspaceId: workspace, action: 'task.deleted' } })).toBe(2);
 });
});
