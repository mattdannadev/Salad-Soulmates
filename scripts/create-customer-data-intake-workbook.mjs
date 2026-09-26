import fs from 'node:fs/promises';
import process from 'node:process';

// The authoring runtime supplies this optional workbook dependency.
const artifactModule = process.env.ARTIFACT_TOOL_MODULE ?? '@oai/artifact-tool';
const { SpreadsheetFile, Workbook } = await import(artifactModule);

const outputDir = process.argv[2] ?? 'outputs/customer-data-intake';
const outputPath = `${outputDir}/Salad_Soulmates_Customer_Data_Intake.xlsx`;
const workbook = Workbook.create();
const navy = '#1F4E78';
const teal = '#0F766E';
const pale = '#EAF4F4';
const font = { name: 'Aptos', size: 10 };

function addSheet(name, headers, note, widths = []) {
  const sheet = workbook.worksheets.add(name);
  sheet.showGridLines = false;
  sheet.getRange('A1').values = [[name.replaceAll('_', ' ')]];
  sheet.getRange(`A1:${String.fromCharCode(64 + Math.min(headers.length, 26))}1`).merge();
  sheet.getRange('A1').format = {
    fill: navy,
    font: {
      name: 'Aptos Display', size: 16, bold: true, color: '#FFFFFF',
    },
    horizontalAlignment: 'left',
    verticalAlignment: 'center',
  };
  sheet.getRange('A1').format.rowHeight = 28;
  sheet.getRange('A3').values = [[note]];
  sheet.getRange(`A3:${String.fromCharCode(64 + Math.min(headers.length, 26))}3`).merge();
  sheet.getRange('A3').format = {
    fill: pale, font: { ...font, italic: true, color: '#244A5A' }, wrapText: true, verticalAlignment: 'center',
  };
  sheet.getRange('A3').format.rowHeight = 36;
  sheet.getRangeByIndexes(4, 0, 1, headers.length).values = [headers];
  const headerRange = sheet.getRangeByIndexes(4, 0, 1, headers.length);
  headerRange.format = {
    fill: teal, font: { ...font, bold: true, color: '#FFFFFF' }, wrapText: true, verticalAlignment: 'center', borders: { preset: 'all', style: 'thin', color: '#B7D2D8' },
  };
  headerRange.format.rowHeight = 34;
  const entry = sheet.getRangeByIndexes(5, 0, 75, headers.length);
  entry.format = {
    font, fill: '#FFFFFF', borders: { preset: 'all', style: 'thin', color: '#D9E2F3' }, verticalAlignment: 'center',
  };
  entry.format.wrapText = true;
  headers.forEach((_, index) => {
    sheet.getRangeByIndexes(0, index, 80, 1).format.columnWidth = widths[index] ?? 18;
  });
  sheet.freezePanes.freezeRows(5);
  return sheet;
}

const readme = workbook.worksheets.add('Read Me');
readme.showGridLines = false;
readme.mergeCells('A1:H1');
readme.getRange('A1').values = [['Salad Soulmates — Customer Data Intake']];
readme.getRange('A1').format = {
  fill: navy,
  font: {
    name: 'Aptos Display', size: 18, bold: true, color: '#FFFFFF',
  },
  verticalAlignment: 'center',
};
readme.getRange('A1').format.rowHeight = 32;
readme.getRange('A3:H3').merge();
readme.getRange('A3').values = [['Complete the tabs that apply to your business. Do not change headers, add columns, or enter products, ingredients, or recipes — those are already in the system.']];
readme.getRange('A3').format = {
  fill: pale, font: { ...font, bold: true, color: '#244A5A' }, wrapText: true, verticalAlignment: 'center',
};
readme.getRange('A3').format.rowHeight = 42;
readme.getRange('A5:B12').values = [
  ['Step', 'What to do'],
  ['1. Complete master data', 'Fill Suppliers, Supplier Packs, Customers, Customer Pricing, and Packaging Profiles as applicable.'],
  ['2. Complete opening / historical data', 'Fill Opening Inventory, Receipts, and Customer Orders only for records that should exist in the new system.'],
  ['3. Keep names exact', 'Ingredient and product names must match the existing system exactly.'],
  ['4. Dates', 'Use YYYY-MM-DD (for example, 2026-09-21).'],
  ['5. Export', 'Save each completed tab as a separate CSV using the tab name, then return the CSV files together.'],
  ['6. Review', 'Blank tabs are fine. Do not use formulas, merged cells, or duplicate rows.'],
  ['Important', 'The loader validates and stages data before any production write. Production plans, lots, shipping drafts, and system users are created by the app and are not customer-imported.'],
];
readme.getRange('A5:B12').format = {
  font, borders: { preset: 'all', style: 'thin', color: '#D9E2F3' }, wrapText: true, verticalAlignment: 'center',
};
readme.getRange('A5:B5').format = { fill: teal, font: { ...font, bold: true, color: '#FFFFFF' } };
readme.getRange('A5:A12').format.columnWidth = 18;
readme.getRange('B5:B12').format.columnWidth = 95;
readme.getRange('A6:B12').format.rowHeight = 32;

addSheet('Suppliers', ['supplier_name', 'contact_name', 'email', 'phone', 'lead_time_days', 'active'], 'One row per supplier. Active must be TRUE or FALSE.', [28, 24, 32, 18, 16, 12]);
addSheet('Supplier_Packs', ['supplier_name', 'ingredient_name', 'supplier_sku', 'purchase_uom', 'pack_quantity', 'pack_quantity_uom', 'is_preferred', 'active', 'notes'], 'Use exact existing ingredient names. purchase_uom: pail, bag, case, or each. pack quantity unit: lb, oz, gal, or each.', [28, 30, 18, 16, 16, 20, 15, 12, 36]);
addSheet('Customers', ['customer_name', 'contact_name', 'email', 'phone', 'address', 'notes'], 'One row per customer.', [28, 24, 32, 18, 45, 45]);
addSheet('Customer_Pricing', ['customer_name', 'product_name', 'label', 'packaging_mode', 'unit_name', 'gallons_per_unit', 'unit_price_usd', 'active', 'is_preferred'], 'Use exact existing customer and product names. packaging_mode: product_default or custom.', [28, 28, 26, 20, 18, 20, 18, 12, 15]);
addSheet('Packaging_Profiles', ['product_name', 'status', 'bag_size_gallons', 'bags_per_case', 'label_width_inches', 'label_height_inches', 'display_name', 'ingredient_statement'], 'Use exact existing product names. status: Draft or Approved. Approved entries require an ingredient statement.', [28, 14, 20, 16, 20, 20, 30, 60]);
addSheet('Opening_Inventory', ['ingredient_name', 'quantity', 'uom', 'as_of_date', 'reason_note'], 'One row per ingredient opening balance. Unit must match the existing ingredient base unit.', [30, 16, 12, 16, 52]);
addSheet('Receipts', ['supplier_name', 'ingredient_name', 'received_on', 'supplier_reference', 'quantity', 'uom', 'supplier_lot', 'expiration_date', 'note'], 'One row per received ingredient line. Use this only for receipts that need historical traceability.', [28, 30, 16, 22, 16, 12, 20, 18, 45]);
addSheet('Customer_Orders', ['customer_name', 'reference', 'needed_on', 'product_name', 'batch_count'], 'One row per product on an order. Repeat customer, reference, and needed_on for multi-product orders. Batch count is in 40-gallon batches.', [28, 22, 16, 28, 16]);

['Suppliers', 'Supplier_Packs', 'Customers', 'Customer_Pricing', 'Packaging_Profiles', 'Opening_Inventory', 'Receipts', 'Customer_Orders'].forEach((sheetName) => {
  const sheet = workbook.worksheets.getItem(sheetName);
  sheet.tabColor = teal;
});
workbook.recalculate();
await fs.mkdir(outputDir, { recursive: true });
const preview = await workbook.render({
  sheetName: 'Read Me', range: 'A1:H12', scale: 1.5, format: 'png',
});
await fs.writeFile(`${outputDir}/readme-preview.png`, new Uint8Array(await preview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
process.stdout.write(`${outputPath}\n`);
