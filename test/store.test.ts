import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RegistrationStore } from '../server/store.js';
import { syntheticId, validRegistration } from './helpers.js';

describe('RegistrationStore', () => {
  let directory: string;
  let store: RegistrationStore;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'registration-store-test-'));
    store = new RegistrationStore(directory, Buffer.alloc(32, 7));
    await store.initialize();
  });

  afterEach(async () => {
    const resolved = path.resolve(directory);
    if (!resolved.startsWith(path.resolve(os.tmpdir()))) throw new Error('拒绝清理非临时目录');
    await rm(resolved, { recursive: true, force: true });
  });

  it('加密保存并允许同身份证同手机号覆盖', async () => {
    const first = validRegistration();
    const created = await store.upsert(first);
    const updated = await store.upsert({ ...first, jobTitle: '高级工程师' });

    expect(created.status).toBe('created');
    expect(updated).toEqual({ status: 'updated', registrationId: created.registrationId });

    const raw = await readFile(path.join(directory, 'registrations.json'), 'utf8');
    expect(raw).not.toContain(first.name);
    expect(raw).not.toContain(first.phone);
    expect(raw).not.toContain(first.idNumber);

    const exported = await store.exportAll();
    expect(exported).toHaveLength(1);
    expect(exported[0].data.jobTitle).toBe('高级工程师');
    expect(exported[0].createdAt).not.toBe('');
  });

  it('串行处理并发提交且不丢记录', async () => {
    const submissions = Array.from({ length: 30 }, (_, index) =>
      validRegistration({
        name: `测试人员${index + 1}`,
        phone: `139${String(index).padStart(8, '0')}`,
        idNumber: syntheticId(index + 1),
      }),
    );
    const results = await Promise.all(submissions.map((entry) => store.upsert(entry)));
    expect(new Set(results.map((entry) => entry.registrationId)).size).toBe(submissions.length);
    expect(await store.exportAll()).toHaveLength(submissions.length);
  });

  it('使用相同密钥重启后保留记录，错误密钥不会覆盖数据', async () => {
    const masterKey = Buffer.alloc(32, 7);
    await store.upsert(validRegistration());
    const before = await readFile(path.join(directory, 'registrations.json'), 'utf8');

    const restarted = new RegistrationStore(directory, masterKey);
    await restarted.initialize();
    expect(await restarted.exportAll()).toHaveLength(1);

    const wrongKeyStore = new RegistrationStore(directory, Buffer.alloc(32, 8));
    await expect(wrongKeyStore.initialize()).rejects.toThrow(/无法从备份恢复|密钥/);
    expect(await readFile(path.join(directory, 'registrations.json'), 'utf8')).toBe(before);
  });

  it('主文件密文损坏时恢复上一个有效备份', async () => {
    await store.upsert(validRegistration());
    await store.upsert(
      validRegistration({
        name: '第二位测试人员',
        phone: '13900139000',
        idNumber: syntheticId(2),
      }),
    );
    const filePath = path.join(directory, 'registrations.json');
    const corrupted = JSON.parse(await readFile(filePath, 'utf8')) as {
      records: Array<{ payload: { iv: string } }>;
    };
    corrupted.records[0].payload.iv = 'A';
    await writeFile(filePath, JSON.stringify(corrupted), 'utf8');

    const recovered = new RegistrationStore(directory, Buffer.alloc(32, 7));
    await recovered.initialize();
    const records = await recovered.exportAll();
    expect(records).toHaveLength(1);
    expect(records[0].data.name).toBe('测试报名者');
  });
});
