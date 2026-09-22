/**
 * Logical smoke checks — no browser, no test runner.
 * Run: node smoke-check.mjs
 * Verifies source invariants by static inspection + pure-logic re-implementation.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const R = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

let pass = 0, fail = 0;
const rows = [];
function check(id, label, fn) {
  try {
    const detail = fn();
    rows.push({ id, label, status: 'PASS', detail });
    pass++;
    console.log(`PASS ${id} — ${label}${detail ? ' | ' + detail : ''}`);
  } catch (e) {
    rows.push({ id, label, status: 'FAIL', detail: e.message });
    fail++;
    console.log(`FAIL ${id} — ${label} | ${e.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ---------- T01: Landing codes unique ----------
check('T01', 'Landing olympiad codes unique', () => {
  const src = R('src/pages/Landing.jsx');
  const codes = [...src.matchAll(/code:\s*'([^']+)'/g)].map((m) => m[1]);
  assert(codes.length > 0, 'no codes found');
  const uniq = new Set(codes);
  assert(uniq.size === codes.length, `duplicates: ${codes.filter((c, i) => codes.indexOf(c) !== i).join(',')}`);
  return `${codes.length} codes, all unique: ${codes.join(',')}`;
});

// ---------- T02: Landing count == 11 ----------
check('T02', 'Landing has 11 olympiads', () => {
  const src = R('src/pages/Landing.jsx');
  const codes = [...src.matchAll(/code:\s*'([^']+)'/g)].map((m) => m[1]);
  assert(codes.length === 11, `expected 11, got ${codes.length}`);
  // Edge: heading + stats must agree
  assert(src.includes('11 Olympiads'), 'heading "11 Olympiads" missing');
  assert(src.includes("value: '11'"), 'stats ledger 11 missing');
  return 'count=11, heading+stats agree';
});

// ---------- T03: mockDb demo users ----------
check('T03', 'mockDb has demo001/002/003', () => {
  const src = R('src/lib/mockDb.js');
  for (const u of ['demo001', 'demo002', 'demo003']) {
    assert(src.includes(u), `missing ${u}`);
  }
  const ids = [...src.matchAll(/user_id:\s*'([^']+)'/g)].map((m) => m[1]);
  const uniq = new Set(ids);
  assert(uniq.size === ids.length, 'duplicate user_id in seed');
  assert(src.includes("password: 'mcq@imof'"), 'default password mcq@imof missing');
  return `seed user_ids: ${ids.join(',')}`;
});

// ---------- T04: mockDb seed shape ----------
check('T04', 'mockDb seed shape (exam+5 questions+attempts)', () => {
  const src = R('src/lib/mockDb.js');
  assert(src.includes('exam-svmo-2026'), 'exam id missing');
  assert(src.includes("status: 'published'"), 'exam published flag missing');
  const qs = [...src.matchAll(/q-svmo-\d/g)];
  assert(qs.length >= 5, `expected >=5 questions, got ${qs.length}`);
  assert(src.includes('attempts: []'), 'attempts array missing');
  assert(src.includes('is_active: true'), 'is_active flag missing');
  // Edge: reset() + persist() + localStorage guard
  assert(src.includes('reset()'), 'reset() missing');
  assert(src.includes('persist'), 'persist missing');
  assert(src.includes("typeof localStorage === 'undefined'"), 'SSR/node guard missing');
  return `${qs.length} question seeds, reset+persist present`;
});

// ---------- T05: Player Clear response ----------
check('T05', 'Player has Clear response (desktop+mobile)', () => {
  const src = R('src/pages/student/Player.jsx');
  const hits = (src.match(/Clear response/g) || []).length;
  assert(hits >= 2, `expected >=2 Clear response buttons, got ${hits}`);
  assert(src.includes('const clearCurrent'), 'clearCurrent handler missing');
  assert(src.includes('delete next[String(cur.q_no)]'), 'clear must delete key, not set null');
  assert(src.includes('disabled={!answers[String(q.q_no)]}'), 'clear must disable when unanswered');
  return `${hits} Clear buttons, delete-key semantics, disabled-guard`;
});

// ---------- T06: Player timer alerts 600/300/60 ----------
check('T06', 'Player timer alerts 600/300/60', () => {
  const src = R('src/pages/student/Player.jsx');
  for (const t of ['t: 600', 't: 300', 't: 60']) assert(src.includes(t), `threshold ${t} missing`);
  assert(src.includes('10 minutes remaining'), '10-min msg missing');
  assert(src.includes('5 minutes remaining'), '5-min msg missing');
  assert(src.includes('1 minute remaining'), '1-min msg missing');
  assert(src.includes('firedAlertsRef'), 'fired-once ref guard missing');
  assert(src.includes('prevTimeRef'), 'crossing-detection ref missing');
  assert(src.includes('prev > t && timeLeft <= t'), 'crossing condition missing');
  assert(src.includes('Dismiss'), 'alert dismiss button missing');
  // Edge: late-load below threshold must silently mark fired (no stale banner)
  assert(src.includes('if (prev === null)'), 'late-load branch missing');
  return '600/300/60 + once-only + crossing + late-load guard';
});

// ---------- T07: Player offline handling ----------
check('T07', 'Player offline handling', () => {
  const src = R('src/pages/student/Player.jsx');
  assert(src.includes('navigator.onLine'), 'navigator.onLine init missing');
  assert(src.includes("window.addEventListener('online'"), 'online listener missing');
  assert(src.includes("window.addEventListener('offline'"), 'offline listener missing');
  assert(src.includes('removeEventListener'), 'listener cleanup missing');
  assert(src.includes('You are offline'), 'offline banner missing');
  assert(src.includes('auto-saved locally'), 'offline autosave copy missing');
  return 'online/offline listeners + banner + autosave copy';
});

// ---------- T08: Result accuracy logic ----------
check('T08', 'Result accuracy logic (live+mock, zero-guard)', () => {
  const src = R('src/pages/student/Result.jsx');
  // Live branch
  assert(src.includes('liveAccuracy'), 'liveAccuracy missing');
  assert(src.includes('liveCorrect / liveAttempted'), 'live accuracy formula missing');
  assert(src.includes('liveAttempted > 0 ?'), 'live zero-divide guard missing');
  // Mock branch
  assert(src.includes('mockAccuracy'), 'mockAccuracy missing');
  assert(src.includes('mockCorrect / mockAttempted'), 'mock accuracy formula missing');
  assert(src.includes('mockAttempted > 0 ?'), 'mock zero-divide guard missing');
  // Labels + explanation
  assert(src.includes('Accuracy'), 'Accuracy card missing');
  assert(src.includes('correct / attempted'), 'accuracy explanation missing');
  // Edge: skipped/wrong derivations
  assert(src.includes('liveSkipped') && src.includes('mockSkipped'), 'skipped derivation missing');
  assert(src.includes('liveWrong') && src.includes('mockWrong'), 'wrong derivation missing');
  // Pure-logic re-check (edge: 0 attempted => 0%, not NaN)
  const acc = (c, a) => (a > 0 ? (c / a) * 100 : 0);
  assert(acc(0, 0) === 0, '0/0 must be 0');
  assert(Math.round(acc(3, 4)) === 75, '3/4 must round to 75');
  assert(Math.round(acc(0, 5)) === 0, '0/5 must be 0');
  return 'live+mock accuracy + zero-guard + pure check 0/0=0, 3/4=75%';
});

// ---------- T09: Students Add form + status toggle ----------
check('T09', 'Students Add form + status toggle', () => {
  const src = R('src/pages/admin/Students.jsx');
  assert(src.includes('Add student'), 'Add student section missing');
  assert(src.includes('addSingle'), 'addSingle handler missing');
  assert(src.includes('user_id min 3 chars'), 'user_id validation missing');
  assert(src.includes('name required'), 'name validation missing');
  assert(src.includes('toggleActive'), 'toggleActive missing');
  assert(src.includes('Deactivate') && src.includes('Activate'), 'Activate/Deactivate labels missing');
  assert(src.includes('is_active: !s.is_active'), 'toggle inversion missing');
  assert(src.includes('upsertStudents'), 'upsertStudents call missing');
  return 'addSingle validation + toggleActive inversion + upsert';
});

// ---------- T10: Questions Add + import ----------
check('T10', 'Questions Add single + import', () => {
  const src = R('src/pages/admin/Questions.jsx');
  assert(src.includes('Add single question'), 'Add single section missing');
  assert(src.includes('saveSingle'), 'saveSingle missing');
  assert(src.includes('bulkInsertQuestions'), 'bulkInsertQuestions missing');
  assert(src.includes('Import Excel / CSV'), 'import section missing');
  assert(src.includes('saveImport'), 'saveImport missing');
  assert(src.includes('parseQuestionRows'), 'parseQuestionRows missing');
  assert(src.includes('validateFile'), 'validateFile missing');
  assert(src.includes('disabled={!examId}'), 'import must disable without exam');
  assert(src.includes('Select an exam above first') || src.includes('Select an exam above to enable import'), 'no-exam hint missing');
  return 'saveSingle + saveImport + validate + exam-guard';
});

// ---------- T11: Dashboard schools + recent attempts ----------
check('T11', 'Dashboard schools + recent attempts', () => {
  const src = R('src/pages/admin/Dashboard.jsx');
  assert(src.includes('schools'), 'schools stat missing');
  assert(src.includes('new Set(students.map'), 'schools dedupe via Set missing');
  assert(src.includes('recentAttempts'), 'recentAttempts state missing');
  assert(src.includes('Recent attempts'), 'Recent attempts table missing');
  assert(src.includes("String(b.submitted_at || '').localeCompare"), 'attempts sort missing');
  assert(src.includes('.slice(0, 5)'), 'top-5 slice missing');
  assert(src.includes('Recent exams'), 'Recent exams table missing');
  return 'schools dedupe + sorted top-5 attempts + recent exams';
});

// ---------- T12: Login useEffect sync ----------
check('T12', 'Login useEffect tab sync (?tab=admin)', () => {
  const src = R('src/pages/Login.jsx');
  assert(src.includes('useEffect'), 'useEffect missing');
  assert(src.includes("setTab(params.get('tab')"), 'tab sync from URL missing');
  assert(src.includes('[params]'), 'effect dep [params] missing');
  assert(src.includes("params.get('tab') === 'admin'"), '?tab=admin check missing');
  assert(src.includes('role="tablist"') || src.includes("role=\"tablist\""), 'tablist a11y missing');
  assert(src.includes('loginAdmin') && src.includes('loginStudent'), 'both login paths missing');
  return 'URL->tab sync + dep + both login paths';
});

// ---------- Edge-case bundle ----------
check('T13', 'Edge cases: guards & failure paths', () => {
  const player = R('src/pages/student/Player.jsx');
  const result = R('src/pages/student/Result.jsx');
  const students = R('src/pages/admin/Students.jsx');
  // Player: auto-submit at 0, double-confirm, beforeunload, submit-failure retry copy
  assert(player.includes('if (timeLeft <= 0) { doSubmit()'), 'auto-submit at 0 missing');
  assert(player.includes('endStep'), 'double-confirm state missing');
  assert(player.includes('beforeunload'), 'beforeunload guard missing');
  assert(player.includes('Please retry'), 'submit-failure retry copy missing');
  // Result: no-submission states both modes
  assert(result.includes('No submission yet'), 'no-submission state missing');
  assert(result.includes('Pass mark is 40%'), 'pass-mark copy missing');
  // Students: duplicate + unknown exam_code handling
  assert(students.includes('duplicate in file'), 'duplicate-in-file check missing');
  assert(students.includes('unknown exam_code'), 'unknown exam_code check missing');
  return 'auto-submit + double-confirm + retry + no-submission + dup/exam_code';
});

console.log(`\n${pass} passed, ${fail} failed, ${pass + fail} total`);
if (fail > 0) process.exit(1);
