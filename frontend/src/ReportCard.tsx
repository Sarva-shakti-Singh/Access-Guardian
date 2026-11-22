import { useState } from "react";
import { api } from "./api";
import { ScanArt } from "./Art";
import { downloadCsv } from "./reportDownloads";
import type { ScanRecord, Severity } from "./types";

const SEVS: Severity[] = ["critical", "serious", "moderate", "minor"];
const SAMPLE: Record<Severity, number> = { critical: 2, serious: 5, moderate: 3, minor: 2, unknown: 0 };
const WEIGHTS: Record<Severity, number> = { critical: 10, serious: 5, moderate: 2, minor: 1, unknown: 0 };
const ACTIVE = new Set(["queued", "crawling", "analyzing"]);

function fmtDuration(s: ScanRecord): string {
  if (!s.started_at) return "00:00:00";
  const secs = Math.max(0, Math.round((s.finished_at ?? Date.now() / 1000) - s.started_at));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(secs / 3600))}:${p(Math.floor((secs % 3600) / 60))}:${p(secs % 60)}`;
}

function statusLabel(s?: ScanRecord): { text: string; cls: string } {
  if (!s) return { text: "Sample data", cls: "pill" };
  if (ACTIVE.has(s.status)) return { text: `Scanning · ${s.status}`, cls: "pill run" };
  if (s.status === "complete") return { text: "Scan complete · review needed", cls: "pill ok" };
  if (s.status === "partial") return { text: "Partial scan · review needed", cls: "pill warn" };
  return { text: s.status[0].toUpperCase() + s.status.slice(1), cls: "pill bad" };
}

export default function ReportCard({ scan }: { scan: ScanRecord | null }) {
  const [tab, setTab] = useState<"evidence" | "severity">("evidence");
  const [shotFailed, setShotFailed] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState(false);
  const counts: Record<Severity, number> = scan
    ? { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 }
    : SAMPLE;
  if (scan) for (const f of scan.findings) counts[f.severity] += 1;
  const total = SEVS.reduce((a, k) => a + counts[k], 0) + counts.unknown;
  const score = scan
    ? Math.max(0, 100 - scan.findings.reduce((penalty, finding) =>
        finding.confidence === "confirmed" ? penalty + WEIGHTS[finding.severity] : penalty, 0))
    : null;
  const st = statusLabel(scan ?? undefined);
  const hasShot = !!scan?.pages.some((p) => p.screenshot_available) && !shotFailed;

  async function exportCsv() {
    if (!scan) return;
    setExportError("");
    setExporting(true);
    try {
      downloadCsv(scan, await api.listRemediations(scan.scan_id));
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  const stats: [string, string][] = scan
    ? [
        ["Duration", fmtDuration(scan)],
        ["Browser", "Chromium"],
        ["Pages", String(scan.pages_scanned)],
        ["Findings", String(total)],
        ["AI analysis", scan.ai_analysis_status],
      ]
    : [["Duration", "00:00:21"], ["Browser", "Chromium"], ["Pages", "3"], ["Findings", "12"], ["AI analysis", "sample"]];

  return (
    <li className="tile wide report">
      <div className="rep-head">
        <h2>{scan ? scan.title || scan.target_url : "Sample accessibility scan"}</h2>
        <span className={st.cls} role="status">{st.text}</span>
      </div>
      <dl className="stats">
        {stats.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {scan && (
        <div className="score-box">
          <div><span className="score-label">Internal accessibility metric</span><strong>{score}/100</strong></div>
          <p>100 − (10 × critical + 5 × serious + 2 × moderate + 1 × minor confirmed findings), minimum 0. Potential observations are excluded. This is not a WCAG score or conformance result.</p>
        </div>
      )}
      {scan && (
        <div className="row report-actions">
          <button className="btn" onClick={() => void exportCsv()} disabled={exporting}>
            {exporting ? "Preparing CSV…" : "Download CSV"}
          </button>
          <button className="btn" onClick={() => window.print()}>Print / Save as PDF</button>
        </div>
      )}
      {exportError && <p className="err" role="alert">{exportError}</p>}
      <div className="sevbar" role="img" aria-label={`Findings by severity: ${SEVS.map((k) => `${counts[k]} ${k}`).join(", ")}`}>
        {SEVS.map((k) => (counts[k] ? <span key={k} className={`seg ${k}`} style={{ flexGrow: counts[k] }} /> : null))}
        {total === 0 && <span className="seg none" style={{ flexGrow: 1 }} />}
      </div>
      <div className="tabs" role="tablist" aria-label="Report view">
        {(["evidence", "severity"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t === "evidence" ? "Evidence" : "By severity"}
          </button>
        ))}
      </div>
      {tab === "evidence" ? (
        <div className="evidence">
          {scan && hasShot ? (
            <img src={api.screenshotUrl(scan.scan_id, Math.max(0, scan.pages.findIndex((p) => p.screenshot_available)))} alt={`Captured screenshot of ${scan.target_url}`} onError={() => setShotFailed(true)} />
          ) : scan ? (
            <p className="muted">No screenshot was captured for this scan.</p>
          ) : (
            <div className="art-frame">
              <ScanArt />
            </div>
          )}
        </div>
      ) : (
        <ul className="bars">
          {SEVS.map((k) => (
            <li key={k}>
              <span className="bl">{k}</span>
              <span className="bt"><span className={`bf ${k}`} style={{ width: total ? `${(counts[k] / total) * 100}%` : "0%" }} /></span>
              <span className="bn">{counts[k]}</span>
            </li>
          ))}
        </ul>
      )}
      {scan?.errors.length ? (
        <ul className="errs">
          {scan.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
