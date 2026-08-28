import React, { useEffect, useState } from 'react';
import ResourcePage from '../components/ResourcePage';
import { api } from '../api/client';

const EXAM_TYPES = ['midterm', 'final', 'quiz', 'assignment'].map((t) => ({ value: t, label: t }));

export default function Exams() {
  const [schools, setSchools] = useState([]);
  const [years, setYears] = useState([]);
  useEffect(() => {
    api.list('/schools?limit=100').then(setSchools).catch(() => {});
    api.list('/academic-years?limit=100').then(setYears).catch(() => {});
  }, []);

  return (
    <ResourcePage
      title="Exams"
      sub="Assessments per academic year"
      endpoint="/exams"
      createTitle="Exam"
      fields={[
        { name: 'name', label: 'Name', required: true },
        { name: 'schoolId', label: 'School', type: 'select', options: () => schools.map((s) => ({ value: s.id, label: s.name })), required: true },
        { name: 'academicYearId', label: 'Academic Year', type: 'select', options: () => years.map((y) => ({ value: y.id, label: y.name })), required: true },
        { name: 'type', label: 'Type', type: 'select', options: EXAM_TYPES },
        { name: 'startDate', label: 'Start Date', type: 'date' },
        { name: 'endDate', label: 'End Date', type: 'date' },
        { name: 'maxMarks', label: 'Max Marks', type: 'number', default: 100 },
      ]}
    />
  );
}
