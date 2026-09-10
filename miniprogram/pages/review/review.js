const core = require('../../utils/core.js');
const store = require('../../utils/store.js');

Page({
  data: {
    started: false,
    dueCount: 0, subjects: [], weakKps: [],
    queue: [], idx: 0, sourceLabel: '',
    q: null, opts: null, isJudge: false, needTextarea: false,
    answer: '', answered: null, showAns: false, finished: false
  },
  onShow() {
    // 读取首页「开始复习」入口的跳转意图（Tab 页需通过 storage 传参）
    const go = wx.getStorageSync('ct_review_go');
    if (go) wx.removeStorageSync('ct_review_go');
    // 上一轮已结束：切回 Tab 时回到「选择复习来源」界面，而不是停在完成页
    if (this.data.finished) {
      this.setData({ started: false, finished: false, q: null, queue: [], idx: 0, answered: null, showAns: false });
    }
    const qs = store.listQuestions();
    const today = core.todayStr();
    const due = qs.filter(q => !q.mastered && q.nextReviewAt && q.nextReviewAt <= today);
    const weakKps = {};
    qs.forEach(q => (q.knowledge || []).forEach(k => { weakKps[k] = (weakKps[k] || 0) + (q.errorCount || 1); }));
    this.setData({
      dueCount: due.length,
      dueIds: due.map(q => q.id),
      subjects: core.SUBJECT_KEYS.map(k => {
        const list = qs.filter(q => q.subject === k && !q.mastered)
          .sort((a, b) => String(a.nextReviewAt || '').localeCompare(String(b.nextReviewAt || ''))).slice(0, 20);
        return { key: k, name: core.SUBJECTS[k].name, count: list.length, ids: list.map(q => q.id) };
      }),
      weakKps: Object.keys(weakKps).map(k => ({ kp: k, n: weakKps[k] })).sort((a, b) => b.n - a.n).slice(0, 5)
    });
    // 首页点「开始复习」：强制开始今日到期复习（覆盖旧会话）
    if (go === 'due') this.start(this.data.dueIds, '今日到期');
  },
  // 复习中切走再切回：保留进度；如需重新选择来源，可长按页面标题返回（或完成本轮）
  exitSession() {
    this.setData({ started: false, finished: false, q: null, queue: [], idx: 0, answered: null, showAns: false });
  },
  startDue() { this.start(this.data.dueIds, '今日到期'); },
  startSub(e) {
    const i = this.data.subjects[e.currentTarget.dataset.idx];
    if (!i.count) { wx.showToast({ title: i.name + '暂无可复习的错题', icon: 'none' }); return; }
    this.start(i.ids, i.name);
  },
  startKp(e) {
    const kp = e.currentTarget.dataset.kp;
    const ids = store.listQuestions().filter(q => (q.knowledge || []).includes(kp) && !q.mastered).slice(0, 20).map(q => q.id);
    this.start(ids, '知识点：' + kp);
  },
  start(ids, label) {
    if (!ids || !ids.length) { wx.showToast({ title: '暂无可复习的错题', icon: 'none' }); return; }
    this.setData({ started: true, queue: ids, idx: 0, sourceLabel: label, finished: false });
    this.loadCard();
  },
  loadCard() {
    if (this.data.idx >= this.data.queue.length) {
      this.setData({ finished: true, q: null }); return;
    }
    const q = store.getQuestion(this.data.queue[this.data.idx]);
    if (!q) { this.setData({ idx: this.data.idx + 1 }); this.loadCard(); return; }
    let opts = null, isJudge = false, needTextarea = false;
    if ((q.options || []).length) opts = q.options;
    else if (q.type === '选择题') opts = [{ key: 'A', text: '' }, { key: 'B', text: '' }, { key: 'C', text: '' }, { key: 'D', text: '' }];
    else if (q.type === '判断题') isJudge = true;
    else needTextarea = true;
    this.setData({ q, opts, isJudge, needTextarea, answer: '', answered: null, showAns: false });
  },
  pickOpt(e) {
    if (this.data.answered) return;
    this.setData({ answer: e.currentTarget.dataset.opt });
  },
  onAnswer(e) { this.setData({ answer: e.detail.value }); },
  submit() {
    if (this.data.answered) return;
    if (!this.data.answer || !this.data.answer.trim()) {
      wx.showToast({ title: '请先作答，或点「看答案/解析」直接学习', icon: 'none' }); return;
    }
    const q = this.data.q;
    const grade = core.gradeItem({ ...q, studentAnswer: this.data.answer });
    const t = Date.now();
    q.lastReviewAt = t; q.updatedAt = t;
    q.history = q.history || [];
    q.history.push({ time: t, studentAnswer: this.data.answer, result: grade.result, note: '复习' });
    store.addAttempt(q.subject, q.id, grade.result);
    let note;
    if (grade.result === 'correct') {
      q.stage = (q.stage || 0) + 1;
      if (q.stage >= core.STAGES.length) { q.mastered = true; q.nextReviewAt = null; note = '🎉 恭喜！已完成全部复习周期，标记为已掌握'; }
      else { q.nextReviewAt = core.addDays(core.todayStr(), core.STAGES[q.stage]); note = '答对了！下次复习：' + q.nextReviewAt + '（' + core.STAGES[q.stage] + '天后）'; }
      if (q.status === 'pending' && q.standardAnswer) q.status = 'normal';
    } else if (grade.result === 'wrong') {
      q.errorCount = (q.errorCount || 1) + 1;
      q.mastered = false; q.stage = Math.max(q.stage || 0, 1); q.nextReviewAt = core.todayStr();
      note = '答错了，这道题今天还需要再看一遍';
    } else if (grade.result === 'partial') {
      q.stage = Math.max(q.stage || 0, 1); q.nextReviewAt = core.todayStr(); q.mastered = false;
      note = '部分正确，建议结合解析再复习一次';
    } else {
      q.nextReviewAt = core.addDays(core.todayStr(), 1);
      note = '暂无法自动判断（缺少标准答案），可到详情页补充后重新批改';
    }
    store.putQuestion(q);
    store.recordActivity();
    this.setData({ answered: { ...grade, note }, q });
  },
  showAnswer() { this.setData({ showAns: true }); },
  next() { this.setData({ idx: this.data.idx + 1 }); this.loadCard(); },
  markMastered() {
    const q = this.data.q;
    q.mastered = true; q.nextReviewAt = null; q.updatedAt = Date.now();
    q.history = q.history || [];
    q.history.push({ time: Date.now(), result: 'correct', note: '复习中标记掌握' });
    store.putQuestion(q);
    wx.showToast({ title: '已标记掌握 👍', icon: 'success' });
    this.next();
  },
  markAgain() {
    const q = this.data.q;
    q.mastered = false; q.stage = 0; q.nextReviewAt = core.todayStr(); q.updatedAt = Date.now();
    store.putQuestion(q);
    wx.showToast({ title: '已安排今日再复习', icon: 'none' });
    this.next();
  },
  backHome() { wx.switchTab({ url: '/pages/dashboard/dashboard' }); },
  onShareAppMessage() {
    return { title: '错题管家 · 家庭错题管理', path: '/pages/dashboard/dashboard' };
  }
});
