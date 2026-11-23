/* CRME — DAP: interface real, com todas as alterações via RPC autenticada. */
const CATS = [
  ['disponiveis','Disponíveis'], ['minhas','Minhas avaliações'],
  ['aguardando_validacao','Aguardando validação'], ['em_andamento','Em andamento'],
  ['finalizadas','Finalizadas'], ['arquivadas','Arquivadas']
];
const CRITERIOS = [
  ['assiduidade','Assiduidade'],['disciplina','Disciplina'],
  ['desempenho_funcional','Desempenho funcional'],['lideranca','Liderança'],
  ['conhecimento_institucional','Conhecimento institucional'],['comprometimento','Comprometimento']
];
const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate = value => { if (!value) return '—'; const s=String(value); const d=s.slice(0,10);return /^\d{4}-\d\d-\d\d$/.test(d)?`${d.slice(8,10)}/${d.slice(5,7)}/${d.slice(0,4)}`:'—'; };
const fmtTime = value => { if (!value) return '—'; const d=new Date(value); return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(d); };
const btn = (label, act, opts={}) => `<button type="button" class="cpo-btn ${opts.secondary?'cpo-btn-secondary':''} ${opts.danger?'cpo-btn-danger':''} ${opts.small?'cpo-btn-small':''}" data-dap-action="${e(act)}" ${opts.id?`data-id="${e(opts.id)}"`:''} ${opts.disabled?'disabled':''}>${e(label)}</button>`;
const field = (label,value) => `<div>${`<span class="cpo-mini-label">${e(label)}</span>`}<strong>${e(value??'—')}</strong></div>`;
const statusLabel = s => ({aguardando_avaliacao:'Aguardando avaliação',em_avaliacao:'Em avaliação',aguardando_validacao:'Aguardando validação',em_deliberacao:'Em deliberação',concluida:'Concluída',arquivada:'Arquivada'}[s] || s || '—');

const TIPOS_HISTORICO = {
  ingresso:'Alistamento', alistamento:'Alistamento', promocao:'Promoção',
  rebaixamento:'Rebaixamento', curso:'Curso', advertencia_escrita:'Advertência Escrita',
  advertencia:'Advertência', afastamento:'Afastamento', retorno:'Retorno',
  desligamento:'Desligamento'
};
const CURSOS_HISTORICO = {
  CIC:'Curso de Instrução de Cadetes', CPC:'Curso de Preparação de Cadetes'
};
const textoHistorico = value => String(value ?? '').trim() || '—';
const dataHistorico = h => {
  const dia = fmtDate(h.data);
  const criado = h.criado_em || h.registrado_em;
  if (!criado) return dia;
  const d = new Date(criado);
  if (Number.isNaN(d.getTime())) return dia;
  const horario = new Intl.DateTimeFormat('pt-BR', {
    timeZone:'America/Sao_Paulo', hour:'2-digit', minute:'2-digit', hour12:false
  }).format(d);
  return `${dia} às ${horario}`;
};
const detalheHistorico = h => {
  const tipo = String(h.tipo || '').toLowerCase();
  if (tipo === 'promocao' || tipo === 'rebaixamento') {
    const anterior = h.patente_anterior || h.patente_origem;
    const nova = h.nova_patente || h.patente_nova || h.patente_destino;
    return anterior && nova ? `${anterior} → ${nova}` : '—';
  }
  if (tipo === 'curso') {
    const codigo = h.curso_codigo || h.codigo_curso;
    const nome = h.nome_curso || h.curso_nome || CURSOS_HISTORICO[codigo] || codigo;
    const resultado = h.resultado || h.curso_resultado;
    return [nome, resultado].filter(Boolean).join(' — ') || '—';
  }
  if (tipo === 'afastamento') {
    const inicio = h.periodo_inicial || h.data_inicio;
    const fim = h.periodo_final || h.data_fim;
    return inicio && fim ? `${fmtDate(inicio)} a ${fmtDate(fim)}` : '—';
  }
  return '—';
};
const notaInteiraValida = value => value === '' || (Number.isInteger(Number(value)) && /^\d+$/.test(String(value)) && Number(value) >= 0 && Number(value) <= 10);


export function criarInterfaceDAP({supabase, painel, getAcesso, getCiclo, isActive = () => true, informar}) {
  const st={cat:'disponiveis',pagina:1,pesquisa:'',buscando:false,erro:'',lista:null,detalhe:null,carregandoDetalhe:false,erroDetalhe:'',busy:false,versao:0,versaoContagens:0,versaoDetalhe:0,contagens:{},motivo:'',notas:{},relatorio:'',recomendacao:'',avisoEnvio:''};
  const pap = () => getAcesso()?.permissoes || {};
  const diretor = () => !!pap().diretorDAP;
  const aux = () => !!pap().auxiliarDAP;
  const auditor = () => !!pap().auditar && !diretor() && !aux();
  const operacional = () => diretor() || aux();
  const atual = () => getAcesso()?.militar?.id;
  const mediaNotas = () => {
    const valores = CRITERIOS.map(([key]) => st.notas[key]);
    if (valores.some(v => v === '' || v == null || !Number.isFinite(Number(v)) || !notaInteiraValida(v))) return null;
    return valores.reduce((soma, v) => soma + Number(v), 0) / CRITERIOS.length;
  };
  const categorias = () => CATS.filter(([id])=>!['aguardando_validacao','em_andamento'].includes(id)||diretor()||auditor());
  const rpc = async (name,args) => { const {data,error}=await supabase.rpc(name,args);if(error) throw new Error(error.message||`Erro em ${name}.`);return data; };
  const recebe = error => {const message=error?.message||'Falha na operação.';st.erro=message; informar(message,'error');};
  function render() {
    if (!isActive()) return;
    if(st.detalhe){ painel.innerHTML=renderDetalhe();return; }
    if(!categorias().some(([id])=>id===st.cat)) st.cat='disponiveis';
    const linhas=st.lista?.avaliacoes||[];
    const total=Number(st.lista?.total)||0;
    const totalPag=Math.max(1,Number(st.lista?.total_paginas)||1);
    const cardCounts=diretor()||auditor()?`<div class="cpo-indicators">${[['Disponíveis','disponiveis'],['Em andamento','em_andamento'],['Aguardando validação','aguardando_validacao'],['Finalizadas','finalizadas'],['Arquivadas','arquivadas']].map(([label,key])=>`<div class="cpo-indicator"><span>${e(label)}</span><strong>${st.contagens[key]??'—'}</strong></div>`).join('')}<div class="cpo-indicator"><span>Sem movimentação há 48h</span><strong>${st.contagens.sem_movimentacao_48h??'—'}</strong></div></div>`:'';
    painel.innerHTML=`<div class="cpo-area-heading"><div><h3>Avaliações</h3><p>Diretoria de Avaliação de Pessoal — DAP</p></div>${btn('Atualizar','refresh',{secondary:true,small:true})}</div>
     ${cardCounts}<nav class="cpo-categories" aria-label="Categorias da DAP">${categorias().map(([id,label])=>`<button class="cpo-category ${st.cat===id?'active':''}" type="button" data-dap-action="category" data-id="${id}">${e(label)}${st.contagens[id]!=null?` (${st.contagens[id]})`:''}</button>`).join('')}</nav>
     <div class="cpo-section-heading"><h4>${e(CATS.find(([c])=>c===st.cat)?.[1])}</h4><span>${total} registros</span></div>
     <div class="cpo-search"><label class="cpo-mini-label" for="dap-pesquisa">Pesquisar pelo nome</label><input id="dap-pesquisa" type="search" value="${e(st.pesquisa)}" placeholder="Pesquisar militar pelo nome..." autocomplete="off"></div>
     ${st.erro?`<p class="cpo-dap-error" role="alert">${e(st.erro)}</p>`:''}
     <div class="cpo-table-box"><table class="cpo-table"><thead><tr><th>MILITAR</th><th>SITUAÇÃO</th><th>AÇÃO</th></tr></thead><tbody>${st.buscando?'<tr><td colspan="3">Consultando avaliações...</td></tr>':linhas.length?linhas.map(x=>`<tr><td><span class="cpo-row-name">${e(x.nome)}</span><span class="cpo-row-meta">${e(x.patente_atual)} → ${e(x.patente_pretendida)}${x.avaliador_nome?` · Responsável: ${e(x.avaliador_nome)}`:''}</span></td><td><span class="cpo-status">${e(statusLabel(x.status))}</span></td><td class="cpo-cell-action">${btn(st.cat==='disponiveis'&&operacional()?'Assumir':'Consultar','open',{id:x.indicacao_id,small:true,secondary:true})}</td></tr>`).join(''):'<tr><td colspan="3" class="cpo-dap-empty">Nenhuma avaliação nesta categoria.</td></tr>'}</tbody></table></div>
     <div class="cpo-pagination"><span>10 registros por página · ${total} encontrados</span><div class="cpo-pagination-buttons">${btn('Anterior','prev',{small:true,secondary:true,disabled:st.pagina<=1||st.buscando})}<span>Página ${st.pagina} de ${totalPag}</span>${btn('Próxima','next',{small:true,secondary:true,disabled:st.pagina>=totalPag||st.buscando})}</div></div>`;
  }
  function renderDetalhe(){
    const d=st.detalhe;
    if(st.carregandoDetalhe||!d?.dados_indicado) return `<div class="cpo-detail">${btn('← Voltar à lista','back',{secondary:true})}<p>Consultando avaliação...</p></div>`;
    const m=d.dados_indicado, a=d.avaliacao||{}, canEdit=!!d.pode_editar && operacional() && !auditor();
    const available=d.status==='aguardando_avaliacao'&&!a.avaliador_id&&operacional();
    const own=!!a.avaliador_id&&a.avaliador_id===atual();
    const canValidate=diretor()&&d.status==='aguardando_validacao';
    const canAvocar=diretor()&&['em_avaliacao','aguardando_validacao'].includes(d.status)&&a.avaliador_id&&a.avaliador_id!==atual();
    const history=Array.isArray(d.historico_militar)?d.historico_militar:[];
    const avg=mediaNotas();
    return `<div class="cpo-detail cpo-dap-detail">${btn('← Voltar à lista','back',{secondary:true,small:true})}<div class="cpo-detail-heading"><h3>Avaliação de ${e(m.nome)}</h3><p>${e(m.patente_na_indicacao)} → ${e(m.patente_pretendida)} · ${e(statusLabel(d.status))}</p></div>
    ${st.erroDetalhe?`<p class="cpo-dap-error">${e(st.erroDetalhe)}</p>`:''}
    <details class="cpo-accordion" open><summary>Dados do indicado</summary><div class="cpo-accordion-body"><div class="cpo-data-grid">${field('Militar',m.nome)}${field('ID Discord',m.discord_id)}${field('Situação atual',m.status_atual)}${field('Patente atual',m.patente_atual)}${field('Patente pretendida',m.patente_pretendida)}${field('Data da indicação',fmtTime(m.indicado_em))}${field('Tempo na patente',m.dias_na_patente!=null?`${m.dias_na_patente} dias${m.origem_data_patente==='ingresso_estimado'?' (estimado desde o ingresso)':''}`:'Não informado')}${field('Avaliador responsável',a.avaliador_nome)}</div><div class="cpo-text-box"><strong>Justificativa da indicação</strong><p class="cpo-preserve">${e(m.justificativa||'Não disponível nesta consulta.')}</p></div></div></details>
    <details class="cpo-accordion"><summary>Histórico militar (${history.length})</summary><div class="cpo-accordion-body"><div class="cpo-table-box"><table class="cpo-table"><thead><tr><th>DATA</th><th>TIPO</th><th>DETALHAMENTO</th><th>OBSERVAÇÃO</th></tr></thead><tbody>${history.length?history.map(h=>`<tr><td>${e(dataHistorico(h))}</td><td>${e(TIPOS_HISTORICO[h.tipo] || String(h.tipo || '—').replaceAll('_',' '))}</td><td>${e(detalheHistorico(h))}</td><td class="cpo-preserve">${e(textoHistorico(h.observacao ?? h.descricao))}</td></tr>`).join(''):'<tr><td colspan="4">Nenhum registro encontrado.</td></tr>'}</tbody></table></div></div></details>
    <details class="cpo-accordion" open><summary>Critérios de avaliação</summary><div class="cpo-accordion-body"><div class="cpo-table-box"><table class="cpo-table cpo-score-table"><thead><tr><th>CRITÉRIO</th><th>NOTA (0 A 10)</th></tr></thead><tbody>${CRITERIOS.map(([key,label])=>`<tr><td>${e(label)}</td><td><input type="number" class="dap-nota" data-key="${key}" step="1" min="0" max="10" inputmode="numeric" pattern="[0-9]*" value="${e(st.notas[key]??'')}" ${canEdit?'':'disabled'} aria-label="${e(label)}"></td></tr>`).join('')}</tbody></table></div><div class="cpo-score-total">Média geral <strong id="dap-media">${avg===null?'—':avg.toFixed(2).replace('.',',')}</strong></div><p class="cpo-inline-note">Recomendação favorável: média geral ≥ 7,0. Notas individuais devem ser números inteiros de 0 a 10.</p></div></details>
    <details class="cpo-accordion" open><summary>Relatório e recomendação</summary><div class="cpo-accordion-body"><div class="cpo-field"><label for="dap-relatorio">Relatório de avaliação</label><textarea id="dap-relatorio" maxlength="10000" ${canEdit?'':'disabled'} placeholder="Descreva a avaliação...">${e(st.relatorio)}</textarea></div><div class="cpo-field"><span class="cpo-mini-label">Recomendação</span>${[['favoravel','Favorável à promoção'],['desfavoravel','Desfavorável à promoção']].map(([value,label])=>`<label class="cpo-choice"><input type="radio" name="dap-recomendacao" value="${value}" ${st.recomendacao===value?'checked':''} ${canEdit && !(value==='favoravel' && avg!==null && avg<7)?'':'disabled'}> ${label}</label>`).join('')}</div></div></details>
    ${d.auditoria?.historico_revisoes?.length?`<section class="cpo-panel-card"><h4>Histórico de revisões</h4>${d.auditoria.historico_revisoes.map(x=>`<p class="cpo-preserve">${e(fmtTime(x.data))} — ${e(x.evento)}: ${e(x.motivo||'')}</p>`).join('')}</section>`:''}
    ${canValidate?`<section class="cpo-panel-card"><h4>Validação pela Direção</h4><div class="cpo-field"><label for="dap-motivo">Motivo da devolução para revisão</label><textarea id="dap-motivo" maxlength="5000" placeholder="Obrigatório apenas para devolver...">${e(st.motivo)}</textarea></div><div class="cpo-actions">${btn('Devolver para revisão','revisar',{secondary:true})}${btn('Validar avaliação','validar')}</div></section>`:''}
    ${canEdit?`<div class="cpo-dap-save-area"><p class="cpo-inline-note">Antes de ${diretor()?'finalizar':'encaminhar'} a avaliação, salve o rascunho com as notas, o relatório e a recomendação preenchidos.</p>${st.avisoEnvio?`<p id="dap-aviso-envio" class="cpo-dap-error" role="alert" style="margin:10px 0">${e(st.avisoEnvio)}</p>`:''}<div class="cpo-actions">${btn('Salvar rascunho','save',{secondary:true})}${btn(diretor()?'Finalizar avaliação':'Encaminhar para validação','submit')}</div></div>`:''}
    ${own&&d.status==='em_avaliacao'&&operacional()?`<section class="cpo-panel-card"><h4>Devolver avaliação à fila</h4><div class="cpo-field"><label for="dap-motivo-liberacao">Justificativa obrigatória</label><textarea id="dap-motivo-liberacao" maxlength="5000" placeholder="Motivo da liberação..."></textarea></div>${btn('Liberar avaliação','release',{secondary:true})}</section>`:''}
    <div class="cpo-actions">${available?btn('Assumir avaliação','assumir'):''}${canAvocar?btn('Avocar avaliação','avocar',{secondary:true}):''}</div></div>`;
  }
  async function carregarContagens(){
    if(!diretor()&&!auditor()) return;
    const current=++st.versaoContagens;
    const results=await Promise.allSettled([
      rpc('cpo_resumo_avaliacoes'),
      rpc('cpo_listar_avaliacoes',{p_categoria:'minhas',p_pagina:1,p_pesquisa:''})
    ]);
    if(current!==st.versaoContagens)return;
    if(results[0].status==='fulfilled'){
      const resumo=results[0].value;
      for(const key of ['disponiveis','em_andamento','aguardando_validacao','finalizadas','arquivadas','sem_movimentacao_48h']){
        const valor=Number(resumo?.[key]);
        st.contagens[key]=Number.isFinite(valor)?valor:null;
      }
    }else{
      informar(`Não foi possível carregar os indicadores da DAP: ${results[0].reason?.message||'Erro desconhecido.'}`,'error');
    }
    if(results[1].status==='fulfilled')st.contagens.minhas=Number(results[1].value?.total)||0;
    if(!st.detalhe)render();
  }

  async function load({counts=false}={}){
    const run=++st.versao;
    st.buscando=true;st.erro='';render();
    try{
      const d=await rpc('cpo_listar_avaliacoes',{p_categoria:st.cat==='aguardando_validacao'?'aguardando_validacao':st.cat,p_pagina:st.pagina,p_pesquisa:st.pesquisa});
      if(run!==st.versao)return;
      if(!d||!Array.isArray(d.avaliacoes))throw Error('Resposta inesperada da listagem da DAP.');
      st.lista=d;
    }catch(err){if(run===st.versao){st.erro=err.message;st.lista=null;}}
    finally{if(run===st.versao){st.buscando=false;render();}}
    if(counts&&run===st.versao)void carregarContagens();
  }
  async function abrir(id){
    if(!id)return;
    const versao=++st.versaoDetalhe;
    st.detalhe={};st.carregandoDetalhe=true;st.erroDetalhe='';render();
    try {
      const d=await rpc('cpo_consultar_avaliacao',{p_indicacao_id:id});
      if (versao!==st.versaoDetalhe) return;
      st.detalhe=d;
      st.notas=Object.fromEntries(CRITERIOS.map(([key])=>[key,d.avaliacao?.notas?.[key]??'']));
      st.relatorio=d.avaliacao?.relatorio||'';st.recomendacao=d.avaliacao?.recomendacao||'';st.motivo='';st.avisoEnvio='';
    }catch(err){if(versao===st.versaoDetalhe){st.detalhe=null;st.erro=err.message;informar(err.message,'error');}}
    finally{if(versao===st.versaoDetalhe){st.carregandoDetalhe=false;render();}}
  }
  function capture(){
    for(const n of painel.querySelectorAll('.dap-nota'))st.notas[n.dataset.key]=n.value;
    const report=painel.querySelector('#dap-relatorio');if(report)st.relatorio=report.value;
    const rec=painel.querySelector('input[name="dap-recomendacao"]:checked');if(rec)st.recomendacao=rec.value;
    const m=painel.querySelector('#dap-motivo');if(m)st.motivo=m.value;
  }
  function confirmation(message){return window.confirm(message);}
  async function executar(nome,args,message){
    if(st.busy)return;
    if(message&&!confirmation(message))return;
    st.busy=true;
    try{
      const result=await rpc(nome,args);
      informar(`Operação concluída: ${({cpo_assumir_avaliacao:'avaliação assumida',cpo_salvar_avaliacao:'rascunho salvo',cpo_enviar_avaliacao:'avaliação enviada',cpo_validar_avaliacao:'decisão registrada',cpo_liberar_avaliacao:'avaliação liberada',cpo_avocar_avaliacao:'avaliação avocada'})[nome]||nome}.`,'success');
      if(nome==='cpo_salvar_avaliacao'){st.avisoEnvio='';await abrir(args.p_indicacao_id);}
      else {st.detalhe=null;st.pagina=1;await load({counts:true});}
      return result;
    }catch(err){
      if(nome==='cpo_enviar_avaliacao'){
        st.avisoEnvio='Não foi possível enviar a avaliação. Salve o rascunho antes de prosseguir e confira se todos os critérios, o relatório e a recomendação foram preenchidos.';
        render();
        painel.querySelector('#dap-aviso-envio')?.scrollIntoView({behavior:'smooth',block:'center'});
      }else{informar(err.message,'error');st.erroDetalhe=err.message;render();}
    }
    finally{st.busy=false;}
  }
  async function agir(tipo,id){
    if(st.busy)return;
    if(tipo==='category'){clearTimeout(searchTimer);st.cat=id;st.pagina=1;st.detalhe=null;await load();return;}
    if(tipo==='refresh'){await load({counts:true});return;}
    if(tipo==='prev'){st.pagina=Math.max(1,st.pagina-1);await load();return;}
    if(tipo==='next'){st.pagina++;await load();return;}
    if(tipo==='back'){st.detalhe=null;st.erroDetalhe='';render();return;}
    if(tipo==='open'){await abrir(id);return;}
    capture();
    const ind=st.detalhe?.indicacao_id;
    if(!ind)return;
    if(tipo==='assumir')await executar('cpo_assumir_avaliacao',{p_indicacao_id:ind},'Confirma que deseja assumir esta avaliação?');
    else if(tipo==='avocar')await executar('cpo_avocar_avaliacao',{p_indicacao_id:ind,p_confirmar:true},'Avocar a avaliação para a Direção da DAP? O rascunho existente será preservado.');
    else if(tipo==='save'){
      const notas={};for(const [key] of CRITERIOS)if(st.notas[key]!==''&&st.notas[key]!=null){if(!notaInteiraValida(st.notas[key])){informar('Preencha somente notas inteiras de 0 a 10.','error');return;}notas[key]=Number(st.notas[key]);}
      if(Object.values(notas).some(v=>!Number.isInteger(v)||v<0||v>10)){informar('Preencha somente notas inteiras de 0 a 10.','error');return;}
      await executar('cpo_salvar_avaliacao',{p_indicacao_id:ind,p_notas:notas,p_relatorio:st.relatorio,p_recomendacao:st.recomendacao||null});
    }
    else if(tipo==='submit')await executar('cpo_enviar_avaliacao',{p_indicacao_id:ind,p_confirmar:true},'Confirma o envio definitivo da avaliação? Os dados devem estar salvos no rascunho antes do envio.');
    else if(tipo==='validar')await executar('cpo_validar_avaliacao',{p_indicacao_id:ind,p_decisao:'validar',p_motivo:null,p_confirmar:true},'Confirma a validação definitiva deste parecer?');
    else if(tipo==='revisar'){
      if(!st.motivo.trim()){informar('Informe o motivo da revisão.','error');return;}
      await executar('cpo_validar_avaliacao',{p_indicacao_id:ind,p_decisao:'revisar',p_motivo:st.motivo,p_confirmar:true},'Devolver esta avaliação para revisão?');
    }
    else if(tipo==='release'){
      const motivo=painel.querySelector('#dap-motivo-liberacao')?.value?.trim()||'';
      if(!motivo){informar('Informe a justificativa para liberar a avaliação.','error');return;}
      await executar('cpo_liberar_avaliacao',{p_indicacao_id:ind,p_justificativa:motivo,p_confirmar:true},'Liberar esta avaliação para a fila, preservando o rascunho?');
    }
  }
  let searchTimer;
  painel.addEventListener('click',evt=>{
    const target=evt.target.closest('[data-dap-action]');if(!target)return;
    evt.stopPropagation();void agir(target.dataset.dapAction,target.dataset.id);
  });
  painel.addEventListener('change',evt=>{
    if(evt.target.name==='dap-recomendacao') st.recomendacao=evt.target.value;
  });
  painel.addEventListener('input',evt=>{
    if(evt.target.id==='dap-pesquisa'){
      st.pesquisa=evt.target.value;st.pagina=1;clearTimeout(searchTimer);
      searchTimer=setTimeout(()=>void load(),350);
    } else if(evt.target.classList.contains('dap-nota')){
      const input=evt.target;
      const value=input.value;
      if(value!=='' && !notaInteiraValida(value)) {
        input.value='';
        informar('A nota deve ser um número inteiro de 0 a 10.','error');
      }
      st.notas[input.dataset.key]=input.value;
      const scores=Array.from(painel.querySelectorAll('.dap-nota')).map(n=>n.value);
      const avg=scores.length===CRITERIOS.length && scores.every(x=>x!=='' && notaInteiraValida(x))
        ? scores.reduce((s,x)=>s+Number(x),0)/CRITERIOS.length : null;
      const label=painel.querySelector('#dap-media');if(label)label.textContent=avg===null?'—':avg.toFixed(2).replace('.',',');
    }
  });
  return {render,load};
}
