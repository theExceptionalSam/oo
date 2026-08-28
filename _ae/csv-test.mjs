// CSV import/export round-trip verification.
const B = 'http://localhost:8080/api/v1';
let PASS = 0, FAIL = 0;
const check = (n, ok, d) => { ok ? PASS++ : FAIL++; console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${ok ? '' : ' :: ' + d}`); };
const req = async (m, p, t, b, raw = false) => {
  const h = {};
  if (t) h.Authorization = `Bearer ${t}`;
  if (b && !raw) h['Content-Type'] = 'application/json';
  const r = await fetch(B + p, { method: m, headers: h, body: b ? (raw ? b : JSON.stringify(b)) : undefined });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch {}
  return { status: r.status, data: j?.data ?? j, text };
};

async function main() {
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(B + '/health'); if (r.ok) break; } catch {}
    await new Promise(r => setTimeout(r, 3000));
  }

  const a = (await req('POST', '/auth/login', null, { email: 'admin@demo-school.edu', password: 'Demo!Pass123' })).data;
  const T = a.accessToken;
  const schoolId = a.user.schoolId;

  // ---- 1. Export students: CSV with header + data rows ----
  const exp = await req('GET', '/export/students', T);
  const csvOk = exp.status === 200 && exp.text.startsWith('rollNumber,email,fullName') && exp.text.includes('STD-001');
  check('export students CSV', csvOk, exp.text.slice(0, 80));
  const hasPassword = /password/i.test(exp.text);
  check('export contains no password columns', !hasPassword);

  // ---- 2. Import students: 2 new + 1 duplicate (skipped) ----
  const stamp = Date.now();
  const importCsv = [
    'fullName,email,rollNumber,guardianName,guardianPhone',
    `Csv One,csv1-${stamp}@demo-school.edu,CSV-001,Guardian One,+2348000000001`,
    `Csv Two,csv2-${stamp}@demo-school.edu,CSV-002,Guardian Two,+2348000000002`,
    `Csv Dup,admin@demo-school.edu,CSV-003,,`, // duplicate email → skipped
  ].join('\n');
  const imp = await req('POST', '/import/students', T, { csv: importCsv });
  check('students import 2/3 (1 skipped)', imp.status === 201 && imp.data?.imported === 2 && imp.data?.skipped?.length === 1,
    JSON.stringify(imp.data)?.slice(0, 120));

  // ---- 3. Imported student can log in with the default password ----
  const loginNew = await req('POST', '/auth/login', null, { email: `csv1-${stamp}@demo-school.edu`, password: 'Student!123' });
  check('imported student can log in (default password)', loginNew.status === 200, loginNew.status);

  // ---- 4. Marks import: resolve roll numbers + subject codes ----
  const exams = await req('GET', '/exams?limit=50', T);
  const exam = exams.data?.items?.[0];
  const marksCsv = [
    'rollNumber,subjectCode,marksObtained,grade',
    'STD-001,MATH101,91,A',
    'CSV-001,MATH101,64,C',
    'STD-999,MATH101,50,C',      // unknown roll → skipped
    'STD-001,NOPE99,50,C',       // unknown subject → skipped
  ].join('\n');
  const mi = await req('POST', '/import/marks', T, { examId: exam?.id, csv: marksCsv });
  check('marks import 2/4 with skip reasons', mi.status === 201 && mi.data?.imported === 2 && mi.data?.skipped?.length === 2,
    JSON.stringify(mi.data)?.slice(0, 150));

  // ---- 5. Marks export reflects the imported rows ----
  const mExp = await req('GET', '/export/marks', T);
  check('marks export CSV', mExp.status === 200 && mExp.text.includes('Mathematics') && mExp.text.includes('91'),
    mExp.text.slice(0, 80));

  // ---- 6. Tenant scoping: school B exports see nothing of school A ----
  const b = (await req('POST', '/auth/login', null, { email: 'admin-b@schoolb.edu', password: 'SchoolB!Pass1' })).data;
  const bExp = await req('GET', '/export/students', b.accessToken);
  const bRows = bExp.text.trim().split('\n').length - 1;
  check('school B export excludes school A students', bExp.status === 200 && bRows === 0, `${bRows} rows`);
  const bImport = await req('POST', '/import/marks', b.accessToken, { examId: exam?.id, csv: 'rollNumber,subjectCode,marksObtained\nSTD-001,MATH101,10' });
  check('school B cannot import into school A exam', bImport.status === 400, bImport.status);

  // ---- 7. Teacher denied export? (teachers allowed export per RBAC) — student denied ----
  const s = (await req('POST', '/auth/login', null, { email: 'student1@demo-school.edu', password: 'Student!123' })).data;
  const sExp = await req('GET', '/export/students', s.accessToken);
  check('students denied export access (403)', sExp.status === 403, sExp.status);

  // ---- 8. Other exports work ----
  for (const entity of ['attendance', 'payments', 'users', 'announcements']) {
    const r = await req('GET', `/export/${entity}`, T);
    check(`export ${entity}`, r.status === 200 && r.text.split('\n')[0].includes(','), r.status);
  }

  console.log(`\n===== CSV IMPORT/EXPORT: ${PASS} passed, ${FAIL} failed =====`);
  process.exit(FAIL === 0 ? 0 : 1);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
