# System Reset Workflow — What Actually Executes

Spec section 37 calls this "extremely sensitive" and rule 10 says
*"NEVER allow production data destruction without this approval
process."* This document is honest about the line between "the approval
workflow is fully implemented" and "the destructive action is fully
implemented" — they are not the same claim.

## The workflow (fully implemented, all of it)

1. Admin creates a `ResetRequest` — `reset.request` permission — with a
   reset type, a human-readable scope, an explicit list of affected
   tables, a reason, and an impact description. Status: `REQUESTED`.
2. **Finance Director** approves — `reset.approve` permission, distinct
   user from the requester (self-approval blocked, same rule as
   everywhere else in this codebase). Status: `FINANCE_APPROVED`.
3. **Managing Director / CEO** approves — same permission, must also be
   distinct from the requester. Status becomes `APPROVED` only once
   *both* Finance Director and MD have signed off — either one rejecting
   at any point sets status to `REJECTED` and stops the process
   entirely, with a mandatory reason.
4. Only once `APPROVED`: Admin executes — `reset.execute` permission,
   which only the ADMIN role holds in the seed. The `affectedTables`
   list is **frozen** at request time; execution can't touch anything
   the approvers didn't see and approve. Immediately before deleting
   anything, a `preResetSnapshot` (row counts per affected table) is
   captured and stored on the request; immediately after, a
   `postResetVerification` snapshot is captured too — both are part of
   the permanent, append-only audit trail.

Every step writes an `AuditLog` entry. None of this is faked — the state
machine, the dual-approval requirement, the self-approval ban, the
snapshot capture, and the audit trail are all real and tested.

## What actually gets deleted (deliberately narrow)

`SystemResetService.execute()` only performs a real delete for tables on
a **hard-coded, small allowlist**:

```
InventoryTransaction, InventoryBalance
```

If an approved request's `affectedTables` includes anything outside this
allowlist, `execute()` throws a clear `RESET_SCOPE_NOT_IMPLEMENTED`
error rather than silently deleting a broader or different set of tables
than what was actually reviewed and approved. The approval workflow
itself doesn't lie about what state a request is in — a request for,
say, a full operational reset can be created, and both approvers can
sign off on it — but *executing* it will honestly fail with that error
until this allowlist is deliberately extended.

**Why this narrow scope, and not everything spec section 37 lists**
(clear test data, reset transactions, reset module, reset date range,
full operational reset): those all require careful, module-specific
logic about what "reset" even means for sales orders, invoices, tasks,
and messages that reference each other via foreign keys — getting that
wrong on a production system is exactly the kind of mistake this
approval gate exists to prevent. The inventory ledger is the one place
in this codebase already designed around the idea that its rows can be
zeroed and rebuilt from scratch (that's the entire point of an
append-only ledger with derived balances), so it's the one scope where a
real, safe implementation was achievable without guessing at semantics
for data this project hasn't had time to think through carefully.

Extending the allowlist to cover more of spec section 37's reset types is
a natural next step — each one needs its own reviewed, tested delete
logic, added deliberately rather than assumed to be "the same kind of
thing" as clearing a ledger.
