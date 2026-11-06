// ───────────────────────── CONTA (nome/email/senha do usuário logado) ─────────────────────────

const API_MEU_PERFIL = '/professor/me';

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  };
}

// Se o token expirou, manda de volta pro login
async function tratarRespostaAuth(res) {
  if (res.status === 401 || res.status === 403) {
    if (window.Swal) {
      await Swal.fire({
        title: 'Sessão expirada',
        text: 'Faça login novamente.',
        icon: 'warning',
        confirmButtonText: 'OK',
        heightAuto: false
      });
    }
    window.location.href = '/index.html';
    return true;
  }
  return false;
}

function mostrarMensagem(icon, title, text) {
  if (window.Swal) {
    Swal.fire({ icon, title, text, confirmButtonText: 'OK', heightAuto: false });
  } else {
    alert(`${title}${text ? ' — ' + text : ''}`);
  }
}

const inputNome = document.getElementById('config-nome');
const inputEmail = document.getElementById('config-email');
const btnSalvarConta = document.getElementById('btn-salvar-conta');
const inputNovaSenha = document.getElementById('config-nova-senha');
const inputConfirmarSenha = document.getElementById('config-confirmar-senha');
const btnAlterarSenha = document.getElementById('btn-alterar-senha');

// Busca os dados reais do usuário logado e preenche os campos
async function carregarMeuPerfil() {
  try {
    const res = await fetch(API_MEU_PERFIL, { headers: authHeaders() });
    if (await tratarRespostaAuth(res)) return;

    if (!res.ok) throw new Error('Erro ao carregar seus dados');

    const perfil = await res.json();
    inputNome.value = perfil.nome;
    inputEmail.value = perfil.email;
  } catch (err) {
    mostrarMensagem('error', 'Ops', err.message);
  }
}

// Salva nome/email alterados
btnSalvarConta?.addEventListener('click', async () => {
  const nome = inputNome.value.trim();
  const email = inputEmail.value.trim().toLowerCase();

  if (!nome || !email) {
    mostrarMensagem('warning', 'Preencha nome e email');
    return;
  }

  try {
    const res = await fetch(API_MEU_PERFIL, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ nome, email })
    });

    if (await tratarRespostaAuth(res)) return;

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao salvar');

    inputNome.value = data.nome;
    if (window.atualizarNomeSidebar) window.atualizarNomeSidebar(data.nome);
    inputEmail.value = data.email;
    mostrarMensagem('success', 'Dados atualizados!');
  } catch (err) {
    mostrarMensagem('error', 'Ops', err.message);
  }
});

// Troca de senha
btnAlterarSenha?.addEventListener('click', async () => {
  const senha = inputNovaSenha.value;
  const confirmar = inputConfirmarSenha.value;

  if (!senha || !confirmar) {
    mostrarMensagem('warning', 'Preencha os dois campos de senha');
    return;
  }

  if (senha.length < 6) {
    mostrarMensagem('warning', 'A senha deve ter pelo menos 6 caracteres');
    return;
  }

  if (senha !== confirmar) {
    mostrarMensagem('warning', 'As senhas não coincidem');
    return;
  }

  try {
    const res = await fetch(API_MEU_PERFIL, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ senha })
    });

    if (await tratarRespostaAuth(res)) return;

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao alterar senha');

    inputNovaSenha.value = '';
    inputConfirmarSenha.value = '';
    mostrarMensagem('success', 'Senha alterada com sucesso!');
  } catch (err) {
    mostrarMensagem('error', 'Ops', err.message);
  }
});

carregarMeuPerfil();

// Primeiro acesso com senha provisória (nome.sobrenome): pede para definir uma nova
if (sessionStorage.getItem('avisoTrocarSenha')) {
  sessionStorage.removeItem('avisoTrocarSenha');
  Swal.fire({
    icon: 'info',
    title: 'Defina sua nova senha',
    text: 'Você entrou com a senha provisória. Crie uma nova senha na seção "Alterar senha" abaixo.',
    heightAuto: false,
  }).then(() => {
    const campo = document.getElementById('config-nova-senha');
    if (campo) { campo.scrollIntoView({ behavior: 'smooth', block: 'center' }); campo.focus(); }
  });
}

// Painel detalhado de limpeza, com resumo e backup antes da confirmação.
(() => {
  const status = document.getElementById('admin-data-status');
  if (!status) return;
  const checks = [...document.querySelectorAll('.admin-data-options input[type="checkbox"]')];
  const preview = document.getElementById('admin-data-preview');
  const run = document.getElementById('btn-excluir-selecionados');
  const labels = {
    turmas: 'Turmas (incluindo aulas e vínculos)', aulas: 'Aulas (preservando turmas)',
    professores: 'Professores comuns (preservando coordenadores)', notificacoes: 'Notificações e eventos',
    importacoes: 'Histórico de importações', materias: 'Todas as atribuições de matérias',
  };
  const token = () => localStorage.getItem('token');
  async function request(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) } });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'Falha na operação.'); }
    return response;
  }
  function selected() { return checks.filter((c) => c.checked).map((c) => c.value); }
  function drawSummary() {
    const d = window.adminDataCounts || {};
    const chosen = selected();
    const lines = [];
    if (chosen.includes('turmas')) lines.push(`Turmas: ${d.turmas || 0}; aulas: ${d.aulas || 0}; vínculos aula-professor: ${d.vinculos_aula_professor || 0}`);
    else if (chosen.includes('aulas')) lines.push(`Aulas: ${d.aulas || 0}; vínculos aula-professor: ${d.vinculos_aula_professor || 0}; turmas preservadas`);
    if (chosen.includes('professores')) lines.push(`Professores comuns: ${d.professores_comuns || 0}; coordenadores preservados: ${d.coordenadores || 0}; atribuições desses professores: ${d.materias_professores_comuns || 0}`);
    if (chosen.includes('notificacoes')) lines.push(`Notificações: ${d.notificacoes || 0}; eventos: ${d.eventos || 0}`);
    if (chosen.includes('importacoes')) lines.push(`Histórico de importações: ${d.importacoes_horarios || 0}`);
    if (chosen.includes('materias')) lines.push(`Atribuições de matérias: ${d.materias_professores || 0}`);
    preview.textContent = lines.length ? lines.join(' • ') : 'Selecione os dados que deseja remover.';
    run.disabled = chosen.length === 0;
  }
  async function updateCounts() {
    try { window.adminDataCounts = await (await request('/admin/dados/contagens')).json(); drawSummary(); }
    catch (error) { preview.textContent = error.message; }
  }
  checks.forEach((check) => check.addEventListener('change', drawSummary));
  document.querySelectorAll('[data-preset]').forEach((button) => button.addEventListener('click', () => {
    const key = button.dataset.preset;
    const values = key === 'tudo' ? checks.map((c) => c.value) : key === 'turmas' ? ['turmas'] : key === 'aulas' ? ['aulas'] : ['professores'];
    checks.forEach((c) => { c.checked = values.includes(c.value); }); drawSummary();
  }));
  document.getElementById('btn-atualizar-contagens').addEventListener('click', updateCounts);
  run.addEventListener('click', async () => {
    const chosen = selected();
    if (!chosen.length) return;
    run.disabled = true;
    try {
      status.textContent = 'Gerando backup completo…';
      const backup = await request('/admin/dados/backup');
      const blob = await backup.blob(); const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = `backup-noctopus-${Date.now()}.json`;
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      if (!confirm(`Backup solicitado: salve o arquivo antes de continuar.\n\nEscopo selecionado:\n${chosen.map((x) => `• ${labels[x]}`).join('\n')}\n\nResumo: ${preview.textContent}\n\nO sistema preservará todas as contas coordenadoras.`)) { status.textContent = 'Cancelado; nenhum dado foi alterado.'; run.disabled = false; return; }
      if (prompt('Confirme a exclusão digitando EXCLUIR:') !== 'EXCLUIR') { status.textContent = 'Cancelado; nenhum dado foi alterado.'; run.disabled = false; return; }
      status.textContent = 'Excluindo os dados selecionados…';
      const result = await (await request('/admin/dados/excluir', { method: 'POST', body: JSON.stringify({ selecionados: chosen, confirmacao: 'EXCLUIR' }) })).json();
      status.textContent = 'Exclusão concluída: ' + Object.entries(result.removidos).map(([key, count]) => `${key}: ${count}`).join(' | ');
      checks.forEach((c) => { c.checked = false; }); await updateCounts();
    } catch (error) { status.textContent = error.message; run.disabled = selected().length === 0; }
  });
  updateCounts();
})();
