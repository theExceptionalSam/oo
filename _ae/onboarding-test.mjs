// Onboarding suite: school self-registration, change-password with token
// invalidation, and the invite → accept-invite flow.
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

async function main() {
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(B + '/health'); if (r.ok) break; } catch {}
    await new Promise(r => setTimeout(r, 3000));
  }
  const stamp = Date.now();

  // ===== 1. School self-registration =====
  const reg = await req('POST', '/auth/register', null, {
    email: `principal-${stamp}@newacademy.edu`, password: 'NewSch00l!Pass',
    role: 'ADMIN', schoolName: 'New Academy', subdomain: `new-academy-${stamp}`,
  });
  check('school self-registers via /auth/register', reg.status === 201 && reg.data?.accessToken, reg.status);
  const NEW_T = reg.data.accessToken;

  // Subdomain conflict → 409 with a clean message
  const dup = await req('POST', '/auth/register', null, {
    email: `other-${stamp}@newacademy.edu`, password: 'NewSch00l!Pass',
    role: 'ADMIN', schoolName: 'New Academy Impostor', subdomain: `new-academy-${stamp}`,
  });
  check('duplicate subdomain rejected with 409', dup.status === 409 && /taken/i.test(dup.body?.error?.message ?? ''), dup.status);

  // The new admin is properly tenant-scoped (sees only their school)
  const schools = await req('GET', '/schools', NEW_T);
  const schoolNames = (schools.data?.items ?? []).map(s => s.name);
  check('new admin sees only their school', schoolNames.length === 1 && schoolNames[0] === 'New Academy', schoolNames.join(','));

  // ===== 2. Change password + global token invalidation =====
  const cp = await req('POST', '/auth/change-password', NEW_T, {
    currentPassword: 'NewSch00l!Pass', newPassword: 'Rotated!Pass99',
  });
  check('change-password succeeds', cp.status === 200, cp.status);

  const afterOld = await req('GET', '/auth/me', NEW_T);
  check('old access token dead after change (401)', afterOld.status === 401, afterOld.status);

  const wrongCp = await req('POST', '/auth/login', null, { email: `principal-${stamp}@newacademy.edu`, password: 'NewSch00l!Pass' });
  check('old password rejected at login', wrongCp.status === 401, wrongCp.status);

  const reLogin = await req('POST', '/auth/login', null, { email: `principal-${stamp}@newacademy.edu`, password: 'Rotated!Pass99' });
  check('new password works at login', reLogin.status === 200, reLogin.status);
  const NEW_T2 = reLogin.data.accessToken;

  const wrongCurrent = await req('POST', '/auth/change-password', NEW_T2, {
    currentPassword: 'Wrong!Pass1', newPassword: 'Whatever!123',
  });
  check('wrong current password rejected (401)', wrongCurrent.status === 401, wrongCurrent.status);

  // ===== 3. Invite → accept-invite flow =====
  const inv = await req('POST', '/users/invite', NEW_T2, { email: `teacher-${stamp}@newacademy.edu`, role: 'TEACHER' });
  check('invite creates account + link', inv.status === 201 && inv.data?.inviteUrl?.includes('token='), inv.status);
  const token = inv.data?.inviteUrl?.split('token=')[1];

  // Invited user cannot log in before accepting (no password set)
  const early = await req('POST', '/auth/login', null, { email: `teacher-${stamp}@newacademy.edu`, password: 'Guess!1234' });
  check('invited user cannot log in before accepting', early.status === 401, early.status);

  // Bad token rejected
  const badToken = await req('POST', '/auth/accept-invite', null, { token: 'not-a-token', password: 'Valid!Pass1' });
  check('invalid invite token rejected (400)', badToken.status === 400, badToken.status);

  // Accept with valid token
  const accept = await req('POST', '/auth/accept-invite', null, { token, password: 'Teacher!Pass77' });
  check('accept-invite sets password', accept.status === 200, accept.status);

  // Token is single-use
  const reuse = await req('POST', '/auth/accept-invite', null, { token, password: 'Another!Pass1' });
  check('invite token is single-use (400 on reuse)', reuse.status === 400, reuse.status);

  // Teacher logs in with the password they chose
  const tLogin = await req('POST', '/auth/login', null, { email: `teacher-${stamp}@newacademy.edu`, password: 'Teacher!Pass77' });
  check('invited teacher logs in with chosen password', tLogin.status === 200, tLogin.status);
  const TT = tLogin.data.accessToken;

  // Teacher is scoped to the inviting school and denied admin routes
  const tSchools = await req('GET', '/schools', TT);
  const tSchoolNames = (tSchools.data?.items ?? []).map(s => s.name);
  check('teacher lands in the right tenant', tSchoolNames.length === 1 && tSchoolNames[0] === 'New Academy', tSchoolNames.join(','));
  const tDenied = await req('GET', '/audit-logs', TT);
  check('teacher denied admin routes (403)', tDenied.status === 403, tDenied.status);

  // Teachers cannot send invites
  const tInvite = await req('POST', '/users/invite', TT, { email: `x-${stamp}@newacademy.edu`, role: 'TEACHER' });
  check('teachers cannot invite (403)', tInvite.status === 403, tInvite.status);

  console.log(`\n===== ONBOARDING: ${PASS} passed, ${FAIL} failed =====`);
  process.exit(FAIL === 0 ? 0 : 1);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
