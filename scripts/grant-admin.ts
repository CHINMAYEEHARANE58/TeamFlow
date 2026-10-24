import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
async function main(){
 const address=process.argv[2]?.trim().toLowerCase();
 if(!address||!address.includes('@'))throw new Error('Usage: npm run admin:grant -- email@example.com');
 const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL!})});
 try{
  const user=await db.user.findUnique({where:{email:address}});
  if(!user||!user.emailVerifiedAt)throw new Error('Verified user not found');
  await db.user.update({where:{id:user.id},data:{isPlatformAdmin:true}});
  console.log(`Granted platform administration to ${address}`);
 }finally{await db.$disconnect()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
