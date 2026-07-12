# AI 额度 (AI Quota Widget)

一个常驻桌面的 Codex 额度与本地 Token 消耗悬浮窗。

## 使用发行版前请确认

- 支持 Windows 10/11；发行版无需安装 Node.js。
- 需要先安装并登录 Codex 桌面端。本程序会在**当前用户自己的电脑**上自动定位 `codex.exe`，不会内置、上传或共享任何账号凭证。
- 额度读取依赖 Codex 的本地 `app-server` 接口；若 Codex 未登录、接口版本不兼容或网络不可用，界面会保留最近一次快照并标记“读取失败”。重新登录 Codex 后重启 AI 额度即可重试。
- Token 统计只读取本机已有的 Codex、Claude Code 和 Antigravity 会话日志；未安装或未使用对应工具时，该部分显示为空属于正常情况。（注：若您只希望统计本地的 Claude Code 或 Antigravity 用量，本程序在检测不到 Codex 时会自动回退到本地 Token 统计模式，除官方限额圈环显示读取失败外，其余 Token 趋势及累计卡片均能完美工作）。

> 不要把开发者电脑上的 `codex.exe` 绝对路径写入配置或发布包。不同用户的安装目录和 Codex 版本目录不同，程序会在每台电脑上自行发现可用路径。

## 🌟 核心特性

- **官方额度监控**：呈现 Codex 账号 5 小时与周额度的剩余百分比和重置时间。
- **官方额度读取**：通过 Codex 本地 `app-server` 读取当前账号的 5 小时及周额度；接口不可用时明确提示读取失败，不把旧缓存伪装成新数据。
- **重置卡明细**：主卡显示可用张数与最近到期时间；点击可查看全部重置卡的状态、获得时间与到期时间。
- **冷启动快照**：启动时保留最近一次额度快照，等待实时读取完成。
- **多维度 Token 统计**：
  - **本地 Codex & Claude Code**：自动扫描并解析包括新版 Claude Code 在内的本地项目日志。支持 `cache_read_input_tokens` 与 message 等字段读取，并内置以消息 ID 为基准的 Token 去重算法，避免数据重复累加。
  - **Antigravity 消费模拟**：自动扫描解析本地 Antigravity 交互会话，引入**多轮会话上下文累积估算算法**（辅以系统基础 instruction 偏移），配合 `CHARS_PER_TOKEN = 2.8` 混合转换比例，生成高度贴合真实 API 账单的 Token 指标。
- **智能缓存命中率分析**：展示近 24 小时和近 7 天的平均缓存命中率。对于 Antigravity 等本身不支持缓存度量的模型，单选时自动展示为“无法分析”，全局统计（All）时自动进行**隔离剔除**，防止巨量未缓存数据对主号高命中率分母产生稀释与拖累。
- **UI 布局优化**：
  - 调宽模型选择器至 `185px`，以支持更长的自定义模型名完整显示。
  - 窗口支持置顶与紧凑模式切换。
  - 在进入缩小（紧凑）模式时，自动智能隐藏设置按钮等冗余控制项。
  - 限制程序多开，多开时将自动聚焦并还原已有主窗口。
  - 亮色与暗色主题采用统一色板，额度侧栏、圆环、弹窗与图表保持一致对比度。
- **高性能磁盘节流**：在主进程中引入 **15 秒磁盘 IO 缓存（TTL）**，避免每次刷新时高频扫描磁盘带来的 IO 瓶颈与界面卡顿。

## 🛠️ 本地开发

需要 Node.js 20 或更高版本。

```powershell
# 安装依赖
npm install

# 运行开发版
npm start

# 运行测试
npm test
```

## 📦 打包构建

生成 Windows 绿色版：

```powershell
npm run build:win
```

构建好的产物位于 `release/win-unpacked` 文件夹下，直接双击 `AI 额度.exe` 即可运行。

生成可安装的 Release 包：

```powershell
npm run release:win
```

产物位于 `release` 文件夹。完整版本记录见 [CHANGELOG.md](CHANGELOG.md)。

## 📁 项目目录

```text
src/
  ├── main.js                        # 主进程、缓存控制、单例锁
  ├── preload.js                     # 桥接 IPC
  ├── codex-service.js               # Codex app-server 额度读取与快照缓存
  ├── token-usage-service.js         # 本地及 Claude Code 日志去重解析
  ├── antigravity-token-service.js   # Antigravity 累积上下文模拟估算
  ├── quota-normalizer.js            # 数据规范化格式处理器
  └── renderer/                      # 渲染进程 UI (HTML / CSS / JS)
test/                                # 单元测试套件
```

## 📄 许可证

[MIT](LICENSE)
