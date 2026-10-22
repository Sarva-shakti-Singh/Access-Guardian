const API_BASE = 'http://localhost:8000/api';

export async function fetchScans() {
  const response = await fetch(`${API_BASE}/scans`);
  if (!response.ok) throw new Error('Could not load scans');
  return response.json();
}

export async function createScan(targetUrl: string) {
  const response = await fetch(`${API_BASE}/scans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_url: targetUrl, max_pages: 1, mode: 'live' }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail || 'Scan failed');
  }
  return data;
}

export async function fetchFindings(scanId: string) {
  const response = await fetch(`${API_BASE}/scans/${scanId}/findings`);
  if (!response.ok) throw new Error('Could not load findings');
  return response.json();
}
