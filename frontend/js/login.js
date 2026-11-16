const container = document.getElementById('container');
const registerBtn = document.getElementById('register');
const loginBtn = document.getElementById('login');
const mobileLoginHeading = document.querySelector('.mobile-login-heading');

const API_URL = '';

// Canonical login values for classes that may not exist in MySQL yet.
const CODIGOS_TURMA_LOGIN = {
  informatica: 'info', info: 'info',
  edificacoes: 'edf', edf: 'edf',
  mecatronica: 'meca', meca: 'meca',
  administracao: 'adm', adm: 'adm',
  desenvolvimento_de_sistemas: 'dse', dse: 'dse',
  marketing: 'mkt', mkt: 'mkt',
};

function normalizarNomeTurmaLogin(nome) {
  return String(nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function valorTurmaLogin(nome) {
  const original = String(nome || '').trim();
  const slug = normalizarNomeTurmaLogin(nome);
  return CODIGOS_TURMA_LOGIN[slug] || original.toLowerCase();
}

const formProfessor = document.getElementById('entrarProfessorForm');
const btnProfessor = document.getElementById('btnEntrarProfessor');

// botao de mostrar/ocultar senha
const toggleSenha = document.getElementById('toggleSenha');
const inputSenha = document.getElementById('loginSenha');

if (toggleSenha && inputSenha) {
  toggleSenha.addEventListener('click', () => {
    const senhaVisivel = inputSenha.type === 'text';
    inputSenha.type = senhaVisivel ? 'password' : 'text';
    toggleSenha.classList.toggle('fa-eye');
    toggleSenha.classList.toggle('fa-eye-slash');
  });
}

// funcao de validar email
function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// funcao de validar codigo da turma
function validarCodigoTurma(codigo) {
  return codigo.length >= 3 && codigo.length <= 20 && !/\s/.test(codigo);
}

// Guarda o rótulo antes de trocá-lo. Se gravar depois, o texto vira "" e o botão
// permanece em "Entrando..." quando o login falha.
function setLoading(botao, estaCarregando) {
  if (!botao) return;
  if (!botao.dataset.textoOriginal) {
    botao.dataset.textoOriginal = botao.textContent.trim();
  }
  botao.disabled = estaCarregando;
  botao.setAttribute('aria-busy', estaCarregando ? 'true' : 'false');
  botao.textContent = estaCarregando ? 'Entrando...' : botao.dataset.textoOriginal;
}

//tratamento de dados antes de enviar pro backend(formulario de login do professor)
formProfessor.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const senha = document.getElementById('loginSenha').value;

    if(!email || !senha) {
        Swal.fire({
            title: 'OPS',
            text: 'Preencha todos os campos!',
            icon: 'warning',
            confirmButtonText: 'OK',
            heightAuto: false
        });
        return;
    }

    setLoading(btnProfessor, true);

    try{
        const res = await fetch(`${API_URL}/professor/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email, senha })
        });

        const data = await res.json();

        if(!res.ok){
            throw new Error(data.message || data.error || 'Email ou senha inválidos!');
        }

        localStorage.setItem('token', data.token);
        localStorage.setItem('tipoUsuario', 'professor');
        localStorage.setItem('usuarioNome', data.professor.nome || '');

        Swal.fire({
            icon: 'success',
            title: 'Bem-Vindo(a)!',
            timer: 1500,
            showConfirmButton: false,
            heightAuto: false
        }).then(() => {
            if(data.professor.deveTrocarSenha){
                // senha provisória: leva direto para Configurações para definir a nova
                sessionStorage.setItem('avisoTrocarSenha', '1');
                window.location.href = data.professor.admin
                    ? "/pages/coordenador/coordenador-configuracoes.html"
                    : "/pages/professor/professor-configuracoes.html";
            }else if(data.professor.admin){
                window.location.href = "/pages/coordenador/coordenador-home.html";
            }else{
                window.location.href = "/pages/professor/professor-home.html";
            }
        })
    }catch(err){
        console.error(err);
        Swal.fire({
            title: 'OPS',
            text: err.message || 'Ocorreu um erro ao tentar entrar!',
            icon: 'error',
            confirmButtonText: 'OK',
            heightAuto: false
        });
    }finally{
        setLoading(btnProfessor, false);
    }
});

const formTurma = document.getElementById('entrarTurmaForm');
const btnTurma = document.getElementById('btnEntrarTurma');

//tratamento de dados antes de enviar pro backend(formulario de login da turma)
formTurma.addEventListener('submit', async (e) => {
    e.preventDefault();

    const turma = document.getElementById('turma').value;
    const ano = document.getElementById('ano').value;
    const codigoTurma = document.getElementById('codigo_turma').value.trim();

    if(!turma || !ano || !codigoTurma) {
        Swal.fire({
            title: 'OPS',
            text: 'Preencha todos os campos!',
            icon: 'warning',
            confirmButtonText: 'OK',
            heightAuto: false
        });
        return;
    }

    if(!validarCodigoTurma(codigoTurma)) {
        Swal.fire({
            title: 'Ops!',
            text: 'Código da turma inválido (de 3 a 20 caracteres, sem espaços).',
            icon: 'warning',
            confirmButtonText: 'OK',
            heightAuto: false
        });
        return;
    }

    setLoading(btnTurma, true);

    try{
        const res = await fetch(`${API_URL}/login/turma`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ turma, ano, codigoTurma })
        });

        const data = await res.json();

        if(!res.ok){
            throw new Error(data.message || 'Código da turma inválido!');
        }

        localStorage.setItem('token', data.token);
        localStorage.setItem('tipoUsuario', 'turma');
        localStorage.setItem('turmaInfo', JSON.stringify({ turma, ano }));

        Swal.fire({
            icon: 'success',
            title: 'Bem-Vindo(a)!',
            timer: 1500,
            showConfirmButton: false,
            heightAuto: false
        }).then(() => {
            window.location.href = '/pages/aluno/aluno-home.html';
        })
    }catch(err){
        console.error(err);
        Swal.fire({
            title: 'OPS',
            text: err.message || 'Ocorreu um erro ao tentar entrar!',
            icon: 'error',
            confirmButtonText: 'OK',
            heightAuto: false
        });
    }finally{
        setLoading(btnTurma, false);
    }
});

// Adicionando eventos para alternar entre os formulários de login e registro
registerBtn.addEventListener('click', () => {
    container.classList.add('active');
    registerBtn.setAttribute('aria-pressed', 'true');
    loginBtn.setAttribute('aria-pressed', 'false');
    if (mobileLoginHeading) mobileLoginHeading.textContent = 'TURMAS';
});
loginBtn.addEventListener('click', () => {
    container.classList.remove('active');
    loginBtn.setAttribute('aria-pressed', 'true');
    registerBtn.setAttribute('aria-pressed', 'false');
    if (mobileLoginHeading) mobileLoginHeading.textContent = 'PROFESSORES';
});

// Completa o select de cursos do login com cursos novos cadastrados pela coordenação
(async function carregarCursosLogin() {
    try {
        const sel = document.getElementById('turma');
        if (!sel) return;
        const res = await fetch(`${API_URL}/login/cursos`);
        if (!res.ok) return;
        const nomes = await res.json();
        const existentes = new Set([...sel.options].map((o) => valorTurmaLogin(o.value)));
        nomes.forEach((nome) => {
            const nomeOriginal = String(nome || '').trim();
            const slug = normalizarNomeTurmaLogin(nomeOriginal);
            const valor = valorTurmaLogin(nomeOriginal);
            if (existentes.has(valor)) return;
            const opt = document.createElement('option');
            opt.value = valor;
            opt.textContent = slug.charAt(0).toUpperCase() + slug.slice(1).replace(/_/g, ' ');
            sel.appendChild(opt);
            existentes.add(valor);
        });
    } catch (e) { /* mantém a lista padrão */ }
})();
