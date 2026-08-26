const API_TURMAS = '/turmas';
const API_PROFESSORES = '/professor';

function getToken() {
  return localStorage.getItem('token');
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`
  };
}

// Se o token expirou ou o usuário não é coordenadora, manda de volta pro login
async function tratarRespostaAuth(res) {
  if (res.status === 401 || res.status === 403) {
    await Swal.fire({
      title: 'Sessão expirada',
      text: 'Faça login novamente.',
      icon: 'warning',
      confirmButtonText: 'OK',
      heightAuto: false
    });
    window.location.href = '/index.html';
    return true;
  }
  return false;
}

const TURNOS_LABEL = { matutino: 'Matutino', integral: 'Integral', vespertino: 'Vespertino', noturno: 'Noturno' };

function capitalizar(txt) {
  return String(txt).charAt(0).toUpperCase() + String(txt).slice(1);
}

// ───────────────────────── TURMAS ─────────────────────────

async function carregarTurmas() {
  const corpo = document.getElementById('corpo-turmas');
  const vazio = document.getElementById('turmas-vazio');
  // Esta página não tem mais a seção de turmas (foi movida para Salas) — não faz nada aqui
  if (!corpo || !vazio) return;

  const res = await fetch(API_TURMAS, { headers: authHeaders() });
  if (await tratarRespostaAuth(res)) return;

  const turmas = await res.json();
  corpo.innerHTML = '';

  if (!Array.isArray(turmas) || turmas.length === 0) {
    vazio.style.display = 'flex';
    return;
  }
  vazio.style.display = 'none';

  turmas.forEach((t) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${capitalizar(t.nome)}</td>
      <td>${t.ano}º</td>
      <td>${TURNOS_LABEL[t.turno] || t.turno}</td>
      <td>${t.codigo}</td>
      <td class="col-acoes">
        <button class="btn-icon" title="Editar" onclick="abrirModalTurma(${t.id})"><i class="ti ti-pencil"></i></button>
        <button class="btn-icon btn-danger" title="Excluir" onclick="excluirTurma(${t.id})"><i class="ti ti-trash"></i></button>
      </td>`;
    corpo.appendChild(tr);
  });
}

function abrirModalTurma(id) {
  const form = document.getElementById('form-turma');
  form.reset();
  document.getElementById('turma-id').value = id || '';
  document.getElementById('modal-turma-titulo').textContent = id ? 'Editar turma' : 'Nova turma';

  if (id) {
    // preenche o formulário buscando os dados atuais da turma
    fetch(`${API_TURMAS}/${id}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((t) => {
        document.getElementById('turma-nome').value = t.nome;
        document.getElementById('turma-ano').value = t.ano;
        document.getElementById('turma-turno').value = t.turno;
        document.getElementById('turma-codigo').value = t.codigo;
      });
  }

  document.getElementById('modal-turma-overlay').classList.add('open');
}

function fecharModalTurma() {
  document.getElementById('modal-turma-overlay').classList.remove('open');
}

// Só registra os listeners de turma se essa seção existir nesta página
document.getElementById('form-turma')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = document.getElementById('turma-id').value;
  const payload = {
    nome: document.getElementById('turma-nome').value,
    ano: Number(document.getElementById('turma-ano').value),
    turno: document.getElementById('turma-turno').value,
    codigo: document.getElementById('turma-codigo').value.trim()
  };

  try {
    const res = await fetch(id ? `${API_TURMAS}/${id}` : API_TURMAS, {
      method: id ? 'PUT' : 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });

    if (await tratarRespostaAuth(res)) return;

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao salvar turma');

    fecharModalTurma();
    await carregarTurmas();
    Swal.fire({ icon: 'success', title: 'Turma salva!', timer: 1200, showConfirmButton: false, heightAuto: false });
  } catch (err) {
    Swal.fire({ title: 'Ops', text: err.message, icon: 'error', confirmButtonText: 'OK', heightAuto: false });
  }
});

async function excluirTurma(id) {
  const confirmar = await Swal.fire({
    title: 'Excluir turma?',
    text: 'Essa ação não pode ser desfeita.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Excluir',
    cancelButtonText: 'Cancelar',
    heightAuto: false
  });
  if (!confirmar.isConfirmed) return;

  const res = await fetch(`${API_TURMAS}/${id}`, { method: 'DELETE', headers: authHeaders() });
  if (await tratarRespostaAuth(res)) return;

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    Swal.fire({ title: 'Ops', text: data.error || 'Erro ao excluir turma', icon: 'error', heightAuto: false });
    return;
  }

  await carregarTurmas();
}

// ───────────────────────── PROFESSORES ─────────────────────────

async function carregarProfessores() {
  const res = await fetch(API_PROFESSORES, { headers: authHeaders() });
  if (await tratarRespostaAuth(res)) return;

  const professores = await res.json();
  const corpo = document.getElementById('corpo-professores');
  const vazio = document.getElementById('professores-vazio');
  corpo.innerHTML = '';

  if (!Array.isArray(professores) || professores.length === 0) {
    vazio.style.display = 'flex';
    return;
  }
  vazio.style.display = 'none';

  professores.forEach((p) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.nome}</td>
      <td>${p.email}</td>
      <td><span class="badge-admin ${p.admin ? 'sim' : 'nao'}">${p.admin ? 'Sim' : 'Não'}</span></td>
      <td class="col-acoes">
        <button class="btn-icon" title="Editar" onclick="abrirModalProfessor(${p.id})"><i class="ti ti-pencil"></i></button>
        <button class="btn-icon btn-danger" title="Excluir" onclick="excluirProfessor(${p.id})"><i class="ti ti-trash"></i></button>
      </td>`;
    corpo.appendChild(tr);
  });
}

function abrirModalProfessor(id) {
  const form = document.getElementById('form-professor');
  form.reset();
  document.getElementById('professor-id').value = id || '';
  document.getElementById('modal-professor-titulo').textContent = id ? 'Editar professor' : 'Novo professor';

  // Na edição a senha é opcional (só troca se preencher); na criação é obrigatória
  document.getElementById('professor-senha').required = !id;
  document.getElementById('professor-senha-label').textContent = id ? 'Nova senha (opcional)' : 'Senha';

  if (id) {
    fetch(`${API_PROFESSORES}/${id}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((p) => {
        document.getElementById('professor-nome').value = p.nome;
        document.getElementById('professor-email').value = p.email;
        document.getElementById('professor-admin').checked = !!p.admin;
      });
  }

  document.getElementById('modal-professor-overlay').classList.add('open');
}

function fecharModalProfessor() {
  document.getElementById('modal-professor-overlay').classList.remove('open');
}

document.getElementById('form-professor').addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = document.getElementById('professor-id').value;
  const senha = document.getElementById('professor-senha').value;

  const payload = {
    nome: document.getElementById('professor-nome').value.trim(),
    email: document.getElementById('professor-email').value.trim().toLowerCase(),
    admin: document.getElementById('professor-admin').checked
  };
  // só manda a senha se foi preenchida (obrigatório na criação, opcional na edição)
  if (senha) payload.senha = senha;

  try {
    const res = await fetch(id ? `${API_PROFESSORES}/${id}` : API_PROFESSORES, {
      method: id ? 'PUT' : 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });

    if (await tratarRespostaAuth(res)) return;

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao salvar professor');

    fecharModalProfessor();
    await carregarProfessores();
    Swal.fire({ icon: 'success', title: 'Professor salvo!', timer: 1200, showConfirmButton: false, heightAuto: false });
  } catch (err) {
    Swal.fire({ title: 'Ops', text: err.message, icon: 'error', confirmButtonText: 'OK', heightAuto: false });
  }
});

async function excluirProfessor(id) {
  const confirmar = await Swal.fire({
    title: 'Excluir professor?',
    text: 'Essa ação não pode ser desfeita.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Excluir',
    cancelButtonText: 'Cancelar',
    heightAuto: false
  });
  if (!confirmar.isConfirmed) return;

  const res = await fetch(`${API_PROFESSORES}/${id}`, { method: 'DELETE', headers: authHeaders() });
  if (await tratarRespostaAuth(res)) return;

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    Swal.fire({ title: 'Ops', text: data.error || 'Erro ao excluir professor', icon: 'error', heightAuto: false });
    return;
  }

  await carregarProfessores();
}

// Fecha modal clicando fora dele
document.getElementById('modal-turma-overlay')?.addEventListener('click', (e) => {
  if (e.target.id === 'modal-turma-overlay') fecharModalTurma();
});
document.getElementById('modal-professor-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'modal-professor-overlay') fecharModalProfessor();
});

// O logout (com confirmação) agora é centralizado em notification-center.js,
// que é carregado em todas as páginas do sistema.

carregarTurmas();
carregarProfessores();
