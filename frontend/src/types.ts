export type Severity = "critical" | "serious" | "moderate" | "minor" | "unknown";
export type ScanStatus = "queued" | "crawling" | "analyzing" | "complete" | "partial" | "failed" | "cancelled";

export interface Finding {
  finding_id: string;
  scan_id: string;
  rule_id: string;
  wcag: string[];
  severity: Severity;
  message: string;
  selector: string | null;
  html_snippet: string | null;
  page_url: string;
  source: string;
  confidence: "confirmed" | "potential";
  title: string | null;
  category: string | null;
  screenshot_available: boolean;
  page_index: number;
}

export interface ScanRecord {
  scan_id: string;
  target_url: string;
  status: ScanStatus;
  title: string | null;
  pages_scanned: number;
  ai_analysis_status: "disabled" | "pending" | "complete" | "partial" | "unavailable";
  findings: Finding[];
  finding_count: number;
  pages: PageRecord[];
  errors: string[];
  created_at: number | null;
  started_at: number | null;
  finished_at: number | null;
}

export interface PageRecord {
  url: string;
  title: string;
  status: string;
  screenshot_available: boolean;
  evidence?: {
    tab_order?: { tag: string; id: string | null; name: string; has_outline?: boolean; has_outline_or_shadow?: boolean }[];
    [key: string]: unknown;
  };
}

export interface ScanOptions {
  target_url: string;
  max_pages: number;
  max_depth: number;
  analyze_with_ai: boolean;
  consent_to_ai_analysis: boolean;
}

export interface AgentStatus {
  configured: boolean;
  provider: string | null;
  model: string | null;
}

export interface Remediation {
  remediation_id: string;
  finding_id: string;
  scan_id: string;
  original: string;
  replacement: string;
  decision: string | null;
  status: string;
  verification_scan_id: string | null;
  model: string;
  note: string;
}

export interface VerificationResult {
  remediation_id: string;
  scan_id: string;
  status: ScanStatus;
  result: {
    outcome: "not_detected" | "still_detected" | "inconclusive";
    rule_id: string;
    page_url: string;
    remaining_count: number;
    human_review_required: true;
    message: string;
  } | null;
}
