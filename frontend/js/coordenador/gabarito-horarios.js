'use strict';

(() => {
  const ROOT = '/importacoes/gabarito';
  const $ = (id) => document.getElementById(id);
  let itens = [];
  let editando = null;

  function el(tag, props = {}, ...filhos) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === 'text') node.textContent = value;
      else if (key === 'class') node.className = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (value !== undefined && value !== null) node.setAttribute(key, value === true ? '' : value);
    }
    for (const child of filhos.flat()) if (child !== null && child !== undefined) node.append(child.nodeType ? child : document.createTextNode(String(child)));
    return node;
  }

  async function request(path = '', options = {}) {
    const token = localStorage.getItem('token');
    const response = await fetch(ROOT + path, { method: options.method || 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      body: options.body ? JSON.stringify(options.body) : undefined });
    let result = {};
    try { result = await response.json(); } catch (_) { /* empty response */ }
    if (!response.ok) throw new Error(result.error || 'Não foi possível acessar o gabarito.');
    return result;
  }

  function erro(texto) { const box = $('hz-gabarito-erro'); box.textContent = texto || ''; box.hidden = !texto; }
  function resetar() {
    editando = null; $('hz-gabarito-form').reset(); $('hz-gabarito-tipo').value = 'professor';
    $('hz-gabarito-salvar').textContent = 'Adicionar ao gabarito'; $('hz-gabarito-cancelar').hidden = true;
  }

  function editar(item) {
    editando = item.id;
    $('hz-gabarito-tipo').value = item.tipo;
    $('hz-gabarito-nome').value = item.nome_oficial;
    $('hz-gabarito-variacoes').value = item.variacoes.join('\n');
    $('hz-gabarito-salvar').textContent = 'Salvar alterações';
    $('hz-gabarito-cancelar').hidden = false;
    $('hz-gabarito-nome').focus();
  }

  async function alternar(item) {
    try {
      await request(`/${item.id}`, { method: item.ativo ? 'DELETE' : 'PUT',
        ...(item.ativo ? {} : { body: { tipo: item.tipo, nome_oficial: item.nome_oficial, variacoes: item.variacoes, ativo: true } }) });
      await carregar();
    } catch (e) { erro(e.message); }
  }

  function desenhar() {
    const body = document.querySelector('#hz-gabarito-lista tbody'); body.replaceChildren();
    $('hz-gabarito-vazio').hidden = itens.length > 0;
    for (const item of itens) {
      const acoes = el('td', {},
        el('button', { type: 'button', class: 'hz-gabarito-link', onclick: () => editar(item), text: 'Editar' }),
        el('button', { type: 'button', class: 'hz-gabarito-link perigo', onclick: () => alternar(item), text: item.ativo ? 'Desativar' : 'Reativar' }));
      body.append(el('tr', { class: item.ativo ? '' : 'inativo' },
        el('td', { text: item.tipo === 'professor' ? 'Professor' : 'Disciplina' }),
        el('td', { text: item.nome_oficial }),
        el('td', { text: item.variacoes.join(', ') || '—' }),
        el('td', {}, el('span', { class: `hz-badge ${item.ativo ? 'ok' : ''}`, text: item.ativo ? 'Ativo' : 'Desativado' })), acoes));
    }
  }

  async function carregar() {
    try { itens = (await request()).itens || []; erro(''); desenhar(); }
    catch (e) { erro(`${e.message} Para instalar a estrutura e carregar os nomes existentes, execute npm run db:migrate na pasta backend.`); }
  }

  async function salvar(event) {
    event.preventDefault(); erro('');
    const body = {
      tipo: $('hz-gabarito-tipo').value,
      nome_oficial: $('hz-gabarito-nome').value.trim(),
      variacoes: $('hz-gabarito-variacoes').value.split(/[\n;]/).map((v) => v.trim()).filter(Boolean),
      ativo: true,
    };
    try {
      await request(editando ? `/${editando}` : '', { method: editando ? 'PUT' : 'POST', body });
      resetar(); await carregar();
    } catch (e) { erro(e.message); }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('hz-gabarito-form').addEventListener('submit', salvar);
    $('hz-gabarito-cancelar').addEventListener('click', resetar);
    carregar();
  });
})();
