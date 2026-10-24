'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LiveRefresh() {
 const router = useRouter();
 useEffect(() => {
  const seen = new Set<string>();
  const changed = (id: string) => {
   if (seen.has(id)) return;
   seen.add(id);
   if (seen.size > 1000) seen.clear();
   if (!document.querySelector('[role=dialog]')) router.refresh();
  };
  const address = process.env.NEXT_PUBLIC_REALTIME_WS_URL;
  if (!address) {
   const source = new EventSource(`/api/v1/events?after=${Date.now()}:~`);
   source.addEventListener('change', event => changed(event.lastEventId));
   return () => source.close();
  }
  let cursor = `${Date.now()}:~`;
  let socket: WebSocket | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let delay = 1000;
  const connect = () => {
   const url = new URL(address);
   url.searchParams.set('after', cursor);
   socket = new WebSocket(url);
   socket.onopen = () => { delay = 1000 };
   socket.onmessage = event => {
    try {
     const message = JSON.parse(event.data) as { event: string; id: string };
     if (message.event !== 'change' || !message.id || seen.has(message.id)) return;
     cursor = message.id;
     changed(message.id);
    } catch { /* Ignore malformed transport frames. */ }
   };
   socket.onclose = () => { if (!closed) { timer = setTimeout(connect, delay); delay = Math.min(delay * 2, 30_000) } };
  };
  connect();
  return () => { closed = true; if (timer) clearTimeout(timer); socket?.close() };
 }, [router]);
 return null;
}
