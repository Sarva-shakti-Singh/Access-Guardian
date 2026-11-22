# Agentic A11y Platform — Major Project Blueprint

## Executive definition
**Title:** A Context-Aware Agentic AI Platform for Automated Web Accessibility Detection, Code-Level Remediation, and Verification under WCAG 2.2.

**Contribution:** A closed-loop accessibility engineering system that combines rendered browser evidence, axe-core/custom checks, DOM/CSS/accessibility-tree context, screenshots, and vision-LLM reasoning to propose constrained source patches and verify the original issue is resolved without regressions.

**Scope:** WCAG 2.2 Level A/AA subset: text alternatives, accessible names, form labels/errors, landmarks/headings, contrast, keyboard access/focus, dialogs, target size, and live-region behavior. Do not claim full WCAG conformance.

## 1. Academic synopsis

### Problem statement
Modern services depend on websites, but missing alt text, low contrast, unlabeled inputs, invalid ARIA, hidden focus, and keyboard traps can block users of screen readers, magnification, voice control, switches, or keyboard-only navigation. WCAG 2.2 provides technology-neutral testable success criteria, yet automated scanners cover only a subset of barriers and often need contextual human judgment. WCAG techniques are informative; conformance is based on success criteria. [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/) and [W3C Techniques](https://w3c.github.io/wcag/understanding/understanding-techniques)

Rule-based tools normally stop at a finding. The developer must interpret whether an image is decorative, whether a label is meaningful, edit the source, rebuild, and re-scan. This project closes that loop by rendering routes and interaction states, running deterministic checks, collecting evidence, selectively using a vision-language model, generating a typed patch, applying it in a disposable sandbox, and re-running the same checks and interactions.

### Regulatory drivers
- **European Accessibility Act (Directive (EU) 2019/882):** covers selected products and consumer services such as e-commerce, banking, e-books, electronic communications, and transport services; national implementations commenced from 28 June 2025. [European Commission](https://commission.europa.eu/strategy-and-policy/policies/justice-and-fundamental-rights/disability/european-accessibility-act-eaa_en) and [NDA](https://nda.ie/accessibility/european-accessibility-act)
- **ADA:** U.S. DOJ Title II requires state/local-government services, programs, and activities delivered via websites/apps to be accessible; the 2024 final rule specifies technical requirements for covered public entities. [DOJ rule](https://www.ada.gov/assets/pdfs/web-rule.pdf)
- **India:** the RPwD Act 2016 establishes accessibility/non-discrimination duties; GIGW 3.0 adopts WCAG success criteria for Indian government websites/apps. [RPwD Act](https://prsindia.org/files/bills_acts/acts_parliament/2016/Rights_of_Persons_with_Disabilities_Act_2016.pdf), [GIGW](https://guidelines.india.gov.in/accessibility-guidelines-and-attributes/), [Accessible India Campaign](https://depwd.gov.in/en/accessible-india-campaign/)

State that this system is an engineering research prototype, not legal certification. Applicability and full conformance require jurisdiction-specific interpretation, manual review, and assistive-technology testing.

### Objectives and hypotheses
- Deliver a scan+detect MVP by Week 6.
- Measure whether contextual vision review improves precision over axe-only detection.
- Generate safe patches for selected low-risk issue families.
- Verify the original state after patching and detect regressions.
- Measure confidence, latency, model calls, cost, fix rate, and false positives.

**RQ1:** Does hybrid evidence improve precision? **RQ2:** Can typed agent strategies generate safe patches? **RQ3:** Does re-verification catch ineffective/regressive fixes? **RQ4:** What must remain human-only?

**H1:** hybrid detection improves precision on contextual findings. **H2:** typed strategies plus validators outperform free-form patching. **H3:** selective escalation reduces cost while retaining most of the precision gain.

## 2. Architecture

```text
React dashboard
  -> FastAPI scan/job API
  -> Redis queue + orchestrator
  -> Playwright crawler: routes, SPA states, menus, dialogs, forms, keyboard
  -> Evidence pack: DOM, CSS, AX tree, screenshot/crop, locator, interaction trace
  -> axe-core + custom probes
  -> Finding normalizer/WCAG catalog/deduplication
  -> selective vision-LLM adjudication
  -> typed LangGraph remediation planner
  -> patch validator + approval
  -> disposable sandbox
  -> replay original route/state + rescan + regression gate
  -> before/after report and dashboard
```

### Services

**FastAPI API/job service:** validates requests, creates `scan_id`, stores configuration, exposes status/SSE/findings/remediation/report endpoints, enforces limits, and does not expose worker internals.

**Crawler:** Playwright Python with isolated browser contexts. Use same-origin allowlists, depth/page/action budgets, stable-settle waits, route events, safe fixture form submissions, and Tab traversal. Save URL/state hashes, DOM, screenshots, accessibility snapshot, focus sequence, console/network errors, and tool versions. Playwright is preferred over Selenium for integrated contexts, auto-waiting, locators, screenshots, traces, and SPA handling. [Playwright actionability](https://playwright.dev/docs/actionability)

**Deterministic detection:** inject pinned axe-core and run WCAG 2A/2AA/2.2AA tags. Retain violations, incomplete, and passes. Add browser probes for tab order, focus visibility/obstruction, keyboard activation, target size, all-state contrast, form errors, live regions, route-focus restoration, and dialogs. axe-core is the baseline, not the whole solution. [axe-core](https://github.com/dequelabs/axe-core)

**Evidence builder:** send the model a screenshot/crop plus DOM subtree, role/name/state, nearby text, CSS/computed colors, interaction trace, rule output, and WCAG objective. Never rely on pixels alone.

**Vision-LLM adjudicator:** escalate only for axe `incomplete`, ambiguous image purpose/labels, visual clipping/obscuring, context-dependent contrast, or conflicting deterministic evidence. Require structured JSON with `decision`, `wcag_sc`, `confidence`, `severity`, `rationale`, `evidence_refs`, `recommended_fix_type`, and `unsafe_to_autofix`. Validate with Pydantic; redact cookies/tokens/PII; never accept model output without verification.

**Remediation agent:** use LangGraph as an explicit state machine, with LangChain utilities only for model wrappers/prompts/parsers. LangGraph supports state, conditional edges, checkpointing, retries, and human approval. [LangGraph](https://docs.langchain.com/oss/python/langgraph/overview)

```text
load_finding -> classify_fixability -> select_strategy -> collect_source_context
-> generate_patch -> validate -> apply_sandbox -> verify -> compare
   -> resolved | retry_once | human_review | rollback
```

Typed strategies: `missing_alt`, `decorative_alt`, `accessible_name`, `form_label`, `contrast_css`, `keyboard_handler`, `focus_style`, `dialog_semantics`. Restrict files, changed lines, syntax, dependencies, secrets, and global-token changes. Human approval is required for navigation/dialog/event-handler/global style changes.

**Verification:** replay the same route/state; rerun the primary rule and custom probe; run a regression scan; compare screenshot/AX tree; optionally ask the model if contextual issue remains. Statuses: `resolved`, `partially_resolved`, `unchanged`, `regressed`, `needs_human_review`.

### Endpoint set
- `POST /api/v1/scans`
- `GET /api/v1/scans/{scan_id}`
- `POST /api/v1/scans/{scan_id}/cancel`
- `GET /api/v1/scans/{scan_id}/events` (SSE)
- `GET /api/v1/scans/{scan_id}/pages`
- `GET /api/v1/scans/{scan_id}/findings`
- `GET /api/v1/findings/{finding_id}`
- `POST /api/v1/findings/{finding_id}/remediation`
- `GET /api/v1/remediations/{remediation_id}`
- `POST /api/v1/remediations/{id}/approve|reject|verify`
- `GET /api/v1/remediations/{id}/diff`
- `GET /api/v1/scans/{scan_id}/report?format=json|html`

Minimum scan request:
```json
{"target_url":"http://localhost:3000","max_pages":20,"max_depth":2,"viewport_profiles":["desktop","mobile"],"wcag_tags":["wcag2a","wcag2aa","wcag22aa"],"enable_vision_review":true,"enable_remediation":false,"interaction_policy":{"tab_through":true,"open_menus":true,"open_dialogs":true,"submit_invalid_forms":true,"max_actions_per_state":12}}
```

## 3. Exact technology stack

| Layer | Choice | Why |
|---|---|---|
| API | Python 3.12 + FastAPI + Pydantic v2 | typed validation, async, OpenAPI |
| Server | Uvicorn | simple deployment |
| Jobs | Redis + Celery; asyncio TaskGroup for MVP | retries/worker separation without early complexity |
| Browser | Playwright Python | contexts, auto-wait, trace, screenshot, SPA interactions |
| Rules | axe-core injected in page | mature WCAG baseline |
| Probes | browser JS + computed styles; tinycss2/coloraide | behavior and contrast evidence |
| Agent | LangGraph + LangChain utilities | explicit auditable workflow and checkpoints |
| Patch | unidiff + AST/CSS validators | constrained diffs |
| DB | MongoDB | nested scan/finding/evidence metadata |
| Artifacts | S3-compatible storage | screenshots/HTML/traces outside MongoDB |
| Queue | Redis | jobs, locks, progress |
| UI | React + TypeScript + Vite | requested frontend and dashboard |
| Data | TanStack Query, existing TanStack Router, Recharts | server state, routing, charts |
| Diff | Monaco or react-diff-viewer | reviewable patches |
| Progress | SSE first | simple one-way stream |

Selenium remains valid with an existing Selenium Grid or legacy-driver requirement, but Playwright is the stronger default for this project. A free-form LangChain agent is less defensible than LangGraph when patch provenance and verification matter.

## 4. Data plan

### Public resources
- **AccessGuru:** 3,500+ real-world violations from 448 sites and 112 types, with HTML/visual metadata. [DaRUS](https://darus.uni-stuttgart.de/dataset.xhtml?persistentId=doi%3A10.18419%2FDARUS-5177)
- **A11YBench:** test pages/repositories for accessibility repair. [Hugging Face](https://huggingface.co/datasets/LLM4APR/A11YBench)
- **Tabular Accessibility Dataset:** accessible/non-accessible PHP, Angular, React, and Vue examples. [Paper](https://doi.org/10.3390/data10090149)

Use them as external/supplementary benchmarks, not as a replacement for a controlled corpus.

### Build your own hybrid corpus
1. **Synthetic:** 12 project-owned React/plain-HTML fixtures, 8–12 pages/states each, 120–160 cases, 12–15 violation families. Each case has defective and accessible gold versions, source commit, expected WCAG SC, affected element, accepted patch, and whether autonomous fixing is allowed.
2. **Real public sites:** 20–30 sites across government, education, news, commerce, and services; 100–200 routes/states. Use for detection/generalization only; respect robots.txt, terms, rate limits, permissions, and redaction.
3. **External benchmark:** normalize public dataset records to the internal `Finding` schema and preserve license/provenance.

Two reviewers label presence, criterion/level, severity, element, evidence sufficiency, fixability, accepted fix, and post-fix result; third reviewer adjudicates. Split by site/fixture family, not individual findings; use 60/20/20 development/validation/test.

## 5. 16-week timeline

| Week | Milestone | Deliverable/gate |
|---|---|---|
| 1 | scope/research | WCAG subset, literature/competitor matrix |
| 2 | scaffold | FastAPI, MongoDB, Redis, React, schemas |
| 3 | crawler | bounded same-origin Playwright crawler |
| 4 | evidence | DOM/AX/screenshot/trace pack |
| 5 | detection | axe + probes + WCAG catalog |
| 6 | **MVP** | URL -> scan -> findings/evidence/export; no auto-fix |
| 7 | vision | evidence pack and structured model output |
| 8 | calibration | thresholds, human-review state, cost logs |
| 9 | remediation I | alt/name/label strategies |
| 10 | remediation II | contrast/keyboard/focus strategies, patch validator |
| 11 | sandbox | disposable patched fixture boots |
| 12 | verification | replay, primary rule, regression gate, rollback |
| 13 | agent | LangGraph checkpoint/retry/approval interrupt |
| 14 | **full loop** | scan -> detect -> patch -> verify -> report |
| 15 | evaluation | ablations, held-out results, metrics plots |
| 16 | demo | placement-ready before/after lab, dissertation package |

## 6. Evaluation

### Detection
Precision `TP/(TP+FP)`, recall `TP/(TP+FN)`, F1, false-positive rate, affected-element localization, WCAG mapping accuracy, ECE/Brier confidence calibration. Report micro and macro averages per issue family.

### Remediation
Verified fix rate, autonomous fix rate, partial/unchanged rate, regression rate, changed lines/files, human acceptance, time-to-remediation, retries, model calls, and cost per verified fix.

### Transparent score
```text
score = 100 * [1 - sum(weight_i * unresolved_i) / sum(weight_i * baseline_i)]
```
Pre-register weights, e.g. critical=4, serious=3, moderate=2, minor=1; always show raw counts.

### Baselines/ablations
1. axe-only; 2. axe+custom probes; 3. axe+probes+vision; 4. free-form LLM patch; 5. typed patch without verification; 6. typed patch with verification. Use same held-out cases, bootstrap 95% CIs, paired comparisons, and per-family error analysis.

Targets (not claimed results): precision >=0.85, recall >=0.75, >=5-point precision gain on contextual findings, verified fix >=0.70 for low-risk strategies, regression <0.10, median 10-page fixture scan <=60 seconds, vision escalation <=40% of findings.

## 7. Novelty and viva differentiation

**Against axe-core:** it is the deterministic baseline; your system adds browser behavior, contextual screenshots/DOM/AX/CSS, constrained code patches, and verification. [axe-core](https://github.com/dequelabs/axe-core)

**Against Lighthouse:** Lighthouse is a broad page-quality audit with accessibility as one category and a weighted pass/fail score. Your system specializes in evidence-level findings, source patches, and proof of remediation. [Lighthouse](https://developer.chrome.com/docs/lighthouse/accessibility) and [scoring](https://developer.chrome.com/docs/lighthouse/accessibility/scoring)

**Against WAVE:** WAVE supports user-impact inspection and human evaluation. Your system adds reproducible interaction-state crawling, patch generation, sandbox application, and fix/regression metrics. [WAVE](https://wave.webaim.org/)

Lead with: (1) context-aware hybrid detection over pixels plus structured browser evidence; (2) closed-loop remediation rather than detection-only output; (3) selective, typed, auditable agency with deterministic verification. Do not claim “first AI accessibility tool” without a systematic review.

## 8. Challenges and mitigations

| Challenge | Mitigation |
|---|---|
| Vision cost | selective escalation, crops, evidence cache, small triage model |
| hallucinated alt text | task context, evidence rationale, human review for uncertainty |
| contextual FP | multiple signals, calibration, human-review state |
| unsafe patch | typed strategy, file/line limits, no dependency edits, sandbox |
| contrast breaks brand | local changes, all-state checks, approval for global tokens |
| JS-heavy SPA | Playwright render, route events, stable-settle, bounded exploration |
| state explosion | action budgets, allowlists, state hashes, dry-run forms |
| shadow DOM/iframes | support open/same-origin in MVP; record limitations |
| dynamic instability | mask volatile areas, disable animation where safe, fixed environment |
| provider outage | retries/backoff, cached adjudication, deterministic fallback |
| corpus leakage | split by site/fixture family |
| privacy/legal | permission, redaction, rate limits, no third-party auto-modification |
| inaccessible dashboard | axe, keyboard-only, manual screen-reader smoke test |

## 9. Stretch goal

Build a project-owned **live accessibility repair lab**: defective checkout/landing fixture -> scan/highlights -> evidence-backed plan -> unified diff -> approval -> sandbox rebuild -> replay Tab/menu/invalid-form journey -> before/after screenshots/counts/score/regressions -> report export. Offer read-only public URL scanning, but remediate only project-owned or user-uploaded code.

## Definition of done

**Week 6:** URL, bounded crawl, axe/custom findings, evidence viewer, dashboard, export.

**Week 14:** selective vision review, four typed strategies, disposable patch, replay/rescan, regression gate, auditable report.

**Final:** source, fixture corpus, labels, diagram, API docs, experiments, dissertation chapters, and three-minute demo.
