═══════════════════════════════════════════════
        Claude Code WebUI
═══════════════════════════════════════════════

【启动方法】

  • macOS / Linux:
      打开终端，进入本目录，运行:  ./start

  • Windows:
      双击  start.bat


【启动后】

  浏览器会自动打开 http://localhost:3000
  若未自动打开，手动访问该地址即可。

  首次启动可能需要几秒钟，请耐心等待。


【关闭】

  • macOS / Linux: 在运行 start 的终端按 Ctrl+C
  • Windows: 关闭 start.bat 弹出的命令行窗口


═══════════════════════════════════════════════
【前置要求（重要）】
═══════════════════════════════════════════════

本程序需要 Claude Code CLI 才能工作。请确保:

  1. 已安装 Node.js（Claude CLI 依赖）
  2. 已安装 Claude Code CLI:
       npm install -g @anthropic-ai/claude-code
  3. 已完成登录（在终端运行一次 claude，按提示登录）

底层推理模型由 Claude CLI 决定（当前环境通常为 GLM-5.2）。


═══════════════════════════════════════════════
【常见问题】
═══════════════════════════════════════════════

Q: macOS 提示「无法验证开发者」或「无法打开」？
A: 这是 macOS 安全限制。打开终端，进入本目录执行:
   xattr -d com.apple.quarantine start
   然后重新运行 ./start

Q: 浏览器没自动打开？
A: 手动访问 http://localhost:3000（若端口被占用，
   启动脚本会自动选择下一个可用端口，看终端输出的端口号）

Q: 数据保存在哪里？
A: 项目数据保存在用户目录:
   • macOS: ~/Library/Application Support/ClaudeUI/
   • Windows: %APPDATA%/ClaudeUI/
   • Linux: ~/.local/share/ClaudeUI/

Q: 如何修改 Claude 路径、主题、模型？
A: 启动后在「设置」页面配置。
