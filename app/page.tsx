import { redirect } from 'next/navigation';
import { currentUser, selectedWorkspaceId } from '@/lib/auth';
import { db } from '@/lib/db';
import Dashboard from './workspace';

export const dynamic = 'force-dynamic';

export default async function Home() {
 const user = await currentUser();
 if (!user) redirect('/login');
 const memberships = await db.membership.findMany({ where: { userId: user.id }, include: { workspace: true }, orderBy: { id: 'asc' } });
 const selected = await selectedWorkspaceId();
 const membership = memberships.find(m => m.workspaceId === selected) || memberships[0];
 if (!membership) return <main>No workspace found.</main>;
 const workspaceId = membership.workspaceId;
 const scope = { project: { workspaceId, archived: false } };
 const [workspace, recentTasks, groups, overdue, myTasks, activity] = await Promise.all([
  db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, include: { projects: { where: { archived: false }, orderBy: { createdAt: 'asc' } }, memberships: { include: { user: true } } } }),
  db.task.findMany({ where: scope, include: { assignee: true }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 100 }),
  db.task.groupBy({ by: ['projectId', 'status'], where: scope, _count: { _all: true } }),
  db.task.count({ where: { ...scope, dueDate: { lt: new Date() }, status: { not: 'DONE' } } }),
  db.task.count({ where: { ...scope, assigneeId: user.id, status: { not: 'DONE' } } }),
  db.activityLog.findMany({ where: { workspaceId }, include: { actor: true }, orderBy: { createdAt: 'desc' }, take: 5 }),
 ]);
 const counts = new Map<string, { total: number; completed: number }>();
 let total = 0, active = 0, done = 0;
 for (const group of groups) {
  const count = group._count._all;
  const project = counts.get(group.projectId) || { total: 0, completed: 0 };
  project.total += count;
  if (group.status === 'DONE') { project.completed += count; done += count; }
  if (group.status === 'IN_PROGRESS') active += count;
  total += count;
  counts.set(group.projectId, project);
 }
 const recentByProject = new Map<string, typeof recentTasks>();
 for (const task of recentTasks) {
  const list = recentByProject.get(task.projectId) || [];
  list.push(task);
  recentByProject.set(task.projectId, list);
 }
 return <Dashboard
  activity={activity.map(a => ({ id: a.id, actor: a.actor.name, entityType: a.entityType, title: a.entityType === 'task' ? (recentTasks.find(t => t.id === a.entityId)?.title || 'Task') : a.entityType, action: a.action, createdAt: a.createdAt.toISOString() }))}
  stats={{ total, active, done, overdue, myTasks }}
  user={{ id: user.id, name: user.name }}
  workspace={{ id: workspace.id, name: workspace.name, role: membership.role, workspaces: memberships.map(m => ({ id: m.workspaceId, name: m.workspace.name })), members: workspace.memberships.map(m => ({ id: m.user.id, name: m.user.name })), projects: workspace.projects.map(p => ({ ...p, taskCount: counts.get(p.id)?.total || 0, completedCount: counts.get(p.id)?.completed || 0, tasks: (recentByProject.get(p.id) || []).map(t => ({ ...t, dueDate: t.dueDate?.toISOString() ?? null, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() })) })) }}
 />;
}
