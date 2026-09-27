import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';

const schemas = {
  Suppliers: ['supplier_name', 'contact_name', 'email', 'phone', 'lead_time_days', 'active'],
  Supplier_Packs: ['supplier_name', 'ingredient_name', 'supplier_sku', 'purchase_uom', 'pack_quantity', 'pack_quantity_uom', 'is_preferred', 'active', 'notes'],
  Customers: ['customer_name', 'contact_name', 'email', 'phone', 'address', 'notes'],
  Customer_Pricing: ['customer_name', 'product_name', 'label', 'packaging_mode', 'unit_name', 'gallons_per_unit', 'unit_price_usd', 'active', 'is_preferred'],
  Packaging_Profiles: ['product_name', 'status', 'bag_size_gallons', 'bags_per_case', 'label_width_inches', 'label_height_inches', 'display_name', 'ingredient_statement'],
  Opening_Inventory: ['ingredient_name', 'quantity', 'uom', 'as_of_date', 'reason_note'],
  Receipts: ['supplier_name', 'ingredient_name', 'received_on', 'supplier_reference', 'quantity', 'uom', 'supplier_lot', 'expiration_date', 'note'],
  Customer_Orders: ['customer_name', 'reference', 'needed_on', 'product_name', 'batch_count'],
};
const masterTabs = ['Suppliers', 'Supplier_Packs', 'Customers', 'Customer_Pricing', 'Packaging_Profiles'];
const transactionalTabs = ['Opening_Inventory', 'Receipts', 'Customer_Orders'];
const date = /^\d{4}-\d{2}-\d{2}$/;
const bool = /^(true|false)$/i;
const nonnegative = (value) => Number.isFinite(Number(value)) && Number(value) >= 0;
const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;

async function forEachInOrder(rows, callback) {
  await rows.reduce((pending, row) => pending.then(() => callback(row)), Promise.resolve());
}

function readTab(dir, name) {
  const path = join(dir, `${name}.csv`);
  if (!existsSync(path)) return [];
  const rows = parse(readFileSync(path, 'utf8'), {
    bom: true, columns: true, skip_empty_lines: true, trim: true,
  });
  const actual = Object.keys(rows[0] ?? {}).sort();
  const expected = [...schemas[name]].sort();
  if (actual.join('|') !== expected.join('|')) throw new Error(`${name}.csv headers do not match the template.`);
  return rows.filter((row) => Object.values(row).some((value) => value !== ''));
}
function issue(issues, tab, row, message) {
  issues.push({ tab, row, message });
}
function validate(tab, rows, issues) {
  const duplicateKeys = new Set();
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const required = schemas[tab].filter((key) => !['contact_name', 'email', 'phone', 'address', 'notes', 'supplier_sku', 'supplier_reference', 'supplier_lot', 'expiration_date', 'ingredient_statement'].includes(key));
    required.forEach((key) => {
      if (!row[key]) issue(issues, tab, rowNumber, `${key} is required.`);
    });
    if (['Suppliers', 'Supplier_Packs', 'Customer_Pricing'].includes(tab)) {
      ['active'].forEach((key) => {
        if (row[key] && !bool.test(row[key])) issue(issues, tab, rowNumber, `${key} must be TRUE or FALSE.`);
      });
    }
    if (['Supplier_Packs', 'Customer_Pricing'].includes(tab) && row.is_preferred && !bool.test(row.is_preferred)) issue(issues, tab, rowNumber, 'is_preferred must be TRUE or FALSE.');
    if (tab === 'Suppliers' && row.lead_time_days && (!Number.isInteger(Number(row.lead_time_days)) || !nonnegative(row.lead_time_days))) issue(issues, tab, rowNumber, 'lead_time_days must be a whole number of 0 or more.');
    if (tab === 'Supplier_Packs') {
      if (!['pail', 'bag', 'case', 'each'].includes(row.purchase_uom)) issue(issues, tab, rowNumber, 'purchase_uom must be pail, bag, case, or each.');
      if (!['lb', 'oz', 'gal', 'each'].includes(row.pack_quantity_uom)) issue(issues, tab, rowNumber, 'pack_quantity_uom must be lb, oz, gal, or each.');
      if (!positive(row.pack_quantity)) issue(issues, tab, rowNumber, 'pack_quantity must be greater than zero.');
    }
    if (tab === 'Customer_Pricing') {
      if (!['product_default', 'custom'].includes(row.packaging_mode)) issue(issues, tab, rowNumber, 'packaging_mode must be product_default or custom.');
      if (!positive(row.gallons_per_unit) || !nonnegative(row.unit_price_usd)) issue(issues, tab, rowNumber, 'gallons_per_unit must be positive and unit_price_usd cannot be negative.');
    }
    if (tab === 'Packaging_Profiles') {
      if (!['Draft', 'Approved'].includes(row.status)) issue(issues, tab, rowNumber, 'status must be Draft or Approved.');
      if (row.status === 'Approved' && !row.ingredient_statement) issue(issues, tab, rowNumber, 'Approved packaging needs an ingredient_statement.');
      ['bag_size_gallons', 'bags_per_case', 'label_width_inches', 'label_height_inches'].forEach((key) => {
        if (!positive(row[key])) issue(issues, tab, rowNumber, `${key} must be greater than zero.`);
      });
    }
    if (['Opening_Inventory', 'Receipts', 'Customer_Orders'].includes(tab)) {
      let key = 'received_on';
      if (tab === 'Customer_Orders') key = 'needed_on';
      if (tab === 'Opening_Inventory') key = 'as_of_date';
      if (!date.test(row[key])) issue(issues, tab, rowNumber, `${key} must use YYYY-MM-DD.`);
    }
    if (tab === 'Opening_Inventory' && (!positive(row.quantity) || !['lb', 'oz', 'gal', 'each'].includes(row.uom) || row.reason_note.length < 3)) issue(issues, tab, rowNumber, 'Use a positive quantity, valid base unit, and a reason_note of at least 3 characters.');
    if (tab === 'Receipts' && (!positive(row.quantity) || !['lb', 'oz', 'gal', 'each'].includes(row.uom) || (row.expiration_date && !date.test(row.expiration_date)))) issue(issues, tab, rowNumber, 'Receipt quantity/unit or expiration_date is invalid.');
    if (tab === 'Customer_Orders' && (!Number.isInteger(Number(row.batch_count)) || !positive(row.batch_count))) issue(issues, tab, rowNumber, 'batch_count must be a positive whole number.');
    let key = '';
    if (tab === 'Suppliers') key = row.supplier_name.toLowerCase();
    if (tab === 'Customers') key = row.customer_name.toLowerCase();
    if (key && duplicateKeys.has(key)) issue(issues, tab, rowNumber, 'Duplicate master name.');
    duplicateKeys.add(key);
  });
}

async function loadIntoSupabase(tabs) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.DATA_IMPORT_ADMIN_EMAIL;
  const password = process.env.DATA_IMPORT_ADMIN_PASSWORD;
  if (!url || !key || !email || !password) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, DATA_IMPORT_ADMIN_EMAIL, and DATA_IMPORT_ADMIN_PASSWORD before using --load.');
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: login, error: loginError } = await db.auth.signInWithPassword({ email, password });
  if (loginError || !login.user) throw new Error(loginError?.message ?? 'Administrator sign-in failed.');
  const fail = (error) => {
    if (error) throw new Error(error.message);
  };
  const { data: ingredients, error: ingredientError } = await db.from('ingredients').select('id,name,default_uom').eq('active', true);
  fail(ingredientError);
  const { data: products, error: productError } = await db.from('products').select('id,name').eq('active', true);
  fail(productError);
  const byName = (rows) => new Map((rows ?? []).map((row) => [row.name.trim().toLocaleLowerCase('en-US'), row]));
  const ingredientByName = byName(ingredients);
  const productByName = byName(products);
  const lookup = (map, name, kind) => {
    const found = map.get(name.trim().toLocaleLowerCase('en-US'));
    if (!found) throw new Error(`${kind} not found or inactive: ${name}`);
    return found;
  };
  await forEachInOrder(tabs.Suppliers, async (row) => {
    const { error } = await db.from('suppliers').insert({
      name: row.supplier_name, contact_name: row.contact_name, email: row.email, phone: row.phone, lead_time_days: row.lead_time_days ? Number(row.lead_time_days) : null, active: row.active.toLowerCase() !== 'false',
    });
    fail(error);
  });
  const { data: suppliers, error: supplierError } = await db.from('suppliers').select('id,name').eq('active', true);
  fail(supplierError);
  const supplierByName = byName(suppliers);
  await forEachInOrder(tabs.Supplier_Packs, async (row) => {
    const { error } = await db.from('supplier_items').insert({
      supplier_id: lookup(supplierByName, row.supplier_name, 'Supplier').id, ingredient_id: lookup(ingredientByName, row.ingredient_name, 'Ingredient').id, supplier_sku: row.supplier_sku, purchase_uom: row.purchase_uom, pack_quantity: Number(row.pack_quantity), pack_quantity_uom: row.pack_quantity_uom, is_preferred: row.is_preferred.toLowerCase() === 'true', active: row.active.toLowerCase() !== 'false', notes: row.notes,
    });
    fail(error);
  });
  await forEachInOrder(tabs.Customers, async (row) => {
    const { error } = await db.rpc('save_customer_master', {
      payload: {
        id: randomUUID(),
        revision: 0,
        name: row.customer_name,
        contact_name: row.contact_name,
        email: row.email,
        phone: row.phone,
        address: row.address,
        notes: row.notes,
      },
    });
    fail(error);
  });
  const { data: customers, error: customerError } = await db.from('customers').select('id,name,revision');
  fail(customerError);
  const customerByName = byName(customers);
  await forEachInOrder(tabs.Customer_Pricing, async (row) => {
    const customer = lookup(customerByName, row.customer_name, 'Customer');
    const { error } = await db.rpc('save_customer_product_option', {
      payload: {
        id: randomUUID(), revision: 0, customer_name: customer.name, product_id: lookup(productByName, row.product_name, 'Product').id, label: row.label, packaging_mode: row.packaging_mode, unit_name: row.unit_name, gallons_per_unit: Number(row.gallons_per_unit), unit_price: Number(row.unit_price_usd), currency: 'USD', active: row.active.toLowerCase() !== 'false', is_preferred: row.is_preferred.toLowerCase() === 'true',
      },
    });
    fail(error);
  });
  await forEachInOrder(tabs.Packaging_Profiles, async (row) => {
    const { error } = await db.rpc('save_packaging_profile', {
      payload: {
        id: randomUUID(), expected_version: 0, product_id: lookup(productByName, row.product_name, 'Product').id, status: row.status, bag_size_gallons: Number(row.bag_size_gallons), bags_per_case: Number(row.bags_per_case), label_width_inches: Number(row.label_width_inches), label_height_inches: Number(row.label_height_inches), display_name: row.display_name, ingredient_statement: row.ingredient_statement,
      },
    });
    fail(error);
  });
  await forEachInOrder(tabs.Opening_Inventory, async (row) => {
    const ingredient = lookup(ingredientByName, row.ingredient_name, 'Ingredient');
    if (ingredient.default_uom !== row.uom) throw new Error(`Opening inventory unit does not match ${row.ingredient_name}'s base unit.`);
    const { error } = await db.from('inventory_events').insert({
      ingredient_id: ingredient.id, event_type: 'OpeningBalance', quantity_delta: Number(row.quantity), uom: row.uom, reason_note: row.reason_note, request_id: randomUUID(), created_at: `${row.as_of_date}T12:00:00Z`,
    });
    fail(error);
  });
  await forEachInOrder(tabs.Receipts, async (row) => {
    const ingredient = lookup(ingredientByName, row.ingredient_name, 'Ingredient');
    const { error } = await db.rpc('post_inventory_receipt', {
      payload: {
        supplier_id: lookup(supplierByName, row.supplier_name, 'Supplier').id, ingredient_id: ingredient.id, received_on: row.received_on, supplier_reference: row.supplier_reference, quantity: Number(row.quantity), uom: row.uom, supplier_lot: row.supplier_lot, expiration_date: row.expiration_date || '', note: row.note, request_id: randomUUID(),
      },
    });
    fail(error);
  });
  const groupedOrders = new Map();
  tabs.Customer_Orders.forEach((row) => {
    const groupKey = `${row.customer_name}|${row.reference}|${row.needed_on}`;
    const group = groupedOrders.get(groupKey) ?? {
      id: randomUUID(),
      customer_name: row.customer_name,
      reference: row.reference,
      needed_on: row.needed_on,
      products: [],
    };
    group.products.push({
      product_id: lookup(productByName, row.product_name, 'Product').id,
      customer_product_option_id: null,
      batch_count: Number(row.batch_count),
    });
    groupedOrders.set(groupKey, group);
  });
  await forEachInOrder([...groupedOrders.values()], async (order) => {
    const { error } = await db.rpc('save_customer_order', { payload: order });
    fail(error);
  });
  await db.auth.signOut();
}

const input = process.argv[2];
const load = process.argv.includes('--load');
const output = process.argv.find((argument, index) => index > 2 && argument !== '--load') ?? 'data/import/customer-load-plan.json';
if (!input) throw new Error('Usage: node scripts/prepare-customer-data-load.mjs <csv-folder> [load-plan.json] [--load]');
const source = resolve(input);
const tabs = Object.fromEntries(Object.keys(schemas).map((name) => [name, readTab(source, name)]));
const issues = [];
Object.entries(tabs).forEach(([tab, rows]) => validate(tab, rows, issues));
const plan = {
  generated_at: new Date().toISOString(),
  source,
  master: Object.fromEntries(masterTabs.map((tab) => [tab, tabs[tab]])),
  transactional: Object.fromEntries(transactionalTabs.map((tab) => [tab, tabs[tab]])),
  counts: Object.fromEntries(Object.entries(tabs).map(([tab, rows]) => [tab, rows.length])),
  issues,
};
writeFileSync(resolve(output), `${JSON.stringify(plan, null, 2)}\n`);
if (issues.length) {
  console.error(`Validation failed with ${issues.length} issue(s). See ${resolve(output)}.`);
  process.exitCode = 1;
} else if (load) {
  await loadIntoSupabase(tabs);
  process.stdout.write(`Loaded validated customer data: ${resolve(output)}\n`);
} else {
  process.stdout.write(`Prepared validated load plan: ${resolve(output)}\n`);
}
