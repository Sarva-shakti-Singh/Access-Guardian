import { useEffect, useState } from "react";
import { api } from "./api";
import { friendlyExplanation } from "./explanations";
import type { Remediation, ScanRecord } from "./types";

export default function PrintReport({ scan }: { scan: ScanRecord | null }) {
  const [remediations, setRemediations] = useState<Remediation[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!scan) {
      setRemediations([]);
      setError("");
      return;
    }
    setError("");
    api.listRemediations(scan.scan_id)
      .then(setRemediations)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [scan?.scan_id]);

  if (!scan) return null;
  const suggestions = new Map(remediations.map((remediation) => [remediation.finding_id, remediation]));
  return (
    <section className="print-report" aria-label="Printable accessibility scan report">
      <h1>Access Guardian accessibility scan report</h1>
      <dl>
        <div><dt>Site</dt><dd>{scan.target_url}</dd></div>
        <div><dt>Status</dt><dd>{scan.status}</dd></div>
        <div><dt>Scan date</dt><dd>{scan.finished_at ? new Date(scan.finished_at * 1000).toLocaleString() : "Unavailable"}</dd></div>
        <div><dt>Pages scanned</dt><dd>{scan.pages_scanned}</dd></div>
        <div><dt>Findings</dt><dd>{scan.finding_count}</dd></div>
      </dl>
      <p>This report summarizes automated checks and is not a WCAG conformance result. Manual review is required.</p>
      {error && <p>Stored fix proposals could not be loaded: {error}</p>}
      <h2>Findings</h2>
      {scan.findings.map((finding) => (
        <article key={finding.finding_id}>
          <h3>{finding.title || finding.rule_id} — {finding.severity}</h3>
          <p><b>Page:</b> {finding.page_url}</p>
          <p><b>Rule:</b> {finding.rule_id}{finding.wcag.length ? ` · WCAG ${finding.wcag.join(", ")}` : ""}</p>
          <p>{finding.message}</p>
          <p><b>In plain language:</b> {friendlyExplanation(finding)}</p>
          {finding.selector && <p><b>Element:</b> <code>{finding.selector}</code></p>}
          {finding.html_snippet && <pre>{finding.html_snippet}</pre>}
          {suggestions.get(finding.finding_id) && (
            <p><b>Suggested remediation ({suggestions.get(finding.finding_id)?.decision ?? "not reviewed"}):</b>{" "}
              <code>{suggestions.get(finding.finding_id)?.replacement}</code></p>
          )}
        </article>
      ))}
    </section>
  );
}
