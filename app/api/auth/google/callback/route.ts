import { NextRequest, NextResponse } from 'next/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { db } from '@/lib/db';
import { setSession } from '@/lib/auth';
export const runtime='nodejs';
const jwks=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export async function GET(request:NextRequest){
 const base=process.env.APP_URL||'http://localhost:3000';
 const incoming=new URL(request.url);
 const state=incoming.searchParams.get('state'),code=incoming.searchParams.get('code');
 const savedState=request.cookies.get('oauth_state')?.value;
 const verifier=request.cookies.get('oauth_verifier')?.value;
 const nonce=request.cookies.get('oauth_nonce')?.value;
 const fail=()=>NextResponse.redirect(`${base}/login?error=google`);
 if(!state||!code||!savedState||!verifier||!nonce||state!==savedState)return fail();
 try{
  const clientId=process.env.GOOGLE_CLIENT_ID!,clientSecret=process.env.GOOGLE_CLIENT_SECRET!;
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:clientId,client_secret:clientSecret,redirect_uri:`${base}/api/auth/google/callback`,grant_type:'authorization_code',code_verifier:verifier}),cache:'no-store'});
  if(!response.ok)return fail();
  const token=await response.json() as {id_token?:string};if(!token.id_token)return fail();
  const {payload}=await jwtVerify(token.id_token,jwks,{issuer:['https://accounts.google.com','accounts.google.com'],audience:clientId});
  if(payload.nonce!==nonce||payload.email_verified!==true||typeof payload.email!=='string'||!payload.sub)return fail();
  const address=payload.email.toLowerCase();const name=typeof payload.name==='string'?payload.name:address.split('@')[0];
  const account=await db.oAuthAccount.findUnique({where:{provider_providerAccountId:{provider:'google',providerAccountId:payload.sub}}});
  let user=account?await db.user.findUnique({where:{id:account.userId}}):null;
  if(!user){
   user=await db.user.findUnique({where:{email:address}});
   if(user)return NextResponse.redirect(`${base}/login?error=google-link`);
   else user=await db.user.create({data:{email:address,name,emailVerifiedAt:new Date(),oauthAccounts:{create:{provider:'google',providerAccountId:payload.sub}},memberships:{create:{role:'OWNER',workspace:{create:{name:`${name}'s workspace`}}}}}});
  }
  await setSession(user.id);
  const result=NextResponse.redirect(base);for(const cookie of ['oauth_state','oauth_verifier','oauth_nonce'])result.cookies.delete(cookie);return result;
 }catch{return fail()}
}
