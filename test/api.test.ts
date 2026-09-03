import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/app.js';
import { RegistrationStore } from '../server/store.js';
import { syntheticId, testConfig, validRegistration } from './helpers.js';

describe('报名 API', () => {
  let directory: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'registration-api-test-'));
    const config = await testConfig(directory);
    const store = new RegistrationStore(directory, config.dataEncryptionKey);
    await store.initialize();
    app = createApp(config, store);
  });

  afterEach(async () => {
    const resolved = path.resolve(directory);
    if (!resolved.startsWith(path.resolve(os.tmpdir()))) throw new Error('拒绝清理非临时目录');
    await rm(resolved, { recursive: true, force: true });
  });

  const postRegistration = (body: unknown) =>
    request(app).post('/api/registrations').set('Origin', 'http://localhost:3000').send(body);

  it('创建、覆盖并阻止不同手机号篡改', async () => {
    const payload = validRegistration();
    const created = await postRegistration(payload).expect(201);
    expect(created.body.status).toBe('created');
    expect(created.body.maskedPhone).toBe('138****8000');
    expect(created.body.maskedIdNumber).not.toContain(payload.idNumber);

    const updated = await postRegistration({ ...payload, jobTitle: '技术总监' }).expect(200);
    expect(updated.body.registrationId).toBe(created.body.registrationId);
    expect(updated.body.status).toBe('updated');

    await postRegistration({ ...payload, phone: '13900139000' }).expect(409);
  });

  it('拒绝跨域、非法表单和错误媒体类型', async () => {
    await request(app)
      .post('/api/registrations')
      .set('Origin', 'http://evil.example')
      .send(validRegistration())
      .expect(403);
    await postRegistration({ ...validRegistration(), consent: false }).expect(400);
    await request(app)
      .post('/api/registrations')
      .set('Origin', 'http://localhost:3000')
      .set('Content-Type', 'text/plain')
      .send('invalid')
      .expect(415);
  });

  it('登录后导出 CSV，退出后会话失效', async () => {
    const payload = validRegistration({
      name: '=HYPERLINK("bad")',
      hasFamily: true,
      familyMembers: [{ name: '家属甲', idNumber: syntheticId(2) }],
    });
    await postRegistration(payload).expect(201);

    const agent = request.agent(app);
    await agent.get('/api/admin/export.csv').expect(401);
    await agent
      .post('/api/admin/login')
      .set('Origin', 'http://localhost:3000')
      .send({ username: 'admin', password: 'admin123' })
      .expect(200);
    const exported = await agent.get('/api/admin/export.csv').expect(200);
    expect(exported.headers['content-type']).toContain('text/csv');
    expect(exported.text.charCodeAt(0)).toBe(0xfeff);
    expect(exported.text).toContain("'=HYPERLINK");
    expect(exported.text).toContain('家属甲');

    await agent.post('/api/admin/logout').set('Origin', 'http://localhost:3000').expect(200);
    await agent.get('/api/admin/export.csv').expect(401);

    const raw = await readFile(path.join(directory, 'registrations.json'), 'utf8');
    expect(raw).not.toContain('家属甲');
  });

  it('二维码和健康检查不依赖 Host 推断公网地址', async () => {
    await request(app).get('/api/health').expect(200, { status: 'ok' });
    const response = await request(app).get('/registration-qr.png').set('Host', 'evil.example').expect(200);
    expect(response.headers['content-type']).toContain('image/png');
    expect(Buffer.isBuffer(response.body)).toBe(true);
  });

  it('限制超大请求、连续提交和连续登录失败', async () => {
    await request(app)
      .post('/api/registrations')
      .set('Origin', 'http://localhost:3000')
      .set('Content-Type', 'application/json')
      .send({ padding: 'x'.repeat(40_000) })
      .expect(413);

    const payload = validRegistration();
    for (let index = 0; index < 6; index += 1) {
      await postRegistration({ ...payload, jobTitle: `工程师${index}` }).expect(index === 0 ? 201 : 200);
    }
    const limited = await postRegistration(payload).expect(429);
    expect(limited.headers['retry-after']).toBeDefined();

    for (let index = 0; index < 5; index += 1) {
      await request(app)
        .post('/api/admin/login')
        .set('Origin', 'http://localhost:3000')
        .send({ username: 'admin', password: 'wrong-password' })
        .expect(401);
    }
    await request(app)
      .post('/api/admin/login')
      .set('Origin', 'http://localhost:3000')
      .send({ username: 'admin', password: 'admin123' })
      .expect(429);
  });

  it('管理会话30分钟后失效', async () => {
    const originalNow = Date.now();
    const now = vi.spyOn(Date, 'now').mockReturnValue(originalNow);
    const agent = request.agent(app);
    await agent
      .post('/api/admin/login')
      .set('Origin', 'http://localhost:3000')
      .send({ username: 'admin', password: 'admin123' })
      .expect(200);
    now.mockReturnValue(originalNow + 31 * 60_000);
    await agent.get('/api/admin/export.csv').expect(401);
    now.mockRestore();
  });
});
