import { db } from './db';
import { currentUser, selectedWorkspaceId } from './auth';
import { projectForUser, taskForUser } from './permissions';
import type { Role } from '@/generated/prisma/client';
export class AccessError extends Error {constructor(message='Forbidden'){super(message)}}
export async function requireUser(){const user=await currentUser();if(!user) throw new AccessError('Unauthenticated');return user;}
export async function requireWorkspace(allowed?:Role[]){
 const user=await requireUser();const selected=await selectedWorkspaceId();
 const membership=await db.membership.findFirst({where:{userId:user.id,...(selected?{workspaceId:selected}:{}),},include:{workspace:true},orderBy:{id:'asc'}});
 if(!membership||allowed&&!allowed.includes(membership.role)) throw new AccessError();return {user,membership,workspace:membership.workspace};
}
export async function requireProject(projectId:string, allowed?:Role[]){
 const user=await requireUser();const project=await projectForUser(user.id,projectId,allowed);
 if(!project) throw new AccessError();return {user,project};
}
export async function requireTask(taskId:string,allowed?:Role[]){
 const user=await requireUser();const task=await taskForUser(user.id,taskId,allowed);
 if(!task) throw new AccessError();return {user,task};
}
export const editors:Role[]=['OWNER','ADMIN','MANAGER','MEMBER'];
export const managers:Role[]=['OWNER','ADMIN','MANAGER'];
export const admins:Role[]=['OWNER','ADMIN'];
