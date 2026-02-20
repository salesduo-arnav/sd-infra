# Invitation System

## Overview

The invitation system allows organization members (Admin or Owner role) to invite new users by email. Invitations create a token-based link that recipients can use to join the organization. The system integrates with the authentication flow, allowing invitations to be accepted during registration or login.

## Data Model

### Invitation

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| organization_id | UUID | FK to Organization |
| email | STRING | Invitee email address |
| role_id | INTEGER | FK to Role (assigned on acceptance) |
| token | STRING | Unique invitation token (crypto.randomBytes(32)) |
| invited_by | UUID | FK to User (SET NULL on delete) |
| status | ENUM | `PENDING`, `ACCEPTED`, `EXPIRED` |
| expires_at | DATE | Expiry timestamp (7 days from creation) |

**Unique Constraints:**
- `(organization_id, email)` — One pending invite per email per org
- `token` — Globally unique token

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/invitations` | Yes (Admin+) | Send invitation to email |
| GET | `/invitations/pending` | Yes | Get pending invitations for current org |
| DELETE | `/invitations/:id` | Yes (Admin+) | Revoke a pending invitation |
| GET | `/invitations/validate` | No | Validate an invitation token (public) |
| POST | `/invitations/accept` | Yes | Accept an invitation |
| GET | `/invitations/my-pending` | Yes | Get pending invitations for current user |
| POST | `/invitations/decline` | Yes | Decline an invitation |

## Invitation Flow

### Sending an Invitation
1. Admin/Owner sends POST to `/invitations` with email and role
2. System checks if user is already a member of the org
3. Invitation created with unique token and 7-day expiry
4. Email sent with invitation link containing the token
5. Audit log entry created

### Accepting via Email Link
1. User clicks invitation link → frontend `/accept-invite?token=<token>`
2. Frontend calls `/invitations/validate?token=<token>` to verify
3. If user is authenticated, calls `/invitations/accept` with token
4. If user is not authenticated, redirects to login/signup with token parameter
5. After auth, invitation auto-accepted (integrated into auth flow)

### Accepting During Auth
1. User registers or logs in with `token` parameter
2. Auth controller validates the invitation token
3. On successful auth, user is added to the organization with the invited role
4. Invitation status updated to `ACCEPTED`

## Email Template

Invitation emails include:
- Inviter's name and organization name
- Direct link to accept: `{FRONTEND_URL}/accept-invite?token={token}`
- Sent via the mail service (Nodemailer)

## Key Files

- `backend/src/controllers/invitation.controller.ts` — Invitation endpoints
- `backend/src/services/invitation.service.ts` — Invitation business logic and email sending
- `backend/src/models/invitation.ts` — Invitation model
- `backend/src/routes/invitation.routes.ts` — Route definitions

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FRONTEND_URL` | Yes | Base URL for invitation links (fallback: `http://localhost:5173`) |
| `SMTP_HOST` | Yes | SMTP server hostname |
| `SMTP_PORT` | Yes | SMTP server port |
| `SMTP_USER` | Yes | SMTP authentication username |
| `SMTP_PASS` | Yes | SMTP authentication password |

---

## Issues Found

1. **Hardcoded 7-day expiry** — Invitation expiry is hardcoded to 7 days in the invitation service. This should be configurable via system config or environment variable.
2. **No automatic expiry cleanup** — Expired invitations are not automatically cleaned up. The system relies on status checks at read time, meaning expired invitations accumulate in the database.
3. **Email validation missing** — The invitation service does not validate email format before creating the invitation or sending the email. Invalid emails will silently fail.
4. **Mail failure is silent** — If the email fails to send, the invitation is still created in the database. The user sees success but the invitee never receives the email.
5. **`FRONTEND_URL` fallback is localhost** — The default fallback for `FRONTEND_URL` is `http://localhost:5173`, which would generate broken links in production if the env var is missing.
6. **Invitation token stored unencrypted** — While the token is generated securely with `crypto.randomBytes(32)`, it is stored in plaintext in the database.
7. **`/invitations/validate` is public with no rate limiting** — This endpoint can be used to probe for valid tokens without authentication, potentially enabling information disclosure.
8. **Race condition on acceptance** — The user organization limit check happens after the membership existence check. Concurrent acceptance requests could bypass the org limit.
9. **`invited_by` SET NULL on user deletion** — When the inviting user is deleted, the `invited_by` field becomes null, breaking the audit trail for who sent the invitation.
10. **Redundant unique constraints** — The invitation model has both a unique constraint on `token` alone and on `(organization_id, token)`. The global unique on `token` makes the composite unnecessary.
