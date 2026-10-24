import nodemailer from 'nodemailer';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
type Message={to:string;subject:string;text:string};
export async function sendEmail(message:Message){
 if(process.env.SMTP_HOST){
  const port=Number(process.env.SMTP_PORT||587);
  const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port,secure:port===465,auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}:undefined});
  await transport.sendMail({from:process.env.EMAIL_FROM||'TeamFlow <no-reply@localhost>',...message});return;
 }
 if(process.env.NODE_ENV==='production') throw new Error('SMTP_HOST is required in production');
 const outbox=join(process.cwd(),'.data','outbox');await mkdir(outbox,{recursive:true});await writeFile(join(outbox,`${randomUUID()}.json`),JSON.stringify(message),{mode:0o600});console.info(`[LOCAL EMAIL] To: ${message.to}; saved to .data/outbox`);
}
