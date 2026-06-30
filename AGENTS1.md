# WZLCF 本轮话题记忆

## 当前目标

用户正在开发 `PPTagent` 项目，一个 WZLCF PPT 代做服务网站。当前重点是：

- 客户端与员工端登录流程稳定可用。
- Supabase 后端能记录注册用户与预约表单。
- 员工模式拥有订单任务、客户消息、团队协作、员工管理和 PPT 工作台方向。
- 短信验证码当前先用固定测试码 `123456`，未来可切换到阿里云短信。

## 重要协作约束

- 禁止批量删除文件或目录。
- 不要使用：
  - `del /s`
  - `rd /s`
  - `rmdir /s`
  - `Remove-Item -Recurse`
  - `rm -rf`
- 删除文件时只能一次删除一个明确路径的文件。
- 用户偏好中文、直接、明确步骤。
- 用户不喜欢“讲不清楚”或只讲概念，实际操作要写明文件位置、开关方式和验证方法。

## 技术栈与运行

- Next.js 16、React 19、TypeScript
- Prisma 6、SQLite
- Supabase PostgreSQL 作为外部记录库
- npm
- 本地开发：

```powershell
npm run dev
```

- 浏览器常用访问：
  - 本机：`http://localhost:3000`
  - 局域网：`http://192.168.128.1:3000` 或用户实际局域网地址
- 每次改 `.env` 或登录相关前端逻辑后，务必提醒用户：

```powershell
Ctrl+C
npm run dev
```

然后浏览器按 `Ctrl + F5` 强制刷新。

## 登录逻辑最新要求

### 客户端

- 只需要输入手机号。
- 手机号必须满足：

```ts
/^1[3-9]\d{9}$/
```

- 手机号完整正确后，`获取验证码` 按钮才亮。
- 获取验证码后，输入 6 位验证码，`验证并进入工作台` 按钮才亮。
- 当前测试验证码固定为：

```text
123456
```

- 验证成功后必须刷新 `/api/me`，进入客户端主界面。

### 员工端

- 需要先输入手机号和员工码。
- 手机号必须为 11 位中国大陆手机号。
- 员工码必须为 8 位数字。
- 只有手机号 + 员工码都完整正确后，`获取短信验证码` 按钮才亮。
- 获取验证码后，输入 6 位验证码，`验证并进入员工工作台` 按钮才亮。
- 用户指定：

```text
手机号：15875754338
员工码：12345678
验证码：123456
```

- 验证成功后必须刷新 `/api/employee/me`，进入员工订单任务页。

## 登录按钮问题处理记录

用户反复反馈“号码输入完按钮还是灰的”。最后一次修法是：

- 在 `components/client-app.tsx` 和 `components/employee-app.tsx` 中，登录输入框使用：
  - `ref`
  - `onInput`
  - `onChange`
- 提交时不要只相信 React state，要再次从输入框真实值读取。
- 这是为了避免浏览器自动填充、局域网页面缓存、输入事件异常时出现“页面上看见号码，但状态未同步”的情况。

相关文件：

- `components/client-app.tsx`
- `components/employee-app.tsx`

验证过：

```powershell
npm run lint
npx tsc --noEmit
npm run build -- --webpack
```

都通过。

## 短信验证码方案

当前先不用真实阿里云短信，使用固定测试验证码。

`.env` 默认应包含：

```env
SMS_PROVIDER="mock"
DEV_SMS_CODE="123456"
```

短信代码位置：

- `lib/sms.ts`
- `app/api/auth/send-code/route.ts`

当前逻辑：

- `SMS_PROVIDER="mock"`：永远走测试验证码 `123456`。
- `SMS_PROVIDER="aliyun"`：才会走阿里云短信。

未来切换阿里云时，在 `.env` 中配置：

```env
SMS_PROVIDER="aliyun"
ALIYUN_ACCESS_KEY_ID="你的AccessKeyId"
ALIYUN_ACCESS_KEY_SECRET="你的AccessKeySecret"
ALIYUN_SMS_SIGN_NAME="短信签名"
ALIYUN_SMS_TEMPLATE_CODE="模板CODE"
ALIYUN_SMS_REGION="cn-hangzhou"
```

腾讯云短信路径已移除，避免混淆。

## Supabase 后端记录

Supabase 项目已通过 MCP 成功连接并建表。

项目 URL：

```text
https://tmheyaipmvngnhhdegpn.supabase.co
```

已创建两张表：

- `public.registered_users`
- `public.appointments`

用途：

- `registered_users`：保存验证登录过的用户手机号。
- `appointments`：保存预约/咨询表单记录。

两张表已开启 RLS。当前主要由服务端 PostgreSQL Session Pool 写入，不从浏览器直接写。

本地 `.env` 中有：

```env
SUPABASE_DATABASE_URL="postgresql://..."
```

注意：不要在回答中泄露完整连接串或密码。

曾经完成过补同步：

- 6 个注册用户
- 8 条预约记录

并确认手机号 `15875754338` 已出现在 Supabase。

相关文件：

- `lib/supabase-postgres.ts`
- `scripts/supabase-migrate.mjs`
- `scripts/supabase-sync-existing.mjs`
- `supabase/migrations/20260614_create_registration_and_appointments.sql`
- `app/api/auth/verify/route.ts`
- `app/api/consultations/route.ts`

可用脚本：

```powershell
npm run supabase:migrate
npm run supabase:sync
```

## 员工模式需求记忆

员工模式目标：

- 主题曾经做过蓝色系视觉。
- 员工端导航：
  - 订单任务
  - 客户消息
  - 团队协作
  - 设置
  - 员工管理，仅管理员可见
- 员工端仅支持电脑；手机访问显示电脑端使用提示。
- 员工码固定 5 个。
- 用户指定 `15875754338` 的员工码是 `12345678`。
- 管理员可绑定和管理员工。

员工端订单页：

- 按卡片式订单列表展示。
- 按钮为 `进入工作台`。
- 工作台方向：
  - 左侧和中央为 ONLYOFFICE PPT 编辑区。
  - 右侧为豆包 AI 生图面板。
  - 底部为员工收藏素材条。

## 豆包图片生成方向

用户曾提供豆包 Seedream 接口示例，但密钥已经暴露过，必须提醒用户作废并换新。

正式代码要求：

- 浏览器不能接触 API Key。
- 新密钥只放服务端 `.env`：

```env
ARK_API_KEY=""
ARK_IMAGE_MODEL="doubao-seedream-5-0-260128"
```

## 品牌与视觉记忆

- 品牌名：`WZLCF`
- 品牌图标路径：

```text
public/brand/wzlcf-mark.png
```

- 曾经调过配色，用户喜欢蓝色/红蓝渐变风格。
- 后续不要随便替换品牌标志，除非用户明确要求。

## Git / GitHub 状态

远程仓库：

```text
https://github.com/kk2372237205-ops/PPTagent.git
```

之前用户尝试推送失败，原因是连接 GitHub 443 超时。

已有本地初始提交：

```text
d05bb1a feat: build WZLCF client and employee workspaces
```

当前可能有较多未提交改动。操作前先检查：

```powershell
git status --short
```

不要擅自重置或回滚用户改动。

## 常用验证命令

```powershell
npm run lint
npx tsc --noEmit
npm run build -- --webpack
```

如果涉及页面交互，需要用户本地服务运行：

```powershell
npm run dev
```

如果页面仍显示旧状态，优先提醒：

```text
重启 npm run dev，并按 Ctrl + F5 强制刷新。
```
