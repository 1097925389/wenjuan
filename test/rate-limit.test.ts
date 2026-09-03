import { describe, expect, it } from 'vitest';
import { FixedWindowLimiter, LoginFailureLimiter } from '../server/rate-limit.js';

describe('限流器', () => {
  it('固定窗口到达上限后拒绝并在新窗口恢复', () => {
    const limiter = new FixedWindowLimiter(2, 1_000);
    expect(limiter.consume('key', 0).allowed).toBe(true);
    expect(limiter.consume('key', 10).allowed).toBe(true);
    expect(limiter.consume('key', 20).allowed).toBe(false);
    expect(limiter.consume('key', 1_001).allowed).toBe(true);
  });

  it('登录连续失败五次后锁定30分钟', () => {
    const limiter = new LoginFailureLimiter();
    for (let index = 0; index < 5; index += 1) limiter.fail('ip|admin', index);
    expect(limiter.check('ip|admin', 10).allowed).toBe(false);
    expect(limiter.check('ip|admin', 31 * 60_000).allowed).toBe(true);
  });
});
