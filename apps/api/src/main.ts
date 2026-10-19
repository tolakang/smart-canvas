import { buildApp } from './app';
import { createDb } from './db/client';
import { S3Store, s3ConfigFromEnv } from './storage/object-store';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
const { db } = createDb(databaseUrl);
const store = new S3Store(s3ConfigFromEnv(process.env));
await store.ensureBucket();

const app = await buildApp({ db, store, secureCookie: process.env.COOKIE_SECURE !== 'false' });
app.listen({ port, host }).catch((err: unknown) => {
  app.log.error(err);
  process.exit(1);
});
