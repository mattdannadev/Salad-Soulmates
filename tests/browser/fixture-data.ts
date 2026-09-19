/** Synthetic records only. These quantities are UI examples, never production formulations. */
export const fixtureId = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
export const ADMIN_PERMISSIONS = [
  'dashboard.read', 'master_data.read', 'master_data.write', 'products.read', 'products.write',
  'orders.read', 'orders.write', 'planning.read', 'planning.write', 'inventory.read',
  'inventory.adjust', 'inventory.receive', 'workforce.read', 'workforce.manage',
  'production.mobile', 'feedback.manage', 'access.manage', 'settings.manage', 'audit.read',
];
export const fixtureRecords: Readonly<Record<string, readonly Record<string, unknown>[]>> = {
  permissions: ADMIN_PERMISSIONS.map((code) => ({
    code, area: code.split('.')[0], label: code, description: 'Synthetic permission definition',
  })),
  access_profiles: [{
    id: fixtureId(20),
    name: 'Test administrator',
    description: 'Synthetic administrator permissions',
    base_role: 'admin',
    is_system: true,
    active: true,
  }],
  reference_lists: [{
    organization_id: fixtureId(10),
    code: 'ingredient_category',
    area: 'Ingredients',
    name_en: 'Ingredient type',
    name_es: 'Tipo de ingrediente',
    allow_custom_values: true,
  }],
  reference_options: [{
    id: fixtureId(500),
    list_code: 'ingredient_category',
    code: 'Dry',
    label_en: 'Dry',
    label_es: 'Seco',
    sort_order: 1,
    active: true,
  },
  {
    id: fixtureId(501),
    list_code: 'ingredient_category',
    code: 'Liquid',
    label_en: 'Liquid',
    label_es: 'Líquido',
    sort_order: 2,
    active: true,
  }],
  recipe_qc_rules: [{
    id: fixtureId(502),
    recipe_version_id: fixtureId(401),
    name: 'Synthetic check example',
    min_value: 0,
    max_value: 10,
    uom: 'test units',
    instructions: 'UI example only. Not a production specification.',
    sequence: 1,
  }],
  ingredients: [
    {
      id: fixtureId(100),
      name: 'Preview garlic powder',
      category: 'Dry',
      default_uom: 'lb',
      active: true,
      description: 'Synthetic verification ingredient',
      storage_notes: '',
    },
    {
      id: fixtureId(101),
      name: 'Preview lemon juice',
      category: 'Liquid',
      default_uom: 'gal',
      active: true,
      description: 'Synthetic verification ingredient',
      storage_notes: '',
    },
  ],
  suppliers: [{
    id: fixtureId(200),
    name: 'Preview supplier',
    contact_name: '',
    email: '',
    phone: '',
    lead_time_days: 2,
    active: true,
  }],
  products: [{
    id: fixtureId(300),
    name: 'Preview Italian dressing',
    product_code: 'TEST-ITALIAN',
    standard_batch_gallons: 40,
    bag_size_gallons: 2,
    bags_per_case: 2,
    approved_ingredient_statement: null,
    active: true,
  }],
  recipes: [{
    id: fixtureId(400),
    product_id: fixtureId(300),
    name: 'Preview Italian recipe',
    active_version_id: fixtureId(401),
  }],
  recipe_versions: [
    {
      id: fixtureId(401),
      recipe_id: fixtureId(400),
      version_number: 1,
      status: 'Released',
      target_yield_gallons: 40,
      released_at: '2026-09-19T12:00:00Z',
    },
    {
      id: fixtureId(402),
      recipe_id: fixtureId(400),
      version_number: 2,
      status: 'Draft',
      target_yield_gallons: 40,
      released_at: null,
    },
  ],
  recipe_sections: [{
    id: fixtureId(410),
    recipe_version_id: fixtureId(401),
    name: 'Preparation example',
    sequence: 1,
  }],
  recipe_lines: [
    {
      id: fixtureId(420),
      recipe_version_id: fixtureId(401),
      recipe_section_id: fixtureId(410),
      ingredient_id: fixtureId(100),
      sequence: 1,
      display_measurement: '1 lb',
      normalized_quantity: 1,
      normalized_uom: 'lb',
      operator_note: 'Synthetic training example only.',
    },
    {
      id: fixtureId(421),
      recipe_version_id: fixtureId(401),
      recipe_section_id: fixtureId(410),
      ingredient_id: fixtureId(101),
      sequence: 2,
      display_measurement: '2 gal',
      normalized_quantity: 2,
      normalized_uom: 'gal',
      operator_note: null,
    },
  ],
};

/** Minimal equality filters used by the synthetic PostgREST endpoints. */
export function selectFixtureRecords(table: string, url: URL) {
  return (fixtureRecords[table] ?? []).filter((record) => (
    [...url.searchParams.entries()].every(([key, value]) => (
      !value.startsWith('eq.') || String(record[key]) === value.slice(3)
    ))
  ));
}
