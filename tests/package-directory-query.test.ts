import { expect, it } from 'vitest';
import {
  hasPackageDirectoryCriteria, packageDirectoryHref, parsePackageDirectoryQuery,
} from '@/app/receiving/packages/directory-query';

const ingredient = '00000000-0000-4000-8000-000000000100';

it('accepts independent valid package criteria and restores them in the directory URL', () => {
  const query = parsePackageDirectoryQuery({
    q: '  LOT-1 ', ingredient, status: 'Hold', expiry: 'soon', balance: 'partial', sort: 'expiry',
  });
  expect(query).toMatchObject({
    q: 'LOT-1', ingredient, status: 'Hold', expiry: 'soon', balance: 'partial', sort: 'expiry',
  });
  expect(hasPackageDirectoryCriteria(query)).toBe(true);
  expect(packageDirectoryHref(query)).toBe(
    `/receiving/packages?q=LOT-1&ingredient=${ingredient}&status=Hold&expiry=soon&balance=partial&sort=expiry`,
  );
});

it('drops malformed and repeated criteria without suppressing valid filters', () => {
  const query = parsePackageDirectoryQuery({
    q: ['one', 'two'], ingredient: 'bad', status: 'Hold', expiry: 'invalid', balance: 'empty', sort: 'invalid',
  });
  expect(query).toMatchObject({
    q: '', status: 'Hold', balance: 'empty', sort: 'newest',
  });
  expect(query.ingredient).toBeUndefined();
  expect(query.expiry).toBeUndefined();
});
