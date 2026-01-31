/**
 * AI Content Moderator
 * AI驱动的内容审核工具
 */

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs').promises;
const path = require('path');
const moment = require('moment');

class ContentModerator {
  constructor() {
    // 初始化AI客户端
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || process.env.AZURE_OPENAI_API_KEY,
      baseURL: process.env.AZURE_OPENAI_ENDPOINT || undefined,
      defaultQuery: { 'api-version': process.env.AZURE_OPENAI_API_VERSION || undefined },
      defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_API_KEY || undefined }
    });
    
    if (process.env.CLAUDE_API_KEY) {
      this.anthropic = new Anthropic({
        apiKey: process.env.CLAUDE_API_KEY,
      });
    }
    
    this.model = process.env.MODEL_NAME || 'gpt-4';
    this.moderationHistory = [];
  }

  /**
   * 使用AI审核内容
   */
  async moderateContent(text) {
    try {
      const systemPrompt = `你是一位专业的内容审核员，负责识别和分类不当内容。请分析以下文本，并判断是否存在以下类型的问题：
      1. 仇恨言论
      2. 色情内容
      3. 暴力内容
      4. 垃圾信息
      5. 虚假信息
      6. 其他不当内容
      
      请返回JSON格式的结果：
      {
        "isFlagged": true/false,
        "categories": ["category1", "category2"],
        "confidence": 0.0-1.0,
        "explanation": "简要说明",
        "severity": "low/medium/high"
      }`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: `请审核以下内容：\n\n${text}`
          }
        ],
        max_tokens: 500,
        temperature: 0.1, // 降低随机性，提高审核的一致性
        response_format: { type: "json_object" }
      });

      let result;
      try {
        result = JSON.parse(response.choices[0].message.content);
      } catch (parseError) {
        // 如果AI没有返回有效JSON，尝试提取信息
        console.warn('AI未返回有效JSON格式，使用备用解析');
        result = {
          isFlagged: response.choices[0].message.content.toLowerCase().includes('true'),
          categories: ['unknown'],
          confidence: 0.5,
          explanation: response.choices[0].message.content.substring(0, 200),
          severity: 'medium'
        };
      }

      // 记录审核历史
      this.moderationHistory.push({
        text: text.substring(0, 100) + '...',
        result: result,
        timestamp: new Date().toISOString()
      });

      return result;
    } catch (error) {
      console.error('内容审核过程中出错:', error.message);
      // 返回默认安全结果
      return {
        isFlagged: true,
        categories: ['error'],
        confidence: 1.0,
        explanation: `审核过程中出现错误: ${error.message}`,
        severity: 'high'
      };
    }
  }

  /**
   * 批量审核内容
   */
  async moderateBatch(texts) {
    console.log(`开始批量审核 ${texts.length} 条内容`);
    
    const results = [];
    for (let i = 0; i < texts.length; i++) {
      console.log(`正在审核第 ${i + 1}/${texts.length} 条内容`);
      
      const result = await this.moderateContent(texts[i]);
      results.push({
        index: i,
        original: texts[i],
        result: result
      });
      
      // 避免请求过于频繁
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return results;
  }

  /**
   * 从文件读取内容并审核
   */
  async moderateFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      
      // 假设文件内容是以换行符分隔的多条内容
      const texts = content.split(/\n\s*\n/).filter(t => t.trim().length > 0);
      
      return await this.moderateBatch(texts);
    } catch (error) {
      console.error('读取文件时出错:', error.message);
      throw error;
    }
  }

  /**
   * 从目录读取多个文件并审核
   */
  async moderateDirectory(dirPath) {
    try {
      const files = await fs.readdir(dirPath);
      const textFiles = files.filter(file => 
        file.endsWith('.txt') || file.endsWith('.md') || file.endsWith('.html')
      );
      
      const allResults = [];
      
      for (const file of textFiles) {
        console.log(`正在处理文件: ${file}`);
        const filePath = path.join(dirPath, file);
        
        try {
          const fileResults = await this.moderateFile(filePath);
          allResults.push({
            file: file,
            results: fileResults
          });
        } catch (error) {
          console.error(`处理文件 ${file} 时出错:`, error.message);
        }
      }
      
      return allResults;
    } catch (error) {
      console.error('读取目录时出错:', error.message);
      throw error;
    }
  }

  /**
   * 生成审核报告
   */
  async generateReport(results) {
    const flaggedCount = results.filter(r => r.result.isFlagged).length;
    const totalCount = results.length;
    const flagRate = totalCount > 0 ? (flaggedCount / totalCount * 100).toFixed(2) : 0;
    
    // 统计各类别
    const categoryStats = {};
    results.forEach(r => {
      if (r.result.categories) {
        r.result.categories.forEach(cat => {
          categoryStats[cat] = (categoryStats[cat] || 0) + 1;
        });
      }
    });
    
    const report = {
      summary: {
        totalItems: totalCount,
        flaggedItems: flaggedCount,
        flagRate: parseFloat(flagRate),
        timestamp: new Date().toISOString()
      },
      categoryBreakdown: categoryStats,
      details: results.map(r => ({
        index: r.index,
        flagged: r.result.isFlagged,
        categories: r.result.categories,
        severity: r.result.severity,
        confidence: r.result.confidence
      }))
    };
    
    return report;
  }

  /**
   * 保存报告
   */
  async saveReport(report, filename = null) {
    if (!filename) {
      const dateStr = moment().format('YYYYMMDD_HHmm');
      filename = `moderation_report_${dateStr}.json`;
    }
    
    await fs.writeFile(filename, JSON.stringify(report, null, 2), 'utf8');
    console.log(`审核报告已保存到: ${filename}`);
    
    // 生成易读的MD版本
    const mdFilename = filename.replace('.json', '.md');
    const mdContent = this.generateMarkdownReport(report);
    await fs.writeFile(mdFilename, mdContent, 'utf8');
    console.log(`审核报告(MD版)已保存到: ${mdFilename}`);
  }

  /**
   * 生成Markdown格式的报告
   */
  generateMarkdownReport(report) {
    let md = `# 内容审核报告\n\n`;
    md += `**生成时间**: ${moment(report.summary.timestamp).format('YYYY年MM月DD日 HH:mm:ss')}\n\n`;
    
    md += `## 摘要\n\n`;
    md += `- **总项目数**: ${report.summary.totalItems}\n`;
    md += `- **标记项目数**: ${report.summary.flaggedItems}\n`;
    md += `- **标记率**: ${report.summary.flagRate}%\n\n`;
    
    md += `## 分类统计\n\n`;
    Object.entries(report.categoryBreakdown).forEach(([category, count]) => {
      md += `- **${category}**: ${count} 项\n`;
    });
    
    md += `\n## 详细结果\n\n`;
    report.details.forEach((detail, index) => {
      if (detail.flagged) {
        md += `${index + 1}. **标记** - 类别: ${detail.categories.join(', ')} | 严重性: ${detail.severity} | 置信度: ${(detail.confidence * 100).toFixed(1)}%\n`;
      }
    });
    
    md += `\n---\nGenerated by [AI Content Moderator](https://github.com/JMOKSZ/ai-content-moderator)\n`;
    
    return md;
  }

  /**
   * 启动API服务
   */
  async startApiService(port = 3000) {
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // 单条内容审核接口
    app.post('/moderate', async (req, res) => {
      try {
        const { text } = req.body;
        
        if (!text) {
          return res.status(400).json({ error: '缺少text参数' });
        }
        
        const result = await this.moderateContent(text);
        
        res.json({
          success: true,
          result: result,
          originalText: text.substring(0, 100) + '...'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // 批量审核接口
    app.post('/moderate/batch', async (req, res) => {
      try {
        const { texts } = req.body;
        
        if (!texts || !Array.isArray(texts)) {
          return res.status(400).json({ error: '缺少texts数组参数' });
        }
        
        const results = await this.moderateBatch(texts);
        const report = await this.generateReport(results);
        
        res.json({
          success: true,
          results: results,
          report: report
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // 获取审核历史
    app.get('/history', (req, res) => {
      res.json({
        success: true,
        history: this.moderationHistory.slice(-50) // 只返回最近50条
      });
    });

    app.listen(port, () => {
      console.log(`AI内容审核服务已启动，监听端口 ${port}`);
      console.log(`API端点:`);
      console.log(`  POST /moderate - 审核单条内容`);
      console.log(`  POST /moderate/batch - 批量审核`);
      console.log(`  GET /history - 获取审核历史`);
    });
  }
}

// 如果直接运行此文件
if (require.main === module) {
  const args = process.argv.slice(2);
  const moderator = new ContentModerator();
  
  // 解析命令行参数
  const textIndex = args.indexOf('--text');
  const fileIndex = args.indexOf('--file');
  const dirIndex = args.indexOf('--dir');
  const apiIndex = args.indexOf('--api');
  const portIndex = args.indexOf('--port');
  
  (async () => {
    try {
      if (apiIndex !== -1) {
        // 启动API服务
        const port = portIndex !== -1 ? parseInt(args[portIndex + 1]) || 3000 : 3000;
        await moderator.startApiService(port);
      } else if (textIndex !== -1) {
        // 审核单条文本
        const text = args[textIndex + 1];
        const result = await moderator.moderateContent(text);
        
        console.log('审核结果:');
        console.log(JSON.stringify(result, null, 2));
      } else if (fileIndex !== -1) {
        // 审核文件
        const filePath = args[fileIndex + 1];
        const results = await moderator.moderateFile(filePath);
        const report = await moderator.generateReport(results);
        await moderator.saveReport(report);
        
        console.log('文件审核完成！');
      } else if (dirIndex !== -1) {
        // 审核目录
        const dirPath = args[dirIndex + 1];
        const results = await moderator.moderateDirectory(dirPath);
        
        // 合并所有结果
        const allResults = results.flatMap(r => r.results);
        const report = await moderator.generateReport(allResults);
        await moderator.saveReport(report);
        
        console.log('目录审核完成！');
      } else {
        // 显示帮助信息
        console.log('AI内容审核工具');
        console.log('');
        console.log('使用方法:');
        console.log('  node index.js --text "需要审核的内容"');
        console.log('  node index.js --file ./content.txt');
        console.log('  node index.js --dir ./content_folder');
        console.log('  node index.js --api [--port 3000]');
        console.log('');
      }
    } catch (error) {
      console.error('执行过程中出错:', error);
    }
  })();
}

module.exports = ContentModerator;