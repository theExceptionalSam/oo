// Cross-tenant penetration test — proves school A cannot see or touch school B.
const B = 'http://localhost:3000/api/v1';
let PASS = 0, FAIL = 0;
const check = (name, ok, detail) => {
  if (ok) { PASS++; console.log(`PASS ${name}`); }
  else { FAIL++; console.log(`FAIL ${name} :: ${detail}`); }
};
const req = async (method, path, token, body) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(B + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, data: json?.data ?? json };
};

async function main() {
  // wait for API
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(B + '/health'); if (r.ok) break; } catch {}
    await new Promise(r => setTimeout(r, 3000));
  }

  // ---- Create school B + its admin via public register ----
  await req('POST', '/auth/register', null, {
    email: 'admin-b@schoolb.edu', password: 'SchoolB!Pass1', role: 'ADMIN',
    schoolName: 'School B', subdomain: 'school-b',
  });
  const lb = await req('POST', '/auth/login', null, { email: 'admin-b@schoolb.edu', password: 'SchoolB!Pass1' });
  check('school B admin login', lb.status === 200, lb.status);
  const TOKEN_B = lb.data?.accessToken;
  const schoolBId = lb.data?.user?.schoolId;

  // Admin B plants a record in school B
  const annB = await req('POST', '/announcements', TOKEN_B, {
    title: 'SECRET School B announcement', content: 'tenant secret', schoolId: schoolBId,
  });
  check('school B created own announcement', annB.status === 201, annB.status);
  const annBId = annB.data?.id;

  // ---- School A admin (demo) ----
  const la = await req('POST', '/auth/login', null, { email: 'admin@demo-school.edu', password: 'Demo!Pass123' });
  const TOKEN_A = la.data?.accessToken;
  const schoolAId = la.data?.user?.schoolId;

  // 1. A cannot see B's school in the list
  const schoolsA = await req('GET', '/schools', TOKEN_A);
  const schoolIds = (schoolsA.data?.items ?? []).map(s => s.id);
  check('A school list excludes B', !schoolIds.includes(schoolBId) && schoolIds.length === 1, JSON.stringify(schoolIds));

  // 2. A cannot fetch B's school by id
  const schoolB = await req('GET', `/schools/${schoolBId}`, TOKEN_A);
  check('A cannot GET school B by id (404)', schoolB.status === 404, schoolB.status);

  // 3. A cannot read B's announcement by id
  const ann = await req('GET', `/announcements/${annBId}`, TOKEN_A);
  check('A cannot GET B announcement (404)', ann.status === 404, ann.status);

  // 4. A's announcement list excludes B's records
  const annsA = await req('GET', '/announcements?limit=200', TOKEN_A);
  const titles = (annsA.data?.items ?? []).map(a => a.title);
  check('A announcement list excludes B', !titles.includes('SECRET School B announcement'), titles.length + ' items');

  // 5. A cannot create a record in B (schoolId forced to A)
  const forged = await req('POST', '/announcements', TOKEN_A, {
    title: 'Forged into B?', content: 'should land in A', schoolId: schoolBId,
  });
  check('A create with B schoolId → forced into A', forged.status === 201 && forged.data?.schoolId === schoolAId,
    `schoolId=${forged.data?.schoolId}`);

  // 6. A cannot modify/delete B's announcement
  const patch = await req('PATCH', `/announcements/${annBId}`, TOKEN_A, { title: 'hacked' });
  check('A cannot PATCH B announcement (404)', patch.status === 404, patch.status);
  const del = await req('DELETE', `/announcements/${annBId}`, TOKEN_A);
  check('A cannot DELETE B announcement (404)', del.status === 404, del.status);

  // 7. A cannot see B's users
  const usersA = await req('GET', '/users?limit=200', TOKEN_A);
  const emails = (usersA.data?.items ?? []).map(u => u.email);
  check('A user list excludes B users', !emails.includes('admin-b@schoolb.edu'), emails.length + ' users');

  // 8. Attendance report scoped per tenant
  const repA = await req('GET', '/attendance/reports', TOKEN_A);
  const repB = await req('GET', '/attendance/reports', TOKEN_B);
  check('attendance report scoped (A has data, B empty)', (repA.data?.length ?? 0) > 0 && (repB.data?.length ?? 0) === 0,
    `A=${repA.data?.length} B=${repB.data?.length}`);

  // 9. B verifies their record intact
  const annB2 = await req('GET', `/announcements/${annBId}`, TOKEN_B);
  check('B still sees own record', annB2.status === 200 && annB2.data?.title === 'SECRET School B announcement', annB2.status);

  console.log(`\n===== TENANT ISOLATION: ${PASS} passed, ${FAIL} failed =====`);
  process.exit(FAIL === 0 ? 0 : 1);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
