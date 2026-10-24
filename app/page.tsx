import { redirect } from 'next/navigation';
import { currentUser, selectedWorkspaceId } from '@/lib/auth';
import { db } from '@/lib/db';
import Dashboard from './workspace';
export const dynamic='force-dynamic';
export default async function Home(){
 const user=await currentUser();if(!user)redirect('/login');
 const memberships=await db.membership.findMany({where:{userId:user.id},include:{workspace:true},orderBy:{id:'asc'}});
 const selected=await selectedWorkspaceId();const membership=memberships.find(m=>m.workspaceId===selected)||memberships[0];
 if(!membership) return <main>No workspace found.</main>;
 const workspace=await db.workspace.findUniqueOrThrow({where:{id:membership.workspaceId},include:{projects:{where:{archived:false},include:{tasks:{include:{assignee:true},orderBy:{updatedAt:'desc'}}},orderBy:{createdAt:'asc'}},memberships:{include:{user:true}}}});
 const activity=await db.activityLog.findMany({where:{workspaceId:workspace.id},include:{actor:true},orderBy:{createdAt:'desc'},take:5});
 return <Dashboard activity={activity.map(a=>({id:a.id,actor:a.actor.name,entityType:a.entityType,title:a.entityType==='task'?(workspace.projects.flatMap(p=>p.tasks).find(t=>t.id===a.entityId)?.title||'Task'):a.entityType,action:a.action,createdAt:a.createdAt.toISOString()}))} user={{id:user.id,name:user.name}} workspace={{id:workspace.id,name:workspace.name,role:membership.role,workspaces:memberships.map(m=>({id:m.workspaceId,name:m.workspace.name})),members:workspace.memberships.map(m=>({id:m.user.id,name:m.user.name})),projects:workspace.projects.map(p=>({...p,tasks:p.tasks.map(t=>({...t,dueDate:t.dueDate?.toISOString()??null,createdAt:t.createdAt.toISOString(),updatedAt:t.updatedAt.toISOString()}))}))}}/>;
}
