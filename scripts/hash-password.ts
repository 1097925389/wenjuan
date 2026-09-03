import { stdin, stdout } from 'node:process';
import { StringDecoder } from 'node:string_decoder';
import { hashPassword } from '../server/security.js';

function readHidden(prompt: string): Promise<string> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('请在交互式终端中运行此命令');
  }

  return new Promise((resolve, reject) => {
    let value = '';
    const decoder = new StringDecoder('utf8');
    const wasRaw = stdin.isRaw;
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(Boolean(wasRaw));
      stdin.pause();
    };
    const onData = (chunk: Buffer) => {
      const text = decoder.write(chunk);
      if (text.startsWith('\u001b')) return;
      for (const character of text) {
        if (character === '\u0003') {
          cleanup();
          stdout.write('\n');
          reject(new Error('操作已取消'));
          return;
        }
        if (character === '\r' || character === '\n') {
          cleanup();
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = Array.from(value).slice(0, -1).join('');
          continue;
        }
        if (character >= ' ') value += character;
      }
    };

    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

try {
  if (process.argv.length > 2) {
    throw new Error('为避免密码进入 Shell 历史，请直接运行 npm run hash-password 后按提示输入');
  }
  const password = await readHidden('请输入管理密码（输入内容不会显示）：');
  const confirmation = await readHidden('请再次输入管理密码：');
  if (password !== confirmation) throw new Error('两次输入的密码不一致');
  console.log(await hashPassword(password));
} catch (error) {
  console.error(error instanceof Error ? error.message : '无法生成密码哈希');
  process.exitCode = 1;
}
