const core = require('../../utils/core.js');
const store = require('../../utils/store.js');

const MASTERY_OPTS = ['全部状态', '未掌握', '待复习', '已掌握'];
const ERR_OPTS = ['错误次数', '≥2次', '≥3次'];
const TIME_OPTS = ['全部时间', '近7天', '近30天'];

Page({
  data: {
    subjects: [], subject: 'math',
    types: ['全部题型'].concat(core.QTYPES),
    diffs: ['全部难度'].concat(core.DIFFS),
    masteryOpts: MASTERY_OPTS, errOpts: ERR_OPTS, timeOpts: TIME_OPTS,
    allKps: [],
    fType: 0, fDiff: 0, fKp: 0, fMastery: 0, fErr: 0, fTime: 0,
    onlyPending: false,
    list: [], today: ''
  },
  onLoad() {
    this.setData({ subjects: core.SUBJECT_KEYS.map(k => ({ key: k, name: core.SUBJECTS[k].name })) });
  },
  onShow() {
    // Tab 页只 onLoad 一次，首页带科目跳转的参数必须在 onShow 读取
    const saved = wx.getStorageSync('ct_lib_subject');
    if (saved && core.SUBJECTS[saved]) {
      this.setData({ subject: saved });
      wx.removeStorageSync('ct_lib_subject');
    }
    this.setData({ today: core.todayStr() });
    this.refresh();
  },
  refresh() {
    const qs = store.listQuestions();
    const allKps = ['全部知识点'].concat(Array.from(new Set(qs.reduce((a, q) => a.concat(q.knowledge || []), []))));
    if (this.data.fKp >= allKps.length) this.setData({ fKp: 0 });
    this.setData({ allKps });
    this.applyFilter(qs);
  },
  applyFilter(all) {
    const d = this.data;
    const f = {
      type: d.types[d.fType] === '全部题型' ? '' : d.types[d.fType],
      diff: d.diffs[d.fDiff] === '全部难度' ? '' : d.diffs[d.fDiff],
      kp: d.allKps[d.fKp] === '全部知识点' ? '' : d.allKps[d.fKp],
      mastery: d.fMastery === 0 ? '' : String(d.fMastery - 1),
      minErr: d.fErr === 0 ? '' : String(d.fErr + 1),
      days: d.fTime === 1 ? 7 : (d.fTime === 2 ? 30 : 0)
    };
    const today = core.todayStr();
    let list = (all || store.listQuestions()).filter(q => {
      if (d.subject && q.subject !== d.subject) return false;
      if (f.type && q.type !== f.type) return false;
      if (f.diff && (q.difficulty || '中等') !== f.diff) return false;
      if (f.kp && !(q.knowledge || []).includes(f.kp)) return false;
      if (f.mastery !== '' && String(q.mastered ? 2 : (q.stage > 0 ? 1 : 0)) !== f.mastery) return false;
      if (f.minErr && (q.errorCount || 1) < parseInt(f.minErr, 10)) return false;
      if (d.onlyPending && q.status !== 'pending') return false;
      if (f.days) {
        const from = core.addDays(today, -f.days);
        if (core.todayStr(q.firstWrongAt) < from) return false;
      }
      return true;
    });
    list.sort((a, b) => (b.firstWrongAt || 0) - (a.firstWrongAt || 0));
    list = list.map(q => ({ ...q, firstWrongAtTxt: core.fmtDate(q.firstWrongAt) }));
    const counts = {};
    (all || store.listQuestions()).forEach(q => { counts[q.subject] = (counts[q.subject] || 0) + 1; });
    this.setData({
      list,
      subjects: this.data.subjects.map(s => ({ ...s, count: counts[s.key] || 0 }))
    });
  },
  onSubject(e) {
    this.setData({ subject: e.currentTarget.dataset.sub });
    this.applyFilter();
  },
  onType(e) { this.setData({ fType: e.detail.value }); this.applyFilter(); },
  onDiff(e) { this.setData({ fDiff: e.detail.value }); this.applyFilter(); },
  onKp(e) { this.setData({ fKp: e.detail.value }); this.applyFilter(); },
  onMastery(e) { this.setData({ fMastery: e.detail.value }); this.applyFilter(); },
  onErr(e) { this.setData({ fErr: e.detail.value }); this.applyFilter(); },
  onTime(e) { this.setData({ fTime: e.detail.value }); this.applyFilter(); },
  onPending(e) { this.setData({ onlyPending: e.detail.value }); this.applyFilter(); },
  openDetail(e) {
    if (this._navLock) return;
    this._navLock = true;
    wx.navigateTo({
      url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id,
      complete: () => { this._navLock = false; }
    });
  },
  onShareAppMessage() {
    return { title: '错题管家 · 家庭错题管理', path: '/pages/dashboard/dashboard' };
  }
});
