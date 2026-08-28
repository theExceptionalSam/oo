import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';

// One-shot reference-data cache: schools, users, subjects, classes.
// Pages use lookups.X(id) to render names instead of UUIDs.
const LookupContext = createContext(null);

export function LookupProvider({ children }) {
  const [data, setData] = useState({ schools: [], users: [], subjects: [], classes: [] });

  useEffect(() => {
    Promise.all([
      api.list('/schools?limit=200').catch(() => []),
      api.list('/users?limit=200').catch(() => []),
      api.list('/subjects?limit=200').catch(() => []),
      api.list('/classes?limit=200').catch(() => []),
    ]).then(([schools, users, subjects, classes]) => setData({ schools, users, subjects, classes }));
  }, []);

  const value = useMemo(() => {
    const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
    const schoolsById = byId(data.schools);
    const usersById = byId(data.users);
    const subjectsById = byId(data.subjects);
    const classesById = byId(data.classes);
    return {
      ...data,
      schoolName: (id) => schoolsById[id]?.name || short(id),
      userEmail: (id) => usersById[id]?.email || short(id),
      userName: (id) => {
        const u = usersById[id];
        return (u?.profile?.fullName) || u?.email || short(id);
      },
      subjectName: (id) => subjectsById[id]?.name || short(id),
      className: (id) => classesById[id]?.name || short(id),
      roleLabel: (id) => usersById[id]?.role || '',
      teachers: data.users.filter((u) => u.role === 'TEACHER'),
      studentUsers: data.users.filter((u) => u.role === 'STUDENT'),
      options: {
        schools: data.schools.map((s) => ({ value: s.id, label: s.name })),
        teachers: data.users.filter((u) => u.role === 'TEACHER').map((t) => ({ value: t.id, label: t.email })),
        studentUsers: data.users.filter((u) => u.role === 'STUDENT').map((u) => ({ value: u.id, label: u.email })),
        subjects: data.subjects.map((s) => ({ value: s.id, label: s.name })),
        classes: data.classes.map((c) => ({ value: c.id, label: c.name })),
      },
    };
  }, [data]);

  return <LookupContext.Provider value={value}>{children}</LookupContext.Provider>;
}

const short = (id) => (id ? id.slice(0, 8) + '…' : '—');

export const useLookups = () => useContext(LookupContext);
