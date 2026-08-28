import React, { useEffect, useState } from 'react';
import ResourcePage from '../components/ResourcePage';
import { api } from '../api/client';

const FREQ = ['monthly', 'quarterly', 'annual', 'termly'].map((f) => ({ value: f, label: f }));

export default function FeeStructures() {
  const [schools, setSchools] = useState([]);
  const [years, setYears] = useState([]);
  useEffect(() => {
    api.list('/schools?limit=100').then(setSchools).catch(() => {});
    api.list('/academic-years?limit=100').then(setYears).catch(() => {});
  }, []);

  return (
    <ResourcePage
      title="Fee Structures"
      sub="Recurring fee definitions per academic year"
      endpoint="/fee-structures"
      createTitle="Fee Structure"
      fields={[
        { name: 'name', label: 'Name', required: true },
        { name: 'schoolId', label: 'School', type: 'select', options: () => schools.map((s) => ({ value: s.id, label: s.name })), required: true },
        { name: 'academicYearId', label: 'Academic Year', type: 'select', options: () => years.map((y) => ({ value: y.id, label: y.name })), required: true },
        { name: 'amount', label: 'Amount', type: 'number', required: true },
        { name: 'frequency', label: 'Frequency', type: 'select', options: FREQ },
        { name: 'dueDay', label: 'Due Day (1-31)', type: 'number' },
      ]}
    />
  );
}
