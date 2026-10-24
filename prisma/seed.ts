import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL!})});
async function main(){
 const email='demo@teamflow.local';const existing=await db.user.findUnique({where:{email}});
 if(existing){
  const done=await db.task.findMany({where:{project:{workspace:{memberships:{some:{userId:existing.id}}}},status:'DONE'},include:{project:true}});
  for(const task of done){const logged=await db.activityLog.findFirst({where:{workspaceId:task.project.workspaceId,entityType:'task',entityId:task.id,action:'completed'}});if(!logged)await db.activityLog.create({data:{workspaceId:task.project.workspaceId,actorId:existing.id,entityType:'task',entityId:task.id,action:'completed'}})}
  return;
 }
 const passwordHash=await bcrypt.hash('teamflow-demo',12);
 await db.$transaction(async tx=>{
  const user=await tx.user.create({data:{name:'Alex Morgan',email,passwordHash,emailVerifiedAt:new Date()}});
  const workspace=await tx.workspace.create({data:{name:'Acme Studio',memberships:{create:{userId:user.id,role:'OWNER'}}}});
  const projects=[
   {name:'Website redesign',description:'A fresh new home for our brand.',color:'#7561df',tasks:[['Create wireframes for homepage','DONE','HIGH'],['Design new landing page','IN_PROGRESS','HIGH'],['Review responsive layouts','IN_REVIEW','MEDIUM']]},
   {name:'Mobile app launch',description:'Taking the experience on the go.',color:'#67b99b',tasks:[['Define onboarding flow','DONE','MEDIUM'],['Build navigation components','IN_PROGRESS','HIGH']]},
   {name:'Brand refresh',description:'A little more us, everywhere.',color:'#e6a06a',tasks:[['Explore new color palette','DONE','LOW'],['Update brand guidelines','TODO','MEDIUM']]}
  ] as const;
  for(const {tasks,...project} of projects){const created=await tx.project.create({data:{...project,workspaceId:workspace.id,tasks:{create:tasks.map(([title,status,priority])=>({title,status,priority,assigneeId:user.id}))}},include:{tasks:true}});for(const task of created.tasks)await tx.activityLog.create({data:{workspaceId:workspace.id,actorId:user.id,entityType:'task',entityId:task.id,action:task.status==='DONE'?'completed':'created'}})}
 });console.log('Demo account: demo@teamflow.local / teamflow-demo');
}
main().finally(()=>db.$disconnect());
