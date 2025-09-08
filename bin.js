#!/usr/bin/env node

/**
 * Px2CC 启动器 - Windows兼容版本
 */

// 设置环境变量来抑制PromptX内部日志
process.env.LOG_LEVEL = 'silent';

// 简单直接的导入方式 - Windows兼容
import('./cli.js').catch(error => {
  console.error('启动失败:', error.message);
  console.error('请检查Node.js版本是否 >= 18.0.0');
  process.exit(1);
});