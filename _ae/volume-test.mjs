// Volume test: seed realistic data via the real API (CSV import + bulk-mark),
// then run a mixed load profile and report throughput + latency percentiles.
const B = 'http://localhost:8080/api/v1';
let PASS = 0, FAIL = 0;
const check = (n, ok, d) => { ok ? PASS++ : FAIL++; console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${ok ? '' : ' :: ' + d}`); };

async function main() {
  // wait for stack
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(B + '/health'); if (r.ok) break; } catch {}
    await new Promise(r => setTimeout(r, 3000));
  }

  const login = await fetch(B + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@demo-school.edu', password: 'Demo!Pass123' }),
  }).then(r => r.json());
  const T = login.data.accessToken;
  const schoolId = login.data.user.schoolId;
  const req = async (m, p, body) => {
    const h = { Authorization: `Bearer ${T}` };
    if (body) h['Content-Type'] = 'application/json';
    const r = await fetch(B + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await r.json(); } catch {}
    return { status: r.status, data: j?.data ?? j };
  };

  // ---- Phase 1: create a load-test class ----
  const years = await req('GET', '/academic-years?limit=10');
  const yearId = years.data?.items?.[0]?.id;
  const stamp = Date.now();
  const cls = await req('POST', '/classes', { name: `Load 5V-${stamp}`, schoolId, academicYearId: yearId, gradeLevel: '5', section: 'V' });
  check('create load class', cls.status === 201, cls.status);

  // ---- Phase 2: import 100 students via CSV ----
  const rows = ['fullName,email,rollNumber,guardianName,guardianPhone'];
  for (let i = 1; i <= 100; i++) {
    rows.push(`Load Student ${i},load-${stamp}-${i}@demo-school.edu,LV-${String(i).padStart(3, '0')},Guardian ${i},+23480${String(i).padStart(8, '0')}`);
  }
  const t0 = Date.now();
  const imp = await req('POST', '/import/students', { classId: cls.data.id, csv: rows.join('\n') });
  const importMs = Date.now() - t0;
  check('CSV import of 100 students', imp.status === 201 && imp.data?.imported === 100,
    `imported=${imp.data?.imported} skipped=${imp.data?.skipped?.length}`);
  console.log(`  → 100 students imported in ${importMs} ms (incl. bcrypt + enrollment)`);

  // ---- Phase 3: bulk-mark attendance for the class (100 entries) ----
  const students = await req('GET', `/students?limit=200`);
  const roster = (students.data?.items ?? []).filter(s => (s.rollNumber ?? '').startsWith('LV-'));
  check('roster lists 100 imported students', roster.length === 100, roster.length);
  const entries = roster.map((s, i) => ({ studentId: s.id, status: ['present', 'present', 'present', 'late', 'absent'][i % 5] }));
  const t1 = Date.now();
  const att = await req('POST', '/attendance/bulk-mark', { date: new Date().toISOString().slice(0, 10), classId: cls.data.id, entries });
  check('bulk-mark 100 attendance rows', att.status === 201, att.status);
  console.log(`  → 100 attendance rows in ${Date.now() - t1} ms`);

  // ---- Phase 4: mixed load at concurrency 25 ----
  const latencies = [];
  const statusCount = {};
  let errors5xx = 0, total = 0;
  const record = (r) => { total++; latencies.push(r.ms); statusCount[r.status] = (statusCount[r.status] || 0) + 1; if (r.status >= 500) errors5xx++; };

  const get = async (path) => {
    const s = performance.now();
    const r = await fetch(B + path, { headers: { Authorization: `Bearer ${T}` } });
    await r.arrayBuffer();
    return { status: r.status, ms: performance.now() - s };
  };

  const targets = [
    '/students?limit=100', '/classes?limit=100', '/subjects?limit=100',
    '/attendance/reports', '/marks?limit=100', '/payments/reports',
    '/announcements?limit=50', '/users?limit=100', '/audit-logs?limit=50',
  ];
  const tasks = [];
  for (let i = 0; i < 450; i++) tasks.push(async () => record(await get(targets[i % targets.length])));
  const CONC = 25;
  let idx = 0;
  const t2 = Date.now();
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < tasks.length) { await tasks[idx++](); }
  }));
  const elapsed = (Date.now() - t2) / 1000;
  const pct = (p) => [...latencies].sort((a, b) => a - b)[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))];
  console.log(`\n  LOAD RESULT (${total} reqs, concurrency ${CONC}, ${elapsed.toFixed(1)}s):`);
  console.log(`    throughput : ${(total / elapsed).toFixed(1)} req/s`);
  console.log(`    median     : ${pct(50).toFixed(0)} ms`);
  console.log(`    p95        : ${pct(95).toFixed(0)} ms`);
  console.log(`    p99        : ${pct(99).toFixed(0)} ms`);
  console.log(`    max        : ${Math.max(...latencies).toFixed(0)} ms`);
  console.log(`    5xx errors : ${errors5xx}`);
  console.log(`    statuses   : ${JSON.stringify(statusCount)}`);
  check('no 5xx under load', errors5xx === 0, errors5xx);
  check('throughput > 20 req/s', total / elapsed > 20, (total / elapsed).toFixed(1));

  console.log(`\n===== VOLUME TEST: ${PASS} passed, ${FAIL} failed =====`);
  process.exit(FAIL === 0 ? 0 : 1);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
