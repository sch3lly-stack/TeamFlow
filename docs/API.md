# API reference

Base path: `/api`. All responses are JSON except CSV reports and file downloads.

## Conventions

- **Browser authentication** uses HttpOnly cookies (`tf_access`, `tf_refresh`) plus the non-HttpOnly `tf_csrf` cookie. Mutating requests must send `X-CSRF-Token` with the cookie value.
- **API clients** may send `Authorization: Bearer <access token>`; CSRF is then not required. Access tokens are short-lived; refresh uses the refresh cookie scoped to `/api/auth`.
- **Errors** follow:

```json
{ "error": { "code": "FORBIDDEN", "message": "Your role does not allow this action", "details": [] } }
```

Common codes: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN`/`CSRF_*` (403), `NOT_FOUND` (404), `CONFLICT` (409), `RATE_LIMITED` (429). Cross-organization resources return `NOT_FOUND`.

- Pagination is limit-based (`limit`, `page` for audit logs); list sizes are bounded per endpoint.
- Dates are ISO-8601 strings. `204` responses have no body.

## Auth

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/auth/register` | `{name,email,password,organizationName?}`; creates user and optional owned org; sets session cookies; 201 |
| POST | `/auth/login` | Rate-limited; returns user + memberships + CSRF token |
| POST | `/auth/refresh` | Rotates refresh token, issues new access + CSRF cookies |
| POST | `/auth/logout` | Revokes refresh token, clears cookies; 204 |
| GET | `/auth/me` | Current user with memberships; ensures a CSRF cookie exists |
| PATCH | `/auth/me` | `{name?, avatarColor?, timezone?}` |
| POST | `/auth/change-password` | `{currentPassword,newPassword}`; revokes other sessions |

## Organizations

| Method | Path | Permission |
| --- | --- | --- |
| POST | `/organizations` | Any authenticated user (becomes Owner) |
| GET | `/organizations` | Own memberships |
| GET | `/organizations/:orgId` | Member |
| PATCH | `/organizations/:orgId` | `org:manage` |
| GET | `/organizations/:orgId/dashboard` | Member |
| GET | `/organizations/:orgId/analytics?weeks=` | Member |
| GET | `/organizations/:orgId/workload?teamId=&projectId=` | Member |
| GET | `/organizations/:orgId/my-work` | Member (own assignments) |
| GET | `/organizations/:orgId/activity?projectId=&limit=` | Member |
| GET | `/organizations/:orgId/calendar?from=&to=&projectId=` | Member |
| GET | `/organizations/:orgId/search?q=` | Member |
| GET | `/organizations/:orgId/audit-logs?page=&limit=` | `audit:read` |
| GET/POST | `/organizations/:orgId/categories` | Member / `org:manage` |
| DELETE | `/organizations/:orgId/categories/:id` | `org:manage` |
| GET | `/organizations/:orgId/member-options` | Member |

## People and structure

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/organizations/:orgId/members` | Member |
| PATCH/DELETE | `/organizations/:orgId/members/:membershipId` | `members:manage` + owner guardrails |
| GET/POST | `/organizations/:orgId/invitations` | `members:manage` |
| DELETE | `/organizations/:orgId/invitations/:id` | `members:manage` |
| GET | `/invitations/:token` | Public summary |
| POST | `/invitations/:token/accept` | Authenticated, email must match |
| GET/POST | `/organizations/:orgId/departments` | Member / `structure:manage` |
| PATCH/DELETE | `/organizations/:orgId/departments/:id` | `structure:manage` |
| GET/POST | `/organizations/:orgId/teams` | Member / `team:manage` |
| PATCH/DELETE | `/organizations/:orgId/teams/:id` | `team:manage` (Team Leads only for teams they lead) |
| POST | `/organizations/:orgId/teams/:teamId/members` | `team:manage` |
| DELETE | `/organizations/:orgId/teams/:teamId/members/:userId` | `team:manage` |

## Projects

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/organizations/:orgId/projects?status=&q=&teamId=` | Member |
| POST | `/organizations/:orgId/projects` | `project:create` |
| GET | `/projects/:projectId` | Project member, with capabilities |
| PATCH | `/projects/:projectId` | `project:manage` |
| DELETE | `/projects/:projectId` | `project:manage` (archive) |
| GET/POST | `/projects/:projectId/members` | Member / `project:manage` |
| PATCH/DELETE | `/projects/:projectId/members/:userId` | `project:manage` |
| GET/POST | `/projects/:projectId/columns` | Member / `workflow:manage` |
| PATCH/DELETE | `/projects/:projectId/columns/:columnId` | `workflow:manage` |
| GET/POST | `/projects/:projectId/milestones` | Member / `milestone:manage` |
| PATCH/DELETE | `/projects/:projectId/milestones/:id` | `milestone:manage` |
| GET | `/projects/:projectId/analytics` | Member |
| GET | `/projects/:projectId/report?format=json\|csv` | `report:read` |

Project creation atomically creates five default columns and a project-manager membership for the owner. Keys are uppercase, 2–8 characters, unique per organization.

## Tasks

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/projects/:projectId/tasks?q=&columnId=&assigneeId=&priority=&sprintId=&categoryId=&due=` | Project member |
| POST | `/projects/:projectId/tasks` | `task:write` |
| GET/PATCH/DELETE | `/tasks/:taskId` | Member / `task:write` / `task:delete` |
| PATCH | `/tasks/:taskId/move` | `task:write` |
| GET/POST | `/tasks/:taskId/comments` | Member / `comment:write` |
| PATCH/DELETE | `/tasks/:taskId/comments/:commentId` | Author or organization admin |
| GET | `/tasks/:taskId/activity` | Member |
| POST | `/tasks/:taskId/dependencies` | `task:write`; same project, cycle-checked |
| DELETE | `/tasks/:taskId/dependencies/:dependsOnTaskId` | `task:write` |
| GET/POST | `/tasks/:taskId/attachments` | Member / `attachment:write` |
| GET | `/attachments/:attachmentId/download` | Project member; access-checked stream |
| DELETE | `/attachments/:attachmentId` | Uploader, task deleter, or org admin |

`POST /tasks/:taskId/attachments` is `multipart/form-data` with field `file`. Allowed types: PNG/JPEG/GIF/WebP, PDF, plain text, Markdown, CSV, JSON, ZIP, DOCX, XLSX; default max 10 MB.

## Sprints

| Method | Path | Permission |
| --- | --- | --- |
| GET/POST | `/projects/:projectId/sprints` | Member / `sprint:manage` |
| GET/PATCH/DELETE | `/sprints/:sprintId` | Member / `sprint:manage` |
| POST | `/sprints/:sprintId/start` | `sprint:manage`; one active sprint per project |
| POST | `/sprints/:sprintId/complete` | `sprint:manage` |
| POST | `/sprints/:sprintId/tasks` | `sprint:manage`; `{taskIds: []}` |
| DELETE | `/sprints/:sprintId/tasks/:taskId` | `sprint:manage` |
| POST | `/sprints/:sprintId/carry-over` | `sprint:manage`; `{targetSprintId: string \| null}` |
| GET | `/sprints/:sprintId/report` | Project member |

## Notifications and health

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/notifications?unreadOnly=true&limit=` | Own notifications + unread count |
| PATCH | `/notifications/:id/read` | Mark one read |
| POST | `/notifications/read-all` | Mark all read |
| DELETE | `/notifications/:id` | Remove |
| GET | `/health` | Database readiness probe |

## Examples

```http
POST /api/auth/login
Content-Type: application/json

{ "email": "ada@northwind.dev", "password": "Password123!" }
```

```http
POST /api/projects/<projectId>/tasks
Content-Type: application/json
X-CSRF-Token: <csrfToken>

{
  "title": "Harden refresh token rotation",
  "priority": "HIGH",
  "columnId": "<columnId>",
  "assigneeIds": ["<userId>"],
  "storyPoints": 3,
  "dueDate": "2026-12-01"
}
```

```http
PATCH /api/tasks/<taskId>/move
X-CSRF-Token: <csrfToken>

{ "columnId": "<doneColumnId>", "position": 2000 }
```

Moving into a column marked `isDone` sets `completedAt`; moving out clears it. The response includes the full task with column, assignees, category, sprint, dependencies, and counts.

### Socket.IO

Connect to `/socket.io` with credentials. The server authenticates using the access cookie (or `auth.token`) and joins organization/user rooms. Events: `task:created`, `task:updated`, `task:moved`, `task:deleted`, `comment:created|updated|deleted`, `project:created|updated|member_updated`, `sprint:updated`, `milestone:updated`, `workflow:updated`, `attachment:created|deleted`, `activity:created`, `notification`.
