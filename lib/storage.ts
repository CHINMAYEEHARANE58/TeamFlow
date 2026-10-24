import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
const localRoot=join(process.cwd(),'.data','attachments');
function s3(){const {S3_BUCKET,S3_ENDPOINT,S3_REGION,S3_ACCESS_KEY_ID,S3_SECRET_ACCESS_KEY}=process.env;if(!S3_BUCKET||!S3_REGION||!S3_ACCESS_KEY_ID||!S3_SECRET_ACCESS_KEY){if(process.env.NODE_ENV==='production')throw new Error('S3 configuration is required');return null;}return {bucket:S3_BUCKET,client:new S3Client({region:S3_REGION,endpoint:S3_ENDPOINT||undefined,forcePathStyle:!!S3_ENDPOINT,credentials:{accessKeyId:S3_ACCESS_KEY_ID,secretAccessKey:S3_SECRET_ACCESS_KEY}})};}
export async function putAttachment(key:string,body:Buffer,mimeType:string){const remote=s3();if(remote){await remote.client.send(new PutObjectCommand({Bucket:remote.bucket,Key:key,Body:body,ContentType:mimeType}));return;}await mkdir(localRoot,{recursive:true});await writeFile(join(localRoot,key),body,{flag:'wx'});}
export async function getAttachment(key:string){const remote=s3();if(remote){const result=await remote.client.send(new GetObjectCommand({Bucket:remote.bucket,Key:key}));return Buffer.from(await result.Body!.transformToByteArray());}return readFile(join(localRoot,key));}
export async function deleteAttachment(key:string){const remote=s3();if(remote){await remote.client.send(new DeleteObjectCommand({Bucket:remote.bucket,Key:key}));return;}await unlink(join(localRoot,key));}
