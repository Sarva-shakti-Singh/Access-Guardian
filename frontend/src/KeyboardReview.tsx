import type { ScanRecord } from "./types";

export default function KeyboardReview({ scan }: { scan: ScanRecord }) {
  const pages = scan.pages.filter((page) => page.evidence?.tab_order);
  if (!pages.length) return null;

  return (
    <section className="panel keyboard-review" aria-labelledby="keyboard-title">
      <h2 id="keyboard-title">Keyboard review evidence</h2>
      <p className="muted">A short, passive sample of up to 12 Tab stops per page. Styling is observed while focused, not compared against the unfocused state. This is not a pass/fail test and does not establish keyboard accessibility.</p>
      <ul className="keyboard-pages">
        {pages.map((page, index) => {
          const stops = page.evidence?.tab_order ?? [];
          const noOutlineOrShadow = stops.filter((stop) => !(stop.has_outline_or_shadow ?? stop.has_outline));
          return (
            <li key={`${page.url}-${index}`}>
              <b>{page.title || page.url}</b>
              <p>{stops.length} Tab stop{stops.length === 1 ? "" : "s"} observed in the sample.</p>
              {stops.length > 0 && (
                <p>
                  {noOutlineOrShadow.length
                    ? `${noOutlineOrShadow.length} sampled element(s) had no outline or box-shadow while focused. Review them manually.`
                    : "An outline or box-shadow was present on each sampled focused element; check that it is a visible focus treatment."}
                </p>
              )}
              {stops.length === 0 && <p>No Tab stops were observed in this short sample; this does not prove the page has no keyboard-operable controls.</p>}
              <details>
                <summary>Show sampled focus order</summary>
                <ol>
                  {stops.map((stop, stopIndex) => (
                    <li key={`${stop.id ?? stop.tag}-${stopIndex}`}>
                      <code>{stop.tag}{stop.id ? `#${stop.id}` : ""}</code>
                      {stop.name ? ` · ${stop.name}` : ""}
                      {" · "}
                      {stop.has_outline_or_shadow ?? stop.has_outline ? "outline/shadow present while focused" : "no outline/shadow present"}
                    </li>
                  ))}
                </ol>
              </details>
            </li>
          );
        })}
      </ul>
      <p className="keyboard-checklist"><b>Check manually:</b> activate controls with Enter/Space, confirm focus order is sensible and visible, and confirm dialogs/widgets can be exited without a keyboard trap.</p>
    </section>
  );
}
