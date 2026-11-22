import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { friendlyExplanation } from "./explanations";
import { downloadSuggestedHtml } from "./reportDownloads";
import type { AgentStatus, Finding, Remediation, Severity, VerificationResult } from "./types";

// Mirrors backend/app/services/ai/fix.py SUPPORTED_RULES (accessible-name attributes only).
const FIXABLE = new Set([
  "image-alt", "input-image-alt", "role-img-alt", "svg-img-alt", "button-name",
  "input-button-name", "link-name", "label", "select-name", "aria-input-field-name",
]);

function Proposal({ finding, agent }: { finding: Finding; agent: AgentStatus }) {
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [rem, setRem] = useState<Remediation | null>(null);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [copyStatus, setCopyStatus] = useState("");

  async function generate() {
    setBusy(true);
    setErr("");
    try {
      setRem(await api.remediate(finding.finding_id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function decide(d: "accept" | "reject") {
    if (!rem) return;
    try {
      setRem(await api.decide(rem.remediation_id, d));
      if (d === "reject") setVerification(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    if (!verification || !["queued", "crawling", "analyzing"].includes(verification.status)) return;
    const timer = window.setInterval(() => {
      api.getVerification(verification.remediation_id)
        .then(setVerification)
        .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    }, 1500);
    return () => window.clearInterval(timer);
  }, [verification?.remediation_id, verification?.status]);

  async function verify() {
    if (!rem) return;
    setErr("");
    try {
      setVerification(await api.startVerification(rem.remediation_id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  if (!open)
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        Propose fix
      </button>
    );
  return (
    <div className="prop">
      {!rem && (
        <>
          <label className="check">
            <input
              type="checkbox"
              checked={consent}
              disabled={busy}
              onChange={(e) => {
                const agreed = e.target.checked;
                setConsent(agreed);
                if (agreed) void generate();
              }}
            />
            <span>
              I consent to sending this element and short context to <b>{agent.provider}</b> ({agent.model}).
              Checking this box generates a proposal.
            </span>
          </label>
          {busy && <p className="muted" role="status">Generating proposal…</p>}
          {consent && err && <button className="btn primary" onClick={generate}>Retry proposal</button>}
        </>
      )}
      {rem && (
        <>
          <p><b>Why this matters:</b> {friendlyExplanation(finding)}</p>
          <pre className="diff del">- {rem.original}</pre>
          <pre className="diff add">+ {rem.replacement}</pre>
          <div className="row">
            <button className="btn" onClick={() => downloadSuggestedHtml(finding.finding_id, rem.replacement)}>
              Download suggested HTML
            </button>
            <button
              className="btn"
              onClick={() => {
                navigator.clipboard.writeText(rem.replacement)
                  .then(() => setCopyStatus("Suggested HTML copied. Review and apply it in your source code."))
                  .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Could not copy the suggested HTML."));
              }}
            >
              Copy replacement
            </button>
          </div>
          {copyStatus && <p className="muted" role="status">{copyStatus}</p>}
          <p className="muted">{rem.note}</p>
          <div className="row">
            <button className="btn primary" onClick={() => decide("accept")} aria-pressed={rem.decision === "accept"}>
              {rem.decision === "accept" ? "Accepted for review" : "Accept for review"}
            </button>
            <button className="btn" onClick={() => decide("reject")} aria-pressed={rem.decision === "reject"}>
              {rem.decision === "reject" ? "Rejected" : "Reject"}
            </button>
          </div>
          {rem.decision === "accept" && !verification && (
            <div>
              <button className="btn" onClick={verify}>I applied it manually — rescan this page</button>
              <p className="muted">The app never edits your files. Apply the change yourself before rescanning.</p>
            </div>
          )}
          {verification && (
            <div role="status" aria-live="polite">
              {!verification.result ? (
                <p className="muted">Verification scan {verification.status}…</p>
              ) : (
                <>
                  <p><b>Rescan: {verification.result.outcome.replace("_", " ")}</b></p>
                  <p className="muted">{verification.result.message}</p>
                  <a href={`#finding-${finding.finding_id}`}>Review the original finding</a>
                </>
              )}
            </div>
          )}
        </>
      )}
      {err && <p className="err" role="alert">{err}</p>}
    </div>
  );
}

export default function Findings({ findings, agent }: { findings: Finding[]; agent: AgentStatus | null }) {
  const [sev, setSev] = useState<"all" | Severity>("all");
  const [q, setQ] = useState("");
  const shown = useMemo(
    () =>
      findings.filter(
        (f) =>
          (sev === "all" || f.severity === sev) &&
          (!q || `${f.rule_id} ${f.message} ${f.title ?? ""} ${f.selector ?? ""}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [findings, sev, q],
  );

  return (
    <section className="panel" aria-labelledby="fi-title">
      <div className="fi-head">
        <h2 id="fi-title">Findings ({shown.length}{shown.length !== findings.length ? ` of ${findings.length}` : ""})</h2>
        <div className="filters">
          <label>
            <span className="sr-only">Search findings</span>
            <input type="search" placeholder="Search rule, message, selector" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <label>
            <span className="sr-only">Filter by severity</span>
            <select value={sev} onChange={(e) => setSev(e.target.value as "all" | Severity)}>
              <option value="all">All severities</option>
              {["critical", "serious", "moderate", "minor", "unknown"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {findings.length === 0 && <p className="muted">No findings were reported. That is not a conformance claim; manual review is still needed.</p>}
      <ul className="flist">
        {shown.map((f) => (
          <li key={f.finding_id} id={`finding-${f.finding_id}`} className="finding">
            <div className="frow">
              <span className={`sev ${f.severity}`}>{f.severity}</span>
              <b>{f.title || f.rule_id}</b>
              <span className={`conf ${f.confidence}`}>{f.confidence === "confirmed" ? "confirmed" : "potential · human review"}</span>
            </div>
            <p>{f.message}</p>
            <p className="friendly"><b>In plain language:</b> {friendlyExplanation(f)}</p>
            <p className="meta">
              <code>{f.rule_id}</code> · {f.source}
              {f.wcag.length ? ` · WCAG ${f.wcag.join(", ")}` : ""}
            </p>
            {f.selector && <p className="meta"><code>{f.selector}</code></p>}
            {f.html_snippet && <pre className="snip">{f.html_snippet}</pre>}
            {agent?.configured && f.html_snippet && f.source === "axe" && FIXABLE.has(f.rule_id) && <Proposal finding={f} agent={agent} />}
          </li>
        ))}
      </ul>
      {!agent?.configured && findings.length > 0 && (
        <p className="muted">
          Fix proposals need a local Ollama server and the configured model. Start Ollama and run <code>ollama pull qwen2.5-coder:7b</code>.
        </p>
      )}
    </section>
  );
}
