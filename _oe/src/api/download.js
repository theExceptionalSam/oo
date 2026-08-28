import { api } from './client';

// Authenticated CSV download → browser save.
export async function downloadCsv(path, filename) {
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${api.tokens.access}` },
  });
  if (!res.ok) {
    let msg = `Export failed (${res.status})`;
    try { msg = (await res.json())?.error?.message || msg; } catch { /* csv error body */ }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
