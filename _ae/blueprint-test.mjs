// Blueprint hardening verification: roles, lockout, school profile, terms,
// student workflow/biodata, exam state machine + grading.
const B = 'http://localhost:8080/api/v1';
let PASS = 0, FAIL = 0;
const check = (n, ok, d) => { ok ? PASS++ : FAIL++; console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${ok ? '' : ' :: ' + d}`); };
const req = async (m, p, t, b) => {
  const h = {};
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

  // Self-provision a throwaway super admin for audit reads — no committed creds.
  const saEmail = `bp-sa-${Date.now()}@schoolsync.test`;
  await req('POST', '/auth/register', null, { email: saEmail, password: 'Bp!S3cret99', role: 'SUPER_ADMIN' });
  const owner = (await req('POST', '/auth/login', null, { email: saEmail, password: 'Bp!S3cret99' })).data;
  const admin = (await req('POST', '/auth/login', null, { email: 'admin@demo-school.edu', password: 'Demo!Pass123' })).data;
  const T = admin.accessToken;
  const schoolId = admin.user.schoolId;

  // ===== 1. School profile fields (2.1) =====
  const upSchool = await req('PATCH', `/schools/${schoolId}`, T, {
    motto: 'Knowledge and Character', state: 'Lagos', lga: 'Ikeja',
    phone: '+2348012345678', schoolType: 'Primary', currency: 'NGN',
    schoolLevels: 'Nursery,Primary',
    primaryContact: { name: 'Ada Admin', phone: '08012345678', email: 'admin@demo-school.edu', role: 'Principal' },
  });
  const school = upSchool.data;
  check('school profile fields persist', upSchool.status === 200 && school?.motto === 'Knowledge and Character'
    && school?.state === 'Lagos' && school?.primaryContact?.role === 'Principal', upSchool.status);
  check('school code auto-generated', /^SCH-\d+$/.test(school?.schoolCode ?? ''), school?.schoolCode);

  // ===== 2. ACCOUNTANT role: fees yes, users no (1.1) =====
  const accUser = await req('POST', '/users/invite', T, { email: `bursar-${stamp}@demo-school.edu`, role: 'ACCOUNTANT' });
  const accToken = accUser.data?.inviteUrl?.split('token=')[1];
  const accAccept = await req('POST', '/auth/accept-invite', null, { token: accToken, password: 'Bursar!Pass123' });
  const accLogin = (await req('POST', '/auth/login', null, { email: `bursar-${stamp}@demo-school.edu`, password: 'Bursar!Pass123' })).data;
  const T_ACC = accLogin.accessToken;
  check('accountant created via invite', accAccept.status === 200 && T_ACC, accAccept.status);
  const accFees = await req('GET', '/fee-structures', T_ACC);
  check('accountant CAN access fee structures', accFees.status === 200, accFees.status);
  const accPay = await req('POST', '/payments', T_ACC, { studentId: '00000000-0000-0000-0000-000000000000', feeStructureId: '00000000-0000-0000-0000-000000000000', amount: 1 });
  check('accountant CAN record payments (not 403)', accPay.status !== 403, accPay.status);
  const accUsers = await req('GET', '/users', T_ACC);
  check('accountant DENIED user management (403)', accUsers.status === 403, accUsers.status);
  const accAudit = await req('GET', '/audit-logs', T_ACC);
  check('accountant denied audit (403)', accAudit.status === 403, accAudit.status);

  // ===== 3. Brute-force lockout (1.3) =====
  const lockEmail = `lockout-${stamp}@demo-school.edu`;
  await req('POST', '/users', T, { email: lockEmail, password: 'LockMe!1234', role: 'TEACHER', schoolId });
  let statuses = [];
  for (let i = 0; i < 6; i++) {
    const r = await req('POST', '/auth/login', null, { email: lockEmail, password: 'wrong-password' });
    statuses.push(r.status);
  }
  const lockedMsg = (await req('POST', '/auth/login', null, { email: lockEmail, password: 'LockMe!1234' })).body?.error?.message ?? '';
  check('5 failures then lock message', statuses.filter(s => s === 401).length >= 5 && /locked/i.test(lockedMsg), lockedMsg);
  // failed logins audited
  const auditCheck = await req('GET', `/audit-logs?limit=100`, owner.accessToken);
  const loginFails = (auditCheck.data?.items ?? []).filter(e => e.action === 'LOGIN' && e.result === 'failure' && e.userEmail === lockEmail);
  check('failed logins recorded in audit', loginFails.length >= 5, loginFails.length);

  // ===== 4. Student biodata + age + status workflow (3.1, 3.2) =====
  const bioUser = await req('POST', '/users', T, { email: `bio-${stamp}@demo-school.edu`, password: 'Student!123', role: 'STUDENT', schoolId });
  const dob = '2014-06-15';
  const bioStudent = await req('POST', '/students', T, {
    userId: bioUser.data.id, rollNumber: `BIO-${stamp}`,
    dateOfBirth: dob, gender: 'male', bloodGroup: 'O+', genotype: 'AA',
    stateOfOrigin: 'Lagos', localGovernment: 'Surulere',
  });
  const st = bioStudent.data;
  const expectedAge = new Date().getFullYear() - 2014 - (new Date().getMonth() < 5 || (new Date().getMonth() === 5 && new Date().getDate() < 15) ? 1 : 0);
  check('biodata persisted + computed age', bioStudent.status === 201 && st?.dateOfBirth?.startsWith('2014-06') && st?.age === expectedAge,
    `age=${st?.age} expected=${expectedAge}`);

  // status: applicant → active (valid), applicant → graduated (invalid)
  const toActive = await req('POST', `/students/${st.id}/status`, T, { status: 'active', reason: 'admitted' });
  check('applicant → active allowed', toActive.status === 201 && toActive.data?.status === 'active', toActive.status);
  await req('POST', `/students/${st.id}/status`, T, { status: 'graduated' }); // valid per blueprint
  const badTransition = await req('POST', `/students/${st.id}/status`, T, { status: 'active' });
  check('graduated is terminal → active rejected (400)', badTransition.status === 400, badTransition.status);
  const history = (await req('GET', `/students/${st.id}`, T)).data?.statusHistory ?? [];
  check('status history recorded', history.length >= 1 && history[0]?.to === 'active', history.length);

  // ===== 5. Exam state machine + marks gating + grading (4.1, 4.2) =====
  const years = (await req('GET', '/academic-years?limit=5', T)).data?.items ?? [];
  const exam = await req('POST', '/exams', T, {
    name: `Blueprint Exam ${stamp}`, schoolId, academicYearId: years[0]?.id,
    type: 'midterm', maxMarks: 100, term: 'first',
  });
  check('exam created with term + draft status', exam.status === 201 && exam.data?.term === 'first' && exam.data?.status === 'draft', exam.data?.status);

  // marks enterable while draft, auto-graded
  const subjects = (await req('GET', '/subjects?limit=10', T)).data?.items ?? [];
  const mark1 = await req('POST', '/marks', T, { examId: exam.data.id, studentId: st.id, subjectId: subjects[0]?.id, marksObtained: 85 });
  check('marks auto-graded via default bands (85→A)', mark1.status === 201 && mark1.data?.grade === 'A', mark1.data?.grade);

  // custom grading: 50+ = A
  await req('PATCH', `/schools/${schoolId}`, T, { settings: { gradingSystem: [{ minScore: 50, maxScore: 100, grade: 'A' }, { minScore: 0, maxScore: 49, grade: 'F' }] } });
  const mark2 = await req('POST', '/marks', T, { examId: exam.data.id, studentId: st.id, subjectId: subjects[1]?.id ?? subjects[0]?.id, marksObtained: 55 });
  check('per-school grading config honored (55→A)', mark2.status === 201 && mark2.data?.grade === 'A', mark2.data?.grade);
  await req('PATCH', `/schools/${schoolId}`, T, { settings: {} }); // reset

  // invalid transition draft→published; valid chain to published; marks locked
  const badExam = await req('POST', `/exams/${exam.data.id}/status`, T, { status: 'published' });
  check('draft → published rejected (400)', badExam.status === 400, badExam.status);
  for (const s of ['submitted', 'reviewed', 'approved', 'published']) {
    await req('POST', `/exams/${exam.data.id}/status`, T, { status: s });
  }
  const publishedExam = (await req('GET', `/exams/${exam.data.id}`, T)).data;
  check('full chain draft→published works', publishedExam?.status === 'published', publishedExam?.status);
  const markBlocked = await req('POST', '/marks', T, { examId: exam.data.id, studentId: st.id, subjectId: subjects[0]?.id, marksObtained: 99 });
  check('marks blocked on published exam (403)', markBlocked.status === 403, markBlocked.status);

  // ===== 6. Helmet headers =====
  const h = await fetch(B + '/health');
  const csp = h.headers.get('content-security-policy') ?? '';
  const pp = h.headers.get('permissions-policy') ?? '';
  const hsts = h.headers.get('strict-transport-security') ?? '';
  check('CSP header present', csp.includes("default-src 'self'"), csp.slice(0, 40));
  check('Permissions-Policy locks camera/mic/geo', pp.includes('camera=()') && pp.includes('geolocation=()'), pp);
  check('HSTS header present', hsts.includes('max-age=31536000'), hsts);

  console.log(`\n===== BLUEPRINT: ${PASS} passed, ${FAIL} failed =====`);
  process.exit(FAIL === 0 ? 0 : 1);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
