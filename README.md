# WZLCF 客户端网站

PPT 定制服务客户端首版，包含手机号验证码登录、服务介绍、预算咨询、文件上传、服务交付、修改申请、资产归档和账户设置。

## 本地启动

```powershell
npm install --cache .npm-cache --registry=https://registry.npmmirror.com
npm run db:init
npm run dev
```

打开 `http://localhost:3000`。开发环境默认验证码为 `123456`。

`npm run dev` 会先自动检查 Docker Desktop、启动 ONLYOFFICE 容器并确认编辑器可访问，然后才启动 Next.js。首次运行可能较慢，因为 Docker 需要拉取并初始化 ONLYOFFICE 镜像；Docker 未安装或无法启动时，命令会明确失败，不会启动一个缺少 PPT 编辑器的开发环境。

## 员工模式

- 地址：`http://localhost:3000/employee`
- 开发环境首位管理员手机号：`15875754338`
- 管理员员工码：`12345678`
- 其余固定员工码：`10000002` 至 `10000005`
- 管理员登录后可在“员工管理”绑定其余员工手机号。

复制 `.env.example` 中的员工、ONLYOFFICE 和豆包配置到 `.env`。豆包密钥只能配置为服务端 `ARK_API_KEY`。

如需单独排查 ONLYOFFICE，可运行：

```powershell
npm run office:up
```

该命令会先检查 `http://localhost:18080`，未连接时会自动尝试启动 Docker Desktop，再启动 ONLYOFFICE 容器。默认访问地址为 `http://localhost:18080`。修改 `docker-compose.onlyoffice.yml` 后重新执行该命令，会自动更新容器配置。容器已允许访问本机私有地址，以便读取工作区中的 PPT 文件。

## 线上部署

员工电脑不需要安装 Docker Desktop。生产环境在一台服务器上集中运行网站与一套 ONLYOFFICE，员工只通过浏览器访问。

1. 复制 `.env.production.example` 为服务器上的 `.env.production`，填写真实域名、密钥和服务凭据。
2. 将网站域名和 ONLYOFFICE 子域名解析到同一台服务器，例如 `app.example.com` 和 `office.example.com`。
3. 在服务器执行：

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```

`docker-compose.production.yml` 使用 Caddy 自动签发 HTTPS 证书。ONLYOFFICE 不直接映射宿主机端口，只经 `https://office.example.com` 由反向代理提供服务。`ONLYOFFICE_PUBLIC_URL` 与 `APP_PUBLIC_URL` 供员工浏览器访问；`APP_INTERNAL_URL` 仅供 ONLYOFFICE 容器读取 PPT 和回调保存，二者不能混用。

智能美化数字人和“图片炸开”由独立后台 worker 执行。`npm run dev` 与生产 Compose 都会自动启动它；需要单独排查时可运行 `npm run agent:workers`。混合模式会使用方舟豆包视觉模型分析参考图、DeepSeek 规划版式、OpenAI 生成主视觉图，所有密钥仍只保留在服务端环境变量。

## 图片炸开

员工在 PPT 工作台右上角点击“图片炸开”，从 AI 预成品、素材库或本地上传中选择任意图片。系统会先给出背景、主体、装饰、卡片（整组与逐张）和文字还原层；含文字的框同时提供“无字可编辑版”和“保留原字效版”，员工可修改 OCR 文字、切换可编辑重建或保留字效，再按原坐标导入一个新 PPT 页，不会擅自增加标题或重新排版。

`npm run dev` 会启动本机拆图服务。基础服务使用 OpenCV 生成透明候选；安装 `python -m pip install -r requirements-components.txt` 后，PaddleOCR 会提供更可靠的中文文字、旋转角度和四点坐标。未安装时系统自动退回豆包视觉文字识别，不会阻断拆图。没有 GPU 时仍可查看候选，并按需点击“抠图精修”处理单个边缘；“AI 清字精修”只在员工主动点击时调用 OpenAI 图像编辑。

### SAM3 本地分割

SAM3 是可选的本地高质量分割执行器。它的代码环境可以安装在 `.venv-sam3`，但官方权重 `facebook/sam3` 是 Hugging Face gated model，必须先登录并同意模型许可后才能下载。

```powershell
npm run components:sam3:check
.\\.venv-sam3\\Scripts\\huggingface-cli.exe login
npm run components:sam3:setup
npm run components:sam3:load-check
```

`components:sam3:setup` 下载成功后会把本机缓存中的 `sam3.pt` 路径写入 `.env` 的 `SAM3_CHECKPOINT`。如果未授权，它会明确提示去 `https://huggingface.co/facebook/sam3` 申请访问；系统不会把未生效的 SAM3 伪装成默认拆图后端。配置成功并重启 `npm run dev` 后，拆图服务会优先尝试 SAM3，失败时自动回退 OpenCV。

### Grounded-SAM2 替代后端

如果 SAM3 权重授权失败，可以先使用 Grounded-SAM2/SAM2 路线。当前系统会把豆包/视觉图层计划给出的语义框作为 grounding，再交给 SAM2 生成高质量蒙版；未来可继续接入 Grounding DINO、Florence-2 或 DINO-X 来自动修正这些框。

```powershell
npm run components:gsam2:setup
npm run components:gsam2:check
```

`components:gsam2:setup` 会安装 SAM2、下载公开 SAM2.1 checkpoint，并写入 `.env`。如果你要手动安装，也可以在 `.env` 配置：

```env
COMPONENT_EXTRACTOR_BACKEND=auto
SAM2_CHECKPOINT=C:\path\to\sam2.1_hiera_large.pt
SAM2_MODEL_CFG=configs/sam2.1/sam2.1_hiera_l.yaml
GROUNDED_SAM2_GROUNDER=vision-boxes
```

配置成功后运行 `npm run components:gsam2:load-check`。拆图服务的后端顺序是：SAM3 可用则用 SAM3；否则 Grounded-SAM2/SAM2 可用则用 SAM2；都不可用时回退 OpenCV。

开发模式会在首次访问和代码修改后现场编译。需要通过局域网流畅演示时，使用生产模式：

```powershell
npm run build -- --webpack
npm start
```

本机访问使用 `http://localhost:3000`，同一局域网的其他设备使用终端显示的 Network 地址。

## 短信配置

将 `.env.example` 中的阿里云配置填写到 `.env`。需要审核通过的短信签名、模板及访问密钥。

未配置阿里云时，只有非生产环境会返回并展示开发验证码。

## 验证

```powershell
npm run lint
npm run build -- --webpack
node scripts/visual-test.mjs
```

演示下载接口返回交付清单占位文件。正式部署时应替换为对象存储的短期授权下载地址，并为 ZIP 等客户附件接入病毒扫描。
