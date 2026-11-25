import { supabase } from "../supabase.js";

export function montarManutencao(painel, atualizarAuditoria) {
    const paginas = [["dashboard","Início"],["noticias","Notícias"],["documentos","Documentos"],["consultar","Consultar Militares"],["controle-patentes","Controle de Efetivo"],["alistamento","Alistamento"],["acoes","Ações"],["aulas","Aulas"],["orgaos","Órgãos"],["ciclos","Ciclos de Promoção"],["permanencia","Controle de Permanência"],["monitoramento","Monitoramento"]];
    const $ = id => painel.querySelector("#man-"+id);
    painel.innerHTML = `<h2>Manutenção do Sistema</h2>
    <p id="man-situacao" role="status">Carregando configuração...</p>
    <button type="button" id="man-atualizar">Atualizar configuração</button>
    <form class="admin-mil-form" id="man-form" hidden>
      <label>Modalidade<select id="man-modalidade"><option value="geral">Geral</option><option value="parcial">Parcial</option></select></label>
      <fieldset id="man-paginas" hidden><legend>Páginas afetadas</legend></fieldset>
      <label>Título<input id="man-titulo" maxlength="150" required></label>
      <label>Descrição<textarea id="man-descricao" maxlength="5000" required></textarea></label>
      <label>Início (horário de Brasília)<input id="man-inicio" type="datetime-local" step="60"></label>
      <p>Deixe o início vazio para ativação imediata.</p>
      <label>Término (horário de Brasília)<input id="man-termino" type="datetime-local" step="60"></label>
      <p>Deixe o término vazio para manutenção por tempo indeterminado.</p>
      <fieldset><legend>Militares isentos</legend>
        <label>Pesquisar militar ativo<input id="man-busca" placeholder="Nome ou Discord ID"></label>
        <button type="button" id="man-pesquisar">Pesquisar</button>
        <div id="man-resultados"></div><div id="man-isentos"></div>
      </fieldset>
      <label>Justificativa administrativa<textarea id="man-justificativa" required></textarea></label>
      <p>O login e a administração permanecem disponíveis. As sincronizações não são alteradas.</p>
      <div class="admin-mil-acoes"><button type="submit" id="man-salvar">Ativar / salvar manutenção</button><button type="button" id="man-desativar" class="admin-perigo">Desativar manutenção</button></div>
    </form><p id="man-status" role="status"></p>`;
    const form = $("form"), isentos = new Map();
    let ocupado = false, config = null;
    const el = (tag, text) => { const e = document.createElement(tag); e.textContent = text; return e; };
    for (const [id,nome] of paginas) {
        const label = el("label",nome), input = document.createElement("input");
        input.type="checkbox"; input.value=id; label.prepend(input); $("paginas").append(label);
    }
    const ajustar = () => { $("paginas").hidden = $("modalidade").value !== "parcial"; };
    $("modalidade").onchange = ajustar;
    const rpc = async (nome,args={}) => { const {data,error}=await supabase.rpc(nome,args); if(error) throw error; return data; };
    const dataLocal = value => {
        if(!value) return "";
        const parts = new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(value));
        const p = Object.fromEntries(parts.map(x=>[x.type,x.value]));
        return p.year+"-"+p.month+"-"+p.day+"T"+p.hour+":"+p.minute;
    };
    const dataISO = value => value ? new Date(value+":00-03:00").toISOString() : null;
    function renderIsentos(){
        $("isentos").replaceChildren(el("p",isentos.size+" militar(es) isento(s)"));
        for(const [id,m] of isentos){
            const linha=el("div",""); linha.className="admin-mil-linha";
            linha.append(el("span",m.nome+" — "+(m.patente||"Sem patente")));
            const b=el("button","Remover"); b.type="button"; b.onclick=()=>{if(!ocupado){isentos.delete(id);renderIsentos();}}; linha.append(b); $("isentos").append(linha);
        }
    }
    function preencher(d){
        if(d?.sucesso!==true) throw new Error("Configuração não confirmada.");
        config=d; $("situacao").textContent="Situação: "+({ativa:"Ativa",desativada:"Desativada",programada:"Programada",encerrada:"Encerrada"}[d.situacao]||d.situacao);
        $("modalidade").value=d.modalidade; $("titulo").value=d.titulo; $("descricao").value=d.descricao;
        $("inicio").value=dataLocal(d.inicio_em); $("termino").value=dataLocal(d.termino_em);
        for(const c of $("paginas").querySelectorAll("input")) c.checked=(d.paginas||[]).includes(c.value);
        isentos.clear(); for(const m of d.isentos_detalhes||[]) isentos.set(m.id,m);
        $("justificativa").value=""; $("resultados").replaceChildren(); renderIsentos(); ajustar(); form.hidden=false;
        $("desativar").disabled=!d.habilitada;
    }
    async function executar(fn){
        if(ocupado)return; ocupado=true;
        const controles=[...painel.querySelectorAll("button,input,select,textarea")];
        controles.forEach(c=>c.disabled=true); $("status").textContent="Processando...";
        try{await fn();}catch(e){$("status").textContent=e.message||"Falha na operação.";}finally{ocupado=false; controles.forEach(c=>c.disabled=false); $("desativar").disabled=!config?.habilitada;}
    }
    const carregar=()=>executar(async()=>{preencher(await rpc("sistema_manutencao_consultar"));$("status").textContent="Configuração atualizada.";});
    $("atualizar").onclick=carregar;
    $("pesquisar").onclick=()=>executar(async()=>{
        const data=await rpc("admin_listar_militares",{p_pesquisa:$("busca").value.trim()||null,p_status:"ativo",p_limite:100,p_offset:0});
        $("resultados").replaceChildren();
        for(const m of data||[]){
            const linha=el("div","");linha.className="admin-mil-linha";linha.append(el("span",m.nome+" — "+(m.patente||"")+" — "+m.discord_id));
            const b=el("button","Adicionar");b.type="button";b.onclick=()=>{if(!ocupado){isentos.set(m.id,m);renderIsentos();}};linha.append(b);$("resultados").append(linha);
        }
        $("status").textContent=(data||[]).length+" resultado(s)."+(data?.length===100?" Refine a pesquisa.":"");
    });
    form.onsubmit=e=>{
        e.preventDefault();if(ocupado)return;
        const args={p_habilitada:true,p_modalidade:$("modalidade").value,p_paginas:[...$("paginas").querySelectorAll("input:checked")].map(c=>c.value),p_militares_isentos:[...isentos.keys()],p_titulo:$("titulo").value.trim(),p_descricao:$("descricao").value.trim(),p_inicio_em:dataISO($("inicio").value),p_termino_em:dataISO($("termino").value),p_justificativa:$("justificativa").value.trim()};
        if(!args.p_justificativa||!args.p_titulo||!args.p_descricao){$("status").textContent="Preencha título, descrição e justificativa.";return;}
        if(args.p_modalidade==="parcial"&&!args.p_paginas.length){$("status").textContent="Selecione pelo menos uma página.";return;}
        if(!confirm("Confirmar ativação ou alteração da manutenção?"))return;
        executar(async()=>{const d=await rpc("sistema_manutencao_configurar",args);preencher(d.configuracao);$("status").textContent=d.mensagem||"Configuração salva.";atualizarAuditoria();});
    };
    $("desativar").onclick=()=>{
        const justificativa=$("justificativa").value.trim();
        if(!justificativa){$("status").textContent="Informe a justificativa para desativar.";return;}
        if(!confirm("Desativar a manutenção?"))return;
        executar(async()=>{const d=await rpc("sistema_manutencao_desativar",{p_justificativa:justificativa});preencher(d.configuracao);$("status").textContent=d.mensagem||"Manutenção desativada.";atualizarAuditoria();});
    };
    return {carregar, ocupado:()=>ocupado};
}
