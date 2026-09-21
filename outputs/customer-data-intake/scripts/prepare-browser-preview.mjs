import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync, readFileSync, writeFileSync, existsSync,
} from 'node:fs';
import {
  dirname, resolve, relative, isAbsolute,
} from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destinationArgument = process.argv[2];
const baseCommit = process.argv[3];
if (!destinationArgument || !baseCommit || !/^[a-f0-9]{40}$/.test(baseCommit)) {
  throw new Error('Usage: node scripts/prepare-browser-preview.mjs NEW_DIRECTORY FULL_COMMIT_SHA');
}
const destination = resolve(destinationArgument);
const relativeDestination = relative(repository, destination);
if (!relativeDestination.startsWith('..') && !isAbsolute(relativeDestination)) {
  throw new Error('Prepare the test export outside the repository.');
}
if (existsSync(destination)) throw new Error('The export destination must not exist.');
const git = (...args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8' });
git('cat-file', '-e', `${baseCommit}^{commit}`);
const paths = git(
  'ls-tree',
  '-r',
  '--name-only',
  baseCommit,
  '--',
  'src',
  'public',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'next.config.ts',
  'next-env.d.ts',
).trim().split('\n').filter(Boolean);
if (!paths.includes('src/lib/supabase.ts') || !paths.includes('src/proxy.ts')) {
  throw new Error('The selected commit does not contain the expected application.');
}
mkdirSync(destination);
paths.forEach((path) => {
  const target = resolve(destination, path);
  if (!target.startsWith(`${destination}/`)) throw new Error('Unexpected export path.');
  mkdirSync(dirname(target), { recursive: true });
  const contents = execFileSync('git', ['show', `${baseCommit}:${path}`], { cwd: repository });
  writeFileSync(target, contents, { flag: 'wx' });
});

function replaceOnce(path, expected, replacement) {
  const target = resolve(destination, path);
  const original = readFileSync(target, 'utf8');
  if (original.split(expected).length !== 2) {
    throw new Error(`Refusing an ambiguous preview overlay in ${path}.`);
  }
  writeFileSync(target, original.replace(expected, replacement));
}

const fixturePath = 'tests/browser/preview-fixture.ts';
const fixture = git('show', `${baseCommit}:${fixturePath}`);
const fixtureDataPath = 'tests/browser/fixture-data.ts';
const fixtureData = git('show', `${baseCommit}:${fixtureDataPath}`);
mkdirSync(resolve(destination, 'tests/browser'), { recursive: true });
writeFileSync(resolve(destination, fixturePath), fixture);
writeFileSync(resolve(destination, fixtureDataPath), fixtureData);
['src/lib/supabase.ts', 'src/proxy.ts'].forEach((path) => {
  const depth = path === 'src/proxy.ts' ? '..' : '../..';
  const target = resolve(destination, path);
  writeFileSync(
    target,
    `import { previewFixtureFetch } from '${depth}/tests/browser/preview-fixture';\n${
      readFileSync(target, 'utf8')}`,
  );
  replaceOnce(
    path,
    'createServerClient<Database>(url, key, {',
    'createServerClient<Database>(url, key, {\n    global: { fetch: previewFixtureFetch },',
  );
});
replaceOnce(
  'src/lib/supabase.ts',
  'createClient<Database>(url, key, {',
  'createClient<Database>(url, key, {\n    global: { fetch: previewFixtureFetch },',
);
replaceOnce('next.config.ts', "import type { NextConfig } from 'next';", [
  "import type { NextConfig } from 'next';",
  "import { assertPreviewEnvironment, FIXTURE_ORIGIN, FIXTURE_KEY } from './tests/browser/preview-fixture';",
  'assertPreviewEnvironment(process.env);',
].join('\n'));
replaceOnce('next.config.ts', '  poweredByHeader: false,', [
  '  poweredByHeader: false,',
  '  env: {',
  '    NEXT_PUBLIC_SUPABASE_URL: FIXTURE_ORIGIN,',
  '    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: FIXTURE_KEY,',
  '  },',
].join('\n'));
replaceOnce('src/app/layout.tsx', '<body>{children}</body>', [
  '<body>',
  '<aside aria-label="Test environment" style={{ padding: 12, background: "#fff3bf", color: "#372d00" }}>',
  `Browser verification · synthetic data · business-data writes disabled · ${baseCommit.slice(0, 7)}`,
  '</aside>',
  '{children}</body>',
].join('\n'));
writeFileSync(resolve(destination, 'vercel.json'), `${JSON.stringify({
  framework: 'nextjs',
  buildCommand: 'npm run build',
  installCommand: 'npm ci',
  env: { SS_BROWSER_TEST_PREVIEW: '1' },
  build: { env: { SS_BROWSER_TEST_PREVIEW: '1' } },
}, null, 2)}\n`);
writeFileSync(resolve(destination, '.vercelignore'), [
  '.env*', '.git', '.vercel', '.next', 'node_modules', '*.log', '*.tsbuildinfo',
].join('\n'));
writeFileSync(resolve(destination, 'verification-manifest.json'), `${JSON.stringify({
  applicationCommit: baseCommit,
  fixtureSha256: createHash('sha256').update(fixture).digest('hex'),
  fixtureDataSha256: createHash('sha256').update(fixtureData).digest('hex'),
  target: 'preview',
  businessDataWrites: false,
  externalBackend: false,
  overlays: ['src/lib/supabase.ts', 'src/proxy.ts', 'next.config.ts', 'src/app/layout.tsx'],
  excluded: ['environment files', 'credentials', 'documentation', 'database migrations', 'git history'],
  verificationLimit: 'Synthetic Auth/API responses; not real Auth, database, or RLS verification.',
}, null, 2)}\n`);
process.stdout.write(`Prepared isolated browser verification export: ${destination}\n`);
