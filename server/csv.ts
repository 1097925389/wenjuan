import type { RegistrationInput } from '../shared/validation.js';

export type ExportableRegistration = {
  registrationId: string;
  createdAt: string;
  updatedAt: string;
  data: RegistrationInput;
};

function neutralizeFormula(value: string): string {
  return /^\s*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
}

function csvCell(value: unknown): string {
  const text = neutralizeFormula(value == null ? '' : String(value));
  return `"${text.replace(/"/g, '""')}"`;
}

export function registrationsToCsv(records: ExportableRegistration[]): string {
  const headers = [
    '报名编号',
    '首次提交时间',
    '最后更新时间',
    '姓名',
    '手机号',
    '单位',
    '职务',
    '本人身份证号',
    '是否携带家属',
    '房型',
    '其他需求',
  ];
  for (let index = 1; index <= 5; index += 1) {
    headers.push(`家属${index}姓名`, `家属${index}身份证号`);
  }

  const rows = records.map((record) => {
    const values: unknown[] = [
      record.registrationId,
      record.createdAt,
      record.updatedAt,
      record.data.name,
      record.data.phone,
      record.data.organization,
      record.data.jobTitle,
      record.data.idNumber,
      record.data.hasFamily ? '是' : '否',
      record.data.roomType === 'standard' ? '标间' : '单间',
      record.data.otherNeeds,
    ];
    for (let index = 0; index < 5; index += 1) {
      values.push(record.data.familyMembers[index]?.name ?? '', record.data.familyMembers[index]?.idNumber ?? '');
    }
    return values.map(csvCell).join(',');
  });

  return `\uFEFF${[headers.map(csvCell).join(','), ...rows].join('\r\n')}\r\n`;
}
