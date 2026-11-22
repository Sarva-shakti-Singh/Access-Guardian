import type { AgentStatus, Remediation, ScanOptions, ScanRecord, VerificationResult } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  } catch {
    throw new Error("Cannot reach the API. Start the backend (task: Start backend) and try again.");
  }
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* non-JSON error body */
    }
    if (!detail && res.status >= 500) detail = "Backend not reachable on http://127.0.0.1:8000. Is it running?";
    throw new Error(detail || `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => request<{ status: string }>("/api/health"),
  agentStatus: () => request<AgentStatus>("/api/agent/status"),
  listScans: () => request<ScanRecord[]>("/api/scans?limit=100"),
  listRemediations: (scanId: string) =>
    request<Remediation[]>(`/api/scans/${encodeURIComponent(scanId)}/remediations`),
  createScan: (o: ScanOptions) =>
    request<ScanRecord>("/api/scans", {
      method: "POST",
      body: JSON.stringify({
        target_url: o.target_url,
        max_pages: o.max_pages,
        max_depth: o.max_depth,
        mode: "live",
        analyze_with_ai: o.analyze_with_ai,
        consent_to_ai_analysis: o.analyze_with_ai ? o.consent_to_ai_analysis : null,
      }),
    }),
  getScan: (id: string) => request<ScanRecord>(`/api/scans/${encodeURIComponent(id)}`),
  cancelScan: (id: string) => request<unknown>(`/api/scans/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
  remediate: (findingId: string) =>
    request<Remediation>(`/api/findings/${encodeURIComponent(findingId)}/remediate`, {
      method: "POST",
      body: JSON.stringify({ consent_to_send_context: true }),
    }),
  decide: (id: string, decision: "accept" | "reject") =>
    request<Remediation>(`/api/remediations/${encodeURIComponent(id)}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    }),
  startVerification: (id: string) =>
    request<VerificationResult>(`/api/remediations/${encodeURIComponent(id)}/verification`, { method: "POST" }),
  getVerification: (id: string) =>
    request<VerificationResult>(`/api/remediations/${encodeURIComponent(id)}/verification`),
  screenshotUrl: (scanId: string, page: number) =>
    `/api/scans/${encodeURIComponent(scanId)}/pages/${page}/screenshot`,
};
