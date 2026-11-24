# Phased Multi-file Remediation Plan

## Current scope

Only one saved workspace file and one complete HTML element are supported. This boundary prevents cross-file accidental edits and preserves the existing stale-document checks.

## Phase 1: Proposal batching

1. Add a proposal registry with one entry per file/range.
2. Require a separate saved-file and complete-element validation for every entry.
3. Capture a separate document version, text snapshot, selected range, and disk snapshot.
4. Re-run the existing AI response and HTML restrictions independently for every proposed change.

## Phase 2: Consolidated review

1. Open a native VS Code multi-diff/editor view or one diff per file.
2. Keep a pending list visible until every entry is reviewed.
3. Reject removes only the pending proposal or entire batch, based on an explicit developer action.
4. Duplicate or overlapping ranges must be rejected.

## Phase 3: Atomic application

1. Revalidate every document and snapshot immediately before editing.
2. Apply changes transactionally as workspace edits.
3. If any validation fails, apply nothing.
4. Keep every resulting buffer unsaved for developer review and normal Undo behavior.
5. Requiring explicit consent for the selected context remains mandatory.

## Not included

- Workspace-wide searching.
- Automatic public-page-to-source mapping.
- Arbitrary file discovery.
- Saving files.
- Running commands or editing non-text files.
