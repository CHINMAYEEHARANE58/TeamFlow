import LiveRefresh from '@/app/live-refresh';
import Link from 'next/link';
import { requireWorkspace } from '@/lib/access';
import { db } from '@/lib/db';
import { markNotificationRead } from '../actions';
export const dynamic='force-dynamic';
export default async function Notifications(){const {user,workspace}=await requireWorkspace();const notifications=await db.notification.findMany({where:{userId:user.id,workspaceId:workspace.id},orderBy:{createdAt:'desc'},take:50});return <main className="subpage"><LiveRefresh/><Link href="/">← Dashboard</Link><p className="eyebrow">STAY IN SYNC</p><h1>Notifications</h1><section className="panel">{notifications.map(n=><div className={`notification ${n.readAt?'':'unread'}`} key={n.id}><div><strong>{n.title}</strong><p>{n.body}</p><small>{n.createdAt.toLocaleString()}</small></div><div>{n.href&&<Link href={n.href}>View</Link>}{!n.readAt&&<form action={markNotificationRead}><input type="hidden" name="id" value={n.id}/><button className="outline-button">Mark read</button></form>}</div></div>)}{!notifications.length&&<p className="empty">You’re all caught up.</p>}</section></main>}
