# System settings

The rules and limits the system works by used to be fixed in the code, so changing one meant a developer, a new release and a deployment. They are now settings the **System Administrator** changes from the screen.

**Who:** the `settings.manage` permission (System Administrator only).
**Where:** sidebar, **System settings** (`/settings`).

Every setting starts at a **standard** value, which is exactly the number that used to be in the code, so nothing changes until someone changes it. A change takes effect straight away, is checked before it is saved, and is recorded in the audit log (who, what, from what to what). Each setting can be put back to standard on its own.

## What can be changed

| Group | Setting | Standard | Allowed |
|---|---|---|---|
| Sign-in security | Wrong passwords before an account is locked | 5 attempts | 3 to 20 |
| | How long a locked account stays locked | 15 minutes | 1 to 1,440 |
| Deliveries and weights | Delivery difference accepted without approval | 5 kg | 0 to 1,000 |
| | Standard paddy bag weight (used when only bags are entered) | 50 kg | 10 to 100 |
| Milling checks | Milling gap that raises a flag | 5 % | 0.5 to 50 |
| | Extra output allowed before a run is rejected as impossible | 0.5 % | 0 to 10 |
| Machine power checks | Power reading that counts as unusual | 50 % from the machine's average | 10 to 300 |
| | Earlier readings needed before a machine is judged | 3 | 2 to 30 |
| Who is alerted | Roles told when a milling run does not add up | Operations Manager, MD, CEO | any roles (at least one) |
| | Roles told when a machine's power reading is unusual | Operations Manager, MD, CEO | any roles (at least one) |
| Watchlist limits | Period the Watchlist looks at | 30 days | 7 to 90 |
| | Rice recovery drop that is flagged | 5 points | 1 to 30 |
| | Extra power per kg that is flagged / serious | 25 % / 50 % | 5 to 200 / 10 to 400 |
| | Paddy arriving short that is flagged / serious | 1.5 % / 4 % | 0.1 to 20 / 0.5 to 50 |
| | Stock written down that is flagged / serious | 20 / 50 bags | 1 to 1,000 / 1 to 5,000 |
| | Days an order may sit reserved that is flagged / serious | 3 / 7 days | 1 to 30 / 1 to 60 |
| | Paddy intake drop that is flagged | 50 % of usual | 10 to 90 |
| | Paddy entries rejected that is flagged | 25 % | 5 to 90 |
| | Spending jump that is flagged | 2 times usual | 1.2 to 10 |

A "serious" limit can never be set below the limit at which something is first flagged, and an alert list can never be left empty.

## How it works (for developers)

- The list is one array, `backend/src/settings/settings.registry.ts`. The screen is drawn from it, the server validates against it, and the services read their values through it, so the three can never disagree.
- Values live in the existing `system_settings` table. A value equal to its standard is not stored at all.
- Services read a value with `settingNumber(this.settings, 'key')` or `settingRoles(...)`. Reads are cached for 15 seconds; saving clears the cache at once.
- A test (`settings.registry.spec.ts`) fails if a standard drifts from the old fixed number or from the watchlist engine's built-in limit, and `settings-wiring.spec.ts` proves that changing a setting changes the service's behavior.
- To add a setting: add an entry to the registry, read it in the service, and add a behavior test. The screen and validation appear automatically.

## What is still fixed in code

- Which roles are accountable at each step of the sales chain (who is notified to approve, release and deliver).
- The list of permissions itself, and the definitions of the default roles for a fresh installation.
- The rules each Watchlist check applies (only their limits are adjustable), and the list of downloadable reports.
- The product poster picture and the description of the system's features on the homepage.
