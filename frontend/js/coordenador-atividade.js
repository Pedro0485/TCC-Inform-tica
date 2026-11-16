(() => {
  const host = document.querySelector('[data-recent-activity]');
  if (!host) return;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  function formatarData(value) {
    const data = new Date(value);
    if (Number.isNaN(data.getTime())) return '';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(data);
  }

  async function carregar() {
    try {
      const response = await fetch('/admin/dados/atividade-recente', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
        cache: 'no-store'
      });
      const data = await response.json().catch(() => []);
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o histórico.');

      if (!Array.isArray(data) || data.length === 0) {
        host.innerHTML = '<p class="activity-empty">Ainda não há alterações registradas. As próximas operações da coordenação aparecerão aqui.</p>';
        return;
      }

      host.innerHTML = data.map((item) => `
        <article class="activity-item">
          <span class="activity-marker" aria-hidden="true"><i class="ti ti-history"></i></span>
          <div class="activity-content">
            <strong>${esc(item.usuario_nome)}</strong>
            <p>${esc(item.detalhes)}</p>
            <small>${esc(item.entidade)} · ${esc(formatarData(item.created_at))}</small>
          </div>
        </article>
      `).join('');
    } catch (error) {
      host.innerHTML = `<p class="activity-empty">${esc(error.message)}</p>`;
    }
  }

  carregar();
  window.setInterval(() => { if (!document.hidden) carregar(); }, 60000);
  window.addEventListener('focus', carregar);
})();
