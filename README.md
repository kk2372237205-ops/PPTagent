# WZLCF 客户端网站

PPT 定制服务客户端首版，包含手机号验证码登录、服务介绍、预算咨询、文件上传、服务交付、修改申请、资产归档和账户设置。

## 本地启动

```powershell
npm install --cache .npm-cache --registry=https://registry.npmmirror.com
npm run db:init
npm run dev
```

打开 `http://localhost:3000`。开发环境默认验证码为 `123456`。

## 员工模式

- 地址：`http://localhost:3000/employee`
- 开发环境首位管理员手机号：`15875754338`
- 管理员员工码：`12345678`
- 其余固定员工码：`10000002` 至 `10000005`
- 管理员登录后可在“员工管理”绑定其余员工手机号。

复制 `.env.example` 中的员工、ONLYOFFICE 和豆包配置到 `.env`。豆包密钥只能配置为服务端 `ARK_API_KEY`。

启动 ONLYOFFICE 文档服务器：

```powershell
npm run office:up
```

Docker Desktop 必须处于运行状态。默认访问地址为 `http://localhost:8080`。
修改 `docker-compose.onlyoffice.yml` 后重新执行该命令，会自动更新容器配置。容器已允许访问本机私有地址，以便读取工作区中的 PPT 文件。

开发模式会在首次访问和代码修改后现场编译。需要通过局域网流畅演示时，使用生产模式：

```powershell
npm run build -- --webpack
npm start
```

本机访问使用 `http://localhost:3000`，同一局域网的其他设备使用终端显示的 Network 地址。

## 腾讯云短信

将 `.env.example` 中的腾讯云配置填写到 `.env`。需要审核通过的短信应用、签名、模板及访问密钥，模板参数依次为验证码和有效分钟数。

未配置腾讯云时，只有非生产环境会返回并展示开发验证码。

## 验证

```powershell
npm run lint
npm run build -- --webpack
node scripts/visual-test.mjs
```

演示下载接口返回交付清单占位文件。正式部署时应替换为对象存储的短期授权下载地址，并为 ZIP 等客户附件接入病毒扫描。
