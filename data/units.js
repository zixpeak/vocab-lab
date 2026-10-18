/*
 * 词库数据
 * ------------------------------------------------------------------
 * 想新增单元时，复制下面一个 { id, title, subtitle, words } 对象即可。
 * 每个单词的字段：
 *   word  英文单词 / 短语
 *   pos   词性（可留空）
 *   syn   近义词（可留空）
 *   ch    中文释义（必填）
 *   ex    英文例句（可留空；没有例句时该词不会出现在“句子填空”）
 *   exCn  例句翻译（可留空）
 *   blank 句子填空时要挖空的文本（默认自动取 word，去掉括号内容）
 *   alts  拼写时额外接受的答案（可选，数组）
 *
 * 也可以在网页里点「＋ 导入单元」直接导入，数据会保存在浏览器本地。
 */
window.VOCAB_UNITS = [
  {
    id: "unit14",
    title: "Unit 14",
    subtitle: "54 个生词",
    words: [
      {
        word: "simultaneously",
        pos: "adv.",
        syn: "together / at the same time",
        ch: "同时地",
        ex: "The two events happened simultaneously.",
        exCn: "这两个事件同时发生了。"
      },
      {
        word: "deviate",
        pos: "v.",
        syn: "differ",
        ch: "偏离",
        ex: "Try not to deviate from the original plan.",
        exCn: "尽量不要偏离原计划。"
      },
      {
        word: "freelance",
        pos: "adj.",
        syn: "self-employed",
        ch: "自由职业的",
        ex: "She works as a freelance designer.",
        exCn: "她是一名自由职业设计师。"
      },
      {
        word: "individuality",
        pos: "n.",
        syn: "character / personality",
        ch: "个性",
        ex: "School uniforms can limit students' individuality.",
        exCn: "校服可能限制学生的个性。"
      },
      {
        word: "generate",
        pos: "v.",
        syn: "make / produce",
        ch: "产生，创造",
        ex: "The new policy is expected to generate more jobs.",
        exCn: "新政策预计会创造更多就业机会。"
      },
      {
        word: "mortgage",
        pos: "n.",
        syn: "loan",
        ch: "按揭贷款",
        ex: "They took out a mortgage to buy their first home.",
        exCn: "他们办了按揭贷款买第一套房。"
      },
      {
        word: "supplement",
        pos: "v.",
        syn: "increase",
        ch: "补充",
        ex: "Many students supplement their income with part-time jobs.",
        exCn: "许多学生用兼职来补充收入。"
      },
      {
        word: "collaborate",
        pos: "v.",
        syn: "work together",
        ch: "合作",
        ex: "The two companies will collaborate on the project.",
        exCn: "这两家公司将在这个项目上合作。"
      },
      {
        word: "unpredictable",
        pos: "adj.",
        syn: "changeable / uncertain",
        ch: "难以预测的",
        ex: "The weather here is highly unpredictable.",
        exCn: "这里的天气非常难以预测。"
      },
      {
        word: "counterproductive",
        pos: "adj.",
        syn: "not useful",
        ch: "适得其反的",
        ex: "Working too many hours can be counterproductive.",
        exCn: "工作时间过长可能适得其反。"
      },
      {
        word: "carve out",
        pos: "phr.",
        syn: "create or obtain",
        ch: "开拓，闯出",
        ex: "She managed to carve out a career in journalism.",
        exCn: "她成功在新闻业闯出了一片天地。"
      },
      {
        word: "slash",
        pos: "n.",
        syn: "the symbol / used in writing to separate letters, numbers, or words",
        ch: "斜杠（符号）",
        ex: "Use a slash to separate the two dates.",
        exCn: "用斜杠分隔这两个日期。"
      },
      {
        word: "income stream",
        pos: "n.p.",
        syn: "a flow of money into a business",
        ch: "收入来源",
        ex: "Freelancers often need more than one income stream.",
        exCn: "自由职业者通常需要不止一个收入来源。"
      },
      {
        word: "coin",
        pos: "v.",
        syn: "invent / make",
        ch: "创造（新词）",
        ex: "The author likes to coin new terms in her books.",
        exCn: "这位作者喜欢在自己的书里创造新词。"
      },
      {
        word: "identity",
        pos: "n.",
        syn: "character",
        ch: "身份",
        ex: "Our jobs should not define our identity.",
        exCn: "工作不应定义我们的身份。"
      },
      {
        word: "infiltrate",
        pos: "v.",
        syn: "enter",
        ch: "渗透",
        ex: "The internet continues to infiltrate every part of our lives.",
        exCn: "互联网持续渗透到我们生活的每个方面。"
      },
      {
        word: "juggler",
        pos: "n.",
        syn: "a person who does multiple jobs",
        ch: "身兼数职者",
        ex: "As a working parent, she is a skilled juggler.",
        exCn: "作为职场父母，她擅长身兼数职。"
      },
      {
        word: "linear",
        pos: "adj.",
        syn: "regular",
        ch: "直线式的",
        ex: "Careers are no longer linear.",
        exCn: "职业道路不再是直线式的。"
      },
      {
        word: "elicit",
        pos: "v.",
        syn: "bring out / draw out",
        ch: "引出",
        ex: "The teacher tried to elicit answers from the shy students.",
        exCn: "老师试图引导害羞的学生回答问题。"
      },
      {
        word: "millennial",
        pos: "n.",
        syn: "a person born in the 1980s, 1990s, or early 2000s",
        ch: "千禧一代",
        ex: "A typical millennial may change jobs many times.",
        exCn: "典型的千禧一代可能会多次换工作。"
      },
      {
        word: "tendency",
        pos: "n.",
        syn: "an established pattern of behavior",
        ch: "倾向",
        ex: "He has a tendency to work late.",
        exCn: "他有加班的倾向。"
      },
      {
        word: "contribute to",
        pos: "phr.",
        syn: "bring benefit to",
        ch: "促成",
        ex: "Gig work can contribute to a sense of freedom.",
        exCn: "零工工作能促使人感到自由。"
      },
      {
        word: "a wave of",
        pos: "phr.",
        syn: "a lot of",
        ch: "一波，大量",
        ex: "A wave of new apps has changed how we work.",
        exCn: "一波新应用改变了我们的工作方式。",
        alts: ["wave of"]
      },
      {
        word: "(one's) cocktail of",
        pos: "phr.",
        syn: "combination of",
        ch: "一系列混合事物",
        ex: "Her career is a cocktail of different jobs.",
        exCn: "她的职业生涯是多种不同工作的混合。",
        blank: "cocktail of",
        alts: ["cocktail of", "one's cocktail of"]
      },
      {
        word: "vocation",
        pos: "n.",
        syn: "job / profession",
        ch: "职业",
        ex: "Nursing is more than a job; it is a vocation.",
        exCn: "护理不只是一份工作，更是一种职业使命。"
      },
      {
        word: "ennui",
        pos: "n.",
        syn: "boredom",
        ch: "倦怠，乏味",
        ex: "A boring routine can lead to ennui.",
        exCn: "无聊的日常会导致倦怠。"
      },
      {
        word: "in check",
        pos: "phr.",
        syn: "under control",
        ch: "处于受控状态",
        ex: "She keeps her stress in check by exercising.",
        exCn: "她通过运动来控制压力。"
      },
      {
        word: "stretch oneself thin",
        pos: "phr.",
        syn: "be really busy",
        ch: "超负荷工作、分身乏术",
        ex: "It is easy to stretch oneself thin when you take on too many tasks.",
        exCn: "承担太多任务时，人很容易分身乏术。",
        alts: ["stretch yourself thin"]
      },
      {
        word: "gig",
        pos: "n.",
        syn: "job",
        ch: "短期零工",
        ex: "He picked up a gig as a delivery driver.",
        exCn: "他找了一份外卖司机的零工。"
      },
      {
        word: "outlet",
        pos: "n.",
        syn: "release",
        ch: "抒发渠道",
        ex: "Painting is a creative outlet for her.",
        exCn: "绘画是她抒发创意的渠道。"
      },
      {
        word: "spiritual",
        pos: "adj.",
        syn: "nonmaterial",
        ch: "精神层面的",
        ex: "Travel can bring spiritual satisfaction.",
        exCn: "旅行能带来精神上的满足。"
      },
      {
        word: "go flat",
        pos: "phr.",
        syn: "deflate",
        ch: "失去活力；变瘪",
        ex: "Without new challenges, a career can go flat.",
        exCn: "没有新的挑战，职业生涯可能会失去活力。"
      },
      {
        word: "fulfilment",
        pos: "n.",
        syn: "achievement / realization",
        ch: "成就感，满足感",
        ex: "Many people find fulfilment in helping others.",
        exCn: "许多人在帮助他人中获得满足感。"
      },
      {
        word: "alternative",
        pos: "adj.",
        syn: "other",
        ch: "其他的，替代的",
        ex: "Freelancing is an alternative way to earn a living.",
        exCn: "自由职业是另一种谋生方式。"
      },
      {
        word: "incidence",
        pos: "n.",
        syn: "occurrence",
        ch: "发生率",
        ex: "The incidence of remote work has risen.",
        exCn: "远程工作的发生率上升了。"
      },
      {
        word: "parallel",
        pos: "adj.",
        syn: "duplicate",
        ch: "并行的",
        ex: "She pursued a parallel career in music.",
        exCn: "她同时发展了一段并行的音乐事业。"
      },
      {
        word: "eventually",
        pos: "adv.",
        syn: "finally",
        ch: "最终",
        ex: "He eventually found a job he loved.",
        exCn: "他最终找到了自己热爱的工作。"
      },
      {
        word: "omnipresent",
        pos: "adj.",
        syn: "everywhere",
        ch: "无处不在的",
        ex: "Smartphones are omnipresent in modern life.",
        exCn: "智能手机在现代生活中无处不在。"
      },
      {
        word: "virtual",
        pos: "adj.",
        syn: "computer-related",
        ch: "线上的，虚拟的",
        ex: "Many meetings are now held in virtual spaces.",
        exCn: "现在许多会议在虚拟空间举行。"
      },
      {
        word: "access",
        pos: "v.",
        syn: "obtain / receive",
        ch: "获取",
        ex: "We can access information anytime online.",
        exCn: "我们可以随时在线获取信息。"
      },
      {
        word: "conduct",
        pos: "v.",
        syn: "manage",
        ch: "开展，进行",
        ex: "The company will conduct a survey of its employees.",
        exCn: "公司将对员工开展一项调查。"
      },
      {
        word: "supplementary",
        pos: "adj.",
        syn: "additional",
        ch: "额外的，补充性的",
        ex: "She took a supplementary course in design.",
        exCn: "她修了一门补充性的设计课程。"
      },
      {
        word: "unequivocally",
        pos: "adv.",
        syn: "certainly",
        ch: "毫无疑问地",
        ex: "The results showed unequivocally that the plan worked.",
        exCn: "结果毫无疑问地表明计划奏效了。"
      },
      {
        word: "coherent",
        pos: "adj.",
        syn: "consistent",
        ch: "连贯完整的",
        ex: "She gave a coherent explanation of her plans.",
        exCn: "她对自己的计划作了连贯完整的解释。"
      },
      {
        word: "ironically",
        pos: "adv.",
        syn: "humorously",
        ch: "讽刺的是",
        ex: "Ironically, the app designed to save time made me busier.",
        exCn: "讽刺的是，这个本为节省时间而设计的应用让我更忙了。"
      },
      {
        word: "approach",
        pos: "n.",
        syn: "way",
        ch: "方式，做法",
        ex: "We need a different approach to this problem.",
        exCn: "我们需要用不同的方式处理这个问题。"
      },
      {
        word: "redundant",
        pos: "adj.",
        syn: "unnecessary",
        ch: "被裁员的；多余的",
        ex: "He was made redundant after the company restructured.",
        exCn: "公司重组后，他被裁员了。"
      },
      {
        word: "afloat",
        pos: "adj.",
        syn: "free of trouble, debt, etc., esp. with effort",
        ch: "维持生计，免于困境",
        ex: "Small businesses are struggling to stay afloat.",
        exCn: "小企业正努力维持生计。"
      },
      {
        word: "permanent",
        pos: "adj.",
        syn: "regular",
        ch: "固定的，长期的",
        ex: "She is looking for a permanent position.",
        exCn: "她正在找一份长期的工作。"
      },
      {
        word: "widespread",
        pos: "adj.",
        syn: "general / common",
        ch: "普遍的",
        ex: "Remote work has become widespread.",
        exCn: "远程工作已经变得普遍。"
      },
      {
        word: "phenomenon",
        pos: "n.",
        syn: "an observable fact or event",
        ch: "现象",
        ex: "The gig economy is a global phenomenon.",
        exCn: "零工经济是一种全球现象。"
      },
      {
        word: "drawback",
        pos: "n.",
        syn: "disadvantage",
        ch: "弊端，缺点",
        ex: "The main drawback of freelancing is instability.",
        exCn: "自由职业的主要弊端是不稳定。"
      },
      {
        word: "foreseeable",
        pos: "adj.",
        syn: "predictable",
        ch: "可预见的",
        ex: "The trend will continue for the foreseeable future.",
        exCn: "这一趋势在可预见的未来将持续。"
      },
      {
        word: "revolution",
        pos: "n.",
        syn: "drastic change",
        ch: "重大变革",
        ex: "The internet caused a revolution in the way we work.",
        exCn: "互联网引发了工作方式的重大变革。"
      }
    ]
  }
];
