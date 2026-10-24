# TeamFlow API

All routes use the HTTP-only session cookie. List and event routes use the selected workspace; resource routes enforce membership in that resource's workspace. JSON mutation requests must include an `Origin` header matching the application origin; browser `fetch` does this automatically. Errors use JSON `{ "error": ... }` and appropriate 4xx status codes.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/v1/tasks?page=1&pageSize=20&status=TODO` | Paginated tasks in selected workspace, maximum page size 100. |
| POST | `/api/v1/tasks` | Create a task. Body: `projectId`, `title`, optional `description`, `priority`, `assigneeId`. |
| GET | `/api/v1/tasks/{id}` | Read task after workspace access check. |
| PATCH | `/api/v1/tasks/{id}` | Update task with required `version` and optional `title`, `description`, `status`, `priority`. Returns 409 on stale version. |
| DELETE | `/api/v1/tasks/{id}` | Manager-only leaf task deletion. Body: required `version`. Returns 409 if stale or the task has subtasks. |
| GET | `/api/v1/events` | Local Server-Sent Events adapter for changes in selected workspace. Event IDs support reconnect. |
| POST | `/api/attachments` | Multipart form with `taskId`, `file` (PDF, PNG, JPEG, WebP, or text, maximum 10 MB). |
| GET | `/api/attachments/{id}` | Protected attachment download. |

Task example:

```json
{"projectId":"project-id","title":"Ship onboarding","priority":"HIGH"}
```

PATCH example:

```json
{"version":0,"status":"IN_PROGRESS"}
```

Production clients connect to the separate WebSocket service at the configured `NEXT_PUBLIC_REALTIME_WS_URL`, ending in `/realtime`. The upgrade requires the session cookie and the exact application `Origin`. Pass `after=<timestamp>:<event-id>` to replay missed events. Frames have the form `{"event":"change","id":"<timestamp>:<event-id>","type":"task.created","entityId":"<id>"}`. Events are scoped to the selected workspace, published through Redis, and replayed from PostgreSQL after reconnect. The local SSE adapter uses the same durable event table when the WebSocket URL is unset.
