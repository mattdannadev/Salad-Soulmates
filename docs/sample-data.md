# Local sample data

The repository keeps a realistic, internally linked manufacturing dataset in
`supabase/seed.sql`. It creates two end-to-end customer flows for Creamy
Buttermilk Ranch and Classic Italian Vinaigrette, plus their ingredients,
suppliers, packs, inventory, released recipes, customer pricing, orders,
confirmed purchase orders, partial receiving with supplier lots and physical
package serials, production preparation, production lots, completed worker
worksheets, approved packaging and shipping preparation. Each customer flow also
retains unstarted mixer batches so both completed and pending worker states can be
tested.

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

The formulation quantities are plausible workflow examples, not approved
production formulas. The records use the reserved `10000000-...` UUID range so
they remain visibly synthetic in diagnostics and exports.

Dates share one facility-local anchor on every regeneration. Purchase receipts
land six to seven days in the past, production begins today, pickup/shipping is
two to three weeks ahead, and expiration remains one year or more in the future.
This keeps receiving, current production and future fulfillment queues useful
without hand-editing dates.

The application does not yet implement confirmed finished-goods inventory,
shipment confirmation, invoicing, carrier purchasing or customer notification;
the seed therefore stops at immutable shipping drafts for those domains.
