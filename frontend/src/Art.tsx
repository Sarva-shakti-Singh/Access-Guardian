// Original illustrations for the four workflow steps. They are decorative mock screens
// (not real scan output), so they are hidden from assistive technology and each tile's
// caption carries the meaning.
const ff = "system-ui, -apple-system, 'Segoe UI', sans-serif";
const PINK = "#e6007a";

function Callout({ x, y, w, lines }: { x: number; y: number; w: number; lines: string[] }) {
  const h = 8 + lines.length * 10;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="4" fill={PINK} />
      {lines.map((l, i) => (
        <text key={l} x={x + 6} y={y + 12 + i * 10} fontSize="7.5" fill="#fff" fontFamily={ff} fontWeight="600">
          {l}
        </text>
      ))}
    </g>
  );
}

/** Step 1: crawled page with highlighted problems. */
export function ScanArt() {
  return (
    <svg viewBox="0 0 400 250" aria-hidden="true" className="art">
      <rect width="400" height="250" fill="#fff" />
      <rect width="400" height="26" fill="#e8ebf1" />
      <circle cx="13" cy="13" r="4" fill="#ff5f57" />
      <circle cx="27" cy="13" r="4" fill="#febc2e" />
      <circle cx="41" cy="13" r="4" fill="#28c840" />
      <rect x="62" y="5" width="250" height="16" rx="8" fill="#fff" />
      <text x="74" y="16.5" fontSize="8.5" fill="#556" fontFamily={ff}>demo-shop.example/checkout</text>
      <rect y="26" width="400" height="14" fill="#b3261e" />
      <text x="200" y="36" fontSize="7.5" fill="#fff" textAnchor="middle" fontFamily={ff}>Sample page for demonstration</text>
      <rect y="40" width="400" height="32" fill="#1d3557" />
      <text x="16" y="61" fontSize="13" fill="#fff" fontWeight="700" fontFamily={ff}>DemoShop</text>
      {[250, 290, 330, 370].map((x) => (
        <rect key={x} x={x - 22} y="53" width="30" height="5" rx="2.5" fill="#8fa3c2" />
      ))}
      <text x="20" y="102" fontSize="19" fill="#1d3557" fontWeight="700" fontFamily={ff}>Checkout</text>
      <rect x="20" y="110" width="160" height="4" rx="2" fill="#d5dae3" />
      <rect x="20" y="118" width="120" height="4" rx="2" fill="#d5dae3" />
      <rect x="20" y="132" width="150" height="22" rx="3" fill="#fff" stroke={PINK} strokeWidth="2" strokeDasharray="3 2" />
      <rect x="20" y="162" width="150" height="22" rx="3" fill="#fff" stroke="#9aa3b2" />
      <rect x="20" y="194" width="92" height="26" rx="4" fill="#9aa5b1" />
      <text x="66" y="210" fontSize="9" fill="#c9d1db" textAnchor="middle" fontFamily={ff} fontWeight="600">Pay now</text>
      <rect x="292" y="112" width="92" height="82" rx="4" fill="#cfd8e3" stroke={PINK} strokeWidth="2" strokeDasharray="3 2" />
      <path d="m306 180 22-26 14 14 12-10 20 22z" fill="#a9b7c9" />
      <Callout x={178} y={124} w={98} lines={["Input has no", "accessible label"]} />
      <Callout x={226} y={176} w={92} lines={["Image missing alt"]} />
      <Callout x={118} y={200} w={84} lines={["Contrast 2.1 : 1"]} />
      <rect y="228" width="400" height="22" fill="#f1f2f7" />
      <rect x="10" y="233" width="60" height="12" rx="6" fill="#e0e3ee" />
      <text x="40" y="241.5" fontSize="7.5" fill="#33364d" textAnchor="middle" fontFamily={ff}>axe-core</text>
      <text x="390" y="241.5" fontSize="8" fill={PINK} textAnchor="end" fontFamily={ff} fontWeight="700">12 issues found · 3 pages</text>
    </svg>
  );
}

/** Step 2: vision model observations over a screenshot. */
export function VisionArt() {
  const chips: [string, string, string][] = [
    ["#ff9f43", "Low-contrast text", "0.82"],
    ["#7aa2ff", "Unclear icon button", "0.74"],
    ["#c77dff", "Image purpose unclear", "0.61"],
  ];
  return (
    <svg viewBox="0 0 400 250" aria-hidden="true" className="art">
      <defs>
        <linearGradient id="vg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7b61ff" />
          <stop offset="1" stopColor="#ff6fb1" />
        </linearGradient>
      </defs>
      <rect width="400" height="250" fill="url(#vg)" />
      <rect x="18" y="16" width="214" height="218" rx="10" fill="#fff" />
      <rect x="30" y="28" width="190" height="62" rx="6" fill="#dfe6f2" />
      <path d="m44 82 30-34 18 20 14-12 30 26z" fill="#b6c4da" />
      <rect x="30" y="28" width="190" height="62" rx="6" fill="none" stroke="#c77dff" strokeWidth="2" strokeDasharray="4 3" />
      <rect x="30" y="102" width="130" height="8" rx="4" fill="#232a3a" />
      <rect x="30" y="116" width="150" height="6" rx="3" fill="#c3c8d3" />
      <rect x="30" y="116" width="150" height="6" rx="3" fill="none" stroke="#ff9f43" strokeWidth="2" />
      <rect x="30" y="130" width="110" height="6" rx="3" fill="#c3c8d3" />
      <circle cx="46" cy="170" r="16" fill="#eef1f8" />
      <path d="M40 170h12M46 164v12" stroke="#7a8296" strokeWidth="3" strokeLinecap="round" />
      <circle cx="46" cy="170" r="19" fill="none" stroke="#7aa2ff" strokeWidth="2" strokeDasharray="4 3" />
      <rect x="76" y="156" width="130" height="28" rx="6" fill="#2f6bff" />
      <text x="141" y="174" fontSize="10" fill="#fff" textAnchor="middle" fontFamily={ff} fontWeight="600">Continue</text>
      <rect x="30" y="200" width="190" height="20" rx="4" fill="#f3f5fa" />
      <rect x="244" y="16" width="138" height="218" rx="10" fill="#14151b" />
      <text x="256" y="38" fontSize="10" fill="#fff" fontFamily={ff} fontWeight="700">AI observations</text>
      {chips.map(([c, label, conf], i) => (
        <g key={label} transform={`translate(0 ${i * 52})`}>
          <rect x="254" y="50" width="118" height="44" rx="6" fill="#20222b" />
          <circle cx="266" cy="64" r="4" fill={c} />
          <text x="276" y="67" fontSize="8.5" fill="#fff" fontFamily={ff} fontWeight="600">{label}</text>
          <text x="266" y="84" fontSize="7.5" fill="#b4b8c6" fontFamily={ff}>Potential · confidence {conf}</text>
        </g>
      ))}
      <rect x="254" y="208" width="118" height="18" rx="9" fill="#2a2d38" />
      <text x="313" y="220" fontSize="7.5" fill="#ffd27a" textAnchor="middle" fontFamily={ff} fontWeight="600">Needs human review</text>
    </svg>
  );
}

/** Step 3: findings explained with WCAG mapping. */
export function ExplainArt() {
  const segs: [string, number][] = [["#c62828", 37.7], ["#ef6c00", 100.5], ["#f9a825", 75.4], ["#5c6bc0", 37.7]];
  let off = 0;
  const rows: [string, string, string][] = [
    ["image-alt", "critical", "#c62828"],
    ["label", "serious", "#ef6c00"],
    ["color-contrast", "serious", "#ef6c00"],
    ["heading-order", "moderate", "#b58900"],
  ];
  return (
    <svg viewBox="0 0 400 250" aria-hidden="true" className="art">
      <rect width="400" height="250" fill="#eef1f7" />
      <rect x="14" y="14" width="168" height="222" rx="10" fill="#fff" />
      <text x="26" y="34" fontSize="9.5" fill="#1c2233" fontFamily={ff} fontWeight="700">Problems found</text>
      <g transform="rotate(-90 98 100)">
        {segs.map(([c, len]) => {
          const el = <circle key={c} cx="98" cy="100" r="40" fill="none" stroke={c} strokeWidth="16" strokeDasharray={`${len} 251.3`} strokeDashoffset={-off} />;
          off += len;
          return el;
        })}
      </g>
      <text x="98" y="104" fontSize="20" fill="#1c2233" textAnchor="middle" fontFamily={ff} fontWeight="700">12</text>
      <text x="98" y="115" fontSize="7" fill="#5b6275" textAnchor="middle" fontFamily={ff}>findings</text>
      {[["#c62828", "Critical 2"], ["#ef6c00", "Serious 5"], ["#f9a825", "Moderate 3"], ["#5c6bc0", "Minor 2"]].map(([c, t], i) => (
        <g key={t} transform={`translate(${28 + (i % 2) * 78} ${166 + Math.floor(i / 2) * 18})`}>
          <rect width="8" height="8" rx="2" fill={c} />
          <text x="13" y="8" fontSize="8" fill="#2a3042" fontFamily={ff}>{t}</text>
        </g>
      ))}
      <rect x="194" y="14" width="192" height="104" rx="10" fill="#fff" stroke="#d5dae6" />
      <text x="206" y="34" fontSize="9.5" fill="#1c2233" fontFamily={ff} fontWeight="700">Form element has no label</text>
      {["WCAG 1.3.1", "WCAG 3.3.2", "WCAG 4.1.2"].map((t, i) => (
        <g key={t}>
          <rect x={206 + i * 56} y="42" width="50" height="14" rx="7" fill="#e3e8fb" />
          <text x={231 + i * 56} y="52" fontSize="7" fill="#27348b" textAnchor="middle" fontFamily={ff} fontWeight="600">{t}</text>
        </g>
      ))}
      <text x="206" y="74" fontSize="7.8" fill="#3b4256" fontFamily={ff}>Screen readers cannot announce what this</text>
      <text x="206" y="85" fontSize="7.8" fill="#3b4256" fontFamily={ff}>field is for, so people using them cannot</text>
      <text x="206" y="96" fontSize="7.8" fill="#3b4256" fontFamily={ff}>complete the checkout.</text>
      <rect x="206" y="102" width="62" height="11" rx="5.5" fill="#fff3d6" />
      <text x="237" y="110" fontSize="6.8" fill="#7a5400" textAnchor="middle" fontFamily={ff} fontWeight="600">axe-core · confirmed</text>
      <rect x="194" y="128" width="192" height="108" rx="10" fill="#fff" stroke="#d5dae6" />
      <text x="206" y="146" fontSize="9" fill="#1c2233" fontFamily={ff} fontWeight="700">Most common rules</text>
      {rows.map(([r, s, c], i) => (
        <g key={r} transform={`translate(0 ${i * 20})`}>
          <rect x="206" y="154" width="168" height="1" fill="#e7eaf2" />
          <text x="206" y="171" fontSize="8.5" fill="#2a3042" fontFamily={ff}>{r}</text>
          <text x="374" y="171" fontSize="8" fill={c} textAnchor="end" fontFamily={ff} fontWeight="700">{s}</text>
        </g>
      ))}
    </svg>
  );
}

/** Step 4: reviewable fix proposal (HTML so code text stays crisp). */
export function FixArt() {
  return (
    <div className="editor" aria-hidden="true">
      <div className="ed-code">
        <div className="ed-tab">checkout.html</div>
        <div className="ln dim">{"  <form class=\"pay\">"}</div>
        <div className="ln del">{"-   <input id=\"email\" type=\"email\">"}</div>
        <div className="ln add">{"+   <input id=\"email\" type=\"email\""}</div>
        <div className="ln add">{"+          aria-label=\"Email address\">"}</div>
        <div className="ln dim">{"    <img src=\"hero.jpg\">"}</div>
        <div className="ln del">{"-   <img src=\"hero.jpg\">"}</div>
        <div className="ln add">{"+   <img src=\"hero.jpg\" alt=\"Blue shoe\">"}</div>
        <div className="ln dim">{"  </form>"}</div>
      </div>
      <div className="ed-side">
        <b>Proposal</b>
        <p>Add accessible names to 2 elements. Nothing is written until you review the diff.</p>
        <span className="ed-badge">Attributes only</span>
        <div className="ed-actions">
          <span className="ed-btn ok">Accept</span>
          <span className="ed-btn">Reject</span>
        </div>
      </div>
    </div>
  );
}
