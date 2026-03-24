/* ================================================================
   TECHFIX — Painel Administrativo
   Arquivo: painel-admin.js
   Descrição: Toda a lógica de funcionamento do painel admin
================================================================ */

'use strict';

/* ── CONFIGURAÇÃO DO SUPABASE ─────────────────────────────── */
const URL_SUPABASE = 'https://pfigjyvhczzvcjseueoa.supabase.co';
const CHAVE_SUPABASE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmaWdqeXZoY3p6dmNqc2V1ZW9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NTE1NTEsImV4cCI6MjA4NzQyNzU1MX0.tl8aNDsA8ITt50oielqRz5Oja6xjLIR2xT8Khk3AqGk';

/* ── ESTADO GLOBAL DA APLICAÇÃO ──────────────────────────── */
let tokenAuth       = '';         // Token JWT após login
let tecnicoLogado   = '';         // Nome do técnico logado (ou vazio se admin)
let orcamentos      = [];         // Lista de orçamentos carregados
let clientes        = [];         // Lista de clientes carregados
let servicos        = [];         // Lista de serviços realizados
let depoimentos     = [];         // Lista de depoimentos
let orcamentoAtivo  = null;       // Orçamento aberto no modal de detalhes

/* ── FILTROS ATIVOS ──────────────────────────────────────── */
let filtroStatusOrcamento = '';   // Filtro de status na aba orçamentos
let textoBuscaOrcamento   = '';   // Texto de busca na aba orçamentos
let filtroStatusServico   = '';   // Filtro de status na aba serviços
let filtroDepoimento      = '';   // Filtro de aprovação na aba depoimentos

/* ── ESTADO DO LIGHTBOX ──────────────────────────────────── */
let urlsLightbox    = [];         // URLs dos anexos abertos no lightbox
let indicesLightbox = 0;          // Índice atual no lightbox

/* ================================================================
   FUNÇÕES DE REQUISIÇÃO AO BANCO (SUPABASE)
================================================================ */

/**
 * Monta os cabeçalhos HTTP para as requisições ao Supabase.
 * Se houver token de autenticação, usa ele; senão usa a chave anon.
 * @param {Object} extra - Cabeçalhos adicionais opcionais
 * @returns {Object} Cabeçalhos HTTP completos
 */
function montarCabecalhos(extra) {
  const base = {
    'apikey':        CHAVE_SUPABASE,
    'Authorization': 'Bearer ' + (tokenAuth || CHAVE_SUPABASE),
    'Content-Type':  'application/json',
    'Accept':        'application/json'
  };
  if (extra) Object.assign(base, extra);
  return base;
}

/**
 * Busca dados de uma tabela do Supabase.
 * @param {string} tabela - Nome da tabela
 * @param {string} params - Parâmetros de query (ex: 'order=criado_em.desc')
 * @returns {Array} Lista de registros ou array vazio em caso de erro
 */
async function buscarDados(tabela, params = '') {
  const resposta = await fetch(
    `${URL_SUPABASE}/rest/v1/${tabela}?${params}`,
    { headers: montarCabecalhos() }
  );
  const json = await resposta.json();
  if (!resposta.ok) {
    console.error(`[buscarDados/${tabela}]`, json);
    return [];
  }
  return Array.isArray(json) ? json : [];
}

/**
 * Atualiza um registro existente no banco (PATCH).
 * @param {string} tabela - Nome da tabela
 * @param {string} id     - ID do registro
 * @param {Object} dados  - Campos a atualizar
 */
async function atualizarDados(tabela, id, dados) {
  const resposta = await fetch(
    `${URL_SUPABASE}/rest/v1/${tabela}?id=eq.${id}`,
    {
      method:  'PATCH',
      headers: montarCabecalhos({ 'Prefer': 'return=minimal' }),
      body:    JSON.stringify(dados)
    }
  );
  if (!resposta.ok) {
    console.error(`[atualizarDados/${tabela}]`, await resposta.json());
  }
}

/**
 * Insere um novo registro no banco (POST).
 * @param {string} tabela - Nome da tabela
 * @param {Object} dados  - Dados a inserir
 * @returns {Object|null} Registro criado ou null em caso de erro
 */
async function inserirDados(tabela, dados) {
  const resposta = await fetch(
    `${URL_SUPABASE}/rest/v1/${tabela}`,
    {
      method:  'POST',
      headers: montarCabecalhos({ 'Prefer': 'return=representation' }),
      body:    JSON.stringify(dados)
    }
  );
  const json = await resposta.json();
  if (!resposta.ok) {
    console.error(`[inserirDados/${tabela}]`, json);
  }
  return Array.isArray(json) ? json[0] : null;
}

/**
 * Remove um registro do banco (DELETE).
 * @param {string} tabela - Nome da tabela
 * @param {string} id     - ID do registro a remover
 */
async function removerDados(tabela, id) {
  await fetch(
    `${URL_SUPABASE}/rest/v1/${tabela}?id=eq.${id}`,
    { method: 'DELETE', headers: montarCabecalhos() }
  );
}

/* ================================================================
   AUTENTICAÇÃO
================================================================ */

/**
 * Realiza o login do usuário com e-mail e senha.
 * Detecta automaticamente se é técnico (Reginaldo/Leonardo) ou admin.
 * Após login bem-sucedido, carrega todos os dados do painel.
 */
async function fazerLogin() {
  const email = document.getElementById('campo-email').value.trim();
  const senha = document.getElementById('campo-senha').value;
  const erro  = document.getElementById('mensagem-erro-login');
  erro.classList.remove('vis');

  try {
    const resposta = await fetch(
      `${URL_SUPABASE}/auth/v1/token?grant_type=password`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': CHAVE_SUPABASE },
        body:    JSON.stringify({ email, password: senha })
      }
    );
    const dados = await resposta.json();

    if (dados.access_token) {
      tokenAuth = dados.access_token;

      /* Detecta o técnico pelo e-mail */
      const nomeEmail = email.split('@')[0].toLowerCase();
      if      (nomeEmail.includes('reginaldo')) tecnicoLogado = 'Reginaldo';
      else if (nomeEmail.includes('leonardo'))  tecnicoLogado = 'Leonardo';
      else                                      tecnicoLogado = ''; /* admin vê tudo */

      /* Mostra o app e esconde o login */
      document.getElementById('tela-login').style.display = 'none';
      document.getElementById('app').style.display = 'block';

      /* Saudação personalizada por horário */
      const hora = new Date().getHours();
      const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
      document.getElementById('texto-saudacao').textContent  = `${saudacao}, ${email.split('@')[0]} 👋`;
      document.getElementById('label-usuario').textContent   = tecnicoLogado ? `🔧 ${tecnicoLogado}` : '👑 Admin';

      /* Define data de hoje no campo de entrada de serviço */
      document.getElementById('servico-data-entrada').value = new Date().toISOString().split('T')[0];

      /* Resetar todos os filtros */
      filtroStatusOrcamento = '';
      textoBuscaOrcamento   = '';
      filtroStatusServico   = '';
      filtroDepoimento      = '';
      document.getElementById('filtro-status-orcamento').value = '';
      document.getElementById('filtro-status-servico').value   = '';
      document.getElementById('filtro-depoimento').value       = '';

      await carregarTudo();

    } else {
      erro.textContent = dados.error_description || 'E-mail ou senha inválidos.';
      erro.classList.add('vis');
    }

  } catch (e) {
    erro.textContent = 'Erro de conexão com o Supabase.';
    erro.classList.add('vis');
  }
}

/**
 * Faz logout do usuário e recarrega a página.
 */
function fazerLogout() {
  tokenAuth = '';
  location.reload();
}

/* ================================================================
   NAVEGAÇÃO ENTRE ABAS
================================================================ */

/**
 * Navega para a aba clicada no menu lateral.
 * @param {HTMLElement} elemento - Item do menu clicado
 */
function navegarPara(elemento) {
  document.querySelectorAll('.item-menu').forEach(item => item.classList.remove('ativo'));
  document.querySelectorAll('.pagina').forEach(pag  => pag.classList.remove('ativa'));
  elemento.classList.add('ativo');
  document.getElementById('pagina-' + elemento.dataset.pagina).classList.add('ativa');
}

/* ================================================================
   CARREGAMENTO DE DADOS
================================================================ */

/**
 * Carrega todos os dados do banco em paralelo e renderiza o painel.
 * Exibe um toast de aviso se o banco retornar vazio.
 */
async function carregarTudo() {
  try {
    [orcamentos, clientes, servicos, depoimentos] = await Promise.all([
      buscarDados('orcamentos',          'order=criado_em.desc'),
      buscarDados('clientes',            'order=criado_em.desc'),
      buscarDados('servicos_realizados', 'order=criado_em.desc'),
      buscarDados('depoimentos',         'order=criado_em.desc')
    ]);

    console.log(
      '[carregarTudo] orçamentos:', orcamentos.length,
      '| clientes:', clientes.length,
      '| serviços:', servicos.length
    );

    if (orcamentos.length === 0 && clientes.length === 0) {
      exibirToast('⚠️ Banco vazio ou erro de conexão. Verifique o console (F12).', 'erro');
    }

  } catch (e) {
    console.error('[carregarTudo] ERRO:', e);
    exibirToast('❌ Erro ao carregar dados: ' + e.message, 'erro');
  }

  renderizarDashboard();
  renderizarOrcamentos();
  renderizarClientes();
  renderizarServicos();
  renderizarDepoimentos();
}

/* ================================================================
   DASHBOARD
================================================================ */

/**
 * Renderiza os cartões de métricas e a tabela de orçamentos recentes.
 * Filtra pelos orçamentos do técnico logado (ou mostra todos se admin).
 */
function renderizarDashboard() {
  /* Filtra pelos orçamentos e serviços do técnico logado */
  const orcamentosMeus = tecnicoLogado
    ? orcamentos.filter(o => o.tecnico === tecnicoLogado)
    : orcamentos;

  const servicosMeus = tecnicoLogado
    ? servicos.filter(s => s.tecnico === tecnicoLogado)
    : servicos;

  /* Atualiza os números nos cartões */
  document.getElementById('metrica-novos').textContent      = orcamentosMeus.filter(o => o.status === 'novo').length;
  document.getElementById('metrica-andamento').textContent  = servicosMeus.filter(s => s.status === 'em_andamento').length;
  document.getElementById('metrica-concluidos').textContent = servicosMeus.filter(s => s.status === 'concluido').length;
  document.getElementById('metrica-clientes').textContent   = clientes.length;

  /* Renderiza tabela com os 8 mais recentes */
  const tabela    = document.getElementById('tabela-dashboard');
  const recentes  = orcamentosMeus.slice(0, 8);

  if (!recentes.length) {
    tabela.innerHTML = criarLinhaVazia('Nenhum orçamento ainda');
    return;
  }

  /* Garante que o mapa de orçamentos está atualizado */
  recentes.forEach(o => {
    if (!window._mapaOrcamentos) window._mapaOrcamentos = {};
    window._mapaOrcamentos[o.id] = o;
  });

  tabela.innerHTML = recentes.map(o => {
    const cliente = clientes.find(c => c.id === o.cliente_id);
    return `<tr>
      <td class="celula-nome">${cliente?.nome || '—'}</td>
      <td>${o.dispositivo}</td>
      <td style="font-size:.78rem;max-width:160px">${(o.servicos || []).join(', ')}</td>
      <td>${o.tecnico}</td>
      <td>${formatarUrgencia(o.urgencia)}</td>
      <td>${formatarBadgeStatus(o.status)}</td>
      <td class="celula-suave">${formatarData(o.criado_em)}</td>
      <td><button class="btn-acao" onclick="abrirDetalhesPorId('${o.id}')">🔍 Ver</button></td>
    </tr>`;
  }).join('');
}

/* ================================================================
   ABA ORÇAMENTOS
================================================================ */

/**
 * Mapa global para acessar orçamentos pelo ID sem serializar no HTML.
 * Evita o problema de aspas aninhadas em onclick.
 */
window._mapaOrcamentos = {};

/**
 * Renderiza a tabela de orçamentos com filtros aplicados.
 * Técnicos veem todos, mas só podem interagir com os seus.
 */
function renderizarOrcamentos() {
  const tabela = document.getElementById('tabela-orcamentos');
  let lista    = [...orcamentos];

  /* Aplica filtro de status */
  if (filtroStatusOrcamento) {
    lista = lista.filter(o => o.status === filtroStatusOrcamento);
  }

  /* Aplica filtro de busca por nome ou WhatsApp */
  if (textoBuscaOrcamento) {
    lista = lista.filter(o => {
      const cliente = clientes.find(c => c.id === o.cliente_id);
      return (cliente?.nome || '').toLowerCase().includes(textoBuscaOrcamento) ||
             (cliente?.whatsapp || '').includes(textoBuscaOrcamento);
    });
  }

  if (!lista.length) {
    tabela.innerHTML = criarLinhaVazia('Nenhum orçamento encontrado');
    return;
  }

  /* Reconstrói o mapa para acesso por ID */
  window._mapaOrcamentos = {};
  lista.forEach(o => { window._mapaOrcamentos[o.id] = o; });

  tabela.innerHTML = lista.map(o => {
    const cliente     = clientes.find(c => c.id === o.cliente_id);
    const ehMeuOrc    = !tecnicoLogado || o.tecnico === tecnicoLogado;
    const podeAceitar = o.status === 'novo' && ehMeuOrc;

    return `<tr style="${!ehMeuOrc ? 'opacity:.65;' : ''}">
      <td class="celula-nome">${cliente?.nome || '—'}</td>
      <td class="celula-suave">${formatarWhatsApp(cliente?.whatsapp || '')}</td>
      <td>${o.dispositivo}${o.marca ? ' <span class="celula-suave">' + o.marca + '</span>' : ''}</td>
      <td style="max-width:140px;font-size:.78rem">${(o.servicos || []).join(', ')}</td>
      <td>${formatarUrgencia(o.urgencia)}</td>
      <td>${o.tecnico}</td>
      <td>${formatarBadgeStatus(o.status)}</td>
      <td class="celula-suave">${formatarData(o.criado_em)}</td>
      <td style="display:flex;gap:.3rem;flex-wrap:wrap">
        <button class="btn-acao" onclick="abrirDetalhesPorId('${o.id}')">🔍 Detalhes</button>
        ${podeAceitar
          ? `<button class="btn-acao verde" onclick="aceitarOrcamentoPorId('${o.id}')">✓ Aceitar</button>`
          : ''}
        ${!ehMeuOrc
          ? '<span style="font-size:.7rem;color:var(--suave)">🔒</span>'
          : ''}
      </td>
    </tr>`;
  }).join('');
}

/**
 * Abre o modal de detalhes a partir do ID do orçamento.
 * @param {string} id - ID do orçamento
 */
function abrirDetalhesPorId(id) {
  abrirDetalhes(window._mapaOrcamentos[id]);
}

/**
 * Inicia o processo de aceitar um orçamento a partir do ID.
 * @param {string} id - ID do orçamento
 */
function aceitarOrcamentoPorId(id) {
  aceitarOrcamento(window._mapaOrcamentos[id]);
}

/**
 * Aceita um orçamento: muda o status para "em_andamento",
 * preenche o formulário de serviço e navega para a aba de serviços.
 * @param {Object} orcamento - Objeto do orçamento
 */
async function aceitarOrcamento(orcamento) {
  const cliente = clientes.find(c => c.id === orcamento.cliente_id);

  /* Preenche o formulário de serviço com os dados do orçamento */
  document.getElementById('servico-descricao').value   = (orcamento.servicos || []).join(', ');
  document.getElementById('servico-dispositivo').value = orcamento.dispositivo || '';
  document.getElementById('servico-marca').value       = [orcamento.marca, orcamento.modelo].filter(Boolean).join(' ');
  document.getElementById('servico-whatsapp').value    = cliente?.whatsapp || '';
  document.getElementById('servico-orc-id').value      = orcamento.id;
  document.getElementById('servico-cli-id').value      = orcamento.cliente_id || '';

  /* Seleciona o técnico correto no select */
  const selectTecnico = document.getElementById('servico-tecnico');
  for (let opcao of selectTecnico.options) {
    if (opcao.value === orcamento.tecnico) { opcao.selected = true; break; }
  }

  /* Atualiza o status do orçamento para "em andamento" */
  await atualizarDados('orcamentos', orcamento.id, { status: 'em_andamento' });
  orcamentos = await buscarDados('orcamentos', 'order=criado_em.desc');
  renderizarOrcamentos();
  renderizarDashboard();

  /* Navega para a aba de serviços */
  document.querySelector('.item-menu[data-pagina="servicos"]').click();
  setTimeout(() => {
    document.getElementById('topo-form-servico').scrollIntoView({ behavior: 'smooth' });
  }, 200);

  exibirToast('📋 Dados puxados! Confira e registre o serviço.', 'sucesso');
}

/* ================================================================
   ABA CLIENTES
================================================================ */

/**
 * Renderiza a tabela de clientes com filtro de busca aplicado.
 */
function renderizarClientes() {
  const valorBusca = (document.getElementById('busca-clientes')?.value || '').toLowerCase();
  const tabela     = document.getElementById('tabela-clientes');

  const lista = valorBusca
    ? clientes.filter(c =>
        c.nome.toLowerCase().includes(valorBusca) ||
        (c.whatsapp || '').includes(valorBusca))
    : clientes;

  if (!lista.length) {
    tabela.innerHTML = criarLinhaVazia('Nenhum cliente encontrado');
    return;
  }

  tabela.innerHTML = lista.map(c => {
    const totalPedidos = orcamentos.filter(o => o.cliente_id === c.id).length;
    return `<tr>
      <td class="celula-nome">${c.nome}</td>
      <td>${formatarWhatsApp(c.whatsapp)}</td>
      <td class="celula-suave">${c.cidade || '—'}</td>
      <td><span class="badge badge-novo">${totalPedidos} pedido${totalPedidos !== 1 ? 's' : ''}</span></td>
      <td class="celula-suave">${formatarData(c.criado_em)}</td>
      <td>
        <a href="https://wa.me/55${(c.whatsapp || '').replace(/\D/g, '')}" target="_blank" rel="noopener">
          <button class="btn-acao verde">WhatsApp</button>
        </a>
      </td>
    </tr>`;
  }).join('');
}

/* ================================================================
   ABA SERVIÇOS REALIZADOS
================================================================ */

/**
 * Renderiza a tabela de serviços com filtro de status.
 * Serviços de outro técnico ficam levemente transparentes e sem botões de ação.
 */
function renderizarServicos() {
  const tabela = document.getElementById('tabela-servicos');
  let lista    = [...servicos];

  if (filtroStatusServico) {
    lista = lista.filter(s => s.status === filtroStatusServico);
  }

  if (!lista.length) {
    tabela.innerHTML = criarLinhaVazia('Nenhum serviço registrado');
    return;
  }

  tabela.innerHTML = lista.map(s => {
    const cliente  = clientes.find(c => c.id === s.cliente_id);
    const ehMeuServ = !tecnicoLogado || s.tecnico === tecnicoLogado;

    return `<tr style="${!ehMeuServ ? 'opacity:.6;' : ''}">
      <td class="celula-nome">${cliente?.nome || '—'}</td>
      <td>${s.descricao}</td>
      <td class="celula-suave">${[s.dispositivo, s.marca].filter(Boolean).join(' ')}</td>
      <td>${s.tecnico || '—'}</td>
      <td>${s.valor_cobrado ? 'R$ ' + parseFloat(s.valor_cobrado).toFixed(2) : '—'}</td>
      <td class="celula-suave">${s.data_entrada || '—'}</td>
      <td class="celula-suave">${s.data_saida   || '—'}</td>
      <td>${formatarBadgeStatus(s.status)}</td>
      <td style="display:flex;gap:.3rem;flex-wrap:wrap">
        ${ehMeuServ && s.status === 'em_andamento'
          ? `<button class="btn-acao verde" onclick="concluirServico('${s.id}')">✓ Concluir</button>`
          : ''}
        ${ehMeuServ
          ? `<button class="btn-acao vermelho" onclick="deletarServico('${s.id}')">🗑</button>`
          : '<span style="font-size:.7rem;color:var(--suave)">🔒</span>'}
      </td>
    </tr>`;
  }).join('');
}

/**
 * Registra um novo serviço no banco com os dados do formulário.
 */
async function registrarServico() {
  const descricao = document.getElementById('servico-descricao').value.trim();
  if (!descricao) {
    exibirToast('Preencha a descrição do serviço.', 'erro');
    return;
  }

  const wpp      = document.getElementById('servico-whatsapp').value.trim().replace(/\D/g, '');
  const clienteId = document.getElementById('servico-cli-id').value ||
    clientes.find(c => (c.whatsapp || '').replace(/\D/g, '') === wpp)?.id || null;

  const dados = {
    cliente_id:    clienteId,
    orcamento_id:  document.getElementById('servico-orc-id').value || null,
    descricao:     descricao,
    dispositivo:   document.getElementById('servico-dispositivo').value.trim(),
    marca:         document.getElementById('servico-marca').value.trim(),
    tecnico:       document.getElementById('servico-tecnico').value,
    valor_cobrado: parseFloat(document.getElementById('servico-valor').value) || null,
    data_entrada:  document.getElementById('servico-data-entrada').value || null,
    status:        document.getElementById('servico-status').value
  };

  await inserirDados('servicos_realizados', dados);
  exibirToast('✅ Serviço registrado!', 'sucesso');

  /* Limpa os campos após registrar */
  ['servico-descricao', 'servico-dispositivo', 'servico-marca',
   'servico-valor', 'servico-whatsapp', 'servico-orc-id', 'servico-cli-id']
    .forEach(id => { document.getElementById(id).value = ''; });

  /* Recarrega a lista */
  servicos = await buscarDados('servicos_realizados', 'order=criado_em.desc');
  renderizarServicos();
  renderizarDashboard();
}

/**
 * Marca um serviço como concluído e registra a data de saída.
 * @param {string} id - ID do serviço
 */
async function concluirServico(id) {
  const hoje = new Date().toISOString().split('T')[0];
  await atualizarDados('servicos_realizados', id, { status: 'concluido', data_saida: hoje });
  exibirToast('✅ Serviço concluído!', 'sucesso');
  servicos = await buscarDados('servicos_realizados', 'order=criado_em.desc');
  renderizarServicos();
  renderizarDashboard();
}

/**
 * Remove um serviço do histórico após confirmação do usuário.
 * @param {string} id - ID do serviço
 */
async function deletarServico(id) {
  if (!confirm('Apagar este serviço do histórico?')) return;
  await removerDados('servicos_realizados', id);
  exibirToast('🗑 Serviço apagado.', 'sucesso');
  servicos = await buscarDados('servicos_realizados', 'order=criado_em.desc');
  renderizarServicos();
  renderizarDashboard();
}

/* ================================================================
   ABA DEPOIMENTOS
================================================================ */

/**
 * Renderiza a tabela de depoimentos com filtro de aprovação.
 */
function renderizarDepoimentos() {
  const tabela = document.getElementById('tabela-depoimentos');
  let lista    = [...depoimentos];

  if (filtroDepoimento !== '') {
    lista = lista.filter(d => String(d.aprovado) === filtroDepoimento);
  }

  if (!lista.length) {
    tabela.innerHTML = criarLinhaVazia('Nenhum depoimento encontrado');
    return;
  }

  tabela.innerHTML = lista.map(d => `<tr>
    <td class="celula-nome">${d.nome}</td>
    <td class="celula-suave">${d.servico_desc || '—'}</td>
    <td><span class="estrelas">${'★'.repeat(d.estrelas)}${'☆'.repeat(5 - d.estrelas)}</span></td>
    <td style="max-width:200px;font-size:.82rem">${d.texto}</td>
    <td>${d.aprovado
      ? '<span class="badge badge-aprovado">Aprovado</span>'
      : '<span class="badge badge-pendente">Pendente</span>'}</td>
    <td class="celula-suave">${formatarData(d.criado_em)}</td>
    <td style="display:flex;gap:.4rem">
      ${!d.aprovado
        ? `<button class="btn-acao verde" onclick="aprovarDepoimento('${d.id}')">✓ Aprovar</button>`
        : ''}
      <button class="btn-acao vermelho" onclick="removerDepoimento('${d.id}')">🗑</button>
    </td>
  </tr>`).join('');
}

/**
 * Aprova um depoimento para que apareça no site principal.
 * @param {string} id - ID do depoimento
 */
async function aprovarDepoimento(id) {
  await atualizarDados('depoimentos', id, { aprovado: true });
  exibirToast('✅ Depoimento aprovado! Já aparece no site.', 'sucesso');
  depoimentos = await buscarDados('depoimentos', 'order=criado_em.desc');
  renderizarDepoimentos();
}

/**
 * Remove um depoimento após confirmação.
 * @param {string} id - ID do depoimento
 */
async function removerDepoimento(id) {
  if (!confirm('Remover este depoimento?')) return;
  await removerDados('depoimentos', id);
  exibirToast('🗑 Depoimento removido.', 'sucesso');
  depoimentos = await buscarDados('depoimentos', 'order=criado_em.desc');
  renderizarDepoimentos();
}

/* ================================================================
   MODAL DE DETALHES DO ORÇAMENTO
================================================================ */

/**
 * Abre o modal com todos os detalhes de um orçamento.
 * Controla permissões: o técnico só pode editar os seus próprios.
 * @param {Object} orcamento - Objeto completo do orçamento
 */
function abrirDetalhes(orcamento) {
  if (!orcamento) return;
  orcamentoAtivo = orcamento;

  const cliente  = clientes.find(c => c.id === orcamento.cliente_id);
  const ehMeuOrc = !tecnicoLogado || orcamento.tecnico === tecnicoLogado;
  const ehNovo   = orcamento.status === 'novo';

  /* Preenche o corpo do modal com os dados */
  document.getElementById('corpo-modal').innerHTML = `
    <div class="linha-detalhe">
      <span>👤 Nome</span>
      <span>${cliente?.nome || '—'}</span>
    </div>
    <div class="linha-detalhe">
      <span>📞 WhatsApp</span>
      <span>
        <a href="https://wa.me/55${(cliente?.whatsapp || '').replace(/\D/g, '')}"
           target="_blank" rel="noopener" style="color:var(--verde);text-decoration:none">
          ${formatarWhatsApp(cliente?.whatsapp || '—')} 💬
        </a>
      </span>
    </div>
    <div class="linha-detalhe"><span>📍 Cidade</span><span>${cliente?.cidade || '—'}</span></div>
    <div class="linha-detalhe"><span>💻 Dispositivo</span><span>${orcamento.dispositivo}</span></div>
    <div class="linha-detalhe">
      <span>🏷️ Marca/Modelo</span>
      <span>${[orcamento.marca, orcamento.modelo].filter(Boolean).join(' ') || '—'}</span>
    </div>
    <div class="linha-detalhe">
      <span>🔧 Serviços</span>
      <span>${(orcamento.servicos || []).join(', ')}</span>
    </div>
    <div class="linha-detalhe">
      <span>⚠️ Problema</span>
      <span style="max-width:200px;text-align:right">${orcamento.problema}</span>
    </div>
    <div class="linha-detalhe"><span>⏱️ Urgência</span><span>${formatarUrgencia(orcamento.urgencia)}</span></div>
    <div class="linha-detalhe"><span>👨‍🔧 Técnico</span><span>${orcamento.tecnico}</span></div>
    <div class="linha-detalhe"><span>📌 Status</span><span>${formatarBadgeStatus(orcamento.status)}</span></div>
    <div class="linha-detalhe"><span>📅 Recebido</span><span>${formatarData(orcamento.criado_em)}</span></div>
    ${orcamento.observacoes
      ? `<div class="linha-detalhe">
           <span>📝 Obs.</span>
           <span style="max-width:200px;text-align:right;color:var(--suave)">${orcamento.observacoes}</span>
         </div>`
      : ''}
  `;

  /* Observações — todos veem, mas só o dono pode editar */
  const areaObs = document.getElementById('area-observacoes-modal');
  const campoObs = document.getElementById('campo-observacoes');
  areaObs.style.display   = 'block';
  campoObs.value          = orcamento.observacoes || '';
  campoObs.disabled       = !ehMeuOrc;
  campoObs.style.opacity  = ehMeuOrc ? '1' : '0.6';
  campoObs.style.cursor   = ehMeuOrc ? 'text' : 'not-allowed';

  /* Aviso de bloqueio para o outro técnico */
  const avisoLock = document.getElementById('aviso-outro-tecnico');
  avisoLock.style.display = (!ehMeuOrc && tecnicoLogado) ? 'block' : 'none';
  if (!ehMeuOrc && tecnicoLogado) {
    document.getElementById('nome-tecnico-responsavel').textContent = orcamento.tecnico;
  }

  /* Botões de status — só o dono, e só se já não for novo */
  document.getElementById('botoes-mudar-status').style.display = (ehMeuOrc && !ehNovo) ? 'flex' : 'none';

  /* Botão aceitar — só aparece para orçamentos novos do técnico logado */
  document.getElementById('area-botao-aceitar').style.display = (ehMeuOrc && ehNovo) ? 'block' : 'none';

  /* Renderiza a galeria de anexos */
  const anexos     = Array.isArray(orcamento.anexos) ? orcamento.anexos.filter(Boolean) : [];
  const areaAnexos = document.getElementById('area-anexos-modal');
  const galeria    = document.getElementById('galeria-modal');

  if (anexos.length > 0) {
    areaAnexos.style.display = 'block';
    window._urlsAnexosAtivos = anexos;

    galeria.innerHTML = anexos.map((url, i) => {
      const ehVideo = /\.mp4|mov|avi|quicktime/i.test(url);
      return ehVideo
        ? `<div class="item-anexo" onclick="abrirLightbox(${i})">
             <video src="${url}" muted preload="metadata"
                    style="width:100%;height:100%;object-fit:cover"></video>
             <span class="badge-video">▶ vídeo</span>
           </div>`
        : `<div class="item-anexo" onclick="abrirLightbox(${i})">
             <img src="${url}" alt="foto ${i+1}" loading="lazy"
                  style="width:100%;height:100%;object-fit:cover"/>
           </div>`;
    }).join('');
  } else {
    areaAnexos.style.display = 'none';
    galeria.innerHTML = '';
  }

  /* Abre o modal */
  document.getElementById('modal-detalhes').classList.add('aberto');
}

/**
 * Fecha o modal de detalhes.
 */
function fecharDetalhes() {
  document.getElementById('modal-detalhes').classList.remove('aberto');
}

/**
 * Aceita o orçamento que está aberto no modal.
 */
function aceitarOrcamentoDoModal() {
  if (!orcamentoAtivo) return;
  fecharDetalhes();
  aceitarOrcamento(orcamentoAtivo);
}

/**
 * Muda o status do orçamento ativo no modal.
 * @param {string} novoStatus - Novo status ('em_andamento', 'concluido', 'cancelado')
 */
async function mudarStatusOrcamento(novoStatus) {
  if (!orcamentoAtivo) return;
  const observacoes = document.getElementById('campo-observacoes').value;
  await atualizarDados('orcamentos', orcamentoAtivo.id, { status: novoStatus, observacoes });
  exibirToast('✅ Status atualizado!', 'sucesso');
  fecharDetalhes();
  orcamentos = await buscarDados('orcamentos', 'order=criado_em.desc');
  renderizarOrcamentos();
  renderizarDashboard();
}

/* ================================================================
   LIGHTBOX (visualização de fotos e vídeos em tela cheia)
================================================================ */

/**
 * Abre o lightbox na imagem ou vídeo do índice informado.
 * @param {number} indice - Posição do arquivo na lista de anexos
 */
function abrirLightbox(indice) {
  urlsLightbox    = window._urlsAnexosAtivos || [];
  indicesLightbox = indice;
  renderizarLightbox();
  document.getElementById('lightbox').classList.add('aberto');
  document.getElementById('nav-lightbox').style.display = urlsLightbox.length > 1 ? 'flex' : 'none';
}

/**
 * Fecha o lightbox e limpa o conteúdo.
 */
function fecharLightbox() {
  document.getElementById('lightbox').classList.remove('aberto');
  document.getElementById('midia-lightbox').innerHTML = '';
}

/**
 * Navega para o próximo ou anterior item no lightbox.
 * @param {number} direcao - +1 para próximo, -1 para anterior
 */
function navegarLightbox(direcao) {
  indicesLightbox = (indicesLightbox + direcao + urlsLightbox.length) % urlsLightbox.length;
  renderizarLightbox();
}

/**
 * Renderiza a mídia atual no lightbox (foto ou vídeo).
 */
function renderizarLightbox() {
  const url     = urlsLightbox[indicesLightbox];
  const ehVideo = /\.mp4|mov|avi|quicktime/i.test(url);

  document.getElementById('midia-lightbox').innerHTML = ehVideo
    ? `<video src="${url}" controls autoplay
              style="max-width:92vw;max-height:85vh;border-radius:12px"></video>`
    : `<img src="${url}" alt="anexo"/>`;

  document.getElementById('contador-lightbox').textContent = urlsLightbox.length > 1
    ? `${indicesLightbox + 1} / ${urlsLightbox.length}`
    : '';
}

/* ================================================================
   FUNÇÕES AUXILIARES (HELPERS)
================================================================ */

/**
 * Gera o HTML de um badge colorido para o status do orçamento/serviço.
 * @param {string} status - Status do registro
 * @returns {string} HTML do badge
 */
function formatarBadgeStatus(status) {
  const classes = {
    novo:          'badge-novo',
    em_andamento:  'badge-andamento',
    concluido:     'badge-concluido',
    cancelado:     'badge-cancelado'
  };
  const textos = {
    novo:          'Novo',
    em_andamento:  'Em andamento',
    concluido:     'Concluído',
    cancelado:     'Cancelado'
  };
  return `<span class="badge ${classes[status] || ''}">${textos[status] || status}</span>`;
}

/**
 * Gera o HTML colorido para o nível de urgência.
 * @param {string} urgencia - Nível de urgência
 * @returns {string} HTML com a classe de cor correta
 */
function formatarUrgencia(urgencia) {
  if (!urgencia) return '—';
  const classes = {
    'Urgente':      'urgente',
    'Esta semana':  'esta-semana',
    'Sem pressa':   'sem-pressa'
  };
  return `<span class="${classes[urgencia] || ''}">${urgencia}</span>`;
}

/**
 * Formata uma data ISO para o formato brasileiro (dd/mm/aa hh:mm).
 * @param {string} iso - Data em formato ISO
 * @returns {string} Data formatada
 */
function formatarData(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', {
    day:    '2-digit',
    month:  '2-digit',
    year:   '2-digit',
    hour:   '2-digit',
    minute: '2-digit'
  });
}

/**
 * Formata um número de WhatsApp para o padrão (xx) xxxxx-xxxx.
 * @param {string} numero - Número bruto
 * @returns {string} Número formatado
 */
function formatarWhatsApp(numero) {
  const digitos = (numero || '').replace(/\D/g, '');
  if (digitos.length === 11) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  }
  return numero || '—';
}

/**
 * Gera o HTML de uma linha de tabela "vazia" com mensagem.
 * @param {string} mensagem - Texto a exibir
 * @returns {string} HTML da linha vazia
 */
function criarLinhaVazia(mensagem) {
  return `<tr>
    <td colspan="20">
      <div class="estado-vazio">
        <div class="icone-vazio">📭</div>
        <p>${mensagem}</p>
      </div>
    </td>
  </tr>`;
}

/**
 * Exibe uma notificação temporária (toast) na tela.
 * @param {string} mensagem - Texto da notificação
 * @param {string} tipo     - 'sucesso' ou 'erro'
 */
function exibirToast(mensagem, tipo) {
  const el = document.getElementById('toast');
  el.textContent = mensagem;
  el.className   = `toast ${tipo} visivel`;
  setTimeout(() => el.classList.remove('visivel'), 3500);
}

/* ================================================================
   EVENTOS DO TECLADO
================================================================ */

/* Fecha o modal e o lightbox ao pressionar ESC */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    fecharDetalhes();
    fecharLightbox();
  }
});
