// Cloudinary signed-upload signature generation.
//
// Used by /api/admin/badges/upload-signature so the browser can POST a
// file directly to Cloudinary without our server ever proxying the
// bytes. The signature scope is narrow: a fixed folder + an explicit
// timestamp; Cloudinary refuses anything older than ~1h.
//
// Why HMAC by hand instead of the `cloudinary` npm package: the package
// is ~300 kB and pulls in transitive deps we don't need. Cloudinary's
// signature spec is just SHA-1 of sorted params + api_secret.

import { createHash } from 'node:crypto';

export interface SignedUploadParams {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  publicId: string;
  signature: string;
}

const FOLDER = 'nmo-badges';

/**
 * Build a signed upload payload for Cloudinary. The browser POSTs
 * these fields plus the file to https://api.cloudinary.com/v1_1/{cloudName}/image/upload.
 */
export function buildSignedUpload(publicIdHint: string): SignedUploadParams {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('cloudinary_env_missing');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  // Sanitize the hint: lowercase, dash-separated, max 60 chars.
  const safeHint = publicIdHint
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'badge';
  const publicId = `${safeHint}-${timestamp}`;

  // Cloudinary signs alphabetically sorted "key=value" pairs joined by &,
  // then appends the api_secret (no separator), then SHA-1.
  // Params MUST be the same set the client sends to upload.
  const signedParams = [
    `folder=${FOLDER}`,
    `public_id=${publicId}`,
    `timestamp=${timestamp}`,
  ].join('&');
  const signature = createHash('sha1')
    .update(signedParams + apiSecret)
    .digest('hex');

  return {
    cloudName,
    apiKey,
    timestamp,
    folder: FOLDER,
    publicId,
    signature,
  };
}
