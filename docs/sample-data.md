# Local sample data

The repository keeps a realistic, internally linked manufacturing dataset in
`supabase/seed.sql`. It creates fifteen customer orders: seven Wings and More,
seven Jason's Deli, and one Jason's Family Market order, distributed over a
mix of one-week, ten-business-day, and fourteen-business-day mixing runs. Four
orders run for ten mixing days, four run for fourteen mixing days, and seven run
for one week. Every added order has a daily staggered ingredient-prep, mixing, and
packaging chain, followed by distinct loading and shipping-pickup work orders.
Finish-to-start dependency rows connect each execution stage, including confirmed
purchase receiving before first prep and loading/shipping after final packaging.
All work orders have matching planner/calendar projections and worker assignments.
Five linked inbound purchase orders are confirmed so supplier deliveries also
appear in the schedule. The fixture also includes ingredients,
suppliers, packs, inventory, released recipes, customer pricing, orders,
confirmed purchase orders, planned production preparation, unstarted mixer
batches, and packaging/loading/shipping work. It deliberately does not post
receipts, ingredient consumption, completed worksheets, production lots, or
finished-goods genealogy. Completed execution states require explicit local
workflow actions or isolated test fixtures; the seed does not fabricate them.

This dataset is deliberately local-only. It must never be applied to the linked
shared Supabase project. Recreate a clean local database and reload the saved
dataset with:

```powershell
npm run sample-data:reset
```

The command uses the Supabase CLI's local database target. It destroys and
recreates only the local development database, applies every migration, and then
runs `supabase/seed.sql`. Sign in locally with
`sample.admin@saladsoulmates.test` / `LocalSampleOnly!`.

Two Main plant worker accounts are also included for the scheduling and worker-claim
demo. Both use the same local-only password, `LocalSampleOnly!`:

- `basil.batch@saladsoulmates.test` — Basil Batch
- `casey.ofill@saladsoulmates.test` — Casey O’Fill

The formulation quantities are plausible workflow examples, not approved
production formulas. The records use the reserved `10000000-...` UUID range so
they remain visibly synthetic in diagnostics and exports.

Dates share one facility-local anchor on every regeneration. Purchase delivery
commitments land six to seven days in the past, production begins today, and customer
commitments span the needed production horizon. Each order follows a deliberate
business-day sequence: confirmed purchasing/receiving → prep → mixing →
packaging, repeated daily for its defined mixing run, then loading and shipping
pickup. Planned work does not imply physical receipt or completed execution.
This keeps receiving, current production and future fulfillment queues useful
without hand-editing dates.

The application does not yet implement confirmed finished-goods inventory,
shipment confirmation, invoicing, carrier purchasing or customer notification;
the seed therefore stops at immutable shipping drafts for those domains.
