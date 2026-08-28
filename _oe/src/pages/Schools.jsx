import React from 'react';
import ResourcePage from '../components/ResourcePage';

export default function Schools() {
  return (
    <ResourcePage
      title="Schools"
      sub="Tenant schools on this platform"
      endpoint="/schools"
      fields={[
        { name: 'name', label: 'Name', required: true },
        { name: 'subdomain', label: 'Subdomain', required: true },
        { name: 'timezone', label: 'Timezone' },
      ]}
    />
  );
}
