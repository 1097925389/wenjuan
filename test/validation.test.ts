import { describe, expect, it } from 'vitest';
import {
  isValidChineseIdCard,
  normalizeIdCard,
  registrationSchema,
} from '../shared/validation.js';
import { syntheticId, validRegistration } from './helpers.js';

describe('中国大陆身份证校验', () => {
  it.each([
    '990000199001010017',
    '99000020000229001X',
    '99000020000229001x',
    '990000202402290018',
  ])('接受合成的合法号码 %s', (value) => {
    expect(isValidChineseIdCard(value)).toBe(true);
  });

  it.each([
    '990000199001010018',
    '990000200102290068',
    '990000190002290013',
    '99000020000431007X',
    '990000199013010081',
    '99000020991231005X',
    '99000019900101001A',
    '99000X199001010017',
    '99000019900101001',
  ])('拒绝非法号码 %s', (value) => {
    expect(isValidChineseIdCard(value)).toBe(false);
  });

  it('规范化末位小写 x', () => {
    expect(normalizeIdCard(' 99000020000229001x ')).toBe('99000020000229001X');
  });
});

describe('报名表单结构', () => {
  it('接受一至五位家属', () => {
    const familyMembers = Array.from({ length: 5 }, (_, index) => ({
      name: `家属${index + 1}`,
      idNumber: syntheticId(index + 2),
    }));
    expect(
      registrationSchema.safeParse(validRegistration({ hasFamily: true, familyMembers })).success,
    ).toBe(true);
  });

  it('拒绝超过五位家属、重复证件和未确认', () => {
    const tooMany = Array.from({ length: 6 }, (_, index) => ({
      name: `家属${index + 1}`,
      idNumber: syntheticId(index + 2),
    }));
    expect(registrationSchema.safeParse(validRegistration({ hasFamily: true, familyMembers: tooMany })).success).toBe(false);
    expect(
      registrationSchema.safeParse(
        validRegistration({
          hasFamily: true,
          familyMembers: [{ name: '重复家属', idNumber: syntheticId(1) }],
        }),
      ).success,
    ).toBe(false);
    expect(registrationSchema.safeParse(validRegistration({ consent: false })).success).toBe(false);
  });

  it('拒绝未携带家属时夹带家属数据', () => {
    expect(
      registrationSchema.safeParse(
        validRegistration({
          hasFamily: false,
          familyMembers: [{ name: '隐藏家属', idNumber: syntheticId(2) }],
        }),
      ).success,
    ).toBe(false);
  });
});
