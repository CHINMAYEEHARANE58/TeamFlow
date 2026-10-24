import LiveRefresh from '@/app/live-refresh';
import Link from 'next/link';
import { requireWorkspace } from '@/lib/access';
import { db } from '@/lib/db';
import Board from './view';
export const dynamic='force-dynamic';
export default async function BoardPage(){const {workspace,membership}=await requireWorkspace();const tasks=await db.task.findMany({where:{project:{workspaceId:workspace.id,archived:false}},include:{project:true,assignee:true},orderBy:{position:'asc'},take:500});return <main className="subpage wide"><LiveRefresh/><Link href="/">← Dashboard</Link><p className="eyebrow">VISUAL WORKFLOW</p><h1>Board</h1><p>Move work between stages. Changes are saved immediately.</p><Board canEdit={membership.role!=='GUEST'} tasks={tasks.map(t=>({id:t.id,title:t.title,status:t.status,priority:t.priority,version:t.version,project:t.project.name,assignee:t.assignee?.name||null}))}/></main>}
