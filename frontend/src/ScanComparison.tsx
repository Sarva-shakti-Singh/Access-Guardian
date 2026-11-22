import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type { ScanRecord, Severity } from "./types";

const SEVERITIES: Severity[] = ["critical", "serious", "moderate", "minor", "unknown"];
const FINISHED = new Set(["complete", "partial"]);
const issueKey = (finding: ScanRecord["findings"][number]) => `${finding.page_url}\n${finding.rule_id}`;

function countBySeverity(scan: ScanRecord): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 };
  for (const finding of scan.findings) counts[finding.severity] += 1;
  return counts;
}

function dateLabel(timestamp: number | null): string {
  return timestamp ? new Date(timestamp * 1000).toLocaleString() : "date unavailable";
}

function originOf(scan: ScanRecord): string {
  try { return new URL(scan.target_url).origin; } catch { return ""; }
}

export default function ScanComparison({ refreshKey }: { refreshKey: string }) {
  const [history, setHistory] = useState<ScanRecord[]>([]);
  const [firstId, setFirstId] = useState("");
  const [secondId, setSecondId] = useState("");
  const [first, setFirst] = useState<ScanRecord | null>(null);
  const [second, setSecond] = useState<ScanRecord | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.listScans()
      .then((scans) => {
        const finished = scans.filter((scan) => FINISHED.has(scan.status));
        setHistory(finished);
        const firstPair = finished.find((scan, index) =>
          index > 0 && finished.slice(0, index).some((other) =>
            originOf(other) && originOf(other) === originOf(scan)),
        );
        if (finished.length >= 2 && firstPair) {
          const newer = finished.find((scan) => originOf(scan) && originOf(scan) === originOf(firstPair));
          if (newer) {
            setFirstId(firstPair.scan_id);
            setSecondId(newer.scan_id);
          }
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [refreshKey]);

  const firstScan = history.find((scan) => scan.scan_id === firstId);
  const comparableScans = useMemo(() => {
    if (!firstScan) return history;
    const origin = originOf(firstScan);
    const firstTime = firstScan.finished_at ?? firstScan.created_at ?? 0;
    return history.filter((scan) =>
      scan.scan_id !== firstScan.scan_id &&
      originOf(scan) === origin &&
      (scan.finished_at ?? scan.created_at ?? 0) >= firstTime,
    );
  }, [firstScan, history]);

  useEffect(() => {
    if (!firstId || !secondId) {
      setFirst(null);
      setSecond(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([api.getScan(firstId), api.getScan(secondId)])
      .then(([a, b]) => {
        if (!active) return;
        if (a.scan_id === b.scan_id) {
          throw new Error("Choose two different scans to compare.");
        }
        if (!originOf(a) || originOf(a) !== originOf(b)) {
          throw new Error("Choose scans from the same site to compare results.");
        }
        setFirst(a);
        setSecond(b);
      })
      .catch((e: unknown) => {
        if (active) {
          setFirst(null);
          setSecond(null);
          setError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [firstId, secondId]);

  const comparison = useMemo(() => {
    if (!first || !second) return null;
    const oldKeys = new Set(first.findings.map(issueKey));
    const newKeys = new Set(second.findings.map(issueKey));
    const remainingRules = new Map(
      first.findings
        .filter((finding) => newKeys.has(issueKey(finding)))
        .map((finding) => [issueKey(finding), finding]),
    );
    return {
      resolved: [...oldKeys].filter((key) => !newKeys.has(key)).length,
      remainingRules: [...remainingRules.values()],
      remaining: [...oldKeys].filter((key) => newKeys.has(key)).length,
      added: [...newKeys].filter((key) => !oldKeys.has(key)).length,
      firstCounts: countBySeverity(first),
      secondCounts: countBySeverity(second),
    };
  }, [first, second]);

  return (
    <section className="panel comparison" aria-labelledby="comparison-title">
      <div className="fi-head">
        <div>
          <h2 id="comparison-title">Historical scan comparison</h2>
          <p className="muted">Compare completed scans of the same site. A disappearing rule is a rescan observation, not proof of a fix.</p>
        </div>
        <div className="filters">
          <label>
            <span>Earlier scan</span>
            <select value={firstId} onChange={(event) => {
              setFirstId(event.target.value);
              setSecondId("");
            }}>
              <option value="">Select scan</option>
              {history.map((scan) => <option key={scan.scan_id} value={scan.scan_id}>{dateLabel(scan.finished_at)} · {scan.target_url}</option>)}
            </select>
          </label>
          <label>
            <span>Later scan</span>
            <select value={secondId} onChange={(event) => setSecondId(event.target.value)}>
              <option value="">Select scan</option>
              {comparableScans.map((scan) => <option key={scan.scan_id} value={scan.scan_id}>{dateLabel(scan.finished_at)} · {scan.target_url}</option>)}
            </select>
          </label>
        </div>
      </div>
      {loading && <p className="muted" role="status">Loading comparison…</p>}
      {error && <p className="err" role="alert">{error}</p>}
      {!history.length && !error && <p className="muted">Complete at least two scans of the same site to compare results.</p>}
      {comparison && first && second && (
        <>
          <dl className="comparison-stats">
            <div><dt>Rule/page pairs no longer detected</dt><dd>{comparison.resolved}</dd></div>
            <div><dt>Still detected in later scan</dt><dd>{comparison.remaining}</dd></div>
            <div><dt>New rule/page pairs</dt><dd>{comparison.added}</dd></div>
          </dl>
          <div className="table-scroll">
            <table>
              <caption>Finding counts by severity</caption>
              <thead><tr><th scope="col">Severity</th><th scope="col">Earlier scan</th><th scope="col">Later scan</th></tr></thead>
              <tbody>{SEVERITIES.map((severity) => (
                <tr key={severity}><th scope="row">{severity}</th><td>{comparison.firstCounts[severity]}</td><td>{comparison.secondCounts[severity]}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <div className="remaining-rules">
            <h3>Original rules still detected</h3>
            {comparison.remainingRules.length ? (
              <>
                <ul>
                  {comparison.remainingRules.slice(0, 20).map((finding) => (
                    <li key={issueKey(finding)}><code>{finding.rule_id}</code> · {finding.page_url}</li>
                  ))}
                </ul>
                {comparison.remainingRules.length > 20 && <p className="muted">Showing 20 of {comparison.remainingRules.length} remaining rule/page pairs.</p>}
              </>
            ) : (
              <p className="muted">No earlier rule/page pairs were reported in the later scan. This is not proof of accessibility.</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
