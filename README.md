# Claude Code WebUI

个人使用的 Claude Code Web 图形界面。后端通过 Claude Code CLI 的 `stream-json` 双向流协议对接（CLI 作为工具调用框架，运行时模型为 **GLM-5.2**），前端提供现代化 Web UI，兼容 Windows / macOS / Linux。

## 功能

- 聊天（流式输出）
- 多会话（每会话常驻一个 CLI 进程）
- 项目管理（每项目一个工作区目录）
- 文件树
- Diff（Monaco DiffEditor）
- Git（status / diff / log / commit）
- Markdown（代码高亮 / Mermaid / KaTeX / 表格）
- 图片 / 文件上传
- 设置（Claude 路径 / Workspace / 外观 / 权限模式 / 模型）
- 日志

## 技术栈

| 模块 | 方案 |
| --- | --- |
| 前端 | Vue3 + Vite + TypeScript + Pinia + Vue Router |
| UI | Naive UI |
| 编辑器 | Monaco |
| 后端 | Node.js + Fastify + TypeScript |
| 通信 | WebSocket + REST |
| 数据 | SQLite + JSON |

## 开发

```bash
npm install         # 安装前后端依赖
npm run dev         # 同时启动前后端
```

- 前端：http://localhost:5173
- 后端：http://localhost:3000

## 生产

```bash
npm run build       # 构建前端静态资源 + 编译后端
npm start           # 单端口 http://localhost:3000 托管前端 + 提供 API
```

## 架构

```
Browser (Vue3)
    │
REST / WebSocket
    │
Node (Fastify) ── SQLite + JSON
    │
Claude Bridge (stream-json)
    │
Claude Code CLI ── (GLM-5.2)
    │
Workspace
```

## 打包发布（三平台安装包）

通过 GitHub Actions 自动构建 macOS / Windows / Linux 三个独立安装包，每个包内含便携 Node 运行时，用户解压即用、无需安装任何依赖。

### 触发构建

```bash
# 方式一：打 tag 自动构建发布
git tag v0.1.0 && git push origin v0.1.0

# 方式二：在 GitHub Actions 页面手动触发（workflow_dispatch）
```

构建完成后，3 个安装包会自动上传到 GitHub Release：
- `ClaudeUI-macos-arm64.tar.gz`
- `ClaudeUI-linux-x64.tar.gz`
- `ClaudeUI-windows-x64.zip`

### 用户使用

1. 下载对应平台的压缩包并解压
2. macOS/Linux 运行 `./start`；Windows 双击 `start.bat`
3. 浏览器自动打开 `http://localhost:3000`

数据（项目、配置、日志）保存在用户目录，不污染安装目录：
- macOS：`~/Library/Application Support/ClaudeUI/`
- Windows：`%APPDATA%/ClaudeUI/`
- Linux：`~/.local/share/ClaudeUI/`

### 前置要求

需已安装 Claude Code CLI 并完成登录（`claude` 命令可用）。这是独立产品，安装包不内置。

