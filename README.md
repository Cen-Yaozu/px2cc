# Px2CC

**PromptX to Claude Code** - 一个简洁的CLI工具，快速将PromptX角色安装到Claude Code中。

## 功能特性

- 🚀 快速安装PromptX角色到Claude Code
- 🎭 动态获取所有可用的系统角色和用户角色  
- 🤖 支持安装为Claude Code Subagents (通过自然语言提及调用)
- ⚙️ 支持安装为Claude Code Commands (通过 `/command` 调用)
- 🏷️ 支持自定义Agent和Command的安装名字
- 🎨 友好的交互式界面
- 📁 自动创建和管理 `.claude` 目录结构

## 安装

### 方式一：全局安装
```bash
npm install -g px2cc
px2cc
```

### 方式二：npx 直接运行（推荐）
```bash
npx px2cc
```

无需安装，一条命令直接运行！

然后按照交互式提示：
1. 选择要安装的PromptX角色
2. 选择安装类型（Agent 或 Command）
3. 选择是否自定义安装名字（可选）
4. 确认安装

## 安装类型

### Subagent 模式
- 安装到 `.claude/agents/` 目录
- 通过自然语言提及调用: `Use the <角色名>-agent subagent to [任务]`

### Command 模式  
- 安装到 `.claude/commands/` 目录
- 通过 `/<角色名>` 在Claude Code中调用

## 角色类型

- **系统角色** 📦 - PromptX内置的专业角色
- **用户角色** 👤 - 用户自定义创建的角色

## 自定义命名

从 v2.2.0 开始支持自定义安装名字功能：

- **默认命名规则**：
  - Agent: `角色名-agent` (如 `assistant-agent`)
  - Command: `角色名` (如 `assistant`)

- **自定义命名**：
  - 可以自由指定Agent或Command的名字
  - 支持字母、数字、下划线和连字符
  - 避免与现有文件重名冲突

- **使用场景**：
  - 多版本管理：`assistant-v1`, `assistant-v2`
  - 功能区分：`code-assistant`, `writing-assistant`
  - 个人偏好：`my-helper`, `ai-buddy`

## 系统要求

- Node.js >= 16.0.0
- Claude Code
- PromptX账户（包含可用角色）

## 示例

```bash
$ px2cc

🚀 PromptX CLI - Claude Code 角色安装器
   快速将PromptX角色集成到Claude Code中

🔍 正在从PromptX系统加载角色...

✅ 加载完成!
📊 发现 5 个系统角色，9 个用户角色

? 请选择要安装的PromptX角色: assistant (系统角色)
? 安装 assistant 为: Agent - 通过提及"assistant-agent subagent"调用
? 是否要自定义安装名字？ Yes
? 请输入自定义Agent名字 (默认: assistant-agent): my-assistant
? 确认安装 assistant 为 my-assistant 到Claude Code? Yes

📖 加载 assistant 角色定义...
🔧 生成 assistant agent文件...

✅ 角色安装完成！

📄 生成的文件:
   - .claude/agents/my-assistant.md

🎉 现在你可以在Claude Code中使用:
   Use the my-assistant subagent to help with my task
   Have the my-assistant subagent review my code

💡 提示: 重启Claude Code以确保新配置生效
```

## 许可证

MIT

## 作者

PromptX Bridge Team