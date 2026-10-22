export type ScanStatus = 'queued' | 'crawling' | 'analyzing' | 'complete' | 'failed';

export type Finding = {
  finding_id: string;
  scan_id: string;
  rule_id: string;
  wcag: string[];
  severity: string;
  message: string;
  selector?: string;
  html_snippet?: string;
  help_url?: string;
  screenshot_path?: string;
  page_url: string;
  status: string;
  source: string;
};

export type ScanRecord = {
  scan_id: string;
  target_url: string;
  status: ScanStatus;
  title?: string;
  page_url?: string;
  pages_scanned: number;
  score: number;
  created_at: string;
  updated_at: string;
  findings: Finding[];
};
