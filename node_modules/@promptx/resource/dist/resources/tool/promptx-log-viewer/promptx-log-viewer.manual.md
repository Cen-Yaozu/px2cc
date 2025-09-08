<manual>
<identity>
## 工具名称
@tool://promptx-log-viewer

## 简介
PromptX日志查询工具，用于查看和筛选系统日志，帮助AI快速定位和分析问题
</identity>

<purpose>
⚠️ **AI重要提醒**: 调用此工具前必须完整阅读本说明书，理解工具功能边界、参数要求和使用限制。禁止在不了解工具功能的情况下盲目调用。

## 核心问题定义
PromptX日志分散在多个文件中，且为JSON格式，人工难以快速查找和分析。该工具提供结构化的查询和过滤能力，让AI能够快速获取相关日志信息。

## 价值主张
- 🎯 **解决什么痛点**：AI无法直接访问本地日志文件，难以帮助用户诊断问题
- 🚀 **带来什么价值**：让AI能够自主查看日志，快速定位问题，提供解决方案
- 🌟 **独特优势**：专为PromptX日志格式设计，支持多维度查询，返回结构化数据

## 应用边界
- ✅ **适用场景**：
  - 开发者调试时AI帮助查看日志
  - 用户报告问题时AI自主诊断
  - 分析特定时间段的系统行为
  - 追踪特定模块或进程的日志
  
- ❌ **不适用场景**：
  - 查询非PromptX的日志
  - 实时监控日志流
  - 修改或删除日志
  - 处理超大日志文件（>100MB）
</purpose>

<usage>
## 使用时机
- 用户报告“MCP连接不上”时，查看MCP相关日志
- 开发者说“工具执行失败”时，查看ToolSandbox日志
- 需要了解系统最近的错误情况
- 追踪特定操作的执行流程

## 操作步骤
1. **准备阶段**：确定查询目的和时间范围
2. **执行阶段**：设置适当的过滤条件，调用工具
3. **验证阶段**：分析返回的日志，找出问题根因

## 最佳实践
- 🎯 **效率提升**：
  - 先用较宽的时间范围查看总体情况
  - 再用关键词精确定位问题
  - 使用level过滤快速找到错误
  
- ⚠️ **避免陷阱**：
  - 不要设置过大的limit（默认100条足够）
  - 时间范围过大可能导致查询缓慢
  - 关键词区分大小写
  
- 🔧 **故障排除**：
  - 没有结果？检查时间范围是否正确
  - 结果太多？增加过滤条件
  - 找不到相关日志？尝试不同的关键词

## 注意事项
- 日志文件位于`~/.promptx/logs/`目录
- 按日期分割，格式为`promptx-YYYY-MM-DD.log`
- 错误日志单独存储在`promptx-error-YYYY-MM-DD.log`
- 默认查询当天日志，需要历史日志请指定时间范围
</usage>

<parameter>
## 所有参数都是可选的

## 时间范围参数 (timeRange)
| 参数名 | 类型 | 描述 | 示例 |
|--------|------|------|------|
| recent | string | 相对时间，支持m(分钟)/h(小时)/d(天) | "30m", "2h", "1d" |
| from | string | 开始时间(ISO 8601格式) | "2025-09-01T12:00:00" |
| to | string | 结束时间(ISO 8601格式) | "2025-09-01T13:00:00" |

**注意**：recent与from/to不能同时使用，from和to必须成对出现

## 过滤条件 (filters)
| 参数名 | 类型 | 描述 | 示例 |
|--------|------|------|------|
| level | string[] | 日志级别数组 | ["error", "warn"] |
| keyword | string | 关键词搜索(不区分大小写) | "ToolSandbox" |
| package | string | 包名过滤 | "@promptx/core" |
| file | string | 文件名过滤 | "ToolSandbox.js" |
| pid | number | 进程ID过滤 | 12345 |

**日志级别说明**：
- trace: 跟踪级别(最详细)
- debug: 调试级别
- info: 信息级别
- warn: 警告级别
- error: 错误级别
- fatal: 严重错误

## 输出控制 (output)
| 参数名 | 类型 | 默认值 | 描述 |
|--------|------|--------|------|
| limit | number | 100 | 返回条数限制(1-1000) |
| order | string | "desc" | 时间排序，asc(正序)/desc(倒序) |
| fields | string[] | 全部 | 指定返回字段 |

**可选字段**：time, level, levelName, package, file, line, msg, pid

## 参数示例
```json
// 查看最近30分钟的错误
{
  "timeRange": { "recent": "30m" },
  "filters": { "level": ["error"] }
}

// 查看特定模块的日志
{
  "filters": { 
    "keyword": "ToolSandbox",
    "package": "@promptx/core"
  },
  "output": { "limit": 50 }
}

// 查看特定时间段的所有警告和错误
{
  "timeRange": {
    "from": "2025-09-01T12:00:00",
    "to": "2025-09-01T13:00:00"
  },
  "filters": { "level": ["warn", "error"] },
  "output": { "order": "asc" }
}

// 搜索关键词
{
  "filters": { "keyword": "MCP" },
  "output": { 
    "fields": ["time", "levelName", "msg"],
    "limit": 20
  }
}

// 追踪特定进程
{
  "filters": { "pid": 12345 },
  "output": { "order": "asc" }
}
```
</parameter>

<outcome>
## 成功返回格式
```json
{
  "success": true,
  "summary": {
    "totalFound": 42,           // 总共找到的日志条数
    "returned": 42,             // 实际返回的条数
    "timeRange": "最近30m",     // 时间范围描述
    "files": [                  // 查询的文件列表
      "promptx-2025-09-01.log",
      "promptx-error-2025-09-01.log"
    ]
  },
  "logs": [
    {
      "time": "2025-09-01T12:15:30.000Z",
      "level": 50,
      "levelName": "ERROR",
      "package": "@promptx/core",
      "file": "ToolSandbox.js",
      "line": 127,
      "msg": "[ToolSandbox] pnpm install failed: timeout after 30000ms",
      "pid": 12345
    },
    // ...更多日志条目
  ]
}
```

## 错误返回格式
```json
{
  "success": false,
  "error": "日志查询失败: 具体错误信息"
}
```

## 结果解读指南
- **判断执行成功**：检查`success`字段为true
- **了解查询统计**：查看`summary`部分
- **分析日志内容**：遍历`logs`数组
- **日志级别对应**：10=TRACE, 20=DEBUG, 30=INFO, 40=WARN, 50=ERROR, 60=FATAL

## 后续动作建议
- 找到错误后，查看错误前后的上下文日志
- 发现问题模式后，根据具体情况提供解决方案
- 日志量太大时，细化时间范围或增加过滤条件
- 找不到相关日志时，扩大时间范围或调整关键词
</outcome>
</manual>