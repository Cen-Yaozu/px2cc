const fs = require('fs').promises;
const path = require('path');
const os = require('os');

module.exports = {
  // 工具依赖
  getDependencies() {
    return {}; // 无外部依赖，使用Node.js内置模块
  },
  
  // 工具元信息
  getMetadata() {
    return {
      name: 'promptx-log-viewer',
      description: 'PromptX日志查询工具，用于查看和筛选系统日志',
      version: '1.0.0',
      category: 'diagnostic',
      author: '鲁班',
      tags: ['log', 'diagnostic', 'promptx'],
      manual: '@manual://promptx-log-viewer'
    };
  },
  
  // 参数Schema
  getSchema() {
    return {
      type: 'object',
      properties: {
        timeRange: {
          type: 'object',
          properties: {
            recent: { 
              type: 'string', 
              pattern: '^\\d+[mhd]$',
              description: '相对时间，如5m, 1h, 24h, 7d' 
            },
            from: { 
              type: 'string', 
              format: 'date-time',
              description: '开始时间' 
            },
            to: { 
              type: 'string', 
              format: 'date-time',
              description: '结束时间' 
            }
          },
          description: '时间范围'
        },
        filters: {
          type: 'object',
          properties: {
            level: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['trace', 'debug', 'info', 'warn', 'error', 'fatal']
              },
              description: '日志级别'
            },
            keyword: { 
              type: 'string',
              description: '关键词搜索' 
            },
            package: { 
              type: 'string',
              description: '包名过滤' 
            },
            file: { 
              type: 'string',
              description: '文件名过滤' 
            },
            pid: { 
              type: 'number',
              description: '进程ID过滤' 
            }
          },
          description: '过滤条件'
        },
        output: {
          type: 'object',
          properties: {
            limit: { 
              type: 'number', 
              default: 100,
              minimum: 1,
              maximum: 1000,
              description: '返回条数限制' 
            },
            order: { 
              type: 'string', 
              enum: ['asc', 'desc'],
              default: 'desc',
              description: '时间排序' 
            },
            fields: {
              type: 'array',
              items: { type: 'string' },
              description: '返回字段'
            }
          },
          description: '输出控制'
        }
      }
    };
  },
  
  // 参数验证
  validate(params) {
    // 时间范围验证
    if (params.timeRange) {
      const { recent, from, to } = params.timeRange;
      if (recent && (from || to)) {
        return { 
          valid: false, 
          errors: ['不能同时指定recent和from/to'] 
        };
      }
      if ((from && !to) || (!from && to)) {
        return { 
          valid: false, 
          errors: ['from和to必须同时指定'] 
        };
      }
    }
    
    return { valid: true, errors: [] };
  },
  
  // 核心执行逻辑
  async execute(params = {}) {
    try {
      const logDir = path.join(os.homedir(), '.promptx', 'logs');
      
      // 1. 确定要读取的日志文件
      const logFiles = await this.getLogFiles(logDir, params.timeRange);
      if (logFiles.length === 0) {
        return {
          success: true,
          summary: {
            totalFound: 0,
            returned: 0,
            files: []
          },
          logs: []
        };
      }
      
      // 2. 读取并解析日志
      const allLogs = [];
      for (const file of logFiles) {
        const logs = await this.parseLogFile(file);
        allLogs.push(...logs);
      }
      
      // 3. 应用过滤条件
      let filtered = this.applyFilters(allLogs, params);
      
      // 4. 排序
      const order = params.output?.order || 'desc';
      filtered.sort((a, b) => {
        return order === 'asc' ? a.time - b.time : b.time - a.time;
      });
      
      // 5. 限制返回数量
      const limit = params.output?.limit || 100;
      const limited = filtered.slice(0, limit);
      
      // 6. 格式化输出
      const formatted = limited.map(log => this.formatLog(log, params.output?.fields));
      
      // 7. 返回结果
      return {
        success: true,
        summary: {
          totalFound: filtered.length,
          returned: formatted.length,
          timeRange: this.getTimeRangeDescription(params.timeRange),
          files: logFiles.map(f => path.basename(f))
        },
        logs: formatted
      };
      
    } catch (error) {
      return {
        success: false,
        error: `日志查询失败: ${error.message}`
      };
    }
  },
  
  // 辅助方法：获取日志文件列表
  async getLogFiles(logDir, timeRange) {
    const files = [];
    
    try {
      const allFiles = await fs.readdir(logDir);
      const logFiles = allFiles.filter(f => f.endsWith('.log'));
      
      if (!timeRange) {
        // 默认返回今天的日志
        const today = new Date().toISOString().split('T')[0];
        return logFiles
          .filter(f => f.includes(today))
          .map(f => path.join(logDir, f));
      }
      
      // 根据时间范围筛选文件
      const { startTime, endTime } = this.parseTimeRange(timeRange);
      
      for (const file of logFiles) {
        // 从文件名提取日期 (promptx-2025-09-01.log)
        const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
          // 文件日期的开始时间（00:00:00）和结束时间（23:59:59）
          const fileDateStart = new Date(dateMatch[1] + 'T00:00:00');
          const fileDateEnd = new Date(dateMatch[1] + 'T23:59:59');
          
          // 如果时间范围与文件日期有交集，则包含该文件
          if (fileDateEnd >= startTime && fileDateStart <= endTime) {
            files.push(path.join(logDir, file));
          }
        }
      }
      
      return files;
    } catch (error) {
      console.error('读取日志目录失败:', error);
      return [];
    }
  },
  
  // 辅助方法：解析日志文件
  async parseLogFile(filePath) {
    const logs = [];
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      
      for (const line of lines) {
        try {
          const log = JSON.parse(line);
          logs.push(log);
        } catch (e) {
          // 跳过无法解析的行
        }
      }
    } catch (error) {
      console.error(`读取日志文件失败 ${filePath}:`, error);
    }
    
    return logs;
  },
  
  // 辅助方法：解析时间范围
  parseTimeRange(timeRange) {
    const now = new Date();
    let startTime, endTime;
    
    if (timeRange.recent) {
      // 解析相对时间
      const match = timeRange.recent.match(/^(\d+)([mhd])$/);
      if (match) {
        const [, value, unit] = match;
        const ms = {
          'm': 60 * 1000,
          'h': 60 * 60 * 1000,
          'd': 24 * 60 * 60 * 1000
        }[unit];
        startTime = new Date(now.getTime() - parseInt(value) * ms);
        endTime = now;
      }
    } else if (timeRange.from && timeRange.to) {
      // 使用绝对时间（假设用户输入的是本地时间）
      startTime = new Date(timeRange.from);
      endTime = new Date(timeRange.to);
    } else {
      // 默认最近24小时
      startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      endTime = now;
    }
    
    return { startTime, endTime };
  },
  
  // 辅助方法：UTC时间转本地时间字符串
  utcToLocal(utcTime) {
    const date = new Date(utcTime);
    // 返回本地时间的ISO字符串格式
    const offset = date.getTimezoneOffset();
    const localTime = new Date(date.getTime() - offset * 60 * 1000);
    return localTime.toISOString().replace('Z', this.getTimezoneString());
  },
  
  // 辅助方法：获取时区字符串
  getTimezoneString() {
    const offset = new Date().getTimezoneOffset();
    const absOffset = Math.abs(offset);
    const hours = Math.floor(absOffset / 60);
    const minutes = absOffset % 60;
    const sign = offset <= 0 ? '+' : '-';
    return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  },
  
  // 辅助方法：应用过滤条件
  applyFilters(logs, params) {
    let filtered = logs;
    
    // 时间范围过滤
    if (params.timeRange) {
      const { startTime, endTime } = this.parseTimeRange(params.timeRange);
      console.log('[DEBUG] 时间范围过滤:', {
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        totalLogsBeforeFilter: filtered.length
      });
      filtered = filtered.filter(log => {
        const logTime = new Date(log.time);
        return logTime >= startTime && logTime <= endTime;
      });
      console.log('[DEBUG] 时间范围过滤后:', filtered.length);
    }
    
    // 级别过滤
    if (params.filters?.level && params.filters.level.length > 0) {
      const levelMap = {
        'trace': 10, 'debug': 20, 'info': 30,
        'warn': 40, 'error': 50, 'fatal': 60
      };
      const levels = params.filters.level.map(l => levelMap[l]);
      filtered = filtered.filter(log => levels.includes(log.level));
    }
    
    // 关键词过滤
    if (params.filters?.keyword) {
      const keyword = params.filters.keyword.toLowerCase();
      filtered = filtered.filter(log => 
        log.msg && log.msg.toLowerCase().includes(keyword)
      );
    }
    
    // 包名过滤
    if (params.filters?.package) {
      filtered = filtered.filter(log => 
        log.package === params.filters.package
      );
    }
    
    // 文件名过滤
    if (params.filters?.file) {
      filtered = filtered.filter(log => 
        log.file === params.filters.file
      );
    }
    
    // PID过滤
    if (params.filters?.pid) {
      filtered = filtered.filter(log => 
        log.pid === params.filters.pid
      );
    }
    
    return filtered;
  },
  
  // 辅助方法：格式化日志输出
  formatLog(log, fields) {
    const levelNames = {
      10: 'TRACE', 20: 'DEBUG', 30: 'INFO',
      40: 'WARN', 50: 'ERROR', 60: 'FATAL'
    };
    
    // 转换时间为本地时间
    const utcTime = new Date(log.time);
    const localTimeString = utcTime.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    const formatted = {
      time: utcTime.toISOString(),  // 保留UTC时间
      localTime: localTimeString,    // 新增本地时间
      level: log.level,
      levelName: levelNames[log.level] || 'UNKNOWN',
      package: log.package,
      file: log.file,
      line: log.line,
      msg: log.msg,
      pid: log.pid
    };
    
    // 如果指定了返回字段，只返回指定字段
    if (fields && fields.length > 0) {
      const filtered = {};
      for (const field of fields) {
        if (formatted.hasOwnProperty(field)) {
          filtered[field] = formatted[field];
        }
      }
      // 如果包含time字段，自动包含localTime
      if (fields.includes('time') && !fields.includes('localTime')) {
        filtered.localTime = formatted.localTime;
      }
      return filtered;
    }
    
    return formatted;
  },
  
  // 辅助方法：获取时间范围描述
  getTimeRangeDescription(timeRange) {
    if (!timeRange) {
      return '今天';
    }
    
    if (timeRange.recent) {
      return `最近${timeRange.recent}`;
    }
    
    if (timeRange.from && timeRange.to) {
      const from = new Date(timeRange.from).toLocaleString('zh-CN');
      const to = new Date(timeRange.to).toLocaleString('zh-CN');
      return `${from} - ${to}`;
    }
    
    return '未指定';
  }
};