# AI 额度（AI Quota Widget）

一个常驻桌面的 Windows 悬浮窗，用于查看 Codex 额度，以及 Codex、Claude Code 和 Antigravity 的本地 Token 用量。界面支持完整的中英文切换。

[English](README_EN.md) · [下载发行版](https://github.com/w1ndwill/ai-quota-widget/releases)

## 界面

以下截图来自当前版本的真实运行界面；额度、Token 和模型数据会随本机使用情况变化。点击图片可查看原图。

### 额度与用量总览

[![AI 额度总览界面](docs/images/zh/dashboard-overview.jpg)](docs/images/zh/dashboard-overview.jpg)

集中显示 Codex 额度、重置卡、近 24 小时与累计 Token、趋势图、每日热力图和缓存命中率。

### 按来源筛选模型

[![按来源筛选模型](docs/images/zh/model-source-filter.jpg)](docs/images/zh/model-source-filter.jpg)

按 Codex、Claude Code、Antigravity 汇总或筛选模型用量。

### 数据源与外观

[![数据源与外观设置](docs/images/zh/settings-data-sources.jpg)](docs/images/zh/settings-data-sources.jpg)

可分别启用数据源，并切换中英文、亮色或暗色主题和全局快捷键；语言切换会同步更新总览、图表、筛选器和辅助功能标签。

### 紧凑模式

[![紧凑模式](docs/images/zh/compact-mode.jpg)](docs/images/zh/compact-mode.jpg)

将窗口收至 `336 × 72` 逻辑像素，仅保留两档额度和置顶、展开按钮，适合置顶常驻。

## 主要功能

- 通过本机 Codex `app-server` 读取当前账号额度和重置时间。
- 展示重置卡数量、状态和到期时间。
- 统计本机 Codex、Claude Code 会话日志中的 Token 用量。
- 按模型公开的标准文本 API 单价估算 Token 的美元价值（不等同于订阅账单）。
- 根据本机 Antigravity 会话估算 Token 用量；该数据不是官方账单。
- 提供模型筛选、趋势图、每日热力图和可用数据源的缓存命中率。
- 支持完整的中英文界面、亮色与暗色主题。
- 支持托盘运行、窗口置顶、`336 × 72` 紧凑模式和单实例运行。
- 支持自定义显示面板、紧凑模式、刷新和置顶快捷键。

默认快捷键：

- `Ctrl+Shift+Space`：显示或隐藏主面板
- `Ctrl+Shift+M`：切换紧凑模式

## 使用说明

1. 从 [Releases](https://github.com/w1ndwill/ai-quota-widget/releases) 下载 Windows 安装包。
2. 如需查看 Codex 官方额度，请先安装并登录 Codex 桌面端。
3. 启动 AI 额度；程序会自动查找本机 `codex.exe`，无需手动填写路径。

Codex 未安装或未登录时，Claude Code 和 Antigravity 的本地用量统计仍可使用，Codex 额度区域会显示读取失败。未安装或未使用某个数据源时，对应统计为空是正常现象。

程序只读取当前用户的本地会话文件。配置和缓存保存在程序目录下的 `.userdata` 文件夹中。

界面的 HTML、CSS 与 JavaScript 只在窗口启动时加载一次；运行中按需刷新额度和本地日志数据。隐藏到托盘后会停止界面刷新，并在空闲后释放日志扫描线程与本应用启动的 Codex 子进程。

## 本地开发

需要 Node.js 20 或更高版本。

```powershell
npm install
npm start
npm test
```

构建 Windows 绿色版：

```powershell
npm run build:win
```

构建 Windows 安装包：

```powershell
npm run release:win
```

构建结果位于 `release/`。版本变化见 [CHANGELOG.md](CHANGELOG.md)。
重复构建绿色版时，构建脚本会自动保留 `release/win-unpacked/.userdata` 中的设置与缓存。

## 项目结构

```text
src/      应用源码
test/     自动化测试
docs/     文档图片
scripts/  构建脚本
```

## 许可证

[MIT](LICENSE)
