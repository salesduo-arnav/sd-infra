# User Management — Business Rules Document

**Platform:** SalesDuo Core Platform
**Last Updated:** April 2026
**Audience:** Non-technical stakeholders, product managers, QA teams

---

## Table of Contents

1. [User Registration](#1-user-registration)
2. [User Login](#2-user-login)
3. [Password Recovery](#3-password-recovery)
4. [Session Management](#4-session-management)
5. [Organizations](#5-organizations)
6. [Invitation System](#6-invitation-system)
7. [Roles and Permissions (RBAC)](#7-roles-and-permissions-rbac)
8. [Organization Membership](#8-organization-membership)
9. [Ownership Transfer](#9-ownership-transfer)
10. [User Profile Management](#10-user-profile-management)
11. [Account Deletion](#11-account-deletion)
12. [Platform Administrators (Superusers)](#12-platform-administrators-superusers)
13. [Audit Logging](#13-audit-logging)
14. [Edge Cases and Special Scenarios](#14-edge-cases-and-special-scenarios)
15. [System Limits and Configuration](#15-system-limits-and-configuration)

---

## 1. User Registration

Users can create an account through three methods: email and password, one-time password (OTP) via email, or Google sign-in.

### 1.1 Email and Password Registration

- The user provides their **full name**, **email address**, and a **password**.
- The email address must be unique across the platform. If another account already uses that email, registration is rejected.
- The password must meet the following strength requirements:
  - At least **8 characters** long
  - Contains at least **one uppercase letter** (A-Z)
  - Contains at least **one lowercase letter** (a-z)
  - Contains at least **one number** (0-9)
- These password rules are configurable by platform administrators if the policy needs to change in the future.
- Upon successful registration, the user is automatically logged in and a session is created.

### 1.2 OTP Registration

- The user provides their email address and requests a one-time password.
- A 6-digit code is sent to the email and is valid for **15 minutes**.
- The user submits the code along with their full name and chosen password to complete registration.
- The same password strength rules apply.

### 1.3 Google Sign-In Registration

- The user clicks "Sign in with Google" and authorizes the application.
- If no account exists for that Google email, a new account is created automatically using the name and email from Google.
- Google-registered users do **not** have a password set initially. They can optionally set one later (see [Profile Management](#10-user-profile-management)).
- If an account already exists for that email, the user is simply logged in — no duplicate account is created.

### 1.4 Registration with an Invitation

- If the user has received an invitation to join an organization, they can provide the **invitation token** during any of the registration methods above.
- The email used to register **must match** the email the invitation was sent to. If it does not match, the invitation is ignored.
- The invitation must still be valid (not expired, not already used).
- Upon successful registration, the user is automatically added to the inviting organization with the role specified in the invitation.
- The invitation is marked as accepted.

---

## 2. User Login

### 2.1 Email and Password Login

- The user provides their email and password.
- The system verifies the password against the stored hash.
- On success, a session is created and the user is logged in.
- If an invitation token is provided alongside login credentials, the same invitation acceptance logic applies (email must match, invitation must be valid and not expired).

### 2.2 OTP Login

- The user provides their email and requests a one-time password.
- A code is sent to their email, valid for **15 minutes**.
- The user submits the code to complete login.
- A session is created on success.

### 2.3 Google Sign-In Login

- The user authenticates via Google.
- If the Google email matches an existing account, the user is logged in.
- If no account exists, a new one is created automatically (see Registration above).
- Invitation tokens can also be provided during Google sign-in.

### 2.4 Failed Login Attempts

- Invalid credentials return a generic error message.
- The system does **not** reveal whether the email exists or whether the password was wrong — this prevents attackers from guessing valid email addresses.

---

## 3. Password Recovery

### 3.1 Forgot Password

- The user submits their email address.
- The system **always responds with a success message**, regardless of whether the email exists. This is a deliberate security measure to prevent email enumeration.
- If the email is associated with an account, a password reset link is sent. The link is valid for **1 hour**.
- The reset link is single-use — once clicked and used, it cannot be used again.

### 3.2 Resetting the Password

- The user clicks the reset link and provides a new password.
- The new password must meet the same strength requirements as registration.
- After successful reset, the user can log in with their new password.

---

## 4. Session Management

### 4.1 How Sessions Work

- When a user logs in, a unique session identifier is created and stored securely.
- This session is sent to the user's browser as a secure cookie.
- Every subsequent request uses this cookie to identify the user.

### 4.2 Session Duration

- Sessions last for **24 hours** by default (configurable by platform administrators).
- After expiry, the user must log in again.

### 4.3 Session Security

- Sessions are tied to the user's browser type (User-Agent). If the browser signature changes (e.g., the session cookie is stolen and used from a different browser), the session is invalidated.
- Sessions are **not** tied to IP address, because users on VPNs or mobile networks frequently change IPs, which would cause false logouts.

### 4.4 Multiple Device Login

- A user can be logged in from multiple devices or browsers simultaneously.
- Each device has its own independent session.
- Logging out on one device does not affect sessions on other devices.

### 4.5 Logout

- When a user logs out, their session is destroyed and the cookie is cleared.
- Only the current session is affected — other device sessions remain active.

---

## 5. Organizations

Organizations are the core unit of multi-tenancy. Each organization has its own members, roles, subscriptions, and data.

### 5.1 Creating an Organization

- Any authenticated user can create an organization.
- The user provides an **organization name**.
- A URL-friendly identifier (called a "slug") is automatically generated from the name. If a slug already exists, a random number is appended to make it unique.
- The user who creates the organization automatically becomes its **Owner**.
- Optionally, the creator can provide a list of email addresses to invite during creation. If some invitations fail (e.g., invalid email format), the organization is still created — failed invitations are reported but do not block the process.

### 5.2 Organization Limits

- A single user can belong to a maximum of **5 organizations** (configurable). Attempting to create or join a 6th organization is blocked.
- An organization can have a maximum of **50 members** (configurable). This limit includes both active members and pending invitations. When the limit is reached, no new invitations can be sent.

### 5.3 Updating an Organization

- Only the **Owner** can update organization details (name, website).
- The organization slug (URL identifier) **cannot be changed** once created.

### 5.4 Deleting an Organization

- Only the **Owner** can delete an organization.
- Deletion is a "soft delete" — the data is not permanently erased but is marked as deleted and hidden from normal operations.
- When an organization is deleted, the following are also automatically removed:
  - All memberships (members lose access)
  - All pending invitations
  - All subscriptions
  - All entitlements (feature access)
  - All one-time purchases
- After deletion, the organization's slug becomes available for reuse by a new organization.

### 5.5 Organization Statuses

| Status | Meaning |
|--------|---------|
| **Active** | Normal operation (default) |
| **Suspended** | Temporarily disabled by a platform administrator |
| **Archived** | Soft-deleted |

---

## 6. Invitation System

The invitation system is how new members are added to an organization.

### 6.1 Sending an Invitation

- Only users with the **Owner** or **Admin** role in an organization can send invitations.
- The inviter provides the invitee's email address and selects a role for them.
- An invitation email is sent containing a unique link.
- The invitation is valid for **7 days** by default (configurable).

### 6.2 Invitation Restrictions

- **Duplicate prevention:** You cannot invite an email address that already has a pending invitation in the same organization.
- **Existing member check:** You cannot invite someone who is already a member of the organization.
- **Capacity check:** The total count of active members plus pending invitations must be below the organization's maximum capacity. If at capacity, new invitations are blocked.

### 6.3 Accepting an Invitation

There are two ways to accept an invitation:

**If the user already has an account:**
- The user logs in and navigates to their pending invitations.
- They click "Accept" on the invitation.
- They are added to the organization with the role specified in the invitation.
- The system checks that the user has not exceeded their personal organization limit (default 5). If they have, acceptance is blocked.

**If the user does not have an account:**
- The user clicks the invitation link and is directed to the registration page.
- They register using the same email the invitation was sent to.
- The invitation token is included in the registration process.
- Upon successful registration, they are automatically added to the organization.

### 6.4 Declining an Invitation

- An authenticated user can decline a pending invitation.
- The invitation is removed. The organization can send a new invitation to the same email if desired.

### 6.5 Revoking an Invitation

- An **Owner** or **Admin** can revoke a pending invitation before it is accepted.
- The invitee is **not** notified that the invitation was revoked.
- The revoked invitation is removed, and the email can be invited again.

### 6.6 Invitation Expiry

- Invitations expire after the configured number of days (default 7).
- Expired invitations cannot be accepted. The system checks the expiry date at the time of acceptance, not in the background.
- Expired invitations remain in the system as "pending" but are treated as invalid when someone tries to use them.
- After an invitation expires, the same email can be invited again.

### 6.7 Re-Inviting After Removal

- If a member was previously removed from an organization, they can be invited again.
- When they accept, their old membership record is restored (rather than creating a new one) and their role is updated to whatever the new invitation specifies.

---

## 7. Roles and Permissions (RBAC)

The platform uses Role-Based Access Control to manage what each user can do within an organization. There are three built-in roles.

### 7.1 Role Definitions

#### Owner
- The highest privilege level.
- Has **all permissions** within the organization.
- Every organization has exactly **one Owner** at any time.
- The Owner is the only person who can delete the organization, transfer ownership, or change member roles.
- The Owner **cannot be removed** from the organization (they must transfer ownership first).

#### Admin
- A management-level role with most organizational permissions.
- Can invite new members and remove existing members.
- Can view and manage billing.
- **Cannot** delete the organization, transfer ownership, or change other members' roles.
- Can remove other Admins and Members, but **cannot** remove the Owner.

#### Member
- The most basic role.
- Can view billing information but **cannot** make changes to billing, invite users, or remove users.
- Suitable for regular team members who just need to use the platform's tools.

### 7.2 Permissions Matrix

| Action | Owner | Admin | Member |
|--------|:-----:|:-----:|:------:|
| Update organization details | Yes | Yes | No |
| Delete organization | Yes | No | No |
| Invite new members | Yes | Yes | No |
| Remove members | Yes | Yes | No |
| Change member roles | Yes | No | No |
| Transfer ownership | Yes | No | No |
| View billing | Yes | Yes | Yes |
| Manage billing (subscribe, cancel, upgrade) | Yes | Yes | No |
| View available plans | Yes | Yes | No |

### 7.3 Role Assignment Rules

- When someone creates an organization, they are automatically assigned the **Owner** role.
- When someone accepts an invitation, they are assigned the role that was specified when the invitation was sent.
- Only the **Owner** can change a member's role after they have joined.
- The Owner role **cannot** be directly assigned to someone — it must be transferred using the ownership transfer process (see [Ownership Transfer](#9-ownership-transfer)).

---

## 8. Organization Membership

### 8.1 Viewing Members

- Any member of an organization can view the list of other members.
- The member list supports pagination, searching by name or email, and sorting by join date, name, email, or role.

### 8.2 Removing a Member

- **Owner** or **Admin** can remove members, with these restrictions:
  - A member **cannot remove themselves** (use "Leave Organization" or account deletion instead).
  - The **Owner cannot be removed** — ownership must be transferred first.
  - An **Admin cannot remove another Admin** — only the Owner can remove Admins.
- When a member is removed:
  - Their membership is soft-deleted.
  - Any pending invitations associated with their email in that organization are also removed.
  - They lose access to the organization immediately.

### 8.3 Changing a Member's Role

- Only the **Owner** can change a member's role.
- The Owner role cannot be assigned this way — use [Ownership Transfer](#9-ownership-transfer) instead.
- Valid role changes: Member to Admin, Admin to Member.

---

## 9. Ownership Transfer

Ownership transfer is a special operation that moves the Owner role from one member to another.

### 9.1 Rules

- Only the current **Owner** can initiate a transfer.
- The new owner must already be a member of the organization.
- The Owner **cannot transfer ownership to themselves**.
- The transfer is atomic — both role changes happen together:
  - The current Owner becomes an **Admin**.
  - The chosen member becomes the new **Owner**.
- If either change fails, neither takes effect.

### 9.2 After Transfer

- The previous Owner retains membership as an Admin. They can still manage members and billing but can no longer delete the organization or change roles.
- The new Owner gains all Owner privileges immediately.

---

## 10. User Profile Management

### 10.1 Updating Profile Information

- Any authenticated user can update their **full name** and **email address**.
- If changing email:
  - The new email must be in valid format.
  - The new email must not already be in use by another account.
  - Setting the email to the same current value is allowed (no-op).

### 10.2 Changing Password

- The user must provide their **current password** for verification.
- The new password must meet the same strength requirements as registration.
- Users who signed up via Google (and therefore have no password) **cannot** use this feature — they see an error message saying "User has no password set."

### 10.3 Creating a Password (Google Users)

- Users who registered via Google can set a password for the first time.
- This allows them to log in with either Google or email/password going forward.
- The password must meet the standard strength requirements.
- This option is only available if the user does **not** already have a password set.

---

## 11. Account Deletion

### 11.1 Self-Service Account Deletion

- Any authenticated user can delete their own account.
- Account deletion is a soft delete — the record is marked as deleted, not permanently erased.

### 11.2 What Happens When an Account is Deleted

- All of the user's organization memberships are removed (soft-deleted).
- All pending invitations sent to the user's email are removed.
- The user's session is destroyed and they are logged out.
- **Important consideration:** If the user is the Owner of an organization, they should transfer ownership before deleting their account. Otherwise, the organization may be left without an Owner.

---

## 12. Platform Administrators (Superusers)

Superusers are special users with platform-wide administrative privileges, separate from the organization-level role system.

### 12.1 How Superusers Are Designated

- Superuser emails are configured via an environment variable (`SUPERUSER_EMAILS`), not through the application interface.
- This is a comma-separated list of email addresses.
- The superuser flag is checked and synchronized at every login. If an email is added to or removed from the list, the change takes effect the next time that user logs in.

### 12.2 Superuser Capabilities

Superusers have access to an administrative panel with the following capabilities:

- **User Management:** View all users across the platform, update user details, delete user accounts, grant or revoke superuser status to other users.
- **Organization Management:** View all organizations, update organization details, delete organizations.
- **System Configuration:** Change platform-wide settings such as password policies, session duration, organization limits, and invitation expiry.
- **Billing Administration:** Manage plans, bundles, features, and entitlements across all organizations.
- **Audit Logs:** View all audit trail entries across the platform.

### 12.3 Superuser Restrictions

- A superuser **cannot revoke their own superuser status** through the admin panel. This prevents accidental lockout.
- A superuser **cannot delete another superuser** through the admin panel.

---

## 13. Audit Logging

The platform maintains a comprehensive audit trail of all significant actions.

### 13.1 What is Logged

Every action below creates an audit record with the user who performed it, what was affected, and relevant details:

**Authentication Events:**
- User registration (email, OTP, or Google)
- User login (email, OTP, or Google)
- User logout
- Password reset
- OTP verification

**Profile Events:**
- Profile update (old and new values recorded)
- Password change
- Password creation (Google users)
- Account deletion

**Organization Events:**
- Organization created
- Organization updated
- Organization deleted

**Membership Events:**
- Invitation sent
- Invitation accepted
- Invitation declined
- Invitation revoked
- Member removed
- Member role changed
- Ownership transferred (records both previous and new Owner)

### 13.2 Audit Record Details

Each audit record includes:
- **Who** performed the action (user ID)
- **What** action was taken
- **What entity** was affected (type and ID)
- **When** it happened (timestamp)
- **Additional context** (e.g., old role vs. new role, method of login, reason for action)
- **Request metadata** (IP address, browser type, when available)

---

## 14. Edge Cases and Special Scenarios

### 14.1 The "Last Owner" Problem

- Every organization must have exactly one Owner.
- The Owner cannot be removed from the organization.
- If the Owner wants to leave, they must first transfer ownership to another member.
- There is no restriction on having zero Admins — it is valid for an organization to have only an Owner and regular Members.

### 14.2 User Deleted While Logged In

- If a user's account is deleted (e.g., by an administrator) while they are still logged in on another device, their session remains active briefly.
- On the next request, the system checks whether the user still exists in the database. Since they have been deleted, the session is invalidated and the user receives an "unauthorized" error.
- The cookie is cleared, and the user is effectively logged out.

### 14.3 Invitation Email Mismatch

- If a user tries to accept an invitation using a different email than the one the invitation was sent to, the acceptance is rejected.
- This applies to all methods: direct acceptance, registration with token, and login with token.

### 14.4 Rejoining After Removal

- When a member is removed from an organization, their membership record is soft-deleted.
- If they are later re-invited and accept, the system restores their old membership record rather than creating a new one.
- Their role is set to whatever the new invitation specifies — it does **not** carry over from their previous membership.

### 14.5 Multiple Organization Membership

- Users can be members of up to 5 organizations (configurable).
- Each organization is completely independent — a user can be an Owner in one organization and a Member in another.
- The user switches between organizations using an organization selector in the interface. All API requests include the currently active organization.

### 14.6 Duplicate Email Prevention

- The platform enforces unique email addresses across all active (non-deleted) accounts.
- Deleted accounts free up their email address for reuse.
- Email comparison is case-insensitive for uniqueness checks.

### 14.7 OAuth and Password Coexistence

- A user who registered via Google can later set a password. After that, they can log in using either method.
- A user who registered with email/password can also log in via Google (if the Google account uses the same email). Both methods point to the same account.
- At no point are two separate accounts created for the same email address.

### 14.8 Expired Sessions During Operations

- If a user's session expires while they are in the middle of using the application, their next API request will fail with an "unauthorized" error.
- The frontend detects this and redirects the user to the login page.
- Any unsaved work in the current page may be lost.

### 14.9 Invitation and Organization Capacity

- The organization capacity limit counts **both** active members **and** pending invitations.
- Example: If the limit is 50, and there are 45 active members and 4 pending invitations, only 1 more invitation can be sent.
- If an invitation expires or is revoked, that "slot" becomes available again.

### 14.10 Email Enumeration Protection

- The forgot-password and OTP login flows always return a success message, even if the email does not exist in the system.
- This prevents malicious users from probing the system to find out which emails are registered.

---

## 15. System Limits and Configuration

The following settings are configurable by platform administrators and control key business rules:

| Setting | Default Value | Description |
|---------|:------------:|-------------|
| Maximum organizations per user | 5 | How many organizations a single user can belong to |
| Maximum organization capacity | 50 | Maximum members + pending invitations per organization |
| Session duration | 24 hours | How long a login session remains valid |
| Invitation expiry | 7 days | How long an invitation link remains valid |
| Password policy | 8+ chars, upper, lower, number | Minimum password strength requirements |
| Password policy message | (descriptive text) | The error message shown when a password is too weak |

All of these values can be adjusted through the admin panel without requiring a code deployment.

---
