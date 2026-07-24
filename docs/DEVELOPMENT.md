# 开发文档

## 快速开始

```bash
# 安装所有依赖（前后端 workspace）
npm install

# 开发模式：同时启动后端(3000)和前端(5173)，前端代理 API/WS 到后端
npm run dev
# 浏览器访问 http://localhost:5173

# 生产模式：单端口部署
npm run build      # 构建前端 dist + 编译后端
npm start          # http://localhost:3000 同时提供 API、WebSocket 和前端静态资源
```

## 架构概览

```
Browser (Vue3 + Naive UI)
    │
REST + WebSocket
    │
Node Fastify 后端 ── SQLite + JSON 配置
    │
ClaudeBridge (stream-json 双向流)
    │
Claude Code CLI ── (底层模型: GLM-5.2)
    │
Workspace (每个项目一个目录)
```

**核心设计**：Claude Code CLI 仅作为工具调用框架和流式协议层，实际推理模型由 CLI 自身配置决定（本环境为 GLM-5.2）。后端不关心底层模型，只解析 stream-json 协议。

## Claude Bridge 协议要点

Bridge 通过 `claude -p --input-format stream-json --output-format stream-json --verbose --include-partial-messages` 启动长驻进程。

**关键行为**（实测）：
- CLI **不会主动发送 init** —— 必须先通过 stdin 收到第一条 user 消息，CLI 才返回 init + 回复。
- 流式 token 通过 `stream_event` 消息的 `content_block_delta.delta.text_delta` 逐字推送。
- 完整工具调用输入通过多次 `input_json_delta`（`partial_json`）累积，在 `content_block_stop` 时拼装。
- 每轮对话以 `result` 消息结束（含 cost、duration、is_error）。

**消息类型映射**（`backend/src/claude/bridge.ts`）：
| CLI stdout | BridgeEvent |
|---|---|
| `system/init` | `init`（model/sessionId/tools） |
| `stream_event` → `text_delta` | `streaming_text`（逐字） |
| `stream_event` → `content_block_stop` (tool_use) | `tool_use`（带解析后的 input） |
| `user` → `tool_result` | `tool_result` |
| `result` | `result` |

## 会话进程模型

- **常驻进程**：每个会话一个 claude 进程，stdin/stdout 长连接，跨多条消息保持。
- **驻留后台**：浏览器关闭后进程不退出，重新打开可接回（SessionManager 持久化 sessionId 到 `config/sessions.json`）。
- **崩溃恢复**：进程死亡后，下次发消息自动用 `--resume <cliSessionId>` 重启，恢复历史上下文。
- **事件回放**：SessionManager 缓存最近 200 条事件，WS 重连时自动补发。

## 目录结构

```
ClaudeUI/
├── frontend/src/
│   ├── views/        # HomeView, ChatView, SettingsView, LogsView
│   ├── components/   # MessageItem, ToolCallCard, ChatInput, FileTree, DiffViewer, GitPanel
│   ├── stores/       # config, project, session (Pinia)
│   ├── api/          # REST 客户端 + WebSocket 封装
│   └── utils/        # markdown 渲染
├── backend/src/
│   ├── claude/       # bridge.ts + manager.ts + protocol.ts（核心）
│   ├── routes/       # session, project, config, file, git, upload, log
│   ├── services/     # config, project, file, git
│   ├── db/           # SQLite (better-sqlite3)
│   ├── ws/           # WebSocket handler
│   └── server.ts     # Fastify 入口
├── workspace/        # 用户项目目录
├── config/           # config.json + data.db + sessions.json
└── logs/             # server.log / claude.log / error.log
```

## API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/projects` | 项目列表 |
| POST | `/api/projects` | 创建项目 |
| GET/PUT | `/api/config` | 读取/更新配置 |
| POST | `/api/config/detect-claude` | 自动探测 claude 路径 |
| GET | `/api/session` | 会话列表 |
| POST | `/api/session` | 创建会话（启动 claude 进程） |
| DELETE | `/api/session/:id` | 关闭会话（kill 进程） |
| POST | `/api/session/:id/interrupt` | 中断当前轮 |
| GET | `/api/projects/:id/tree` | 文件树 |
| GET/PUT | `/api/projects/:id/file` | 读/写文件 |
| GET | `/api/projects/:id/git/*` | git status/diff/log |
| POST | `/api/projects/:id/upload` | 上传文件 |
| GET | `/api/logs/:name` | 读取日志 |

## WebSocket

连接 `ws://host/ws/:sessionId`：
- 客户端 → 服务端：`{"type":"chat","content":"..."}`、`{"type":"interrupt"}`
- 服务端 → 客户端：`{"type":"event","sessionId":"...","event":<BridgeEvent>}`

## 安全

- 文件 API 校验路径不逃逸项目根目录（防 `../` 穿越）。
- 权限模式默认 `acceptEdits`（自动放行编辑），可在设置页切换为 `default`（每次询问）等。
- 上传文件类型白名单。
