import assert from 'node:assert/strict';
import { test } from 'vitest';
import getSafeRedirectPath from '../src/lib/safe-redirect-path';

const validCases: readonly { name: string; input: string; expected: string }[] = [
  { name: 'root', input: '/', expected: '/' },
  { name: 'app home', input: '/app', expected: '/app' },
  { name: 'ingredient route', input: '/app/ingredients/123', expected: '/app/ingredients/123' },
  { name: 'query', input: '/app?status=active', expected: '/app?status=active' },
  { name: 'fragment', input: '/app#recipes', expected: '/app#recipes' },
  { name: 'query and fragment', input: '/app?q=a%20b#details', expected: '/app?q=a%20b#details' },
  { name: 'trailing query delimiter', input: '/app?', expected: '/app?' },
  { name: 'trailing fragment delimiter', input: '/app#', expected: '/app#' },
  { name: 'dot segment', input: '/app/../login', expected: '/login' },
  { name: 'encoded dot segment', input: '/%2e/app', expected: '/app' },
  {
    name: 'path slash inside query',
    input: '/app?next=%2Forders',
    expected: '/app?next=%2Forders',
  },
  {
    name: 'external text in query',
    input: '/app?q=https://example.invalid',
    expected: '/app?q=https://example.invalid',
  },
  { name: 'encoded path separator', input: '/%2fexample.invalid', expected: '/%2fexample.invalid' },
  { name: 'encoded backslash', input: '/%5cexample.invalid', expected: '/%5cexample.invalid' },
  { name: 'double encoding', input: '/%252fexample.invalid', expected: '/%252fexample.invalid' },
  { name: 'Unicode path', input: '/app/receta/ají', expected: '/app/receta/aj%C3%AD' },
];

validCases.forEach(({ name, input, expected }) => {
  test(`preserves URL behavior: ${name}`, () => {
    assert.equal(getSafeRedirectPath(input), expected);
    assert.equal(
      new URL(getSafeRedirectPath(input), 'https://app.invalid').origin,
      'https://app.invalid',
    );
  });
});

const rejectedCases: readonly { name: string; input: unknown }[] = [
  { name: 'missing', input: undefined },
  { name: 'null', input: null },
  { name: 'empty string', input: '' },
  { name: 'number', input: 0 },
  { name: 'boolean', input: false },
  { name: 'object', input: {} },
  { name: 'array', input: ['/app'] },
  { name: 'symbol', input: Symbol('not a URL') },
  { name: 'relative path', input: 'app' },
  { name: 'absolute URL', input: 'https://example.invalid' },
  { name: 'scheme-only input', input: ['javascript', 'alert(1)'].join(':') },
  { name: 'protocol-relative URL', input: '//example.invalid' },
  { name: 'triple-slash URL', input: '///example.invalid' },
  { name: 'slash-backslash escape', input: '/\\example.invalid' },
  { name: 'backslash-slash escape', input: '\\/example.invalid' },
  { name: 'normalized double slash', input: '/.//example.invalid' },
  { name: 'encoded-dot double slash', input: '/%2e//example.invalid' },
  { name: 'parent-segment double slash', input: '/app/..//example.invalid' },
  { name: 'normalized backslash escape', input: '/.\\/example.invalid' },
  { name: 'invalid normalized host', input: '/\\[' },
  { name: 'leading whitespace', input: ' /app' },
];

rejectedCases.forEach(({ name, input }) => {
  test(`uses safe fallback: ${name}`, () => {
    assert.equal(getSafeRedirectPath(input), '/app');
  });
});

test('rejects C0 controls and DEL rather than relying on parser stripping', () => {
  const characterCodes = [...Array.from({ length: 32 }, (_, index) => index), 127];
  characterCodes.forEach((characterCode) => {
    const input = `/app${String.fromCharCode(characterCode)}?next=orders`;
    assert.equal(getSafeRedirectPath(input), '/app');
  });
});

test('does not coerce an object supplied at a trust boundary', () => {
  const input = {
    toString() {
      throw new Error('Object coercion must not execute.');
    },
  };
  assert.equal(getSafeRedirectPath(input), '/app');
});

test('accepts the documented 2,048-character input boundary', () => {
  const input = `/${'a'.repeat(2047)}`;
  assert.equal(getSafeRedirectPath(input), input);
});

test('rejects input beyond the 2,048-character boundary', () => {
  assert.equal(getSafeRedirectPath(`/${'a'.repeat(2048)}`), '/app');
});

test('also limits URL-encoded output growth', () => {
  assert.equal(getSafeRedirectPath(`/${'é'.repeat(1000)}`), '/app');
});

test('keeps adversarial path combinations on either caller origin', () => {
  const fragments = [
    '/',
    '\\',
    '.',
    '..',
    '%2e',
    '%2f',
    '%5c',
    '%252f',
    '?',
    '#',
    '@',
    ':',
    'example.invalid',
    '\t',
    '\n',
  ];
  const origins = ['https://app.invalid', 'http://localhost:3000'];
  fragments.forEach((left) => {
    fragments.forEach((right) => {
      const input = `/${left}${right}example.invalid/path?q=a#b`;
      const result = getSafeRedirectPath(input);
      assert.equal(result.startsWith('/'), true);
      assert.equal(result.startsWith('//'), false);
      origins.forEach((origin) => {
        assert.equal(new URL(result, origin).origin, origin, JSON.stringify(input));
      });
    });
  });
});
