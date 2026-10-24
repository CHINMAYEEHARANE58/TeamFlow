import { NextRequest } from 'next/server';
import { requireWorkspace } from '@/lib/access';
import { db } from '@/lib/db';
import { sessionCookie, tokenHash } from '@/lib/auth';
import { parseEventCursor } from '@/lib/realtime-cursor';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 let workspaceId:string;try{workspaceId=(await requireWorkspace()).workspace.id}catch{return new Response('Unauthorized',{status:401})}
 const token=request.cookies.get(sessionCookie)?.value;
 if(!token)return new Response('Unauthorized',{status:401});
 const sessionHash=tokenHash(token);
 let lastTime=new Date(Date.now()-60_000);let lastId='';const cursor=request.headers.get('last-event-id')||new URL(request.url).searchParams.get('after');
 const parsedCursor=parseEventCursor(cursor);if(parsedCursor){lastTime=parsedCursor.time;lastId=parsedCursor.id}
 const encoder=new TextEncoder();let timer:ReturnType<typeof setInterval>|undefined;let busy=false;
 const stream=new ReadableStream<Uint8Array>({start(controller){const tick=async()=>{if(busy)return;busy=true;try{const session=await db.session.findUnique({where:{tokenHash:sessionHash},select:{userId:true,expiresAt:true}});const allowed=session&&session.expiresAt>new Date()&&await db.membership.findUnique({where:{userId_workspaceId:{userId:session.userId,workspaceId}},select:{id:true}});if(!allowed){if(timer)clearInterval(timer);controller.close();return}const events=await db.workspaceEvent.findMany({where:{workspaceId,OR:[{createdAt:{gt:lastTime}},{createdAt:lastTime,id:{gt:lastId}}]},orderBy:[{createdAt:'asc'},{id:'asc'}],take:100});for(const event of events){lastTime=event.createdAt;lastId=event.id;controller.enqueue(encoder.encode(`id: ${event.createdAt.getTime()}:${event.id}\nevent: change\ndata: ${JSON.stringify({type:event.type,entityId:event.entityId})}\n\n`))}if(!events.length)controller.enqueue(encoder.encode(': keep-alive\n\n'))}catch{if(timer)clearInterval(timer);try{controller.close()}catch{}}finally{busy=false}};void tick();timer=setInterval(()=>void tick(),3000);request.signal.addEventListener('abort',()=>{if(timer)clearInterval(timer);try{controller.close()}catch{}},{once:true})},cancel(){if(timer)clearInterval(timer)}});
 return new Response(stream,{headers:{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache, no-transform','connection':'keep-alive','x-accel-buffering':'no'}});
}
