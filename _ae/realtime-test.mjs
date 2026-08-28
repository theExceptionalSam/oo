// Two-session realtime test: one socket listens as admin A (school demo),
// the other publishes an announcement as admin B — plus a direct message
// ping to A. Verifies JWT handshake auth, user + school room targeting,
// and that cross-tenant sockets receive nothing.
import { io } from 'socket.io-client';

const API = 'http://localhost:8080';
let PASS = 0, FAIL = 0;
const check = (name, ok, detail) => {
  if (ok) { PASS++; console.log(`PASS ${name}`); }
  else { FAIL++; console.log(`FAIL ${name} :: ${detail}`); }
};

const login = async (email, password) => {
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = await res.json();
  return j.data;
};

const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  // wait for stack
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(`${API}/api/v1/health`); if (r.ok) break; } catch {}
    await wait(3000);
  }

  const a = await login('admin@demo-school.edu', 'Demo!Pass123');
  const b = await login('admin-b@schoolb.edu', 'SchoolB!Pass1');

  // ---- Session A: connect as school-A admin ----
  const eventsA = [];
  const sockA = io(`${API}/notifications`, { auth: { token: a.accessToken }, transports: ['websocket', 'polling'] });
  sockA.on('notification', (n) => eventsA.push(n));

  // ---- 1. Bad token rejected ----
  const badSock = io(`${API}/notifications`, { auth: { token: 'garbage' }, transports: ['polling'] });
  await new Promise((r) => setTimeout(r, 3500));
  check('invalid token socket rejected', !badSock.connected, 'bad socket reached connected state');
  badSock.close();

  // ---- 2. Wait for A to actually connect ----
  const aConnected = await new Promise((resolve) => {
    if (sockA.connected) return resolve(true);
    sockA.on('connect', () => resolve(true));
    setTimeout(() => resolve(false), 5000);
  });
  check('session A socket connected', aConnected);

  // ---- 3. School-B admin sends A a direct message → A pings in < 5s ----
  const usersB = await (await fetch(`${API}/api/v1/users?limit=200`, { headers: { Authorization: `Bearer ${b.accessToken}` } })).json();
  const targetUser = (usersB.data?.items ?? []).find(u => u.email === 'admin@demo-school.edu');
  let gotDirect = null;
  const directPromise = new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), 6000);
    sockA.on('notification', (n) => { clearTimeout(t); resolve(n); });
  });
  await fetch(`${API}/api/v1/messages`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${b.accessToken}` },
    body: JSON.stringify({ receiverId: targetUser?.id ?? a.user.id, content: 'realtime ping test' }),
  });
  gotDirect = await directPromise;
  check('direct message → realtime notification to recipient', !!gotDirect, 'no event within 6s');

  // ---- 4. Announcement in school B must NOT reach A (school room isolation) ----
  const before = eventsA.length;
  const schoolsB = await (await fetch(`${API}/api/v1/schools`, { headers: { Authorization: `Bearer ${b.accessToken}` } })).json();
  const schoolBId = schoolsB.data?.items?.[0]?.id;
  await fetch(`${API}/api/v1/announcements`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${b.accessToken}` },
    body: JSON.stringify({ title: 'B-only realtime leak test', content: 'x', schoolId: schoolBId }),
  });
  await wait(4000);
  check('school-B announcement does NOT leak to A', eventsA.length === before, `${eventsA.length - before} unexpected events`);

  // ---- 5. Announcement in school A DOES reach A ----
  const aPromise = new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), 6000);
    sockA.on('notification', (n) => { clearTimeout(t); resolve(n); });
  });
  await fetch(`${API}/api/v1/announcements`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${a.accessToken}` },
    body: JSON.stringify({ title: 'Realtime announcement test', content: 'hello sockets', schoolId: a.user.schoolId }),
  });
  const gotAnn = await aPromise;
  check('school-A announcement reaches A in realtime', !!gotAnn, 'no event within 6s');

  sockA.close();
  console.log(`\n===== REALTIME: ${PASS} passed, ${FAIL} failed =====`);
  process.exit(FAIL === 0 ? 0 : 1);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
