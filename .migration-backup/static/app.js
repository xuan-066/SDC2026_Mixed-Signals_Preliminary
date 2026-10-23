const DEMO = window.SEJUK_DEMO;
const STORAGE_KEY = "glacier-link-demo-decision";
const app = document.getElementById("app");
const page = document.body.dataset.page;

function getDecision() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "PENDING";
  } catch {
    return "PENDING";
  }
}

function saveDecision(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Still works for the current page if browser storage is unavailable.
  }
}

function money(value) {
  return "RM " + Number(value).toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function statusClass(status) {
  return String(status).toLowerCase().replaceAll("_", "-");
}

function dashboardPage() {
  const decision = getDecision();

  return `
    <section class="intro">
      <div>
        <p class="eyebrow">EQUIPMENT OVERVIEW</p>
        <h1>Cold chain.<br><span>Clear priorities.</span></h1>
        <p class="intro-copy">${DEMO.business}</p>
      </div>
      <div class="intro-sticker">STAY<br>COOL ✳</div>
    </section>

    <section class="critical-card">
      <div class="critical-main">
        <div class="critical-topline">
          <span class="status-badge critical">● CRITICAL · ACT NOW</span>
          <span class="incident-number">${DEMO.incident.id}</span>
        </div>
        <h2>${DEMO.incident.asset} is too warm</h2>
        <p>Move stock to <b>${DEMO.incident.backup}</b>, then review the call-out.</p>
        <a class="button button-dark" href="./incident.html">Open incident <span>→</span></a>
      </div>

      <div class="critical-stats">
        <div class="temperature-box">
          <span class="tiny-label">TEMPERATURE</span>
          <strong>${DEMO.incident.temperature}</strong>
          <small>Safe range ${DEMO.incident.safeRange}</small>
        </div>
        <div class="risk-box">
          <span class="tiny-label">STOCK AT RISK</span>
          <strong>${money(DEMO.incident.stockAtRisk)}</strong>
          <small>Estimated demo value</small>
        </div>
      </div>
      <span class="paper-star" aria-hidden="true">✳</span>
    </section>

    <section class="section-title">
      <div><p class="eyebrow">WHAT TO DO NEXT</p><h2>Follow the response</h2></div>
      <span class="section-note">2 steps</span>
    </section>

    <section class="flow-grid">
      <a class="flow-card flow-move" href="./incident.html">
        <span class="step-number">01</span>
        <span class="flow-icon">↗</span>
        <span class="flow-copy">
          <small>MOVE STOCK</small>
          <strong>${DEMO.incident.backup}</strong>
          <em>${DEMO.incident.backupSpace}</em>
        </span>
        <span class="flow-arrow">→</span>
      </a>

      <a class="flow-card flow-approve" href="./approvals.html">
        <span class="step-number">02</span>
        <span class="flow-icon">!</span>
        <span class="flow-copy">
          <small>CALL-OUT APPROVAL · ${decision}</small>
          <strong>${money(DEMO.incident.callout)}</strong>
          <em>Owner approval required</em>
        </span>
        <span class="flow-arrow">→</span>
      </a>
    </section>

    <section class="section-title">
      <div><p class="eyebrow">ALL UNITS</p><h2>Equipment status</h2></div>
      <span class="section-note">4 monitored</span>
    </section>

    <section class="equipment-grid">
      ${DEMO.assets.map(asset => `
        <article class="equipment-card ${asset.status === "CRITICAL" ? "equipment-critical" : ""}">
          <span class="paperclip" aria-hidden="true"></span>
          <div class="equipment-top">
            <span class="equipment-icon">${asset.type === "Freezer" ? "❄" : "◌"}</span>
            <span class="status-badge ${statusClass(asset.status)}">${asset.status}</span>
          </div>
          <h3>${asset.name}</h3>
          <strong class="equipment-temp">${asset.temperature}</strong>
          <p class="equipment-range">Safe ${asset.range}</p>
          <div class="meter"><span style="width:${asset.fill}%"></span></div>
        </article>
      `).join("")}
    </section>

    <p class="prototype-note">Mockup only · Buttons do not contact the backend</p>
  `;
}

function timelineMarkup() {
  return DEMO.incident.timeline.map(event => `
    <div class="timeline-item">
      <span class="timeline-dot"></span>
      <div class="timeline-copy">
        <strong>${event.title}</strong>
        <p>${event.detail}</p>
      </div>
      <time>${event.time}</time>
    </div>
  `).join("");
}

function incidentPage() {
  const decision = getDecision();

  return `
    <a class="back-link" href="./dashboard.html">← Overview</a>

    <section class="page-title-row">
      <div>
        <p class="eyebrow">INCIDENT · ${DEMO.incident.id}</p>
        <h1>${DEMO.incident.asset}</h1>
      </div>
      <span class="status-badge critical large-badge">● CRITICAL</span>
    </section>

    <section class="critical-card incident-hero">
      <div class="critical-main">
        <span class="status-badge critical">OUTSIDE SAFE RANGE</span>
        <h2>Move stock first.</h2>
        <p>Then review the technician call-out.</p>
      </div>
      <div class="critical-stats">
        <div class="temperature-box">
          <span class="tiny-label">TEMPERATURE</span>
          <strong>${DEMO.incident.temperature}</strong>
          <small>Safe ${DEMO.incident.safeRange}</small>
        </div>
        <div class="risk-box">
          <span class="tiny-label">STOCK AT RISK</span>
          <strong>${money(DEMO.incident.stockAtRisk)}</strong>
          <small>Estimated demo value</small>
        </div>
      </div>
    </section>

    <section class="detail-grid">
      <article class="paper-card">
        <span class="paperclip" aria-hidden="true"></span>
        <p class="eyebrow">STOCK INSIDE</p>
        <h2>Items at risk</h2>
        <div class="stock-list">
          ${DEMO.incident.items.map(item => `
            <div class="stock-row">
              <span>${item.name}</span>
              <strong>${money(item.value)}</strong>
            </div>
          `).join("")}
        </div>
        <div class="stock-total">
          <span>Total</span>
          <strong>${money(DEMO.incident.stockAtRisk)}</strong>
        </div>
      </article>

      <article class="paper-card decision-card">
        <span class="paperclip" aria-hidden="true"></span>
        <p class="eyebrow">STEP 1 · MOVE STOCK</p>
        <h2>${DEMO.incident.backup}</h2>
        <div class="recommendation">
          <span>↗</span>
          <div><strong>${DEMO.incident.backupSpace}</strong><small>Unit in safe range</small></div>
        </div>

        <div class="separator"></div>
        <p class="eyebrow">STEP 2 · APPROVAL</p>
        <div class="vendor-row">
          <div><strong>${DEMO.incident.vendor}</strong><small>Call-out</small></div>
          <strong>${money(DEMO.incident.callout)}</strong>
        </div>
        <div class="approval-callout">
          <b>!</b>
          <div><strong>Owner approval required</strong><small>Above the RM 150 limit</small></div>
        </div>
        <a class="button button-dark full-button" href="./approvals.html">Review approval →</a>
      </article>
    </section>

    <section class="section-title">
      <div><p class="eyebrow">EVENT LOG</p><h2>What happened</h2></div>
      <span class="status-badge ${statusClass(decision)}">${decision}</span>
    </section>

    <section class="paper-card timeline-card">
      ${timelineMarkup()}
      ${decision !== "PENDING" ? `<div class="local-result">Demo decision: <b>${decision}</b></div>` : ""}
    </section>
  `;
}

function approvalsPage() {
  const decision = getDecision();
  const pending = decision === "PENDING";

  return `
    <a class="back-link" href="./incident.html">← Incident</a>

    <section class="page-title-row">
      <div>
        <p class="eyebrow">STEP 2 · APPROVAL</p>
        <h1>Call-out</h1>
        <p class="intro-copy">Review the request for ${DEMO.incident.asset}.</p>
      </div>
      <span class="status-badge ${statusClass(decision)} large-badge">${decision}</span>
    </section>

    <section class="approval-layout">
      <article class="paper-card approval-paper">
        <span class="paperclip" aria-hidden="true"></span>
        <div class="vendor-heading">
          <span class="vendor-mark">GL</span>
          <div><p class="eyebrow">TECHNICIAN</p><h2>${DEMO.incident.vendor}</h2></div>
        </div>

        <div class="amount-card">
          <span>CALL-OUT PRICE</span>
          <strong>${money(DEMO.incident.callout)}</strong>
          <small>Demo amount · No payment made</small>
        </div>

        <div class="approval-row"><span>Approver</span><strong>Owner</strong></div>
        <div class="approval-row"><span>Stock at risk</span><strong>${money(DEMO.incident.stockAtRisk)}</strong></div>
        <div class="approval-row"><span>Severity</span><span class="status-badge critical">CRITICAL</span></div>

        ${pending ? `
          <div class="approval-actions">
            <button class="button button-outline" data-decision="REJECTED">Reject</button>
            <button class="button button-dark" data-decision="APPROVED">Approve →</button>
          </div>
          <p class="prototype-note">Prototype only · No backend action</p>
        ` : `
          <div class="decision-result ${statusClass(decision)}">
            <strong>Demo decision: ${decision}</strong>
            <span>Saved in this browser only.</span>
          </div>
        `}
      </article>

      <aside class="paper-card approval-aside">
        <p class="eyebrow">WHY OWNER?</p>
        <h2>Price is above the limit.</h2>
        <p class="body-copy">${money(DEMO.incident.callout)} call-out · ${money(DEMO.incident.approvalLimit)} supervisor limit.</p>
        <div class="separator"></div>
        <a class="text-arrow" href="./incident.html">Review incident →</a>
      </aside>
    </section>
  `;
}

function renderPage() {
  if (page === "dashboard") app.innerHTML = dashboardPage();
  else if (page === "incident") app.innerHTML = incidentPage();
  else if (page === "approvals") app.innerHTML = approvalsPage();
  else app.innerHTML = "<h1>Page not found</h1>";

  app.querySelectorAll("[data-decision]").forEach(button => {
    button.addEventListener("click", () => {
      saveDecision(button.dataset.decision);
      renderPage();
    });
  });
}

document.querySelectorAll("[data-reset]").forEach(button => {
  button.addEventListener("click", () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    renderPage();
  });
});

renderPage();