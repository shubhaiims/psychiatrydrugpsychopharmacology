// Load and display featured drugs and recent medications
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const response = await fetch('/api/drugs');
    const data = await response.json();
    const drugs = data.drugs || [];

    // Display featured drugs (first 3)
    const drugsGrid = document.getElementById('drugsGrid');
    if (drugsGrid && drugs.length > 0) {
      drugsGrid.innerHTML = drugs.slice(0, 3).map(drug => `
        <a href="/library?drug=${encodeURIComponent(drug.id)}" class="feature-card" style="text-decoration: none; color: inherit;">
          <h3 style="color: var(--accent);">${escapeHtml(drug.name)}</h3>
          <p>${escapeHtml(drug.category || 'Psychiatric Medication')}</p>
          <p style="font-size: 0.85rem; color: var(--accent); margin-top: 8px;">View Details →</p>
        </a>
      `).join('');
    }

    // Display recently added (last 3)
    const recentGrid = document.getElementById('recentGrid');
    if (recentGrid && drugs.length > 0) {
      const recent = drugs.length > 3 ? drugs.slice(-3).reverse() : drugs.slice(0, 3);
      recentGrid.innerHTML = recent.map(drug => `
        <a href="/library?drug=${encodeURIComponent(drug.id)}" class="feature-card" style="text-decoration: none; color: inherit;">
          <h3 style="color: var(--accent);">${escapeHtml(drug.name)}</h3>
          <p>${escapeHtml(drug.category || 'Psychiatric Medication')}</p>
          <p style="font-size: 0.85rem; color: var(--accent); margin-top: 8px;">View Details →</p>
        </a>
      `).join('');
    }
  } catch (error) {
    console.error('Error loading drugs:', error);
  }
});

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}
