import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireTask } from '@/lib/access';
import { getAttachment } from '@/lib/storage';
export const runtime='nodejs';
export async function GET(_request:NextRequest,{params}:{params:Promise<{id:string}>}){const {id}=await params;const attachment=await db.attachment.findUnique({where:{id}});if(!attachment)return new NextResponse('Not found',{status:404});try{await requireTask(attachment.taskId);const body=await getAttachment(attachment.objectKey);return new NextResponse(new Uint8Array(body),{headers:{'content-type':attachment.mimeType,'content-disposition':`attachment; filename="${attachment.name.replace(/["\\\r\n]/g,'_')}"`,'x-content-type-options':'nosniff','cache-control':'private, no-store'}})}catch{return new NextResponse('Forbidden',{status:403})}}
