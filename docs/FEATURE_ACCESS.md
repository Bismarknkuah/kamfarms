# Who can use what (version 2026.10.16)

In **System settings**, *Who can use what* lets the Administrator switch features off for a role. Switched off, the people in that role **do not see the feature** in their menu or on their
dashboard, and the **server refuses it** if they try to reach it anyway.

## Why it is a separate setting, and not just the Roles page

The permissions of the built-in roles are **rebuilt from the code every time the system is updated** (`prisma/sync-permissions.ts` deletes and recreates them). A change made to a built-in role on the
Roles page is therefore lost at the next deploy. What is switched off here is kept in its **own table** (`role_feature_denials`), which the update never touches, and is applied on top of the role's
permissions on every request. (Roles you create yourself are not touched by the update.)

## What can be switched off

Control center, Quick search, Track dispatch, Trace batch, Paddy requests, Mill dispatch, Reviewing damaged bags, AI Insights, Reports and analytics, Messages, Audit log
(`backend/src/access/access-features.ts`). Each feature is tied to the permissions that give it. **Core work** (selling, approving, paying, receiving, recording paddy) is deliberately not on the list:
switching it off would stop the business, and it belongs on the Roles page. A dash in the table means that role was never given the feature.

## How it works

- Sign-in (`JwtStrategy.validate`) loads the person's role permissions, then removes those of every feature switched off **for that role**. A person with two roles keeps a permission if either role
  still has it. The menu, the dashboard widgets and every server check follow, because they all read the same permission list.
- *Control center* and *Quick search* are not tied to a permission: `/auth/me` returns them as `hiddenFeatures` (switched off for **every** role the person holds), the website hides them, and the
  control center and search endpoints refuse them.
- A change takes effect within seconds (the list is cached for 15 seconds and cleared the moment it is saved). It is written to the audit log with who changed it.
- **The System Administrator is never restricted**, and cannot be listed. If the table cannot be read, nobody is restricted (a settings problem must never lock people out).

## Where it lives

`backend/src/access/` (catalogue, service, controller; global module), `backend/src/auth/strategies/jwt.strategy.ts`, `frontend/src/components/FeatureAccess.tsx`. One table: `role_feature_denials`.
Permission to use the screen: `settings.manage`.

## Tests

`role-access.service.spec.ts` (including a check that every permission the catalogue names exists), `jwt-restrictions.spec.ts`; `e2e/t_update.py` (browser).
