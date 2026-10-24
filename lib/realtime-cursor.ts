export type EventCursor = { time: Date; id: string };

export function parseEventCursor(value: string | null): EventCursor | null {
 if (!value || value.length > 100) return null;
 const match = /^(\d{13}):([A-Za-z0-9_~-]{1,40})$/.exec(value);
 if (!match) return null;
 const time = Number(match[1]);
 if (!Number.isSafeInteger(time) || time > Date.now() + 60_000) return null;
 return { time: new Date(time), id: match[2] };
}

export function eventCursor(createdAt: Date, id: string): string {
 return `${createdAt.getTime()}:${id}`;
}

export function cursorIsNewer(a: string, b: string): boolean {
 const left = parseEventCursor(a), right = parseEventCursor(b);
 if (!left || !right) return false;
 return left.time.getTime() > right.time.getTime() ||
  (left.time.getTime() === right.time.getTime() && left.id > right.id);
}
