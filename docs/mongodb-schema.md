# MongoDB Schema and Index Plan

Use MongoDB for metadata and evidence references; use S3-compatible storage for large HTML, PNG, traces, and reports.

## Collections

`scans`: `_id`, `target_url`, `status`, `config`, counts by severity, tool versions, timestamps. Index `{status:1,created_at:-1}` and `{target_url:1,created_at:-1}`.

`pages`: `_id`, `scan_id`, URL, route key, state hash, viewport, interaction trace, artifact references (`kind`, `uri`, `sha256`), console errors, failed requests. Index `{scan_id:1,url:1,viewport:1}` and `{scan_id:1,state_hash:1}`.

`findings`: `_id`, scan/page IDs, source (`axe|custom_probe|vision_llm|manual`), rule ID, WCAG SC/level, severity, status, confidence, selector, element snapshot/bounding box, message, evidence refs, fixability, strategy, dedupe key, timestamps. Index `{scan_id:1,status:1,severity:1}`, `{page_id:1,dedupe_key:1}`, `{wcag_sc:1}`.

`remediations`: finding/scan IDs, strategy, status, planner/model versions, rationale, patch URI/hash, changed files/lines, approval, verification ID, attempt, timestamps. Index `{finding_id:1,created_at:-1}` and `{status:1,created_at:-1}`.

`verification_runs`: remediation ID, primary before/after check, regression gate, counts, weighted score, status, artifact refs, timestamp.

`audit_events`: append-only entity type/ID, event type, actor type, payload, timestamp. Index `{entity_type:1,entity_id:1,created_at:1}`.

## Example finding
```json
{"_id":"finding_01","scan_id":"scan_01","page_id":"page_01","source":"axe","rule_id":"label","wcag_sc":["1.3.1","3.3.2","4.1.2"],"severity":"serious","status":"confirmed","confidence":0.99,"selector":"#email","message":"Form element does not have an associated label","evidence_refs":["evidence_01"],"fixability":"deterministic","fix_strategy":"form_label","dedupe_key":"page_01|label|#email"}
```

## Privacy
Redact secrets/PII before model calls; never store cookies; hash artifacts; use TTLs for temporary sandboxes; implement deletion of a scan and all referenced objects.
