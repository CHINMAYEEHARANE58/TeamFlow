import LiveRefresh from '@/app/live-refresh';
import Link from 'next/link';
import { requireWorkspace } from '@/lib/access';
import { db } from '@/lib/db';
export const dynamic='force-dynamic';
export default async function Calendar(){const {workspace}=await requireWorkspace();const tasks=await db.task.findMany({where:{project:{workspaceId:workspace.id,archived:false},dueDate:{not:null}},include:{project:true},orderBy:{dueDate:'asc'},take:200});const groups=Object.groupBy(tasks,t=>t.dueDate!.toISOString().slice(0,10));return <main className="subpage"><LiveRefresh/><Link href="/">← Dashboard</Link><p className="eyebrow">UPCOMING WORK</p><h1>Calendar</h1><p>Tasks with due dates across {workspace.name}.</p>{Object.entries(groups).map(([day,items])=><section className="panel calendar-day" key={day}><h2>{new Date(`${day}T12:00:00`).toLocaleDateString('en',{weekday:'long',month:'long',day:'numeric'})}</h2>{items?.map(t=><div className="setting-row" key={t.id}><Link href={`/tasks/${t.id}`}>{t.title}</Link><span>{t.project.name} · {t.status.replace('_',' ').toLowerCase()}</span></div>)}</section>)}{!tasks.length&&<div className="panel empty">No tasks have due dates yet.</div>}</main>}
