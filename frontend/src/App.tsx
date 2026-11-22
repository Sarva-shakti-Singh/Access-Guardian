import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import Findings from "./Findings";
import KeyboardReview from "./KeyboardReview";
import PrintReport from "./PrintReport";
import ReportCard from "./ReportCard";
import ScanBar from "./ScanBar";
import ScanComparison from "./ScanComparison";
import type { AgentStatus, ScanOptions, ScanRecord } from "./types";
import WorkflowPanel from "./WorkflowPanel";

const ACTIVE = new Set(["queued", "crawling", "analyzing"]);
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function App() {
  const [scan, setScan] = useState<ScanRecord | null>(null);
  const [error, setError] = useState("");
  const [online, setOnline] = useState<boolean | null>(null);
  const [agent, setAgent] = useState<AgentStatus | null>(null);
  const top = useRef<HTMLElement>(null);

  useEffect(() => {
    api.health().then(() => setOnline(true)).catch(() => setOnline(false));
    api.agentStatus().then(setAgent).catch(() => setAgent(null));
  }, []);

  const scanning = !!scan && ACTIVE.has(scan.status);

  useEffect(() => {
    if (!scan || !ACTIVE.has(scan.status)) return;
    const id = window.setInterval(() => {
      api.getScan(scan.scan_id).then(setScan).catch((e) => setError(msg(e)));
    }, 1500);
    return () => window.clearInterval(id);
  }, [scan?.scan_id, scan?.status]);

  async function start(o: ScanOptions) {
    setError("");
    try {
      setScan(await api.createScan(o));
      setOnline(true);
      top.current?.scrollIntoView({ behavior: "smooth" });
    } catch (e) {
      setError(msg(e));
    }
  }

  async function cancel() {
    if (!scan) return;
    try {
      await api.cancelScan(scan.scan_id);
    } catch (e) {
      setError(msg(e));
    }
  }

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="top">
        <span className="brand">
          <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
            <path fill="currentColor" d="M16 2 4 7v8c0 7.5 5 13.2 12 15 7-1.8 12-7.5 12-15V7z" />
            <path fill="none" stroke="var(--bg)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" d="m10.5 16 4 4 7-8" />
          </svg>
          <span>Access Guardian</span>
        </span>
        <div className="top-actions">
          <span className="privacy-note">Evidence stays local</span>
          <span className={`pill ${online === false ? "bad" : online ? "ok" : ""}`}>
            <i aria-hidden="true" />
            {online === null ? "Checking API" : online ? "API online" : "API offline"}
          </span>
        </div>
      </header>

      <main id="main" className="page" ref={top}>
        {!scan && (
          <section className="hero" aria-labelledby="hero-title">
            <div>
              <span className="eyebrow">Evidence-first web accessibility</span>
              <h1 id="hero-title">Make the invisible visible.</h1>
              <p>Scan public pages, separate confirmed issues from human-review observations, and turn findings into a defensible next step.</p>
            </div>
            <div className="hero-mark" aria-hidden="true">
              <svg viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="46" />
                <circle cx="60" cy="60" r="31" />
                <path d="M60 25v70M25 60h70" />
              </svg>
            </div>
          </section>
        )}
        <WorkflowPanel>
          <ReportCard scan={scan} />
        </WorkflowPanel>

        <ScanComparison refreshKey={scan && ["complete", "partial"].includes(scan.status) ? scan.scan_id : ""} />
        {scan && ["complete", "partial"].includes(scan.status) && <KeyboardReview scan={scan} />}
        {scan && scan.status !== "failed" && scan.status !== "cancelled" && !scanning && <Findings findings={scan.findings} agent={agent} />}
        {scan && (scan.status === "failed" || scan.status === "cancelled") && (
          <p className="err" role="alert">Scan {scan.status}. {scan.errors.join(" ")}</p>
        )}
        <p className="sr-only" aria-live="polite">{scanning ? `Scan ${scan?.status}` : scan ? `Scan ${scan.status}` : ""}</p>
        {error && <p className="err" role="alert">{error}</p>}
      </main>

      <PrintReport scan={scan} />
      <ScanBar scanning={scanning} onStart={start} onCancel={cancel} />
    </>
  );
}
