import React, { useEffect, useState } from 'react';
import ResourcePage from '../components/ResourcePage';
import { api } from '../api/client';

export default function Subjects() {
  const [schools, setSchools] = useState([]);
  useEffect(() => { api.list('/schools?limit=100').then(setSchools).catch(() => {}); }, []);

  return (
    <ResourcePage
      title="Subjects"
      sub="Courses taught across the school"
      endpoint="/subjects"
      createTitle="Subject"
      fields={[
        { name: 'name', label: 'Name', required: true },
        { name: 'schoolId', label: 'School', type: 'select', options: () => schools.map((s) => ({ value: s.id, label: s.name })), required: true },
        { name: 'code', label: 'Code' },
        { name: 'credits', label: 'Credits', type: 'number', default: 1 },
      ]}
    />
  );
}
