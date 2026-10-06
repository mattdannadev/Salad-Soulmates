import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { z } from 'zod';
import {
  afterAll, beforeAll, describe, expect, it,
} from 'vitest';
import {
  preparationExecutionTraceSchema,
  productionBatchExecutionSchema,
} from '@/domain/production-batches';
import { gateActor, initializeGateDatabase } from './integration/postgres-bootstrap';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const mixerId = id(600);
const tankId = id(601);
const inactiveTankId = id(602);
const pumpId = id(603);
const otherFacilityMixerId = id(604);
const otherFacilityTankId = id(605);
const alternateTankId = id(606);
let database: PGlite;

async function query(sql: string, parameters: unknown[] = []) {
  return database.query(sql, parameters);
}

async function actAs(actor: string) {
  await database.exec('reset role');
  await database.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  await database.exec('set role authenticated');
}

async function startProductionBatch(
  productionBatchId: string,
  revision = 1,
  equipmentSelection: Record<string, string> = {},
) {
  return query('select public.start_production_batch($1::jsonb)', [JSON.stringify({
    production_batch_id: productionBatchId,
    revision,
    mixer_equipment_id: mixerId,
    tank_equipment_id: tankId,
    ...equipmentSelection,
  })]);
}

async function saveProductionDayEquipmentSelection(
  selectedMixerId = mixerId,
  selectedTankId = tankId,
  revision = 0,
) {
  return query('select public.save_production_day_equipment_selection($1::jsonb)', [JSON.stringify({
    local_production_date: '2026-10-01',
    mixer_equipment_id: selectedMixerId,
    tank_equipment_id: selectedTankId,
    revision,
  })]);
}

describe('production batch execution foundation', () => {
  beforeAll(async () => {
    database = new PGlite();
    await initializeGateDatabase((sql) => database.exec(sql));
    await database.exec(`
      insert into auth.users(id,email) values('${id(50)}','other-facility@example.test');
      insert into public.facilities(id,organization_id,name)
        values('${id(12)}','${id(10)}','Other facility');
      insert into public.profiles(id,organization_id,facility_id,display_name,role,access_profile_id)
      select '${id(50)}','${id(10)}','${id(12)}','Other facility admin','admin',id
      from public.access_profiles where name='Administrator';
    `);
    await actAs(gateActor);
    await database.exec(`
      insert into public.ingredients(id,name,default_uom)
        values('${id(100)}','Synthetic garlic','lb');
      insert into public.products(id,name,product_code,production_lot_identifier)
        values('${id(300)}','Synthetic dressing',null,'SYN');
      insert into public.recipes(id,product_id,name)
        values('${id(400)}','${id(300)}','Synthetic formula');
      insert into public.recipe_versions(id,recipe_id,version_number)
        values('${id(401)}','${id(400)}',3);
      insert into public.recipe_sections(id,recipe_version_id,name,sequence)
        values('${id(402)}','${id(401)}','Ingredients',1);
      insert into public.recipe_lines(recipe_version_id,recipe_section_id,ingredient_id,
        source_line_key,sequence,display_measurement,normalized_quantity,normalized_uom)
        values('${id(401)}','${id(402)}','${id(100)}','TEST-1',1,'10 lb',10,'lb');
      update public.recipe_versions set status='Released',released_by='${gateActor}'
        where id='${id(401)}';
      update public.recipes set active_version_id='${id(401)}' where id='${id(400)}';
      insert into public.equipment(
        id,equipment_code,display_name,equipment_type,usable_capacity,usable_capacity_uom,
        is_production_preferred
      ) values
        ('${mixerId}','MIX-BATCH','Production mixer','mixer',151.4165,'l',true),
        ('${tankId}','TANK-BATCH','Primary holding tank','tank',500,'gal',true),
        ('${alternateTankId}','TANK-ALTERNATE','Alternate holding tank','tank',750,'gal',false),
        ('${inactiveTankId}','TANK-INACTIVE','Inactive holding tank','tank',300,'gal',false),
        ('${pumpId}','PUMP-BATCH','Transfer pump','pump',null,null,false);
      update public.equipment set status='out_of_service',revision=revision+1
        where id='${inactiveTankId}';
    `);
    await actAs(id(50));
    await query(`insert into public.equipment(
      id,equipment_code,display_name,equipment_type,usable_capacity,usable_capacity_uom,
      is_production_preferred
    ) values
      ($1,'MIX-OTHER','Other facility mixer','mixer',40,'gal',true),
      ($2,'TANK-OTHER','Other facility tank','tank',400,'gal',true)`, [
      otherFacilityMixerId, otherFacilityTankId,
    ]);
    await actAs(gateActor);
    await query('select public.save_customer_order($1::jsonb)', [JSON.stringify({
      id: id(800),
      customer_name: 'Synthetic customer',
      reference: 'BATCH-FOUNDATION',
      needed_on: '2026-10-03',
      products: [{ product_id: id(300), batch_count: 2, customer_product_option_id: null }],
    })]);
    await query('select public.save_order_production_plan($1::jsonb)', [JSON.stringify({
      id: id(800),
      revision: 0,
      start_on: '2026-10-01',
      finish_on: '2026-10-02',
      status: 'Draft',
      note: '',
      shortage_reason: '',
    })]);
  }, 60000);

  afterAll(async () => {
    await database.close();
  });

  it('keeps preparations independent while two actual batches share one recall lot', async () => {
    const plannedBatchSchema = z.object({
      batch_id: z.uuid(), preparation_id: z.uuid(), sequence: z.number(),
    });
    const planned = z.tuple([plannedBatchSchema, plannedBatchSchema]).parse(
      (await query(`select batch.id batch_id, preparation.id preparation_id,
        batch.sequence
      from public.planned_mixer_batches batch
      join public.planned_spice_preparations preparation
        on preparation.planned_mixer_batch_id=batch.id
      order by batch.sequence`)).rows,
    );
    await database.exec('reset role');
    await query(`insert into public.workforce_work_queue_items(
      id,organization_id,facility_id,work_on,kind,title,created_by,updated_by,
      batch_quota,estimated_minutes,publication_state,published_by,published_at
    ) values
      ($1,$3,$4,'2026-10-01','mixing','Fixture mixing',$5,$5,2,120,'published',$5,now()),
      ($2,$3,$4,'2026-10-01','ingredient_prep','Fixture preparation',$5,$5,2,120,'published',$5,now())`, [
      id(700), id(701), id(10), id(11), gateActor,
    ]);
    await query(`insert into public.finished_recall_lots(
      id,organization_id,facility_id,product_id,local_production_date,recall_lot_code,
      product_name_snapshot,idempotency_key
    ) values($1,$2,$3,$4,$5,$6,$7,$8)`, [
      id(900), id(10), id(11), id(300), '2026-10-01', 'SYN-20261001', 'forged', id(901),
    ]);
    await query(`insert into public.production_batches(
      id,organization_id,facility_id,planned_mixer_batch_id,product_id,recipe_version_id,
      finished_recall_lot_id,local_production_date,run_sequence,run_code,
      product_name_snapshot,recipe_name_snapshot,recipe_version_snapshot,idempotency_key,work_order_id
    ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'${id(700)}')`, [
      id(910), id(10), id(11), planned[0].batch_id, id(300), id(401), id(900),
      '2026-10-01', 1, 'SYN-20261001-0001', 'forged', 'forged', 999, id(911),
    ]);
    await query(`insert into public.production_batches(
      id,organization_id,facility_id,planned_mixer_batch_id,product_id,recipe_version_id,
      local_production_date,run_sequence,run_code,
      product_name_snapshot,recipe_name_snapshot,recipe_version_snapshot,idempotency_key,work_order_id
    ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'${id(700)}')`, [
      id(912), id(10), id(11), planned[1].batch_id, id(300), id(401),
      '2026-10-01', 2, 'SYN-20261001-0002', 'forged', 'forged', 999, id(913),
    ]);
    await expect(query(`insert into public.production_batches(
      organization_id,facility_id,planned_mixer_batch_id,product_id,recipe_version_id,
      local_production_date,run_sequence,run_code,product_name_snapshot,
      recipe_name_snapshot,recipe_version_snapshot,state,started_at,
      mixer_equipment_id,tank_equipment_id,idempotency_key
    ) values($1,$2,$3,$4,$5,$6,99,$7,'forged','forged',999,'released',now(),$8,$9,$10)`, [
      id(10), id(11), planned[0].batch_id, id(300), id(401), '2026-10-01',
      'SYN-20261001-0099', mixerId, tankId, id(914),
    ])).rejects.toThrow('Create production batches as not started');
    await query(`insert into public.preparation_executions(
      id,organization_id,facility_id,planned_spice_preparation_id,product_id,
      local_production_date,idempotency_key
    ) values($1,$2,$3,$4,$5,$6,$7)`, [
      id(920), id(10), id(11), planned[0].preparation_id, id(300),
      '2026-10-01', id(921),
    ]);
    await query(`update public.preparation_executions
      set work_order_id='${id(701)}',state='in_progress',started_at='2026-10-01T12:00:00Z',revision=revision+1
      where id=$1`, [id(920)]);
    const inventoryEventsBeforeStart = z.object({ count: z.number() }).parse(
      (await query('select count(*)::int count from public.inventory_events')).rows[0],
    ).count;
    await actAs(gateActor);
    await expect(query(`update public.equipment
      set is_production_preferred=true,revision=revision+1 where id=$1`, [alternateTankId]))
      .rejects.toThrow('unique');
    await expect(query(`update public.equipment
      set is_production_preferred=true,revision=revision+1 where id=$1`, [pumpId]))
      .rejects.toThrow('Only active mixers and tanks');
    await expect(query(`update public.equipment
      set is_production_preferred=true,revision=revision+1 where id=$1`, [inactiveTankId]))
      .rejects.toThrow('Only active mixers and tanks');
    await expect(query(`update public.equipment
      set status='retired',retired_on=current_date,revision=revision+1 where id=$1`, [tankId]))
      .rejects.toThrow('Remove the production preference');
    const setupRow = z.object({ setup: z.unknown() }).parse((await query(
      "select public.production_day_equipment_setup('2026-10-01') setup",
    )).rows[0]);
    const setup = z.object({
      selection: z.null(),
      mixers: z.array(z.object({ id: z.uuid(), is_production_preferred: z.boolean() })),
      tanks: z.array(z.object({ id: z.uuid(), is_production_preferred: z.boolean() })),
    }).parse(setupRow.setup);
    expect(setup.mixers[0]).toMatchObject({ id: mixerId, is_production_preferred: true });
    expect(setup.tanks[0]).toMatchObject({ id: tankId, is_production_preferred: true });
    await expect(query('select public.start_production_batch($1::jsonb)', [JSON.stringify({
      production_batch_id: id(910), revision: 1,
    })])).rejects.toThrow('Select a production batch, mixer, tank, and current revision');
    await expect(saveProductionDayEquipmentSelection(mixerId, inactiveTankId))
      .rejects.toThrow('active same-facility tank');
    await expect(saveProductionDayEquipmentSelection(otherFacilityMixerId, tankId))
      .rejects.toThrow('active same-facility mixer');
    await saveProductionDayEquipmentSelection();
    await actAs(id(50));
    expect((await query(
      'select count(*)::int count from public.production_day_equipment_selections',
    )).rows).toEqual([{ count: 0 }]);
    await actAs(gateActor);
    await query("update public.uoms set active=false where organization_id=$1 and code='l'", [id(10)]);
    await expect(startProductionBatch(id(910)))
      .rejects.toThrow('typed usable capacity');
    await query("update public.uoms set active=true where organization_id=$1 and code='l'", [id(10)]);
    await query("update public.uoms set active=false where organization_id=$1 and code='gal'", [id(10)]);
    await expect(startProductionBatch(id(910)))
      .rejects.toThrow('typed usable capacity');
    await query("update public.uoms set active=true where organization_id=$1 and code='gal'", [id(10)]);
    await expect(query('select public.start_production_batch($1::jsonb)', [JSON.stringify({
      production_batch_id: id(910),
    })])).rejects.toThrow('Select a production batch, mixer, tank, and current revision');
    await database.exec('reset role');
    await expect(query(`update public.production_batches
      set state='awaiting_quality',started_at=now(),revision=revision+1 where id=$1`, [id(910)]))
      .rejects.toThrow('Only actual production batch start is enabled');
    await actAs(gateActor);
    await expect(startProductionBatch(id(910), 1, {
      mixer_equipment_id: otherFacilityMixerId,
      tank_equipment_id: otherFacilityTankId,
    })).rejects.toThrow('active same-facility mixer');
    await startProductionBatch(id(910));
    await actAs(gateActor);

    const row = z.object({ execution: z.unknown() }).parse(
      (await query('select public.production_batch_execution($1) execution', [id(910)])).rows[0],
    );
    const execution = productionBatchExecutionSchema.parse(row.execution);
    expect(execution).toMatchObject({
      product_name_snapshot: 'Synthetic dressing',
      recipe_name_snapshot: 'Synthetic formula',
      recipe_version_snapshot: 3,
      mixer_equipment_id: mixerId,
      mixer_equipment_code_snapshot: 'MIX-BATCH',
      mixer_equipment_name_snapshot: 'Production mixer',
      mixer_equipment_type_snapshot: 'mixer',
      tank_equipment_id: tankId,
      tank_equipment_code_snapshot: 'TANK-BATCH',
      tank_equipment_name_snapshot: 'Primary holding tank',
      tank_equipment_type_snapshot: 'tank',
      tank_usable_capacity_snapshot: 500,
      tank_usable_capacity_uom_snapshot: 'gal',
      expected_yield_quantity: 500,
      expected_yield_uom: 'gal',
      finished_recall_lot: {
        id: id(900),
        product_name_snapshot: 'Synthetic dressing',
      },
      preparation_traceability_mode: 'production_day_product',
      preparation_allocations: [],
      preparation_scope: [{
        trace_scope: 'candidate',
        preparation_execution: { id: id(920) },
      }],
    });
    await query(`update public.equipment
      set is_production_preferred=false,revision=revision+1 where id=$1`, [tankId]);
    await query(`update public.equipment
      set is_production_preferred=true,revision=revision+1 where id=$1`, [alternateTankId]);
    await saveProductionDayEquipmentSelection(mixerId, alternateTankId, 1);
    await query(`update public.equipment
      set display_name='Expanded holding tank',usable_capacity=600,revision=revision+1
      where id=$1`, [tankId]);
    const historicalSnapshot = productionBatchExecutionSchema.parse(z.object({
      execution: z.unknown(),
    }).parse(
      (await query('select public.production_batch_execution($1) execution', [id(910)])).rows[0],
    ).execution);
    expect(historicalSnapshot).toMatchObject({
      tank_equipment_name_snapshot: 'Primary holding tank',
      tank_usable_capacity_snapshot: 500,
      expected_yield_quantity: 500,
    });
    await startProductionBatch(id(912), 1, { tank_equipment_id: alternateTankId });
    const nextDefaultSnapshot = productionBatchExecutionSchema.parse(z.object({
      execution: z.unknown(),
    }).parse(
      (await query('select public.production_batch_execution($1) execution', [id(912)])).rows[0],
    ).execution);
    expect(nextDefaultSnapshot).toMatchObject({
      tank_equipment_id: alternateTankId,
      tank_equipment_code_snapshot: 'TANK-ALTERNATE',
      tank_usable_capacity_snapshot: 750,
      expected_yield_quantity: 750,
    });
    expect((await query(`select count(distinct finished_recall_lot_id)::int count
      from public.production_batches where id in ($1,$2)`, [id(910), id(912)])).rows)
      .toEqual([{ count: 1 }]);
    expect((await query('select count(*)::int count from public.inventory_events')).rows)
      .toEqual([{ count: inventoryEventsBeforeStart }]);
    await database.exec('reset role');
    await expect(query(`update public.production_batches
      set expected_yield_quantity=600,revision=revision+1 where id=$1`, [id(910)]))
      .rejects.toThrow('snapshots are immutable');
    await expect(query(`update public.production_batches
      set state='not_started',revision=revision+1 where id=$1`, [id(910)]))
      .rejects.toThrow('Only actual production batch start is enabled');
    await actAs(gateActor);
    const traceRow = z.object({ trace: z.unknown() }).parse(
      (await query('select public.preparation_execution_trace($1) trace', [id(920)])).rows[0],
    );
    const trace = preparationExecutionTraceSchema.parse(traceRow.trace);
    expect(trace.traceability_mode).toBe('production_day_product');
    expect(trace.production_batches.map((batch) => batch.id)).toEqual([id(910), id(912)]);
    expect(trace.production_batches.every((batch) => batch.trace_scope === 'candidate')).toBe(true);
    expect((await query(`select count(*)::int count from public.audit_events
      where entity_id in ($1,$2,$3,$4)`, [id(900), id(910), id(912), id(920)])).rows)
      .toEqual([{ count: 7 }]);

    await expect(query(`insert into public.finished_recall_lots(
      product_id,local_production_date,recall_lot_code,product_name_snapshot,idempotency_key
    ) values($1,$2,$3,$4,$5)`, [id(300), '2026-10-01', 'DUPLICATE', 'Synthetic dressing', id(930)]))
      .rejects.toThrow('permission denied');
  });

  it('rejects duplicate recall scope and identity rewrites even for a privileged connection', async () => {
    await database.exec('reset role');
    await expect(query(`insert into public.finished_recall_lots(
      organization_id,facility_id,product_id,local_production_date,recall_lot_code,
      product_name_snapshot,idempotency_key
    ) values($1,$2,$3,$4,$5,$6,$7)`, [
      id(10), id(11), id(300), '2026-10-01', 'SYN-DUPLICATE', 'Synthetic dressing', id(940),
    ])).rejects.toThrow('unique');
    await expect(query(`update public.production_batches
      set run_code='REWRITTEN',revision=revision+1 where id=$1`, [id(910)]))
      .rejects.toThrow('identity is immutable');
    await expect(query('delete from public.production_batches where id=$1', [id(910)]))
      .rejects.toThrow('cannot be deleted');
  });

  it('supports immutable many-to-many prep allocations without a second inventory debit', async () => {
    await actAs(gateActor);
    const facilityConfiguration = z.object({ revision: z.number() }).parse(
      (await query(`select plant_operations_configuration_revision revision
        from public.facilities where id=$1`, [id(11)])).rows[0],
    );
    await query('select public.save_preparation_traceability_mode($1::jsonb)', [JSON.stringify({
      facility_id: id(11),
      preparation_traceability_mode: 'batch_specific_allocation',
      revision: facilityConfiguration.revision,
    })]);
    const historicalTrace = preparationExecutionTraceSchema.parse(z.object({
      trace: z.unknown(),
    }).parse(
      (await query('select public.preparation_execution_trace($1) trace', [id(920)])).rows[0],
    ).trace);
    expect(historicalTrace.traceability_mode).toBe('production_day_product');
    expect(historicalTrace.production_batches.map((batch) => batch.trace_scope))
      .toEqual(['candidate', 'candidate']);
    const historicalBatch = productionBatchExecutionSchema.parse(z.object({
      execution: z.unknown(),
    }).parse(
      (await query('select public.production_batch_execution($1) execution', [id(910)])).rows[0],
    ).execution);
    expect(historicalBatch.preparation_traceability_mode).toBe('production_day_product');
    expect(historicalBatch.preparation_scope[0]?.trace_scope).toBe('candidate');

    await query('select public.save_customer_order($1::jsonb)', [JSON.stringify({
      id: id(801),
      customer_name: 'Allocation customer',
      reference: 'BATCH-ALLOCATIONS',
      needed_on: '2026-10-03',
      products: [{ product_id: id(300), batch_count: 2, customer_product_option_id: null }],
    })]);
    await query('select public.save_order_production_plan($1::jsonb)', [JSON.stringify({
      id: id(801),
      revision: 0,
      start_on: '2026-10-01',
      finish_on: '2026-10-02',
      status: 'Draft',
      note: '',
      shortage_reason: '',
    })]);
    await database.exec('reset role');
    const allocationPlanSchema = z.object({ batch_id: z.uuid(), preparation_id: z.uuid() });
    const allocationPlans = z.tuple([allocationPlanSchema, allocationPlanSchema]).parse(
      (await query(`select batch.id batch_id, preparation.id preparation_id
        from public.planned_mixer_batches batch
        join public.planned_spice_preparations preparation
          on preparation.planned_mixer_batch_id=batch.id
        where batch.order_id=$1 order by batch.sequence`, [id(801)])).rows,
    );
    await query(`insert into public.production_batches(
      id,organization_id,facility_id,planned_mixer_batch_id,product_id,recipe_version_id,
      local_production_date,run_sequence,run_code,product_name_snapshot,
      recipe_name_snapshot,recipe_version_snapshot,idempotency_key,work_order_id
    ) values
      ($1,$2,$3,$4,$5,$6,$7,3,$8,'forged','forged',999,$9,'${id(700)}'),
      ($10,$2,$3,$11,$5,$6,$7,4,$12,'forged','forged',999,$13,'${id(700)}')`, [
      id(960), id(10), id(11), allocationPlans[0].batch_id, id(300), id(401),
      '2026-10-01', 'SYN-20261001-0003', id(961),
      id(962), allocationPlans[1].batch_id, 'SYN-20261001-0004', id(963),
    ]);
    await query(`insert into public.preparation_executions(
      id,organization_id,facility_id,planned_spice_preparation_id,product_id,
      local_production_date,idempotency_key
    ) values
      ($1,$2,$3,$4,$5,$6,$7),($8,$2,$3,$9,$5,$6,$10)`, [
      id(970), id(10), id(11), allocationPlans[0].preparation_id, id(300),
      '2026-10-01', id(971), id(972), allocationPlans[1].preparation_id, id(973),
    ]);
    await query(`update public.preparation_executions set work_order_id='${id(701)}',state='complete',
      started_at='2026-10-01T12:00:00Z',completed_at='2026-10-01T12:30:00Z',
      output_quantity=12.5,output_uom='lb',revision=revision+1 where id=$1`, [id(970)]);

    const inventoryCount = z.object({ count: z.number() }).parse(
      (await query('select count(*)::int count from public.inventory_events')).rows[0],
    ).count;
    const allocationPayloads = [{
      id: id(951),
      production_batch_id: id(960),
      preparation_execution_id: id(970),
      quantity: 5,
      uom: 'lb',
    }, {
      id: id(953),
      production_batch_id: id(962),
      preparation_execution_id: id(970),
      quantity: 7.5,
      uom: 'lb',
    }, {
      id: id(955),
      production_batch_id: id(962),
      preparation_execution_id: id(972),
      quantity: 4,
      uom: 'lb',
    }];
    await actAs(gateActor);
    await expect(query(
      'select public.record_production_batch_preparation_allocation($1::jsonb)',
      [JSON.stringify(allocationPayloads[0])],
    )).rejects.toThrow('Start the production batch');
    await startProductionBatch(id(960));
    await startProductionBatch(id(962));
    await actAs(gateActor);
    await expect(query(
      'select public.record_production_batch_preparation_allocation($1::jsonb)',
      [JSON.stringify(allocationPayloads[2])],
    )).rejects.toThrow('Complete the preparation');
    await database.exec('reset role');
    await query(`update public.preparation_executions set work_order_id='${id(701)}',state='complete',
      started_at='2026-10-01T12:30:00Z',completed_at='2026-10-01T13:00:00Z',
      output_quantity=4,output_uom='lb',revision=revision+1 where id=$1`, [id(972)]);
    await expect(query(`update public.preparation_executions
      set output_quantity=13,revision=revision+1 where id=$1`, [id(970)]))
      .rejects.toThrow('immutable');
    await actAs(gateActor);
    await expect(query(
      'select public.record_production_batch_preparation_allocation($1::jsonb)',
      [JSON.stringify({ ...allocationPayloads[0], id: id(956), uom: 'oz' })],
    )).rejects.toThrow('must match measured output');
    const firstAllocationResult = await query(
      'select public.record_production_batch_preparation_allocation($1::jsonb) id',
      [JSON.stringify(allocationPayloads[0])],
    );
    await expect(query(
      'select public.record_production_batch_preparation_allocation($1::jsonb)',
      [JSON.stringify({ ...allocationPayloads[1], id: id(957), quantity: 8 })],
    )).rejects.toThrow('exceed measured output');
    await query('select public.record_production_batch_preparation_allocation($1::jsonb)', [
      JSON.stringify(allocationPayloads[1]),
    ]);
    await query('select public.record_production_batch_preparation_allocation($1::jsonb)', [
      JSON.stringify(allocationPayloads[2]),
    ]);
    expect(await query(
      'select public.record_production_batch_preparation_allocation($1::jsonb) id',
      [JSON.stringify(allocationPayloads[0])],
    )).toEqual(firstAllocationResult);
    expect((await query('select count(*)::int count from public.inventory_events')).rows)
      .toEqual([{ count: inventoryCount }]);
    const firstTraceRow = z.object({ trace: z.unknown() }).parse(
      (await query('select public.preparation_execution_trace($1) trace', [id(970)])).rows[0],
    );
    const secondTraceRow = z.object({ trace: z.unknown() }).parse(
      (await query('select public.preparation_execution_trace($1) trace', [id(972)])).rows[0],
    );
    expect(preparationExecutionTraceSchema.parse(firstTraceRow.trace).production_batches
      .map((batch) => [batch.id, batch.trace_scope])).toEqual([
      [id(960), 'affected'],
      [id(962), 'affected'],
    ]);
    expect(preparationExecutionTraceSchema.parse(secondTraceRow.trace).production_batches
      .map((batch) => [batch.id, batch.trace_scope])).toEqual([[id(962), 'affected']]);
    const allocatedBatch = productionBatchExecutionSchema.parse(z.object({
      execution: z.unknown(),
    }).parse(
      (await query('select public.production_batch_execution($1) execution', [id(962)])).rows[0],
    ).execution);
    expect(allocatedBatch.preparation_traceability_mode).toBe('batch_specific_allocation');
    expect(allocatedBatch.preparation_allocations).toHaveLength(2);
    expect(allocatedBatch.preparation_scope.map((item) => item.trace_scope))
      .toEqual(['affected', 'affected']);

    await database.exec('reset role');
    const firstAllocation = z.object({ id: z.uuid() }).parse(
      (await query(`select id from public.production_batch_preparation_allocations
        where idempotency_key=$1`, [id(951)])).rows[0],
    );
    await expect(query(`update public.production_batch_preparation_allocations
      set quantity=6 where id=$1`, [firstAllocation.id]))
      .rejects.toThrow('immutable');
    await actAs(gateActor);
    await expect(query(
      'select public.record_production_batch_preparation_allocation($1::jsonb)',
      [JSON.stringify({ ...allocationPayloads[0], quantity: 6 })],
    )).rejects.toThrow('different values');
  });

  it('keeps the read RPC invoker-scoped', async () => {
    await actAs(id(50));
    expect((await query('select public.production_batch_execution($1) execution', [id(910)])).rows)
      .toEqual([{ execution: null }]);
    await database.exec('reset role; set role anon');
    await expect(query('select public.production_batch_execution($1)', [id(910)]))
      .rejects.toThrow('permission denied');
  });

  it('keeps the migration independently readable for release review', async () => {
    const migration = await readFile(
      'supabase/migrations/20261001121148_production_batch_execution_foundation.sql',
      'utf8',
    );
    expect(migration).toContain('security invoker');
    expect(migration).toContain(
      "if not public.has_permission('production.mobile') then",
    );
    expect(migration).toContain(
      "if not public.has_permission('settings.manage') then",
    );
    expect(migration).not.toContain('grant insert');
    const equipmentSnapshotMigration = await readFile(
      'supabase/migrations/20261001130349_production_batch_equipment_snapshot.sql',
      'utf8',
    );
    expect(equipmentSnapshotMigration).toContain(
      'language plpgsql security definer set search_path',
    );
    expect(equipmentSnapshotMigration).toContain(
      'revoke all on function public.start_production_batch(jsonb)',
    );
    expect(equipmentSnapshotMigration).toContain(
      "if not public.has_permission('production.mobile') then",
    );
    expect(equipmentSnapshotMigration).not.toContain('grant update on public.production_batches');
    const equipmentSelectionMigration = await readFile(
      'supabase/migrations/20261001133000_production_day_equipment_selection.sql',
      'utf8',
    );
    expect(equipmentSelectionMigration).toContain('is_production_preferred');
    expect(equipmentSelectionMigration).toContain('production_day_equipment_selections');
    expect(equipmentSelectionMigration).toContain('worker_id = auth.uid()');
    expect(equipmentSelectionMigration).toContain('revoke all on function');
  });
});
