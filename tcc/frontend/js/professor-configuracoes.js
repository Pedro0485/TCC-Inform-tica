const toggle = document.getElementById("themeToggle");

if(localStorage.getItem("theme") === "dark"){
    toggle.checked = true;
}

toggle.addEventListener("change", () => {

    if (toggle.checked) {
        document.body.classList.add("dark-theme");
        localStorage.setItem("theme", "dark");
    } else {
        document.body.classList.remove("dark-theme");
        localStorage.setItem("theme", "light");
    }

});

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
