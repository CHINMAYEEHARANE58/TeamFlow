import { db } from './db';
import { taskForUser } from './permissions';
import { recordEvent } from './events';
import { deleteAttachment } from './storage';

export async function deleteLeafTask(userId: string, taskId: string, version: number) {
 const task = await taskForUser(userId, taskId, ['OWNER', 'ADMIN', 'MANAGER']);
 if (!task) return { kind: 'forbidden' as const };
 const result = await db.$transaction(async tx => {
  if (await tx.task.count({ where: { parentId: taskId } })) return { kind: 'has_subtasks' as const };
  const attachments = await tx.attachment.findMany({ where: { taskId }, select: { objectKey: true } });
  const deleted = await tx.task.deleteMany({ where: { id: taskId, version } });
  if (!deleted.count) return { kind: 'conflict' as const };
  await recordEvent(tx, task.project.workspaceId, userId, 'task', taskId, 'deleted', { title: task.title });
  await tx.auditLog.create({ data: { workspaceId: task.project.workspaceId, actorId: userId, action: 'task.deleted', targetType: 'task', targetId: taskId, details: { title: task.title } } });
  return { kind: 'deleted' as const, keys: attachments.map(attachment => attachment.objectKey) };
 }, { isolationLevel: 'Serializable' });
 if (result.kind === 'deleted') for (const key of result.keys) {
  try { await deleteAttachment(key) } catch (error) { console.error('Attachment cleanup failed', key, error) }
 }
 return result;
}
