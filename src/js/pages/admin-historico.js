import { supabase } from "../supabase.js";
import { elemento, patentes, histRPC, funRotulo, adminCatalogoOrdenado, etapaAdmin } from "./admin-comum.js";
export function montarHistorico(estaAutorizado, carregar) {
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
async function histPesquisar(n=0,termo=histTermo){
    if(!estaAutorizado()||histOcupado)return;
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
    histDetalhe.append(barra,msg,registros,prev,next,formArea);etapaAdmin(histDetalhe,()=>histDetalhe.replaceChildren(),"Resultados da pesquisa",()=>histOcupado);listar();
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
    etapaAdmin(area,()=>area.replaceChildren(),"Histórico do militar",()=>histOcupado);
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
histBusca.onsubmit=e=>{e.preventDefault();histPesquisar(0,histBusca.elements.busca.value.trim());};
histPrev.onclick=()=>histPesquisar(Math.max(0,histPagina-1));
histNext.onclick=()=>histPesquisar(histPagina+1);


return {carregar:()=>histPesquisar(0,histBusca.elements.busca.value.trim()), ocupado:()=>histOcupado};
}
