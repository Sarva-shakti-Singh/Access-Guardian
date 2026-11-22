import type { ReactNode } from "react";
import { ExplainArt, FixArt, ScanArt, VisionArt } from "./Art";

const STEPS: { n: number; title: string; tech: string; art: ReactNode; blurb: string }[] = [
  { n: 1, title: "Scan website", tech: "Playwright", art: <ScanArt />, blurb: "Bounded same-origin crawl with screenshots and keyboard evidence." },
  { n: 2, title: "Analyze visually", tech: "Vision AI", art: <VisionArt />, blurb: "Optional, opt-in screenshot review. Observations are potential, not confirmed." },
  { n: 3, title: "Explain problems", tech: "AI + axe-core", art: <ExplainArt />, blurb: "Each finding is mapped to WCAG criteria and explained in plain language." },
  { n: 4, title: "Generate fixes", tech: "AI remediation", art: <FixArt />, blurb: "Constrained proposals that you review. The backend never edits source." },
];

export default function WorkflowPanel({ children }: { children?: ReactNode }) {
  return (
    <section className="panel" aria-labelledby="wf-title">
      <h1 id="wf-title">The Access Guardian AI workflow</h1>
      <ol className="grid">
        {STEPS.map((s) => (
          <li key={s.n} className="tile">
            <div className="art-frame">{s.art}</div>
            <p className="cap">
              <b>
                {s.n}. {s.title}
              </b>
              <span>{s.tech}</span>
            </p>
            <p className="sr-only">{s.blurb}</p>
          </li>
        ))}
        {children}
      </ol>
      <p className="note">Illustrations are examples, not scan results. Automated and AI findings are not a WCAG conformance result.</p>
    </section>
  );
}
