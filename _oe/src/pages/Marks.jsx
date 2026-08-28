import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { downloadCsv } from '../api/download';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../components/Toast';
import { EmptyState, Modal, PageHeader, Pill, Spinner } from '../components/ui';
import { useLookups } from '../context/LookupContext';

export default function Marks() {
  const toast = useToast();
  const lookups = useLookups();
  const [exams, setExams] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [students, setStudents] = useState([]);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importForm, setImportForm] = useState({ examId: '', csv: '' });
  const [importingBusy, setImportingBusy] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [form, setForm] = useState({});
  const [reportFor, setReportFor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [v, setV] = useState(0);

  useEffect(() => {
    api.list('/exams?limit=100').then(setExams).catch(() => {});
    api.list('/subjects?limit=100').then(setSubjects).catch(() => {});
    api.list('/students?limit=200').then(setStudents).catch(() => {});
  }, []);

  const { data: marks, loading } = useAsync(() => api.list('/marks?limit=200'), [v]);

  const save = async () => {
    setSaving(true);
    try {
      await api.post('/marks', { ...form, marksObtained: Number(form.marksObtained) });
      toast('Mark recorded');
      setCreating(false); setV((x) => x + 1);
    } catch (e) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const runImport = async () => {
    setImportingBusy(true); setImportResult(null);
    try {
      const result = await api.post('/import/marks', importForm);
      setImportResult(result);
      toast(`Imported ${result.imported}/${result.total} marks`);
      setV((x) => x + 1);
    } catch (e) { toast(e.message, 'error'); }
    finally { setImportingBusy(false); }
  };

  const doExport = async () => {
    try {
      await downloadCsv('/api/v1/export/marks', 'schoolsync-marks.csv');
      toast('Marks exported');
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <>
      <PageHeader
        title="Marks & Reports"
        sub="Record exam scores and generate report cards"
        actions={<>
          <button className="btn btn-outline" onClick={doExport}>⬇ Export CSV</button>
          <button className="btn btn-outline" onClick={() => { setImportForm({ examId: exams[0]?.id ?? '', csv: '' }); setImportResult(null); setImporting(true); }}>⬆ Import CSV</button>
          <button className="btn btn-primary" onClick={() => { setForm({ examId: '', studentId: '', subjectId: '', marksObtained: '', grade: '' }); setCreating(true); }}>+ Record Mark</button>
        </>}
      />
      <div className="card">
        {loading ? <Spinner /> : (!marks?.length ? (
          <EmptyState icon="✍️" title="No marks recorded" hint="Click “+ Record Mark” to enter the first score." />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr>
                <th>Student</th><th>Exam</th><th>Subject</th><th>Score</th><th>Grade</th><th>Actions</th>
              </tr></thead>
              <tbody>
                {marks.map((m) => (
                  <tr key={m.id}>
                    <td className="strong">{students.find((s) => s.id === m.studentId)?.rollNumber || m.studentId.slice(0, 8)}</td>
                    <td>{exams.find((e) => e.id === m.examId)?.name || m.examId.slice(0, 8)}</td>
                    <td>{lookups.subjectName(m.subjectId)}</td>
                    <td><Pill tone={m.marksObtained >= 70 ? 'green' : m.marksObtained >= 50 ? 'amber' : 'red'}>{m.marksObtained ?? '—'}</Pill></td>
                    <td>{m.grade || '—'}</td>
                    <td>
                      <button className="btn btn-sm btn-outline" onClick={async () => {
                        try { setReportFor({ loading: true, data: null }); 
                          const rc = await api.get(`/marks/student/${m.studentId}/report-card`);
                          setReportFor({ loading: false, data: rc, student: students.find((s) => s.id === m.studentId) });
                        } catch (e) { toast(e.message, 'error'); setReportFor(null); }
                      }}>Report Card</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {creating && (
        <Modal title="Record Mark" onClose={() => setCreating(false)}
          footer={<>
            <button className="btn btn-outline" onClick={() => setCreating(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving || !form.examId || !form.studentId || !form.subjectId}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>}>
          <div className="field"><label>Exam *</label>
            <select value={form.examId} onChange={(e) => setForm({ ...form, examId: e.target.value })}>
              <option value="">— select —</option>
              {exams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select></div>
          <div className="field"><label>Student *</label>
            <select value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
              <option value="">— select —</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.rollNumber || s.id.slice(0, 8)}</option>)}
            </select></div>
          <div className="field"><label>Subject *</label>
            <select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
              <option value="">— select —</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></div>
          <div className="form-row">
            <div className="field"><label>Score</label>
              <input type="number" value={form.marksObtained} onChange={(e) => setForm({ ...form, marksObtained: e.target.value })} /></div>
            <div className="field"><label>Grade (A-F)</label>
              <input value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} /></div>
          </div>
        </Modal>
      )}

      {reportFor && (
        <Modal title={`Report Card — ${reportFor.student?.rollNumber || 'Student'}`} onClose={() => setReportFor(null)}
          footer={<button className="btn btn-outline" onClick={() => setReportFor(null)}>Close</button>}>
          {reportFor.loading ? <Spinner /> : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Exam</th><th>Subject</th><th>Score</th><th>Grade</th></tr></thead>
                <tbody>
                  {(reportFor.data?.marks || []).map((r, i) => (
                    <tr key={i}>
                      <td className="strong">{r.examName || r.exam || '—'}</td>
                      <td>{r.subjectName || r.subject || '—'}</td>
                      <td>{r.marksObtained ?? r.score ?? '—'}</td>
                      <td>{r.grade || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}

      {importing && (
        <Modal title="Import Marks (CSV)" onClose={() => setImporting(false)}
          footer={<>
            <button className="btn btn-outline" onClick={() => setImporting(false)}>Close</button>
            <button className="btn btn-primary" onClick={runImport}
              disabled={importingBusy || !importForm.examId || !importForm.csv.trim()}>
              {importingBusy ? 'Importing…' : 'Import'}
            </button>
          </>}>
          <div className="field"><label>Exam *</label>
            <select value={importForm.examId} onChange={(e) => setImportForm({ ...importForm, examId: e.target.value })}>
              <option value="">— select —</option>
              {exams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select></div>
          <div className="field">
            <label>CSV — columns: rollNumber, subjectCode, marksObtained, grade</label>
            <textarea rows="8" value={importForm.csv} placeholder={'rollNumber,subjectCode,marksObtained,grade\nSTD-001,MATH101,85,A\nSTD-002,MATH101,72,B'}
              onChange={(e) => setImportForm({ ...importForm, csv: e.target.value })} />
          </div>
          {importResult && (
            <div className="field">
              <p><strong>{importResult.imported}</strong> of {importResult.total} rows imported.</p>
              {importResult.skipped?.length > 0 && (
                <div style={{ color: 'var(--warning)', fontSize: 12.5 }}>
                  Skipped:<ul style={{ margin: '4px 0 0 16px' }}>{importResult.skipped.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
              )}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
