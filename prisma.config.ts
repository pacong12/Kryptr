import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma 7 CLI configuration. Prisma 7 no longer reads connection URLs from
// the schema file (or auto-loads .env — the dotenv import above is
// load-bearing). Migrations run against DIRECT_URL: the Supabase session-mode
// port 5432. The pooler (transaction mode, port 6543) cannot run DDL and is
// reserved for the runtime PrismaClient, which receives its connection via
// the @prisma/adapter-pg driver adapter in apps/api (see postgres client
// module), never through this file.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: requireDirectUrl(),
  },
});

function requireDirectUrl(): string {
  const url = process.env.DIRECT_URL;
  if (!url) {
    // Fail closed: migration commands without a session-mode URL must not
    // silently fall back to the pooler (DDL over pgbouncer = broken).
    throw new Error(
      'DIRECT_URL is required for Prisma migrations (Supabase session-mode port 5432)',
    );
  }
  return url;
}
