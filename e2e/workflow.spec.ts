import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const outbox = join(process.cwd(), '.data', 'outbox');

async function linkFor(address: string, subject: string) {
 for (let tries = 0; tries < 30; tries++) {
  for (const file of await readdir(outbox).catch(() => [])) {
   const message = JSON.parse(await readFile(join(outbox, file), 'utf8')) as { to: string; text: string; subject: string };
   if (message.to !== address || !message.subject.includes(subject)) continue;
   const match = message.text.match(/https?:\/\/(?:localhost|127\.0\.0\.1):3000\/[a-z-]+\?token=[A-Za-z0-9_-]+/);
   if (match) return match[0].replace('localhost:3000', '127.0.0.1:3000');
  }
  await new Promise(resolve => setTimeout(resolve, 200));
 }
 throw new Error('No local email found');
}

async function registerAndLogin(page: Page, name: string, workspace: string, email: string) {
 await page.goto('/register');
 await page.getByLabel('Your name').fill(name);
 await page.getByLabel('Workspace name').fill(workspace);
 await page.getByLabel('Email address').fill(email);
 await page.getByLabel('Password').fill('strong-test-password');
 await page.getByRole('button', { name: /Create workspace/ }).click();
 await page.goto(await linkFor(email, 'Verify'));
 await page.getByRole('button', { name: 'Verify email' }).click();
 await page.getByLabel('Email address').fill(email);
 await page.getByLabel('Password').fill('strong-test-password');
 await page.getByRole('button', { name: /Sign in/ }).click();
 await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible();
}

async function expectAccessible(page: Page) {
 const violations = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.filter(v => ['serious', 'critical'].includes(v.impact || ''));
 expect(violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
}

test('onboarding, collaboration, sprints, navigation, revocation, and accessibility', async ({ page, browser }) => {
 const hydrationErrors: string[] = [];
 page.on('console', message => { if (message.type() === 'error' && /hydrated but some attributes|hydration failed/i.test(message.text())) hydrationErrors.push(message.text()) });
 const stamp = Date.now(), owner = `owner-${stamp}@example.test`, member = `member-${stamp}@example.test`;
 await registerAndLogin(page, 'Owner Test', 'First Workspace', owner);
 await page.goto('/settings');
 await page.getByLabel('New workspace').fill('Second Workspace');
 await page.getByRole('button', { name: 'Create workspace' }).click();
 await page.getByRole('button', { name: 'Add project' }).click();
 await page.getByPlaceholder('e.g. Website redesign').fill('Project Alpha');
 await page.getByRole('button', { name: /Create project/ }).click();
 await expect(page.getByText('Project Alpha').first()).toBeVisible();
 const projectId = (await page.locator('.project-footer a').first().getAttribute('href'))!.split('/').pop()!;

 await page.goto('/settings');
 await page.getByLabel('Email', { exact: true }).fill(member);
 await page.getByRole('button', { name: 'Send invitation' }).click();
 const invite = await linkFor(member, 'Invitation');
 const other = await browser.newContext();
 const memberPage = await other.newPage();
 await registerAndLogin(memberPage, 'Member Test', 'Member Home', member);
 await memberPage.goto(invite);
 await memberPage.getByRole('button', { name: 'Accept invitation' }).click();
 await expect(memberPage).toHaveURL('http://127.0.0.1:3000/');
 await expect(memberPage.getByText('Second Workspace').first()).toBeVisible();

 await page.goto('/');
 await page.getByRole('button', { name: 'New task' }).click();
 await page.getByPlaceholder('What needs to be done?').fill('Ship workflow');
 await page.locator('select[name=projectId]').selectOption({ label: 'Project Alpha' });
 await page.locator('select[name=assigneeId]').selectOption({ label: 'Member Test' });
 await page.getByRole('button', { name: /Create task/ }).click();
 const taskLink = page.getByRole('link', { name: 'Ship workflow' });
 await expect(taskLink).toBeVisible();
 const taskId = (await taskLink.getAttribute('href'))!.split('/').pop()!;
 await memberPage.goto('/notifications');
 await memberPage.getByRole('link', { name: 'View' }).first().click();
 await expect(memberPage.getByRole('heading', { name: 'Ship workflow' })).toBeVisible();
 await memberPage.goto('/');
 await memberPage.getByRole('row', { name: /Ship workflow/ }).getByRole('combobox').selectOption('DONE');
 await expect(memberPage.getByText('01', { exact: true }).first()).toBeVisible();

 await page.goto('/sprints');
 await page.locator('input[name=name]').fill('Release Sprint');
 await page.getByRole('button', { name: 'Create sprint' }).click();
 await expect(page.locator('.sprint-card')).toContainText('Release Sprint');
 await page.getByRole('button', { name: 'Start sprint' }).click();
 await expect(page.locator('.sprint-card')).toContainText('active');
 await page.getByRole('button', { name: 'Add', exact: true }).click();
 await expect(page.locator('.sprint-card')).toContainText('Ship workflow');
 await page.getByRole('button', { name: 'Complete sprint' }).click();
 await expect(page.locator('.sprint-card')).toContainText('completed');

 for (const route of ['/board', '/calendar', '/reports', '/notifications', '/tasks', `/tasks/${taskId}`, `/projects/${projectId}/board`]) {
  await page.goto(route);
  await expect(page.locator('main h1')).toBeVisible();
 }
 await page.goto('/admin');
 await expect(page.getByText('This page could not be found.')).toBeVisible();

 await page.goto(`/projects/${projectId}`);
 await page.locator('select[name=userId]').selectOption({ label: 'Member Test' });
 await page.locator('select[name=role]').selectOption('MANAGER');
 await page.getByRole('button', { name: 'Add member' }).click();
 await expect(page.locator('.detail-block .setting-row').filter({ hasText: 'Member Test' })).toContainText('manager');
 await memberPage.goto(`/projects/${projectId}`);
 await expect(memberPage.getByRole('button', { name: 'Save project' })).toBeVisible();
 await page.goto('/settings');
 await page.getByRole('button', { name: 'Remove Member Test' }).click();
 await expect(page.getByRole('button', { name: 'Remove Member Test' })).toHaveCount(0);
 await memberPage.goto(`/projects/${projectId}`);
 await expect(memberPage.getByRole('button', { name: 'Save project' })).toHaveCount(0);
 await expect(memberPage.getByText('This page could not be found.')).toBeVisible();

 await page.goto('/');
 await expectAccessible(page);
 await page.getByRole('button', { name: 'Use dark theme' }).click();
 await expect(page.locator('html')).toHaveClass(/dark/);
 await expectAccessible(page);
 await page.getByRole('button', { name: 'Use light theme' }).click();
 await page.setViewportSize({ width: 390, height: 844 });
 await page.goto('/');
 await expect(page.getByRole('button', { name: 'New task' })).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
 await expectAccessible(page);
 expect(hydrationErrors).toEqual([]);
 await other.close();
});
