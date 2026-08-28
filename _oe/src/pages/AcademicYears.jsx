import React, { useEffect, useState } from 'react';
import ResourcePage from '../components/ResourcePage';
import { Pill } from '../components/ui';
import { api } from '../api/client';

export default function AcademicYears() {
  const [schools, setSchools] = useState([]);
  useEffect(() => { api.list('/schools?limit=100').then(setSchools).catch(() => {}); }, []);
  const schoolOpts = schools.map((s) => ({ value: s.id, label: s.name }));

  return (
    <ResourcePage
      title="Academic Years"
      sub="School year calendar definitions"
      endpoint="/academic-years"
      createTitle="Academic Year"
      fields={[
        { name: 'name', label: 'Name', required: true },
        { name: 'schoolId', label: 'School', type: 'select', options: schoolOpts, required: true },
        { name: 'startDate', label: 'Start Date', type: 'date', required: true },
        { name: 'endDate', label: 'End Date', type: 'date', required: true },
        {
          name: 'isCurrent', label: 'Current', type: 'select', options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }],
          render: (r) => (r.isCurrent ? <Pill tone="green">current</Pill> : '—'),
        },
      ]}
    />
  );
}
