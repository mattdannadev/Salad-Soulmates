import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

const REQUIRED_COLUMNS = ['worksheet', 'recipe', 'ingredient', 'quantity', 'unit'];
const REVIEW_COLUMNS = [
  'source_names', 'proposed_name', 'observed_units', 'recipes', 'worksheets',
  'row_count', 'spanish_name', 'category', 'base_unit', 'ready_to_load', 'review_notes',
];

function quote(value) {
  const text = String(value ?? '');
  const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export default function prepareIngredientReview(source) {
  if (typeof source !== 'string') throw new TypeError('CSV input must be text.');
  const records = parse(source, { bom: true, skip_empty_lines: true, columns: false });
  const headers = records.shift()?.map((value) => value.trim().toLowerCase()) ?? [];
  if (new Set(headers).size !== headers.length) throw new Error('Duplicate CSV column names.');
  REQUIRED_COLUMNS.forEach((name) => {
    if (!headers.includes(name)) throw new Error(`Missing required column: ${name}`);
  });
  const index = Object.fromEntries(headers.map((name, position) => [name, position]));
  const groups = new Map();
  records.forEach((row) => {
    const name = row[index.ingredient]?.trim();
    if (!name) throw new Error('Ingredient name is required on every input row.');
    const key = name.toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
    const group = groups.get(key) ?? {
      names: new Set(), units: new Set(), recipes: new Set(), worksheets: new Set(), count: 0,
    };
    group.names.add(name);
    group.units.add(row[index.unit]?.trim());
    group.recipes.add(row[index.recipe]?.trim());
    group.worksheets.add(row[index.worksheet]?.trim());
    group.count += 1;
    groups.set(key, group);
  });
  const result = [REVIEW_COLUMNS.map(quote).join(',')];
  [...groups.values()]
    .sort((left, right) => [...left.names][0].localeCompare([...right.names][0]))
    .forEach((group) => {
      const names = [...group.names];
      const units = [...group.units].filter(Boolean);
      const ambiguous = names.length > 1 || units.length !== 1;
      result.push([
        names.join(' | '), names[0], units.join(' | '),
        [...group.recipes].filter(Boolean).join(' | '),
        [...group.worksheets].filter(Boolean).join(' | '), group.count,
        '', '', units.length === 1 ? units[0] : '', 'false',
        ambiguous ? 'Review aliases or units' : 'Add Spanish name and category',
      ].map(quote).join(','));
    });
  return `${result.join('\n')}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = process.argv[2];
  const output = process.argv[3] ?? 'data/import/ingredient-review.csv';
  if (!input) {
    throw new Error('Usage: npm run prepare:ingredients -- <worksheet-export.csv> [review-output.csv]');
  }
  if (resolve(input) === resolve(output)) throw new Error('Review output must not overwrite the source.');
  writeFileSync(resolve(output), prepareIngredientReview(readFileSync(resolve(input), 'utf8')));
  process.stdout.write(`Prepared ingredient candidates for human review: ${resolve(output)}\n`);
}
