import { supabase } from "../supabase.js";
const lista = document.getElementById("admin-auditoria");
const status = document.getElementById("admin-status");
const mais = document.getElementById("admin-mais");
const atualizar = document.getElementById("admin-atualizar");
let autorizado = false, ocupado = false, offset = 0;
function elemento(tag, texto) {
    const el = document.createElement(tag);
    el.textContent = texto;
    return el;
}
async function carregar(reiniciar = false) {
    if (!autorizado || ocupado) return;
    ocupado = true;
    atualizar.disabled = mais.disabled = true;
    try {
        const {data: permitido,error: erro} = await supabase.rpc("crme_eh_administrador");
        if (erro || permitido !== true) {
            lista.replaceChildren();
            location.replace("dashboard.html");
            return;
        }
        if (reiniciar) { offset = 0; lista.replaceChildren(); }
        const {data,error} = await supabase.from("auditoria_administrativa")
            .select("*").order("criado_em",{ascending:false}).order("id",{ascending:false})
            .range(offset,offset+24);
        if (error) throw error;
        for (const item of data) {
            const detalhe = document.createElement("details");
            detalhe.className = "admin-registro";
            detalhe.append(elemento("summary", item.acao + " — " + item.administrador_nome + " — " + new Date(item.criado_em).toLocaleString("pt-BR")));
            for (const [rotulo,valor] of [["Tabela",item.tabela],["Registro",item.registro_id],["Responsável (Discord)",item.administrador_discord_id],["Justificativa",item.justificativa]]) {
                detalhe.append(elemento("p",rotulo+": "+(valor??"—")));
            }
            for (const [rotulo,valor] of [["Dados anteriores",item.dados_anteriores],["Dados posteriores",item.dados_posteriores]]) {
                detalhe.append(elemento("strong",rotulo),elemento("pre",JSON.stringify(valor,null,2)));
            }
            lista.append(detalhe);
        }
        offset += data.length;
        mais.hidden = data.length < 25;
        status.textContent = offset ? offset+" registros exibidos." : "Nenhuma intervenção registrada.";
    } catch (erro) {
        console.error(erro);
        status.textContent = "Não foi possível consultar a auditoria.";
    } finally { ocupado = false; atualizar.disabled = mais.disabled = false; }
}
document.addEventListener("crme-admin-autorizado",()=>{ autorizado=true; carregar(true); });
atualizar.addEventListener("click",()=>carregar(true));
mais.addEventListener("click",()=>carregar());

const painel = document.getElementById("admin-militares");
const pesquisa = document.getElementById("admin-pesquisa");
const milLista = document.getElementById("admin-mil-lista");
const milStatus = document.getElementById("admin-mil-status");
const edicao = document.getElementById("admin-mil-edicao");
const anterior = document.getElementById("admin-mil-anterior");
const proximo = document.getElementById("admin-mil-proximo");
const patentes = ["Recruta","Soldado-Recruta","Soldado","Cabo","Terceiro-Sargento","Segundo-Sargento","Primeiro-Sargento","Subtenente","Cadete","Aspirante-a-Oficial","Segundo-Tenente","Primeiro-Tenente","Capitão","Major","Tenente-Coronel","Coronel","General-de-Brigada","General-de-Divisão","General-de-Exército","Marechal"];
const situacoes = ["ativo","afastado","desligamento_pendente","desligado"];
const cursos = {"Recruta":["IIB"],"Soldado-Recruta":["CFSd"],"Soldado":["CFCb"],"Cabo":["CFSg"],"Segundo-Sargento":["CASg"],"Primeiro-Sargento":["CFSb"],"Subtenente":["CASb","CIC"],"Cadete":["CPC"],"Aspirante-a-Oficial":["CFO"],"Segundo-Tenente":["CAO"],"Primeiro-Tenente":["CFCp"],"Capitão":["ADOM","CFMj"],"Major":["CQOS"],"Tenente-Coronel":["AOC"],"Coronel":["AFOS"]};
let pagina = 0, buscando = false, salvando = false;
async function listarMilitares(n = 0) {
    if (!autorizado || buscando || salvando) return;
    buscando = true;
    anterior.disabled = proximo.disabled = true;
    edicao.replaceChildren();
    milStatus.textContent = "Carregando...";
    try {
        const {data,error} = await supabase.rpc("admin_listar_militares",{p_pesquisa:pesquisa.elements.pesquisa.value.trim()||null,p_status:pesquisa.elements.status.value||null,p_limite:26,p_offset:n*25});
        if(error) throw error;
        pagina=n;
        milLista.replaceChildren();
        for(const m of data.slice(0,25)){
            const linha=elemento("div","");
            linha.className="admin-mil-linha";
            linha.append(elemento("span",m.nome+" — "+(m.patente??"Sem patente")+" — "+m.status+" — "+m.discord_id));
            const b=elemento("button","Administrar"); b.type="button";
            b.onclick=()=>{if(!salvando) abrirMilitar(m);};
            linha.append(b); milLista.append(linha);
        }
        milStatus.textContent=data.length?"Página "+(pagina+1):"Nenhum militar encontrado.";
        anterior.disabled=pagina===0; proximo.disabled=data.length<=25;
    } catch(e){milStatus.textContent=e.message||"Falha na consulta.";} finally{buscando=false;}
}
function abrirMilitar(m){
    edicao.replaceChildren(elemento("h3",m.nome+" — "+(m.patente??"Sem patente")));
    const menu=elemento("div",""); menu.className="admin-mil-acoes";
    const area=elemento("div","");
    edicao.append(menu,area);
    for(const [tipo,titulo] of [["cadastro","Editar cadastro"],["discord","Alterar Discord ID"],["status","Alterar situação"],["cursos","Cursos da patente"],["excluir","Excluir permanentemente"]]){
        const b=elemento("button",titulo);b.type="button";if(tipo==="excluir")b.className="admin-perigo";
        b.onclick=()=>{if(!salvando) formulario(m,tipo,area);};menu.append(b);
    }
}
function formulario(m,tipo,area){
    area.replaceChildren();
    const f=elemento("form","");f.className="admin-mil-form";
    const campos={};
    function campo(nome,rotulo,valor,opcoes=null,tipoInput="text"){
        const l=elemento("label",rotulo);
        const c=document.createElement(opcoes?"select":tipoInput==="textarea"?"textarea":"input");
        if(opcoes){for(const o of opcoes){const opt=elemento("option",o||"Sem patente");opt.value=o;c.append(opt);}}
        else if(tipoInput!=="textarea")c.type=tipoInput;
        c.value=valor??"";c.required=true;l.append(c);f.append(l);campos[nome]=c;return c;
    }
    let rpc, montar;
    const base=()=>({p_militar_id:m.id,p_justificativa:campos.justificativa.value.trim(),p_dados_originais:m});
    if(tipo==="cadastro"){
        campo("nome","Nome",m.nome);
        const p=campo("patente","Patente",m.patente,m.status==="desligado"?[""]:patentes);if(m.status==="desligado"){p.required=false;p.disabled=true;}
        campo("ingresso","Ingresso",m.ingresso,null,"date");
        const a=campo("advertencias","Advertências",m.advertencias,null,"number");a.min=0;a.max=2;a.step=1;
        rpc="admin_editar_militar";montar=()=>({...base(),p_nome:campos.nome.value,p_patente:p.value||null,p_ingresso:campos.ingresso.value,p_advertencias:Number(a.value)});
    }else if(tipo==="discord"){
        const c=campo("discord","Novo Discord ID",m.discord_id);c.pattern="[0-9]{17,20}";
        rpc="admin_alterar_discord_id";montar=()=>({...base(),p_novo_discord_id:c.value});
    }else if(tipo==="status"){
        const s=campo("status","Nova situação",m.status,situacoes);
        const p=campo("patente","Patente no retorno","Recruta",patentes);
        const ajustar=()=>{p.disabled=m.status!=="desligado"||s.value==="desligado";p.parentElement.hidden=p.disabled;};s.onchange=ajustar;ajustar();
        rpc="admin_alterar_status";montar=()=>({...base(),p_novo_status:s.value,p_patente:p.disabled?null:p.value});
    }else if(tipo==="cursos"){
        const codigos=cursos[m.patente]||[];
        if(m.status==="desligado"||!codigos.length){area.append(elemento("p","Não há cursos da patente disponíveis."));return;}
        const checks=codigos.map(c=>{const l=elemento("label","");const x=document.createElement("input");x.type="checkbox";x.checked=(m.cursos_patente_concluidos||[]).includes(c);l.append(x,document.createTextNode(" "+c));f.append(l);return [c,x];});
        rpc="admin_editar_cursos_patente";montar=()=>({...base(),p_cursos:checks.filter(([,x])=>x.checked).map(([c])=>c)});
    }else{
        f.append(elemento("p","Esta operação é irreversível pelo painel. Os registros próprios serão removidos e preservados na auditoria. Cargos do Discord não são removidos diretamente."));
        const c=campo("confirmacao","Digite exatamente o nome: "+m.nome,"");
        rpc="admin_excluir_militar";montar=()=>({...base(),p_confirmacao_nome:c.value});
    }
    campo("justificativa","Justificativa","",null,"textarea");
    const mensagem=elemento("p","");mensagem.setAttribute("role","status");
    const enviar=elemento("button",tipo==="excluir"?"Excluir permanentemente":"Salvar");enviar.type="submit";if(tipo==="excluir")enviar.className="admin-perigo";
    f.append(enviar,mensagem);area.append(f);
    f.onsubmit=async e=>{
        e.preventDefault();if(salvando)return;
        if(!campos.justificativa.value.trim()){mensagem.textContent="Informe a justificativa.";return;}
        if(tipo==="excluir"&&campos.confirmacao.value!==m.nome){mensagem.textContent="Nome incorreto.";return;}
        if(!window.confirm("Confirmar intervenção administrativa?"))return;
        salvando=true;enviar.disabled=true;
        try{
            const {data,error}=await supabase.rpc(rpc,montar());
            if(error)throw error;
            if(data?.sucesso!==true)throw new Error(data?.mensagem||"Operação não confirmada.");
            salvando=false;await listarMilitares(pagina);milStatus.textContent=data.mensagem||"Operação concluída.";carregar(true);
        }catch(e){mensagem.textContent=e.message||"Falha na operação.";}
        finally{salvando=false;enviar.disabled=false;}
    };
}
document.getElementById("admin-gestao").onclick=()=>{if(!autorizado||salvando||histOcupado)return;painel.hidden=!painel.hidden;if(!painel.hidden){histPainel.hidden=true;listarMilitares();}};
pesquisa.onsubmit=e=>{e.preventDefault();listarMilitares();};
anterior.onclick=()=>listarMilitares(Math.max(0,pagina-1));
proximo.onclick=()=>listarMilitares(pagina+1);

const histPainel=document.getElementById("admin-historico");
const histBusca=document.getElementById("admin-hist-pesquisa");
const histMilitares=document.getElementById("admin-hist-militares");
const histStatus=document.getElementById("admin-hist-status");
const histDetalhe=document.getElementById("admin-hist-detalhe");
const histPrev=document.getElementById("admin-hist-mil-prev");
const histNext=document.getElementById("admin-hist-mil-next");
const tiposHist={ingresso:"Ingresso",reingresso:"Reingresso",promocao:"Promoção",rebaixamento:"Rebaixamento",curso:"Curso",advertencia_escrita:"Advertência escrita",afastamento:"Afastamento",retorno:"Retorno",desligamento:"Desligamento"};
let histOcupado=false,histPagina=0,histTermo="";
function histBotao(titulo,acao,perigo=false){
    const b=elemento("button",titulo);b.type="button";b.onclick=()=>{if(!histOcupado)acao();};if(perigo)b.className="admin-perigo";return b;
}
async function histRPC(nome,args){
    const {data,error}=await supabase.rpc(nome,args);if(error)throw error;return data;
}
async function histPesquisar(n=0,termo=histTermo){
    if(!autorizado||histOcupado)return;
    histOcupado=true;histPrev.disabled=histNext.disabled=true;
    histDetalhe.replaceChildren();histMilitares.replaceChildren();histStatus.textContent="Carregando...";
    try{
        const data=await histRPC("admin_listar_militares",{p_pesquisa:termo||null,p_status:null,p_limite:26,p_offset:n*25});
        histPagina=n;histTermo=termo;
        for(const m of data.slice(0,25)){
            const linha=elemento("div","");linha.className="admin-mil-linha";
            linha.append(elemento("span",m.nome+" — "+(m.patente??"Sem patente")+" — "+m.status),histBotao("Consultar histórico",()=>histAbrir(m)));histMilitares.append(linha);
        }
        histStatus.textContent=data.length?"Página "+(n+1):"Nenhum militar encontrado.";
        histPrev.disabled=n===0;histNext.disabled=data.length<=25;
    }catch(e){histStatus.textContent=e.message||"Falha na pesquisa.";}finally{histOcupado=false;}
}
function histAbrir(m){
    histDetalhe.replaceChildren(elemento("h3","Histórico de "+m.nome));
    const filtro=document.createElement("select");filtro.setAttribute("aria-label","Tipo de ocorrência");
    for(const [v,t] of [["","Todas as ocorrências"],...Object.entries(tiposHist)]){const o=elemento("option",t);o.value=v;filtro.append(o);}
    const barra=elemento("div","");barra.className="admin-mil-acoes";
    const msg=elemento("p","");msg.setAttribute("role","status");
    const registros=elemento("div",""),formArea=elemento("div","");
    let pag=0;
    const prev=histBotao("Anterior",()=>listar(pag-1)),next=histBotao("Próximo",()=>listar(pag+1));
    async function listar(n=0){
        if(histOcupado)return;
        histOcupado=true;prev.disabled=next.disabled=filtro.disabled=true;
        registros.replaceChildren();formArea.replaceChildren();msg.textContent="Carregando...";
        try{
            const data=await histRPC("admin_listar_historico",{p_militar_id:m.id,p_tipo:filtro.value||null,p_limite:26,p_offset:n*25});
            pag=n;
            for(const r of data.slice(0,25)){
                const d=elemento("details","");d.className="admin-registro";
                d.append(elemento("summary",(tiposHist[r.tipo]||r.tipo)+" — "+r.data+" — "+r.autor_nome));
                for(const [k,t] of Object.entries({autor_discord_id:"Discord ID do autor",patente_anterior:"Patente anterior",nova_patente:"Nova patente",nome_curso:"Curso",resultado:"Resultado",data_inicio:"Início",data_termino:"Término",observacao:"Observação"})){if(r[k]!=null)d.append(elemento("p",t+": "+r[k]));}
                const a=elemento("div","");a.className="admin-mil-acoes";
                a.append(histBotao("Editar",()=>histFormulario(m,r,false,formArea,()=>listar(pag),msg)),histBotao("Excluir",()=>histFormulario(m,r,true,formArea,()=>listar(pag),msg),true));d.append(a);registros.append(d);
            }
            msg.textContent=data.length?"Página "+(n+1):"Nenhuma ocorrência encontrada.";
            prev.disabled=n===0;next.disabled=data.length<=25;
        }catch(e){msg.textContent=e.message||"Falha na consulta.";}finally{histOcupado=false;filtro.disabled=false;}
    }
    filtro.onchange=()=>listar();
    barra.append(filtro,histBotao("Adicionar registro",()=>histFormulario(m,null,false,formArea,()=>listar(0),msg)));
    histDetalhe.append(barra,msg,registros,prev,next,formArea);listar();
}
function histFormulario(m,r,excluir,area,recarregar,msg){
    area.replaceChildren(elemento("h3",excluir?"Excluir ocorrência":r?"Editar ocorrência":"Adicionar ocorrência"));
    const f=elemento("form","");f.className="admin-mil-form";
    const campos={};
    function campo(k,t,v="",tipo="text",opcoes=null,obrigatorio=true){
        const l=elemento("label",t),c=document.createElement(opcoes?"select":tipo==="textarea"?"textarea":"input");
        if(opcoes){for(const [val,rot] of opcoes){const o=elemento("option",rot);o.value=val;c.append(o);}}else if(tipo!=="textarea")c.type=tipo;
        c.value=v??"";c.required=obrigatorio;l.append(c);f.append(l);campos[k]=c;return c;
    }
    if(excluir){f.append(elemento("p","Excluir "+(tiposHist[r.tipo]||r.tipo)+" de "+r.data+"? O registro será preservado na auditoria. O cadastro militar não será alterado."));}
    else{
        const hoje=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}).format(new Date());
        const t=campo("tipo","Tipo de ocorrência",r?.tipo||"ingresso","text",Object.entries(tiposHist));
        campo("data","Data da ocorrência",r?.data||hoje,"date").max=hoje;
        campo("autor_nome","Nome do autor",r?.autor_nome);
        campo("autor_discord_id","Discord ID ou identificação do autor",r?.autor_discord_id);
        for(const [k,label] of [["patente_anterior","Patente anterior"],["nova_patente","Nova patente"]])campo(k,label,r?.[k],"text");
        campo("nome_curso","Nome do curso",r?.nome_curso);
        campo("resultado","Resultado",r?.resultado||"Aprovado","text",Array.from(new Set(["Aprovado","Reprovado",...(r?.resultado?[r.resultado]:[])])).map(x=>[x,x]));
        campo("data_inicio","Início do afastamento",r?.data_inicio,"date");
        campo("data_termino","Término do afastamento",r?.data_termino,"date");
        campo("observacao","Observação",r?.observacao,"textarea",null,false);
        const ajustar=()=>{const grupos={patente_anterior:["promocao","rebaixamento"],nova_patente:["promocao","rebaixamento"],nome_curso:["curso"],resultado:["curso"],data_inicio:["afastamento"],data_termino:["afastamento"]};
            for(const [k,tipos] of Object.entries(grupos)){const ativo=tipos.includes(t.value);campos[k].disabled=!ativo;campos[k].required=ativo;campos[k].parentElement.hidden=!ativo;}
            campos.observacao.disabled=t.value==="afastamento";campos.observacao.parentElement.hidden=campos.observacao.disabled;
        };t.onchange=ajustar;ajustar();
    }
    campo("justificativa","Justificativa administrativa","","textarea");
    const erro=elemento("p","");erro.setAttribute("role","status");
    const b=elemento("button",excluir?"Excluir registro":"Salvar registro");b.type="submit";if(excluir)b.className="admin-perigo";
    f.append(b,histBotao("Cancelar",()=>area.replaceChildren()),erro);area.append(f);
    f.onsubmit=async e=>{
        e.preventDefault();if(histOcupado)return;
        const just=campos.justificativa.value.trim();if(!just){erro.textContent="Informe a justificativa.";return;}
        if(!window.confirm("Confirmar intervenção no histórico de "+m.nome+"?"))return;
        const args={p_justificativa:just};
        let rpc;
        if(excluir){rpc="admin_excluir_historico";Object.assign(args,{p_registro_id:r.id,p_dados_originais:r});}
        else{
            for(const [k,c] of Object.entries(campos)){if(k!=="justificativa")args["p_"+k]=c.disabled?null:c.value.trim()||null;}
            if(r){rpc="admin_editar_historico";Object.assign(args,{p_registro_id:r.id,p_dados_originais:r});}
            else{rpc="admin_adicionar_historico";args.p_militar_id=m.id;}
        }
        histOcupado=true;b.disabled=true;
        try{
            const data=await histRPC(rpc,args);if(data?.sucesso!==true)throw new Error(data?.mensagem||"Operação não confirmada.");
            histOcupado=false;await recarregar();msg.textContent=data.mensagem;carregar(true);
        }catch(e){erro.textContent=e.message||"Falha na operação.";}finally{histOcupado=false;b.disabled=false;}
    };
}
document.getElementById("admin-hist-abrir").onclick=()=>{if(!autorizado||histOcupado||salvando)return;histPainel.hidden=!histPainel.hidden;if(!histPainel.hidden){painel.hidden=true;histPesquisar(0,histBusca.elements.busca.value.trim());}};
histBusca.onsubmit=e=>{e.preventDefault();histPesquisar(0,histBusca.elements.busca.value.trim());};
histPrev.onclick=()=>histPesquisar(Math.max(0,histPagina-1));
histNext.onclick=()=>histPesquisar(histPagina+1);
