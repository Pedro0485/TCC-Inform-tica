// Erro com a ETAPA em que ocorreu, para a coordenadora saber onde foi o problema.
const ETAPAS = {
  ENVIO: 'envio_arquivo',
  LEITURA: 'leitura_pdf',
  COMUNICACAO: 'comunicacao_servicos',
  VALIDACAO: 'validacao_dados',
  GRAVACAO: 'gravacao_banco',
};

class ErroImportacao extends Error {
  constructor(mensagem, { etapa = ETAPAS.VALIDACAO, codigo = 'ERRO_IMPORTACAO', status = 400, detalhes } = {}) {
    super(mensagem);
    this.name = 'ErroImportacao';
    this.etapa = etapa;
    this.codigo = codigo;
    this.status = status;
    this.detalhes = detalhes;
  }
}

module.exports = { ErroImportacao, ETAPAS };
