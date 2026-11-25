import { supabase } from "../supabase.js";
import { elemento, patentes, histRPC, funRotulo, adminCatalogoOrdenado, etapaAdmin } from "./admin-comum.js";
export function montarMilitares(estaAutorizado, carregar) {
const painel = document.getElementById("admin-militares");
const pesquisa = document.getElementById("admin-pesquisa");
const milLista = document.getElementById("admin-mil-lista");
const milStatus = document.getElementById("admin-mil-status");
const edicao = document.getElementById("admin-mil-edicao");
const anterior = document.getElementById("admin-mil-anterior");
const proximo = document.getElementById("admin-mil-proximo");
const situacoes = ["ativo","afastado","desligamento_pendente","desligado"];
const cursos = {"Recruta":["IIB"],"Soldado-Recruta":["CFSd"],"Soldado":["CFCb"],"Cabo":["CFSg"],"Segundo-Sargento":["CASg"],"Primeiro-Sargento":["CFSb"],"Subtenente":["CASb","CIC"],"Cadete":["CPC"],"Aspirante-a-Oficial":["CFO"],"Segundo-Tenente":["CAO"],"Primeiro-Tenente":["CFCp"],"Capitão":["ADOM","CFMj"],"Major":["CQOS"],"Tenente-Coronel":["AOC"],"Coronel":["AFOS"]};
let pagina = 0, buscando = false, salvando = false;
async function listarMilitares(n = 0) {
    if (!estaAutorizado() || buscando || salvando) return;
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
    etapaAdmin(edicao,()=>edicao.replaceChildren(),"Resultados da pesquisa",()=>salvando||buscando);
    for(const [tipo,titulo] of [["cadastro","Editar cadastro"],["discord","Alterar Discord ID"],["status","Alterar situação"],["cursos","Cursos da patente"],["excluir","Excluir permanentemente"]]){
        const b=elemento("button",titulo);b.type="button";if(tipo==="excluir")b.className="admin-perigo";
        b.onclick=()=>{if(!salvando) formulario(m,tipo,area);};menu.append(b);
    }
}
function formulario(m,tipo,area){
    area.replaceChildren();
    etapaAdmin(area,()=>area.replaceChildren(),"Ações do militar",()=>salvando);
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
pesquisa.onsubmit=e=>{e.preventDefault();listarMilitares();};
anterior.onclick=()=>listarMilitares(Math.max(0,pagina-1));
proximo.onclick=()=>listarMilitares(pagina+1);


return {carregar:()=>listarMilitares(), ocupado:()=>salvando||buscando};
}
