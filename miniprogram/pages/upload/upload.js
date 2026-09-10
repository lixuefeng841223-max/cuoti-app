const core = require('../../utils/core.js');
const store = require('../../utils/store.js');

Page({
  data: {
    subject: 'math', guessed: null, mode: 'photo',
    subjects: [], types: core.QTYPES, diffs: core.DIFFS,
    images: [],        // [{id, path}]
    items: [],         // 识别后的条目
    text: '',
    graded: false,
    results: [],
    summary: null
  },
  onLoad() {
    this.setData({ subjects: core.SUBJECT_KEYS.map(k => ({ key: k, name: core.SUBJECTS[k].name })) });
  },
  // 注意：不在 onShow 里自动 reset——批改结果需在切换 Tab 后保留，
  // 由用户点击「再传一份」(again) 或重新识别时主动清空。
  onSubject(e) {
    this.setData({ subject: e.currentTarget.dataset.sub, guessed: null });
  },
  onMode(e) {
    this.setData({ mode: e.currentTarget.dataset.m });
  },
  onText(e) {
    this.setData({ text: e.detail.value });
  },
  /* ---- 图片选择 ---- */
  chooseFromCamera() { this.chooseImage(['camera']); },
  chooseFromAlbum() { this.chooseImage(['album']); },
  chooseImage(sourceType) {
    wx.chooseMedia({
      count: 9, mediaType: ['image'], sourceType,
      success: res => {
        const imgs = this.data.images;
        res.tempFiles.slice(0, 9).forEach(f => {
          imgs.push({ id: core.uid(), path: store.persistImage(f.tempFilePath) });
        });
        this.setData({ images: imgs.slice(0, 9) });
        wx.showToast({ title: '已添加图片', icon: 'success' });
      }
    });
  },
  removeImage(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ images: this.data.images.filter(x => x.id !== id) });
  },
  previewImage(e) {
    const urls = this.data.images.map(x => x.path);
    wx.previewImage({ current: e.currentTarget.dataset.url, urls });
  },
  /* ---- 识别 ---- */
  recognize() {
    const text = this.data.text || '';
    const images = this.data.images;
    if (!text.trim() && !images.length) {
      wx.showToast({ title: '请先添加图片或输入文字', icon: 'none' }); return;
    }
    let items = core.parseUploadText(text || '');
    if (!items.length && text.trim()) {
      items = [{ qnum: 1, content: text.trim(), type: core.detectType(text), options: core.extractOptions(text), studentAnswer: '', standardAnswer: '' }];
    }
    if (!items.length && images.length) {
      items = images.map((im, i) => ({ qnum: i + 1, content: '', type: '填空题', options: [], studentAnswer: '', standardAnswer: '', imageIds: [im.id] }));
    } else if (images.length && items.length) {
      items[0].imageIds = images.map(i => i.id);
    }
    const guess = core.guessSubject(items.map(i => i.content).join('\n'));
    const patch = {};
    if (guess && !this.data.guessed) { patch.subject = guess; patch.guessed = guess; }
    patch.items = items.map(it => ({
      qnum: it.qnum == null ? '' : String(it.qnum),
      content: it.content, type: it.type,
      options: it.options || [],
      studentAnswer: it.studentAnswer || '',
      standardAnswer: it.standardAnswer || '',
      knowledge: (it.knowledge || []).join('、'),
      keywords: (it.standardAnswer ? core.autoKeywords(it.standardAnswer) : []).join('、'),
      difficulty: '中等',
      imageIds: it.imageIds || []
    }));
    patch.graded = false; patch.results = []; patch.summary = null;
    this.setData(patch);
    if (guess) wx.showToast({ title: '已推测科目：' + core.SUBJECTS[guess].name, icon: 'none' });
  },
  /* ---- 条目编辑 ---- */
  onItemField(e) {
    const idx = e.currentTarget.dataset.idx, f = e.currentTarget.dataset.f;
    this.setData({ ['items[' + idx + '].' + f]: e.detail.value });
  },
  onItemType(e) {
    const idx = e.currentTarget.dataset.idx;
    this.setData({ ['items[' + idx + '].type']: this.data.types[e.detail.value] });
  },
  onItemDiff(e) {
    const idx = e.currentTarget.dataset.idx;
    this.setData({ ['items[' + idx + '].difficulty']: this.data.diffs[e.detail.value] });
  },
  onItemDel(e) {
    const idx = e.currentTarget.dataset.idx;
    const items = this.data.items; items.splice(idx, 1);
    this.setData({ items });
  },
  /* ---- 批改并归档 ---- */
  gradeAll() {
    const items = this.data.items.filter(it => (it.content || '').trim() || (it.imageIds || []).length || it.studentAnswer);
    if (!items.length) { wx.showToast({ title: '没有可批改的题目', icon: 'none' }); return; }
    wx.showLoading({ title: '批改中…' });
    const results = [];
    const images = this.data.images;
    for (const it of items) {
      const grade = core.gradeItem({
        type: it.type, content: it.content, options: it.options,
        studentAnswer: it.studentAnswer, standardAnswer: it.standardAnswer,
        keywords: core.splitList(it.keywords)
      });
      if (grade.result === 'wrong' || grade.result === 'partial' || grade.result === 'uncertain') {
        const paths = (it.imageIds || []).map(id => (images.find(x => x.id === id) || {}).path).filter(Boolean);
        const r = store.archiveWrongItem({
          subject: this.data.subject, type: it.type,
          qnum: parseInt(it.qnum, 10) || null,
          content: it.content, options: it.options,
          studentAnswer: it.studentAnswer, standardAnswer: it.standardAnswer,
          keywords: core.splitList(it.keywords), knowledge: core.splitList(it.knowledge),
          difficulty: it.difficulty
        }, paths, grade);
        results.push({ it, grade, saved: true, merged: r.merged });
      } else {
        store.addAttempt(this.data.subject, null, 'correct');
        results.push({ it, grade, saved: false });
      }
    }
    store.recordActivity();
    const cnt = r => results.filter(x => x.grade.result === r).length;
    wx.hideLoading();
    this.setData({
      graded: true, results,
      summary: { wrong: cnt('wrong'), partial: cnt('partial'), correct: cnt('correct'), uncertain: cnt('uncertain') },
      items: [], images: [], text: '', guessed: null
    });
    wx.showToast({ title: '批改完成', icon: 'success' });
  },
  goLibrary() { wx.switchTab({ url: '/pages/library/library' }); },
  again() { this.reset(); },
  reset() {
    this.setData({ items: [], images: [], text: '', graded: false, results: [], summary: null, guessed: null });
  },
  onShareAppMessage() {
    return { title: '错题管家 · 家庭错题管理', path: '/pages/dashboard/dashboard' };
  }
});
