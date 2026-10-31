/* 摇卦 → 卦象 → 解卦 → 追问循环(FR-02/03/04/05) */
const hexagram = require("../../utils/hexagram");
const api = require("../../utils/api");

const app = getApp();
const POSITIONS = ["初爻", "二爻", "三爻", "四爻", "五爻", "上爻"];
const COMBINATIONS = ["三个字", "两字一背", "两背一字", "三个背"];
const MAX_FOLLOWUPS = 3;
const INTERPRET_TIMEOUT = 75000;

Page({
  data: {
    question: "",
    kicker: "静心凝神",
    hint: "轻点铜钱，摇出初爻",
    progressText: "0 / 6 爻",
    castStatus: "三枚铜钱同摇成爻。",
    coinFaces: ["front", "front", "front"],
    shaking: false,
    linesCount: 0,
    canCast: true,
    complete: false,
    displayRows: [],
    primary: null,
    changed: null,
    changeNote: "",
    primaryGuaCi: "",
    changedGuaCi: "",
    interpretHint: "六爻齐备后，即可解卦",
    readingBusy: false,
    readingState: "",
    readingText: "",
    readingError: "",
    followupVisible: false,
    followupClosed: false,
    followupRemaining: MAX_FOLLOWUPS,
    followupInput: "",
    followupCount: 0,
    followupCountOver: false,
    followupBusy: false,
    followupError: ""
  },

  onLoad() {
    const draft = app.globalData.draft;
    if (!draft || !draft.question) {
      wx.navigateBack();
      return;
    }
    this.setData({ question: draft.question });
    this.lines = [];          // 六爻(自下而上)
    this.followupsUsed = 0;
    this.followupHistory = [];
    this.interpretation = null;
  },

  buzz(type) {
    try { wx.vibrateShort({ type: type || "light" }); } catch (error) { /* 忽略 */ }
  },

  onCoinTap() {
    if (this.data.shaking || this.data.complete) return;
    const index = this.lines.length;
    this.setData({
      shaking: true,
      kicker: "第" + ["一", "二", "三", "四", "五", "六"][index] + "摇 · " + POSITIONS[index],
      hint: "三钱翻转，静候落定",
      castStatus: "正在摇出" + POSITIONS[index] + "…"
    });
    this.buzz();
    let flips = 0;
    this._flipTimer = setInterval(() => {
      flips += 1;
      this.setData({
        coinFaces: this.data.coinFaces.map((_, i) => ((flips + i) % 2 ? "back" : "front"))
      });
    }, 110);
    // 摇 650ms 后落定
    this._settleTimer = setTimeout(() => {
      clearInterval(this._flipTimer);
      const line = hexagram.castLine();
      this.lines.push(line);
      this.setData({
        coinFaces: line.coins,
        shaking: false,
        linesCount: this.lines.length,
        progressText: this.lines.length + " / 6 爻"
      });
      this.buzz();
      this.renderRow(index, line);
      if (this.lines.length === 6) {
        this.finishCast();
      } else {
        this.setData({
          kicker: "第" + ["一", "二", "三", "四", "五", "六"][index] + "摇 · " + POSITIONS[index],
          hint: "再点铜钱，摇出" + POSITIONS[index + 1],
          castStatus: POSITIONS[index] + "已定 · " + COMBINATIONS[line.backCount] + " · " + line.name + (line.moving ? "动爻" : "静爻")
        });
      }
    }, 650);
  },

  renderRow(index, line) {
    // 显示顺序:上爻在最上 → 每次从头部插入
    const row = {
      position: POSITIONS[index],
      combination: COMBINATIONS[line.backCount],
      name: line.name,
      yang: line.yang,
      moving: line.moving
    };
    this.setData({ displayRows: [row].concat(this.data.displayRows) });
  },

  finishCast() {
    const primary = hexagram.describeHexagram(this.lines);
    const changed = hexagram.describeHexagram(hexagram.changeLines(this.lines));
    const moving = this.lines.map((line, index) => line.moving ? POSITIONS[index] : null).filter(Boolean);
    this.primaryLines = this.lines.map(line => ({ yang: line.yang, moving: line.moving }));
    this.setData({
      complete: true,
      canCast: false,
      primary: primary,
      changed: changed,
      changeNote: moving.length
        ? moving.join("、") + "为动爻，阴阳互换，得此变卦。"
        : "此卦六爻皆静，阴阳不变，本卦与变卦相同。",
      kicker: "六爻已成 · 静观其变",
      hint: "点击下方「解卦」",
      castStatus: "六爻已成 · " + (moving.length ? moving.length + " 个动爻" : "六爻皆静"),
      interpretHint: "六爻已成，点击解卦观象"
    });
    this.buzz("heavy");
  },

  onInterpret() {
    if (!this.data.complete || this.data.readingBusy) return;
    this.setData({
      readingBusy: true,
      readingState: "解读中",
      readingError: "",
      interpretHint: "正在结合所问与卦象解读，请稍候"
    });
    const payload = {
      question: this.data.question,
      lines: this.lines.map(line => ({ coins: line.coins.slice() }))
    };
    api.interpret(payload)
      .then(data => {
        const answer = typeof data.interpretation === "string" ? data.interpretation.trim() : "";
        if (!answer) throw new Error("暂未收到完整解读，请稍后重试。");
        this.interpretation = answer;
        this.applyClassics(data.classics);
        this.setData({
          readingBusy: false,
          readingState: "解读完成",
          readingText: answer,
          interpretHint: "解读已完成，可再次查看"
        });
        this.updateFollowupPanel();
      })
      .catch(error => {
        this.setData({
          readingBusy: false,
          readingState: "暂未完成",
          readingError: error.message || "解卦暂未完成，请重试。",
          interpretHint: "解读暂未完成，可以重试"
        });
      });
  },

  applyClassics(classics) {
    const safe = classics || {};
    this.setData({
      primaryGuaCi: (safe.primary && safe.primary.guaCi) || "",
      changedGuaCi: (safe.changed && safe.changed.guaCi) || ""
    });
  },

  onFollowupInput(event) {
    const value = event.detail.value || "";
    const count = Array.from(value.trim()).length;
    this.setData({
      followupInput: value,
      followupCount: count,
      followupCountOver: count >= 200,
      followupError: ""
    });
  },

  onFollowupSubmit() {
    const question = (this.data.followupInput || "").trim();
    if (this.data.followupBusy || this.followupsUsed >= MAX_FOLLOWUPS) return;
    if (!question) {
      this.setData({ followupError: "追问内容未落笔，先写下你想问的。" });
      return;
    }
    if (!this.interpretation) return;
    this.setData({ followupBusy: true, followupError: "" });
    const payload = {
      question: this.data.question,
      lines: this.lines.map(line => ({ coins: line.coins.slice() })),
      followup: {
        index: this.followupsUsed + 1,
        question: question,
        history: this.followupHistory.slice()
      }
    };
    api.interpret(payload)
      .then(data => {
        const answer = typeof data.interpretation === "string" ? data.interpretation.trim() : "";
        if (!answer) throw new Error("暂未收到完整解读，请稍后重试。");
        this.followupsUsed += 1;
        this.followupHistory.push({ question: question, answer: answer });
        this.applyClassics(data.classics);
        this.setData({
          followupBusy: false,
          followupInput: "",
          followupCount: 0,
          followupCountOver: false,
          readingText: "【追问" + this.followupsUsed + "】" + question + "\n\n" + answer,
          readingState: "追问解读完成"
        });
        this.updateFollowupPanel();
      })
      .catch(error => {
        this.setData({
          followupBusy: false,
          followupError: error.message || "追问暂未完成，请重试。"
        });
      });
  },

  updateFollowupPanel() {
    if (!this.interpretation) {
      this.setData({ followupVisible: false, followupClosed: false });
      return;
    }
    const remaining = MAX_FOLLOWUPS - this.followupsUsed;
    if (remaining <= 0) {
      this.setData({ followupVisible: false, followupClosed: true, followupRemaining: 0 });
    } else {
      this.setData({ followupVisible: true, followupClosed: false, followupRemaining: remaining });
    }
  },

  onUnload() {
    if (this._flipTimer) clearInterval(this._flipTimer);
    if (this._settleTimer) clearTimeout(this._settleTimer);
  },

  onShareAppMessage() {
    return { title: "问玄 · 心有惑，一卦问玄", path: "/pages/ask/index" };
  }
});
