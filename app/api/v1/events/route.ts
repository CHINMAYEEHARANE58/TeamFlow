import { NextRequest } from 'next/server';
import { requireWorkspace } from '@/lib/access';
import { db } from '@/lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 let workspaceId:string;try{workspaceId=(await requireWorkspace()).workspace.id}catch{return new Response('Unauthorized',{status:401})}
 let lastTime=new Date(Date.now()-60_000);let lastId='';const cursor=request.headers.get('last-event-id')||new URL(request.url).searchParams.get('after');
 if(cursor){const [timestamp,id]=cursor.split(':');const value=Number(timestamp);if(Number.isFinite(value)&&value>0&&id){lastTime=new Date(value);lastId=id}}
 const encoder=new TextEncoder();let timer:ReturnType<typeof setInterval>|undefined;let busy=false;
 const stream=new ReadableStream<Uint8Array>({start(controller){const tick=async()=>{if(busy)return;busy=true;try{const events=await db.workspaceEvent.findMany({where:{workspaceId,OR:[{createdAt:{gt:lastTime}},{createdAt:lastTime,id:{gt:lastId}}]},orderBy:[{createdAt:'asc'},{id:'asc'}],take:100});for(const event of events){lastTime=event.createdAt;lastId=event.id;controller.enqueue(encoder.encode(`id: ${event.createdAt.getTime()}:${event.id}\nevent: change\ndata: ${JSON.stringify({type:event.type,entityId:event.entityId})}\n\n`))}if(!events.length)controller.enqueue(encoder.encode(': keep-alive\n\n'))}catch{if(timer)clearInterval(timer);try{controller.close()}catch{}}finally{busy=false}};void tick();timer=setInterval(()=>void tick(),3000);request.signal.addEventListener('abort',()=>{if(timer)clearInterval(timer);try{controller.close()}catch{}},{once:true})},cancel(){if(timer)clearInterval(timer)}});
 return new Response(stream,{headers:{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache, no-transform','connection':'keep-alive','x-accel-buffering':'no'}});
}
