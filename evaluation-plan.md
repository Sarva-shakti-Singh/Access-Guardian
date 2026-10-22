# Evaluation Plan

## Matrix
| ID | Detector | Vision | Remediation | Verification |
|---|---|---:|---:|---:|
| B0 | axe | no | no | no |
| B1 | axe + custom probes | no | no | no |
| B2 | axe + probes | yes | no | no |
| R0 | typed strategies | no | yes | no |
| R1 | typed strategies | no | yes | yes |
| R2 | vision + typed strategies | yes | yes | yes |

## Detection
Measure precision, recall, F1, FP rate, element localization, WCAG mapping, ECE/Brier. Report micro and macro averages per violation family.

## Remediation
Measure verified fix rate, autonomous fix rate, partial/unchanged rate, regression rate, changed files/lines, human acceptance, time-to-remediation, retries, model calls, and cost per verified fix.

## Score
`score = 100 * [1 - sum(weight_i * unresolved_i) / sum(weight_i * baseline_i)]`, with pre-registered severity weights. Report raw counts beside the score.

## Ground truth
Two reviewers label a stratified sample; a third adjudicates. Split by site/fixture family. Report Cohen’s kappa or Krippendorff’s alpha.

## Verification rule
Resolved means primary rule/probe passes, original route/state remains reachable, no new critical/serious issue appears, interaction assertions pass, and patch scope is allowed. If the rule passes but interaction breaks, mark regressed.

## Ablations
Remove screenshots; remove DOM/AX tree; all findings vs selective vision escalation; free-form vs typed patches; verification enabled vs disabled. Use bootstrap 95% CIs and paired comparisons on identical held-out cases.
