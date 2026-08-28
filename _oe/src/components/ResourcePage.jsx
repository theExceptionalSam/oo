import React, { useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../components/Toast';
import { EmptyState, ErrorBox, Modal, PageHeader, Spinner } from './ui';

const empty = (fields) => Object.fromEntries(fields.map((f) => [f.name, f.default ?? '']));

/**
 * Config-driven CRUD page.
 * fields: [{ name, label, type: 'text|number|select|date|textarea|email|password', options, required, hideInTable, formOnly, tableOnly }]
 */
export default function ResourcePage({ title, sub, endpoint, fields, createTitle, searchKeys, canWrite = true, transformRow, toolbarExtra }) {
  const toast = useToast();
  const version = useMemo(() => ({}), []);
  const [v, setV] = useState(0);
  const reload = () => setV((x) => x + 1);
  const { data: items, loading, error } = useAsync(() => api.list(`${endpoint}?limit=200`), [v]);

  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null); // null | {} (create) | row (update)
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});

  const tableFields = fields.filter((f) => !f.formOnly && !f.hideInTable);
  const formFields = fields.filter((f) => !f.tableOnly);

  const rows = (items || []).map((r) => (transformRow ? transformRow(r) : r));
  const filtered = query
    ? rows.filter((r) => (searchKeys || tableFields.map((f) => f.name))
        .some((k) => String(r[k] ?? '').toLowerCase().includes(query.toLowerCase())))
    : rows;

  const openCreate = () => { setForm(empty(formFields)); setEditing({}); };
  const openEdit = (row) => {
    const val = {};
    formFields.forEach((f) => { val[f.name] = row[f.name] ?? row[f.apiName] ?? ''; });
    setForm(val); setEditing(row);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form };
      formFields.forEach((f) => {
        if (f.type === 'number') payload[f.name] = payload[f.name] === '' ? undefined : Number(payload[f.name]);
        if (payload[f.name] === '') delete payload[f.name];
      });
      if (editing.id) await api.patch(`${endpoint}/${editing.id}`, payload);
      else await api.post(endpoint, payload);
      toast(editing.id ? `${title} updated` : `${title} created`);
      setEditing(null);
      reload();
    } catch (e) {
      toast(e.message, 'error');
    } finally { setSaving(false); }
  };

  const remove = async (row) => {
    if (!window.confirm('Delete this record? This cannot be undone.')) return;
    try {
      await api.del(`${endpoint}/${row.id}`);
      toast(`${title} deleted`);
      reload();
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <>
      <PageHeader
        title={title}
        sub={sub}
        actions={<>{toolbarExtra}{canWrite && <button className="btn btn-primary" onClick={openCreate}>+ New {createTitle || title}</button>}</>}
      />
      <div className="toolbar">
        <div className="search">
          <span>🔍</span>
          <input placeholder={`Search ${title.toLowerCase()}…`} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <span style={{ color: 'var(--text-2)', fontSize: 13 }}>{filtered.length} record{filtered.length === 1 ? '' : 's'}</span>
      </div>
      <div className="card">
        {loading ? <Spinner /> : error ? (
          <ErrorBox error={error} />
        ) : !filtered.length ? (
          <EmptyState icon="🗂️" title={`No ${title.toLowerCase()} yet`} hint={canWrite ? `Click “+ New ${createTitle || title}” to create the first one.` : undefined} />
        ) : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr>{tableFields.map((f) => <th key={f.name}>{f.label}</th>)}{canWrite && <th style={{ width: 90 }}>Actions</th>}</tr></thead>
                  <tbody>
                    {filtered.map((row, i) => (
                      <tr key={row.id || i}>
                        {tableFields.map((f) => <td key={f.name}>{f.render ? f.render(row) : (row[f.name] ?? '—')}</td>)}
                        {canWrite && (
                          <td>
                            <button className="icon-btn" title="Edit" onClick={() => openEdit(row)}>✏️</button>
                            <button className="icon-btn danger" title="Delete" onClick={() => remove(row)}>🗑️</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
        )}
      </div>

      {editing !== null && (
        <Modal
          title={editing.id ? `Edit ${createTitle || title}` : `New ${createTitle || title}`}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </>
          }
        >
          {formFields.map((f) => (
            <div className="field" key={f.name}>
              <label>{f.label}{f.required && ' *'}</label>
              {f.type === 'select' ? (
                <select value={form[f.name] ?? ''} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}>
                  <option value="">— select —</option>
                  {(typeof f.options === 'function' ? f.options() : f.options)?.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : f.type === 'textarea' ? (
                <textarea value={form[f.name] ?? ''} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} />
              ) : (
                <input
                  type={f.type || 'text'} value={form[f.name] ?? ''}
                  onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                />
              )}
            </div>
          ))}
        </Modal>
      )}
    </>
  );
}
