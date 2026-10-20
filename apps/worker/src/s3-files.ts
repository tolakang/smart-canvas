/** FileStore on S3 / MinIO (same bucket and env as the api). */
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { FileStore } from './jobs';

export function s3FileStore(env: NodeJS.ProcessEnv): FileStore {
  const bucket = env.S3_BUCKET ?? 'smart-canvas';
  const client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: env.S3_ACCESS_KEY ?? '', secretAccessKey: env.S3_SECRET_KEY ?? '' },
  });
  return {
    async put(key, bytes, mime) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: mime }));
    },
  };
}
