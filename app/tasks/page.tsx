import LiveRefresh from '@/app/live-refresh';
import Link from 'next/link';
import { requireWorkspace } from '@/lib/access';
import { db } from '@/lib/db';
import { bulkUpdateStatus } from '../actions';

export const dynamic = 'force-dynamic';

type Query = { page?: string; q?: string; status?: string; sort?: string; assignee?: string };

export default async function Tasks({ searchParams }: { searchParams: Promise<Query> }) {
 const { user, workspace, membership } = await requireWorkspace();
 const query = await searchParams;
 const requestedPage = Number(query.page);
 const page = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(100000, requestedPage) : 1;
 const q = (query.q || '').trim().slice(0, 100);
 const status = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'].includes(query.status || '') ? query.status as 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' : undefined;
 const mine = query.assignee === 'me';
 const orderBy = query.sort === 'due' ? { dueDate: 'asc' as const } : query.sort === 'priority' ? { priority: 'desc' as const } : { updatedAt: 'desc' as const };
 const where = { project: { workspaceId: workspace.id, archived: false }, ...(status ? { status } : {}), ...(mine ? { assigneeId: user.id } : {}), ...(q ? { title: { contains: q, mode: 'insensitive' as const } } : {}) };
 const [total, tasks] = await db.$transaction([
  db.task.count({ where }),
  db.task.findMany({ where, include: { project: true, assignee: true }, orderBy, take: 25, skip: (page - 1) * 25 }),
 ]);
 const params = new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), ...(query.sort ? { sort: query.sort } : {}), ...(mine ? { assignee: 'me' } : {}) });
 const link = (n: number) => `/tasks?${params.toString()}&page=${n}`;
 return <main className="subpage"><LiveRefresh/><Link href="/">← Dashboard</Link><p className="eyebrow">WORK ITEMS</p><h1>{mine ? 'My tasks' : 'All tasks'}</h1>
  <form className="inline-form">{mine && <input type="hidden" name="assignee" value="me"/>}<input name="q" placeholder="Search title" aria-label="Search title" defaultValue={q}/><select name="status" aria-label="Filter status" defaultValue={status || ''}><option value="">Any status</option><option value="TODO">To do</option><option value="IN_PROGRESS">In progress</option><option value="IN_REVIEW">In review</option><option value="DONE">Done</option></select><select name="sort" aria-label="Sort tasks" defaultValue={query.sort || 'recent'}><option value="recent">Recently updated</option><option value="due">Due date</option><option value="priority">Priority</option></select><button className="outline-button">Apply</button>{mine && <Link className="outline-button" href="/tasks">All tasks</Link>}</form>
  <section className="panel"><div className="panel-heading"><h2>{total} tasks</h2><span>Page {page}</span></div>
   <form action={bulkUpdateStatus}>{membership.role !== 'GUEST' && <div className="inline-form"><select name="status" aria-label="Bulk status"><option value="TODO">To do</option><option value="IN_PROGRESS">In progress</option><option value="IN_REVIEW">In review</option><option value="DONE">Done</option></select><button className="outline-button">Update selected</button></div>}
    {tasks.map(t => <div className="setting-row" key={t.id}>{membership.role !== 'GUEST' && <input type="checkbox" name="taskId" value={t.id} aria-label={`Select ${t.title}`}/>}<Link href={`/tasks/${t.id}`}>{t.title}</Link><span>{t.project.name} · {t.status.replaceAll('_', ' ').toLowerCase()}</span><span>{t.assignee?.name || 'Unassigned'}</span></div>)}
    {!tasks.length && <p className="empty">No matching tasks.</p>}
   </form>
  </section>
  <nav className="pagination">{page > 1 && <Link href={link(page - 1)}>← Previous</Link>}{page * 25 < total && <Link href={link(page + 1)}>Next →</Link>}</nav>
 </main>;
}
