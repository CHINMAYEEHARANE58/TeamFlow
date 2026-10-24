import { db } from './db';
import { tokenHash } from './auth';

export async function consumeEmailVerificationToken(token: string): Promise<boolean> {
 const row = await db.authToken.findUnique({ where: { tokenHash: tokenHash(token) } });
 if (!row || row.purpose !== 'VERIFY_EMAIL') return false;
 return db.$transaction(async tx => {
  const consumed = await tx.authToken.updateMany({
   where: { id: row.id, purpose: 'VERIFY_EMAIL', usedAt: null, expiresAt: { gt: new Date() } },
   data: { usedAt: new Date() },
  });
  if (!consumed.count) return false;
  await tx.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } });
  return true;
 });
}

export async function consumeInvitation(token: string, userId: string, email: string): Promise<string | null> {
 const invitation = await db.invitation.findUnique({ where: { tokenHash: tokenHash(token) } });
 if (!invitation || invitation.email !== email) return null;
 return db.$transaction(async tx => {
  const consumed = await tx.invitation.updateMany({
   where: { id: invitation.id, acceptedAt: null, expiresAt: { gt: new Date() } },
   data: { acceptedAt: new Date() },
  });
  if (!consumed.count) return null;
  await tx.membership.upsert({
   where: { userId_workspaceId: { userId, workspaceId: invitation.workspaceId } },
   create: { userId, workspaceId: invitation.workspaceId, role: invitation.role },
   update: {},
  });
  await tx.auditLog.create({ data: { workspaceId: invitation.workspaceId, actorId: userId, action: 'member.joined', targetType: 'membership', targetId: userId } });
  return invitation.workspaceId;
 });
}
