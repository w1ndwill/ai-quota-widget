# AI 额度 (AI Quota Widget)

一个常驻桌面的 AI 额度与 Token 消耗悬浮窗。它能自动从本机官方客户端、本地项目会话中获取额度，进行精确的 Token 统计与命中率分析。

## 🌟 核心特性

- **官方额度监控**：实时呈现主账号 5 小时及周额度卡片的剩余百分比、自动重置倒计时与剩余重置卡。
- **免受代理数据污染**：内置智能防污染校验和物理冲突拦截，当您通过 `ccswitch` 将请求路由至 DeepSeek 等第三方接口时，自动忽略路由产生的数据噪音，始终为您锁死呈现真实的官方账号额度。
- **冷启动额度持久化**：首次启动时自动加载上一次干净的官方额度快照，避免启动瞬间因网络被代理拦截而导致数据显示异常。
- **多维度 Token 统计**：
  - **本地 Codex & Claude Code**：自动扫描并解析包括新版 Claude Code 在内的本地项目日志。支持 `cache_read_input_tokens` 与 message 等字段读取，并内置以消息 ID 为基准的 Token 去重算法，避免数据重复累加。
  - **Antigravity 消费模拟**：自动扫描解析本地 Antigravity 交互会话，引入**多轮会话上下文累积估算算法**（辅以系统基础 instruction 偏移），配合 `CHARS_PER_TOKEN = 2.8` 混合转换比例，生成高度贴合真实 API 账单的 Token 指标。
- **智能缓存命中率分析**：展示近 24 小时和近 7 天的平均缓存命中率。对于 Antigravity 等本身不支持缓存度量的模型，单选时自动展示为“无法分析”，全局统计（All）时自动进行**隔离剔除**，防止巨量未缓存数据对主号高命中率分母产生稀释与拖累。
- **UI 布局优化**：
  - 调宽模型选择器至 `185px`，以支持更长的自定义模型名完整显示。
  - 窗口支持置顶与紧凑模式切换。
  - 在进入缩小（紧凑）模式时，自动智能隐藏设置按钮等冗余控制项。
  - 限制程序多开，多开时将自动聚焦并还原已有主窗口。
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

生成 Windows 免安装绿色版：

```powershell
npm run build:win
```

构建好的产物位于 `release/win-unpacked` 文件夹下，直接双击 `AI 额度.exe` 即可运行。

## 📁 项目目录

```text
src/
  ├── main.js                        # 主进程、缓存控制、单例锁
  ├── preload.js                     # 桥接 IPC
  ├── codex-service.js               # 额度持久化、防污染过滤逻辑
  ├── token-usage-service.js         # 本地及 Claude Code 日志去重解析
  ├── antigravity-token-service.js   # Antigravity 累积上下文模拟估算
  ├── quota-normalizer.js            # 数据规范化格式处理器
  └── renderer/                      # 渲染进程 UI (HTML / CSS / JS)
test/                                # 单元测试套件
```

## 📄 许可证

[MIT](LICENSE)
