// Normalização de nomes (equivalente à do Python) para comparar com o banco.
function semAcentos(t) {
  return String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
// Identidade de professor: sem acento, maiúscula, só letras e SEM espaços. Ignorar espaços
// evita duplicar "Camilo Mesquita" / "Camilo Me Squita" (vão criado pela fonte dos PDFs).
function chaveNome(nome) {
  return semAcentos(nome).toUpperCase().replace(/[^A-Z]/g, '');
}
// Turmas: o banco guarda minúsculas; compara sem acento/pontuação.
function chaveTurma(nome, ano) {
  return `${Number(ano)}|${semAcentos(nome).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
}
// Similaridade de Dice por bigramas (0-1), para sugerir "possível mesmo professor".
function similaridade(a, b) {
  const bi = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
  a = chaveNome(a); b = chaveNome(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bi(a); const B = bi(b); let inter = 0;
  for (const [g, n] of A) inter += Math.min(n, B.get(g) || 0);
  return (2 * inter) / (Math.max(a.length - 1, 0) + Math.max(b.length - 1, 0));
}
// 'Marcia Regina' x 'Marcia Regina Zugliani': um nome é o começo do outro (>= 2 palavras).
function nomeParcial(a, b) {
  const tok = (s) => semAcentos(s).toUpperCase().replace(/[^A-Z ]/g, ' ').split(/\s+/).filter(Boolean);
  const [x, y] = [tok(a), tok(b)].sort((m, n) => m.length - n.length);
  return x.length >= 2 && x.length < y.length && x.every((w, i) => w === y[i]);
}
function formatarNome(nome) {
  const part = new Set(['de', 'da', 'do', 'dos', 'das', 'e']);
  return String(nome).trim().replace(/\s+/g, ' ').split(' ')
    .map((p, i) => { const l = p.toLowerCase(); return i > 0 && part.has(l) ? l : l.charAt(0).toUpperCase() + l.slice(1); })
    .join(' ');
}
module.exports = { semAcentos, chaveNome, chaveTurma, similaridade, nomeParcial, formatarNome };
