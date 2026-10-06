import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const seed = readFileSync('supabase/seed.sql', 'utf8');
const config = readFileSync('supabase/config.toml', 'utf8');
const packageJson: unknown = JSON.parse(readFileSync('package.json', 'utf8'));

function callCount(functionName: string) {
  return [...seed.matchAll(new RegExp(`select public\\.${functionName}\\(`, 'g'))].length;
}

describe('local sample-data contract', () => {
  it('keeps regeneration explicitly local', () => {
    expect(packageJson).toMatchObject({
      scripts: { 'sample-data:reset': 'supabase db reset --local --sql-paths ./seed.sql' },
    });
    expect(config).toMatch(/\[db\.seed\]\s+enabled = false/);
    expect(seed).not.toContain('supabase.co');
    expect(seed).not.toContain('ddpfmzssgxkvvfkpcvuv');
  });

  it('anchors operational dates once in the facility timezone', () => {
    expect(seed.match(/create temp table sample_dates/g)).toHaveLength(1);
    expect(seed).toContain('(now() at time zone facility.timezone)::date');
    // Imported recipe provenance retains historical dates; operational dates do not.
    const operationalSeed = seed.replace(/\$production_master\$[\s\S]*?\$production_master\$/g, '')
      .replace(/^--.*$/gm, '');
    expect(operationalSeed).not.toMatch(/20\d{2}-\d{2}-\d{2}/);
  });

  it('creates realistic planned orders and inbound purchases without fabricated executions', () => {
    expect(callCount('save_customer_order')).toBe(3);
    expect(seed).toContain('from generate_series(1, 13) order_number');
    expect(callCount('create_purchase_draft')).toBe(1);
    expect(seed).toContain('where demo.order_number <= 5');
    expect(callCount('receive_purchase_delivery')).toBe(0);
    expect(callCount('assign_production_lot')).toBe(0);
    expect(callCount('open_batch_worksheet')).toBe(0);
    expect(callCount('complete_batch_worksheet')).toBe(0);
    expect(callCount('save_shipping_draft')).toBe(2);
    expect(callCount('record_batch_worksheet_usage')).toBe(0);
    expect(seed).toContain("set status='Released'");
    expect(seed).toContain('reorder_point,par_level,reorder_quantity');
  });

  it('derives inventory policy from actual demand and preferred supplier packs', () => {
    expect(seed).toContain('create temp table demo_inventory_snapshot');
    expect(seed).toContain("plan.status = 'Active'");
    expect(seed).toContain('ceil(demand.demand * 0.4 / supplier_pack.quantity)');
    expect(seed).toContain('ceil(demand.demand * 1.2 / supplier_pack.quantity)');
    expect(seed).toContain("snapshot.id, 'OpeningBalance', snapshot.on_hand, snapshot.default_uom");
    expect(seed).toContain('order by item.is_preferred desc, item.id limit 1');
  });
});
