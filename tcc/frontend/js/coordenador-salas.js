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

function capitalizar(txt) {
  if (NOMES_CURSO[txt]) return NOMES_CURSO[txt];
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

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
const HORARIOS = {
  matutino:   ['07:00','07:50','08:40','10:00','10:50','11:40'],
  integral:   ['07:00','07:50','08:40','10:00','10:50','11:40','13:30','14:20'],
  vespertino: ['13:00','13:50','14:40','15:30','16:20','17:10'],
  noturno:    ['18:50','19:40','20:30','21:20','22:10'],
};

const DISCIPLINAS = [
  '— nenhuma —','Matemática','Português','História','Geografia','Física','Química',
  'Biologia','Inglês','Educação Física','Filosofia','Sociologia','Informática',
  'Eletroeletrônica','Mecânica','Desenho Técnico','Administração','Edificações',
];

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
        const totalAulas = contarAulas(c.horarios[turma]);

        const wrapper = document.createElement('div');
        wrapper.className = 'turma-wrapper';

        const btn = document.createElement('button');
        btn.className = 'turma-btn';
        btn.style.background = corDoCurso(c.curso, c.cor);
        btn.innerHTML = turma + (totalAulas ? `<span class="badge-aulas">${totalAulas}</span>` : '');
        btn.onclick = () => abrirModal(turno, ci, ti);

        const delBtn = document.createElement('button');
        delBtn.className = 'del-turma-btn';
        delBtn.title = 'Apagar turma';
        delBtn.innerHTML = '✕';
        delBtn.onclick = (e) => { e.stopPropagation(); apagarTurma(turno, ci, ti); };

        wrapper.appendChild(btn);
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

  // Remove horários da turma
  delete curso.horarios[turma];
  // Remove a turma da lista
  curso.turmas.splice(turmaIdx, 1);
  // Se o curso ficou sem turmas, remove o curso inteiro
  if (curso.turmas.length === 0) {
    dados[turno].splice(cursoIdx, 1);
  }

  salvarDados();
  renderTurno(turno);
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
      DISCIPLINAS.forEach(d => {
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

function gerarCodigoTurma() {
  // 6 dígitos, sem zero à esquerda (login só aceita números)
  document.getElementById('criar-codigo').value = String(Math.floor(100000 + Math.random() * 900000));
}

function abrirModalCriarTurma() {
  document.getElementById('criar-curso').value = '';
  document.getElementById('criar-ano').value = '';
  document.getElementById('criar-turno').value = turnoAtivo;
  document.getElementById('criar-codigo').value = '';
  montarGradeCriar();
  gerarCodigoTurma();
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
  if (!/^\d+$/.test(codigo)) return avisar('O código de login deve conter apenas números.');

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