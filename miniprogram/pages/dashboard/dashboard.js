const core = require('../../utils/core.js');
const store = require('../../utils/store.js');

Page({
  data: {
    stats: null, subjects: [], days: [], dayCounts: [], maxD: 1, today: '',
    subjectMap: core.SUBJECTS
  },
  onShow() {
    this.refresh();
  },
  refresh() {
    const s = store.calcStats();
    const subjects = core.SUBJECT_KEYS.map(k => {
      const meta = core.SUBJECTS[k];
      const d = s.bySub[k];
      const acc = d.total ? Math.round(d.right / d.total * 100) : null;
      return { key: k, name: meta.name, color: meta.color, weak: meta.weak, count: d.count, acc, accTxt: acc == null ? '暂无数据' : acc + '%' };
    });
    const maxD = Math.max(1, ...s.dayCounts);
    this.setData({
      stats: s,
      subjects,
      days: s.days,
      dayCounts: s.dayCounts.map(c => Math.round(c / maxD * 70)),
      maxD,
      today: core.todayStr()
    });
  },
  onPullDownRefresh() {
    this.refresh();
    wx.stopPullDownRefresh();
  },
  goReview() {
    wx.setStorageSync('ct_review_go', 'due');
    wx.switchTab({ url: '/pages/review/review' });
  },
  goLibrary(e) {
    const k = e.currentTarget.dataset.sub;
    wx.setStorageSync('ct_lib_subject', k);
    wx.switchTab({ url: '/pages/library/library' });
  },
  goAll() { wx.switchTab({ url: '/pages/library/library' }); },
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
