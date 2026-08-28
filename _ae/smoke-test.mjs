// SchoolSync API smoke test v3 (Node) — exercises every module's core endpoints.
const BASE = 'http://localhost:3000/api/v1';
let PASS = 0, FAIL = 0;
let TOKEN = '', ctx = {};

async function req(method, path, token, body) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-json */ }
  return { status: res.status, body: json };
}

function check(name, expected, actual, body) {
  if (actual === expected) { PASS++; console.log(`PASS [${actual}] ${name}`); }
  else { FAIL++; console.log(`FAIL [${actual} != ${expected}] ${name} :: ${JSON.stringify(body).slice(0, 180)}`); }
}

const val = (o, k) => o?.data?.[k];

async function main() {
  // ---------- 1. Auth ----------
  let r = await req('POST', '/auth/login', null, { email: 'admin@demo-school.edu', password: 'Demo!Pass123' });
  check('auth/login', 200, r.status, r.body);
  TOKEN = val(r.body, 'accessToken');
  const REFRESH = val(r.body, 'refreshToken');
  if (!TOKEN) { console.log('FATAL: no token'); process.exit(1); }

  r = await req('GET', '/auth/me', TOKEN);
  check('auth/me', 200, r.status, r.body);

  r = await req('POST', '/auth/refresh', null, { refreshToken: REFRESH });
  check('auth/refresh', 200, r.status, r.body);

  r = await req('POST', '/auth/login', null, { email: 'admin@demo-school.edu', password: 'wrong-password' });
  check('auth/login wrong password -> 401', 401, r.status, r.body);

  r = await req('POST', '/auth/logout', TOKEN);
  check('auth/logout', 200, r.status, r.body);

  // Logout now revokes the access token — verify rejection, then re-login.
  r = await req('GET', '/auth/me', TOKEN);
  check('token revoked after logout -> 401', 401, r.status, r.body);
  r = await req('POST', '/auth/login', null, { email: 'admin@demo-school.edu', password: 'Demo!Pass123' });
  TOKEN = val(r.body, 'accessToken');
  check('re-login after logout', 200, r.status, r.body);

  r = await req('GET', '/users', null);
  check('no token -> 401', 401, r.status, r.body);

  r = await req('POST', '/auth/login', null, { email: 'not-an-email', password: '1' });
  check('validation: bad login dto -> 400', 400, r.status, r.body);

  // ---------- 2. Users ----------
  r = await req('POST', '/users', TOKEN, { email: 'teacher-'+Date.now()+'@demo-school.edu', password: 'Teacher!123', role: 'TEACHER', profile: { fullName: 'Test Teacher' } });
  check('POST /users (teacher)', 201, r.status, r.body);
  const TEACHER_ID = val(r.body, 'id');
  if (!TEACHER_ID) console.log('  (teacher may already exist — continuing with lookup)');
  if (!TEACHER_ID) {
    const list = await req('GET', '/users?limit=100', TOKEN);
    const found = (list.body?.data?.items || []).find(u => u.email === 'teacher1@demo-school.edu');
    ctx.teacherId = found?.id;
  } else ctx.teacherId = TEACHER_ID;

  r = await req('POST', '/users', TOKEN, { email: 'student-'+Date.now()+'@demo-school.edu', password: 'Student!123', role: 'STUDENT', profile: { fullName: 'Test Student' } });
  check('POST /users (student)', 201, r.status, r.body);
  let STUDENT_USER_ID = val(r.body, 'id');
  if (!STUDENT_USER_ID) {
    const list = await req('GET', '/users?limit=100', TOKEN);
    const found = (list.body?.data?.items || []).find(u => u.email === 'student1@demo-school.edu');
    STUDENT_USER_ID = found?.id;
  }

  r = await req('GET', '/users', TOKEN);
  check('GET /users', 200, r.status, r.body);

  r = await req('POST', '/auth/login', null, { email: 'student1@demo-school.edu', password: 'Student!123' });
  check('login with created user (password hashed)', 200, r.status, r.body);

  // ---------- 3. Schools ----------
  r = await req('GET', '/schools', TOKEN);
  check('GET /schools', 200, r.status, r.body);
  const SCHOOL_ID = (r.body?.data?.items?.[0] || {})?.id || val(r.body, 'id');

  r = await req('GET', `/schools/${SCHOOL_ID}`, TOKEN);
  check('GET /schools/:id', 200, r.status, r.body);

  r = await req('POST', '/schools', TOKEN, { name: 'Smoke Test School 2', subdomain: `smoke-${Date.now()}`, timezone: 'Africa/Lagos' });
  check('POST /schools (non-super admin correctly rejected)', 403, r.status, r.body);

  // ---------- 4. Academic years ----------
  r = await req('GET', '/academic-years', TOKEN);
  check('GET /academic-years', 200, r.status, r.body);
  const YEAR_ID = (r.body?.data?.items?.[0] || {})?.id || val(r.body, 'id');

  r = await req('POST', '/academic-years', TOKEN, { name: '2026/2027', schoolId: SCHOOL_ID, startDate: '2026-09-01', endDate: '2027-07-31', isCurrent: false });
  check('POST /academic-years', 201, r.status, r.body);

  // ---------- 5. Subjects ----------
  r = await req('POST', '/subjects', TOKEN, { name: 'Mathematics', schoolId: SCHOOL_ID, code: 'MATH101', credits: 2 });
  check('POST /subjects', 201, r.status, r.body);
  let SUBJECT_ID = val(r.body, 'id');
  r = await req('GET', '/subjects', TOKEN);
  check('GET /subjects', 200, r.status, r.body);
  if (!SUBJECT_ID) SUBJECT_ID = (r.body?.data?.items?.[0] || {})?.id;

  // ---------- 6. Classes ----------
  r = await req('POST', '/classes', TOKEN, { name: 'Primary 5A', schoolId: SCHOOL_ID, academicYearId: YEAR_ID, gradeLevel: '5', section: 'A', classTeacherId: ctx.teacherId });
  check('POST /classes', 201, r.status, r.body);
  let CLASS_ID = val(r.body, 'id');
  r = await req('GET', '/classes', TOKEN);
  if (!CLASS_ID) CLASS_ID = (r.body?.data?.items?.[0] || {})?.id;

  r = await req('GET', `/classes/${CLASS_ID}`, TOKEN);
  check('GET /classes/:id', 200, r.status, r.body);

  // ---------- 7. Students ----------
  r = await req('POST', '/students', TOKEN, { userId: STUDENT_USER_ID, rollNumber: 'STD-001', admissionDate: '2026-09-01' });
  check('POST /students', 201, r.status, r.body);
  let STUDENT_ID = val(r.body, 'id');
  r = await req('GET', '/students', TOKEN);
  check('GET /students', 200, r.status, r.body);
  if (!STUDENT_ID) STUDENT_ID = (r.body?.data?.items?.[0] || {})?.id;

  // ---------- 8. Enrollments ----------
  r = await req('POST', '/enrollments', TOKEN, { studentId: STUDENT_ID, classId: CLASS_ID });
  check('POST /enrollments', 201, r.status, r.body);

  r = await req('GET', '/enrollments', TOKEN);
  check('GET /enrollments', 200, r.status, r.body);

  // ---------- 9. Attendance ----------
  r = await req('POST', '/attendance/bulk-mark', TOKEN, { date: '2026-08-21', classId: CLASS_ID, entries: [{ studentId: STUDENT_ID, status: 'present' }] });
  check('POST /attendance/bulk-mark', 201, r.status, r.body);

  r = await req('GET', `/attendance/student/${STUDENT_ID}`, TOKEN);
  check('GET /attendance/student/:id', 200, r.status, r.body);

  r = await req('GET', '/attendance/reports', TOKEN);
  check('GET /attendance/reports (defaults)', 200, r.status, r.body);

  r = await req('GET', '/attendance/reports?from=2026-01-01&to=2026-12-31', TOKEN);
  check('GET /attendance/reports (range)', 200, r.status, r.body);

  r = await req('GET', '/attendance/reports?from=garbage', TOKEN);
  check('GET /attendance/reports (bad date) -> 400', 400, r.status, r.body);

  // ---------- 10. Exams & Marks ----------
  r = await req('POST', '/exams', TOKEN, { name: 'Midterm Math', type: 'midterm', schoolId: SCHOOL_ID, academicYearId: YEAR_ID, startDate: '2026-10-15', endDate: '2026-10-16', maxMarks: 100 });
  check('POST /exams', 201, r.status, r.body);
  let EXAM_ID = val(r.body, 'id');
  r = await req('GET', '/exams', TOKEN);
  check('GET /exams', 200, r.status, r.body);
  if (!EXAM_ID) EXAM_ID = (r.body?.data?.items?.[0] || {})?.id;

  r = await req('POST', '/marks', TOKEN, { examId: EXAM_ID, studentId: STUDENT_ID, subjectId: SUBJECT_ID, marksObtained: 85, grade: 'A' });
  check('POST /marks', 201, r.status, r.body);

  r = await req('GET', `/marks/student/${STUDENT_ID}/report-card`, TOKEN);
  check('GET report-card', 200, r.status, r.body);

  // ---------- 11. Fees & Payments ----------
  r = await req('POST', '/fee-structures', TOKEN, { name: 'Term 1 Tuition', schoolId: SCHOOL_ID, academicYearId: YEAR_ID, amount: 150000, frequency: 'termly', dueDay: 15 });
  check('POST /fee-structures', 201, r.status, r.body);
  let FEE_ID = val(r.body, 'id');
  r = await req('GET', '/fee-structures', TOKEN);
  check('GET /fee-structures', 200, r.status, r.body);
  if (!FEE_ID) FEE_ID = (r.body?.data?.items?.[0] || {})?.id;

  r = await req('POST', '/payments', TOKEN, { studentId: STUDENT_ID, feeStructureId: FEE_ID, amount: 75000, method: 'card' });
  check('POST /payments', 201, r.status, r.body);

  r = await req('GET', '/payments/reports', TOKEN);
  check('GET /payments/reports (defaults)', 200, r.status, r.body);

  r = await req('GET', '/payments/reports?from=2026-01-01&to=2026-12-31', TOKEN);
  check('GET /payments/reports (range)', 200, r.status, r.body);

  // ---------- 12. Communication ----------
  r = await req('POST', '/announcements', TOKEN, { title: 'Smoke Test Announcement', content: 'Hello from smoke test', schoolId: SCHOOL_ID, priority: 'normal' });
  check('POST /announcements', 201, r.status, r.body);

  r = await req('GET', '/announcements', TOKEN);
  check('GET /announcements', 200, r.status, r.body);

  r = await req('POST', '/messages', TOKEN, { receiverId: STUDENT_USER_ID, content: 'Welcome to class!' });
  check('POST /messages (sender from token)', 201, r.status, r.body);

  r = await req('GET', '/messages', TOKEN);
  check('GET /messages', 200, r.status, r.body);

  r = await req('GET', '/notifications', TOKEN);
  check('GET /notifications', 200, r.status, r.body);

  console.log('\n==================================');
  console.log(`SMOKE TEST COMPLETE: ${PASS} passed, ${FAIL} failed`);
  console.log('==================================');
  process.exit(FAIL === 0 ? 0 : 1);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
