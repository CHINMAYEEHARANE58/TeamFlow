'use server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { clearSession, newToken, setSelectedWorkspace, setSession, tokenHash } from '@/lib/auth';
import { consumeEmailVerificationToken, consumeInvitation } from '@/lib/auth-tokens';
import { requireProject, requireTask, requireUser, requireWorkspace, admins, editors, managers } from '@/lib/access';
import { checkRateLimit } from '@/lib/rate-limit';
import { sendEmail } from '@/lib/email';
import { recordEvent, notify } from '@/lib/events';
import { wouldCreateCycle } from '@/lib/dependencies';
import { deleteLeafTask } from '@/lib/task-deletion';
import { revalidatePath } from 'next/cache';
const email=z.string().trim().email().max(254).transform(v=>v.toLowerCase());
const credentials=z.object({email,password:z.string().min(8).max(72)});
async function limitAuth(action:string,address:string,max:number,windowSeconds:number){await checkRateLimit(`${action}:email:${tokenHash(address)}`,max,windowSeconds);const ip=(await headers()).get('x-real-ip');if(ip)await checkRateLimit(`${action}:ip:${tokenHash(ip)}`,max*10,windowSeconds)}
const safeNext=(value:FormDataEntryValue|null)=>typeof value==='string'&&value.startsWith('/')&&!value.startsWith('//')?value:'/';
export async function login(form:FormData){
 const parsed=credentials.safeParse(Object.fromEntries(form));if(!parsed.success)redirect('/login?error=invalid');
 await limitAuth('login',parsed.data.email,10,900);
 const user=await db.user.findUnique({where:{email:parsed.data.email}});
 if(!user?.passwordHash||!await bcrypt.compare(parsed.data.password,user.passwordHash))redirect('/login?error=invalid');
 if(!user.emailVerifiedAt)redirect('/login?error=unverified');
 await setSession(user.id);redirect(safeNext(form.get('next')));
}
export async function register(form:FormData){
 const parsed=credentials.extend({name:z.string().trim().min(1).max(100),workspace:z.string().trim().min(1).max(100)}).safeParse(Object.fromEntries(form));
 if(!parsed.success)redirect('/register?error=invalid');
 const {name,email:address,password,workspace}=parsed.data;
 await limitAuth('register',address,5,3600);
 const hash=await bcrypt.hash(password,12);const token=newToken();
 try{
  await db.user.create({data:{name,email:address,passwordHash:hash,memberships:{create:{role:'OWNER',workspace:{create:{name:workspace}}}},tokens:{create:{purpose:'VERIFY_EMAIL',tokenHash:tokenHash(token),expiresAt:new Date(Date.now()+86400_000)}}}});
 }catch(error){if(error&&typeof error==='object'&&'code' in error&&error.code==='P2002')redirect('/register?error=exists');throw error}
 const base=process.env.APP_URL||'http://localhost:3000';
 await sendEmail({to:address,subject:'Verify your TeamFlow email',text:`Open ${base}/verify?token=${token} to verify your email. This link expires in 24 hours.`});
 redirect('/login?registered=1');
}
export async function logout(){await clearSession();redirect('/login')}
export async function verifyEmail(form:FormData){
 const token=z.string().min(20).parse(form.get('token'));
 if(!await consumeEmailVerificationToken(token))redirect('/login?error=invalid-token');
 redirect('/login?verified=1');
}
export async function requestPasswordReset(form:FormData){
 const address=email.parse(form.get('email'));await limitAuth('reset',address,5,3600);
 const user=await db.user.findUnique({where:{email:address}});
 if(user){const token=newToken();await db.authToken.create({data:{userId:user.id,purpose:'RESET_PASSWORD',tokenHash:tokenHash(token),expiresAt:new Date(Date.now()+3600_000)}});const base=process.env.APP_URL||'http://localhost:3000';await sendEmail({to:address,subject:'Reset your TeamFlow password',text:`Open ${base}/reset-password?token=${token} to reset your password. This link expires in one hour.`});}
 redirect('/forgot-password?sent=1');
}
export async function resetPassword(form:FormData){
 const token=z.string().min(20).parse(form.get('token'));const password=z.string().min(8).max(72).parse(form.get('password'));
 const row=await db.authToken.findUnique({where:{tokenHash:tokenHash(token)}});if(!row||row.purpose!=='RESET_PASSWORD'||row.usedAt||row.expiresAt<new Date())redirect('/reset-password?error=invalid');
 const hash=await bcrypt.hash(password,12);
 await db.$transaction(async tx=>{const used=await tx.authToken.updateMany({where:{id:row.id,usedAt:null},data:{usedAt:new Date()}});if(!used.count)throw new Error('Token already used');await tx.user.update({where:{id:row.userId},data:{passwordHash:hash}});await tx.session.deleteMany({where:{userId:row.userId}})});
 redirect('/login?reset=1');
}
export async function createWorkspace(form:FormData){const user=await requireUser();const name=z.string().trim().min(1).max(100).parse(form.get('name'));const workspace=await db.workspace.create({data:{name,memberships:{create:{userId:user.id,role:'OWNER'}}}});await setSelectedWorkspace(workspace.id);revalidatePath('/');redirect('/')}
export async function updateWorkspace(form:FormData){const {user,workspace}=await requireWorkspace(admins);const name=z.string().trim().min(1).max(100).parse(form.get('name'));await db.$transaction(async tx=>{await tx.workspace.update({where:{id:workspace.id},data:{name}});await tx.auditLog.create({data:{workspaceId:workspace.id,actorId:user.id,action:'workspace.updated',targetType:'workspace',targetId:workspace.id,details:{name}}})});revalidatePath('/settings');revalidatePath('/')}
export async function switchWorkspace(form:FormData){const user=await requireUser();const workspaceId=z.string().min(1).parse(form.get('workspaceId'));const membership=await db.membership.findUnique({where:{userId_workspaceId:{userId:user.id,workspaceId}}});if(!membership)throw new Error('Forbidden');await setSelectedWorkspace(workspaceId);revalidatePath('/');redirect('/')}
export async function createProject(form:FormData){const {user,workspace}=await requireWorkspace(managers);const name=z.string().trim().min(1).max(100).parse(form.get('name'));await db.$transaction(async tx=>{const p=await tx.project.create({data:{name,workspaceId:workspace.id}});await recordEvent(tx,workspace.id,user.id,'project',p.id,'created',{name});await tx.auditLog.create({data:{workspaceId:workspace.id,actorId:user.id,action:'project.created',targetType:'project',targetId:p.id}})});revalidatePath('/')}
export async function archiveProject(form:FormData){const id=z.string().parse(form.get('id'));const {user,project}=await requireProject(id,managers);await db.$transaction(async tx=>{await tx.project.update({where:{id},data:{archived:true}});await recordEvent(tx,project.workspaceId,user.id,'project',id,'archived');await tx.auditLog.create({data:{workspaceId:project.workspaceId,actorId:user.id,action:'project.archived',targetType:'project',targetId:id}})});revalidatePath('/')}
export async function createTask(form:FormData){
 const parsed=z.object({title:z.string().trim().min(1).max(200),projectId:z.string().min(1),priority:z.enum(['LOW','MEDIUM','HIGH','URGENT']),assigneeId:z.string().optional(),description:z.string().max(10000).optional(),dueDate:z.string().optional()}).parse(Object.fromEntries(form));
 const {user,project}=await requireProject(parsed.projectId,editors);if(project.archived)throw new Error('Project archived');
 const assigneeId=parsed.assigneeId||user.id;
 const member=await db.membership.findUnique({where:{userId_workspaceId:{userId:assigneeId,workspaceId:project.workspaceId}}});if(!member)throw new Error('Assignee is not in this workspace');
 const dueDate=parsed.dueDate?new Date(parsed.dueDate):null;if(dueDate&&isNaN(dueDate.getTime()))throw new Error('Invalid date');
 const task=await db.$transaction(async tx=>{const t=await tx.task.create({data:{title:parsed.title,projectId:project.id,priority:parsed.priority,description:parsed.description||'',dueDate,assigneeId}});await recordEvent(tx,project.workspaceId,user.id,'task',t.id,'created',{title:t.title});return t});
 if(assigneeId!==user.id)await notify(assigneeId,project.workspaceId,'Task assigned',task.title,`/tasks/${task.id}`);
 revalidatePath('/');
}
export async function updateStatus(form:FormData){
 const parsed=z.object({id:z.string(),version:z.coerce.number().int().nonnegative(),status:z.enum(['TODO','IN_PROGRESS','IN_REVIEW','DONE'])}).parse(Object.fromEntries(form));
 const {user,task}=await requireTask(parsed.id,editors);
 await db.$transaction(async tx=>{const result=await tx.task.updateMany({where:{id:task.id,version:parsed.version},data:{status:parsed.status,customStatusId:null,version:{increment:1}}});if(!result.count)throw new Error('Task changed. Refresh and try again.');await recordEvent(tx,task.project.workspaceId,user.id,'task',task.id,'status_changed',{status:parsed.status});});
 if(task.assigneeId&&task.assigneeId!==user.id)await notify(task.assigneeId,task.project.workspaceId,'Task updated',task.title,`/tasks/${task.id}`);
 revalidatePath('/');
}
export async function inviteMember(form:FormData){
 const {user,workspace}=await requireWorkspace(admins);const address=email.parse(form.get('email'));const role=z.enum(['ADMIN','MANAGER','MEMBER','GUEST']).parse(form.get('role'));await checkRateLimit(`invite:${workspace.id}`,30,3600);
 const existing=await db.user.findUnique({where:{email:address}});if(existing&&await db.membership.findUnique({where:{userId_workspaceId:{userId:existing.id,workspaceId:workspace.id}}}))throw new Error('Already a member');
 const token=newToken();const invitation=await db.invitation.create({data:{workspaceId:workspace.id,email:address,role,tokenHash:tokenHash(token),invitedById:user.id,expiresAt:new Date(Date.now()+7*86400_000)}});
 await db.auditLog.create({data:{workspaceId:workspace.id,actorId:user.id,action:'member.invited',targetType:'invitation',targetId:invitation.id,details:{email:address,role}}});
 const base=process.env.APP_URL||'http://localhost:3000';await sendEmail({to:address,subject:`Invitation to ${workspace.name}`,text:`Join ${workspace.name} on TeamFlow: ${base}/invite?token=${token}. This link expires in 7 days.`});revalidatePath('/');
}
export async function acceptInvitation(form:FormData){const user=await requireUser();const token=z.string().min(20).parse(form.get('token'));const workspaceId=await consumeInvitation(token,user.id,user.email);if(!workspaceId)throw new Error('Invalid invitation');await setSelectedWorkspace(workspaceId);redirect('/')}
export async function changeMemberRole(form:FormData){const {user,workspace,membership:actor}=await requireWorkspace(admins);const target=z.string().parse(form.get('userId'));const role=z.enum(['ADMIN','MANAGER','MEMBER','GUEST']).parse(form.get('role'));const membership=await db.membership.findUnique({where:{userId_workspaceId:{userId:target,workspaceId:workspace.id}}});if(!membership||membership.role==='OWNER'||actor.role==='ADMIN'&&membership.role==='ADMIN')throw new Error('Forbidden');await db.$transaction(async tx=>{await tx.membership.update({where:{id:membership.id},data:{role}});await tx.auditLog.create({data:{workspaceId:workspace.id,actorId:user.id,action:'member.role_changed',targetType:'membership',targetId:membership.id,details:{role}}})});revalidatePath('/')}
export async function removeMember(form:FormData){
 const {user,workspace,membership:actor}=await requireWorkspace(admins);
 const targetId=z.string().min(1).parse(form.get('userId'));
 const target=await db.membership.findUnique({where:{userId_workspaceId:{userId:targetId,workspaceId:workspace.id}}});
 if(!target||target.role==='OWNER'||target.userId===user.id||actor.role==='ADMIN'&&target.role==='ADMIN')throw new Error('Forbidden');
 await db.$transaction(async tx=>{
  await tx.projectMember.deleteMany({where:{userId:targetId,project:{workspaceId:workspace.id}}});
  await tx.membership.delete({where:{id:target.id}});
  await tx.auditLog.create({data:{workspaceId:workspace.id,actorId:user.id,action:'member.removed',targetType:'membership',targetId:target.id,details:{userId:targetId}}});
  await recordEvent(tx,workspace.id,user.id,'member',targetId,'removed');
 });
 revalidatePath('/settings');revalidatePath('/');
}
export async function createSprint(form:FormData){const projectId=z.string().parse(form.get('projectId'));const {user,project}=await requireProject(projectId,managers);const name=z.string().trim().min(1).max(100).parse(form.get('name'));const goal=z.string().max(2000).parse(form.get('goal')||'');const startRaw=form.get('startDate'),endRaw=form.get('endDate');const startDate=typeof startRaw==='string'&&startRaw?new Date(startRaw):null;const endDate=typeof endRaw==='string'&&endRaw?new Date(endRaw):null;if(startDate&&isNaN(startDate.getTime())||endDate&&isNaN(endDate.getTime()))throw new Error('Invalid sprint date');if(startDate&&endDate&&endDate<=startDate)throw new Error('Sprint end must follow start');await db.$transaction(async tx=>{const sprint=await tx.sprint.create({data:{projectId,name,goal,startDate,endDate}});await recordEvent(tx,project.workspaceId,user.id,'sprint',sprint.id,'created')});revalidatePath('/')}
export async function setSprintState(form:FormData){const id=z.string().parse(form.get('id'));const state=z.enum(['ACTIVE','COMPLETED']).parse(form.get('state'));const sprint=await db.sprint.findUnique({where:{id},include:{project:true}});if(!sprint)throw new Error('Not found');const {user}=await requireProject(sprint.projectId,managers);if(state==='ACTIVE'&&sprint.state!=='PLANNED')throw new Error('Only planned sprints can start');if(state==='COMPLETED'&&sprint.state!=='ACTIVE')throw new Error('Only active sprints can complete');await db.$transaction(async tx=>{const changed=await tx.sprint.updateMany({where:{id,state:sprint.state},data:{state,completedAt:state==='COMPLETED'?new Date():null,startDate:state==='ACTIVE'?(sprint.startDate||new Date()):sprint.startDate}});if(!changed.count)throw new Error('Sprint changed. Refresh and try again.');if(state==='COMPLETED'){const tasks=await tx.task.findMany({where:{sprintId:id}});await tx.sprintReport.create({data:{sprintId:id,totalPoints:tasks.reduce((n,t)=>n+(t.storyPoints||0),0),completedPoints:tasks.filter(t=>t.status==='DONE').reduce((n,t)=>n+(t.storyPoints||0),0),completedTasks:tasks.filter(t=>t.status==='DONE').length,totalTasks:tasks.length}})}await recordEvent(tx,sprint.project.workspaceId,user.id,'sprint',id,state.toLowerCase())});revalidatePath('/')}
export async function assignSprint(form:FormData){const taskId=z.string().parse(form.get('taskId'));const sprintId=z.string().parse(form.get('sprintId'));const {user,task}=await requireTask(taskId,editors);const sprint=await db.sprint.findFirst({where:{id:sprintId,projectId:task.projectId,state:{not:'COMPLETED'}}});if(!sprint)throw new Error('Invalid sprint');await db.$transaction(async tx=>{await tx.task.update({where:{id:taskId},data:{sprintId,version:{increment:1}}});await recordEvent(tx,task.project.workspaceId,user.id,'task',taskId,'sprint_assigned')});revalidatePath('/')}
export async function addComment(form:FormData){const taskId=z.string().parse(form.get('taskId'));const body=z.string().trim().min(1).max(10000).parse(form.get('body'));const {user,task}=await requireTask(taskId,editors);await db.$transaction(async tx=>{await tx.taskComment.create({data:{taskId,authorId:user.id,body}});await recordEvent(tx,task.project.workspaceId,user.id,'task',taskId,'commented')});if(task.assigneeId&&task.assigneeId!==user.id)await notify(task.assigneeId,task.project.workspaceId,'New comment',task.title,`/tasks/${taskId}`);revalidatePath('/')}
export async function markNotificationRead(form:FormData){const user=await requireUser();const id=z.string().parse(form.get('id'));await db.notification.updateMany({where:{id,userId:user.id},data:{readAt:new Date()}});revalidatePath('/')}
export async function updateTask(form:FormData){
 const parsed=z.object({id:z.string(),version:z.coerce.number().int().nonnegative(),title:z.string().trim().min(1).max(200),description:z.string().max(10000),priority:z.enum(['LOW','MEDIUM','HIGH','URGENT']),assigneeId:z.string().optional(),dueDate:z.string().optional(),storyPoints:z.coerce.number().int().min(0).max(1000).optional()}).parse(Object.fromEntries(form));
 const {user,task}=await requireTask(parsed.id,editors);const workspaceId=task.project.workspaceId;
 if(parsed.assigneeId){const member=await db.membership.findUnique({where:{userId_workspaceId:{userId:parsed.assigneeId,workspaceId}}});if(!member)throw new Error('Assignee not in workspace')}
 const dueDate=parsed.dueDate?new Date(parsed.dueDate):null;if(dueDate&&isNaN(dueDate.getTime()))throw new Error('Invalid date');
 await db.$transaction(async tx=>{const result=await tx.task.updateMany({where:{id:task.id,version:parsed.version},data:{title:parsed.title,description:parsed.description,priority:parsed.priority,assigneeId:parsed.assigneeId||null,dueDate,storyPoints:parsed.storyPoints??null,version:{increment:1}}});if(!result.count)throw new Error('Task changed. Refresh and try again.');await recordEvent(tx,workspaceId,user.id,'task',task.id,'updated')});
 if(parsed.assigneeId&&parsed.assigneeId!==task.assigneeId&&parsed.assigneeId!==user.id)await notify(parsed.assigneeId,workspaceId,'Task assigned',parsed.title,`/tasks/${task.id}`);
 revalidatePath(`/tasks/${task.id}`);revalidatePath('/');
}
export async function deleteTask(form:FormData){const id=z.string().min(1).parse(form.get('id'));const version=z.coerce.number().int().nonnegative().parse(form.get('version'));const user=await requireUser();const result=await deleteLeafTask(user.id,id,version);if(result.kind==='has_subtasks')throw new Error('Delete subtasks first');if(result.kind==='conflict')throw new Error('Task changed. Refresh and try again.');if(result.kind==='forbidden')throw new Error('Forbidden');revalidatePath('/');redirect('/tasks')}
export async function addSubtask(form:FormData){const parentId=z.string().parse(form.get('parentId'));const title=z.string().trim().min(1).max(200).parse(form.get('title'));const {user,task}=await requireTask(parentId,editors);await db.$transaction(async tx=>{const subtask=await tx.task.create({data:{title,projectId:task.projectId,parentId,assigneeId:user.id}});await recordEvent(tx,task.project.workspaceId,user.id,'task',subtask.id,'created',{parentId})});revalidatePath(`/tasks/${parentId}`)}
export async function addDependency(form:FormData){const taskId=z.string().parse(form.get('taskId'));const dependsOnId=z.string().parse(form.get('dependsOnId'));const {user,task}=await requireTask(taskId,editors);const other=await db.task.findFirst({where:{id:dependsOnId,projectId:task.projectId}});if(!other)throw new Error('Invalid dependency');await db.$transaction(async tx=>{const edges=await tx.taskDependency.findMany({where:{task:{projectId:task.projectId}},select:{taskId:true,dependsOnId:true}});if(wouldCreateCycle(taskId,dependsOnId,edges))throw new Error('Dependency cycle');await tx.taskDependency.upsert({where:{taskId_dependsOnId:{taskId,dependsOnId}},create:{taskId,dependsOnId},update:{}});await recordEvent(tx,task.project.workspaceId,user.id,'task',taskId,'dependency_added',{dependsOnId})},{isolationLevel:'Serializable'});revalidatePath(`/tasks/${taskId}`)}
export async function createLabel(form:FormData){const {workspace}=await requireWorkspace(managers);const name=z.string().trim().min(1).max(40).parse(form.get('name'));const color=z.string().regex(/^#[0-9a-fA-F]{6}$/).parse(form.get('color')||'#6366f1');await db.label.create({data:{workspaceId:workspace.id,name,color}});revalidatePath('/')}
export async function addTaskLabel(form:FormData){const taskId=z.string().parse(form.get('taskId'));const labelId=z.string().parse(form.get('labelId'));const {user,task}=await requireTask(taskId,editors);const label=await db.label.findFirst({where:{id:labelId,workspaceId:task.project.workspaceId}});if(!label)throw new Error('Invalid label');await db.$transaction(async tx=>{await tx.taskLabel.upsert({where:{taskId_labelId:{taskId,labelId}},create:{taskId,labelId},update:{}});await recordEvent(tx,task.project.workspaceId,user.id,'task',taskId,'label_added',{labelId})});revalidatePath(`/tasks/${taskId}`)}
export async function bulkUpdateStatus(form:FormData){const {user,workspace}=await requireWorkspace(editors);const status=z.enum(['TODO','IN_PROGRESS','IN_REVIEW','DONE']).parse(form.get('status'));const ids=z.array(z.string()).max(100).parse(form.getAll('taskId'));await db.$transaction(async tx=>{const count=await tx.task.count({where:{id:{in:ids},project:{workspaceId:workspace.id}}});if(count!==new Set(ids).size)throw new Error('Invalid task selection');await tx.task.updateMany({where:{id:{in:ids},project:{workspaceId:workspace.id}},data:{status,customStatusId:null,version:{increment:1}}});for(const id of ids)await recordEvent(tx,workspace.id,user.id,'task',id,'status_changed',{status})});revalidatePath('/')}
export async function updateProject(form:FormData){const id=z.string().parse(form.get('id'));const {user,project}=await requireProject(id,managers);const name=z.string().trim().min(1).max(100).parse(form.get('name'));const description=z.string().max(2000).parse(form.get('description')||'');const color=z.string().regex(/^#[0-9a-fA-F]{6}$/).parse(form.get('color'));await db.$transaction(async tx=>{await tx.project.update({where:{id},data:{name,description,color}});await recordEvent(tx,project.workspaceId,user.id,'project',id,'updated')});revalidatePath(`/projects/${id}`);revalidatePath('/')}
export async function createProjectStatus(form:FormData){const projectId=z.string().parse(form.get('projectId'));const {user,project}=await requireProject(projectId,managers);const name=z.string().trim().min(1).max(40).parse(form.get('name'));const color=z.string().regex(/^#[0-9a-fA-F]{6}$/).parse(form.get('color')||'#64748b');const isDone=form.get('isDone')==='on';const position=await db.projectStatus.count({where:{projectId}});await db.$transaction(async tx=>{const status=await tx.projectStatus.create({data:{projectId,name,color,position,isDone}});await recordEvent(tx,project.workspaceId,user.id,'project_status',status.id,'created',{name})});revalidatePath(`/projects/${projectId}`)}
export async function setCustomStatus(form:FormData){const taskId=z.string().parse(form.get('taskId'));const customStatusId=z.string().parse(form.get('customStatusId'));const version=z.coerce.number().int().nonnegative().parse(form.get('version'));const {user,task}=await requireTask(taskId,editors);const status=customStatusId==='backlog'?null:await db.projectStatus.findFirst({where:{id:customStatusId,projectId:task.projectId}});if(customStatusId!=='backlog'&&!status)throw new Error('Invalid status');await db.$transaction(async tx=>{const result=await tx.task.updateMany({where:{id:taskId,version},data:{customStatusId:status?.id??null,status:status?(status.isDone?'DONE':'IN_PROGRESS'):'TODO',version:{increment:1}}});if(!result.count)throw new Error('Task changed. Refresh and try again.');await recordEvent(tx,task.project.workspaceId,user.id,'task',taskId,'status_changed',{customStatusId,status:status?(status.isDone?'DONE':'IN_PROGRESS'):'TODO'})});revalidatePath(`/tasks/${taskId}`);revalidatePath('/');revalidatePath(`/projects/${task.projectId}/board`)}
export async function addProjectMember(form:FormData){const projectId=z.string().parse(form.get('projectId'));const userId=z.string().parse(form.get('userId'));const role=z.enum(['MANAGER','MEMBER']).parse(form.get('role'));const {user,project}=await requireProject(projectId,managers);const member=await db.membership.findUnique({where:{userId_workspaceId:{userId,workspaceId:project.workspaceId}}});if(!member||member.role==='GUEST')throw new Error('Not an editable workspace member');await db.$transaction(async tx=>{await tx.projectMember.upsert({where:{projectId_userId:{projectId,userId}},create:{projectId,userId,role},update:{role}});await tx.auditLog.create({data:{workspaceId:project.workspaceId,actorId:user.id,action:'project.member_added',targetType:'project',targetId:projectId,details:{userId,role}}})});revalidatePath(`/projects/${projectId}`)}
export async function updateNotificationPreferences(form:FormData){const user=await requireUser();const inAppEnabled=form.get('inAppEnabled')==='on';const emailEnabled=form.get('emailEnabled')==='on';await db.notificationPreference.upsert({where:{userId:user.id},create:{userId:user.id,inAppEnabled,emailEnabled},update:{inAppEnabled,emailEnabled}});revalidatePath('/settings')}
export async function resendVerification(form:FormData){const address=email.parse(form.get('email'));await limitAuth('verify',address,5,3600);const user=await db.user.findUnique({where:{email:address}});if(user&&!user.emailVerifiedAt){const token=newToken();await db.authToken.create({data:{userId:user.id,purpose:'VERIFY_EMAIL',tokenHash:tokenHash(token),expiresAt:new Date(Date.now()+86400_000)}});const base=process.env.APP_URL||'http://localhost:3000';await sendEmail({to:address,subject:'Verify your TeamFlow email',text:`Open ${base}/verify?token=${token} to verify your email. This link expires in 24 hours.`})}redirect('/login?registered=1')}
