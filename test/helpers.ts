import { randomBytes } from 'node:crypto';
import { hashPassword } from '../server/security.js';
import type { AppConfig } from '../server/config.js';
import type { RegistrationInput } from '../shared/validation.js';

const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const checkCodes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];

export function syntheticId(sequence = 1, birthDate = '19900101'): string {
  const first17 = `990000${birthDate}${String(sequence).padStart(3, '0')}`;
  const sum = weights.reduce((total, weight, index) => total + Number(first17[index]) * weight, 0);
  return `${first17}${checkCodes[sum % 11]}`;
}

export function validRegistration(overrides: Partial<RegistrationInput> = {}): RegistrationInput {
  return {
    name: '测试报名者',
    phone: '13800138000',
    organization: '智能制造测试单位',
    jobTitle: '工程师',
    idNumber: syntheticId(1),
    hasFamily: false,
    familyMembers: [],
    roomType: 'standard',
    otherNeeds: '',
    consent: true,
    ...overrides,
  };
}

export async function testConfig(dataDir: string): Promise<AppConfig> {
  return {
    port: 3000,
    publicUrl: 'http://localhost:3000',
    dataDir,
    adminUsername: 'admin',
    adminPasswordHash: await hashPassword('admin123'),
    dataEncryptionKey: randomBytes(32),
    sessionSecret: randomBytes(48),
    trustProxy: false,
  };
}
