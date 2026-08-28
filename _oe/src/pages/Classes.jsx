import React, { useEffect, useState } from 'react';
import ResourcePage from '../components/ResourcePage';
import { api } from '../api/client';

export default function Classes() {
  const [schools, setSchools] = useState([]);
  const [years, setYears] = useState([]);
  const [teachers, setTeachers] = useState([]);
  useEffect(() => {
    api.list('/schools?limit=100').then(setSchools).catch(() => {});
    api.list('/academic-years?limit=100').then(setYears).catch(() => {});
    api.list('/users?limit=200').then((u) => setTeachers(u.filter((x) => x.role === 'TEACHER'))).catch(() => {});
  }, []);

  return (
    <ResourcePage
      title="Classes"
      sub="Class groups per academic year"
      endpoint="/classes"
      createTitle="Class"
      searchKeys={['name', 'gradeLevel', 'section']}
      fields={[
        { name: 'name', label: 'Name', required: true },
        { name: 'schoolId', label: 'School', type: 'select', options: () => schools.map((s) => ({ value: s.id, label: s.name })), required: true },
        { name: 'academicYearId', label: 'Academic Year', type: 'select', options: () => years.map((y) => ({ value: y.id, label: y.name })), required: true },
        { name: 'gradeLevel', label: 'Grade Level' },
        { name: 'section', label: 'Section' },
        { name: 'roomNumber', label: 'Room' },
        { name: 'classTeacherId', label: 'Class Teacher', type: 'select', options: () => teachers.map((t) => ({ value: t.id, label: t.email })) },
      ]}
    />
  );
}
