import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { AccessError, requireTask } from '@/lib/access';
import { deleteAttachment, putAttachment } from '@/lib/storage';
import { db } from '@/lib/db';
import { sameOrigin } from '@/lib/http';
import { recordEvent } from '@/lib/events';
export const runtime='nodejs';
const allowed=new Set(['application/pdf','image/png','image/jpeg','image/webp','text/plain']);
function matchesType(bytes:Buffer,type:string){if(type==='application/pdf')return bytes.subarray(0,5).toString()==='%PDF-';if(type==='image/png')return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));if(type==='image/jpeg')return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;if(type==='image/webp')return bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';if(type==='text/plain')return !bytes.includes(0);return false}
export async function POST(request:NextRequest){
 try{
  if(!sameOrigin(request))return NextResponse.json({error:'Invalid origin'},{status:403});
  if(!request.headers.get('content-length')||Number(request.headers.get('content-length'))>11_000_000)return NextResponse.json({error:'File too large'},{status:413});
  const data=await request.formData().catch(()=>null);if(!data)return NextResponse.json({error:'Invalid upload'},{status:400});const taskId=data.get('taskId');const file=data.get('file');
  if(typeof taskId!=='string'||!(file instanceof File))return NextResponse.json({error:'Invalid upload'},{status:400});
  const {user,task}=await requireTask(taskId,['OWNER','ADMIN','MANAGER','MEMBER']);
  if(!allowed.has(file.type)||file.size>10_000_000||file.size<1)return NextResponse.json({error:'Unsupported file'},{status:400});
  const bytes=Buffer.from(await file.arrayBuffer());if(!matchesType(bytes,file.type))return NextResponse.json({error:'File content does not match its type'},{status:400});const key=randomUUID();await putAttachment(key,bytes,file.type);
  try{await db.$transaction(async tx=>{await tx.attachment.create({data:{taskId,uploadedById:user.id,objectKey:key,name:file.name.slice(0,255),mimeType:file.type,size:file.size}});await recordEvent(tx,task.project.workspaceId,user.id,'task',taskId,'attachment_added')})}catch(error){await deleteAttachment(key).catch(cleanupError=>console.error('Upload cleanup failed',cleanupError));throw error}
  return NextResponse.redirect(new URL(`/tasks/${taskId}`,request.url),303);
 }catch(error){if(error instanceof AccessError)return NextResponse.json({error:'Forbidden'},{status:403});console.error('Attachment upload failed',error);return NextResponse.json({error:'Upload failed'},{status:500})}
}
