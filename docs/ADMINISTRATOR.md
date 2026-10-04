# The System Administrator

The System Administrator is the one role that is never limited by a list.

## Full access

Every other role holds a chosen set of permissions. The Administrator holds **all of them, everywhere**.

- **How it works.** At sign-in the server widens the Administrator role to every permission in the catalog
  (`backend/src/common/constants/permissions.ts`) and to the `GLOBAL` scope. See
  `backend/src/auth/administrator-access.ts`. The browser mirrors this in `frontend/src/lib/access.ts`, so menus and
  pages agree with the server.
- **Why it is computed, not stored.** A permission added in a later release is available to the Administrator the moment
  that server starts. There is no sync step in between that could leave them at a "you do not have permission" screen.
  This is what went wrong when the homepage editor first shipped: the new permission had not reached the Administrator's
  stored role yet.
- **The seed too.** `prisma/seed.ts` and `prisma/sync-permissions.ts` define the Administrator as the whole catalog
  (`PERMISSION_CATALOG.map((p) => p.code)`), so the stored role matches what the server grants.
- **A test keeps this true.** `backend/src/auth/__tests__/administrator-access.spec.ts` fails if any route or service asks
  for a permission that is not in the catalog, because nobody, the Administrator included, could ever hold it.

## What full access does not mean

- **Records still follow their own rules.** Nobody, the Administrator included, can approve or reject a sales order or an
  expense they created themselves. Those rules are checked per record.
- **The role cannot be narrowed.** The roles screen refuses to edit the Administrator role. Create or copy another role
  for a limited administrator.
- **The last Administrator is protected.** Removing the Administrator role from, or disabling, the only other active
  Administrator is refused. Nobody can change their own roles or status.
- **Everything is audited.** Every change an Administrator makes is in the audit log.

## The Administrator console

The Administrator does not get the dashboard the other roles share.

- **Dashboard** (`frontend/src/components/admin/AdminDashboard.tsx`): a welcome band with shortcuts, the Control Center
  (server version, database, people, places, roles, activity), the reset, backup and master-data tiles, and the demo
  sign-in switch. No farm, sales or finance desks.
- **Menu** (`ADMIN_NAV_SECTIONS` in `frontend/src/lib/nav-items.ts`): three groups, Administration, Company data and
  Workspace, with an "Administrator console" badge. Pages that exist for one role's daily work (My Office, Oversight, log
  paddy intake, dispatch, stock correction requests, warehouse requests) are left out on purpose.
- **Other roles are unchanged.** Every other role's menu was compared before and after this change and is identical.

## Demo sign-in buttons

The sign-in page offers one-click demo accounts so each role can be tested. They are **on by default**.

- The Administrator can switch them on or off from the Admin dashboard (it saves the homepage content with only that one
  setting changed) or from **Public homepage, Sign-in page**.
- All demo accounts share one password that is published in the code. **Turn the buttons off, and change or disable the
  demo accounts in People and accounts, before real staff use the system.**

## Server start-up

`docker/Dockerfile.api` pushes the database schema, runs the permission, role and expense-category syncs, and starts the API.
A sync step that fails is logged (`[startup] WARNING: ...`) and the API **starts anyway**. Only the schema push is
required. After a deploy, open `/api/health`: it reports the server `version` and `features`. The Admin dashboard warns in
plain words when the server is older than the website.

`railway.json` also sets a **health check** on `/api/health`: Railway sends traffic to a new version only once it answers, and a
version that fails to start never replaces the one that is running. `backend/src/__tests__/app-boot.spec.ts` starts the whole
server and checks the health route, the headers the website needs, and that the newest routes exist. See `docs/DEPLOYMENT.md`
for what to do when the sign-in page says the server did not answer.
