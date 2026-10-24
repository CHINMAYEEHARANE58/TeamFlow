import LiveRefresh from '@/app/live-refresh';
import Link from 'next/link';
import { requireWorkspace } from '@/lib/access';
import { db } from '@/lib/db';
import { sprintMetrics } from '@/lib/metrics';

export const dynamic = 'force-dynamic';

function day(value: string | undefined, end = false): Date | null {
 if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
 const date = new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}Z`);
 return Number.isFinite(date.getTime()) ? date : null;
}

export default async function Reports({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
 const { workspace } = await requireWorkspace();
 const params = await searchParams;
 const toDate = day(params.to, true) || new Date();
 const candidate = day(params.from) || new Date(toDate.getTime() - 30 * 86400_000);
 const fromDate = candidate <= toDate && toDate.getTime() - candidate.getTime() <= 366 * 86400_000 ? candidate : new Date(toDate.getTime() - 30 * 86400_000);
 const [tasks, sprints, members, logs] = await Promise.all([
  db.task.findMany({ where: { project: { workspaceId: workspace.id } }, include: { project: true, assignee: true } }),
  db.sprint.findMany({ where: { project: { workspaceId: workspace.id } }, include: { tasks: true, project: true, report: true } }),
  db.membership.findMany({ where: { workspaceId: workspace.id }, include: { user: true } }),
  db.activityLog.findMany({ where: { workspaceId: workspace.id, entityType: 'task', action: { in: ['status_changed', 'completed'] }, createdAt: { gte: fromDate, lte: toDate } }, select: { entityId: true, action: true, details: true, createdAt: true }, orderBy: { createdAt: 'asc' } }),
 ]);
 const completions = new Map<string, Date>();
 for (const log of logs) {
  const details = log.details as { status?: string } | null;
  if (log.action === 'completed' || details?.status === 'DONE') completions.set(log.entityId, log.createdAt);
 }
 const bucketCount = 7;
 const width = Math.max(1, (toDate.getTime() - fromDate.getTime()) / bucketCount);
 const buckets = Array.from({ length: bucketCount }, (_, i) => ({ label: new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(fromDate.getTime() + i * width)), count: 0 }));
 for (const date of completions.values()) buckets[Math.min(bucketCount - 1, Math.floor((date.getTime() - fromDate.getTime()) / width))].count++;
 const peak = Math.max(1, ...buckets.map(bucket => bucket.count));
 const overdue = tasks.filter(task => task.dueDate && task.dueDate < new Date() && task.status !== 'DONE');
 return <main className="subpage"><LiveRefresh/><Link href="/">← Dashboard</Link><p className="eyebrow">TEAM INSIGHTS</p><h1>Reports</h1>
  <form className="inline-form"><label>From <input name="from" type="date" defaultValue={fromDate.toISOString().slice(0, 10)}/></label><label>To <input name="to" type="date" defaultValue={toDate.toISOString().slice(0, 10)}/></label><button className="outline-button">Apply</button></form>
  <div className="stats"><div className="stat"><div className="stat-label">COMPLETED IN RANGE</div><div className="stat-value">{completions.size}</div></div><div className="stat"><div className="stat-label">OVERDUE NOW</div><div className="stat-value">{overdue.length}</div></div><div className="stat"><div className="stat-label">ALL TASKS</div><div className="stat-value">{tasks.length}</div></div><div className="stat"><div className="stat-label">SPRINTS</div><div className="stat-value">{sprints.length}</div></div></div>
  <section className="panel completion-panel"><h2>Tasks completed over time</h2><p>Unique tasks marked complete in the selected date range.</p><div className="completion-chart" role="img" aria-label={`Completions by time period: ${buckets.map(bucket => `${bucket.label}, ${bucket.count}`).join('; ')}`}>{buckets.map((bucket, index) => <div className="completion-bucket" key={index}><strong>{bucket.count}</strong><span className="completion-track"><i style={{ height: `${Math.max(4, bucket.count / peak * 100)}%` }}/></span><small>{bucket.label}</small></div>)}</div></section>
  <div className="subgrid"><section className="panel"><h2>Workload by assignee</h2>{members.map(member => <div className="setting-row" key={member.id}><strong>{member.user.name}</strong><span>{tasks.filter(task => task.assigneeId === member.userId && task.status !== 'DONE').length} open tasks</span></div>)}</section><section className="panel"><h2>Sprint velocity</h2>{sprints.map(sprint => <div className="setting-row" key={sprint.id}><strong>{sprint.name}</strong><span>{sprint.report?.completedPoints ?? sprintMetrics(sprint.tasks, sprint.startDate, sprint.endDate).velocity} points · {sprint.state.toLowerCase()}</span></div>)}</section></div>
  <section className="panel calendar-day"><h2>Project progress</h2>{[...new Set(tasks.map(task => task.projectId))].map(id => { const group = tasks.filter(task => task.projectId === id); const done = group.filter(task => task.status === 'DONE').length; return <div key={id} className="setting-row"><strong>{group[0].project.name}</strong><span>{done}/{group.length} complete</span></div> })}</section>
 </main>;
}
