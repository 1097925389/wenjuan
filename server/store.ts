import { constants as fsConstants } from 'node:fs';
import { access, chmod, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { registrationSchema } from '../shared/validation.js';
import type { RegistrationInput } from '../shared/validation.js';
import type { ExportableRegistration } from './csv.js';
import {
  createRegistrationId,
  decryptJson,
  deriveCryptoKeys,
  encryptJson,
  lookupHash,
} from './security.js';

const encryptedPayloadSchema = z.object({
  version: z.literal(1),
  iv: z.string().min(1),
  authTag: z.string().min(1),
  ciphertext: z.string().min(1),
});

const storedRecordSchema = z.object({
  registrationId: z.string().regex(/^REG-[A-F0-9]{10}$/),
  identityKey: z.string().min(20),
  phoneKey: z.string().min(20),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  payload: encryptedPayloadSchema,
});

const storeFileSchema = z.object({
  version: z.literal(1),
  keyCheck: z.string().min(20),
  records: z.array(storedRecordSchema),
});

type StoreFile = z.infer<typeof storeFileSchema>;
type StoredRecord = z.infer<typeof storedRecordSchema>;

export type UpsertResult = {
  status: 'created' | 'updated';
  registrationId: string;
};

export class PhoneMismatchError extends Error {
  constructor() {
    super('该身份证号已登记，但手机号与原报名不一致');
    this.name = 'PhoneMismatchError';
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function readOptional(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function replaceByRename(source: string, destination: string): Promise<void> {
  try {
    await rename(source, destination);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EEXIST' && code !== 'EPERM') throw error;
    await rm(destination, { force: true });
    await rename(source, destination);
  }
}

async function writeAtomic(filePath: string, content: string): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  const handle = await open(temporaryPath, 'wx', 0o600);
  let committed = false;
  try {
    try {
      await handle.writeFile(content, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await replaceByRename(temporaryPath, filePath);
    committed = true;
    await chmod(filePath, 0o600).catch(() => undefined);
  } finally {
    if (!committed) await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

export class RegistrationStore {
  private readonly filePath: string;
  private readonly backupPath: string;
  private readonly encryptionKey: Buffer;
  private readonly indexKey: Buffer;
  private readonly expectedKeyCheck: string;
  private snapshot: StoreFile;
  private queue: Promise<void> = Promise.resolve();
  private initialized = false;

  constructor(
    private readonly dataDir: string,
    masterKey: Buffer,
  ) {
    this.filePath = path.join(dataDir, 'registrations.json');
    this.backupPath = path.join(dataDir, 'registrations.json.bak');
    const keys = deriveCryptoKeys(masterKey);
    this.encryptionKey = keys.encryption;
    this.indexKey = keys.index;
    this.expectedKeyCheck = lookupHash('registration-store-key-check-v1', this.indexKey);
    this.snapshot = { version: 1, keyCheck: this.expectedKeyCheck, records: [] };
  }

  async initialize(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true, mode: 0o700 });
    await chmod(this.dataDir, 0o700).catch(() => undefined);
    const probePath = path.join(
      this.dataDir,
      `.write-probe.${process.pid}.${randomBytes(6).toString('hex')}.tmp`,
    );
    const probe = await open(probePath, 'wx', 0o600);
    try {
      await probe.writeFile('ok', 'utf8');
      await probe.sync();
    } finally {
      await probe.close().catch(() => undefined);
      await rm(probePath, { force: true }).catch(() => undefined);
    }

    const mainContent = await readOptional(this.filePath);
    if (mainContent !== null) {
      try {
        const mainSnapshot = this.parse(mainContent);
        this.verifySnapshot(mainSnapshot);
        this.snapshot = mainSnapshot;
        this.initialized = true;
        return;
      } catch (mainValidationError) {
        const backupContent = await readOptional(this.backupPath);
        if (backupContent === null) {
          throw new Error('报名数据文件损坏，且没有可用备份', { cause: mainValidationError });
        }
        try {
          const backupSnapshot = this.parse(backupContent);
          this.verifySnapshot(backupSnapshot);
          this.snapshot = backupSnapshot;
          await writeAtomic(this.filePath, backupContent);
          this.initialized = true;
          return;
        } catch (backupValidationError) {
          throw new Error('报名数据文件损坏，且无法从备份恢复', { cause: backupValidationError });
        }
      }
    }

    const backupContent = await readOptional(this.backupPath);
    if (backupContent !== null) {
      try {
        const backupSnapshot = this.parse(backupContent);
        this.verifySnapshot(backupSnapshot);
        this.snapshot = backupSnapshot;
        await writeAtomic(this.filePath, backupContent);
        this.initialized = true;
        return;
      } catch (backupValidationError) {
        throw new Error('主数据文件缺失，且备份无法恢复', { cause: backupValidationError });
      }
    }

    this.snapshot = { version: 1, keyCheck: this.expectedKeyCheck, records: [] };
    await writeAtomic(this.filePath, JSON.stringify(this.snapshot, null, 2));
    this.initialized = true;
  }

  async upsert(input: RegistrationInput): Promise<UpsertResult> {
    this.assertInitialized();
    return this.enqueue(async () => {
      const identityKey = lookupHash(input.idNumber, this.indexKey);
      const phoneKey = lookupHash(input.phone, this.indexKey);
      const existingIndex = this.snapshot.records.findIndex((record) => record.identityKey === identityKey);
      const now = new Date().toISOString();
      const records = [...this.snapshot.records];

      let status: UpsertResult['status'];
      let registrationId: string;
      let createdAt: string;

      if (existingIndex >= 0) {
        const existing = records[existingIndex];
        if (existing.phoneKey !== phoneKey) throw new PhoneMismatchError();
        status = 'updated';
        registrationId = existing.registrationId;
        createdAt = existing.createdAt;
      } else {
        status = 'created';
        registrationId = this.uniqueRegistrationId(records);
        createdAt = now;
      }

      const nextRecord: StoredRecord = {
        registrationId,
        identityKey,
        phoneKey,
        createdAt,
        updatedAt: now,
        payload: encryptJson(input, this.encryptionKey, registrationId),
      };

      if (existingIndex >= 0) records[existingIndex] = nextRecord;
      else records.push(nextRecord);

      const nextSnapshot: StoreFile = { version: 1, keyCheck: this.expectedKeyCheck, records };
      await this.persist(nextSnapshot);
      this.snapshot = nextSnapshot;
      return { status, registrationId };
    });
  }

  async exportAll(): Promise<ExportableRegistration[]> {
    this.assertInitialized();
    await this.queue;
    return [...this.snapshot.records]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((record) => ({
        registrationId: record.registrationId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        data: registrationSchema.parse(
          decryptJson<unknown>(record.payload, this.encryptionKey, record.registrationId),
        ),
      }));
  }

  private parse(content: string): StoreFile {
    return storeFileSchema.parse(JSON.parse(content));
  }

  private async persist(nextSnapshot: StoreFile): Promise<void> {
    if (await fileExists(this.filePath)) {
      const current = await readFile(this.filePath, 'utf8');
      this.verifySnapshot(this.parse(current));
      await writeAtomic(this.backupPath, current);
    }
    await writeAtomic(this.filePath, JSON.stringify(nextSnapshot, null, 2));
  }

  private verifySnapshot(snapshot: StoreFile): void {
    if (snapshot.keyCheck !== this.expectedKeyCheck) {
      throw new Error('数据加密密钥与现有报名文件不匹配，拒绝启动');
    }
    const registrationIds = new Set<string>();
    const identityKeys = new Set<string>();
    for (const record of snapshot.records) {
      if (registrationIds.has(record.registrationId) || identityKeys.has(record.identityKey)) {
        throw new Error('报名数据包含重复索引，拒绝启动');
      }
      registrationIds.add(record.registrationId);
      identityKeys.add(record.identityKey);

      const data = registrationSchema.parse(
        decryptJson<unknown>(record.payload, this.encryptionKey, record.registrationId),
      );
      if (
        lookupHash(data.idNumber, this.indexKey) !== record.identityKey ||
        lookupHash(data.phone, this.indexKey) !== record.phoneKey
      ) {
        throw new Error('报名数据索引校验失败，拒绝启动');
      }
    }
  }

  private uniqueRegistrationId(records: StoredRecord[]): string {
    const existingIds = new Set(records.map((record) => record.registrationId));
    let candidate = createRegistrationId();
    while (existingIds.has(candidate)) candidate = createRegistrationId();
    return candidate;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const current = this.queue.then(operation, operation);
    this.queue = current.then(
      () => undefined,
      () => undefined,
    );
    return current;
  }

  private assertInitialized(): void {
    if (!this.initialized) throw new Error('报名数据存储尚未初始化');
  }
}
