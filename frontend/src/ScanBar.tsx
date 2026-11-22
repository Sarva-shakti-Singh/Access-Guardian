import { useState, type FormEvent } from "react";
import type { ScanOptions } from "./types";

interface Props {
  scanning: boolean;
  onStart: (o: ScanOptions) => void;
  onCancel: () => void;
}

export default function ScanBar({ scanning, onStart, onCancel }: Props) {
  const [url, setUrl] = useState("");
  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState(1);
  const [depth, setDepth] = useState(1);
  const [ai, setAi] = useState(false);
  const [consent, setConsent] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (scanning) return onCancel();
    let target = url.trim();
    if (!target) return;
    if (!/^https?:\/\//i.test(target)) target = `https://${target}`;
    setOpen(false);
    onStart({ target_url: target, max_pages: pages, max_depth: depth, analyze_with_ai: ai, consent_to_ai_analysis: ai && consent });
  }

  return (
    <div className="bar-wrap">
      {open && (
        <div className="opts" id="scan-options" role="group" aria-label="Scan options">
          <label>
            Max pages (1–10)
            <input type="number" min={1} max={10} value={pages} onChange={(e) => setPages(Math.min(10, Math.max(1, +e.target.value || 1)))} />
          </label>
          <label>
            Max depth (0–3)
            <input type="number" min={0} max={3} value={depth} onChange={(e) => setDepth(Math.min(3, Math.max(0, +e.target.value || 0)))} />
          </label>
          <label className="check">
            <input type="checkbox" checked={ai} onChange={(e) => { setAi(e.target.checked); if (!e.target.checked) setConsent(false); }} />
            <span>Add AI vision analysis (needs a vision model in <code>.env</code>)</span>
          </label>
          <label className="check">
            <input type="checkbox" disabled={!ai} checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>I consent to sending screenshots and page evidence to the configured provider</span>
          </label>
        </div>
      )}
      <form className="bar" onSubmit={submit}>
        <button type="button" className="icon" aria-label="Scan options" aria-expanded={open} aria-controls="scan-options" onClick={() => setOpen((o) => !o)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <label className="grow">
          <span className="sr-only">Website address to scan</span>
          <input
            type="text"
            inputMode="url"
            autoComplete="url"
            placeholder="Paste a public website address to scan"
            value={url}
            disabled={scanning}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <button type="submit" className="send" aria-label={scanning ? "Cancel scan" : "Start scan"} disabled={!scanning && !url.trim()}>
          {scanning ? (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
          )}
        </button>
      </form>
    </div>
  );
}
