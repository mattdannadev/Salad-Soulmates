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
    expect(seed).not.toMatch(/20\d{2}-\d{2}-\d{2}/);
  });

  it('contains two coherent records through every implemented workflow boundary', () => {
    expect(callCount('create_purchase_draft')).toBe(2);
    expect(callCount('receive_purchase_delivery')).toBe(2);
    expect(callCount('assign_production_lot')).toBe(2);
    expect(callCount('open_batch_worksheet')).toBe(2);
    expect(callCount('complete_batch_worksheet')).toBe(2);
    expect(callCount('save_shipping_draft')).toBe(2);
    expect(callCount('record_batch_worksheet_usage')).toBe(6);
    expect(seed).toContain("status='Released'");
    expect(seed).toContain('reorder_point,par_level,reorder_quantity');
    expect(seed).toContain("jsonb_build_object('quantity',5,'supplier_barcode','HFORWVSAMPLEP01')");
    expect(seed).toContain("jsonb_build_object('quantity',5,'supplier_barcode','HFORWVSAMPLEP02')");
  });

  it('selects deterministically ordered packages with enough remaining quantity for every worksheet use', () => {
    ([
      ['901', 24], ['902', 8], ['906', 4], ['903', 20], ['904', 5], ['905', 4],
    ] as const).forEach(([usageId, quantity]) => {
      const start = seed.indexOf(`'10000000-0000-4000-8000-000000000${usageId}'`);
      expect(start).toBeGreaterThan(-1);
      const usage = seed.slice(
        start,
        seed.indexOf('));', start) + 3,
      );
      expect(usage).toContain(`availability='Available' and remaining_quantity >= ${quantity}`);
      expect(usage).toContain('order by created_at,id limit 1');
      expect(usage).toContain(`'quantity',${quantity}`);
    });
  });
});
