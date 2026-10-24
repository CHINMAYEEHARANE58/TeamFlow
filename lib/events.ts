import { db } from './db';
import type { Prisma } from '@/generated/prisma/client';
export async function recordEvent(tx:Prisma.TransactionClient,workspaceId:string,actorId:string,entityType:string,entityId:string,action:string,details?:Prisma.InputJsonValue){
 await tx.activityLog.create({data:{workspaceId,actorId,entityType,entityId,action,details}});
 await tx.workspaceEvent.create({data:{workspaceId,type:`${entityType}.${action}`,entityId,payload:details??{}}});
}
export async function notify(userId:string,workspaceId:string,title:string,body:string,href:string){
 const preference=await db.notificationPreference.findUnique({where:{userId}});
 if(preference?.inAppEnabled===false)return;
 await db.notification.create({data:{userId,workspaceId,title,body,href,type:title==='Task assigned'?'TASK_ASSIGNED':'TASK_UPDATED'}});
 if(preference?.emailEnabled!==false){const user=await db.user.findUnique({where:{id:userId},select:{email:true}});if(user)await db.emailJob.create({data:{to:user.email,subject:`TeamFlow: ${title}`,body:`${body}\n\nOpen ${(process.env.APP_URL||'http://localhost:3000')}${href}`}})}
}
