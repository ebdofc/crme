import { supabase } from "../supabase.js";
import { carregarAcessoCPO } from "./ciclos-permissoes.js";
import { criarInterfaceDAP } from "./ciclos-dap.js";
/* CRME — Ciclo de Promoções | Produção (Supabase RPC) */
const $ = id => document.getElementById(id);
let interfaceDAP = null;
const state = {
    tab:'indicacoes', detail:null, confirmation:null,
    newDate:'', discordId:'', justification:'', lookup:false,
    acesso:null, carregandoAcesso:true, erroAcesso:'',
    ciclo:null, carregandoCiclo:true, erroCiclo:'', abrindoCiclo:false,
    listaIndicacoes:null, carregandoIndicacoes:false, erroIndicacoes:'',
    indicacoesPesquisa:'', indicacoesPagina:1, indicacoesVersao:0,
    indicadoConsultado:null, consultandoIndicado:false, registrandoIndicacao:false,
    aceCategory:'pendentes', listaDeliberacoes:null, carregandoDeliberacoes:false, erroDeliberacoes:'',
    deliberacoesPesquisa:'', deliberacoesPagina:1, deliberacoesVersao:0,
    deliberacaoDetalhe:null, deliberacaoErro:'', carregandoDetalhe:false,
    votoEscolhido:'', registrandoVoto:false, decisaoEscolhida:'', registrandoDecisao:false,
    homologacao:null, carregandoHomologacao:false, erroHomologacao:'', homologando:false,
    alterandoCalendario:false, cancelandoCiclo:false, motivoCancelamentoReal:''
};
function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    })[ch]);
}
function caps(label) { return `<span class="cpo-mini-label">${esc(label)}</span>`; }
function status(label, type='') { return `<span class="cpo-status ${type}">${esc(label)}</span>`; }
function button(label, action, options={}) {
    return `<button type="button" class="cpo-btn ${options.secondary?'cpo-btn-secondary':''} ${options.danger?'cpo-btn-danger':''} ${options.small?'cpo-btn-small':''}" data-action="${esc(action)}" ${options.disabled?'disabled':''} ${options.arg?`data-arg="${esc(options.arg)}"`:''}>${esc(label)}</button>`;
}
function note(text) { return `<p class="cpo-inline-note">${esc(text)}</p>`; }
function permissaoReal(chave) {
    return Boolean(state.acesso?.permissoes?.[chave]);
}
function isAdmin() { return permissaoReal('presidenciaACE'); }
function isDirector() { return permissaoReal('diretorDAP'); }
function canDAP() { return permissaoReal('consultarDAP'); }
function canACE() { return permissaoReal('consultarACE'); }
function canNominate() { return permissaoReal('indicar'); }
function canVote() { return permissaoReal('votarACE'); }
function temAuditoria() { return permissaoReal('auditar'); }
function activeTabs() {
    return [
        ['indicacoes','Indicações'],
        ...(canDAP()?[['avaliacoes','Avaliações']]:[]),
        ...(canACE()?[['deliberacoes','Deliberações']]:[]),
        ...((isAdmin()||temAuditoria())?[['gerenciamento','Gerenciamento']]:[])
    ];
}
function feedback(text='',type='') {
    const node=$('cpo-feedback');
    node.hidden=!text;
    node.textContent=text;
    node.className=`cpo-feedback ${type}`;
}
function hojeBrasilia() {
    const partes=new Intl.DateTimeFormat('en-US', {timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const pegar=tipo=>partes.find(p=>p.type===tipo)?.value;
    return `${pegar('year')}-${pegar('month')}-${pegar('day')}`;
}
function adicionarDias(data,dias) {
    const dt=new Date(`${data}T12:00:00Z`);
    dt.setUTCDate(dt.getUTCDate()+dias);
    return dt.toISOString().slice(0,10);
}
function formatarDataCivil(data) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data||''))) return '—';
    const [ano,mes,dia]=data.split('-');
    return `${dia}/${mes}/${ano}`;
}
function podeAbrirCicloReal() {
    return permissaoReal('presidenciaACE') && !state.carregandoAcesso &&
        !state.erroAcesso && !state.carregandoCiclo && !state.erroCiclo &&
        (!state.ciclo?.tem_ciclo || ['encerrado','cancelado'].includes(state.ciclo.status));
}
function abrirFormularioCicloReal() {
    if (!podeAbrirCicloReal() || state.abrindoCiclo) return;
    state.newDate=adicionarDias(hojeBrasilia(),8);
    state.detail='new-cycle';
    feedback();
    renderMain();
}
function confirmarAberturaReal() {
    if (!podeAbrirCicloReal() || state.abrindoCiclo) return;
    const data=state.newDate;
    const minima=adicionarDias(hojeBrasilia(),8);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data<minima) {
        feedback(`A data prevista deve ser igual ou posterior a ${formatarDataCivil(minima)}.`, 'error');
        return;
    }
    const cicloAnterior=Boolean(state.ciclo?.tem_ciclo);
    const descricao=`Homologação prevista para ${formatarDataCivil(data)}. Indicações até ${formatarDataCivil(adicionarDias(data,-7))}, avaliações até ${formatarDataCivil(adicionarDias(data,-3))} e votação até ${formatarDataCivil(adicionarDias(data,-1))} (23h59, horário de Brasília).`+
        (cicloAnterior?' ATENÇÃO: todos os dados operacionais do ciclo anterior serão excluídos definitivamente. Os históricos militares e as notícias serão preservados.':' Esta abertura é definitiva e receberá numeração automática.');
    state.confirmation=async()=>{
        if (state.abrindoCiclo || !podeAbrirCicloReal()) return;
        state.abrindoCiclo=true;
        feedback('Abrindo o ciclo no Supabase...');
        renderMain();
        try {
            const {data:resultado,error}=await supabase.rpc('cpo_abrir_ciclo',{
                p_homologacao_prevista:data,
                p_confirmar_abertura:true,
                p_confirmar_exclusao:cicloAnterior
            });
            if (error) throw new Error(error.message||'Erro na abertura do ciclo.');
            if (resultado?.sucesso!==true) throw new Error('O Supabase não confirmou a abertura do ciclo.');
            state.detail=null;
            state.tab='indicacoes';
            await consultarCicloAtual();
            await carregarIndicacoesReais();
            feedback(`${resultado.identificacao||'Ciclo'} aberto com sucesso.`, 'success');
        } catch (erro) {
            console.error('Erro ao abrir CPO:',erro);
            feedback(erro.message||'Não foi possível abrir o ciclo.','error');
        } finally {
            state.abrindoCiclo=false;
            render();
        }
    };
    $('cpo-confirm-title').textContent='Confirmar abertura do CPO';
    $('cpo-confirm-description').textContent=descricao;
    $('cpo-confirm-submit').textContent=cicloAnterior?'Excluir dados anteriores e abrir ciclo':'Confirmar abertura do ciclo';
    $('cpo-confirm-dialog').showModal();
}
function renderNovoCicloReal() {
    const min=adicionarDias(hojeBrasilia(),8);
    const data=state.newDate;
    const dataValida=/^\d{4}-\d{2}-\d{2}$/.test(data) && data>=min;
    const antigo=Boolean(state.ciclo?.tem_ciclo);
    const previewPrazos=dataValida?`<div class="cpo-summary-grid">
       <div class="cpo-summary-field">${caps('Indicações até')}<strong>${esc(formatarDataCivil(adicionarDias(data,-7)))} · 23h59</strong></div>
       <div class="cpo-summary-field">${caps('Avaliações até')}<strong>${esc(formatarDataCivil(adicionarDias(data,-3)))} · 23h59</strong></div>
       <div class="cpo-summary-field">${caps('Votações até')}<strong>${esc(formatarDataCivil(adicionarDias(data,-1)))} · 23h59</strong></div>
    </div>`:note(`Escolha uma data a partir de ${formatarDataCivil(min)}.`);
    return `<div class="cpo-detail">${detailHead('Abrir novo ciclo','Presidência do Alto-Comando do Exército')}
       <div class="cpo-field"><label for="cpo-new-date">Data prevista de homologação</label>
         <input type="date" id="cpo-new-date" min="${esc(min)}" value="${esc(data)}" ${state.abrindoCiclo?'disabled':''}></div>
       ${previewPrazos}
       <div class="cpo-text-box">${antigo?'Ao abrir o próximo ciclo, todas as indicações, avaliações e deliberações do ciclo encerrado ou cancelado serão apagadas permanentemente. As publicações e os históricos militares permanecem preservados.':'A numeração do CPO será atribuída automaticamente pelo Supabase. O ciclo iniciará com indicações abertas.'}</div>
       <div class="cpo-actions">${button(state.abrindoCiclo?'Abrindo ciclo...':'Prosseguir para confirmação','confirm-open',{disabled:state.abrindoCiclo||!dataValida})}</div>
    </div>`;
}
function renderSummary() {
        if (state.carregandoAcesso) {
            $('cpo-cycle-summary').innerHTML='<div class="cpo-empty"><h3>Verificando acesso...</h3><p>Consultando o militar autenticado no CRME.</p></div>';
            return;
        }
        if (state.erroAcesso || !state.acesso) {
            $('cpo-cycle-summary').innerHTML=`<div class="cpo-empty"><h3>Acesso não verificado</h3><p>${esc(state.erroAcesso || 'Não foi possível identificar o militar.')}</p></div>`;
            return;
        }
        if (state.carregandoCiclo) {
            $('cpo-cycle-summary').innerHTML='<div class="cpo-empty"><h3>Consultando ciclo atual...</h3><p>Carregando o calendário oficial do Supabase.</p></div>';
            return;
        }
        if (state.erroCiclo) {
            $('cpo-cycle-summary').innerHTML=`<div class="cpo-empty"><h3>Falha ao consultar o CPO</h3><p>${esc(state.erroCiclo)}</p></div>`;
            return;
        }
        const ciclo=state.ciclo;
        if (!ciclo?.tem_ciclo) {
            $('cpo-cycle-summary').innerHTML=`<div class="cpo-empty"><h3>Nenhum ciclo de promoção em andamento</h3><p>Aguarde a abertura de um novo CPO pela Presidência do Alto-Comando do Exército.</p>${podeAbrirCicloReal()?`<div class="cpo-actions" style="justify-content:center;margin-top:15px">${button('Abrir novo ciclo','new-cycle')}</div>`:''}</div>`;
            return;
        }
        const tituloStatus={
            indicacoes_abertas:'Indicações abertas',em_avaliacao:'Em avaliação',
            em_deliberacao:'Em deliberação',aguardando_homologacao:'Aguardando homologação',
            homologado:'Homologado',encerrado:'Encerrado',cancelado:'Cancelado'
        }[ciclo.status] || 'Situação não identificada';
        const formato=(data)=>{
            if (!data || !/^\d{4}-\d{2}-\d{2}/.test(String(data))) return '—';
            const [,ano,mes,dia]=String(data).match(/^(\d{4})-(\d{2})-(\d{2})/) || [];
            return ano?`${dia}/${mes}/${ano}`:'—';
        };
        const dataAbertura=ciclo.aberto_em?new Intl.DateTimeFormat('pt-BR',{
            day:'2-digit',month:'2-digit',year:'numeric',timeZone:'America/Sao_Paulo'
        }).format(new Date(ciclo.aberto_em)):'—';
        const campos=[
            ['Abertura',dataAbertura],
            ['Indicações até',`${formato(ciclo.prazo_indicacoes)} · 23h59`],
            ['Avaliações até',`${formato(ciclo.prazo_avaliacoes)} · 23h59`],
            ['Votações até',`${formato(ciclo.prazo_votacao)} · 23h59`],
            ['Homologação prevista',formato(ciclo.homologacao_prevista)]
        ];
        const passos=[
            ['Indicações',ciclo.prazo_indicacoes],
            ['Avaliações',ciclo.prazo_avaliacoes],
            ['Deliberações',ciclo.prazo_votacao],
            ['Homologação',ciclo.homologacao_prevista]
        ];
        const ordem={indicacoes_abertas:0,em_avaliacao:1,em_deliberacao:2,aguardando_homologacao:3,homologado:4,encerrado:4,cancelado:-1};
        const atual=ordem[ciclo.status] ?? -1;
        const campoHTML=campos.map(([rotulo,valor])=>`<div class="cpo-summary-field">${caps(rotulo)}<strong>${esc(valor)}</strong></div>`).join('');
        const progresso=passos.map(([rotulo,data],indice)=>`<div class="cpo-timeline-step ${atual>indice?'done':atual===indice?'current':''}"><div class="cpo-step-dot">${atual>indice?'✓':indice+1}</div><span>${esc(rotulo)}</span><small>${esc(formato(data))}</small></div>`).join('');
        $('cpo-cycle-summary').innerHTML=`<section class="cpo-cycle-card" aria-label="Informações oficiais do ciclo atual">
            <div class="cpo-cycle-header"><div>${caps('Ciclo atual')}<strong>${esc(ciclo.identificacao || 'CPO')}</strong></div>
            ${status(tituloStatus,['homologado','encerrado'].includes(ciclo.status)?'success':ciclo.status==='cancelado'?'danger':ciclo.status==='aguardando_homologacao'?'warning':'')}</div>
            <div class="cpo-summary-grid">${campoHTML}</div>
            <div class="cpo-timeline">${progresso}</div>
            ${ciclo.status==='cancelado'?note('Este ciclo foi cancelado.'):''}
            ${podeAbrirCicloReal()?`<div class="cpo-actions" style="margin-top:16px">${button('Abrir novo ciclo','new-cycle')}</div>`:''}
            ${ciclo.noticia_id?`<div class="cpo-actions" style="margin-top:16px;justify-content:flex-start"><a class="cpo-btn cpo-btn-secondary" href="noticias.html">Consultar publicação oficial nas Notícias</a></div>`:''}
        </section>`;
        return;
}
function renderTabs() {
    const menu=$('cpo-main-tabs');
    const visible=Boolean(state.acesso) && !state.carregandoAcesso && !state.erroAcesso && !state.carregandoCiclo && !state.erroCiclo && Boolean(state.ciclo?.tem_ciclo);
    menu.hidden=!visible;
    if (!visible) { menu.replaceChildren(); return; }
    if (!activeTabs().some(([id])=>id===state.tab)) state.tab='indicacoes';
    menu.innerHTML=activeTabs().map(([id,label])=>`<button type="button" class="cpo-tab ${state.tab===id?'active':''}" data-action="tab" data-arg="${id}" aria-current="${state.tab===id?'page':'false'}">${label}</button>`).join('');
}
function sectionHeading(title,subtitle,actionHTML='') {
    return `<div class="cpo-area-heading"><div><h3>${esc(title)}</h3><p>${esc(subtitle)}</p></div>${actionHTML}</div>`;
}
function indicators(data) {
    return `<div class="cpo-indicators">${data.map(([label,value,foot])=>`<div class="cpo-indicator"><span>${esc(label)}</span><strong>${esc(value)}</strong>${foot?`<p class="cpo-help">${esc(foot)}</p>`:''}</div>`).join('')}</div>`;
}
function renderCategories(categories,current,action,counts) {
    return `<nav class="cpo-categories" aria-label="Categorias">${categories.map(([id,label])=>`<button type="button" class="cpo-category ${current===id?'active':''}" data-action="${action}" data-arg="${id}">${esc(label)}${counts?.[id]!=null?` (${counts[id]})`:''}</button>`).join('')}</nav>`;
}
function indicacoesAbertasReais() {
    if (!state.ciclo?.tem_ciclo || !canNominate()) return false;
    if (['homologado','encerrado','cancelado','aguardando_homologacao'].includes(state.ciclo.status)) return false;
    return hojeBrasilia() <= String(state.ciclo.prazo_indicacoes || '');
}
async function carregarIndicacoesReais() {
    if (!state.ciclo?.tem_ciclo || !state.acesso) return;
    const versao=++state.indicacoesVersao;
    state.carregandoIndicacoes=true;
    state.erroIndicacoes='';
    if (state.tab==='indicacoes' && !state.detail) renderMain();
    try {
        const {data,error}=await supabase.rpc('cpo_listar_indicacoes',{
            p_pagina:state.indicacoesPagina,
            p_pesquisa:state.indicacoesPesquisa
        });
        if (error) throw new Error(error.message || 'Não foi possível listar as indicações.');
        if (!data || !Array.isArray(data.indicacoes)) throw new Error('Resposta inválida da listagem de indicações.');
        if (versao!==state.indicacoesVersao) return;
        state.listaIndicacoes=data;
    } catch(e) {
        if (versao!==state.indicacoesVersao) return;
        state.erroIndicacoes=e.message || 'Erro ao consultar as indicações.';
    } finally {
        if (versao===state.indicacoesVersao) {
            state.carregandoIndicacoes=false;
            if (state.tab==='indicacoes' && !state.detail) renderMain();
        }
    }
}
function renderIndicacoesReais() {
    const nova=indicacoesAbertasReais()?button('Nova indicação','open-nomination'):'';
    const cab=sectionHeading('Indicações','Lista pública dos oficiais indicados para o CPO atual.',nova);
    const lista=state.listaIndicacoes;
    const linhas=lista?.indicacoes || [];
    const registros=linhas.map(x=>`<tr><td><span class="cpo-row-name">${esc(x.nome)}</span></td><td>${esc(x.status)}</td></tr>`).join('');
    const corpo=state.carregandoIndicacoes?'Consultando indicações...':state.erroIndicacoes?`Erro: ${state.erroIndicacoes}`:'Nenhum militar encontrado nesta categoria.';
    const paginas=Math.max(1,Number(lista?.total_paginas)||1);
    const pagina=Number(lista?.pagina)||state.indicacoesPagina;
    return `${cab}<div class="cpo-section-heading"><h4>Indicações do ciclo</h4><span>${Number(lista?.total)||0} registros</span></div>
      <div class="cpo-search"><label for="cpo-real-search" class="cpo-mini-label">Pesquisar pelo nome</label><input id="cpo-real-search" type="search" autocomplete="off" placeholder="Pesquisar militar pelo nome..." value="${esc(state.indicacoesPesquisa)}"></div>
      <div class="cpo-table-box"><table class="cpo-table cpo-public-table"><thead><tr><th scope="col">MILITAR INDICADO</th><th scope="col">SITUAÇÃO</th></tr></thead><tbody>
      ${registros || `<tr><td colspan="2" style="text-align:center;color:#666;padding:24px">${esc(corpo)}</td></tr>`}
      </tbody></table></div>
      <div class="cpo-pagination"><span>10 registros por página · ${Number(lista?.total)||0} encontrados</span><div class="cpo-pagination-buttons">
      ${button('Anterior','real-previous',{secondary:true,small:true,disabled:state.carregandoIndicacoes||pagina<=1})}
      <span>Página ${pagina} de ${paginas}</span>
      ${button('Próxima','real-next',{secondary:true,small:true,disabled:state.carregandoIndicacoes||pagina>=paginas})}</div></div>`;
}
async function carregarDeliberacoesReais() {
    if (!state.ciclo?.tem_ciclo || !canACE()) return;
    const versao=++state.deliberacoesVersao;
    state.carregandoDeliberacoes=true;
    state.erroDeliberacoes='';
    if (state.tab==='deliberacoes') renderMain();
    try {
        const {data,error}=await supabase.rpc('cpo_listar_deliberacoes',{
            p_categoria:state.aceCategory,
            p_pagina:state.deliberacoesPagina,
            p_pesquisa:state.deliberacoesPesquisa
        });
        if (error) throw new Error(error.message || 'Não foi possível listar as deliberações.');
        if (!data || !Array.isArray(data.deliberacoes)) throw new Error('Resposta inválida da listagem de deliberações.');
        if (versao!==state.deliberacoesVersao) return;
        state.listaDeliberacoes=data;
    } catch(e) {
        if (versao!==state.deliberacoesVersao) return;
        state.erroDeliberacoes=e.message || 'Falha na consulta de deliberações.';
        state.listaDeliberacoes=null;
    } finally {
        if (versao===state.deliberacoesVersao) {
            state.carregandoDeliberacoes=false;
            if (state.tab==='deliberacoes') renderMain();
        }
    }
}
function renderDeliberacoesReais() {
    const categorias=[['pendentes','Pendentes'],['votadas','Votadas'],['encerradas','Encerradas'],...(isAdmin()?[['desempates','Desempates']]:[])];
    if (!categorias.some(([id])=>id===state.aceCategory)) state.aceCategory='pendentes';
    const lista=state.listaDeliberacoes;
    const linhas=lista?.deliberacoes || [];
    const votos={favoravel:'Favorável',contrario:'Contrário',abstencao:'Abstenção'};
    const resultados=linhas.map(x=>{
        const contagem=x.contagem;
        const detalhe=contagem ? ` · ${Number(contagem.favoraveis)||0} favoráveis, ${Number(contagem.contrarios)||0} contrários, ${Number(contagem.abstencoes)||0} abstenções` : '';
        const situacao=x.aguardando_decisao_presidencia ? 'Aguardando decisão da Presidência' : x.resultado_deliberacao ? String(x.resultado_deliberacao).replaceAll('_',' ') : x.ja_votou ? 'Voto registrado' : x.votacao_aberta ? 'Aguardando voto' : 'Votação encerrada';
        return `<tr><td><span class="cpo-row-name">${esc(x.nome)}</span></td><td>${esc(x.patente_atual)} → ${esc(x.patente_pretendida)}</td><td>${x.media_dap==null?'—':esc(x.media_dap)}</td><td>${esc(situacao)}${x.meu_voto?`<div class="cpo-muted">Meu voto: ${esc(votos[x.meu_voto]||x.meu_voto)}</div>`:''}${contagem?`<div class="cpo-muted">${esc(detalhe.slice(3))}</div>`:''}</td><td>${button(x.aguardando_decisao_presidencia?'Decidir':x.pode_votar?'Consultar e votar':'Consultar','real-ace-open',{secondary:!x.aguardando_decisao_presidencia,small:true,arg:x.indicacao_id})}</td></tr>`;
    }).join('');
    const aviso=state.carregandoDeliberacoes?'Consultando deliberações...':state.erroDeliberacoes?`Erro: ${state.erroDeliberacoes}`:'Nenhuma deliberação nesta categoria.';
    const paginas=Math.max(1,Number(lista?.total_paginas)||1);
    const pagina=Number(lista?.pagina)||state.deliberacoesPagina;
    return `${sectionHeading('Deliberações','Alto-Comando do Exército — ACE')}
      ${renderCategories(categorias,state.aceCategory,'real-ace-category')}
      <div class="cpo-section-heading"><h4>${esc(categorias.find(([id])=>id===state.aceCategory)?.[1]||'Deliberações')}</h4><span>${Number(lista?.total)||0} registros</span></div>
      <div class="cpo-search"><label for="cpo-real-ace-search" class="cpo-mini-label">Pesquisar pelo nome</label><input id="cpo-real-ace-search" type="search" autocomplete="off" placeholder="Pesquisar militar pelo nome..." value="${esc(state.deliberacoesPesquisa)}"></div>
      <div class="cpo-table-box"><table class="cpo-table cpo-public-table"><thead><tr><th>MILITAR</th><th>PROMOÇÃO PROPOSTA</th><th>MÉDIA DAP</th><th>SITUAÇÃO</th><th>AÇÕES</th></tr></thead><tbody>${resultados||`<tr><td colspan="5" style="text-align:center;padding:24px">${esc(aviso)}</td></tr>`}</tbody></table></div>
      <div class="cpo-pagination"><span>10 registros por página · ${Number(lista?.total)||0} encontrados</span><div class="cpo-pagination-buttons">${button('Anterior','real-ace-previous',{secondary:true,small:true,disabled:state.carregandoDeliberacoes||pagina<=1})}<span>Página ${pagina} de ${paginas}</span>${button('Próxima','real-ace-next',{secondary:true,small:true,disabled:state.carregandoDeliberacoes||pagina>=paginas})}</div></div>`;
}
const rotuloVoto={favoravel:'Favorável',contrario:'Contrário',abstencao:'Abstenção'};
async function abrirDeliberacaoReal(id) {
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(id||'')) || !canACE()) return;
    state.detail='real-deliberation';state.deliberacaoDetalhe=null;
    state.deliberacaoErro='';state.votoEscolhido='';state.decisaoEscolhida='';state.carregandoDetalhe=true;
    renderMain();
    try {
        const {data,error}=await supabase.rpc('cpo_consultar_deliberacao',{p_indicacao_id:id});
        if(error) throw new Error(error.message);
        if(!data?.sucesso || data.indicacao_id!==id) throw new Error('Resposta inválida da consulta.');
        if(state.detail==='real-deliberation') state.deliberacaoDetalhe=data;
    } catch(e) {if(state.detail==='real-deliberation') state.deliberacaoErro=e.message||'Falha ao consultar deliberação.';}
    finally {state.carregandoDetalhe=false;if(state.detail==='real-deliberation') renderMain();}
}
function renderDeliberacaoDetalheReal() {
    const d=state.deliberacaoDetalhe, i=d?.dados_indicado||{}, a=d?.parecer_dap||{}, v=d?.meu_voto||{}, ap=d?.apuracao||{};
    if(state.carregandoDetalhe) return `<div class="cpo-detail">${detailHead('Deliberação','Consultando dados oficiais...')}</div>`;
    if(!d) return `<div class="cpo-detail">${detailHead('Deliberação')}<p>${esc(state.deliberacaoErro||'Não foi possível consultar a deliberação.')}</p></div>`;
    const data=x=>x?new Date(x).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—';
    const cont=ap.contagem;
    const exigeDecisao=state.aceCategory==='desempates' && isAdmin() && d.presidencia===true && d.deliberacao_encerrada===true && !ap.resultado_oficial &&
        ['empate','sem_votos_validos'].includes(ap.resultado_calculado);
    const decisaoAnterior=ap.decisao_presidencia;
    const tituloDecisao=ap.resultado_calculado==='empate'?'Empate entre votos válidos':'Ausência de votos válidos';
    const painelPresidencia=exigeDecisao ? `<section class="cpo-panel-card"><h4>Decisão extraordinária da Presidência</h4>
      <p><strong>Motivo:</strong> ${esc(tituloDecisao)}. A decisão é definitiva e não altera os votos individuais nem a patente do indicado.</p>
      ${state.registrandoDecisao?'<p>Registrando decisão da Presidência...</p>':`<div class="cpo-field"><label for="cpo-real-decision">Decisão</label>
      <select id="cpo-real-decision"><option value="">Selecione...</option>
      <option value="favoravel" ${state.decisaoEscolhida==='favoravel'?'selected':''}>Favorável</option>
      <option value="contrario" ${state.decisaoEscolhida==='contrario'?'selected':''}>Contrária</option></select></div>
      ${button('Prosseguir para confirmação','real-ace-decision',{disabled:!['favoravel','contrario'].includes(state.decisaoEscolhida)})}`}
      </section>` : '';
    const registroPresidencia=decisaoAnterior && typeof decisaoAnterior==='object' ? `<section class="cpo-panel-card"><h4>Decisão da Presidência</h4>
      <p><strong>Decisão:</strong> ${esc(rotuloVoto[decisaoAnterior.decisao]||decisaoAnterior.decisao||'—')}</p>
      <p><strong>Responsável:</strong> ${esc(decisaoAnterior.responsavel_nome||'—')} · <strong>Data:</strong> ${esc(data(decisaoAnterior.decidido_em))}</p></section>` : '';
    return `<div class="cpo-detail">${detailHead(i.nome||'Deliberação','Alto-Comando do Exército — ACE')}
      <section class="cpo-panel-card"><h4>Indicação</h4><div class="cpo-data-grid">
      <div>${caps('Patente atual')}<strong>${esc(i.patente_atual)}</strong></div><div>${caps('Patente pretendida')}<strong>${esc(i.patente_pretendida)}</strong></div>
      <div>${caps('Indicado por')}<strong>${esc(i.indicado_por||'—')}</strong></div><div>${caps('Prazo da votação')}<strong>${esc(d.prazo_votacao||'—')}</strong></div></div>
      <p><strong>Justificativa:</strong> ${esc(i.justificativa_indicacao||'—')}</p></section>
      <section class="cpo-panel-card"><h4>Parecer da DAP</h4><p><strong>Avaliador:</strong> ${esc(a.avaliador||'—')} · <strong>Validador:</strong> ${esc(a.validado_por||'—')}</p>
      <p><strong>Média:</strong> ${a.media==null?'—':esc(a.media)} · <strong>Recomendação:</strong> ${esc(a.recomendacao||'—')}</p>
      <p style="white-space:pre-wrap"><strong>Relatório:</strong> ${esc(a.relatorio||'—')}</p></section>
      <section class="cpo-panel-card"><h4>Votação</h4>
      ${v.ja_votou?`<p>${status('Voto registrado','success')} Seu voto: <strong>${esc(rotuloVoto[v.voto]||v.voto)}</strong> · ${esc(data(v.registrado_em))}</p>`:''}
      ${v.pode_votar&&!state.registrandoVoto?`<p>Selecione uma opção. O voto será definitivo após a confirmação.</p>
      <div class="cpo-field"><label for="cpo-real-vote">Seu voto</label><select id="cpo-real-vote"><option value="">Selecione...</option>${Object.entries(rotuloVoto).map(([k,l])=>`<option value="${k}" ${state.votoEscolhido===k?'selected':''}>${l}</option>`).join('')}</select></div>
      ${button('Prosseguir para confirmação','real-ace-vote',{disabled:!state.votoEscolhido})}`:''}
      ${state.registrandoVoto?'<p>Registrando voto...</p>':''}
      ${!v.pode_votar&&!v.ja_votou?'<p>Esta indicação não está disponível para seu voto.</p>':''}
      ${cont?`<p><strong>Contagem:</strong> ${Number(cont.favoraveis)||0} favoráveis · ${Number(cont.contrarios)||0} contrários · ${Number(cont.abstencoes)||0} abstenções</p>`:''}
      ${ap.resultado_calculado?`<p><strong>Resultado calculado:</strong> ${esc(ap.resultado_calculado)}</p>`:''}
      ${ap.resultado_oficial?`<p><strong>Resultado oficial:</strong> ${esc(ap.resultado_oficial)}</p>`:''}
      ${Array.isArray(ap.votos_identificados)?`<h4>Votos após encerramento</h4>${ap.votos_identificados.length?ap.votos_identificados.map(x=>`<p>${esc(x.eleitor_nome||'—')}: ${esc(rotuloVoto[x.voto]||x.voto)}</p>`).join(''):'<p>Nenhum voto registrado.</p>'}`:''}
      </section>${painelPresidencia}${registroPresidencia}</div>`;
}
function confirmarVotoReal() {
    const d=state.deliberacaoDetalhe,v=state.votoEscolhido;
    if(!d?.meu_voto?.pode_votar || !rotuloVoto[v] || state.registrandoVoto) return;
    state.confirmation=async()=>{
        state.registrandoVoto=true;renderMain();
        try {
            const {data,error}=await supabase.rpc('cpo_registrar_voto',{p_indicacao_id:d.indicacao_id,p_voto:v,p_confirmar:true});
            if(error) throw new Error(error.message);
            if(!data?.sucesso) throw new Error('O banco não confirmou o registro do voto.');
            feedback('Voto registrado com sucesso. O voto é irreversível.','success');
            state.listaDeliberacoes=null;
            await abrirDeliberacaoReal(d.indicacao_id);
            void carregarDeliberacoesReais();
        } catch(e) {feedback(e.message||'Não foi possível registrar o voto.','error');}
        finally {state.registrandoVoto=false;if(state.detail==='real-deliberation') renderMain();}
    };
    $('cpo-confirm-title').textContent='Confirmar voto irreversível';
    $('cpo-confirm-description').textContent=`Confirma o voto ${rotuloVoto[v]} para ${d.dados_indicado?.nome||'esta indicação'}? Depois de registrado, não poderá ser alterado.`;
    $('cpo-confirm-submit').textContent='Registrar voto definitivo';
    $('cpo-confirm-dialog').showModal();
}
function confirmarDecisaoPresidenciaReal() {
    const d=state.deliberacaoDetalhe, decisao=state.decisaoEscolhida;
    if(!d || state.aceCategory!=='desempates' || !isAdmin() || !d.presidencia || !d.deliberacao_encerrada || d.apuracao?.resultado_oficial ||
       !['empate','sem_votos_validos'].includes(d.apuracao?.resultado_calculado) ||
       !['favoravel','contrario'].includes(decisao) || state.registrandoDecisao) return;
    const id=d.indicacao_id;
    state.confirmation=async()=>{
        state.registrandoDecisao=true;renderMain();
        try {
            const {data,error}=await supabase.rpc('cpo_decisao_presidencia',{
                p_indicacao_id:id,p_decisao:decisao,p_confirmar:true
            });
            if(error) throw new Error(error.message);
            if(!data?.sucesso || data.indicacao_id!==id) throw new Error('O banco não confirmou a decisão da Presidência.');
            state.listaDeliberacoes=null;
            state.detail=null;
            state.deliberacaoDetalhe=null;
            state.deliberacoesPagina=1;
            await carregarDeliberacoesReais();
            feedback('Decisão extraordinária registrada. A indicação foi transferida para Encerradas e aguarda homologação.','success');
        } catch(e) {feedback(e.message||'Não foi possível registrar a decisão.','error');}
        finally {state.registrandoDecisao=false;if(state.detail==='real-deliberation') renderMain();}
    };
    $('cpo-confirm-title').textContent='Confirmar decisão extraordinária';
    $('cpo-confirm-description').textContent=`Confirma a decisão ${rotuloVoto[decisao]} para ${d.dados_indicado?.nome||'esta indicação'}? A decisão será definitiva, e o militar não será promovido automaticamente.`;
    $('cpo-confirm-submit').textContent='Registrar decisão definitiva';
    $('cpo-confirm-dialog').showModal();
}
function abrirIndicacaoReal() {
    if (!indicacoesAbertasReais()) return;
    state.detail='real-nomination';
    state.discordId='';
    state.justification='';
    state.indicadoConsultado=null;
    feedback();
    renderMain();
}
function renderFormularioIndicacaoReal() {
    const i=state.indicadoConsultado;
    const bloqueado=state.consultandoIndicado||state.registrandoIndicacao;
    return `<div class="cpo-detail">${detailHead('Nova indicação','Identifique o militar pelo ID do Discord e informe a justificativa.')}
       <div class="cpo-field"><label for="cpo-discord-id">ID do Discord</label>
       <div class="cpo-form-two"><input id="cpo-discord-id" type="text" inputmode="numeric" autocomplete="off" placeholder="Informe o ID do militar" maxlength="20" value="${esc(state.discordId)}" ${bloqueado?'disabled':''}>
       ${button(state.consultandoIndicado?'Consultando...':'Consultar','real-lookup',{secondary:true,disabled:bloqueado})}</div></div>
       ${i?`<section class="cpo-panel-card"><h4>Militar localizado</h4><div class="cpo-data-grid">
          <div>${caps('Nome')}<strong>${esc(i.nome)}</strong></div>
          <div>${caps('Situação')}<strong>${esc(i.status)}</strong></div>
          <div>${caps('Patente atual')}<strong>${esc(i.patente_atual)}</strong></div>
          <div>${caps('Patente pretendida')}<strong>${esc(i.proxima_patente)}</strong></div>
       </div></section>
       <div class="cpo-field"><label for="cpo-indication-reason">Justificativa da indicação</label>
       <textarea id="cpo-indication-reason" maxlength="5000" placeholder="Fundamente a indicação..." ${bloqueado?'disabled':''}>${esc(state.justification)}</textarea></div>
       <div class="cpo-actions">${button(state.registrandoIndicacao?'Registrando...':'Prosseguir para confirmação','real-submit-nomination',{disabled:bloqueado||!state.justification.trim()})}</div>`:''}
    </div>`;
}
async function consultarIndicadoReal() {
    if (!indicacoesAbertasReais() || state.consultandoIndicado || state.registrandoIndicacao) return;
    const id=state.discordId.trim();
    if (!/^\d{17,20}$/.test(id)) {feedback('Informe um ID Discord válido de 17 a 20 dígitos.','error');return;}
    state.consultandoIndicado=true;
    state.indicadoConsultado=null;
    feedback('Consultando registro militar...');
    renderMain();
    try {
        const {data,error}=await supabase.rpc('cpo_consultar_indicado',{p_discord_id:id});
        if (error) throw new Error(error.message || 'Consulta não permitida.');
        if (!data?.apto || data.discord_id!==id || data.ciclo_id!==state.ciclo?.ciclo_id) {
            throw new Error('A consulta não confirmou um militar elegível neste ciclo.');
        }
        state.indicadoConsultado=data;
        feedback('Militar localizado. Confira a patente e informe a justificativa.','success');
    } catch(e) {feedback(e.message,'error');}
    finally {state.consultandoIndicado=false;renderMain();}
}
function confirmarIndicacaoReal() {
    const i=state.indicadoConsultado;
    const justificativa=state.justification.trim();
    if (!indicacoesAbertasReais()||!i||state.registrandoIndicacao) return;
    if (!justificativa || justificativa.length>5000) {feedback('Informe uma justificativa de até 5.000 caracteres.','error');return;}
    state.confirmation=async()=>{
        if (state.registrandoIndicacao||!indicacoesAbertasReais()) return;
        state.registrandoIndicacao=true;
        feedback('Registrando indicação no Supabase...');
        renderMain();
        try {
            const {data,error}=await supabase.rpc('cpo_registrar_indicacao',{
                p_discord_id:i.discord_id,
                p_justificativa:justificativa,
                p_confirmar:true
            });
            if (error) throw new Error(error.message || 'O registro da indicação falhou.');
            if (data?.sucesso!==true) throw new Error('O banco não confirmou o registro da indicação.');
            state.detail=null;
            state.indicadoConsultado=null;
            state.discordId='';
            state.justification='';
            state.indicacoesPagina=1;
            await carregarIndicacoesReais();
            feedback(`Indicação de ${data.nome||i.nome} registrada com sucesso.`, 'success');
        } catch(e) {feedback(e.message,'error');}
        finally {state.registrandoIndicacao=false;render();}
    };
    $('cpo-confirm-title').textContent='Confirmar indicação';
    $('cpo-confirm-description').textContent=`Confirma a indicação de ${i.nome} (${i.patente_atual} → ${i.proxima_patente})? A justificativa será registrada definitivamente e não poderá ser editada.`;
    $('cpo-confirm-submit').textContent='Confirmar indicação';
    $('cpo-confirm-dialog').showModal();
}
async function carregarHomologacaoReal() {
    if (!isAdmin() || !state.ciclo?.tem_ciclo || state.carregandoHomologacao) return;
    state.carregandoHomologacao=true;
    state.erroHomologacao='';
    state.homologacao=null;
    renderMain();
    try {
        const {data,error}=await supabase.rpc('cpo_consultar_homologacao');
        if (error) throw new Error(error.message || 'Falha ao consultar a homologação.');
        if (!data || data.sucesso!==true || data.ciclo_id!==state.ciclo.ciclo_id || !Array.isArray(data.indicacoes))
            throw new Error('Resposta de homologação inválida ou referente a outro ciclo.');
        state.homologacao=data;
    } catch (erro) {
        state.erroHomologacao=erro.message || 'Falha ao consultar a homologação.';
    } finally {
        state.carregandoHomologacao=false;
        if (state.detail==='real-homologation') renderMain();
    }
}
function abrirHomologacaoReal() {
    if (!isAdmin() || !state.ciclo?.tem_ciclo) return;
    state.detail='real-homologation';
    feedback();
    void carregarHomologacaoReal();
}
function calendarioAlteravelReal() {
    return isAdmin() && Boolean(state.ciclo?.tem_ciclo) &&
        ['indicacoes_abertas','em_avaliacao','em_deliberacao','aguardando_homologacao'].includes(state.ciclo.status) &&
        !state.ciclo.homologado_em;
}
function dataMinimaCalendarioReal() {
    const abertura=String(state.ciclo?.aberto_em||'').slice(0,10);
    const hoje=hojeBrasilia();
    const minimoAbertura=/^\d{4}-\d{2}-\d{2}$/.test(abertura)?adicionarDias(abertura,8):adicionarDias(hoje,8);
    return [minimoAbertura,adicionarDias(hoje,7)].sort().at(-1);
}
function abrirCalendarioReal() {
    if (!calendarioAlteravelReal() || state.alterandoCalendario) return;
    state.newDate=state.ciclo.homologacao_prevista||dataMinimaCalendarioReal();
    state.detail='real-calendar';feedback();renderMain();
}
function renderCalendarioReal() {
    const min=dataMinimaCalendarioReal();
    const data=state.newDate;
    const valido=/^\d{4}-\d{2}-\d{2}$/.test(data) && data>=min && data!==state.ciclo?.homologacao_prevista;
    return `<div class="cpo-detail">${detailHead('Alterar calendário','Presidência do Alto-Comando do Exército')}
      <p>Homologação atualmente prevista: <strong>${esc(formatarDataCivil(state.ciclo?.homologacao_prevista))}</strong>.</p>
      <div class="cpo-field"><label for="cpo-calendar-date">Nova data prevista de homologação</label>
      <input id="cpo-calendar-date" type="date" min="${esc(min)}" value="${esc(data)}" ${state.alterandoCalendario?'disabled':''}></div>
      ${valido?`<div class="cpo-summary-grid">
      <div class="cpo-summary-field">${caps('Indicações até')}<strong>${esc(formatarDataCivil(adicionarDias(data,-7)))} · 23h59</strong></div>
      <div class="cpo-summary-field">${caps('Avaliações até')}<strong>${esc(formatarDataCivil(adicionarDias(data,-3)))} · 23h59</strong></div>
      <div class="cpo-summary-field">${caps('Votações até')}<strong>${esc(formatarDataCivil(adicionarDias(data,-1)))} · 23h59</strong></div></div>`:note(`Escolha uma nova data a partir de ${formatarDataCivil(min)}.`)}
      <div class="cpo-actions">${button(state.alterandoCalendario?'Salvando...':'Prosseguir para confirmação','real-calendar-confirm',{disabled:!valido||state.alterandoCalendario})}</div></div>`;
}
function confirmarCalendarioReal() {
    if (!calendarioAlteravelReal() || state.alterandoCalendario) return;
    const data=state.newDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data<dataMinimaCalendarioReal() || data===state.ciclo.homologacao_prevista) {
        feedback('Escolha uma nova data válida.','error');return;
    }
    state.confirmation=async()=>{
        if (!calendarioAlteravelReal() || state.alterandoCalendario) return;
        state.alterandoCalendario=true;renderMain();
        try {
            const {data:resultado,error}=await supabase.rpc('cpo_alterar_calendario',{
                p_homologacao_prevista:data,p_confirmar:true
            });
            if(error) throw new Error(error.message||'Falha ao alterar calendário.');
            if(resultado?.sucesso!==true || resultado.ciclo_id!==state.ciclo?.ciclo_id) throw new Error('Alteração não confirmada pelo Supabase.');
            state.detail=null;
            await consultarCicloAtual();
            feedback(`Calendário atualizado. Homologação prevista para ${formatarDataCivil(data)}.`,'success');
        } catch(e) {feedback(e.message||'Não foi possível alterar o calendário.','error');}
        finally {state.alterandoCalendario=false;render();}
    };
    $('cpo-confirm-title').textContent='Confirmar alteração do calendário';
    $('cpo-confirm-description').textContent=`Alterar a homologação de ${formatarDataCivil(state.ciclo.homologacao_prevista)} para ${formatarDataCivil(data)}? Novos prazos: indicações até ${formatarDataCivil(adicionarDias(data,-7))}, avaliações até ${formatarDataCivil(adicionarDias(data,-3))} e votações até ${formatarDataCivil(adicionarDias(data,-1))}. A alteração será registrada em seu nome.`;
    $('cpo-confirm-submit').textContent='Confirmar alteração';
    $('cpo-confirm-dialog').showModal();
}
function cicloCancelavelReal() {
    return isAdmin() && Boolean(state.ciclo?.tem_ciclo) &&
        ['indicacoes_abertas','em_avaliacao','em_deliberacao','aguardando_homologacao'].includes(state.ciclo.status) &&
        !state.ciclo.homologado_em;
}
function abrirCancelamentoReal() {
    if (!cicloCancelavelReal() || state.cancelandoCiclo) return;
    state.motivoCancelamentoReal='';state.detail='real-cancel';feedback();renderMain();
}
function renderCancelamentoReal() {
    const motivo=state.motivoCancelamentoReal;
    const valido=motivo.trim().length>=10 && motivo.trim().length<=2000;
    return `<div class="cpo-detail">${detailHead('Cancelar ciclo','Presidência do Alto-Comando do Exército')}
      <section class="cpo-panel-card"><h4>${esc(state.ciclo?.identificacao||'CPO atual')}</h4>
      <p>O cancelamento é definitivo e impede a homologação deste ciclo. As indicações, avaliações e deliberações permanecerão armazenadas até a abertura de um novo CPO. Históricos militares não serão apagados.</p></section>
      <div class="cpo-field"><label for="cpo-cancel-reason">Justificativa do cancelamento (10 a 2.000 caracteres)</label>
      <textarea id="cpo-cancel-reason" rows="5" maxlength="2000" ${state.cancelandoCiclo?'disabled':''}>${esc(motivo)}</textarea>
      <p class="cpo-muted" id="cpo-cancel-counter">${motivo.trim().length}/2000 caracteres</p></div>
      <div class="cpo-actions">${button(state.cancelandoCiclo?'Cancelando...':'Prosseguir para confirmação','real-cancel-confirm',{danger:true,disabled:!valido||state.cancelandoCiclo})}</div></div>`;
}
function confirmarCancelamentoReal() {
    if (!cicloCancelavelReal() || state.cancelandoCiclo) return;
    const motivo=state.motivoCancelamentoReal.trim();
    if(motivo.length<10 || motivo.length>2000){feedback('Informe uma justificativa de 10 a 2.000 caracteres.','error');return;}
    const cicloId=state.ciclo.ciclo_id;
    state.confirmation=async()=>{
        if (!cicloCancelavelReal() || state.cancelandoCiclo || state.ciclo?.ciclo_id!==cicloId) return;
        state.cancelandoCiclo=true;renderMain();
        try {
            const {data:resultado,error}=await supabase.rpc('cpo_cancelar_ciclo',{p_justificativa:motivo,p_confirmar:true});
            if(error) throw new Error(error.message||'Falha ao cancelar o ciclo.');
            if(resultado?.sucesso!==true || resultado.ciclo_id!==cicloId || resultado.status!=='cancelado') throw new Error('Cancelamento não confirmado pelo Supabase.');
            state.detail=null;state.motivoCancelamentoReal='';state.tab='gerenciamento';
            await consultarCicloAtual();
            feedback(`${resultado.identificacao||'CPO'} cancelado com sucesso.`,'success');
        } catch(e) {
            feedback(e.message||'Não foi possível cancelar o ciclo.','error');
            await consultarCicloAtual();
        } finally {state.cancelandoCiclo=false;render();}
    };
    $('cpo-confirm-title').textContent='Confirmar cancelamento definitivo';
    $('cpo-confirm-description').textContent=`Confirma o cancelamento definitivo de ${state.ciclo.identificacao||'este CPO'}? Justificativa: ${motivo}. Não será possível homologar este ciclo após o cancelamento.`;
    $('cpo-confirm-submit').textContent='Confirmar cancelamento do CPO';
    $('cpo-confirm-dialog').showModal();
}
function renderGerenciamentoReal() {
    const c=state.ciclo;
    const disponivel=Boolean(c?.tem_ciclo && isAdmin());
    return `${sectionHeading('Gerenciamento do Ciclo','Presidência do Alto-Comando do Exército')}
      <section class="cpo-panel-card"><h4>Homologação das promoções</h4>
      <p>Confira as indicações, os resultados e a aptidão dos militares antes de homologar. A conferência não altera registros.</p>
      ${button('Conferir homologação','real-homologation-open',{disabled:!disponivel})}</section>
      <section class="cpo-panel-card"><h4>Alteração do calendário</h4>
      <p>Homologação prevista: ${esc(formatarDataCivil(c?.homologacao_prevista))}. Os prazos das etapas serão recalculados automaticamente.</p>
      ${button('Alterar calendário','real-calendar-open',{secondary:true,disabled:!calendarioAlteravelReal()})}</section>
      <section class="cpo-panel-card"><h4>Cancelamento do ciclo</h4><p>Disponível somente antes da homologação. Exige justificativa e confirmação expressa.</p>${button('Cancelar ciclo','real-cancel-open',{danger:true,disabled:!cicloCancelavelReal()})}</section>`;
}
function renderHomologacaoReal() {
    const d=state.homologacao;
    if (state.carregandoHomologacao) return `<div class="cpo-detail">${detailHead('Conferência da homologação')}<p>Consultando os registros oficiais...</p></div>`;
    if (!d) return `<div class="cpo-detail">${detailHead('Conferência da homologação')}<p>${esc(state.erroHomologacao||'Consulta ainda não disponível.')}</p><div class="cpo-actions">${button('Tentar novamente','real-homologation-refresh',{secondary:true})}</div></div>`;
    const r=x=>Number(d[x])||0;
    const rotulos={aprovada:'Aprovada',rejeitada:'Rejeitada',aguardando_desempate:'Aguardando desempate',aguardando_decisao:'Aguardando decisão'};
    const linhas=d.indicacoes.map(i=>{
        const situacao=i.status_indicacao==='arquivada'?'Arquivada':rotulos[i.resultado_deliberacao]||'Pendente';
        const aptidao=i.resultado_deliberacao==='aprovada'?(i.apto_promocao?'Apto':'Inapto'):'—';
        return `<tr><td>${esc(i.nome||'Militar não localizado')}</td><td>${esc(i.patente_anterior||'—')} → ${esc(i.patente_pretendida||'—')}</td><td>${esc(situacao)}</td><td>${esc(aptidao)}</td></tr>`;
    }).join('');
    const liberado=d.pode_homologar===true && d.status==='aguardando_homologacao' && r('pendentes')===0 &&
        hojeBrasilia()>=String(d.homologacao_prevista||'') && state.ciclo?.ciclo_id===d.ciclo_id && !state.homologando;
    return `<div class="cpo-detail">${detailHead('Conferência para homologação',`CPO nº ${d.ciclo_numero||'—'}/${d.ciclo_ano||'—'}`)}
      ${indicators([['Indicações',r('total')],['Aprovadas',r('aprovadas')],['Rejeitadas',r('rejeitadas')],['Arquivadas',r('arquivadas')],['Pendentes',r('pendentes')],['Promoções aptas',r('aprovadas_aptas')],['Aprovadas inaptas',r('aprovadas_inaptas')]])}
      <div class="cpo-table-box"><table class="cpo-table"><thead><tr><th>MILITAR</th><th>PROMOÇÃO</th><th>DELIBERAÇÃO</th><th>APTIDÃO</th></tr></thead><tbody>${linhas||'<tr><td colspan="4">Nenhuma indicação neste ciclo.</td></tr>'}</tbody></table></div>
      ${!liberado?note('A homologação não está liberada. Verifique a data, o status do ciclo e as indicações pendentes.'):note('A conferência indica que o ciclo está apto. A homologação ainda será validada novamente pelo Supabase.')}
      <div class="cpo-actions">${button('Atualizar conferência','real-homologation-refresh',{secondary:true,disabled:state.homologando})}
      ${button(state.homologando?'Homologando...':'Homologar CPO','real-homologation-confirm',{disabled:!liberado})}</div></div>`;
}
function confirmarHomologacaoReal() {
    const d=state.homologacao;
    if (!isAdmin() || state.homologando || !d?.pode_homologar || d.pendentes!==0 ||
        d.status!=='aguardando_homologacao' || d.ciclo_id!==state.ciclo?.ciclo_id ||
        hojeBrasilia()<String(d.homologacao_prevista||'')) return;
    state.confirmation=async()=>{
        if (state.homologando || !isAdmin()) return;
        state.homologando=true;
        renderMain();
        try {
            const {data:atual,error:erroConsulta}=await supabase.rpc('cpo_consultar_homologacao');
            if (erroConsulta) throw new Error(erroConsulta.message);
            if (!atual?.pode_homologar || atual.ciclo_id!==d.ciclo_id || atual.pendentes!==0 ||
                atual.status!=='aguardando_homologacao') throw new Error('As condições do ciclo mudaram. Atualize a conferência.');
            const {data:resultado,error}=await supabase.rpc('cpo_homologar_promocoes',{p_confirmar:true});
            if (error) throw new Error(error.message||'A homologação falhou.');
            if (resultado?.sucesso!==true || resultado.ciclo_id!==d.ciclo_id) throw new Error('O Supabase não confirmou a homologação do ciclo. Consulte o status antes de tentar novamente.');
            state.detail=null;
            state.homologacao=null;
            await consultarCicloAtual();
            await carregarIndicacoesReais();
            feedback(`CPO homologado e encerrado. ${Number(resultado.promovidos)||0} promoção(ões) registrada(s); ${Number(resultado.aprovados_inaptos)||0} aprovado(s) inapto(s). Os cargos no Discord serão atualizados pela sincronização automática.`, 'success');
        } catch (erro) {
            feedback(erro.message||'Não foi possível homologar.','error');
            await consultarCicloAtual();
            if (state.detail==='real-homologation') await carregarHomologacaoReal();
        } finally {state.homologando=false;render();}
    };
    $('cpo-confirm-title').textContent='Confirmar homologação definitiva';
    $('cpo-confirm-description').textContent=`Homologar definitivamente o CPO nº ${d.ciclo_numero}/${d.ciclo_ano}? Serão processadas ${Number(d.aprovadas_aptas)||0} promoções aptas, com alterações de patentes e registros no histórico militar. Esta operação não poderá ser desfeita pela interface. O ciclo será encerrado imediatamente e os cargos no Discord serão atualizados pela sincronização automática.`;
    $('cpo-confirm-submit').textContent='Homologar definitivamente';
    $('cpo-confirm-dialog').showModal();
}
function renderMain() {
        if (state.detail==='real-cancel' && cicloCancelavelReal()) {
            $('cpo-main-panel').innerHTML=renderCancelamentoReal();
            return;
        }
        if (state.detail==='real-calendar' && calendarioAlteravelReal()) {
            $('cpo-main-panel').innerHTML=renderCalendarioReal();
            return;
        }
        if (state.detail==='real-homologation' && isAdmin()) {
            $('cpo-main-panel').innerHTML=renderHomologacaoReal();
            return;
        }
        if (state.detail==='real-deliberation') {
            $('cpo-main-panel').innerHTML=renderDeliberacaoDetalheReal();
            return;
        }
        if (state.detail==='real-nomination' && state.ciclo?.tem_ciclo) {
            $('cpo-main-panel').innerHTML=renderFormularioIndicacaoReal();
            return;
        }
        if (state.detail==='new-cycle' && podeAbrirCicloReal()) {
            $('cpo-main-panel').innerHTML=renderNovoCicloReal();
            return;
        }
        if (state.carregandoAcesso || state.erroAcesso || !state.acesso) {
            $('cpo-main-panel').replaceChildren();
            return;
        }
        const areas={
            indicacoes:['Indicações','Consulta pública das indicações do ciclo atual.'],
            avaliacoes:['Avaliações','Diretoria de Avaliação de Pessoal — DAP'],
            deliberacoes:['Deliberações','Alto-Comando do Exército — ACE'],
            gerenciamento:['Gerenciamento do Ciclo','Presidência do Alto-Comando do Exército']
        };
        if (state.carregandoCiclo || state.erroCiclo || !state.ciclo?.tem_ciclo) {
            $('cpo-main-panel').replaceChildren();
            return;
        }
        if (state.tab==='gerenciamento' && (isAdmin()||temAuditoria())) {
            $('cpo-main-panel').innerHTML=renderGerenciamentoReal();
            return;
        }
        if (state.tab==='indicacoes') {
            $('cpo-main-panel').innerHTML=renderIndicacoesReais();
            return;
        }
        if (state.tab==='avaliacoes' && canDAP()) {
            interfaceDAP?.render();
            return;
        }
        if (state.tab==='deliberacoes' && canACE()) {
            $('cpo-main-panel').innerHTML=renderDeliberacoesReais();
            return;
        }
        const area=areas[state.tab]||areas.indicacoes;
        $('cpo-main-panel').innerHTML=sectionHeading(...area)+
            `<div class="cpo-empty"><h3>Integração do CPO pendente</h3><p>Seu acesso a esta área foi reconhecido a partir dos vínculos oficiais.</p><p>O calendário acima é consultado diretamente do Supabase. As listas e operações desta área serão conectadas nas próximas etapas; não são apresentados registros fictícios.</p></div>`;
        return;
}
function render() {
    renderSummary();
    renderTabs();
    renderMain();
}
function detailHead(title,subtitle='') {
    return `<div class="cpo-detail-back">${button('← Voltar à lista','back',{secondary:true,small:true})}</div><div class="cpo-detail-heading"><h3>${esc(title)}</h3>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div>`;
}
function selectTab(id) {
    if (!activeTabs().some(([name])=>name===id)) return;
    state.tab=id;state.detail=null;feedback();render();
    if (id==='indicacoes') void carregarIndicacoesReais();
    if (id==='deliberacoes') void carregarDeliberacoesReais();
    if (id==='avaliacoes' && canDAP()) void interfaceDAP?.load({counts:true});
}
function action(name,arg) {
        if (name === 'tab') selectTab(arg);
        else if (name === 'new-cycle') abrirFormularioCicloReal();
        else if (name === 'confirm-open') confirmarAberturaReal();
        else if (name === 'real-calendar-open') abrirCalendarioReal();
        else if (name === 'real-calendar-confirm') confirmarCalendarioReal();
        else if (name === 'real-cancel-open') abrirCancelamentoReal();
        else if (name === 'real-cancel-confirm') confirmarCancelamentoReal();
        else if (name === 'real-homologation-open') abrirHomologacaoReal();
        else if (name === 'real-homologation-refresh') void carregarHomologacaoReal();
        else if (name === 'real-homologation-confirm') confirmarHomologacaoReal();
        else if (name === 'open-nomination') abrirIndicacaoReal();
        else if (name === 'real-lookup') void consultarIndicadoReal();
        else if (name === 'real-submit-nomination') confirmarIndicacaoReal();
        else if (name === 'real-previous') {state.indicacoesPagina=Math.max(1,state.indicacoesPagina-1);void carregarIndicacoesReais();}
        else if (name === 'real-next') {if (state.indicacoesPagina<(state.listaIndicacoes?.total_paginas||1)) {state.indicacoesPagina++;void carregarIndicacoesReais();}}
        else if (name === 'real-ace-open') void abrirDeliberacaoReal(arg);
        else if (name === 'real-ace-vote') confirmarVotoReal();
        else if (name === 'real-ace-decision') confirmarDecisaoPresidenciaReal();
        else if (name === 'real-ace-category' && ['pendentes','votadas','encerradas',...(isAdmin()?['desempates']:[])].includes(arg)) {state.aceCategory=arg;state.deliberacoesPagina=1;state.listaDeliberacoes=null;void carregarDeliberacoesReais();}
        else if (name === 'real-ace-previous') {state.deliberacoesPagina=Math.max(1,state.deliberacoesPagina-1);void carregarDeliberacoesReais();}
        else if (name === 'real-ace-next' && state.deliberacoesPagina<(state.listaDeliberacoes?.total_paginas||1)) {state.deliberacoesPagina++;void carregarDeliberacoesReais();}
        else if (name === 'back') {state.detail=null;feedback();render();if(state.tab==='deliberacoes') void carregarDeliberacoesReais();}
        return; // As demais operações exigem RPCs próprias ainda não implementadas.
}
async function consultarCicloAtual() {
    state.carregandoCiclo=true;
    state.erroCiclo='';
    state.ciclo=null;
    render();
    try {
        const {data,error}=await supabase.rpc('cpo_consultar_ciclo');
        if (error) throw new Error(error.message || 'Erro na consulta do ciclo.');
        if (!data || typeof data !== 'object' || typeof data.tem_ciclo !== 'boolean') {
            throw new Error('Resposta inválida ao consultar o ciclo atual.');
        }
        state.ciclo=data;
    } catch (erro) {
        console.error('Erro ao consultar ciclo CPO:',erro);
        state.erroCiclo=erro.message || 'Não foi possível consultar o ciclo atual.';
    } finally {
        state.carregandoCiclo=false;
        render();
    }
}
async function verificarAcesso() {
    state.carregandoAcesso=true;
    state.erroAcesso='';
    render();
    try {
        state.acesso=await carregarAcessoCPO(supabase);
        {
            await consultarCicloAtual();
            if (state.ciclo?.tem_ciclo) await carregarIndicacoesReais();
            if (state.ciclo?.tem_ciclo && state.tab==='avaliacoes' && canDAP()) void interfaceDAP?.load({counts:true});
        }
    } catch (erro) {
        console.error('Erro ao verificar funções CPO:', erro);
        state.acesso=null;
        state.erroAcesso=erro.message || 'Não foi possível consultar as permissões.';
    } finally {
        state.carregandoAcesso=false;
        render();
    }
}
let pesquisaIndicacoesTimer=null;
let pesquisaDeliberacoesTimer=null;
function init() {
    interfaceDAP = criarInterfaceDAP({
        supabase, painel: $('cpo-main-panel'),
        getAcesso: () => state.acesso,
        getCiclo: () => state.ciclo,
        isActive: () => state.tab === 'avaliacoes' && !state.detail && !state.carregandoCiclo && !state.erroCiclo && !!state.ciclo?.tem_ciclo,
        informar: feedback
    });
    if ($('cpo-preview-tools')) $('cpo-preview-tools').hidden=true;
    $('cpo-confirm-cancel').addEventListener('click',()=>{
        $('cpo-confirm-dialog').close();state.confirmation=null;
    });
    $('cpo-confirm-form').addEventListener('submit',event=>{
        event.preventDefault();
        const callback=state.confirmation;
        $('cpo-confirm-dialog').close();state.confirmation=null;
        if (typeof callback==='function') callback();
    });
    $('cpo-confirm-dialog').addEventListener('close',()=>{state.confirmation=null;});
    document.addEventListener('click',event=>{
        const target=event.target.closest('[data-action]');
        if (target&&!target.disabled) action(target.dataset.action,target.dataset.arg);
    });
    $('cpo-main-panel').addEventListener('input',event=>{
        const node=event.target;
        if (node.id==='cpo-real-search') {
            state.indicacoesPesquisa=node.value;state.indicacoesPagina=1;
            const seq=++state.indicacoesVersao;
            clearTimeout(pesquisaIndicacoesTimer);
            pesquisaIndicacoesTimer=setTimeout(()=>{
                if (seq===state.indicacoesVersao) void carregarIndicacoesReais();
            },300);
        }
        else if (node.id==='cpo-real-ace-search') {
            state.deliberacoesPesquisa=node.value;state.deliberacoesPagina=1;
            const seq=++state.deliberacoesVersao;
            clearTimeout(pesquisaDeliberacoesTimer);
            pesquisaDeliberacoesTimer=setTimeout(()=>{if(seq===state.deliberacoesVersao) void carregarDeliberacoesReais();},300);
        }
        else if (node.id==='cpo-discord-id') {
            state.discordId=node.value;
            if (state.detail==='real-nomination' && state.indicadoConsultado) {
                state.indicadoConsultado=null;state.justification='';
                renderMain();
                $('cpo-discord-id')?.focus();
            }
        }
        else if (node.id==='cpo-indication-reason') {
            state.justification=node.value;
            const b=document.querySelector('[data-action="submit-nomination"], [data-action="real-submit-nomination"]');
            if(b)b.disabled=!state.justification.trim();
        }
        else if (node.id==='cpo-cancel-reason') {
            state.motivoCancelamentoReal=node.value;
            const tamanho=node.value.trim().length;
            const contador=$('cpo-cancel-counter');if(contador)contador.textContent=`${tamanho}/2000 caracteres`;
            const botao=$('cpo-main-panel').querySelector('[data-action="real-cancel-confirm"]');
            if(botao)botao.disabled=tamanho<10||tamanho>2000||state.cancelandoCiclo;
        }
        else if (node.id==='cpo-calendar-date') {
            state.newDate=node.value;
            const botao=$('cpo-main-panel').querySelector('[data-action="real-calendar-confirm"]');
            if(botao)botao.disabled=!/^\d{4}-\d{2}-\d{2}$/.test(state.newDate)||state.newDate<dataMinimaCalendarioReal()||state.newDate===state.ciclo?.homologacao_prevista;
        }
        else if (node.id==='cpo-new-date') {
            state.newDate=node.value;
            {
                const minima=adicionarDias(hojeBrasilia(),8);
                const valida=/^\d{4}-\d{2}-\d{2}$/.test(state.newDate) && state.newDate>=minima;
                const botao=$('cpo-main-panel').querySelector('[data-action="confirm-open"]');
                if (botao) botao.disabled=!valida || state.abrindoCiclo;
            }
        }
    });
    $('cpo-main-panel').addEventListener('change',event=>{
        if(event.target.id==='cpo-real-vote') {state.votoEscolhido=event.target.value;renderMain();return;}
        if(event.target.id==='cpo-real-decision') {state.decisaoEscolhida=event.target.value;renderMain();return;}
        if (event.target.id==='cpo-calendar-date') {
            state.newDate=event.target.value;
            if(state.detail==='real-calendar')renderMain();
        }
        else if (event.target.id==='cpo-new-date') {
            state.newDate=event.target.value;
            if (state.detail==='new-cycle') renderMain();
        }
    });
    render();
    void verificarAcesso();
}
document.addEventListener('DOMContentLoaded',init);
