import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { logger } from './logger';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.AWS_ENDPOINT_URL,
  forcePathStyle: true, // required for LocalStack
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },
});

const BUCKET = process.env.AWS_S3_BUCKET || 'drone-dispatch-uploads';
const S3_PUBLIC_URL = (process.env.S3_PUBLIC_URL || 'http://localhost:4566').replace(/\/$/, '');
const PRESIGNED_URL_EXPIRES = parseInt(process.env.PRESIGNED_URL_EXPIRES || '300', 10); // 5 minutes

export interface PresignedUploadResult {
  uploadUrl: string; // pre-signed PUT URL — client uploads directly to S3
  imageUrl: string; // final public URL — pass this to POST /api/medications
  key: string;
  expiresIn: number;
}

/**
 * Generates a pre-signed PUT URL so the client uploads directly to S3.
 * The API never touches the image bytes — the client PUTs to uploadUrl,
 * then passes imageUrl to POST /api/medications.
 *
 * Orphan prevention: objects are stored under a prefix that has an S3
 * lifecycle policy deleting unconfirmed uploads after 24 hours.
 * When a medication is successfully created, the key is tagged `confirmed=true`
 * which exempts it from deletion.
 */
export async function generatePresignedUploadUrl(
  extension: string,
  mimeType: string
): Promise<PresignedUploadResult> {
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  const key = `medications/pending/${randomUUID()}${ext}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: mimeType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: PRESIGNED_URL_EXPIRES,
  });

  // Path-style URL: http://localhost:4566/drone-dispatch-uploads/medications/pending/uuid.jpg
  const imageUrl = `${S3_PUBLIC_URL}/${BUCKET}/${key}`;

  logger.info(`Generated pre-signed upload URL for key: ${key}`);

  return { uploadUrl, imageUrl, key, expiresIn: PRESIGNED_URL_EXPIRES };
}
