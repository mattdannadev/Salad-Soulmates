import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const input = process.argv[2];
const output = process.argv[3] ?? 'data/import/ingredient-review.csv';
if (!input)
  throw new Error(
    'Usage: npm run prepare:ingredients -- <worksheet-export.csv> [review-output.csv]',
  );

function csv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted && c === '"' && text[i + 1] === '"') {
      field += '"';
      i++;
    } else if (c === '"') quoted = !quoted;
    else if (!quoted && c === ',') {
      row.push(field);
      field = '';
    } else if (!quoted && (c === '\n' || c === '\r')) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const rows = csv(readFileSync(resolve(input), 'utf8'));
const headers = rows.shift()?.map((h) => h.trim().toLowerCase()) ?? [];
const required = ['worksheet', 'recipe', 'ingredient', 'quantity', 'unit'];
for (const name of required)
  if (!headers.includes(name)) throw new Error(`Missing required column: ${name}`);
const index = Object.fromEntries(headers.map((h, i) => [h, i]));
const groups = new Map();
for (const row of rows) {
  const source = row[index.ingredient]?.trim();
  if (!source) continue;
  const key = source.toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
  const group = groups.get(key) ?? {
    names: new Set(),
    units: new Set(),
    recipes: new Set(),
    worksheets: new Set(),
    count: 0,
  };
  group.names.add(source);
  group.units.add(row[index.unit]?.trim());
  group.recipes.add(row[index.recipe]?.trim());
  group.worksheets.add(row[index.worksheet]?.trim());
  group.count++;
  groups.set(key, group);
}
const head = [
  'source_names',
  'proposed_name',
  'observed_units',
  'recipes',
  'worksheets',
  'row_count',
  'spanish_name',
  'category',
  'base_unit',
  'ready_to_load',
  'review_notes',
];
const result = [head.map(quote).join(',')];
for (const group of [...groups.values()].sort((a, b) =>
  [...a.names][0].localeCompare([...b.names][0]),
)) {
  const names = [...group.names];
  const units = [...group.units].filter(Boolean);
  const ambiguous = names.length > 1 || units.length !== 1;
  result.push(
    [
      names.join(' | '),
      names[0],
      units.join(' | '),
      [...group.recipes].filter(Boolean).join(' | '),
      [...group.worksheets].filter(Boolean).join(' | '),
      group.count,
      '',
      '',
      units.length === 1 ? units[0] : '',
      'false',
      ambiguous ? 'Review aliases or units' : 'Add Spanish name and category',
    ]
      .map(quote)
      .join(','),
  );
}
writeFileSync(resolve(output), `${result.join('\n')}\n`);
console.log(`Prepared ${groups.size} ingredient candidates for human review: ${resolve(output)}`);
