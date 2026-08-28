import React, { useEffect, useState } from 'react';
import ResourcePage from '../components/ResourcePage';
import { Pill } from '../components/ui';
import { useLookups } from '../context/LookupContext';
import { api } from '../api/client';

export default function Enrollments() {
  const lookups = useLookups();
  const [students, setStudents] = useState([]);
  useEffect(() => {
    api.list('/students?limit=200').then(setStudents).catch(() => {});
  }, []);
  const rollByStudent = Object.fromEntries(students.map((s) => [s.id, s.rollNumber || s.id.slice(0, 8)]));

  return (
    <ResourcePage
      title="Enrollments"
      sub="Assign students to classes"
      endpoint="/enrollments"
      createTitle="Enrollment"
      fields={[
        {
          name: 'studentId', label: 'Student', type: 'select', required: true,
          options: () => students.map((s) => ({ value: s.id, label: s.rollNumber || s.id.slice(0, 8) })),
          render: (r) => rollByStudent[r.studentId] || r.studentId?.slice(0, 8),
        },
        {
          name: 'classId', label: 'Class', type: 'select', required: true,
          options: () => lookups.options.classes,
          render: (r) => lookups.className(r.classId),
        },
        {
          name: 'status', label: 'Status', type: 'select', default: 'active',
          options: [{ value: 'active', label: 'Active' }, { value: 'completed', label: 'Completed' }, { value: 'withdrawn', label: 'Withdrawn' }],
          render: (r) => <Pill tone={r.status === 'active' ? 'green' : 'gray'}>{r.status}</Pill>,
        },
      ]}
    />
  );
}
