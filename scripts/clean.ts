import { rm } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(process.cwd());
const targets = ['dist', 'server-dist'].map((name) => path.resolve(projectRoot, name));

for (const target of targets) {
  if (path.dirname(target) !== projectRoot || !['dist', 'server-dist'].includes(path.basename(target))) {
    throw new Error(`拒绝清理非构建目录：${target}`);
  }
  await rm(target, { recursive: true, force: true });
}
