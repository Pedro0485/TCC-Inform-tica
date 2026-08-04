const container = document.getElementById('container');
const registerBtn = document.getElementById('register');
const loginBtn = document.getElementById('login');

const API_URL = '';

const formProfessor = document.getElementById('entrarProfessorForm');
const btnProfessor = document.getElementById('btnEntrarProfessor');

// funcao de validar email
function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// funcao de validar codigo da turma
function validarCodigoTurma(codigo) {
  return /^\d+$/.test(codigo);
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

    if(!validarEmail(email)) {
        Swal.fire({
            title: 'OPS',
            text: 'Digite um email válido!',
            icon: 'warning',
            confirmButtonText: 'OK',
            heightAuto: false
        });
        return;
    }

    if(senha.length < 6) {
        Swal.fire({
            title: 'OPS',
            text: 'A senha deve ter no mínimo 6 caracteres!',
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
            throw new Error(data.message || 'Email ou senha inválidos!');
        }

        localStorage.setItem('token', data.token);
        localStorage.setItem('tipoUsuario', 'professor');

        Swal.fire({
            icon: 'success',
            title: 'Bem-Vindo(a)!',
            timer: 1500,
            showConfirmButton: false,
            heightAuto: false
        }).then(() => {
            if(data.professor.admin){
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
            text: 'Código da turma deve conter apenas números.',
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
});
// Adicionando eventos para alternar entre os formulários de login e registro
loginBtn.addEventListener('click', () => {
    container.classList.remove('active');
});