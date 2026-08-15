import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const SECRET_KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex'); // 32 bytes

export function encrypt(text) {
  const iv = crypto.randomBytes(12); // 12-byte IV for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');

  return {
    iv: iv.toString('hex'),
    content: encrypted,
    tag: authTag,
  };
}

export function decrypt(hash) {
  const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, Buffer.from(hash.iv, 'hex'));

  decipher.setAuthTag(Buffer.from(hash.tag, 'hex'));

  let decrypted = decipher.update(hash.content, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
