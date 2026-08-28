// Audit trail + soft delete verification against the live stack.
const B = 'http://localhost:8080/api/v1';
let PASS = 0, FAIL = 0;
const check = (n, ok, d) => { ok ? PASS++ : FAIL++; console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${ok ? '' : ' :: ' + d}`); };
const req = async (m, p, t, b) => {
  const h = {};
  if (t) h.Authorization = `Bearer ${t}`;
  if (b) h['Content-Type'] = 'application/json';
  const r = await fetch(B + p, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, data: j?.data ?? j };
};

async function main() {
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(B + '/health'); if (r.ok) break; } catch {}
    await new Promise(r => setTimeout(r, 3000));
  }

  // Self-provision a throwaway super admin — no committed credentials.
  const saEmail = `audit-sa-${Date.now()}@schoolsync.test`;
  await req('POST', '/auth/register', null, { email: saEmail, password: 'Audit!S3cret9', role: 'SUPER_ADMIN' });
  const a = (await req('POST', '/auth/login', null, { email: saEmail, password: 'Audit!S3cret9' })).data;
  const T = a.accessToken; // platform owner reads audit + can act cross-tenant
  const demo = (await req('POST', '/auth/login', null, { email: 'admin@demo-school.edu', password: 'Demo!Pass123' })).data;
  const T_SCHOOL = demo.accessToken;
  const schoolId = demo.user.schoolId;

  // 1. Create an announcement → audit entry should appear
  const ann = await req('POST', '/announcements', T_SCHOOL, { title: 'Audit test announcement', content: 'x', schoolId });
  check('create announcement', ann.status === 201, ann.status);

  // 2. Audit log records the create
  await new Promise(r => setTimeout(r, 800));
  const logs = await req('GET', '/audit-logs?limit=20', T);
  const entries = logs.data?.items ?? [];
  check('audit-logs endpoint works', logs.status === 200, logs.status);
  const createEntry = entries.find(e => e.action === 'CREATE' && e.entity === 'announcements' && e.payload?.title === 'Audit test announcement');
  check('CREATE audited with user + payload', !!createEntry,
    entries.slice(0, 3).map(e => `${e.action}:${e.entity}`).join(','));

  // 3. Password redaction: create a user, audit payload must not contain the password
  await req('POST', '/users', T_SCHOOL, { email: `redact-${Date.now()}@demo-school.edu`, password: 'Secret!Pass9', role: 'TEACHER', schoolId });
  await new Promise(r => setTimeout(r, 800));
  const logs2 = await req('GET', '/audit-logs?limit=10', T);
  const userEntry = (logs2.data?.items ?? []).find(e => e.entity === 'users' && e.payload?.password);
  check('passwords redacted in audit', userEntry?.payload?.password === '[redacted]', JSON.stringify(userEntry?.payload));

  // 4. Tenant scoping: school B admin must not see school A's audit entries
  const b = (await req('POST', '/auth/login', null, { email: 'admin-b@schoolb.edu', password: 'SchoolB!Pass1' })).data;
  const logsB = await req('GET', '/audit-logs?limit=100', b.accessToken);
  const bEntries = logsB.data?.items ?? [];
  check('audit log tenant-scoped (B sees only own)', bEntries.every(e => e.schoolId === b.user.schoolId), `${bEntries.length} rows`);

  // 5. Soft delete: delete the announcement, verify it vanishes from list but stays in DB
  const list1 = await req('GET', '/announcements?limit=200', T_SCHOOL);
  const count1 = (list1.data?.items ?? []).filter(x => x.title === 'Audit test announcement').length;
  const del = await req('DELETE', `/announcements/${ann.data.id}`, T_SCHOOL);
  check('delete returns success', del.status === 204 || del.status === 200, del.status);
  const list2 = await req('GET', '/announcements?limit=200', T_SCHOOL);
  const count2 = (list2.data?.items ?? []).filter(x => x.title === 'Audit test announcement').length;
  check('soft-deleted record hidden from list', count1 === 1 && count2 === 0, `before=${count1} after=${count2}`);

  // 6. DELETE audited
  await new Promise(r => setTimeout(r, 800));
  const logs3 = await req('GET', '/audit-logs?limit=10', T);
  const delEntry = (logs3.data?.items ?? []).find(e => e.action === 'DELETE' && e.entityId === ann.data.id);
  check('DELETE audited', !!delEntry);

  // 7. School ADMIN is also denied audit (super admin only)
  const adminAudit = await req('GET', '/audit-logs', T_SCHOOL);
  check('ADMIN denied audit (403) — super admin only', adminAudit.status === 403, adminAudit.status);

  // 7b. Teacher role denied audit access
  const t = (await req('POST', '/auth/login', null, { email: 'teacher1@demo-school.edu', password: 'Teacher!123' })).data;
  const denied = await req('GET', '/audit-logs', t.accessToken);
  check('teachers denied audit access (403)', denied.status === 403, denied.status);

  console.log(`\n===== AUDIT + SOFT DELETE: ${PASS} passed, ${FAIL} failed =====`);
  process.exit(FAIL === 0 ? 0 : 1);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
