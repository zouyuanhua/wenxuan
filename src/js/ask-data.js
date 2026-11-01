/*
 * 问事台数据与文案(FR-01 / SRS v0.2 附录A)。
 * 纯数据 + 氛围条文案生成,无逻辑依赖;修改文案请同步 SRS 附录A.4/A.5。
 */
(function (root) {
  "use strict";

  var COPY = {
    atmosphereFallback: "今日 · 宜静心问事",
    freeAsk: "自由来问",
    switchCategory: "再想想，换一事来问。请重新写下 5–200 字的心事。",
    emptyQuestion: "心事未落笔，如何起卦?",
    tooShort: "再多写几个字，卦才知道你在问什么",
    tooLong: "疏文太长了，心事宜简",
    lockedHelp: "诚心已备，疏文已焚，静候起卦。",
    burnKicker: "焚香静心 · 敬呈所问",
    burnHush: "静心凝神 · 敬候起卦",
    burnHushSkip: "静心片刻 · 轻触可跳过",
    burnSkip: "轻触任意处跳过",
    validHelp: "分类已定，疏文已备。",
    defaultHelp: "分类已选，写下 5–200 字的心事即可起卦。",
    noCategory: "先选上方分类，自由来问可选「其他」；心事需有 5–200 字。"
  };

  var CATEGORIES = [
    { id: "career", icon: "💼", name: "事业", tagline: "宦海沉浮，问一条前路", subs: [
      { name: "求职面试", tpl: "这个 offer 我能拿到吗?" },
      { name: "跳槽去留", tpl: "现在这份工作要不要换?" },
      { name: "晋升发展", tpl: "今年有机会升职吗?" },
      { name: "创业开店", tpl: "现在适合辞职创业吗?" },
      { name: "项目成败", tpl: "这个项目能不能顺利落地?" },
      { name: "职场去留", tpl: "我会有被裁员的风险吗?" }
    ] },
    { id: "love", icon: "❤️", name: "感情", tagline: "情之一字，最问不得，又最想问", subs: [
      { name: "单恋暗恋", tpl: "我该不该向 TA 表白?" },
      { name: "恋爱发展", tpl: "我们能走到结婚吗?" },
      { name: "挽回复合", tpl: "分手了还能复合吗?" },
      { name: "相亲缘分", tpl: "这次相亲的人合适吗?" },
      { name: "婚姻走向", tpl: "这段婚姻还能继续吗?" },
      { name: "暧昧关系", tpl: "TA 对我是真心的吗?" }
    ] },
    { id: "wealth", icon: "💰", name: "财运", tagline: "君子爱财，问取之有道", subs: [
      { name: "近期财运", tpl: "最近半年财运如何?" },
      { name: "生意盈亏", tpl: "这门生意能赚钱吗?" },
      { name: "投资参考", tpl: "这笔投入适合继续下去吗?" },
      { name: "借贷事宜", tpl: "借出去的钱能要回来吗?" },
      { name: "买卖交易", tpl: "这笔买卖现在适合成交吗?" }
    ] },
    { id: "study", icon: "📚", name: "学业", tagline: "十年寒窗，问一朝题名", subs: [
      { name: "考试成败", tpl: "这场考试能过吗?" },
      { name: "升学录取", tpl: "能考上心仪的学校吗?" },
      { name: "考证考编", tpl: "这次考编有希望吗?" },
      { name: "留学申请", tpl: "申请能顺利通过吗?" },
      { name: "论文答辩", tpl: "论文能顺利通过吗?" }
    ] },
    { id: "choice", icon: "🧭", name: "决策", tagline: "鱼与熊掌，一卦定心", subs: [
      { name: "二选一", tpl: "摆在我面前的两个选择，哪个更适合我?" },
      { name: "该不该做", tpl: "这件事我该不该去做?" },
      { name: "时机选择", tpl: "现在是行动的好时机吗?" },
      { name: "出行远行", tpl: "这次出行顺利吗?" },
      { name: "搬迁换城", tpl: "换个城市发展对我有利吗?" }
    ] },
    { id: "social", icon: "🤝", name: "人际", tagline: "人心隔肚皮，卦不隔", subs: [
      { name: "合伙合作", tpl: "和这个人合伙靠谱吗?" },
      { name: "是非小人", tpl: "我身边有小人是非吗?" },
      { name: "纠纷官司", tpl: "这场纠纷能顺利解决吗?" },
      { name: "请求求助", tpl: "托人办的这件事能成吗?" }
    ] },
    { id: "home", icon: "🏠", name: "家宅", tagline: "问一处安身立命之所", subs: [
      { name: "买房租房", tpl: "这套房子适合我吗?" },
      { name: "搬家乔迁", tpl: "这段时间搬家合适吗?" },
      { name: "装修动工", tpl: "装修什么时候动工好?" },
      { name: "宅运安顿", tpl: "入住新居之后运势如何?" }
    ] },
    { id: "lost", icon: "🔍", name: "寻人寻物", tagline: "失之物，失之人，皆有所归", subs: [
      { name: "寻物", tpl: "丢失的东西能找回来吗?" },
      { name: "寻宠物", tpl: "走失的宠物能回到我身边吗?" },
      { name: "失联联系", tpl: "失联的亲友能联系上吗?" }
    ] },
    { id: "other", icon: "✍️", name: "其他", tagline: "心有所惑，不拘一格", subs: [] }
  ];

  /* 2026 年二十四节气公历日期(误差 ±1 日,P0 氛围条够用) */
  var SOLAR_TERMS = [
    ["小寒", 1, 5], ["大寒", 1, 20], ["立春", 2, 4], ["雨水", 2, 18],
    ["惊蛰", 3, 5], ["春分", 3, 20], ["清明", 4, 5], ["谷雨", 4, 20],
    ["立夏", 5, 5], ["小满", 5, 21], ["芒种", 6, 5], ["夏至", 6, 21],
    ["小暑", 7, 7], ["大暑", 7, 22], ["立秋", 8, 7], ["处暑", 8, 23],
    ["白露", 9, 7], ["秋分", 9, 23], ["寒露", 10, 8], ["霜降", 10, 23],
    ["立冬", 11, 7], ["小雪", 11, 22], ["大雪", 12, 7], ["冬至", 12, 21]
  ];
  var TERM_BLESSING = {
    "小寒": "宜围炉静思", "大寒": "宜守心待春", "立春": "宜立志谋事", "雨水": "宜润物无声",
    "惊蛰": "宜闻机而动", "春分": "宜持衡问心", "清明": "宜慎思追远", "谷雨": "宜播种耕耘",
    "立夏": "宜从容生长", "小满": "宜小得盈满", "芒种": "宜忙而不乱", "夏至": "宜阳气正盛",
    "小暑": "宜心静自凉", "大暑": "宜沉心避燥", "立秋": "宜收心谋定", "处暑": "宜止燥安居",
    "白露": "宜澄心明察", "秋分": "宜平心持正", "寒露": "宜凝神内守", "霜降": "宜静心问事",
    "立冬": "宜藏锋蓄势", "小雪": "宜围炉煮问", "大雪": "宜厚积薄发", "冬至": "宜一阳来复"
  };
  var CN_DAYS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十",
    "十一", "十二", "十三", "十四", "十五"];

  function atmosphereText(now) {
    var current = null;
    var days = 0;
    for (var i = 0; i < SOLAR_TERMS.length; i++) {
      var termDate = new Date(now.getFullYear(), SOLAR_TERMS[i][1] - 1, SOLAR_TERMS[i][2]);
      if (termDate <= now) {
        current = SOLAR_TERMS[i];
        days = Math.floor((now - termDate) / 86400000);
      }
    }
    if (!current) return COPY.atmosphereFallback;
    var blessing = TERM_BLESSING[current[0]] || "宜静心问事";
    var lead = days === 0 ? current[0] + "今日" : current[0] + "后" + (CN_DAYS[days] || days) + "日";
    return lead + " · " + blessing;
  }

  root.AskData = { COPY: COPY, CATEGORIES: CATEGORIES, atmosphereText: atmosphereText };
})(typeof globalThis !== "undefined" ? globalThis : this);
