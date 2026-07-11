# AI 额度

一个常驻桌面的 Codex 额度悬浮窗。它从本机 Codex 读取额度和 Token 使用情况，不需要单独登录。

## 能看什么

- 5 小时额度和周额度
- 额度重置时间
- Reset credits 数量和到期时间
- 最近 24 小时的本地 Token 用量
- 7 天、30 天用量趋势和缓存命中率

窗口支持置顶和紧凑模式。关闭按钮只隐藏窗口，完全退出请使用托盘菜单。

## 安装

在 [Releases](../../releases) 下载最新版安装包，按提示安装即可。首次运行前，请先确认本机 Codex 已登录。

如果程序找不到 Codex，可在启动前指定可执行文件：

```powershell
$env:CODEX_BIN='D:\path\to\codex.exe'
```

## 数据与隐私

程序只在本机读取 Codex 额度和会话统计。查询 Reset credits 时，会使用本机 Codex 凭证访问 ChatGPT 官方接口。

凭证不会显示在界面或日志中，也不会写入项目目录。运行缓存保存在程序旁的 `.userdata` 目录，该目录不会提交到仓库。

## 本地开发

需要 Node.js 20 或更高版本。

```powershell
npm install
npm start
```

运行测试：

```powershell
npm test
```

生成 Windows 安装包：

```powershell
npm run release:win
```

产物位于 `release/`。

## 目录

```text
src/       主进程、数据服务和界面
scripts/   构建脚本
test/      Node.js 测试
```

## 许可证

[MIT](LICENSE)
