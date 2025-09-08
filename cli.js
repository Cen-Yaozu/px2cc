#!/usr/bin/env node

/**
 * PromptX CLI - 使用 @promptx/core 动态获取角色信息  
 * 注意：此文件应通过 promptx-cli wrapper 脚本运行以过滤内部日志
 */

import { resource } from '@promptx/core';
import { ClaudeCodeBuilder } from 'claude-code-builder';
import { PromptXActionProcessor } from './src/PromptXActionProcessor.js';
import inquirer from 'inquirer';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

// 注意：原有的parsePromptXRole函数已被PromptXActionProcessor替代
// 新的处理器实现完整的PromptX Action流程，包括：
// 1. RoleLoader - 加载角色定义  
// 2. DependencyAnalyzer - 分析资源依赖
// 3. CognitionLoader - 加载认知网络
// 4. LayerAssembler - 三层内容组装

// 发现MCP服务器
async function discoverMCPServers() {
  const servers = {
    defaultTools: ['Read', 'Write', 'Edit', 'Bash'],
    mcpServers: []
  };

  try {
    console.log(chalk.gray('   检查MCP服务器状态（可能需要一些时间）...'));
    // 使用claude mcp list获取所有MCP服务器（增加超时时间到60秒）
    const mcpOutput = execSync('claude mcp list', { 
      encoding: 'utf8',
      timeout: 60000,  // 增加到60秒
      stdio: 'pipe'    // 确保错误输出被捕获
    });
    
    // 解析输出，提取服务器信息
    const lines = mcpOutput.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      // 匹配服务器名称（格式：serverName: command - status）
      const match = trimmedLine.match(/^([^:]+):\s+(.+)\s+-\s+(✓|✗)\s+(.*)$/);
      if (match && !trimmedLine.includes('Checking MCP server health')) {
        const [, name, command, status, statusText] = match;
        servers.mcpServers.push({
          name: name.trim(),
          command: command.trim(), 
          connected: status === '✓',
          status: statusText.trim()
        });
      }
    }
    
    console.log(chalk.green(`✅ 发现 ${servers.mcpServers.length} 个MCP服务器`));
    
  } catch (error) {
    if (error.code === 'ETIMEDOUT') {
      console.error(chalk.yellow('⚠️  MCP服务器检查超时，将继续安装（只使用默认工具）'));
      console.error(chalk.gray('   如需使用MCP工具，请检查网络连接或使用 --skip-mcp 参数'));
    } else {
      console.error(chalk.yellow('⚠️  无法获取MCP服务器列表，将继续安装（只使用默认工具）'));
      console.error(chalk.gray(`   原因: ${error.message}`));
    }
    // 不再抛出错误，而是继续执行，不使用MCP服务器
    console.log(chalk.gray('   将继承所有可用工具（Claude Code默认行为）'));
    return servers;
  }

  return servers;
}

// 显示MCP服务器选择界面
async function selectMCPServers(roleName, availableServers) {
  // 如果没有MCP服务器，直接返回undefined（继承所有工具）
  if (availableServers.mcpServers.length === 0) {
    console.log(chalk.gray('   没有发现MCP服务器，将继承所有可用工具'));
    return undefined;
  }

  // 只显示MCP服务器选择
  const choices = [];
  
  for (const server of availableServers.mcpServers) {
    const statusIcon = server.connected ? '✓' : '✗';
    const statusColor = server.connected ? chalk.green : chalk.red;
    choices.push({
      name: `${statusColor(statusIcon)} ${server.name} ${chalk.gray(`(${server.status})`)}`,
      value: server.name,
      checked: false, // 默认不选中任何MCP服务器
      disabled: !server.connected ? '(未连接)' : false
    });
  }

  console.log(chalk.blue('\n🔧 默认工具（自动包含）:'), availableServers.defaultTools.join(', '));
  
  const answer = await inquirer.prompt([{
    type: 'checkbox',
    name: 'selectedServers',
    message: `为 ${roleName} 选择额外的MCP服务器（可选）:`,
    choices: choices
  }]);

  // 处理选中的MCP服务器
  const selectedMCPServers = answer.selectedServers || [];
  
  if (selectedMCPServers.length === 0) {
    console.log(chalk.gray('   将继承所有可用工具（Claude Code默认行为）'));
    return undefined; // Claude Code会继承所有工具
  }
  
  // 如果选择了特定服务器，只包含默认工具+选中服务器的工具
  const selectedTools = availableServers.defaultTools.slice();
  for (const serverName of selectedMCPServers) {
    // 添加该服务器的所有工具（使用通配符或具体工具名）
    selectedTools.push(`mcp__${serverName}__*`);
  }
  
  console.log(chalk.blue(`   已选择 ${selectedMCPServers.length} 个MCP服务器: ${selectedMCPServers.join(', ')}`));
  return selectedTools;
}

// 获取PromptX角色
async function getAllRoles() {
  try {
    const manager = resource.getGlobalResourceManager();
    await manager.initializeWithNewArchitecture();
    
    const roleResources = manager.registryData.getResourcesByProtocol('role');
    const systemRoles = roleResources.filter(r => r.source === 'package');
    const userRoles = roleResources.filter(r => r.source === 'user');

    return { systemRoles, userRoles, manager };
  } catch (error) {
    throw new Error(`获取PromptX角色失败: ${error.message}`);
  }
}

// 显示欢迎界面
function showWelcome() {
  console.clear();
  console.log(chalk.blue.bold('🚀 PromptX CLI - Claude Code 角色安装器'));
  console.log(chalk.gray('   快速将PromptX角色集成到Claude Code中\n'));
}

// 显示角色选择菜单
async function showRoleMenu(systemRoles, userRoles, availableServers) {
  const choices = [
    ...systemRoles.map(role => ({
      name: `📦 ${role.id} ${chalk.gray('(系统角色)')}`,
      value: { role: role.id, source: 'package' },
      short: role.id
    })),
    new inquirer.Separator(chalk.gray('─── 用户角色 ───')),
    ...userRoles.map(role => ({
      name: `👤 ${role.id} ${chalk.gray('(用户角色)')}`,
      value: { role: role.id, source: 'user' },
      short: role.id
    }))
  ];

  const roleAnswer = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedRole',
      message: '请选择要安装的PromptX角色:',
      choices: choices,
      pageSize: 15
    }
  ]);

  // 选择安装类型
  const typeAnswer = await inquirer.prompt([
    {
      type: 'list',
      name: 'installType',
      message: `安装 ${roleAnswer.selectedRole.role} 为:`,
      choices: [
        {
          name: `🤖 Agent - 通过提及"${roleAnswer.selectedRole.role}-agent subagent"调用`,
          value: 'agents',
          short: 'Agent'
        },
        {
          name: `⚙️  Command - 通过 /${roleAnswer.selectedRole.role} 调用`,
          value: 'commands', 
          short: 'Command'
        }
      ]
    },
    {
      type: 'confirm',
      name: 'customName',
      message: '是否要自定义安装名字？',
      default: false
    }
  ]);

  let customName = '';
  if (typeAnswer.customName) {
    const nameAnswer = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: typeAnswer.installType === 'agents' 
          ? `请输入自定义Agent名字 (默认: ${roleAnswer.selectedRole.role}-agent):`
          : `请输入自定义Command名字 (默认: ${roleAnswer.selectedRole.role}):`,
        default: typeAnswer.installType === 'agents' 
          ? `${roleAnswer.selectedRole.role}-agent` 
          : roleAnswer.selectedRole.role,
        validate: (input) => {
          if (!input.trim()) {
            return '名字不能为空';
          }
          // 检查名字格式
          if (!/^[a-zA-Z0-9_-]+$/.test(input.trim())) {
            return '名字只能包含字母、数字、下划线和连字符';
          }
          return true;
        }
      }
    ]);
    customName = nameAnswer.name.trim();
  }

  const confirmAnswer = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: customName 
        ? `确认安装 ${roleAnswer.selectedRole.role} 为 ${chalk.yellow(customName)} 到Claude Code?`
        : '确认安装到Claude Code?',
      default: true
    }
  ]);

  let selectedTools = [];
  if (confirmAnswer.confirm) {
    // 选择MCP服务器和工具
    selectedTools = await selectMCPServers(roleAnswer.selectedRole.role, availableServers);
  }

  return {
    selectedRole: roleAnswer.selectedRole,
    installType: typeAnswer.installType,
    confirm: confirmAnswer.confirm,
    customName: customName,
    selectedTools: selectedTools
  };
}

// 检查当前目录
function checkDirectory() {
  const currentDir = process.cwd();
  const claudeDir = path.join(currentDir, '.claude');
  
  if (!fs.existsSync(claudeDir)) {
    console.log(chalk.yellow('📁 创建 .claude 目录...'));
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.mkdirSync(path.join(claudeDir, 'agents'), { recursive: true });
    fs.mkdirSync(path.join(claudeDir, 'commands'), { recursive: true });
  }
  
  return claudeDir;
}

// 安装角色
async function installRole(selectedRole, installType, claudeDir, selectedTools, customName = '') {
  const roleName = selectedRole.role;
  const results = {};
  
  try {
    // 使用新的PromptXActionProcessor执行完整的action流程
    const processor = new PromptXActionProcessor();
    const mode = installType === 'agents' ? 'subagent' : 'command';
    const processedContent = await processor.processRole(roleName, mode);
    
    // 根据安装模式创建相应文件
    const finalName = customName || (installType === 'agents' ? `${roleName}-agent` : roleName);
    
    if (installType === 'agents') {
      console.log(chalk.cyan(`🔧 生成 ${finalName} subagent文件...`));
      const agentConfig = {
        name: finalName,
        description: `基于PromptX ${roleName}角色的专业AI助手 - 完整action实现`,
        content: processedContent,
        targetDir: claudeDir
      };
      
      // 设置工具配置 - 如果用户没有选择特定工具，则继承所有可用工具
      if (selectedTools) {
        agentConfig.tools = selectedTools;
      }
      // 如果没有选择特定工具，Claude Code会自动继承所有可用工具
      
      const subagentResult = await ClaudeCodeBuilder.createSubagent(agentConfig);

      if (!subagentResult.success) {
        throw new Error(`创建Subagent失败: ${subagentResult.error}`);
      }
      results.agentFile = `${finalName}.md`;
      results.usage = `Use the ${finalName} subagent to [任务描述]`;
    }

    if (installType === 'commands') {
      console.log(chalk.cyan(`📋 生成 ${finalName} command文件...`));
      
      const commandConfig = {
        name: finalName,
        description: `基于PromptX ${roleName}角色的专业助手 - 完整action实现`,
        content: processedContent,
        targetDir: claudeDir
      };
      
      // 设置工具配置 - 如果用户没有选择特定工具，则继承所有可用工具
      if (selectedTools) {
        commandConfig.allowedTools = selectedTools;
      }
      // 如果没有选择特定工具，Claude Code会自动继承所有可用工具

      const commandResult = await ClaudeCodeBuilder.createCommand(commandConfig);

      if (!commandResult.success) {
        throw new Error(`创建Command失败: ${commandResult.error}`);
      }
      results.commandFile = `${finalName}.md`;
      results.usage = `/${finalName}`;
    }

    results.roleName = roleName;
    results.installType = installType;
    return results;
    
  } catch (error) {
    throw new Error(`安装角色失败: ${error.message}`);
  }
}

// 主程序入口
export async function main() {
  try {
    showWelcome();
    
    // 检查是否跳过MCP发现（用于快速测试）
    const skipMCP = process.argv.includes('--skip-mcp');
    
    let availableServers;
    if (skipMCP) {
      console.log(chalk.yellow('⚠️  跳过MCP发现（测试模式）'));
      availableServers = {
        defaultTools: ['Read', 'Write', 'Edit', 'Bash'],
        mcpServers: []
      };
    } else {
      // 发现MCP服务器
      console.log(chalk.cyan('🔍 正在发现MCP服务器...\n'));
      try {
        availableServers = await discoverMCPServers();
      } catch (error) {
        console.error(chalk.yellow('⚠️  MCP服务器发现失败，使用默认配置'));
        availableServers = {
          defaultTools: ['Read', 'Write', 'Edit', 'Bash'],
          mcpServers: []
        };
      }
    }
    
    // 加载角色
    console.log(chalk.cyan('🔍 正在从PromptX系统加载角色...\n'));
    const { systemRoles, userRoles, manager } = await getAllRoles();
    
    console.log(chalk.green('✅ 加载完成!'));
    console.log(`📊 发现 ${chalk.bold(systemRoles.length)} 个系统角色，${chalk.bold(userRoles.length)} 个用户角色\n`);
    
    // 显示角色选择
    const { selectedRole, installType, confirm, selectedTools, customName } = await showRoleMenu(systemRoles, userRoles, availableServers);
    
    if (!confirm) {
      console.log(chalk.yellow('\n👋 安装已取消'));
      return;
    }

    // 检查目录
    const claudeDir = checkDirectory();
    
    console.log(chalk.blue(`\n🎭 开始安装角色: ${selectedRole.role} (${installType})`));
    
    // 安装角色
    const result = await installRole(selectedRole, installType, claudeDir, selectedTools, customName);
    
    console.log(chalk.green.bold('\n✅ 角色安装完成！'));
    console.log(`\n📄 生成的文件:`);
    
    if (result.agentFile) {
      console.log(`   - ${chalk.gray('.claude/agents/')}${chalk.white(result.agentFile)}`);
    }
    if (result.commandFile) {
      console.log(`   - ${chalk.gray('.claude/commands/')}${chalk.white(result.commandFile)}`);
    }
    
    console.log(chalk.magenta(`\n🎉 现在你可以在Claude Code中使用:`));
    if (result.usage) {
      console.log(chalk.yellow(`   ${result.usage}`));
    }
    
    console.log(chalk.gray(`\n💡 提示: 重启Claude Code以确保新配置生效`));
    
  } catch (error) {
    console.error(chalk.red('❌ 安装失败:'), error.message);
    process.exit(1);
  }
}

// 运行主程序 - Windows兼容版本
// 通过bin.js调用时直接执行，通过import调用时也执行
main().catch(error => {
  console.error(chalk.red('❌ 程序异常:'), error.message);
  process.exit(1);
});