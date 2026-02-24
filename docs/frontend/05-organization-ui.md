# Organization UI

## Overview

The organization UI handles creation, selection, and management of organizations (teams). Users can create organizations, invite members, manage roles, transfer ownership, and delete organizations.

## Pages

### CreateOrganisation (`CreateOrganisation.tsx`)
Initial organization setup during onboarding:
- Organization name input
- Optional website URL
- Invite team members by email
- Email validation
- Split-screen branding layout
- Redirect support for external apps

### ChooseOrganisation (`ChooseOrganisation.tsx`)
Organization selection when user has multiple memberships:
- List all user's organizations
- Display role (Owner/Admin/Member) per org
- Pending invitations banner
- Direct selection to set active org
- Redirect support after selection

### Organisation (`Organisation.tsx`)
Full organization settings and team management:
- **Details tab:** Edit org name and website
- **Members tab:** View, search, paginate members
- **Invitations:** Send new invitations
- **Role management:** Change member roles (Owner only)
- **Remove members:** Remove team members (Admin+)
- **Transfer ownership:** Transfer to another member (Owner only)
- **Delete organization:** With name confirmation (Owner only)

## Organization Lifecycle

```
Create Org → Set as Active → Invite Members → Manage Team → (Optional) Delete
```

### Creation Flow
1. User lands on `/create-organisation` (redirect from ProtectedRoute if no orgs)
2. Enters org name and optional website
3. Optionally adds invite emails
4. On submit: org created, user set as Owner, invites sent
5. Redirects to `/apps` or external redirect URL

### Selection Flow
1. User lands on `/choose-organisation` (redirect if multiple orgs, none selected)
2. Sees list of all their organizations
3. Clicks to select → sets `activeOrganizationId` in localStorage
4. Redirects to `/apps` or intended destination

## Components Used

- `SplitScreenLayout` — Two-column layout for create org page
- `DataTable` — Member list with pagination/search
- `Dialog` — Invite member, transfer ownership, delete confirmation
- `Select` — Role selection dropdown
- `Badge` — Role display, pending invite count

## Key Files

- `frontend/src/pages/CreateOrganisation.tsx`
- `frontend/src/pages/ChooseOrganisation.tsx`
- `frontend/src/pages/Organisation.tsx`
- `frontend/src/pages/PendingInvitations.tsx`
- `frontend/src/pages/InviteAccepted.tsx`

---

## Issues Found

1. **Incorrect `useState` usage in CreateOrganisation** — Uses `useState` callback for side effect logic (reading URL params) which runs on every render instead of using `useEffect`. (Skipping as we need to read URL params)
2. ~~**Email validation too lenient** — Regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` accepts invalid emails like `a@b.c`.~~
3. ~~**No duplicate email detection** — Can add the same email multiple times to the invite list.~~
4. **Website URL not validated** — Any string accepted as website, including invalid URLs. (Skipping as not needed)
5. ~~**Stale closure in ChooseOrganisation** — `checkPendingInvites` from props is called in useEffect without being in the dependency array.~~
6. ~~**Race condition on org selection** — If `activeOrganization` changes while selecting another org, redirect logic may target the wrong org.~~
7. ~~**No keyboard navigation** — Organization list in ChooseOrganisation is not keyboard accessible.~~
8. **Dialog state not reset** — When closing the "Invite Member" dialog, the form values persist. (No loss in persisting values)
9. **Delete confirmation is case-sensitive** — Requires typing the exact org name, case-sensitive, which is strict UX. (Skipping as case-sensitive is good for security)
10. ~~**Transfer ownership missing validation** — No check that the new owner is not the current user.~~
11. ~~**Multiple `setIsLoading` calls** — Duplicate state setter calls in Organisation.tsx.~~
12. **Permissions checked in UI only** — UI hides buttons based on role, but doesn't prevent API calls if the user manipulates the interface. (Not needed as checked in backend)
13. ~~**Member search race condition** — Searching while pagination is loading could show stale results.~~
14. **No batch operations** — Cannot accept/decline multiple invitations at once on PendingInvitations page. (Skipping as not needed)
