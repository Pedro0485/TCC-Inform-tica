const container = document.getElementById('container');
const registerBtn = document.getElementById('register');
const loginBtn = document.getElementById('login');
const mobileLoginHeading = document.querySelector('.mobile-login-heading');

const API_URL = '';

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
  return codigo.length >= 4 && !/\s/.test(codigo);
}

// funcao para mostrar o loading no botao
function setLoading(botao, estaCarregando) {
  botao.disabled = estaCarregando;
  botao.textContent = estaCarregando ? 'Entrando...' : botao.dataset.textoOriginal || botao.textContent;
  if (!botao.dataset.textoOriginal) {
    botao.dataset.textoOriginal = estaCarregando ? '' : botao.textContent;
  }
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
            text: 'Código da turma inválido (mínimo 4 caracteres, sem espaços).',
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
        const existentes = new Set([...sel.options].map((o) => o.value));
        nomes.forEach((slug) => {
            if (existentes.has(slug)) return;
            const opt = document.createElement('option');
            opt.value = slug;
            opt.textContent = slug.charAt(0).toUpperCase() + slug.slice(1).replace(/_/g, ' ');
            sel.appendChild(opt);
        });
    } catch (e) { /* mantém a lista padrão */ }
})();
