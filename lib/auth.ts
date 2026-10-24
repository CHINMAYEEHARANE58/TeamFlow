import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { db } from './db';
export const sessionCookie = 'teamflow_session';
export const tokenHash = (token:string) => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export async function setSession(userId:string) {
  const token=newToken();
  await db.session.create({data:{userId,tokenHash:tokenHash(token),expiresAt:new Date(Date.now()+7*86400_000)}});
  (await cookies()).set(sessionCookie,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:7*86400});
}
export async function currentUser() {
  const token=(await cookies()).get(sessionCookie)?.value;
  if(!token) return null;
  const session=await db.session.findUnique({where:{tokenHash:tokenHash(token)},include:{user:true}});
  if(!session || session.expiresAt<=new Date()) return null;
  return session.user;
}
export async function clearSession(){const jar=await cookies();const token=jar.get(sessionCookie)?.value;if(token) await db.session.deleteMany({where:{tokenHash:tokenHash(token)}});jar.delete(sessionCookie);}
export async function selectedWorkspaceId(){return (await cookies()).get('teamflow_workspace')?.value ?? null;}
export async function setSelectedWorkspace(id:string){(await cookies()).set('teamflow_workspace',id,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:365*86400});}
