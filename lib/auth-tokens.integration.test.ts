import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from './db';
import { consumeEmailVerificationToken, consumeInvitation } from './auth-tokens';
import { newToken, tokenHash } from './auth';

describe.skipIf(!process.env.TEST_DATABASE_URL)('single-use account tokens', () => {
 let userId: string, inviterId: string, workspaceId: string;
 beforeAll(async () => {
  const stamp = crypto.randomUUID();
  const [user, inviter] = await Promise.all([
   db.user.create({ data: { name: 'Invitee', email: `invitee-${stamp}@example.test` } }),
   db.user.create({ data: { name: 'Inviter', email: `inviter-${stamp}@example.test` } }),
  ]);
  userId = user.id;
  inviterId = inviter.id;
  workspaceId = (await db.workspace.create({ data: { name: 'Token test', memberships: { create: { userId: inviterId, role: 'OWNER' } } } })).id;
 });
 afterAll(async () => {
  if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
  if (userId) await db.user.deleteMany({ where: { id: { in: [userId, inviterId] } } });
 });
 it('verifies an address once and rejects expired tokens', async () => {
  const token = newToken();
  await db.authToken.create({ data: { userId, purpose: 'VERIFY_EMAIL', tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 60_000) } });
  const results = await Promise.all([consumeEmailVerificationToken(token), consumeEmailVerificationToken(token)]);
  expect(results.sort()).toEqual([false, true]);
  expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).emailVerifiedAt).not.toBeNull();
  const expired = newToken();
  await db.authToken.create({ data: { userId, purpose: 'VERIFY_EMAIL', tokenHash: tokenHash(expired), expiresAt: new Date(Date.now() - 1000) } });
  expect(await consumeEmailVerificationToken(expired)).toBe(false);
 });
 it('accepts an invitation once and only for the matching address', async () => {
  const token = newToken();
  const email = (await db.user.findUniqueOrThrow({ where: { id: userId } })).email;
  await db.invitation.create({ data: { workspaceId, invitedById: inviterId, email, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 60_000) } });
  expect(await consumeInvitation(token, userId, 'different@example.test')).toBeNull();
  const results = await Promise.all([consumeInvitation(token, userId, email), consumeInvitation(token, userId, email)]);
  expect(results.filter(Boolean)).toEqual([workspaceId]);
  expect(await db.membership.count({ where: { workspaceId, userId } })).toBe(1);
  expect(await db.auditLog.count({ where: { workspaceId, action: 'member.joined' } })).toBe(1);
 });
});
