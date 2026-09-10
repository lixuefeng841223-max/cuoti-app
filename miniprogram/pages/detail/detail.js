const core = require('../../utils/core.js');
const store = require('../../utils/store.js');

Page({
  data: {
    q: null, id: '',
    types: core.QTYPES, diffs: core.DIFFS,
    editing: false, edit: {},
    redoMode: false, redoAnswer: '', redoResult: null,
    historyTail: [], typeIdx: 0, diffIdx: 1
  },
  onLoad(options) {
    this.setData({ id: options.id || '' });
  },
  // onShow 在预览图片/从下层页面返回时也会触发；
  // 编辑或重做进行中不要整体刷新，否则表单内容会被冲掉
  onShow() {
    if (!this.data.editing && !this.data.redoMode) this.refresh();
  },
  // 页面栈只有 1 层时（分享/直达进入）navigateBack 无效，退回错题集 Tab
  backOrHome() {
    if (getCurrentPages().length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/library/library' });
  },
  refresh() {
    const q = store.getQuestion(this.data.id);
    if (!q) { wx.showToast({ title: '错题不存在', icon: 'none' }); setTimeout(() => this.backOrHome(), 600); return; }
    this.setData({
      q: { ...q, lastReviewAtTxt: q.lastReviewAt ? core.fmtDate(q.lastReviewAt) : '' },
      historyTail: (q.history || []).slice(-6).map(h => ({ ...h, timeTxt: core.fmtDT(h.time),
        resultTxt: core.RESULT_TXT[h.result] || h.result })),
      typeIdx: Math.max(0, core.QTYPES.indexOf(q.type)),
      diffIdx: Math.max(0, core.DIFFS.indexOf(q.difficulty || '中等')),
      redoMode: false, redoAnswer: '', redoResult: null, editing: false
    });
  },
  previewImg(e) {
    wx.previewImage({ current: e.currentTarget.dataset.url, urls: this.data.q.images });
  },
  /* ---- 编辑 ---- */
  startEdit() {
    const q = this.data.q;
    this.setData({
      editing: true,
      edit: {
        content: q.content || '', studentAnswer: q.studentAnswer || '',
        standardAnswer: q.standardAnswer || '',
        knowledge: (q.knowledge || []).join('、'),
        keywords: (q.keywords || []).join('、'),
        analysis: q.analysis || ''
      }
    });
  },
  onEditField(e) {
    const f = e.currentTarget.dataset.f;
    this.setData({ ['edit.' + f]: e.detail.value });
  },
  onEditType(e) { this.setData({ typeIdx: e.detail.value }); },
  onEditDiff(e) { this.setData({ diffIdx: e.detail.value }); },
  cancelEdit() { this.setData({ editing: false }); },
  saveEdit() {
    const q = this.data.q, d = this.data.edit;
    q.content = d.content; q.studentAnswer = d.studentAnswer; q.standardAnswer = d.standardAnswer;
    q.type = core.QTYPES[this.data.typeIdx]; q.difficulty = core.DIFFS[this.data.diffIdx];
    q.knowledge = core.splitList(d.knowledge); q.keywords = core.splitList(d.keywords);
    q.analysis = d.analysis;
    q.options = core.extractOptions(q.content);
    q.updatedAt = Date.now();
    if (q.standardAnswer && q.status === 'pending') {
      const g = core.gradeItem(q);
      q.status = g.result === 'uncertain' ? 'pending' : 'normal';
      wx.showToast({ title: '重新批改：' + core.RESULT_TXT[g.result], icon: 'none' });
    }
    store.putQuestion(q);
    this.setData({ editing: false });
    this.refresh();
  },
  /* ---- 重新作答 ---- */
  toggleRedo() { this.setData({ redoMode: !this.data.redoMode, redoAnswer: '', redoResult: null }); },
  onRedoAnswer(e) { this.setData({ redoAnswer: e.detail.value }); },
  submitRedo() {
    const ans = this.data.redoAnswer;
    if (!ans.trim()) { wx.showToast({ title: '请先作答', icon: 'none' }); return; }
    const q = this.data.q;
    const grade = core.gradeItem({ ...q, studentAnswer: ans });
    const t = Date.now();
    q.lastReviewAt = t; q.updatedAt = t;
    q.history = q.history || [];
    q.history.push({ time: t, studentAnswer: ans, result: grade.result, note: '重新作答' });
    if (grade.result === 'correct') {
      q.stage = (q.stage || 0) + 1;
      if (q.stage >= core.STAGES.length) { q.mastered = true; q.nextReviewAt = null; }
      else q.nextReviewAt = core.addDays(core.todayStr(), core.STAGES[q.stage]);
    } else if (grade.result === 'wrong') {
      q.errorCount = (q.errorCount || 1) + 1;
      q.mastered = false; q.stage = Math.max(q.stage || 0, 1); q.nextReviewAt = core.todayStr();
    }
    store.putQuestion(q);
    store.addAttempt(q.subject, q.id, grade.result);
    store.recordActivity();
    // 手动刷新展示数据，但保留重新作答面板与结果
    const q2 = store.getQuestion(this.data.id);
    this.setData({
      q: { ...q2, lastReviewAtTxt: q2.lastReviewAt ? core.fmtDate(q2.lastReviewAt) : '' },
      historyTail: (q2.history || []).slice(-6).map(h => ({ ...h, timeTxt: core.fmtDT(h.time),
        resultTxt: core.RESULT_TXT[h.result] || h.result })),
      redoResult: { ...grade, resultTxt: core.RESULT_TXT[grade.result] }
    });
  },
  /* ---- 状态标记 ---- */
  markMastered() {
    const q = this.data.q;
    q.mastered = true; q.lastReviewAt = Date.now(); q.updatedAt = Date.now();
    q.history = q.history || [];
    q.history.push({ time: Date.now(), result: 'correct', note: '手动标记已掌握' });
    store.putQuestion(q); store.recordActivity();
    wx.showToast({ title: '已标记为掌握 👍', icon: 'success' });
    this.refresh();
  },
  markReview() {
    const q = this.data.q;
    q.mastered = false; q.stage = 0; q.nextReviewAt = core.todayStr(); q.lastReviewAt = Date.now();
    q.history = q.history || [];
    q.history.push({ time: Date.now(), result: 'wrong', note: '手动标记仍需复习' });
    store.putQuestion(q); store.recordActivity();
    wx.showToast({ title: '已安排今日复习', icon: 'none' });
    this.refresh();
  },
  /* ---- 类似题 ---- */
  genSimilar() {
    const sim = core.genSimilar(this.data.q);
    wx.showModal({
      title: '🎲 举一反三 · 类似题',
      content: sim.content + '\n\n——\n参考答案：' + sim.answer + '\n\n（' + (sim.tip || '') + '）',
      showCancel: false,
      confirmText: '再来一题',
      success: res => { if (res.confirm) this.genSimilar(); }
    });
  },
  delQuestion() {
    wx.showModal({
      title: '删除错题',
      content: '确定删除这道错题吗？删除后无法恢复。',
      confirmColor: '#e5484d',
      success: res => {
        if (res.confirm) {
          store.deleteQuestion(this.data.id);
          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => this.backOrHome(), 500);
        }
      }
    });
  },
  onShareAppMessage() {
    return { title: '错题管家 · 家庭错题管理', path: '/pages/dashboard/dashboard' };
  }
});
