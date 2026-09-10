/* 错题管家 核心逻辑（纯函数，无 DOM / wx 依赖）
   与网页版保持同一套识别、批改、合并、变式规则 */
'use strict';

/* ---------------- 常量 ---------------- */
const SUBJECTS = {
  math:    { name: '数学', color: '#4f6ef7', weak: '#e9eeff' },
  chinese: { name: '语文', color: '#e8590c', weak: '#fff0e6' },
  english: { name: '英语', color: '#12b886', weak: '#e6f9f1' },
  science: { name: '科学', color: '#7048e8', weak: '#f1ecff' }
};
const SUBJECT_KEYS = ['math', 'chinese', 'english', 'science'];
const QTYPES = ['选择题', '判断题', '填空题', '计算题', '解答题', '简答题', '阅读理解', '作文', '实验题', '翻译题', '默写题'];
const DIFFS = ['简单', '中等', '较难'];
const STAGES = [0, 1, 3, 7, 14, 30]; // 间隔重复（天）
const RESULT_TXT = { correct: '✔ 正确', wrong: '✘ 错误', partial: '◐ 部分正确', uncertain: '? 无法判断' };
const MASTERY_TXT = { 0: '未掌握', 1: '待复习', 2: '已掌握' };

/* ---------------- 工具 ---------------- */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function todayStr(ts) {
  const d = ts ? new Date(ts) : new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function addDays(dateStr, n) {
  const p = dateStr.split('-').map(Number);
  return todayStr(new Date(p[0], p[1] - 1, p[2] + n));
}
function fmtDate(ts) { if (!ts) return '—'; const d = new Date(ts); return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
function fmtDT(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return todayStr(d) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function masteryLevel(q) { return q.mastered ? 2 : (q.stage > 0 ? 1 : 0); }
function masteryOf(q) { return MASTERY_TXT[masteryLevel(q)]; }
function splitList(v) {
  if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
  return String(v || '').split(/[、,，;；]/).map(x => x.trim()).filter(Boolean);
}

/* ---------------- 文本归一化 ---------------- */
function toHalfWidth(s) {
  return String(s || '').replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' ');
}
function norm(s) {
  return toHalfWidth(s).toLowerCase().replace(/\s+/g, '').replace(/[。，、；：“”‘’（）()]/g, '');
}
const JUDGE_TRUE = ['对', '正确', '√', 't', 'true', 'y', 'yes', '是', '对的'];
const JUDGE_FALSE = ['错', '错误', '×', 'x', 'f', 'false', 'n', 'no', '否', '错的'];
function judgeValue(s) {
  const v = norm(s);
  if (!v) return null;
  if (['√', '✓'].includes(String(s).trim()) || JUDGE_TRUE.includes(v)) return true;
  if (['×', '✗'].includes(String(s).trim()) || JUDGE_FALSE.includes(v)) return false;
  return null;
}
function extractChoiceLetters(s) {
  const m = String(s || '').toUpperCase().match(/[A-H]/g);
  return m ? Array.from(new Set(m)).sort() : [];
}
function parseNum(s) {
  if (s == null) return null;
  let t = toHalfWidth(String(s)).replace(/,/g, '').trim();
  let neg = false;
  if (/^(负|−|–)/.test(t)) { neg = true; t = t.replace(/^(负|−|–)\s*/, ''); }
  const pct = /%$/.test(t) || /^百分之/.test(t);
  t = t.replace(/%$/, '').replace(/^百分之/, '');
  const frac = t.match(/^(\d+(?:\.\d+)?)\s*[/／]\s*(\d+(?:\.\d+)?)$/);
  let v = null;
  if (frac) v = parseFloat(frac[1]) / parseFloat(frac[2]);
  else {
    const m = t.match(/[-+]?\d+(?:\.\d+)?/);
    if (m) v = parseFloat(m[0]); else return null;
  }
  if (neg) v = -v;
  if (pct) v = v / 100;
  return v;
}
function numEq(a, b) {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= Math.max(1e-6, Math.abs(b) * 1e-4);
}
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i), cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}
function simRatio(a, b) { const L = Math.max(a.length, b.length) || 1; return 1 - levenshtein(a, b) / L; }
function bigrams(s) { s = norm(s); const r = new Set(); for (let i = 0; i < s.length - 1; i++) r.add(s.substr(i, 2)); if (s.length === 1) r.add(s); return r; }
function jaccard(a, b) {
  const A = bigrams(a), B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; A.forEach(x => { if (B.has(x)) inter++; });
  return inter / (A.size + B.size - inter);
}

/* ---------------- 科目 / 题型 / 选项识别 ---------------- */
const SUBJECT_HINTS = {
  math: ['方程', '有理数', '代数', '几何', '函数', '解得', '线段', '角', '证明', '比例', '绝对值', '整式', '分式', '不等式', '数轴', '相反数', '坐标系', '平方', '开方', '计算', '化简', '解下列', '千米', '乙两车', '追及', '相遇'],
  chinese: ['课文', '古诗', '默写', '阅读', '修辞', '比喻', '拟人', '作者', '拼音', '汉字', '注音', '作文', '语境', '词语', '近义词', '反义词', '标点', '段落', '文言文', '诗', '朱自清', '散文'],
  english: ['choose', 'fill', 'blank', 'the', 'is', 'are', 'was', 'were', 'word', 'grammar', 'translation', 'translate', '单项选择', '完形', '首字母', '适当形式', '英译汉', '汉译英', 'dialogue', 'sentence', 'correct'],
  science: ['实验', '细胞', '显微镜', '光', '反射', '折射', '电路', '电流', '电压', '电阻', '力', '重力', '摩擦', '温度', '热量', '溶液', '酸', '碱', '盐', '化学式', '物理', '生物', '地球', '月球', '太阳', '蒸发', '沸腾', '密度', '质量', '天平', '量筒', '种子', '蒸腾', '观察']
};
function guessSubject(text) {
  const t = toHalfWidth(String(text || '')).toLowerCase();
  const scores = {};
  for (const k of SUBJECT_KEYS) {
    scores[k] = 0;
    for (const w of SUBJECT_HINTS[k]) if (t.includes(w.toLowerCase())) scores[k]++;
  }
  let best = null, max = 0;
  for (const k of SUBJECT_KEYS) if (scores[k] > max) { max = scores[k]; best = k; }
  return max >= 1 ? best : null;
}
function detectType(content) {
  const c = String(content || '');
  if (/(?:^|[\s.．、])(?:A|a|Ａ)\s*[.．、)].+B\s*[.．、)]/s.test(c) || /A\s*[.．、)][\s\S]{0,80}B\s*[.．、)]/.test(c)) return '选择题';
  if (/判断(题|对错)|正确的?[是打]√|打["“]√["”]|（\s*对错\s*）|\(\s*对错\s*\)/.test(c)) return '判断题';
  if (/（\s*）|\(\s*\)|__{2,}|＿{2,}/.test(c)) return '填空题';
  if (/作文|写作|不少于.{0,4}字/.test(c)) return '作文';
  if (/翻译|译成|译为/.test(c)) return '翻译题';
  if (/实验|如图.*装置|量筒|天平|电路图/.test(c)) return '实验题';
  if (/阅读(下面|短文|材料|理解)|阅读下列/.test(c)) return '阅读理解';
  if (/默写|补写出下列/.test(c)) return '默写题';
  if (/解方程|计算|化简|求值|证明|求解|解不等式/.test(c)) return '计算题';
  if (/为什么|简述|说明理由|谈谈/.test(c)) return '简答题';
  return '填空题';
}
function extractOptions(content) {
  const opts = [];
  const lines = String(content || '').split(/\r?\n/);
  for (const ln of lines) {
    const m = ln.trim().match(/^([A-Ha-h])\s*[.．、)]\s*(.+)$/);
    if (m && opts.length < 8) opts.push({ key: m[1].toUpperCase(), text: m[2].trim() });
  }
  if (opts.length >= 2) return opts;
  // 行内选项：A. xx B. xx C. xx（同一行）
  const inline = [];
  const c = String(content || '');
  const re = /([A-Ha-h])\s*[.．、)]/g;
  const marks = []; let mm;
  while ((mm = re.exec(c)) && marks.length < 10) marks.push({ key: mm[1].toUpperCase(), start: mm.index, end: re.lastIndex });
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].start : c.length;
    const text = c.slice(marks[i].end, end).replace(/[\s;；,，。、]+$/, '').trim();
    if (text) inline.push({ key: marks[i].key, text });
  }
  if (inline.length >= 2) return inline.slice(0, 8);
  return opts;
}
function autoKeywords(standardAnswer) {
  let s = String(standardAnswer || '').trim();
  if (!s) return [];
  s = s.replace(/^[答案:：\s]+/, '');
  let parts;
  if (/[;；]/.test(s)) parts = s.split(/[;；]/);
  else if (/[、]/.test(s) && s.length > 12) parts = s.split(/[、]/);
  else parts = [s];
  parts = parts.map(p => p.trim()).filter(p => p.length >= 1 && p.length <= 30);
  return parts.slice(0, 6);
}

/* ---------------- 文字上传解析 ---------------- */
function looksLikeAnswerLine(s) {
  const t = String(s || '').trim();
  if (!t || t.length > 40) return false;
  return /^[0-9A-Ha-h√×对错TFtruefals、,，;；.．/／\s+\-—:%％℃°]{1,40}$/.test(t) && /[A-Ha-h√×对错TF0-9]/.test(t);
}
function expandAnswerRange(t, put) {
  const m = String(t || '').match(/^(\d{1,3})\s*[-–—~至]\s*(\d{1,3})\s*[:：]?\s*([\s\S]+)$/);
  if (!m) return false;
  const from = parseInt(m[1], 10), to = parseInt(m[2], 10);
  const rest = m[3].replace(/[\s,，、;；]+/g, '');
  if (to < from || to - from > 60 || rest.length > 80) return false;
  const units = rest.match(/[A-Ha-h]|√|×|对|错/g);
  if (!units || units.length < (to - from + 1) - 1) return false;
  let i = 0;
  for (let n = from; n <= to && i < units.length; n++, i++) {
    let v = units[i];
    if (v === '对' || v === '√') v = '对';
    if (v === '错' || v === '×') v = '错';
    put(n, v);
  }
  return true;
}
function parseUploadText(raw) {
  const lines = String(raw || '').split(/\r?\n/);
  const items = [];
  const mineAns = {}, stdAns = {};
  let ansMode = null; // 'mine' | 'std'
  let cur = null;
  const pushItem = (qnum, text) => { cur = { qnum, lines: text ? [text] : [] }; items.push(cur); };

  for (let rawLine of lines) {
    const t = rawLine.trim();
    if (!t) continue;
    let m = t.match(/^(我的答案|学生答案|本人答案|做的答案)[:：](.*)$/);
    if (m) {
      ansMode = 'mine';
      const rest = m[2].trim();
      if (rest) {
        const pm = rest.match(/^(\d{1,3})[.、．)）]?\s*(.+)$/);
        if (!expandAnswerRange(rest, (n, v) => mineAns[n] = v) && pm && looksLikeAnswerLine(pm[2])) mineAns[parseInt(pm[1], 10)] = pm[2].trim();
      }
      continue;
    }
    m = t.match(/^(标准答案|正确答案|参考答案|答案)[:：](.*)$/);
    if (m) {
      ansMode = 'std';
      const rest = m[2].trim();
      if (rest) {
        const pm = rest.match(/^(\d{1,3})[.、．)）]?\s*(.+)$/);
        if (!expandAnswerRange(rest, (n, v) => stdAns[n] = v) && pm && looksLikeAnswerLine(pm[2])) stdAns[parseInt(pm[1], 10)] = pm[2].trim();
      }
      continue;
    }
    if (/^(我的答案|学生答案|标准答案|正确答案|参考答案)下?[面有]?[:：]?$/.test(t)) {
      ansMode = /标准|正确|参考/.test(t) ? 'std' : 'mine'; continue;
    }
    if (expandAnswerRange(t, (n, v) => { (ansMode === 'std' ? stdAns : mineAns)[n] = v; })) continue;
    const qm = t.match(/^(\d{1,3})\s*[.、．)）]\s*(.*)$/);
    const am = t.match(/^(\d{1,3})\s*[.、．)）]?\s*(.+)$/);
    if (ansMode && am && looksLikeAnswerLine(am[2])) {
      (ansMode === 'std' ? stdAns : mineAns)[parseInt(am[1], 10)] = am[2].trim(); continue;
    }
    if (qm) { pushItem(parseInt(qm[1], 10), qm[2]); ansMode = null; continue; }
    if (cur) { cur.lines.push(t); continue; }
    if (t.length >= 6 && /[？?。：:＝=]/.test(t)) { pushItem(items.length + 1, t); ansMode = null; }
  }

  return items.map(it => {
    const content = it.lines.join('\n').trim();
    return {
      qnum: it.qnum,
      content,
      type: detectType(content),
      options: extractOptions(content),
      studentAnswer: mineAns[it.qnum] || '',
      standardAnswer: stdAns[it.qnum] || ''
    };
  }).filter(it => it.content || it.studentAnswer || it.standardAnswer);
}

/* ---------------- 自动批改引擎 ---------------- */
function gradeItem(item) {
  const type = item.type || '填空题';
  const sa = String(item.studentAnswer == null ? '' : item.studentAnswer).trim();
  const std = String(item.standardAnswer == null ? '' : item.standardAnswer).trim();
  const stdClean = std.replace(/^[答案:：\s]+/, '').trim();

  if (!sa) return { result: 'uncertain', reason: '未填写学生答案，需人工确认', score: null };
  if (!stdClean && !(item.keywords || []).length) return { result: 'uncertain', reason: '缺少标准答案，无法自动判断，需人工确认', score: null };

  if (type === '选择题') {
    const a = extractChoiceLetters(sa), b = extractChoiceLetters(stdClean);
    if (!a.length) return { result: 'uncertain', reason: '学生答案中未识别到选项字母，需人工确认', score: null };
    if (!b.length) return { result: 'uncertain', reason: '标准答案格式无法识别，需人工确认', score: null };
    const ok = a.join('') === b.join('');
    return { result: ok ? 'correct' : 'wrong', reason: ok ? '' : ('选择了 ' + a.join('') + '，正确答案为 ' + b.join('')), score: ok ? 1 : 0 };
  }
  if (type === '判断题') {
    const a = judgeValue(sa), b = judgeValue(stdClean);
    if (a == null) return { result: 'uncertain', reason: '判断题答案无法识别（支持：对/错/√/×/T/F）', score: null };
    if (b == null) return { result: 'uncertain', reason: '标准答案无法识别，需人工确认', score: null };
    return { result: a === b ? 'correct' : 'wrong', reason: a === b ? '' : ('判断为“' + (a ? '对' : '错') + '”，正确为“' + (b ? '对' : '错') + '”'), score: a === b ? 1 : 0 };
  }
  if (type === '填空题' || type === '默写题' || type === '翻译题') {
    const splitAns = s => String(s).split(/[;；\n|｜]/).map(x => x.trim()).filter(Boolean);
    const A = splitAns(sa), B = splitAns(stdClean.replace(/\|/g, ';'));
    if (!B.length) return { result: 'uncertain', reason: '标准答案为空或无法拆分，需人工确认', score: null };
    let full = 0, half = 0; const reasons = [];
    const n = Math.max(A.length, B.length);
    for (let i = 0; i < n; i++) {
      const a = (A[i] || ''), b = (B[i] || '');
      if (!a) { reasons.push('第' + (i + 1) + '空未作答'); continue; }
      const na = parseNum(a), nb = parseNum(b);
      if (na != null && nb != null) {
        const unitOf = x => String(x).replace(/^百分之/, '').replace(/[-+]?[\d.,\s/／]+/g, '').trim();
        if (numEq(na, nb)) {
          if (norm(unitOf(a)) === norm(unitOf(b))) full++;
          else { half++; reasons.push('第' + (i + 1) + '空数值正确但单位/写法与标准答案不同（“' + a + '” vs “' + b + '”）'); }
        } else { reasons.push('第' + (i + 1) + '空数值错误（' + a + ' ≠ ' + b + '）'); }
      } else {
        const ra = norm(a), rb = norm(b);
        if (ra === rb) full++;
        else if (rb.includes(ra) && ra.length >= Math.max(1, rb.length * 0.5)) { half++; reasons.push('第' + (i + 1) + '空意思接近但不完整'); }
        else if (simRatio(ra, rb) >= 0.8) { half++; reasons.push('第' + (i + 1) + '空接近正确答案（可能有错别字或单位问题）'); }
        else reasons.push('第' + (i + 1) + '空与标准答案不符');
      }
    }
    const score = (full + half * 0.5) / B.length;
    let result = (full === B.length && half === 0) ? 'correct' : ((full + half) > 0 ? 'partial' : 'wrong');
    if (A.length < B.length && full + half === A.length && A.length > 0) result = 'partial';
    return { result, reason: reasons.join('；'), score };
  }
  if (type === '计算题' || type === '解答题' || type === '实验题') {
    const na = parseNum(sa.replace(/^.*[=＝]/, '')), nb = parseNum(stdClean.replace(/^.*[=＝]/, ''));
    const kws = (item.keywords && item.keywords.length ? item.keywords : autoKeywords(stdClean)).map(norm);
    if (na != null && nb != null) {
      if (numEq(na, nb)) {
        const stepsOk = !kws.length || kws.every(k => norm(sa).includes(k));
        return { result: stepsOk ? 'correct' : 'partial', reason: stepsOk ? '' : '最终结果正确，但解题过程缺少关键步骤/要点', score: stepsOk ? 1 : 0.8 };
      }
      return { result: 'wrong', reason: '计算结果错误（' + sa.replace(/^.*[=＝]/, '').trim() + '，应为 ' + stdClean.replace(/^.*[=＝]/, '').trim() + '）', score: 0 };
    }
    if (kws.length) {
      const hit = kws.filter(k => norm(sa).includes(k));
      if (hit.length === kws.length) return { result: 'correct', reason: '', score: 1 };
      if (hit.length > 0) return { result: 'partial', reason: '要点不全：缺少/未匹配「' + kws.filter(k => !norm(sa).includes(k)).join('、') + '」', score: hit.length / kws.length };
      return { result: 'wrong', reason: '解题要点均未匹配，答案与标准答案差异较大', score: 0 };
    }
    const r = simRatio(norm(sa), norm(stdClean));
    if (r >= 0.9) return { result: 'correct', reason: '', score: 1 };
    if (r >= 0.5) return { result: 'partial', reason: '与参考答案部分一致（相似度 ' + Math.round(r * 100) + '%）', score: r };
    return { result: 'wrong', reason: '与参考答案不符', score: 0 };
  }
  // 简答 / 阅读 / 作文 / 其他主观题
  const kws = (item.keywords && item.keywords.length ? item.keywords : autoKeywords(stdClean)).map(norm);
  if (kws.length) {
    const ns = norm(sa);
    const hit = kws.filter(k => ns.includes(k));
    if (hit.length === kws.length) return { result: 'correct', reason: '', score: 1 };
    if (hit.length > 0) return { result: 'partial', reason: '答对要点：' + hit.join('、') + '；缺少：' + kws.filter(k => !ns.includes(k)).join('、'), score: hit.length / kws.length };
    return { result: 'wrong', reason: '未覆盖答题要点', score: 0 };
  }
  if (type === '作文') {
    const len = sa.replace(/\s/g, '').length;
    if (!stdClean) return { result: 'uncertain', reason: '作文暂无法自动评分（可人工确认），当前字数：' + len, score: null };
  }
  const r = simRatio(norm(sa), norm(stdClean));
  if (r >= 0.9) return { result: 'correct', reason: '', score: 1 };
  if (r >= 0.5) return { result: 'partial', reason: '与参考答案部分一致（相似度 ' + Math.round(r * 100) + '%），建议人工复核', score: r };
  return { result: 'wrong', reason: '与参考答案不符，建议人工复核', score: 0 };
}
function autoAnalysis(item, grade) {
  return '【错误原因】' + (grade.reason || '（可点击编辑补充）') +
    '\n【解题思路】对照标准答案梳理解题步骤；尝试用自己的话给家长讲一遍这道题（费曼学习法）；隔天在“复习”中重做一次。';
}

/* ---------------- 类似题生成 ---------------- */
function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function genSimilar(q) {
  const content = String(q.content || '');
  if (q.subject === 'math') {
    const m = content.match(/([-+]?\d*)\s*x\s*([+-]\s*\d+)?\s*[=＝]\s*(\d+)/);
    if (m) {
      const a0 = (m[1] === '' || m[1] === '+') ? 1 : (m[1] === '-' ? -1 : parseInt(m[1], 10));
      const b0 = m[2] ? parseInt(m[2].replace(/\s+/g, ''), 10) : 0;
      const c0 = parseFloat(m[3]);
      if (a0 !== 0 && Number.isFinite(b0) && Number.isFinite(c0)) {
        let a = a0, b = b0, c;
        do { a = a0 > 0 ? randInt(2, 9) : -randInt(2, 9); b = randInt(-15, 15); c = a * (randInt(-12, 12) || 3) + b; } while (a === a0 && b === b0);
        const x = (c - b) / a;
        const bs = b === 0 ? '' : (b > 0 ? ' + ' + b : ' - ' + Math.abs(b));
        return { content: '解方程：' + a + 'x' + bs + ' = ' + c, answer: 'x = ' + (Number.isInteger(x) ? x : x.toFixed(2)), tip: '数字变式：结构与原题相同，系数随机生成。' };
      }
    }
    if (/\d/.test(content)) {
      const nc = content.replace(/\d{1,3}/g, d => {
        const v = parseInt(d, 10);
        if (v === 0) return String(randInt(1, 9));
        const lo = Math.max(1, Math.round(v * 0.6)), hi = Math.round(v * 1.5);
        return String(randInt(lo, hi));
      });
      if (nc !== content) return { content: nc, answer: '（变式练习：请独立完成后再次上传核对）', tip: '数字变式：题干数字已随机替换。' };
    }
  }
  if (q.subject === 'english' && /首字母|fill|填/.test(content)) {
    return { content: '用所给单词的适当形式填空：\n1. He ___ (go) to school by bike every day.\n2. Look! The children ___ (play) football.\n3. There ___ (be) some milk in the glass.', answer: '1. goes  2. are playing  3. is', tip: '同知识点练习。' };
  }
  if (q.subject === 'chinese') {
    return { content: '【变式建议】围绕知识点「' + ((q.knowledge || []).join('、') || '本题') + '」：\n1. 把原题的关键字词抄写三遍并口头造句；\n2. 从课本/练习册中找一道同知识点题目完成；\n3. 把做这道题的思路讲给家长听。', answer: '完成后再上传一次，检验掌握情况。', tip: '语文主观题暂以任务卡形式变式。' };
  }
  return { content: '【变式建议】围绕知识点「' + ((q.knowledge || []).join('、') || '本题') + '」从练习册中挑选一道同类题完成，然后拍照上传核对。', answer: '—', tip: '该题型暂不支持全自动变式。' };
}

module.exports = {
  SUBJECTS, SUBJECT_KEYS, QTYPES, DIFFS, STAGES, RESULT_TXT, MASTERY_TXT,
  uid, todayStr, addDays, fmtDate, fmtDT, masteryLevel, masteryOf, splitList,
  toHalfWidth, norm, judgeValue, extractChoiceLetters, parseNum, numEq, simRatio, jaccard,
  guessSubject, detectType, extractOptions, autoKeywords,
  looksLikeAnswerLine, expandAnswerRange, parseUploadText,
  gradeItem, autoAnalysis, genSimilar
};
