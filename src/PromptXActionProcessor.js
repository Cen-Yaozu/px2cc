/**
 * PromptXActionProcessor - 实现完整的PromptX Action流程
 * 
 * 替代简单的parsePromptXRole函数，实现：
 * 1. 角色加载器 (RoleLoader)
 * 2. 依赖分析器 (DependencyAnalyzer)  
 * 3. 认知网络加载器 (CognitionLoader)
 * 4. 三层组装器 (LayerAssembler)
 */

import { resource } from '@promptx/core';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import chalk from 'chalk';

/**
 * 角色加载器 - 替代PromptX的ResourceManager
 */
class RoleLoader {
  constructor(resourceManager) {
    this.resourceManager = resourceManager;
  }

  /**
   * 加载角色定义
   * @param {string} roleId - 角色ID
   * @returns {Object} 角色信息
   */
  async loadRole(roleId) {
    console.log(chalk.cyan(`📖 加载角色定义: ${roleId}`));
    
    try {
      // 确保ResourceManager已初始化
      if (!this.resourceManager.initialized) {
        await this.resourceManager.initializeWithNewArchitecture();
      }
      
      // 加载角色资源
      const result = await this.resourceManager.loadResource(`@role://${roleId}`);
      
      if (!result || !result.success || !result.content) {
        throw new Error(`无法加载角色 ${roleId} 的内容`);
      }
      
      // 解析DPML内容
      const parsedContent = this.parseDPMLContent(result.content);
      
      return {
        id: roleId,
        raw: result.content,
        sections: parsedContent,
        metadata: result.metadata || {}
      };
      
    } catch (error) {
      console.error(chalk.red(`❌ 角色加载失败: ${error.message}`));
      throw error;
    }
  }

  /**
   * 解析DPML角色文档
   * @param {string} content - 原始内容
   * @returns {Object} 解析后的sections
   */
  parseDPMLContent(content) {
    const sections = {};
    
    // 解析 <role> 标签
    const roleMatch = content.match(/<role>([\s\S]*?)<\/role>/);
    if (roleMatch) {
      const roleContent = roleMatch[1];
      
      // 提取各个部分
      sections.personality = this.extractSection(roleContent, 'personality');
      sections.principle = this.extractSection(roleContent, 'principle');
      sections.knowledge = this.extractSection(roleContent, 'knowledge');
    }
    
    return sections;
  }

  /**
   * 提取XML标签内容
   * @param {string} content - 内容
   * @param {string} tagName - 标签名
   * @returns {string|null} 提取的内容
   */
  extractSection(content, tagName) {
    const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i');
    const match = content.match(regex);
    return match ? match[1].trim() : null;
  }
}

/**
 * 依赖分析器 - 分析和加载资源依赖
 */
class DependencyAnalyzer {
  constructor(resourceManager) {
    this.resourceManager = resourceManager;
  }

  /**
   * 分析角色依赖
   * @param {Object} roleInfo - 角色信息
   * @returns {Object} 依赖资源
   */
  async analyzeDependencies(roleInfo) {
    console.log(chalk.cyan(`🔍 分析资源依赖...`));
    
    const dependencies = {
      thoughts: [],
      executions: [],
      knowledges: []
    };

    if (!roleInfo.sections) {
      return dependencies;
    }

    // 收集所有资源引用
    const allRefs = this.extractResourceReferences(roleInfo.sections);
    
    console.log(chalk.gray(`   发现 ${allRefs.length} 个资源引用`));

    // 并发加载所有依赖
    const loadPromises = allRefs.map(ref => this.loadDependency(ref));
    const results = await Promise.allSettled(loadPromises);

    // 分类处理结果
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        const ref = allRefs[index];
        const content = result.value;
        
        switch (ref.protocol) {
          case 'thought':
            dependencies.thoughts.push({ id: ref.resource, content });
            break;
          case 'execution':
            dependencies.executions.push({ id: ref.resource, content });
            break;
          case 'knowledge':
            dependencies.knowledges.push({ id: ref.resource, content });
            break;
        }
      }
    });

    console.log(chalk.green(`✅ 依赖分析完成: thoughts=${dependencies.thoughts.length}, executions=${dependencies.executions.length}, knowledges=${dependencies.knowledges.length}`));
    
    return dependencies;
  }

  /**
   * 提取资源引用
   * @param {Object} sections - 角色sections
   * @returns {Array} 引用列表
   */
  extractResourceReferences(sections) {
    const refs = [];
    
    const extractFromText = (text) => {
      if (!text) return [];
      // 匹配 @!protocol://resource 或 @protocol://resource 格式
      const matches = text.matchAll(/@!?([^:]+):\/\/([^\s\>\<\n]+)/g);
      return Array.from(matches).map(match => ({
        protocol: match[1],
        resource: match[2]
      }));
    };

    // 从所有sections中提取引用
    Object.values(sections).forEach(section => {
      refs.push(...extractFromText(section));
    });

    return refs;
  }

  /**
   * 加载单个依赖
   * @param {Object} ref - 引用对象
   * @returns {Promise<string>} 内容
   */
  async loadDependency(ref) {
    try {
      const resourceUrl = `@${ref.protocol}://${ref.resource}`;
      const result = await this.resourceManager.loadResource(resourceUrl);
      
      if (result && result.success && result.content) {
        return result.content;
      }
      
      console.warn(chalk.yellow(`⚠️  无法加载依赖: ${resourceUrl}`));
      return null;
    } catch (error) {
      console.warn(chalk.yellow(`⚠️  依赖加载失败: @${ref.protocol}://${ref.resource} - ${error.message}`));
      return null;
    }
  }
}

/**
 * 认知网络加载器 - 加载PromptX认知数据
 */
class CognitionLoader {
  constructor() {
    this.basePath = path.join(os.homedir(), '.promptx', 'cognition');
  }

  /**
   * 检查认知网络是否存在（不加载具体内容）
   * @param {string} roleId - 角色ID
   * @returns {Object} 认知网络存在状态
   */
  async checkNetworkExists(roleId) {
    console.log(chalk.cyan(`🧠 检查认知网络状态: ${roleId}`));
    
    try {
      const networkFilePath = path.join(this.basePath, roleId, 'network.json');
      
      // 仅检查文件是否存在
      try {
        await fs.access(networkFilePath);
        console.log(chalk.green(`✅ 发现认知网络文件: ${roleId}`));
        return {
          hasNetwork: true,
          networkPath: networkFilePath
        };
      } catch (error) {
        console.log(chalk.gray(`   未找到认知网络文件: ${roleId}`));
        return {
          hasNetwork: false,
          networkPath: networkFilePath
        };
      }
      
    } catch (error) {
      console.warn(chalk.yellow(`⚠️  认知网络检查失败: ${error.message}`));
      return {
        hasNetwork: false,
        networkPath: null,
        error: error.message
      };
    }
  }

}

/**
 * 三层组装器 - 组装最终输出内容
 */
class LayerAssembler {
  /**
   * 组装完整内容
   * @param {Object} roleInfo - 角色信息
   * @param {Object} dependencies - 依赖资源
   * @param {Object} cognitionData - 认知数据
   * @param {string} mode - 模式 (command|subagent)
   * @returns {string} 组装后的内容
   */
  assembleContent(roleInfo, dependencies, cognitionData, mode = 'command') {
    const parts = [];

    // 标题部分
    parts.push(`# 🧠 [Consciousness Prime] ${roleInfo.id}${mode === 'subagent' ? '专业助手' : '角色已激活'}`);
    parts.push('');

    // CognitionLayer - PromptX认知增强
    parts.push('## 💭 PromptX认知增强');
    
    if (cognitionData.hasNetwork) {
      parts.push('🧠 **状态**: 该角色已建立经验网络');
      parts.push('');
      parts.push('🔧 **激活方式** (需要PromptX MCP服务器):');
      parts.push(`- \`recall ${roleInfo.id}\` - 激活该角色的完整经验网络`);
      parts.push(`- \`recall ${roleInfo.id} "具体问题"\` - 检索相关历史经验`);
      parts.push(`- \`remember ${roleInfo.id} "新知识"\` - 将新经验加入角色记忆`);
      parts.push('');
      parts.push('💡 **说明**: 认知网络包含该角色的历史使用经验，通过recall工具动态激活');
      
    } else {
      parts.push('🌱 **状态**: 该角色尚未建立经验网络');
      parts.push('');
      parts.push('🚀 **开始使用**:');
      parts.push('- 安装并配置PromptX MCP服务器');
      parts.push(`- 使用 \`recall ${roleInfo.id}\` 开始建立认知网络`);
      parts.push('- 随着使用逐步积累该角色的专业经验');
    }
    
    parts.push('');

    // RoleLayer - 角色定义
    if (roleInfo.sections.personality) {
      parts.push('## 🎭 角色人格');
      parts.push(this.cleanContent(roleInfo.sections.personality));
      parts.push('');
    }

    if (roleInfo.sections.principle) {
      parts.push('## 🔧 工作原则');
      parts.push(this.cleanContent(roleInfo.sections.principle));
      parts.push('');
    }

    if (roleInfo.sections.knowledge) {
      parts.push('## 📚 专业知识');
      parts.push(this.cleanContent(roleInfo.sections.knowledge));
      parts.push('');
    }

    // 依赖资源
    if (dependencies.thoughts.length > 0) {
      parts.push('## 💡 思维模式');
      dependencies.thoughts.forEach(thought => {
        parts.push(`### ${thought.id}`);
        parts.push(this.cleanContent(thought.content));
        parts.push('');
      });
    }

    if (dependencies.executions.length > 0) {
      parts.push('## ⚡ 执行技能');
      dependencies.executions.forEach(execution => {
        parts.push(`### ${execution.id}`);
        parts.push(this.cleanContent(execution.content));
        parts.push('');
      });
    }

    // StateLayer - 状态信息
    parts.push('---');
    parts.push('');
    
    if (mode === 'command') {
      parts.push(`🎉 ${roleInfo.id}角色激活完成！我现在以该角色身份为你服务。`);
    } else {
      parts.push('## 🤖 助手说明');
      parts.push(`我是基于PromptX ${roleInfo.id}角色的专业AI助手。我会：`);
      parts.push(`- 始终保持${roleInfo.id}的专业身份和思维模式`);
      parts.push('- 利用完整的PromptX工具生态提供专业服务');
      parts.push('- 在我们的对话过程中持续学习和记忆');
      parts.push('');
      parts.push('请告诉我你需要什么帮助？');
    }

    parts.push('');
    parts.push('---');
    parts.push('');
    parts.push('💡 **可用的PromptX工具生态**：');
    parts.push(`- \`recall ${roleInfo.id}\` - 激活该角色的历史经验网络`);
    parts.push(`- \`remember ${roleInfo.id} "新体验"\` - 将新体验编织到角色记忆`);
    parts.push('- `learn` - 学习新的资源和知识');
    parts.push('- `toolx` - 执行专业工具');
    parts.push('- 具体工具可用性取决于PromptX MCP服务器配置');
    parts.push('');
    
    if (mode === 'command') {
      parts.push('现在开始处理用户需求。');
    }

    return parts.join('\n');
  }

  /**
   * 清理内容格式
   * @param {string} content - 原始内容
   * @returns {string} 清理后的内容
   */
  cleanContent(content) {
    if (!content) return '';
    
    return content
      // 移除PromptX资源引用标签（但保留引用内容的展开结果）
      .replace(/<reference[^>]*>/g, '')
      .replace(/<\/reference>/g, '')
      // 移除@!protocol://resource引用行（因为依赖内容会单独展示）
      .replace(/\s*@!?[^:]+:\/\/[^\s\>\<\n]+\s*/g, '')
      // 清理多余空行
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      // 移除开头结尾空白
      .trim();
  }
}

/**
 * PromptX Action处理器主类
 */
export class PromptXActionProcessor {
  constructor() {
    this.resourceManager = resource.getGlobalResourceManager();
    this.roleLoader = new RoleLoader(this.resourceManager);
    this.dependencyAnalyzer = new DependencyAnalyzer(this.resourceManager);
    this.cognitionLoader = new CognitionLoader();
    this.layerAssembler = new LayerAssembler();
  }

  /**
   * 执行完整的PromptX Action流程
   * @param {string} roleId - 角色ID
   * @param {string} mode - 模式 (command|subagent)
   * @returns {string} 处理后的内容
   */
  async processRole(roleId, mode = 'command') {
    try {
      console.log(chalk.blue(`\n🎭 开始执行 ${roleId} 的 PromptX Action 流程 (${mode} 模式)`));
      
      // 1. 加载角色定义
      const roleInfo = await this.roleLoader.loadRole(roleId);
      
      // 2. 分析依赖资源
      const dependencies = await this.dependencyAnalyzer.analyzeDependencies(roleInfo);
      
      // 3. 检查认知网络存在性
      const cognitionData = await this.cognitionLoader.checkNetworkExists(roleId);
      
      // 4. 三层组装
      const content = this.layerAssembler.assembleContent(roleInfo, dependencies, cognitionData, mode);
      
      console.log(chalk.green(`✅ PromptX Action 流程完成！`));
      
      return content;
      
    } catch (error) {
      console.error(chalk.red(`❌ PromptX Action 流程失败: ${error.message}`));
      throw error;
    }
  }
}