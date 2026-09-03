import path from 'node:path';
import { isValidPasswordHash } from './security.js';

export type AppConfig = {
  port: number;
  publicUrl: string;
  dataDir: string;
  adminUsername: string;
  adminPasswordHash: string;
  dataEncryptionKey: Buffer;
  sessionSecret: Buffer;
  trustProxy: number | false;
};

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`缺少必需环境变量：${key}`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = Number(env.PORT ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT 必须是 1-65535 的整数');
  }

  const publicUrl = required(env, 'PUBLIC_URL').replace(/\/+$/, '');
  const parsedPublicUrl = new URL(publicUrl);
  if (!['http:', 'https:'].includes(parsedPublicUrl.protocol)) {
    throw new Error('PUBLIC_URL 必须使用 http 或 https 协议');
  }
  if (parsedPublicUrl.pathname !== '/' || parsedPublicUrl.search || parsedPublicUrl.hash) {
    throw new Error('PUBLIC_URL 必须是站点根地址，不能包含路径、查询参数或锚点');
  }
  if (
    parsedPublicUrl.username ||
    parsedPublicUrl.password ||
    /YOUR_|你的公网IP|你的域名|请填写|示例/i.test(publicUrl)
  ) {
    throw new Error('PUBLIC_URL 仍是占位地址或包含不允许的登录信息');
  }

  const keyValue = required(env, 'DATA_ENCRYPTION_KEY');
  if (!/^[A-Za-z0-9+/]{43}=$/.test(keyValue)) {
    throw new Error('DATA_ENCRYPTION_KEY 必须是32字节密钥的标准Base64值');
  }
  const key = Buffer.from(keyValue, 'base64');
  if (key.length !== 32) {
    throw new Error('DATA_ENCRYPTION_KEY 解码后必须正好为32字节');
  }

  const sessionSecretValue = required(env, 'SESSION_SECRET');
  if (/请填写|CHANGE_ME|YOUR_/i.test(sessionSecretValue)) {
    throw new Error('SESSION_SECRET 仍是占位值');
  }
  const sessionSecret = Buffer.from(sessionSecretValue, 'utf8');
  if (sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET 至少需要32个字节');
  }

  const trustProxyValue = env.TRUST_PROXY?.trim() ?? '0';
  const trustProxy = trustProxyValue === '0' ? false : Number(trustProxyValue);
  if (trustProxy !== false && (!Number.isInteger(trustProxy) || trustProxy < 1 || trustProxy > 10)) {
    throw new Error('TRUST_PROXY 必须是0-10之间的整数');
  }

  const adminPasswordHash = required(env, 'ADMIN_PASSWORD_HASH');
  if (!isValidPasswordHash(adminPasswordHash)) {
    throw new Error('ADMIN_PASSWORD_HASH 格式不正确，请使用 hash-password 脚本生成');
  }

  const dataDir = path.resolve(env.DATA_DIR?.trim() || './data');
  for (const generatedDirectory of ['dist', 'server-dist']) {
    const generatedPath = path.resolve(process.cwd(), generatedDirectory);
    if (dataDir === generatedPath || dataDir.startsWith(`${generatedPath}${path.sep}`)) {
      throw new Error(`DATA_DIR 不能位于 ${generatedDirectory} 构建目录内`);
    }
  }

  const adminUsername = env.ADMIN_USERNAME?.trim() || 'admin';
  if (adminUsername.length > 100) throw new Error('ADMIN_USERNAME 不能超过100个字符');

  return {
    port,
    publicUrl,
    dataDir,
    adminUsername,
    adminPasswordHash,
    dataEncryptionKey: key,
    sessionSecret,
    trustProxy,
  };
}
