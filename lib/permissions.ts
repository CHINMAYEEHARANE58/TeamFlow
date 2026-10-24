import { db } from './db';
import type { Role, Prisma } from '@/generated/prisma/client';
function projectAccess(userId:string,allowed?:Role[]):Prisma.ProjectWhereInput{
 const membership={workspace:{memberships:{some:{userId}}}};
 if(!allowed)return membership;
 const workspaceRole={workspace:{memberships:{some:{userId,role:{in:allowed}}}}};
 const manager:Prisma.ProjectWhereInput|undefined=allowed.includes('MANAGER')?{AND:[{workspace:{memberships:{some:{userId,role:{not:'GUEST' as Role}}}}},{members:{some:{userId,role:'MANAGER' as const}}}]}:undefined;
 return {AND:[membership,{OR:manager?[workspaceRole,manager]:[workspaceRole]}]};
}
export function projectForUser(userId:string,projectId:string,allowed?:Role[]){return db.project.findFirst({where:{id:projectId,...projectAccess(userId,allowed)},include:{workspace:true}})}
export function taskForUser(userId:string,taskId:string,allowed?:Role[]){return db.task.findFirst({where:{id:taskId,project:projectAccess(userId,allowed)},include:{project:true}})}
export async function changeTaskStatus(userId:string,taskId:string,version:number,status:'TODO'|'IN_PROGRESS'|'IN_REVIEW'|'DONE'){
 const task=await taskForUser(userId,taskId,['OWNER','ADMIN','MANAGER','MEMBER']);if(!task)return {kind:'forbidden' as const};
 const result=await db.task.updateMany({where:{id:taskId,version},data:{status,customStatusId:null,version:{increment:1}}});return result.count?{kind:'updated' as const}:{kind:'conflict' as const};
}
