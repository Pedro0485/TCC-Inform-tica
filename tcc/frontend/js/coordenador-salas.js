console.log("[salas] coordenador-salas.js versão 5 carregada");
// ── Cores por curso ──────────────────────────────────────────────────────────
const CORES = {
  'Informática':   '#9b27af',
  'Edificações':   '#e06a10',
  'Administração': '#1a5fce',
  'Mecatrônica':   '#e11233',
};

function corDoCurso(curso, corCustom) {
  if (corCustom) return corCustom;
  for (const [k, v] of Object.entries(CORES)) {
    if (curso.includes(k)) return v;
  }
  return '#555';
}

// ── Dados (API) ─────────────────────────────────────────────────────────────
const API_URL = '/turmas';

function getToken() {
  return localStorage.getItem('token');
}

const NOMES_CURSO = {
  informatica: 'Informática',
  edificacoes: 'Edificações',
  mecatronica: 'Mecatrônica',
  administracao: 'Administração',
  desenvolvimento_de_sistemas: 'Desenvolvimento de Sistemas',
  marketing: 'Marketing',
  mecanica: 'Mecânica',
  recursos_humanos: 'Recursos Humanos',
};

// Lista de cursos editável pela coordenação (guardada localmente: { slug: 'Nome' }).
// Na primeira vez, junta os cursos padrão com os que já tinham sido adicionados.
function carregarCursos() {
  try {
    const salvo = JSON.parse(localStorage.getItem('salas_cursos'));
    if (salvo && typeof salvo === 'object' && !Array.isArray(salvo)) return salvo;
  } catch {}
  let custom = {};
  try { custom = JSON.parse(localStorage.getItem('salas_cursos_custom')) || {}; } catch {}
  return { ...NOMES_CURSO, ...custom };
}
function salvarCursos(obj) {
  localStorage.setItem('salas_cursos', JSON.stringify(obj));
}
function todosCursos() {
  return carregarCursos();
}
function slugify(txt) {
  return txt.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function capitalizar(txt) {
  const mapa = todosCursos();
  if (mapa[txt]) return mapa[txt];
  return txt.charAt(0).toUpperCase() + txt.slice(1).replace(/_/g, ' ');
}

function preencherSelectCursos(selecionado) {
  const sel = document.getElementById('criar-curso');
  sel.innerHTML = '<option value="" disabled hidden>Selecione o curso</option>';
  Object.entries(todosCursos()).forEach(([slug, nome]) => {
    const opt = document.createElement('option');
    opt.value = slug; opt.textContent = nome;
    sel.appendChild(opt);
  });
  sel.value = selecionado || '';
}

async function adicionarCurso() {
  const { value, isConfirmed } = await Swal.fire({
    title: 'Novo curso',
    input: 'text',
    inputLabel: 'Nome do curso',
    inputPlaceholder: 'Ex: Eletrotécnica',
    showCancelButton: true,
    confirmButtonText: 'Adicionar',
    cancelButtonText: 'Cancelar',
    customClass: { popup: 'meu-alerta' },
  });
  if (!isConfirmed) return;

  const nome = (value || '').trim();
  const slug = slugify(nome);
  if (!nome || !slug) return;

  const mapa = todosCursos();
  const existente = Object.entries(mapa).find(([k, v]) => k === slug || v.toLowerCase() === nome.toLowerCase());
  if (existente) {
    preencherSelectCursos(existente[0]);
    return;
  }

  const cursos = carregarCursos();
  cursos[slug] = nome;
  salvarCursos(cursos);
  preencherSelectCursos(slug);
}

// ── Modal de cursos (listar, adicionar e apagar) ─────────────────────────────
function renderListaCursos() {
  const ul = document.getElementById('cursos-lista');
  ul.innerHTML = '';
  const entradas = Object.entries(todosCursos());
  if (!entradas.length) {
    ul.innerHTML = '<li class="materia-vazia">Nenhum curso cadastrado.</li>';
  }
  entradas.forEach(([slug, nome]) => {
    const li = document.createElement('li');
    li.className = 'materia-item';
    const span = document.createElement('span');
    span.textContent = nome;
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'materia-del';
    del.title = 'Excluir curso';
    del.innerHTML = '✕';
    del.onclick = () => excluirCurso(slug);
    li.appendChild(span);
    li.appendChild(del);
    ul.appendChild(li);
  });
  document.getElementById('cursos-contador').textContent =
    entradas.length + (entradas.length === 1 ? ' curso' : ' cursos');
}

function abrirModalCursos() {
  document.getElementById('curso-novo').value = '';
  renderListaCursos();
  document.getElementById('modal-cursos-overlay').classList.add('open');
}

function fecharModalCursos() {
  document.getElementById('modal-cursos-overlay').classList.remove('open');
}

function adicionarCursoModal() {
  const inp = document.getElementById('curso-novo');
  const nome = inp.value.trim();
  const slug = slugify(nome);
  if (!nome || !slug) return;

  const cursos = carregarCursos();
  if (cursos[slug] || Object.values(cursos).some((v) => v.toLowerCase() === nome.toLowerCase())) {
    Swal.fire({ title: 'Ops', text: 'Esse curso já existe.', icon: 'warning',
      confirmButtonText: 'OK', customClass: { popup: 'meu-alerta' } });
    return;
  }
  cursos[slug] = nome;
  salvarCursos(cursos);
  inp.value = '';
  renderListaCursos();
  const ul = document.getElementById('cursos-lista');
  ul.scrollTop = ul.scrollHeight;
  inp.focus();
}

async function excluirCurso(slug) {
  const cursos = carregarCursos();
  const nome = cursos[slug];

  // não deixa apagar curso que ainda tem turmas
  const emUso = Object.values(dados || {}).some((lista) => lista.some((c) => c.curso === nome));
  if (emUso) {
    Swal.fire({ title: 'Não é possível excluir',
      text: `O curso "${nome}" ainda tem turmas. Apague as turmas dele primeiro.`,
      icon: 'warning', confirmButtonText: 'OK', customClass: { popup: 'meu-alerta' } });
    return;
  }

  const { isConfirmed } = await Swal.fire({
    title: 'Excluir curso?',
    html: `<strong>${nome}</strong> deixará de aparecer na lista de cursos.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Sim, excluir',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#e11233',
    customClass: { popup: 'meu-alerta' },
  });
  if (!isConfirmed) return;

  delete cursos[slug];
  salvarCursos(cursos);
  renderListaCursos();
}

document.getElementById('modal-cursos-overlay').addEventListener('click', function (e) {
  if (e.target === this) fecharModalCursos();
});
document.getElementById('curso-novo').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); adicionarCursoModal(); }
});

function defaultData() {
  return { matutino: [], integral: [], vespertino: [], noturno: [] };
}

// Os horários das turmas ainda não têm tabela no backend, então continuam
// salvos localmente, indexados pelo nome de exibição da turma (ex: "1º Informática").
function carregarHorarios() {
  try { return JSON.parse(localStorage.getItem('salas_horarios')) || {}; }
  catch { return {}; }
}

function salvarHorariosLocal() {
  localStorage.setItem('salas_horarios', JSON.stringify(horariosSalvos));
}

// Agrupa a lista "achatada" que vem da API (uma linha por turma)
// no formato { turno: [ { curso, turmas: [...], horarios } ] } que o render usa.
function transformarTurmas(turmasApi) {
  const agrupado = defaultData();

  turmasApi.forEach((t) => {
    const turno = t.turno;
    if (!agrupado[turno]) agrupado[turno] = [];

    const nomeCurso = capitalizar(t.nome);
    const nomeTurma = `${t.ano}º ${nomeCurso}`;

    let curso = agrupado[turno].find((c) => c.curso === nomeCurso);
    if (!curso) {
      curso = { curso: nomeCurso, turmas: [], horarios: {} };
      agrupado[turno].push(curso);
    }

    curso.turmas.push(nomeTurma);
    curso._ids = curso._ids || {};
    curso._ids[nomeTurma] = t.id; // guarda o id real da turma no banco
    curso._codigos = curso._codigos || {};
    curso._codigos[nomeTurma] = t.codigo; // código de login da turma

    if (horariosSalvos[nomeTurma]) {
      curso.horarios[nomeTurma] = horariosSalvos[nomeTurma];
    }
  });

  return agrupado;
}

async function buscarTurmas() {
  const res = await fetch(API_URL, {
    headers: { 'Authorization': `Bearer ${getToken()}` }
  });

  if (res.status === 401 || res.status === 403) {
    await Swal.fire({
      title: 'Sessão expirada',
      text: 'Faça login novamente.',
      icon: 'warning',
      confirmButtonText: 'OK',
      heightAuto: false
    });
    window.location.href = '../../index.html';
    throw new Error('Não autorizado');
  }

  if (!res.ok) throw new Error('Erro ao buscar turmas');

  const turmasApi = await res.json();
  return transformarTurmas(turmasApi);
}

// Cores personalizadas por turma (guardadas localmente, indexadas pelo id da turma)
function carregarCoresTurmas() {
  try { return JSON.parse(localStorage.getItem('salas_cores_turmas')) || {}; }
  catch { return {}; }
}
let coresTurmas = carregarCoresTurmas();
function salvarCoresTurmas() {
  localStorage.setItem('salas_cores_turmas', JSON.stringify(coresTurmas));
}

function salvarDados() {
  // por enquanto só persiste os horários; a lista de turmas em si vem sempre da API
  salvarHorariosLocal();
}

// ── Upload de horários ────────────────────────────────────────────────────────
let arquivoUpload = null;

function abrirModalUpload() {
  arquivoUpload = null;
  document.getElementById('upload-file-input').value = '';
  document.getElementById('upload-filename').textContent = '';
  document.getElementById('btn-upload-confirm').disabled = true;
  document.getElementById('modal-upload-overlay').classList.add('open');
}

function fecharModalUpload() {
  document.getElementById('modal-upload-overlay').classList.remove('open');
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  arquivoUpload = file;
  document.getElementById('upload-filename').textContent = file.name;
  document.getElementById('btn-upload-confirm').disabled = false;
}

async function confirmarUpload() {
  if (!arquivoUpload) return;

  const btn = document.getElementById('btn-upload-confirm');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  try {
    await uploadPDF(arquivoUpload);
    fecharModalUpload();
    Swal.fire({
      icon: 'success',
      title: 'Arquivo enviado!',
      timer: 1500,
      showConfirmButton: false,
      customClass: { popup: 'meu-alerta' },
    });
  } catch (err) {
    console.error(err);
    Swal.fire({
      title: 'Erro',
      text: 'Não foi possível enviar o arquivo.',
      icon: 'error',
      confirmButtonText: 'OK',
      customClass: { popup: 'meu-alerta' },
    });
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enviar';
  }
}

// Drag & drop no dropzone
document.addEventListener('DOMContentLoaded', () => {
  const zone = document.getElementById('upload-dropzone');
  if (!zone) return;

  ['dragenter', 'dragover'].forEach(evt => {
    zone.addEventListener(evt, (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(evt => {
    zone.addEventListener(evt, (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
    });
  });

  zone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (!file) return;
    arquivoUpload = file;
    document.getElementById('upload-filename').textContent = file.name;
    document.getElementById('btn-upload-confirm').disabled = false;
  });
});

// Fechar modal de upload clicando fora
document.getElementById('modal-upload-overlay').addEventListener('click', function(e) {
  if (e.target === this) fecharModalUpload();
});

async function uploadPDF(file) {
  const formData = new FormData();
  formData.append('arquivo', file);

  const res = await fetch('/turmas/upload-horarios', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${getToken()}` },
    body: formData
  });

  if (!res.ok) {
    const erro = await res.json().catch(() => ({}));
    throw new Error(erro.error || 'Falha no upload');
  }

  return res.json();
}

let horariosSalvos = carregarHorarios();
let dados = defaultData();
let turnoAtivo = 'integral';
let modalTurno = '', modalCursoIdx = -1, modalTurmaIdx = -1;

// ── Horários disponíveis por turno ────────────────────────────────────────────
const HORARIOS_PADRAO = {
  matutino:   ['07:00','07:50','08:40','10:00','10:50','11:40'],
  integral:   ['07:00','07:50','08:40','10:00','10:50','11:40','13:30','14:20'],
  vespertino: ['13:00','13:50','14:40','15:30','16:20','17:10'],
  noturno:    ['18:50','19:40','20:30','21:20','22:10'],
};

function carregarHorariosTurno() {
  try {
    const salvo = JSON.parse(localStorage.getItem('salas_horarios_turnos')) || {};
    return { ...HORARIOS_PADRAO, ...salvo };
  } catch { return { ...HORARIOS_PADRAO }; }
}
let HORARIOS = carregarHorariosTurno();

const TURNOS_LISTA = ['matutino','integral','vespertino','noturno'];

const NOMES_TURNO = { matutino: 'Matutino', integral: 'Integral', vespertino: 'Vespertino', noturno: 'Noturno' };

function criarLinhaHorario(lista, valor) {
  const row = document.createElement('div');
  row.className = 'hora-item';
  const inp = document.createElement('input');
  inp.type = 'time';
  inp.value = valor || '';
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'hora-item-del';
  del.title = 'Remover horário';
  del.innerHTML = '✕';
  del.onclick = () => row.remove();
  row.appendChild(inp);
  row.appendChild(del);
  lista.appendChild(row);
}

function abrirModalHorariosTurno() {
  const box = document.getElementById('turnos-editor');
  box.innerHTML = '';
  TURNOS_LISTA.forEach((t) => {
    const card = document.createElement('div');
    card.className = 'turno-card';
    card.dataset.turno = t;

    const titulo = document.createElement('div');
    titulo.className = 'turno-card-titulo';
    titulo.textContent = NOMES_TURNO[t];

    const lista = document.createElement('div');
    lista.className = 'hora-lista';
    HORARIOS[t].forEach((h) => criarLinhaHorario(lista, h));

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'hora-add';
    add.innerHTML = '<i class="ti ti-plus"></i> Adicionar horário';
    add.onclick = () => criarLinhaHorario(lista, '');

    card.appendChild(titulo);
    card.appendChild(lista);
    card.appendChild(add);
    box.appendChild(card);
  });
  document.getElementById('modal-turnos-overlay').classList.add('open');
}

function fecharModalHorariosTurno() {
  document.getElementById('modal-turnos-overlay').classList.remove('open');
}

function salvarHorariosTurno() {
  const novo = {};
  for (const card of document.querySelectorAll('#turnos-editor .turno-card')) {
    const t = card.dataset.turno;
    const horas = [...card.querySelectorAll('input[type="time"]')].map((i) => i.value);
    if (horas.some((h) => !h)) {
      Swal.fire({ title: 'Ops', icon: 'warning', confirmButtonText: 'OK',
        text: `Há um horário vazio no turno ${NOMES_TURNO[t]}. Preencha ou remova.`,
        customClass: { popup: 'meu-alerta' } });
      return;
    }
    const unicos = [...new Set(horas)].sort();
    if (!unicos.length) {
      Swal.fire({ title: 'Ops', icon: 'warning', confirmButtonText: 'OK',
        text: `Informe ao menos um horário no turno ${NOMES_TURNO[t]}.`,
        customClass: { popup: 'meu-alerta' } });
      return;
    }
    novo[t] = unicos;
  }
  HORARIOS = novo;
  localStorage.setItem('salas_horarios_turnos', JSON.stringify(novo));
  fecharModalHorariosTurno();
  Swal.fire({
    icon: 'success', title: 'Horários dos turnos salvos!', timer: 1500,
    showConfirmButton: false, customClass: { popup: 'meu-alerta' },
  });
}

const NENHUMA = '— nenhuma —';
const DISCIPLINAS_PADRAO = [
  'Matemática','Português','História','Geografia','Física','Química',
  'Biologia','Inglês','Educação Física','Filosofia','Sociologia','Informática',
  'Eletroeletrônica','Mecânica','Desenho Técnico','Administração','Edificações',
];

// Lista completa de matérias (sem a opção "nenhuma"), editável pela coordenação
function carregarMaterias() {
  try {
    const salva = JSON.parse(localStorage.getItem('salas_materias'));
    if (Array.isArray(salva)) return salva;
  } catch {}
  // migra matérias adicionadas na versão anterior
  let antigas = [];
  try { antigas = JSON.parse(localStorage.getItem('salas_disciplinas_custom')) || []; } catch {}
  return [...DISCIPLINAS_PADRAO, ...antigas];
}
let MATERIAS = carregarMaterias();
let DISCIPLINAS = [NENHUMA, ...MATERIAS];

function persistirMaterias() {
  localStorage.setItem('salas_materias', JSON.stringify(MATERIAS));
  DISCIPLINAS = [NENHUMA, ...MATERIAS];
  atualizarSelectsMaterias();
}

// Reconstrói as opções dos selects abertos, preservando o valor escolhido
function atualizarSelectsMaterias() {
  document.querySelectorAll('#grade-body select, #criar-grade-body select').forEach((sel) => {
    const atual = sel.value;
    sel.innerHTML = '';
    const lista = atual && !DISCIPLINAS.includes(atual) ? [...DISCIPLINAS, atual] : DISCIPLINAS;
    lista.forEach((d) => {
      const opt = document.createElement('option');
      opt.value = d; opt.textContent = d;
      sel.appendChild(opt);
    });
    sel.value = atual || NENHUMA;
  });
}

// ── Professores das matérias ─────────────────────────────────────────────────
let PROFESSORES = [];     // professores cadastrados (sem a coordenadora): [{ id, nome }]
let PROF_MATERIAS = {};   // { 'Matemática': [{ id, nome }, ...] }

function headersJson() {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` };
}

async function carregarProfessoresMaterias() {
  try {
    const [rProf, rMat] = await Promise.all([
      fetch('/professor', { headers: headersJson() }),
      fetch(`${API_URL}/materias/professores`, { headers: headersJson() }),
    ]);
    if (rProf.ok) {
      const lista = await rProf.json();
      PROFESSORES = lista.filter((p) => !p.admin).map((p) => ({ id: p.id, nome: p.nome }));
    }
    if (rMat.ok) PROF_MATERIAS = await rMat.json();
  } catch (err) {
    console.error('Erro ao carregar professores das matérias', err);
  }
}

// Monta uma lista de checkboxes com os professores cadastrados dentro de `box`
function montarChecklistProfessores(box, selecionados = [], unico = false) {
  box.innerHTML = '';
  if (!PROFESSORES.length) {
    const vazio = document.createElement('div');
    vazio.className = 'prof-vazio';
    vazio.textContent = 'Nenhum professor cadastrado. Cadastre em Usuários.';
    box.appendChild(vazio);
    return;
  }
  PROFESSORES.forEach((p) => {
    const label = document.createElement('label');
    label.className = 'prof-check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = p.id;
    cb.checked = selecionados.includes(p.id);
    if (unico) {
      // só um professor por vez: marcar um desmarca os outros
      cb.addEventListener('change', () => {
        if (cb.checked) box.querySelectorAll('input[type="checkbox"]').forEach((o) => { if (o !== cb) o.checked = false; });
      });
    }
    const nome = document.createElement('span');
    nome.textContent = p.nome;
    label.appendChild(cb);
    label.appendChild(nome);
    box.appendChild(label);
  });
}

function lerChecklistProfessores(box) {
  return [...box.querySelectorAll('input[type="checkbox"]:checked')].map((c) => Number(c.value));
}

// Grava no banco os professores de uma matéria (substitui a lista anterior)
async function salvarProfessoresMateria(materia, ids) {
  const res = await fetch(`${API_URL}/materias/professores`, {
    method: 'PUT',
    headers: headersJson(),
    body: JSON.stringify({ materia, professores: ids }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || 'Erro ao atribuir professores');
  }
  PROF_MATERIAS[materia] = PROFESSORES.filter((p) => ids.includes(p.id));
  if (!ids.length) delete PROF_MATERIAS[materia];
}

async function editarProfessoresMateria(i) {
  const materia = MATERIAS[i];
  await carregarProfessoresMaterias();

  const box = document.createElement('div');
  box.className = 'prof-checklist';
  montarChecklistProfessores(box, (PROF_MATERIAS[materia] || []).map((p) => p.id).slice(0, 1), true);

  const { isConfirmed, value } = await Swal.fire({
    titleText: `Professores — ${nomeBase(materia)}`,
    html: box,
    showCancelButton: true,
    confirmButtonText: 'Salvar',
    cancelButtonText: 'Cancelar',
    customClass: { popup: 'meu-alerta' },
    preConfirm: () => lerChecklistProfessores(box),
  });
  if (!isConfirmed) return;

  try {
    await salvarProfessoresMateria(materia, value);
    renderListaMaterias();
  } catch (err) {
    console.error(err);
    Swal.fire({ title: 'Erro', text: err.message, icon: 'error', confirmButtonText: 'OK',
      customClass: { popup: 'meu-alerta' } });
  }
}

// O nome interno de uma matéria com professor é "Matemática (Ota)" (chave única no banco),
// mas na lista aparece só "Matemática": o professor já é mostrado logo abaixo.
function sufixoProfessor(m) {
  const r = /^(.*?)( \((.+)\))$/.exec(m);
  return r && PROFESSORES.some((p) => p.nome === r[3]) ? r[2] : '';
}
function nomeBase(m) {
  const suf = sufixoProfessor(m);
  return suf ? m.slice(0, m.length - suf.length) : m;
}

function renderListaMaterias() {
  const ul = document.getElementById('materias-lista');
  ul.innerHTML = '';
  if (!MATERIAS.length) {
    ul.innerHTML = '<li class="materia-vazia">Nenhuma matéria cadastrada.</li>';
    return;
  }
  MATERIAS.forEach((m, i) => {
    const li = document.createElement('li');
    li.className = 'materia-item';
    const nome = document.createElement('span');
    nome.textContent = nomeBase(m);
    const profs = PROF_MATERIAS[m] || [];
    const sub = document.createElement('small');
    sub.className = 'materia-profs' + (profs.length ? '' : ' sem');
    sub.textContent = profs.length ? profs.map((p) => p.nome).join(', ') : 'Sem professor atribuído';
    nome.appendChild(sub);
    const prof = document.createElement('button');
    prof.type = 'button';
    prof.className = 'materia-del materia-prof';
    prof.title = 'Atribuir professores';
    prof.innerHTML = '<i class="ti ti-user-plus"></i>';
    prof.onclick = () => editarProfessoresMateria(i);
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'materia-del materia-edit';
    edit.title = 'Editar matéria';
    edit.innerHTML = '<i class="ti ti-pencil"></i>';
    edit.onclick = () => editarMateria(i);
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'materia-del';
    del.title = 'Excluir matéria';
    del.innerHTML = '✕';
    del.onclick = () => excluirMateria(i);
    li.appendChild(nome);
    li.appendChild(prof);
    li.appendChild(edit);
    li.appendChild(del);
    ul.appendChild(li);
  });
  document.getElementById('materias-contador').textContent =
    MATERIAS.length + (MATERIAS.length === 1 ? ' matéria' : ' matérias');
}

async function abrirModalMaterias() {
  document.getElementById('materia-nova').value = '';
  renderListaMaterias();
  montarChecklistProfessores(document.getElementById('materia-prof-lista'));
  document.getElementById('modal-materias-overlay').classList.add('open');

  // busca professores e atribuições atuais e redesenha
  await carregarProfessoresMaterias();
  montarChecklistProfessores(document.getElementById('materia-prof-lista'));
  renderListaMaterias();
}

function fecharModalMaterias() {
  document.getElementById('modal-materias-overlay').classList.remove('open');
}

async function adicionarMateria() {
  const inp = document.getElementById('materia-nova');
  const box = document.getElementById('materia-prof-lista');
  const nome = inp.value.trim();
  if (!nome) return;
  const ids = lerChecklistProfessores(box);
  const alerta = (title, text, icon = 'warning') => Swal.fire({
    title, text, icon, confirmButtonText: 'OK', customClass: { popup: 'meu-alerta' },
  });
  const low = (t) => t.toLowerCase();

  await carregarProfessoresMaterias(); // lista atual vinda do banco

  // Cada linha da lista tem UM professor. A mesma matéria com professores diferentes
  // vira linhas separadas: "Matemática (Ota)" e "Matemática (Gabriel)".
  const doGrupo = (m) => low(m) === low(nome) || low(m).startsWith(low(nome) + ' (');
  const alvos = ids.length ? PROFESSORES.filter((p) => ids.includes(p.id)) : [null];

  const novos = [];
  const repetidos = [];
  alvos.forEach((prof) => {
    if (!prof) {
      if (MATERIAS.some((m) => low(m) === low(nome))) repetidos.push(null);
      else novos.push({ nome, prof: null });
      return;
    }
    const nomeFinal = `${nome} (${prof.nome})`;
    const jaTem = MATERIAS.some((m) => (doGrupo(m) && (PROF_MATERIAS[m] || []).some((p) => p.id === prof.id))
      || low(m) === low(nomeFinal));
    if (jaTem) repetidos.push(prof.nome);
    else novos.push({ nome: nomeFinal, prof });
  });

  // mesma matéria + mesmo professor: erro, e nada é adicionado
  if (repetidos.length) {
    const com = repetidos.filter(Boolean);
    alerta('Ops', com.length
      ? `A matéria "${nome}" já está cadastrada com: ${com.join(', ')}.`
      : 'Essa matéria já existe.');
    return;
  }

  const falhas = [];
  for (const n of novos) {
    try {
      if (n.prof) await salvarProfessoresMateria(n.nome, [n.prof.id]);
      MATERIAS.push(n.nome);
    } catch (err) {
      console.error(err);
      falhas.push(`${n.nome}: ${err.message}`);
    }
  }
  persistirMaterias();

  if (falhas.length) {
    alerta('Não foi possível adicionar tudo', 'Erro ao atribuir o professor — ' + falhas.join('; '), 'error');
  } else {
    inp.value = '';
  }
  montarChecklistProfessores(box);
  renderListaMaterias();
  const ul = document.getElementById('materias-lista');
  ul.scrollTop = ul.scrollHeight;
  inp.focus();
}

async function editarMateria(i) {
  const antigo = MATERIAS[i];
  const { value, isConfirmed } = await Swal.fire({
    title: 'Editar matéria',
    input: 'text',
    inputValue: nomeBase(antigo),
    inputAttributes: { maxlength: 80 },
    showCancelButton: true,
    confirmButtonText: 'Salvar',
    cancelButtonText: 'Cancelar',
    customClass: { popup: 'meu-alerta' },
  });
  if (!isConfirmed) return;

  const novoBase = (value || '').trim();
  const novo = novoBase + sufixoProfessor(antigo); // mantém o professor no nome interno
  if (!novoBase || novo === antigo) return;
  if (MATERIAS.some((m, j) => j !== i && m.toLowerCase() === novo.toLowerCase())) {
    Swal.fire({ title: 'Ops', text: 'Já existe uma matéria com esse nome.', icon: 'warning',
      confirmButtonText: 'OK', customClass: { popup: 'meu-alerta' } });
    return;
  }

  try {
    // atualiza as aulas já salvas no banco
    const res = await fetch(`${API_URL}/materias/renomear`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
      body: JSON.stringify({ de: antigo, para: novo }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || 'Erro ao renomear matéria');
    }
  } catch (err) {
    console.error(err);
    Swal.fire({ title: 'Erro', text: err.message, icon: 'error', confirmButtonText: 'OK',
      customClass: { popup: 'meu-alerta' } });
    return;
  }

  // atualiza as grades guardadas localmente
  Object.values(horariosSalvos).forEach((grade) => {
    Object.values(grade).forEach((dias) => {
      Object.keys(dias).forEach((dia) => { if (dias[dia] === antigo) dias[dia] = novo; });
    });
  });
  salvarHorariosLocal();

  // o backend já moveu os professores para o novo nome; acompanha no cache local
  if (PROF_MATERIAS[antigo]) {
    PROF_MATERIAS[novo] = PROF_MATERIAS[antigo];
    delete PROF_MATERIAS[antigo];
  }

  MATERIAS[i] = novo;
  persistirMaterias();
  renderListaMaterias();
  try { dados = await buscarTurmas(); renderTodos(); } catch {}
}

async function excluirMateria(i) {
  const nome = MATERIAS[i];
  const { isConfirmed } = await Swal.fire({
    title: 'Excluir matéria?',
    html: `<strong>${nomeBase(nome)}</strong>${(PROF_MATERIAS[nome] || []).length ? ' (' + PROF_MATERIAS[nome].map((p) => p.nome).join(', ') + ')' : ''} deixará de aparecer nas listas. Horários já salvos com ela não são alterados.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Sim, excluir',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#e11233',
    customClass: { popup: 'meu-alerta' },
  });
  if (!isConfirmed) return;

  // libera os professores atribuídos a essa matéria (não impede a exclusão se falhar)
  try {
    await fetch(`${API_URL}/materias/professores`, {
      method: 'DELETE',
      headers: headersJson(),
      body: JSON.stringify({ materia: nome }),
    });
    delete PROF_MATERIAS[nome];
  } catch (err) {
    console.error(err);
  }

  MATERIAS.splice(i, 1);
  persistirMaterias();
  renderListaMaterias();
}

document.getElementById('modal-materias-overlay').addEventListener('click', function (e) {
  if (e.target === this) fecharModalMaterias();
});
document.getElementById('materia-nova').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); adicionarMateria(); }
});

// ── Renderização ─────────────────────────────────────────────────────────────
function renderTurno(turno) {
  const sec = document.getElementById('sec-' + turno);
  const cursos = dados[turno];

  if (!cursos.length) {
    sec.innerHTML = `<div style="color:#bbb;font-size:13px;margin-bottom:12px;">Nenhuma sala neste turno.</div>`;
  } else {
    sec.innerHTML = '<div class="cursos-grid" id="grid-' + turno + '"></div>';
    const grid = document.getElementById('grid-' + turno);
    cursos.forEach((c, ci) => {
      const row = document.createElement('div');
      row.className = 'curso-row';
      row.dataset.cursoIdx = ci;

      c.turmas.forEach((turma, ti) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'turma-wrapper';

        const btn = document.createElement('button');
        btn.className = 'turma-btn';
        btn.style.background = corDoCurso(c.curso, coresTurmas[c._ids && c._ids[turma]] || c.cor);
        btn.textContent = turma;
        btn.onclick = () => abrirModal(turno, ci, ti);

        const delBtn = document.createElement('button');
        delBtn.className = 'del-turma-btn';
        delBtn.title = 'Apagar turma';
        delBtn.innerHTML = '✕';
        delBtn.onclick = (e) => { e.stopPropagation(); apagarTurma(turno, ci, ti); };

        const editBtn = document.createElement('button');
        editBtn.className = 'edit-turma-btn';
        editBtn.title = 'Editar código e cor';
        editBtn.innerHTML = '<i class="ti ti-pencil"></i>';
        editBtn.onclick = (e) => { e.stopPropagation(); abrirModalEditarTurma(turno, ci, ti); };

        wrapper.appendChild(btn);
        wrapper.appendChild(editBtn);
        wrapper.appendChild(delBtn);
        row.appendChild(wrapper);
      });

      grid.appendChild(row);
    });
  }
}

function contarAulas(horariosTurma) {
  if (!horariosTurma) return 0;
  let total = 0;
  for (const v of Object.values(horariosTurma)) {
    for (const d of Object.values(v)) {
      if (d && d !== '— nenhuma —') total++;
    }
  }
  return total;
}

function renderTodos() {
  ['matutino','integral','vespertino','noturno'].forEach(renderTurno);
}

function setTurno(turno) {
  turnoAtivo = turno;
  document.querySelectorAll('.turno-btn').forEach(b => b.classList.remove('active'));
  event.currentTarget.classList.add('active');
  document.querySelectorAll('.turmas-section').forEach(s => s.classList.remove('visible'));
  document.getElementById('sec-' + turno).classList.add('visible');
}

// ── Apagar turma ─────────────────────────────────────────────────────────────
async function apagarTurma(turno, cursoIdx, turmaIdx) {
  const curso = dados[turno][cursoIdx];
  const turma = curso.turmas[turmaIdx];

  const { isConfirmed } = await Swal.fire({
    title: 'Apagar turma?',
    html: `A turma <strong>${turma}</strong> e todos os seus horários serão removidos permanentemente.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Sim, apagar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#e11233',
    customClass: { popup: 'meu-alerta' },
  });

  if (!isConfirmed) return;

  const id = curso._ids && curso._ids[turma];

  try {
    // apaga a turma no banco (as aulas dela vão junto)
    const res = await fetch(`${API_URL}/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getToken()}` },
    });
    if (!res.ok && res.status !== 404) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || 'Erro ao apagar a turma');
    }

    // limpa os dados locais dessa turma
    delete horariosSalvos[turma];
    salvarHorariosLocal();
    if (id && coresTurmas[id]) {
      delete coresTurmas[id];
      salvarCoresTurmas();
    }

    // recarrega a lista a partir do banco
    dados = await buscarTurmas();
    renderTodos();
  } catch (err) {
    console.error(err);
    Swal.fire({ title: 'Erro', text: err.message, icon: 'error', confirmButtonText: 'OK',
      customClass: { popup: 'meu-alerta' } });
  }
}

// ── Modal de horários ─────────────────────────────────────────────────────────
function abrirModal(turno, cursoIdx, turmaIdx) {
  modalTurno = turno;
  modalCursoIdx = cursoIdx;
  modalTurmaIdx = turmaIdx;

  const curso  = dados[turno][cursoIdx];
  const turma  = curso.turmas[turmaIdx];
  const horas  = HORARIOS[turno];
  const saved  = curso.horarios[turma] || {};

  document.getElementById('modal-title').textContent = `Horários — ${turma} (${turno.charAt(0).toUpperCase()+turno.slice(1)})`;

  const dias = ['segunda','terca','quarta','quinta','sexta'];
  const diasLabel = ['Segunda','Terça','Quarta','Quinta','Sexta'];

  // Monta cabeçalho
  const thead = document.querySelector('#grade-table thead tr');
  thead.innerHTML = '<th>Horário</th>' + diasLabel.map(d => `<th>${d}</th>`).join('');

  // Monta corpo
  const tbody = document.getElementById('grade-body');
  tbody.innerHTML = '';
  horas.forEach(hora => {
    const tr = document.createElement('tr');
    let td0 = document.createElement('td');
    td0.textContent = hora;
    tr.appendChild(td0);

    dias.forEach(dia => {
      const td = document.createElement('td');
      td.className = 'hora-cell';
      const val = saved[hora] && saved[hora][dia] ? saved[hora][dia] : '';
      if (val && val !== '— nenhuma —') td.classList.add('filled');

      const sel = document.createElement('select');
      sel.dataset.hora = hora;
      sel.dataset.dia  = dia;
      const opcoes = val && !DISCIPLINAS.includes(val) ? [...DISCIPLINAS, val] : DISCIPLINAS;
      opcoes.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d; opt.textContent = d;
        if (d === val) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.onchange = function() {
        td.classList.toggle('filled', this.value !== '— nenhuma —');
      };
      td.appendChild(sel);
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  document.getElementById('modal-overlay').classList.add('open');
}

function fecharModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

function salvarHorarios() {
  const curso = dados[modalTurno][modalCursoIdx];
  const turma = curso.turmas[modalTurmaIdx];
  if (!curso.horarios[turma]) curso.horarios[turma] = {};

  document.querySelectorAll('#grade-body select').forEach(sel => {
    const hora = sel.dataset.hora;
    const dia  = sel.dataset.dia;
    if (!curso.horarios[turma][hora]) curso.horarios[turma][hora] = {};
    curso.horarios[turma][hora][dia] = sel.value;
  });

  horariosSalvos[turma] = curso.horarios[turma];
  salvarDados();
  fecharModal();
  renderTurno(modalTurno);

  Swal.fire({
    icon: 'success',
    title: 'Horários salvos!',
    timer: 1500,
    showConfirmButton: false,
    customClass: { popup: 'meu-alerta' },
  });
}

// Fechar modal clicando fora
document.getElementById('modal-overlay').addEventListener('click', function(e) {
  if (e.target === this) fecharModal();
});


// ── Criar turma individualmente ───────────────────────────────────────────────
const DIAS_GRADE = ['segunda','terca','quarta','quinta','sexta'];
const DIAS_GRADE_LABEL = ['Segunda','Terça','Quarta','Quinta','Sexta'];
const DURACAO_AULA_MIN = 50;

function somarMinutos(hora, minutos) {
  const [h, m] = hora.split(':').map(Number);
  const total = h * 60 + m + minutos;
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}

// Monta a grade de horários do modal conforme o turno escolhido
function montarGradeCriar() {
  const turno = document.getElementById('criar-turno').value;
  const tbody = document.getElementById('criar-grade-body');
  tbody.innerHTML = '';

  HORARIOS[turno].forEach((hora) => {
    const tr = document.createElement('tr');
    const td0 = document.createElement('td');
    td0.textContent = hora;
    tr.appendChild(td0);

    DIAS_GRADE.forEach((dia) => {
      const td = document.createElement('td');
      td.className = 'hora-cell';

      const sel = document.createElement('select');
      sel.dataset.hora = hora;
      sel.dataset.dia = dia;
      DISCIPLINAS.forEach((d) => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        sel.appendChild(opt);
      });
      sel.onchange = function () {
        td.classList.toggle('filled', this.value !== '— nenhuma —');
      };

      td.appendChild(sel);
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

// O código da turma é uma senha digitada pela coordenação (letras, números e símbolos)
function validarCodigoTurma(codigo) {
  if (codigo.length < 4) return 'O código deve ter pelo menos 4 caracteres.';
  if (codigo.length > 20) return 'O código pode ter no máximo 20 caracteres.';
  if (/\s/.test(codigo)) return 'O código não pode ter espaços.';
  return null;
}

function abrirModalCriarTurma() {
  preencherSelectCursos('');
  document.getElementById('criar-ano').value = '';
  document.getElementById('criar-turno').value = turnoAtivo;
  document.getElementById('criar-codigo').value = '';
  montarGradeCriar();
  document.getElementById('modal-criar-overlay').classList.add('open');
}

function fecharModalCriarTurma() {
  document.getElementById('modal-criar-overlay').classList.remove('open');
}

document.getElementById('modal-criar-overlay').addEventListener('click', function (e) {
  if (e.target === this) fecharModalCriarTurma();
});

async function criarTurma() {
  const curso  = document.getElementById('criar-curso').value;
  const ano    = document.getElementById('criar-ano').value;
  const turno  = document.getElementById('criar-turno').value;
  const codigo = document.getElementById('criar-codigo').value.trim();

  const avisar = (text) => Swal.fire({
    title: 'Ops', text, icon: 'warning', confirmButtonText: 'OK',
    customClass: { popup: 'meu-alerta' },
  });

  if (!curso || !ano) return avisar('Selecione o curso e o ano da turma.');
  if (!codigo) return avisar('Defina o código de login da turma.');
  const erroCodigo = validarCodigoTurma(codigo);
  if (erroCodigo) return avisar(erroCodigo);

  // Lê a grade: só vira "aula" o que tiver disciplina escolhida
  const grade = {};      // formato do front: { hora: { dia: disciplina } }
  const aulas = [];      // formato do banco
  document.querySelectorAll('#criar-grade-body select').forEach((sel) => {
    const { hora, dia } = sel.dataset;
    if (!grade[hora]) grade[hora] = {};
    grade[hora][dia] = sel.value;

    if (sel.value && sel.value !== '— nenhuma —') {
      aulas.push({
        dia_semana: dia,
        hora_inicio: hora,
        hora_fim: somarMinutos(hora, DURACAO_AULA_MIN),
        materia: sel.value,
      });
    }
  });

  const btn = document.getElementById('btn-criar-confirmar');
  btn.disabled = true;
  btn.textContent = 'Criando...';

  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` };

  try {
    // 1) cria a turma (nome + ano + código de login + turno)
    const resTurma = await fetch(API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ nome: curso, ano: Number(ano), codigo, turno }),
    });
    const turma = await resTurma.json().catch(() => ({}));
    if (!resTurma.ok) throw new Error(turma.error || 'Erro ao criar turma');

    // 2) grava os horários dessa turma no banco
    if (aulas.length > 0) {
      const resHor = await fetch(`${API_URL}/${turma.id}/horarios`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ horarios: aulas }),
      });
      if (!resHor.ok) {
        const e = await resHor.json().catch(() => ({}));
        throw new Error('Turma criada, mas os horários não foram salvos: ' + (e.error || resHor.status));
      }
    }

    // mantém a grade também no formato local usado pela tela de Salas
    const nomeExibicao = `${ano}º ${capitalizar(curso)}`;
    horariosSalvos[nomeExibicao] = grade;
    salvarHorariosLocal();

    fecharModalCriarTurma();
    dados = await buscarTurmas();
    renderTodos();

    // mostra a aba do turno da nova turma
    const btnTurno = [...document.querySelectorAll('.turno-btn')]
      .find((b) => b.textContent.trim().toLowerCase() === turno);
    if (btnTurno) btnTurno.click();

    await Swal.fire({
      icon: 'success',
      title: 'Turma criada!',
      html: `<strong>${nomeExibicao}</strong> (${capitalizar(turno)})<br>
             Login dos alunos: curso <strong>${capitalizar(curso)}</strong>, ano <strong>${ano}º</strong>,
             código <strong>${codigo}</strong>`,
      confirmButtonText: 'OK',
      customClass: { popup: 'meu-alerta' },
    });
  } catch (err) {
    console.error(err);
    Swal.fire({
      title: 'Erro', text: err.message, icon: 'error', confirmButtonText: 'OK',
      customClass: { popup: 'meu-alerta' },
    });
  } finally {
    btn.disabled = false;
    btn.textContent = 'Criar turma';
  }
}

document.getElementById('modal-turnos-overlay').addEventListener('click', function (e) {
  if (e.target === this) fecharModalHorariosTurno();
});

// ── Editar código e cor da turma ─────────────────────────────────────────────
const CORES_SUGERIDAS = ['#9b27af','#e06a10','#1a5fce','#e11233','#0f9d58','#00838f','#6d4c41','#f4b400','#37474f','#c2185b'];
let editTurma = null; // { turno, cursoIdx, turmaIdx, id, corOriginal, codigoOriginal }

function marcarCorSelecionada(cor) {
  document.querySelectorAll('#editar-cores .cor-swatch').forEach((b) => {
    b.classList.toggle('selecionada', b.dataset.cor.toLowerCase() === String(cor).toLowerCase());
  });
}

function abrirModalEditarTurma(turno, cursoIdx, turmaIdx) {
  const curso = dados[turno][cursoIdx];
  const turma = curso.turmas[turmaIdx];
  const id = curso._ids[turma];
  const corAtual = coresTurmas[id] || corDoCurso(curso.curso, curso.cor);

  editTurma = { turno, cursoIdx, turmaIdx, id, codigoOriginal: String(curso._codigos[turma] || '') };

  document.getElementById('editar-titulo').textContent = `Editar turma — ${turma}`;
  document.getElementById('editar-codigo').value = editTurma.codigoOriginal;

  const wrap = document.getElementById('editar-cores');
  wrap.innerHTML = '';
  CORES_SUGERIDAS.forEach((cor) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cor-swatch';
    b.dataset.cor = cor;
    b.style.background = cor;
    b.title = cor;
    b.onclick = () => {
      document.getElementById('editar-cor-input').value = cor;
      marcarCorSelecionada(cor);
    };
    wrap.appendChild(b);
  });

  const inp = document.getElementById('editar-cor-input');
  inp.value = /^#[0-9a-f]{6}$/i.test(corAtual) ? corAtual : '#555555';
  inp.oninput = () => marcarCorSelecionada(inp.value);
  marcarCorSelecionada(inp.value);

  document.getElementById('modal-editar-overlay').classList.add('open');
}

function fecharModalEditarTurma() {
  document.getElementById('modal-editar-overlay').classList.remove('open');
  editTurma = null;
}

async function copiarCodigoEditar() {
  const v = document.getElementById('editar-codigo').value;
  try { await navigator.clipboard.writeText(v); } catch {}
  Swal.fire({ icon: 'success', title: 'Código copiado!', timer: 1000,
    showConfirmButton: false, customClass: { popup: 'meu-alerta' } });
}

function usarCorDoCurso() {
  if (!editTurma) return;
  const curso = dados[editTurma.turno][editTurma.cursoIdx];
  const padrao = corDoCurso(curso.curso, curso.cor);
  document.getElementById('editar-cor-input').value = /^#[0-9a-f]{6}$/i.test(padrao) ? padrao : '#555555';
  marcarCorSelecionada(document.getElementById('editar-cor-input').value);
  editTurma.resetCor = true;
}

async function salvarEdicaoTurma() {
  if (!editTurma) return;
  const { turno, cursoIdx, turmaIdx, id, codigoOriginal } = editTurma;
  const codigo = document.getElementById('editar-codigo').value.trim();
  const cor = document.getElementById('editar-cor-input').value;

  const avisar = (text) => Swal.fire({ title: 'Ops', text, icon: 'warning',
    confirmButtonText: 'OK', customClass: { popup: 'meu-alerta' } });

  if (!codigo) return avisar('Defina o código de login da turma.');
  const erroCodigo = validarCodigoTurma(codigo);
  if (erroCodigo) return avisar(erroCodigo);

  const btn = document.getElementById('btn-editar-salvar');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    if (codigo !== codigoOriginal) {
      const res = await fetch(`${API_URL}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ codigo }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'Erro ao alterar o código');
    }

    const curso = dados[turno][cursoIdx];
    const padrao = corDoCurso(curso.curso, curso.cor);
    if (editTurma.resetCor || cor.toLowerCase() === String(padrao).toLowerCase()) {
      delete coresTurmas[id];
    } else {
      coresTurmas[id] = cor;
    }
    salvarCoresTurmas();

    fecharModalEditarTurma();
    dados = await buscarTurmas();
    renderTodos();

    Swal.fire({ icon: 'success', title: 'Turma atualizada!', timer: 1500,
      showConfirmButton: false, customClass: { popup: 'meu-alerta' } });
  } catch (err) {
    console.error(err);
    Swal.fire({ title: 'Erro', text: err.message, icon: 'error',
      confirmButtonText: 'OK', customClass: { popup: 'meu-alerta' } });
  } finally {
    btn.disabled = false;
    btn.textContent = 'Salvar';
  }
}

document.getElementById('modal-editar-overlay').addEventListener('click', function (e) {
  if (e.target === this) fecharModalEditarTurma();
});

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  try {
    dados = await buscarTurmas();
  } catch (err) {
    console.error(err);
    Swal.fire({
      title: 'Erro',
      text: 'Não foi possível carregar as turmas.',
      icon: 'error',
      confirmButtonText: 'OK',
      heightAuto: false
    });
    dados = defaultData();
  }
  renderTodos();
}

init();