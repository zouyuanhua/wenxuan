/* 问事台(FR-01 / SRS 附录A) */
const askData = require("../../utils/ask-data");

const app = getApp();
const MAX_LENGTH = 200;
const MIN_LENGTH = 5;

Page({
  data: {
    atmosphere: askData.COPY.atmosphereFallback,
    categories: [],
    selectedIndex: -1,
    tagline: "",
    taglineVisible: false,
    subs: [],
    selectedSub: -1,
    question: "",
    count: 0,
    countOver: false,
    canConfirm: false,
    hasError: false,
    helpText: askData.COPY.defaultHelp,
    locked: false,
    burning: false,
    disclaimerOpen: false
  },

  onLoad() {
    this.setData({
      categories: askData.CATEGORIES,
      atmosphere: askData.atmosphereText(new Date())
    });
  },

  buzz(pattern) {
    try { wx.vibrateShort({ type: pattern || "light" }); } catch (error) { /* 设备不支持则忽略 */ }
  },

  onSelectCategory(event) {
    if (this.data.locked) return;
    const index = Number(event.currentTarget.dataset.index);
    const category = this.data.categories[index];
    if (!category) return;
    const switched = this.data.selectedIndex !== -1 && this.data.selectedIndex !== index;
    const subs = category.subs.map(sub => sub.name);
    if (category.subs.length === 0) subs.push(askData.COPY.freeAsk);
    this.setData({
      selectedIndex: index,
      selectedSub: -1,
      tagline: category.tagline,
      taglineVisible: false,
      subs: subs,
      question: switched ? "" : this.data.question
    });
    // 重新触发签语浮入动画
    this.setData({ taglineVisible: true });
    this.buzz();
    if (switched) {
      this.setData({ helpText: askData.COPY.switchCategory });
    }
    this.refreshValidity();
  },

  onSelectSub(event) {
    if (this.data.locked) return;
    const index = Number(event.currentTarget.dataset.index);
    const category = this.data.categories[this.data.selectedIndex];
    if (!category) return;
    const question = index < category.subs.length ? category.subs[index].tpl : "";
    this.setData({ question: question, selectedSub: index });
    this.buzz();
    this.refreshValidity();
  },

  onQuestionInput(event) {
    const value = event.detail.value || "";
    const count = Array.from(value.trim()).length;
    this.setData({
      question: value,
      count: count,
      countOver: count >= MAX_LENGTH,
      hasError: false,
      helpText: askData.COPY.defaultHelp
    });
    this.refreshValidity();
  },

  refreshValidity() {
    const count = Array.from(this.data.question.trim()).length;
    const valid = this.data.selectedIndex !== -1 && count >= MIN_LENGTH && count <= MAX_LENGTH;
    this.setData({
      canConfirm: valid && !this.data.locked,
      helpText: valid ? askData.COPY.validHelp : this.data.helpText,
      hasError: valid ? false : this.data.hasError
    });
  },

  failAsk(message) {
    this.setData({ hasError: true, helpText: message });
    this.buzz("heavy");
  },

  onConfirm() {
    if (this.data.locked || this.data.burning) return;
    const question = this.data.question.trim();
    const count = Array.from(question).length;
    if (this.data.selectedIndex === -1) { this.failAsk(askData.COPY.noCategory); return; }
    if (!question) { this.failAsk(askData.COPY.emptyQuestion); return; }
    if (count < MIN_LENGTH) { this.failAsk(askData.COPY.tooShort); return; }
    if (count > MAX_LENGTH) { this.failAsk(askData.COPY.tooLong); return; }
    const category = this.data.categories[this.data.selectedIndex];
    app.globalData.draft = {
      question: question,
      categoryId: category.id,
      categoryName: category.name
    };
    this.setData({ locked: true, burning: true });
    this.buzz("heavy");
    // 焚化 1.2s(轻触可跳过)后进入摇卦页
    this._burnTimer = setTimeout(() => this.goCast(), 1250);
  },

  onBurnSkip() { this.goCast(); },

  goCast() {
    if (!this.data.burning) return;
    this.setData({ burning: false });
    if (this._burnTimer) { clearTimeout(this._burnTimer); this._burnTimer = null; }
    wx.navigateTo({ url: "/pages/cast/index" });
  },

  onToggleDisclaimer() {
    this.setData({ disclaimerOpen: !this.data.disclaimerOpen });
  },

  onUnload() {
    if (this._burnTimer) clearTimeout(this._burnTimer);
  }
});
