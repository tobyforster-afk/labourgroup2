/*************************************************************
 *
 * COMPONENTS
 *
 *************************************************************/

function statCard(value, label) {
  return `
    <div class="stat-card">
      <span>${escapeHtml(value)}</span>
      <strong>${escapeHtml(label)}</strong>
    </div>
  `;
}
