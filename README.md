# 人工智能赋能智能制造行业交流会报名系统

这是一个面向 1Panel 的 Node.js 22 单机报名系统。用户在手机上打开 Ant Design 报名页，提交的数据由同一个 Node 服务加密后集中保存到服务器 JSON 文件；主办方可通过受保护入口下载 CSV 名单。

## 功能入口

- 报名页：`/`
- 主办方 CSV 导出：`/export`
- 报名二维码：`/registration-qr.png`
- 1Panel 健康检查：`/api/health`

二维码始终使用环境变量 `PUBLIC_URL`，不会根据浏览器的 `Host` 请求头猜测地址。修改公网地址后必须重启服务，并重新下载二维码。

## 本地开发

需要 Node.js 22.12.0 或更高版本（建议选择 1Panel 提供的最新 Node 22 LTS）。

```bash
npm install
npm run generate-secrets
npm run hash-password
```

复制 `.env.example` 为 `.env`，把上面两条命令生成的值填入对应环境变量，然后启动：

```bash
npm run dev
```

- 页面默认地址：`http://localhost:5173`
- 开发接口默认地址：`http://localhost:3001`

不要把 `.env`、密码、加密密钥、会话密钥或 `data` 目录提交到版本库。

## 1Panel 部署

### 1. 创建运行环境

1. 在 1Panel 中安装 Node.js 22.12.0 或更高版本（建议最新 Node 22 LTS）运行环境。
2. 上传受控项目源码（按本节末尾的清单排除本机产物），工作目录指向包含 `package.json` 和 `package-lock.json` 的项目根目录。
3. 只启动一个 Node 进程。若使用 PM2，选择 `fork` 模式并设置 `instances=1`，不要使用 cluster 或多副本。
4. 构建命令设置为：

   ```bash
   npm ci --include=dev && npm run build
   ```

5. 启动命令设置为：

   ```bash
   npm start
   ```

生产环境不要使用 `npm run dev` 或 `vite preview`。

即使 1Panel 在构建阶段已经设置 `NODE_ENV=production`，也必须保留 `--include=dev`，否则 TypeScript、Vite 等构建工具会被 npm 省略。

### 2. 创建持久化目录

推荐在项目发布目录之外创建专用目录，例如：

```text
/opt/activity-registration/data
```

该目录必须由 Node 运行用户拥有并可读写，Linux 权限建议为 `700`。重新发布代码时不能覆盖或清空此目录。

### 3. 配置环境变量

先在可信交互式终端生成密钥和密码哈希；运行密码命令后按提示输入准备使用的密码：

```bash
npm run generate-secrets
npm run hash-password
```

然后在 1Panel Node 运行环境中配置：

```text
NODE_ENV=production
PORT=3000
PUBLIC_URL=http://你的公网IP:3000
DATA_DIR=/opt/activity-registration/data
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=<hash-password 输出的完整 scrypt 字符串>
DATA_ENCRYPTION_KEY=<generate-secrets 输出的 DATA_ENCRYPTION_KEY>
SESSION_SECRET=<generate-secrets 输出的 SESSION_SECRET>
TRUST_PROXY=0
```

注意：

- `PUBLIC_URL` 必须与用户扫码后实际打开的地址完全一致，不能带末尾 `/`、路径、查询参数或锚点。
- `DATA_ENCRYPTION_KEY` 解码后必须是 32 字节。投入使用后不要更换，否则既有报名记录将无法解密。
- `SESSION_SECRET` 至少 32 字节。
- 密码只填写经过 scrypt 处理的 `ADMIN_PASSWORD_HASH`，不要把 `admin123` 明文放入源码或环境样例。
- 直接通过 IP:端口运行时使用 `TRUST_PROXY=0`。以后通过 1Panel 反向代理时，根据代理层数设置为 `1`。

### 4. 放行端口并验收

让服务监听 `0.0.0.0:3000`，并在服务器安全组、系统防火墙和 1Panel 防火墙中仅放行实际需要的 TCP 端口。依次检查：

```text
http://公网IP:3000/
http://公网IP:3000/api/health
http://公网IP:3000/registration-qr.png
http://公网IP:3000/export
```

健康检查应返回 `{"status":"ok"}`。二维码下载后请先用手机实测，确认它没有指向 `localhost` 或内网地址。

上传部署包时只包含受控源码与 `package-lock.json`。不要上传本机的 `node_modules`、`dist`、`server-dist`、`.env`、`.smoke-data`、日志或已有 `data/*.json`；`.gitignore` 只约束 Git，不会自动过滤 1Panel 文件管理器手工上传的内容。

## 数据、备份与清理

- 报名数据位于 `DATA_DIR/registrations.json`，同目录还可能包含 `.bak` 备份和临时文件。
- 姓名、手机号、身份证、单位、职务、需求等表单内容使用 AES-256-GCM 加密；JSON 中只保留报名编号、时间、查重索引和密文。
- 加密数据目录和 `DATA_ENCRYPTION_KEY` 必须分别安全备份。只有数据文件而没有原密钥时，无法恢复历史报名。
- 备份或恢复整个数据目录前，建议先停止唯一的 Node 进程；恢复后再启动。
- 按当前需求，系统不会自动删除报名。活动结束后如需清空全部报名，请先停止服务并确认备份完整，再通过 1Panel 文件管理器把 `registrations.json` 和 `.bak` 移到隔离备份目录；重启服务后会生成空数据文件。

## HTTPS 升级建议

当前明确采用公网 HTTP 和弱口令 `admin123`，这意味着手机号、身份证号和管理员密码在传输途中可能被窃取。服务器端加密只能保护磁盘文件，不能保护 HTTP 传输。

正式收集真实证件信息前，强烈建议：

1. 为域名配置证书，在 1Panel 建立 `HTTPS:443 → 127.0.0.1:3000` 反向代理。
2. 将 `PUBLIC_URL` 改为 `https://你的域名`，把 `TRUST_PROXY` 改为 `1` 并重启。
3. 关闭公网对 3000 端口的直接访问，只允许本机反向代理连接。
4. 重新下载 `/registration-qr.png` 并替换旧二维码。
5. 将 `admin123` 更换为长度更长、唯一且随机的密码，再重新生成 `ADMIN_PASSWORD_HASH`。

HTTPS 模式下，管理会话 Cookie 会自动增加 `Secure` 属性。

## 验证命令

```bash
npm test
npm run build
npm start
```

`npm test` 覆盖身份证校验、家属人数、重复证件、加密存储、并发写入、覆盖规则、登录限流与过期、CSV 安全转义、二维码、提交/更新/失败状态和移动端家属交互。
