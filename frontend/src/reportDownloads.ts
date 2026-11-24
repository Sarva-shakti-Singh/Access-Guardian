import { friendlyExplanation } from "./explanations";
import type { Finding, Remediation, ScanRecord } from "./types";

function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function downloadCsv(scan: ScanRecord, remediations: Remediation[]): void {
  const suggestions = new Map(remediations.map((remediation) => [remediation.finding_id, remediation]));
  const rows = [
    ["scan_id", "scan_status", "scan_date", "page_url", "severity", "rule_id", "wcag", "finding", "plain_language_explanation", "selector", "html_snippet", "suggested_replacement", "remediation_decision", "source", "confidence"],
    ...scan.findings.map((finding) => findingRow(scan, finding, suggestions.get(finding.finding_id))),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  download(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }), `access-guardian-${scan.scan_id}.csv`);
}

function findingRow(scan: ScanRecord, finding: Finding, remediation?: Remediation): (string | number)[] {
  return [
    scan.scan_id,
    scan.status,
    scan.finished_at ? new Date(scan.finished_at * 1000).toISOString() : "",
    finding.page_url,
    finding.severity,
    finding.rule_id,
    finding.wcag.join(", "),
    finding.message,
    friendlyExplanation(finding),
    finding.selector ?? "",
    finding.html_snippet ?? "",
    remediation?.replacement ?? "",
    remediation?.decision ?? "",
    finding.source,
    finding.confidence,
  ];
}

export function downloadSuggestedHtml(findingId: string, replacement: string): void {
  const safeId = findingId.replace(/[^a-zA-Z0-9_-]/g, "-");
  download(
    new Blob([replacement, "\n"], { type: "text/html;charset=utf-8" }),
    `access-guardian-fix-${safeId}.html`,
  );
}

export function downloadJson(scan: ScanRecord, remediations: Remediation[]): void {
  const report = {
    disclaimer: "Internal accessibility metric and automated findings are not a WCAG conformance score.",
    scan: {
      scan_id: scan.scan_id,
      status: scan.status,
      target_url: scan.target_url,
      title: scan.title,
      created_at: scan.created_at,
      finished_at: scan.finished_at,
      pages: scan.pages,
    },
    findings: scan.findings.map((finding) => ({
      ...finding,
      remediation: remediations.find((item) => item.finding_id === finding.finding_id) ?? null,
    })),
  };
  download(
    new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" }),
    `access-guardian-${scan.scan_id}.json`,
  );
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
