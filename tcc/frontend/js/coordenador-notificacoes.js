(() => {
  const form = document.querySelector('[data-create-notification-form]');
  if (!form) return;
  const target = form.querySelector('[name="destino_tipo"]');
  const specificWrap = form.querySelector('[data-specific-target-wrap]');
  const specific = form.querySelector('[name="destino_id"]');
  const submit = form.querySelector('button[type="submit"]');
  const token = () => localStorage.getItem('token') || '';

  async function api(url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
    const data = await res.json().catch(() => ([]));
    if (!res.ok) throw new Error(data.error || 'Erro ao carregar destinatários');
    return data;
  }

  async function updateSpecific() {
    const type = target.value;
    if (!['professor','turma'].includes(type)) {
      specificWrap.hidden = true; specific.required = false; specific.innerHTML = ''; return;
    }
    specificWrap.hidden = false; specific.required = true;
    specific.innerHTML = '<option value="">Carregando...</option>';
    try {
      const list = await api(type === 'professor' ? '/professor' : '/turmas');
      specific.innerHTML = '<option value="">Selecione...</option>' + list
        .filter(x => type !== 'professor' || !x.admin)
        .map(x => `<option value="${x.id}">${type === 'professor' ? x.nome : `${x.nome} - ${x.ano}º ano`}</option>`).join('');
    } catch (err) {
      specific.innerHTML = '<option value="">Erro ao carregar</option>';
    }
  }

  target.addEventListener('change', updateSpecific);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = Object.fromEntries(fd.entries());
    if (!body.destino_id) delete body.destino_id;
    submit.disabled = true; submit.textContent = 'Enviando...';
    try {
      const res = await fetch('/notificacoes', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${token()}` },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Não foi possível enviar a notificação');
      form.reset(); await updateSpecific();
      if (window.NoctopusNotifications) await window.NoctopusNotifications.reload(false);
      if (window.Swal) Swal.fire({ icon:'success', title:'Notificação enviada!', text:'Os destinatários receberão este aviso.', timer:1800, showConfirmButton:false });
      else alert('Notificação enviada com sucesso!');
    } catch (err) {
      if (window.Swal) Swal.fire({ icon:'error', title:'Erro', text:err.message });
      else alert(err.message);
    } finally { submit.disabled = false; submit.textContent = 'Enviar notificação'; }
  });
})();
