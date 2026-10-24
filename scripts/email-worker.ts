import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { sendEmail } from '../lib/email';
const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL!})});
let stopped=false;process.on('SIGTERM',()=>{stopped=true});process.on('SIGINT',()=>{stopped=true});
async function run(){while(!stopped){const now=new Date();const job=await db.emailJob.findFirst({where:{deliveredAt:null,availableAt:{lte:now},OR:[{lockUntil:null},{lockUntil:{lt:now}}]},orderBy:{createdAt:'asc'}});if(!job){await new Promise(r=>setTimeout(r,2000));continue}const claimed=await db.emailJob.updateMany({where:{id:job.id,deliveredAt:null,OR:[{lockUntil:null},{lockUntil:{lt:now}}]},data:{lockUntil:new Date(Date.now()+300_000),attempts:{increment:1}}});if(!claimed.count)continue;try{await sendEmail({to:job.to,subject:job.subject,text:job.body});await db.emailJob.update({where:{id:job.id},data:{deliveredAt:new Date(),lockUntil:null,lastError:null}})}catch(error){await db.emailJob.update({where:{id:job.id},data:{lockUntil:null,availableAt:new Date(Date.now()+Math.min(3600_000,2**job.attempts*30_000)),lastError:String(error).slice(0,500)}})}}await db.$disconnect()}
run().catch(error=>{console.error(error);process.exit(1)});
