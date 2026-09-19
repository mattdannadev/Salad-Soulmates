import { expect, it } from 'vitest';
import postgresTarget from './integration/postgres-target';

it('requires explicit disposable-test opt-in before connecting', () => {
  expect(() => postgresTarget({})).toThrow();
  expect(() => postgresTarget({ SS_DISPOSABLE_POSTGRES: '1' })).toThrow();
});
it('ignores inherited hosted database connection settings', () => {
  expect(postgresTarget({
    SS_DISPOSABLE_POSTGRES: '1',
    SS_TEST_POSTGRES_PASSWORD: 'synthetic-test-password',
    PGHOST: 'shared.example.test',
    PGPORT: '5432',
    PGDATABASE: 'shared',
    DATABASE_URL: 'postgresql://shared.example.test/shared',
  })).toMatchObject({
    host: '127.0.0.1', port: 55432, database: 'postgres', user: 'postgres',
  });
});
