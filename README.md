# AI Content Moderator

AI驱动的内容审核工具，自动检测和分类不当内容，适用于社交媒体、论坛、评论系统等场景。

## 功能特色

- 🤖 **AI驱动审核** - 使用先进的AI模型进行内容分析
- 🏷️ **多类别检测** - 支持仇恨言论、色情、暴力、垃圾信息等分类
- ⚡ **实时审核** - 快速处理大量内容
- 🎯 **自定义规则** - 支持自定义审核规则和阈值
- 📊 **分析报告** - 生成审核统计数据和报告
- 🔧 **灵活集成** - 易于集成到现有系统

## 安装

```bash
git clone https://github.com/JMOKSZ/ai-content-moderator.git
cd ai-content-moderator
npm install
```

## 使用

```bash
# 审核单条内容
node index.js --text "这里是需要审核的内容"

# 批量审核文件
node index.js --file ./content.txt

# 启动API服务
npm start

# 审核目录下的所有文件
node index.js --dir ./content_folder
```

## 配置

复制 `.env.example` 为 `.env` 并填入相应配置：

```bash
cp .env.example .env
```

## API支持

本工具支持以下AI模型：
- Azure OpenAI
- OpenAI GPT系列
- Anthropic Claude
- 以及其他兼容的API

## 贡献

欢迎提交Issue和Pull Request来帮助改进此项目。