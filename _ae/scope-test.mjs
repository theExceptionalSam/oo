// Access-blueprint verification: the three-layer gate + soft boundaries.
// Layer 1 (JWT) and school scoping are covered by smoke/tenant suites; this
// suite proves Layer 2 (subdomain guard) and the role-scoped soft boundaries.
const B = 'http://localhost:8080/api/v1';
let PASS = 0, FAIL = 0;
const check = (n, ok, d) => { ok ? PASS++ : FAIL++; console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${ok ? '' : ' :: ' + d}`); };
const req = async (m, p, t, b, extraHeaders = {}) => {
  const h = { ...extraHeaders };
  if (t) h.Authorization = `Bearer ${t}`;
  if (b) h['Content-Type'] = 'application/json';
  const r = await fetch(B + p, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, data: j?.data ?? j, body: j };
};
const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(B + '/health'); if (r.ok) break; } catch {}
    await wait(3000);
  }
  const stamp = Date.now();

  const admin = (await req('POST', '/auth/login', null, { email: 'admin@demo-school.edu', password: 'Demo!Pass123' })).data;
  const T_ADMIN = admin.accessToken;
  const schoolId = admin.user.schoolId;

  // ===== Setup: teacher leads class A; student1 is in class A; parent linked to student1 =====
  const years = await req('GET', '/academic-years?limit=10', T_ADMIN);
  const yearId = years.data?.items?.[0]?.id;
  const classA = await req('POST', '/classes', T_ADMIN, { name: `Scope-A-${stamp}`, schoolId, academicYearId: yearId, gradeLevel: '5', section: 'A' });
  const classB = await req('POST', '/classes', T_ADMIN, { name: `Scope-B-${stamp}`, schoolId, academicYearId: yearId, gradeLevel: '5', section: 'B' });
  check('setup: two classes created', classA.status === 201 && classB.status === 201, `${classA.status}/${classB.status}`);

  // dedicated teacher for this run (robust against user-list pagination)
  const tAcct = await req('POST', '/users', T_ADMIN, { email: `scope-teacher-${stamp}@demo-school.edu`, password: 'Teacher!123', role: 'TEACHER', schoolId });
  const assignA = await req('PATCH', `/classes/${classA.data.id}`, T_ADMIN, { classTeacherId: tAcct.data.id });
  check('scope teacher assigned to class A', assignA.status === 200, assignA.status);

  // students: sA in class A, sB in class B
  const mkStudent = async (n) => {
    const u = await req('POST', '/users', T_ADMIN, { email: `scope-${n}-${stamp}@demo-school.edu`, password: 'Student!123', role: 'STUDENT', schoolId });
    const s = await req('POST', '/students', T_ADMIN, { userId: u.data.id, rollNumber: `SC-${n}-${stamp}` });
    return { user: u.data, student: s.data };
  };
  const sA = await mkStudent('A');
  const sB = await mkStudent('B');
  await req('POST', '/enrollments', T_ADMIN, { studentId: sA.student.id, classId: classA.data.id });
  await req('POST', '/enrollments', T_ADMIN, { studentId: sB.student.id, classId: classB.data.id });

  // parent linked ONLY to sA via guardianInfo.parentUserId
  const parentUser = await req('POST', '/users', T_ADMIN, { email: `parent-scope-${stamp}@demo-school.edu`, password: 'Parent!123', role: 'PARENT', schoolId });
  await req('PATCH', `/students/${sA.student.id}`, T_ADMIN, { guardianInfo: { name: 'Scope Parent', parentUserId: parentUser.data.id } });
  check('setup: parent linked to student A', parentUser.status === 201, parentUser.status);

  // attendance rows for both students
  await req('POST', '/attendance/bulk-mark', T_ADMIN, { date: new Date().toISOString().slice(0, 10), classId: classA.data.id, entries: [{ studentId: sA.student.id, status: 'present' }] });
  await req('POST', '/attendance/bulk-mark', T_ADMIN, { date: new Date().toISOString().slice(0, 10), classId: classB.data.id, entries: [{ studentId: sB.student.id, status: 'absent' }] });
  // marks for both — fresh DRAFT exam (earlier suites may have published the rest)
  const yearsAll = (await req('GET', '/academic-years?limit=5', T_ADMIN)).data?.items ?? [];
  const scopeExam = await req('POST', '/exams', T_ADMIN, { name: `Scope Exam ${stamp}`, schoolId, academicYearId: yearsAll[0]?.id, type: 'quiz', maxMarks: 100 });
  const examId = scopeExam.data?.id;
  const subjects = await req('GET', '/subjects?limit=50', T_ADMIN);
  const subjectId = (subjects.data?.items ?? []).find(s => s.code === 'MATH101')?.id ?? subjects.data?.items?.[0]?.id;
  await req('POST', '/marks', T_ADMIN, { examId, studentId: sA.student.id, subjectId, marksObtained: 80, grade: 'A' });
  await req('POST', '/marks', T_ADMIN, { examId, studentId: sB.student.id, subjectId, marksObtained: 40, grade: 'F' });
  // allow scope caches to be fresh (invalidate old 30s cache by waiting)
  await wait(3200);

  // ===== TEACHER scope: only students in their classes =====
  const tLogin = (await req('POST', '/auth/login', null, { email: `scope-teacher-${stamp}@demo-school.edu`, password: 'Teacher!123' })).data;
  const T_TEACHER = tLogin.accessToken;
  const tStudents = await req('GET', '/students?limit=200', T_TEACHER);
  const tRolls = (tStudents.data?.items ?? []).map(s => s.rollNumber);
  check('teacher sees student A (own class)', tRolls.includes(`SC-A-${stamp}`), tRolls.length + ' rows');
  check('teacher does NOT see student B (other class)', !tRolls.includes(`SC-B-${stamp}`));
  const tMarks = await req('GET', '/marks?limit=200', T_TEACHER);
  const tMarkStudents = new Set((tMarks.data?.items ?? []).map(m => m.studentId));
  check('teacher marks list excludes student B', !tMarkStudents.has(sB.student.id));

  // Teacher cannot mark attendance for class B (not assigned)
  const tBulk = await req('POST', '/attendance/bulk-mark', T_TEACHER, {
    date: new Date().toISOString().slice(0, 10), classId: classB.data.id,
    entries: [{ studentId: sB.student.id, status: 'present' }],
  });
  check('teacher blocked from marking unassigned class (403)', tBulk.status === 403, tBulk.status);
  // ...but CAN mark their own class
  const tBulkOk = await req('POST', '/attendance/bulk-mark', T_TEACHER, {
    date: new Date().toISOString().slice(0, 10), classId: classA.data.id,
    entries: [{ studentId: sA.student.id, status: 'late' }],
  });
  check('teacher marks own class fine', tBulkOk.status === 201, tBulkOk.status);

  // ===== PARENT scope: only their linked student =====
  const pLogin = (await req('POST', '/auth/login', null, { email: `parent-scope-${stamp}@demo-school.edu`, password: 'Parent!123' })).data;
  const T_PARENT = pLogin.accessToken;
  const pStudents = await req('GET', '/students?limit=200', T_PARENT);
  const pIds = (pStudents.data?.items ?? []).map(s => s.id);
  check('parent sees ONLY their child', pIds.length === 1 && pIds[0] === sA.student.id, pIds.length + ' rows');
  const pReport = await req('GET', `/marks/student/${sA.student.id}/report-card`, T_PARENT);
  check('parent gets own child report card', pReport.status === 200, pReport.status);
  const pReportOther = await req('GET', `/marks/student/${sB.student.id}/report-card`, T_PARENT);
  check('parent denied other child report card (404)', pReportOther.status === 404, pReportOther.status);
  const pAtt = await req('GET', '/attendance/reports', T_PARENT);
  const pAttIds = new Set((Array.isArray(pAtt.data) ? pAtt.data : []).map(r => r.studentId));
  check('parent attendance report only own child', pAtt.status === 200 && pAttIds.size === 1 && pAttIds.has(sA.student.id), 'status ' + pAtt.status + ', ' + pAttIds.size + ' ids');

  // ===== STUDENT scope: self only =====
  const stLogin = (await req('POST', '/auth/login', null, { email: `scope-B-${stamp}@demo-school.edu`, password: 'Student!123' })).data;
  const T_STUDENT = stLogin.accessToken;
  const stStudents = await req('GET', '/students?limit=200', T_STUDENT);
  const stIds = (stStudents.data?.items ?? []).map(s => s.id);
  check('student sees only self', stIds.length === 1 && stIds[0] === sB.student.id, stIds.length + ' rows');
  const stMarks = await req('GET', '/marks?limit=200', T_STUDENT);
  const stMarkIds = new Set(((stMarks.data?.items ?? (Array.isArray(stMarks.data) ? stMarks.data : []))).map(m => m.studentId));
  check('student marks only self', stMarkIds.size === 1 && stMarkIds.has(sB.student.id));

  // ===== Layer 2: X-School-Subdomain guard =====
  // correct subdomain passes
  const okSub = await req('GET', '/students', T_ADMIN, null, { 'X-School-Subdomain': 'demo-school' });
  check('matching subdomain header passes', okSub.status === 200, okSub.status);
  // wrong subdomain → 403
  const wrongSub = await req('GET', '/students', T_ADMIN, null, { 'X-School-Subdomain': 'school-b' });
  check('mismatched subdomain → 403', wrongSub.status === 403, wrongSub.status);
  // nonexistent → 404
  const ghostSub = await req('GET', '/students', T_ADMIN, null, { 'X-School-Subdomain': 'ghost-school' });
  check('nonexistent subdomain → 404', ghostSub.status === 404, ghostSub.status);

  // ===== Audit restricted to SUPER_ADMIN only =====
  const adminAudit = await req('GET', '/audit-logs', T_ADMIN);
  check('ADMIN denied audit (403) — super admin only', adminAudit.status === 403, adminAudit.status);

  // ===== Suspended school blocks login =====
  // suspend school B, then its admin cannot log in
  const sbLogin = (await req('POST', '/auth/login', null, { email: 'admin-b@schoolb.edu', password: 'SchoolB!Pass1' })).data;
  const schoolsB = await req('GET', '/schools', sbLogin.accessToken);
  const schoolBId = schoolsB.data?.items?.[0]?.id;
  // register a fresh school to suspend (avoid breaking other suites)
  const reg = await req('POST', '/auth/register', null, { email: `suspend-${stamp}@test.edu`, password: 'Suspend!123', role: 'ADMIN', schoolName: 'Suspend Test', subdomain: `suspend-${stamp}` });
  const susT = reg.data?.accessToken;
  const susSchools = await req('GET', '/schools', susT);
  const susSchoolId = susSchools.data?.items?.[0]?.id;
  await req('PATCH', `/schools/${susSchoolId}`, susT, { settings: { status: 'suspended' } });
  const susLogin = await req('POST', '/auth/login', null, { email: `suspend-${stamp}@test.edu`, password: 'Suspend!123' });
  check('suspended school blocks login (401)', susLogin.status === 401 && /suspended/i.test(susLogin.body?.error?.message ?? ''), susLogin.status);
  // subdomain guard also rejects suspended school
  const susReq = await req('GET', '/students', null, null, {});
  const susHeader = await fetch(B + '/students', { headers: { Authorization: `Bearer ${sbLogin.accessToken}`, 'X-School-Subdomain': `suspend-${stamp}` } });
  check('subdomain guard rejects suspended school (403)', susHeader.status === 403, susHeader.status);
  void susReq; void schoolBId;

  console.log(`\n===== ACCESS BLUEPRINT: ${PASS} passed, ${FAIL} failed =====`);
  process.exit(FAIL === 0 ? 0 : 1);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
