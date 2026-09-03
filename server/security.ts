import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from 'node:crypto';

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const PASSWORD_BYTES = 64;

function scryptPassword(
  password: string,
  salt: Buffer,
  length: number,
  options: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, length, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export type EncryptedPayload = {
  version: 1;
  iv: string;
  authTag: string;
  ciphertext: string;
};

export type CryptoKeys = {
  encryption: Buffer;
  index: Buffer;
};

export function deriveCryptoKeys(masterKey: Buffer): CryptoKeys {
  const salt = Buffer.from('activity-registration-v1', 'utf8');
  return {
    encryption: Buffer.from(hkdfSync('sha256', masterKey, salt, Buffer.from('aes-256-gcm'), 32)),
    index: Buffer.from(hkdfSync('sha256', masterKey, salt, Buffer.from('lookup-hmac'), 32)),
  };
}

export function encryptJson(value: unknown, key: Buffer, associatedId: string): EncryptedPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(associatedId, 'utf8'));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return {
    version: 1,
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

export function decryptJson<T>(payload: EncryptedPayload, key: Buffer, associatedId: string): T {
  if (payload.version !== 1) throw new Error('不支持的数据加密版本');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
  decipher.setAAD(Buffer.from(associatedId, 'utf8'));
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString('utf8')) as T;
}

export function lookupHash(value: string, key: Buffer): string {
  return createHmac('sha256', key).update(value, 'utf8').digest('base64url');
}

export function createRegistrationId(): string {
  return `REG-${randomBytes(5).toString('hex').toUpperCase()}`;
}

export function createSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string, secret: Buffer): string {
  return createHmac('sha256', secret).update(token, 'utf8').digest('base64url');
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) throw new Error('密码至少需要8个字符');
  if (password.length > 200) throw new Error('密码不能超过200个字符');
  const salt = randomBytes(16);
  const derived = await scryptPassword(password, salt, PASSWORD_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  });
  return ['scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('base64'), derived.toString('base64')].join('$');
}

export function isValidPasswordHash(encoded: string): boolean {
  const [algorithm, n, r, p, saltBase64, expectedBase64, extra] = encoded.split('$');
  if (
    algorithm !== 'scrypt' ||
    n !== String(SCRYPT_N) ||
    r !== String(SCRYPT_R) ||
    p !== String(SCRYPT_P) ||
    !saltBase64 ||
    !expectedBase64 ||
    extra !== undefined
  ) {
    return false;
  }
  try {
    const salt = Buffer.from(saltBase64, 'base64');
    const expected = Buffer.from(expectedBase64, 'base64');
    return (
      salt.length === 16 &&
      expected.length === PASSWORD_BYTES &&
      salt.toString('base64') === saltBase64 &&
      expected.toString('base64') === expectedBase64
    );
  } catch {
    return false;
  }
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  try {
    if (!isValidPasswordHash(encoded)) return false;
    const [algorithm, n, r, p, saltBase64, expectedBase64] = encoded.split('$');
    if (algorithm !== 'scrypt' || !n || !r || !p || !saltBase64 || !expectedBase64) return false;
    const expected = Buffer.from(expectedBase64, 'base64');
    if (expected.length !== PASSWORD_BYTES) return false;
    const actual = await scryptPassword(password, Buffer.from(saltBase64, 'base64'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024,
    });
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function stableDigest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('base64url');
}
