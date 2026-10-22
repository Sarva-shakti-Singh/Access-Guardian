:root {
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  line-height: 1.5;
  color: #e5eefb;
  background: #07111f;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
}

html, body, #root {
  margin: 0;
  min-height: 100%;
  min-width: 100%;
  background: linear-gradient(180deg, #07111f 0%, #0b1628 100%);
}

body {
  min-height: 100vh;
}

button, input {
  font: inherit;
}

.app-shell {
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px 20px 48px;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}

.eyebrow {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #8ec5ff;
}

h1 {
  margin: 4px 0 0;
  font-size: clamp(2rem, 4vw, 2.8rem);
}

.toggle-group {
  display: inline-flex;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  padding: 4px;
}

.toggle-group button {
  border: none;
  background: transparent;
  color: #d3e4ff;
  border-radius: 999px;
  padding: 10px 16px;
  cursor: pointer;
  transition: 0.2s ease;
}

.toggle-group button.active {
  background: #7cc5ff;
  color: #05121b;
  font-weight: 700;
}

.scan-panel, .card {
  background: rgba(10, 20, 33, 0.8);
  border: 1px solid rgba(143, 192, 255, 0.18);
  border-radius: 18px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.22);
}

.scan-panel {
  padding: 20px;
}

.input-row {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.input-row input {
  flex: 1;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid rgba(138, 173, 255, 0.24);
  background: rgba(255, 255, 255, 0.04);
  color: #eef5ff;
}

.input-row button {
  border: none;
  border-radius: 12px;
  padding: 14px 18px;
  background: linear-gradient(135deg, #69b7ff 0%, #7ef8d3 100%);
  color: #041622;
  font-weight: 700;
  cursor: pointer;
}

.status-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(120px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.status-row > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
}

.status-label {
  color: #9fb7d5;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.phase-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.phase {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.03);
  color: #a8b9d7;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.phase.current {
  background: rgba(117, 197, 255, 0.2);
  color: #bfe6ff;
  border: 1px solid rgba(117, 197, 255, 0.35);
}

.content-grid {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 20px;
  margin-top: 24px;
}

.card {
  padding: 20px;
}

.card h2 {
  margin-top: 0;
}

.finding-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 14px;
}

.finding {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.02);
}

.finding-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  color: #bfe4ff;
  font-weight: 700;
}

.finding p {
  margin: 0 0 10px;
  color: #e6eefb;
}

.finding code,
.finding pre {
  display: block;
  background: rgba(5, 17, 28, 0.85);
  color: #dcecff;
  border-radius: 8px;
  padding: 10px 12px;
  white-space: pre-wrap;
  word-break: break-word;
}

.finding a {
  color: #7ec5ff;
  margin-top: 10px;
  display: inline-block;
}

.severity-critical {
  border-color: rgba(255, 110, 110, 0.5);
}

.severity-serious {
  border-color: rgba(255, 171, 87, 0.5);
}

.history-card {
  margin-top: 24px;
}

.history-list {
  display: grid;
  gap: 10px;
}

.history-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
}

.history-item > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.history-item span {
  color: #b1c8eb;
}

.error-box {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255, 115, 115, 0.12);
  border: 1px solid rgba(255, 115, 115, 0.3);
  color: #ffd7d7;
}

@media (max-width: 800px) {
  .topbar,
  .input-row,
  .history-item {
    flex-direction: column;
    align-items: stretch;
  }

  .content-grid,
  .status-row {
    grid-template-columns: 1fr;
  }
}
