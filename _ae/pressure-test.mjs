// SchoolSync pressure test — concurrent mixed load against the running API.
const BASE = 'http://localhost:3000/api/v1';

async function req(method, path, token, body) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const t0 = performance.now();
  const res = await fetch(`${BASE}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const ms = performance.now() - t0;
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, ms, body: json };
}

const percentile = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

async function main() {
  console.log('=== SchoolSync Pressure Test ===\n');

  // Acquire a token
  const login = await req('POST', '/auth/login', null, { email: 'admin@demo-school.edu', password: 'Demo!Pass123' });
  const TOKEN = login.body?.data?.accessToken;
  if (!TOKEN) { console.error('Cannot login — aborting'); process.exit(1); }

  // Fetch context ids
  const [schools, years] = await Promise.all([
    req('GET', '/schools', TOKEN),
    req('GET', '/academic-years', TOKEN),
  ]);
  const SCHOOL_ID = schools.body?.data?.items?.[0]?.id;
  const YEAR_ID = years.body?.data?.items?.[0]?.id;
  console.log(`school=${SCHOOL_ID} year=${YEAR_ID}\n`);

  const latencies = [];
  const statusCount = {};
  let errors5xx = 0, errors4xx = 0, total = 0;

  const record = (r) => {
    total++;
    latencies.push(r.ms);
    statusCount[r.status] = (statusCount[r.status] || 0) + 1;
    if (r.status >= 500) errors5xx++;
    else if (r.status >= 400) errors4xx++;
  };

  // -------- Phase 1: 200 concurrent reads (10 endpoints x 20 each) --------
  console.log('Phase 1: 200 concurrent reads across 10 endpoints...');
  const readPaths = ['/users', '/schools', '/academic-years', '/subjects', '/classes',
    '/students', '/enrollments', '/exams', '/announcements', '/notifications'];
  const reads = [];
  for (let i = 0; i < 20; i++) for (const p of readPaths) reads.push(req('GET', p, TOKEN).then(record));
  await Promise.all(reads);
  console.log(`  done: ${total} requests so far, 5xx=${errors5xx}, 4xx=${errors4xx}\n`);

  // -------- Phase 2: 50 concurrent logins (bcrypt-heavy) --------
  console.log('Phase 2: 50 concurrent logins (bcrypt CPU stress)...');
  const logins = [];
  for (let i = 0; i < 50; i++) {
    logins.push(req('POST', '/auth/login', null, { email: 'admin@demo-school.edu', password: 'Demo!Pass123' }).then(record));
  }
  await Promise.all(logins);
  console.log(`  done: ${total} requests so far, 5xx=${errors5xx}, 4xx=${errors4xx}\n`);

  // -------- Phase 3: 100 concurrent writes (mixed modules) --------
  console.log('Phase 3: 100 concurrent writes (subjects x40, announcements x30, academic-years x30)...');
  const writes = [];
  for (let i = 0; i < 40; i++) {
    writes.push(req('POST', '/subjects', TOKEN, { name: `Load Subject ${i}`, schoolId: SCHOOL_ID, code: `LOAD-${i}` }).then(record));
  }
  for (let i = 0; i < 30; i++) {
    writes.push(req('POST', '/announcements', TOKEN, { title: `Load Announce ${i}`, content: 'pressure test', schoolId: SCHOOL_ID }).then(record));
  }
  for (let i = 0; i < 30; i++) {
    writes.push(req('POST', '/academic-years', TOKEN, { name: `Load Year ${i}`, schoolId: SCHOOL_ID, startDate: '2026-01-01', endDate: '2026-12-31' }).then(record));
  }
  await Promise.all(writes);
  console.log(`  done: ${total} requests so far, 5xx=${errors5xx}, 4xx=${errors4xx}\n`);

  // -------- Phase 4: mixed sustained load — 300 requests, concurrency 30 --------
  console.log('Phase 4: 300 mixed requests at concurrency 30...');
  const tasks = [];
  const makeTask = (i) => async () => {
    const kind = i % 5;
    if (kind === 0) return record(await req('GET', '/users?limit=20', TOKEN));
    if (kind === 1) return record(await req('GET', '/subjects?limit=50', TOKEN));
    if (kind === 2) return record(await req('GET', '/announcements?limit=50', TOKEN));
    if (kind === 3) return record(await req('POST', '/subjects', TOKEN, { name: `Sustain ${i}`, schoolId: SCHOOL_ID }));
    return record(await req('GET', '/auth/me', TOKEN));
  };
  for (let i = 0; i < 300; i++) tasks.push(makeTask(i));
  const CONC = 30;
  let idx = 0;
  const workers = Array.from({ length: CONC }, async () => {
    while (idx < tasks.length) { const t = tasks[idx++]; await t(); }
  });
  const t0 = performance.now();
  await Promise.all(workers);
  const elapsed = (performance.now() - t0) / 1000;
  console.log(`  done in ${elapsed.toFixed(1)}s (~${(300 / elapsed).toFixed(0)} req/s at concurrency ${CONC})`);
  console.log(`  total: ${total} requests, 5xx=${errors5xx}, 4xx=${errors4xx}\n`);

  // -------- Phase 5: unauthorized/abuse checks --------
  console.log('Phase 5: guard checks under load...');
  const bad = [];
  for (let i = 0; i < 30; i++) bad.push(req('GET', '/users', 'invalid-token').then(record));
  for (let i = 0; i < 10; i++) bad.push(req('POST', '/schools', TOKEN, { bad: 'payload' }).then(record));
  await Promise.all(bad);
  console.log(`  done: ${total} requests, 5xx=${errors5xx}, 4xx=${errors4xx}\n`);

  // -------- Summary --------
  console.log('========== SUMMARY ==========');
  console.log(`Total requests:    ${total}`);
  console.log(`Status breakdown: ${JSON.stringify(statusCount)}`);
  console.log(`5xx errors:        ${errors5xx}`);
  console.log(`4xx (expected):    ${errors4xx}`);
  console.log(`Latency avg:       ${percentile(latencies, 50).toFixed(0)}ms (median)`);
  console.log(`Latency p95:       ${percentile(latencies, 95).toFixed(0)}ms`);
  console.log(`Latency p99:       ${percentile(latencies, 99).toFixed(0)}ms`);
  console.log(`Latency max:       ${Math.max(...latencies).toFixed(0)}ms`);

  const ok = errors5xx === 0;
  console.log(ok ? '\nPRESSURE TEST: PASS (no 5xx errors)' : '\nPRESSURE TEST: FAIL');
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
