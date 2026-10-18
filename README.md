# 龙氏集团单词训练室 · Vocab Lab

给同学用的英文单词背记网站，参考 [vocab-test](https://hunggy.github.io/vocab-test/) 的交互方式，做成了可**按单元切换**的版本。

目前内置 **Unit 14 · 54 个生词**（来自你提供的 Word 文档），每个词都补了英文例句和中文翻译。

- **在线使用**：<https://zixpeak.github.io/vocab-lab/>
- **GitHub 仓库**：<https://github.com/zixpeak/vocab-lab>

## 快速开始

```bash
# 在 vocab-lab 目录下
python -m http.server 8000
```

浏览器打开 <http://localhost:8000>。

也可以直接双击 `index.html`，但推荐用本地服务器打开，浏览器发音和本地存储会更稳定。

## 功能

- **单元分层**：顶部单元条切换 Unit；只有一个单元时不会显示「全部单元」，导入第二个单元后自动出现。
- **四种题型**：英文 → 中文、中文 → 英文、句子填空、🔊 听音拼写。
- **范围筛选**：全部、前一半、后一半、只复习错题、只复习难词、翻卡自测。
- **答完自评**：✓ 记住了 / ✗ 还没记住，分别更新掌握状态和错题本。
- **错题本**：按单元分组，统计错误次数，可一键复习或移出错题。
- **难词 / 斩词**：⭐ 标记难词；🔪 暂时隐藏不想练的词，可在单词表中恢复。
- **单词表**：搜索英文 / 中文 / 近义词，查看全部例句，标记难词、发音、斩词/恢复。
- **速通模式**：按当前范围连续刷题，答完自动下一题，结束时给出正确率和用时。
- **翻卡自测**：3D 翻卡，先翻面看释义，再自评记住/没记住。
- **学习设置**：深色模式、字号缩放、自动发音、音效、答题时隐藏例句。
- **数据备份**：导出/导入 JSON 备份，导出当前单元 CSV。
- **本地存储**：进度只保存在当前浏览器，不会上传服务器。

> 英文 → 中文题会把单词和 synonym 一起显示在题面上，方便通过近义词推理；中文 → 英文和句子填空不显示 synonym，避免直接泄露答案。

## 添加新单元

### 方式一：网页内导入（推荐给日常使用）

点顶部「＋ 导入单元」，粘贴单词后导入。导入的单元保存在当前浏览器的 localStorage 中，换设备不会自动同步。

支持的格式：

```text
# 1. CSV（第一行可写表头，也可省略）
word,pos,synonym,中文,例句,例句翻译
simultaneously,adv.,together,同时地,The two events happened simultaneously.,这两个事件同时发生了。

# 2. 最简格式：英文,中文
simultaneously,同时地

# 3. 你文档里的格式
simultaneously (adv.)｜synonym: together/at the same time｜中文：同时地

# 4. Tab 分隔（与 CSV 列顺序相同）
simultaneously	adv.	together	同时地	The two events happened simultaneously.	这两个事件同时发生了。
```

- 最少需要英文和中文两列。
- 例句可以留空；没有例句的词不会出现在「句子填空」里。
- 如果第一行是表头，程序会自动识别列名。

### 方式二：写进代码（推荐发给同学）

打开 `data/units.js`，复制一个单元对象：

```js
{
  id: "unit15",
  title: "Unit 15",
  subtitle: "54 个生词",
  words: [
    {
      word: "example",
      pos: "n.",
      syn: "instance",
      ch: "例子",
      ex: "This is a simple example.",
      exCn: "这是一个简单的例子。"
    }
  ]
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `word` | 英文单词或短语（必填） |
| `pos` | 词性，如 `n.` / `v.` / `adj.` / `phr.` |
| `syn` | 近义词 / 同义解释 |
| `ch` | 中文释义（必填） |
| `ex` | 英文例句 |
| `exCn` | 例句翻译 |
| `blank` | 句子填空要挖空的文本；默认自动取 `word` 并去掉括号内容 |
| `alts` | 听音拼写时额外接受的答案数组，例如 `["wave of"]` |

内置单元会随网站一起发布，所有同学都能看到；网页里导入的单元只存在自己的浏览器里。

## 部署到 GitHub Pages

1. 把 `vocab-lab` 目录里的文件推到 GitHub 仓库。
2. 仓库 **Settings → Pages → Build and deployment**。
3. Source 选 **Deploy from a branch**，Branch 选 `main`，目录选 `/ (root)`。
4. 保存后访问 `https://<你的用户名>.github.io/<仓库名>/`。

网站是纯静态的，不需要构建、不需要后端。

## 目录结构

```text
vocab-lab/
├── index.html      页面结构
├── style.css       样式（含深色模式、响应式）
├── app.js          全部交互逻辑
├── data/
│   └── units.js    内置词库（Unit 14）
└── README.md
```

## 快捷键

| 按键 | 作用 |
| --- | --- |
| `1`–`4` | 选择选项 |
| `Enter` / `Space` | 下一题 |
| `S` | 朗读当前单词 |
| `H` | 标记 / 取消难词 |
| `Space` | 翻卡模式下翻面 |
| `1` / `2` | 翻卡模式下「没记住 / 记住了」 |
| `/` | 单词表中聚焦搜索框 |
| `Esc` | 关闭弹窗 / 返回练习 |

## 数据与隐私

- 所有学习记录、自定义单元都保存在浏览器 `localStorage`。
- 清除浏览器数据会丢失进度；建议定期在设置里「导出备份」。
- 网站没有后端，不会上传任何内容。

## 备注

- Unit 14 的单词、词性、synonym、中文释义来自提供的 Word 文档；例句和翻译为教学用途补充。
- 浏览器发音使用系统自带的 `speechSynthesis`，可用音色取决于操作系统。
- 页面交互参考了 [hunggy/vocab-test](https://hunggy.github.io/vocab-test/)。
