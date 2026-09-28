/**
 * POST /api/verifikasi/foto-bukti/presign — presigned URL untuk upload
 * foto bukti LANGSUNG ke Supabase (tidak lewat Vercel).
 *
 * Kenapa perlu: limit payload Vercel hanya 4,5 MB, sedangkan foto di
 * lapangan bisa 5 MB (batas lama aplikasi). Kalau foto dipaksakan lewat
 * request ke Vercel, yang gagal adalah request-nya — dan petugas
 * kehilangan catatannya. Dengan presigned URL, file traveling langsung
 * ke Supabase dan Vercel cuma jadi pengantar URL.
 *
 * Cara pakai dari frontend:
 *   1. POST /api/verifikasi/foto-bukti/presign  -> { upload_url, path }
 *   2. PUT upload_url dengan body = file asli (header: Content-Type)
 *   3. POST /api/verifikasi/sesi/{id}/items dengan { foto_bukti_path: path }
 */
import { randomBytes } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { requireCapability } from '../../../src/server/http-guards';
import { handler, HttpError, readBody, requireString, requireAuth, type Ctx } from '../../../src/server/http';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — sama dengan batas lama
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

let cachedClient: S3Client | undefined;

function s3(): S3Client {
  if (cachedClient) return cachedClient;
  const endpoint = process.env.AWS_ENDPOINT;
  const key = process.env.AWS_ACCESS_KEY_ID;
  const secret = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_DEFAULT_REGION;
  if (!endpoint || !key || !secret || !region) {
    throw new HttpError(503, 'Storage belum dikonfigurasi (env AWS_* belum lengkap).');
  }
  cachedClient = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId: key, secretAccessKey: secret },
    forcePathStyle: true,
  });
  return cachedClient;
}

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
  const auth = await requireAuth(ctx);
  requireCapability(auth.role, 'input_verifikasi');

  const body = readBody(ctx);
  const mime = requireString(body, 'content_type', { max: 100 }).toLowerCase();
  const ext = EXT_BY_MIME[mime];
  if (!ext) {
    throw new HttpError(422, 'Tipe file harus JPEG, PNG, atau WebP.', { field: 'content_type' });
  }

  const size = Number(body.size ?? 0);
  if (!Number.isFinite(size) || size <= 0) {
    throw new HttpError(422, 'size wajib diisi (byte).', { field: 'size' });
  }
  if (size > MAX_BYTES) {
    throw new HttpError(422, 'Ukuran file maksimal 5MB.', { field: 'size' });
  }

  const bucket = process.env.AWS_BUCKET;
  if (!bucket) throw new HttpError(503, 'AWS_BUCKET belum di-set.');

  // Path: barcode-evidence/YYYY-MM/<32 hex>.jpg — sama seperti Laravel
  // aslinya, dan hex-nya cukup panjang untuk tidak bisa ditebak.
  const now = new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const path = `barcode-evidence/${ym}/${randomBytes(16).toString('hex')}.${ext}`;

  // URL berlaku 5 menit — cukup untuk upload satu foto dari HP.
  const uploadUrl = await getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: bucket, Key: path, ContentType: mime }),
    { expiresIn: 300 },
  );

  return {
    upload_url: uploadUrl,
    path,
    method: 'PUT',
    headers: { 'Content-Type': mime },
    expires_in: 300,
    max_bytes: MAX_BYTES,
  };
});
