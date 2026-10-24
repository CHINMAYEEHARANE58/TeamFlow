import LiveRefresh from '@/app/live-refresh';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireProject } from '@/lib/access';
import { db } from '@/lib/db';
import Board from '@/app/board/view';
export const dynamic='force-dynamic';
export default async function ProjectBoard({params}:{params:Promise<{id:string}>}){const {id}=await params;let access;try{access=await requireProject(id)}catch{notFound()}const [statuses,tasks,member]=await Promise.all([db.projectStatus.findMany({where:{projectId:id},orderBy:{position:'asc'}}),db.task.findMany({where:{projectId:id},include:{assignee:true},orderBy:{position:'asc'},take:500}),db.membership.findUniqueOrThrow({where:{userId_workspaceId:{userId:access.user.id,workspaceId:access.project.workspaceId}}})]);const columns:[string,string][]=[['backlog','Backlog'],...statuses.map(s=>[s.id,s.name] as [string,string])];return <main className="subpage wide"><LiveRefresh/><Link href={`/projects/${id}`}>← Project settings</Link><p className="eyebrow">CUSTOM WORKFLOW</p><h1>{access.project.name} board</h1><Board custom columns={columns} canEdit={member.role!=='GUEST'} tasks={tasks.map(t=>({id:t.id,title:t.title,status:t.customStatusId||'backlog',priority:t.priority,version:t.version,project:access.project.name,assignee:t.assignee?.name||null}))}/></main>}
