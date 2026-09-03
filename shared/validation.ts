import { z } from 'zod';

export const EVENT_TITLE = '知藏于文·智驭全局——人工智能赋能智能制造行业交流会';
export const MAX_FAMILY_MEMBERS = 5;

const ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2] as const;
const ID_CHECK_CODES = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'] as const;

export function normalizeIdCard(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidMainlandPhone(value: string): boolean {
  return /^1[3-9]\d{9}$/.test(value.trim());
}

export function isValidChineseIdCard(rawValue: string, now = new Date()): boolean {
  const value = normalizeIdCard(rawValue);
  if (!/^\d{17}[\dX]$/.test(value)) return false;

  const year = Number(value.slice(6, 10));
  const month = Number(value.slice(10, 12));
  const day = Number(value.slice(12, 14));
  const birthDate = new Date(Date.UTC(year, month - 1, day));
  const shanghaiParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const shanghaiPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(shanghaiParts.find((part) => part.type === type)?.value);
  const todayNumber =
    shanghaiPart('year') * 10_000 + shanghaiPart('month') * 100 + shanghaiPart('day');
  const birthNumber = year * 10_000 + month * 100 + day;

  if (
    year < 1900 ||
    birthDate.getUTCFullYear() !== year ||
    birthDate.getUTCMonth() !== month - 1 ||
    birthDate.getUTCDate() !== day ||
    birthNumber > todayNumber
  ) {
    return false;
  }

  const sum = ID_WEIGHTS.reduce((total, weight, index) => total + Number(value[index]) * weight, 0);
  return value[17] === ID_CHECK_CODES[sum % 11];
}

const trimmedText = (field: string, max: number) =>
  z
    .string({ message: `请填写${field}` })
    .trim()
    .min(1, `请填写${field}`)
    .max(max, `${field}不能超过${max}个字符`);

const idCardSchema = z
  .string({ message: '请填写身份证号' })
  .transform(normalizeIdCard)
  .refine(isValidChineseIdCard, '请输入有效的18位身份证号');

export const familyMemberSchema = z.object({
  name: trimmedText('家属姓名', 50),
  idNumber: idCardSchema,
});

export const registrationSchema = z
  .object({
    name: trimmedText('姓名', 50),
    phone: z
      .string({ message: '请填写手机号' })
      .trim()
      .refine(isValidMainlandPhone, '请输入有效的11位大陆手机号'),
    organization: trimmedText('单位', 100),
    jobTitle: trimmedText('职务', 50),
    idNumber: idCardSchema,
    hasFamily: z.boolean({ message: '请选择是否携带家属' }),
    familyMembers: z.array(familyMemberSchema).max(MAX_FAMILY_MEMBERS, `最多添加${MAX_FAMILY_MEMBERS}位家属`),
    roomType: z.enum(['standard', 'single'], { message: '请选择房型' }),
    otherNeeds: z
      .string({ message: '其他需求格式不正确' })
      .trim()
      .max(500, '其他需求不能超过500个字符')
      .default(''),
    consent: z.boolean({ message: '请确认信息并同意信息收集说明' }).refine(Boolean, {
      message: '请确认信息并同意信息收集说明',
    }),
  })
  .superRefine((data, context) => {
    if (data.hasFamily && data.familyMembers.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['familyMembers'],
        message: '请至少添加1位家属',
      });
    }

    if (!data.hasFamily && data.familyMembers.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['familyMembers'],
        message: '未携带家属时不能提交家属信息',
      });
    }

    const seen = new Map<string, string>();
    seen.set(data.idNumber, '本人');
    data.familyMembers.forEach((member, index) => {
      const owner = seen.get(member.idNumber);
      if (owner) {
        context.addIssue({
          code: 'custom',
          path: ['familyMembers', index, 'idNumber'],
          message: `身份证号与${owner}重复`,
        });
      } else {
        seen.set(member.idNumber, `家属${index + 1}`);
      }
    });
  });

export type RegistrationInput = z.infer<typeof registrationSchema>;

export type RegistrationSuccess = {
  status: 'created' | 'updated';
  registrationId: string;
  maskedPhone: string;
  maskedIdNumber: string;
};

export type ApiError = {
  error: string;
  code?: string;
  issues?: Array<{ path: Array<string | number>; message: string }>;
};

export function maskPhone(phone: string): string {
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

export function maskIdNumber(idNumber: string): string {
  return `${idNumber.slice(0, 6)}********${idNumber.slice(-4)}`;
}
