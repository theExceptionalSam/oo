import React from 'react';
import ResourcePage from '../components/ResourcePage';
import { Pill } from '../components/ui';
import { useLookups } from '../context/LookupContext';

export default function Announcements() {
  const lookups = useLookups();

  return (
    <ResourcePage
      title="Announcements"
      sub="School-wide notices"
      endpoint="/announcements"
      createTitle="Announcement"
      searchKeys={['title', 'content']}
      fields={[
        { name: 'title', label: 'Title', required: true },
        { name: 'content', label: 'Content', type: 'textarea', required: true, hideInTable: true },
        {
          name: 'schoolId', label: 'School', type: 'select', required: true,
          options: () => lookups.options.schools,
          render: (r) => lookups.schoolName(r.schoolId),
        },
        {
          name: 'priority', label: 'Priority', type: 'select', default: 'normal',
          options: [{ value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' }],
          render: (r) => <Pill tone={r.priority === 'urgent' ? 'red' : r.priority === 'high' ? 'amber' : 'gray'}>{r.priority || 'normal'}</Pill>,
        },
        { name: 'publishedAt', label: 'Published', tableOnly: true, render: (r) => (r.publishedAt || r.createdAt || '').slice(0, 10) || '—' },
      ]}
    />
  );
}
