import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../server/config.js';
import { hashPassword } from '../server/security.js';

async function validEnv(): Promise<NodeJS.ProcessEnv> {
  return {
    PORT: '3000',
    PUBLIC_URL: 'http://127.0.0.1:3000',
    DATA_DIR: './data',
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD_HASH: await hashPassword('test-password-123'),
    DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    SESSION_SECRET: randomBytes(48).toString('base64url'),
    TRUST_PROXY: '0',
  };
}

describe('启动配置', () => {
  it('接受完整有效配置', async () => {
    expect(loadConfig(await validEnv()).port).toBe(3000);
  });

  it('拒绝示例地址、占位会话密钥和错误密码哈希', async () => {
    const env = await validEnv();
    expect(() => loadConfig({ ...env, PUBLIC_URL: 'http://YOUR_SERVER_IP:3000' })).toThrow(/占位/);
    expect(() => loadConfig({ ...env, PUBLIC_URL: 'http://你的公网IP:3000' })).toThrow(/占位/);
    expect(() => loadConfig({ ...env, SESSION_SECRET: '请填写至少32个字符的随机字符串' })).toThrow(/占位/);
    expect(() => loadConfig({ ...env, ADMIN_PASSWORD_HASH: 'not-a-hash' })).toThrow(/格式/);
    expect(() => loadConfig({ ...env, ADMIN_PASSWORD_HASH: 'scrypt$16384$8$1$A$A' })).toThrow(/格式/);
  });

  it('拒绝把报名数据放进会公开或清理的构建目录', async () => {
    const env = await validEnv();
    expect(() => loadConfig({ ...env, DATA_DIR: './dist/private-data' })).toThrow(/构建目录/);
    expect(() => loadConfig({ ...env, DATA_DIR: './server-dist/data' })).toThrow(/构建目录/);
  });
});
