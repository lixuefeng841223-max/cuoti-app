/* 错题管家 数据层：wx 本地存储 + 用户文件目录
   questions / attempts / activity 三个集合，全部存本机 */
'use strict';
const core = require('./core.js');

const K_Q = 'ct_questions';
const K_A = 'ct_attempts';
const K_ACT = 'ct_activity';

function listQuestions() { return wx.getStorageSync(K_Q) || []; }
function saveQuestions(qs) { wx.setStorageSync(K_Q, qs); }
function getQuestion(id) { return listQuestions().find(q => q.id === id) || null; }
function putQuestion(q) {
  const qs = listQuestions();
  const i = qs.findIndex(x => x.id === q.id);
  if (i >= 0) qs[i] = q; else qs.push(q);
  saveQuestions(qs);
}
function deleteQuestion(id) { saveQuestions(listQuestions().filter(q => q.id !== id)); }

function listAttempts() { return wx.getStorageSync(K_A) || []; }
function addAttempt(subject, qid, result) {
  const arr = listAttempts();
  arr.push({ id: core.uid(), subject, qid: qid || null, result, date: core.todayStr(), time: Date.now() });
  wx.setStorageSync(K_A, arr);
}
function recordActivity() {
  const d = core.todayStr();
  const acts = wx.getStorageSync(K_ACT) || [];
  if (!acts.includes(d)) { acts.push(d); wx.setStorageSync(K_ACT, acts); }
}
function calcStreak() {
  const acts = (wx.getStorageSync(K_ACT) || []).sort();
  if (!acts.length) return 0;
  const set = new Set(acts);
  let cur = core.todayStr(), cnt = 0;
  if (!set.has(cur)) { cur = core.addDays(cur, -1); if (!set.has(cur)) return 0; }
  while (set.has(cur)) { cnt++; cur = core.addDays(cur, -1); }
  return cnt;
}

/* ---------------- 图片持久化 ---------------- */
function persistImage(tempPath) {
  try {
    const fs = wx.getFileSystemManager();
    const dest = wx.env.USER_DATA_PATH + '/img_' + Date.now() + '_' + Math.floor(Math.random() * 1e6) + '.jpg';
    fs.copyFileSync(tempPath, dest);
    return dest;
  } catch (e) { return tempPath; }
}

/* ---------------- 错题归档（含重复合并） ---------------- */
function findMergeCandidate(subject, content, qnum) {
  const qs = listQuestions().filter(q => q.subject === subject);
  let best = null, bestScore = 0;
  for (const q of qs) {
    let s = core.jaccard(content, q.content);
    if (qnum != null && q.qnum === qnum && s > 0.4) s += 0.15;
    if (s > bestScore) { bestScore = s; best = q; }
  }
  return bestScore >= 0.72 ? best : null;
}
function archiveWrongItem(item, imagePaths, grade) {
  const t = Date.now();
  const cand = findMergeCandidate(item.subject, item.content, item.qnum);
  if (cand) {
    cand.errorCount = (cand.errorCount || 1) + 1;
    cand.lastErrorAt = t;
    cand.studentAnswer = item.studentAnswer;
    if (item.standardAnswer && !cand.standardAnswer) cand.standardAnswer = item.standardAnswer;
    cand.analysis = cand.analysis || item.analysis || core.autoAnalysis(item, grade);
    const kps = new Set(cand.knowledge || []); (item.knowledge || []).forEach(k => kps.add(k)); cand.knowledge = Array.from(kps);
    cand.history = cand.history || [];
    cand.history.push({ time: t, studentAnswer: item.studentAnswer, result: grade.result, note: '再次做错' });
    cand.mastered = false; cand.stage = 0; cand.nextReviewAt = core.todayStr();
    if (imagePaths && imagePaths.length) cand.images = (cand.images || []).concat(imagePaths).slice(0, 6);
    if (item.difficulty) cand.difficulty = item.difficulty;
    cand.updatedAt = t;
    putQuestion(cand);
    return { merged: true, q: cand };
  }
  const q = {
    id: core.uid(), subject: item.subject, type: item.type || '填空题', qnum: item.qnum || null,
    content: item.content || '', options: item.options || [],
    studentAnswer: item.studentAnswer || '', standardAnswer: item.standardAnswer || '',
    keywords: item.keywords || [], analysis: item.analysis || core.autoAnalysis(item, grade),
    knowledge: item.knowledge || [], difficulty: item.difficulty || '中等',
    images: imagePaths || [], errorCount: 1,
    firstWrongAt: t, lastErrorAt: t, lastReviewAt: null,
    nextReviewAt: core.todayStr(), stage: 0, mastered: false,
    history: [{ time: t, studentAnswer: item.studentAnswer, result: grade.result, note: '首次录入' }],
    status: grade.result === 'uncertain' ? 'pending' : 'normal',
    updatedAt: t
  };
  putQuestion(q);
  return { merged: false, q };
}

/* ---------------- 统计 ---------------- */
function calcStats() {
  const qs = listQuestions();
  const attempts = listAttempts();
  const today = core.todayStr();
  const due = qs.filter(q => !q.mastered && q.nextReviewAt && q.nextReviewAt <= today);
  const mastered = qs.filter(q => q.mastered);
  const bySub = {};
  for (const k of core.SUBJECT_KEYS) bySub[k] = { count: 0, right: 0, total: 0 };
  for (const q of qs) if (bySub[q.subject]) bySub[q.subject].count++;
  for (const a of attempts) if (bySub[a.subject]) { bySub[a.subject].total++; if (a.result === 'correct') bySub[a.subject].right++; }
  const kpCount = {};
  for (const q of qs) for (const k of (q.knowledge || [])) kpCount[k] = (kpCount[k] || 0) + (q.errorCount || 1);
  const topKps = Object.keys(kpCount).map(k => [k, kpCount[k]]).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const days = []; const dayCounts = [];
  for (let i = 6; i >= 0; i--) { const d = core.addDays(today, -i); days.push(d.slice(5)); dayCounts.push(qs.filter(q => core.todayStr(q.firstWrongAt) === d).length); }
  return {
    total: qs.length, due, dueCount: due.length, masteredCount: mastered.length,
    streak: calcStreak(), bySub, topKps, days, dayCounts,
    recent: qs.slice().sort((a, b) => (b.firstWrongAt || 0) - (a.firstWrongAt || 0)).slice(0, 5)
  };
}

/* ---------------- 导出 / 导入 ---------------- */
function exportData() {
  return {
    version: 1, exportedAt: core.fmtDT(Date.now()),
    questions: listQuestions(), attempts: listAttempts(),
    activity: (wx.getStorageSync(K_ACT) || [])
  };
}
function importData(data) {
  if (!data || !Array.isArray(data.questions)) throw new Error('备份文件格式不正确');
  let n = 0;
  const exist = new Set(listQuestions().map(q => q.id));
  const qs = listQuestions();
  for (const q of data.questions) if (!exist.has(q.id)) { qs.push(q); n++; }
  saveQuestions(qs);
  wx.setStorageSync(K_A, (wx.getStorageSync(K_A) || []).concat(data.attempts || []));
  const acts = new Set((wx.getStorageSync(K_ACT) || []).concat(data.activity || []));
  wx.setStorageSync(K_ACT, Array.from(acts));
  return n;
}
function clearAll() {
  wx.removeStorageSync(K_Q); wx.removeStorageSync(K_A); wx.removeStorageSync(K_ACT);
}

module.exports = {
  listQuestions, getQuestion, putQuestion, deleteQuestion,
  addAttempt, recordActivity, calcStreak,
  persistImage, archiveWrongItem, calcStats,
  exportData, importData, clearAll
};
