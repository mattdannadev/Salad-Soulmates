import { z } from 'zod';

/** No hosted URI or inherited application credential can reach this destructive test runner. */
export default function postgresTarget(environment: Readonly<Record<string, string | undefined>>) {
  z.literal('1').parse(environment.SS_DISPOSABLE_POSTGRES);
  const password = z.string().min(1).parse(environment.SS_TEST_POSTGRES_PASSWORD);
  const port = environment.SS_TEST_POSTGRES_PORT === undefined ? 55432 : z.string()
    .regex(/^[1-9][0-9]{0,4}$/).transform(Number)
    .pipe(z.number().int().min(1).max(65535))
    .parse(environment.SS_TEST_POSTGRES_PORT);
  return {
    host: '127.0.0.1',
    port,
    user: 'postgres',
    password,
    database: 'postgres',
    connectionTimeoutMillis: 3000,
    statement_timeout: 10000,
    application_name: 'salad-refactor-gate',
  };
}
