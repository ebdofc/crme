import { supabase } from "../supabase.js";
import { elemento, patentes, histRPC, funRotulo, adminCatalogoOrdenado, etapaAdmin } from "./admin-comum.js";
export function montarFuncoes(estaAutorizado, carregar) {
const funPainel=document.getElementById("admin-funcoes");
const funBusca=document.getElementById("admin-fun-pesquisa");
const funStatus=document.getElementById("admin-fun-status");
const funMilitares=document.getElementById("admin-fun-militares");
const funDetalhe=document.getElementById("admin-fun-detalhe");
const funPrev=document.getElementById("admin-fun-prev"),funNext=document.getElementById("admin-fun-next");
let funOcupado=false,funPagina=0,funTermo="";
function funBotao(titulo,acao,perigo=false){
    const b=elemento("button",titulo);b.type="button";b.onclick=()=>{if(!funOcupado)acao();};if(perigo)b.className="admin-perigo";return b;
}
async function funPesquisar(n=0,termo=funTermo){
    if(!estaAutorizado()||funOcupado)return;
    funOcupado=true;funPrev.disabled=funNext.disabled=true;
    funDetalhe.replaceChildren();funMilitares.replaceChildren();funStatus.textContent="Carregando...";
    try{
        const data=await histRPC("admin_listar_militares",{p_pesquisa:termo||null,p_status:null,p_limite:26,p_offset:n*25});
        funPagina=n;funTermo=termo;
        for(const m of data.slice(0,25)){
            const linha=elemento("div","");linha.className="admin-mil-linha";
            linha.append(elemento("span",m.nome+" — "+(m.patente??"Sem patente")+" — "+m.status+" — "+m.discord_id),funBotao("Gerenciar funções",()=>funAbrir(m)));funMilitares.append(linha);
        }
        funStatus.textContent=data.length?"Página "+(n+1):"Nenhum militar encontrado.";
        funPrev.disabled=n===0;funNext.disabled=data.length<=25;
    }catch(e){funStatus.textContent=e.message||"Falha na pesquisa.";}finally{funOcupado=false;}
}
function funIgual(f,c){
    return f.codigo_vinculo===c.codigo_vinculo||(f.orgao===c.orgao&&(f.unidade??null)===(c.unidade??null)&&(f.funcao_codigo===c.funcao_codigo||f.funcao===c.funcao));
}
async function funAbrir(m,mensagem=""){
    if(funOcupado)return;
    funOcupado=true;funDetalhe.replaceChildren(elemento("h3","Funções de "+m.nome));
    const msg=elemento("p","Carregando...");msg.setAttribute("role","status");funDetalhe.append(msg);
    try{
        const [vinculos,catalogo]=await Promise.all([histRPC("admin_listar_funcoes",{p_militar_id:m.id}),adminCatalogoOrdenado()]);
        const area=elemento("div",""),barra=elemento("div","");barra.className="admin-mil-acoes";
        const adicionar=funBotao("Atribuir função",()=>funFormulario(m,null,"adicionar",vinculos,catalogo,area));
        adicionar.disabled=m.status==="desligado";barra.append(adicionar);funDetalhe.append(barra);
        for(const f of vinculos.slice().sort((a,b)=>{const pos=f=>{const i=catalogo.findIndex(c=>funIgual(f,c));return i<0?Number.MAX_SAFE_INTEGER:i;};return pos(a)-pos(b);})){
            const linha=elemento("div","");linha.className="admin-registro";
            const c=catalogo.find(x=>funIgual(f,x));
            linha.append(elemento("strong",funRotulo(c||f)));
            const a=elemento("div","");a.className="admin-mil-acoes";
            const substituir=funBotao("Substituir",()=>funFormulario(m,f,"substituir",vinculos,catalogo,area));
            substituir.disabled=m.status==="desligado";
            a.append(substituir,funBotao("Remover",()=>funFormulario(m,f,"remover",vinculos,catalogo,area),true));linha.append(a);funDetalhe.append(linha);
        }
        if(!vinculos.length)funDetalhe.append(elemento("p","Nenhuma função atribuída."));
        if(m.status==="desligado")funDetalhe.append(elemento("p","Militares desligados não podem receber novas funções."));
        funDetalhe.append(area);etapaAdmin(funDetalhe,()=>funDetalhe.replaceChildren(),"Resultados da pesquisa",()=>funOcupado);msg.textContent=mensagem||vinculos.length+" vínculo(s).";
    }catch(e){msg.textContent=e.message||"Falha na consulta.";}finally{funOcupado=false;}
}
function funFormulario(m,f,tipo,vinculos,catalogo,area){
    area.replaceChildren(elemento("h3",tipo==="adicionar"?"Atribuir função":tipo==="substituir"?"Substituir função":"Remover função"));
    const form=elemento("form","");form.className="admin-mil-form";
    if(f)form.append(elemento("p","Vínculo atual: "+funRotulo(catalogo.find(c=>funIgual(f,c))||f)));
    let escolha;
    if(tipo!=="remover"){
        const disponiveis=catalogo.filter(c=>!vinculos.some(v=>funIgual(v,c)));
        if(!disponiveis.length){area.append(elemento("p","Nenhuma função disponível."));return;}
        const l=elemento("label","Nova função");escolha=document.createElement("select");escolha.required=true;
        const vazio=elemento("option","Selecione uma função");vazio.value="";escolha.append(vazio);
        const grupos=new Map();
        for(const c of disponiveis){
            const chave=c.orgao_nome||c.orgao;
            if(!grupos.has(chave)){const g=document.createElement("optgroup");g.label=chave;grupos.set(chave,g);escolha.append(g);}
            const o=elemento("option",[c.unidade_nome||c.unidade,c.funcao].filter(Boolean).join(" — "));o.value=c.codigo_vinculo;grupos.get(chave).append(o);
        }
        l.append(escolha);form.append(l);
    }
    const l=elemento("label","Justificativa administrativa"),just=document.createElement("textarea");just.required=true;l.append(just);form.append(l);
    const msg=elemento("p","");msg.setAttribute("role","status");
    const b=elemento("button",tipo==="remover"?"Remover função":"Salvar");b.type="submit";if(tipo==="remover")b.className="admin-perigo";
    form.append(b,funBotao("Cancelar",()=>area.replaceChildren()),msg);area.append(form);
    etapaAdmin(area,()=>area.replaceChildren(),"Funções do militar",()=>funOcupado);
    form.onsubmit=async e=>{
        e.preventDefault();if(funOcupado)return;
        if(!just.value.trim()){msg.textContent="Informe a justificativa.";return;}
        if(!window.confirm("Confirmar "+tipo+" função de "+m.nome+"?"))return;
        const args={p_justificativa:just.value.trim()};
        let rpc;
        if(tipo==="adicionar"){rpc="admin_adicionar_funcao";Object.assign(args,{p_militar_id:m.id,p_codigo_vinculo:escolha.value});}
        else{Object.assign(args,{p_funcao_id:f.id,p_dados_originais:f});if(tipo==="substituir"){rpc="admin_substituir_funcao";args.p_novo_codigo_vinculo=escolha.value;}else rpc="admin_remover_funcao";}
        funOcupado=true;b.disabled=true;
        try{
            const data=await histRPC(rpc,args);if(data?.sucesso!==true)throw new Error(data?.mensagem||"Operação não confirmada.");
            funOcupado=false;await funAbrir(m,data.mensagem);carregar(true);
        }catch(e){msg.textContent=e.message||"Falha na operação.";}finally{funOcupado=false;b.disabled=false;}
    };
}
funBusca.onsubmit=e=>{e.preventDefault();funPesquisar(0,funBusca.elements.busca.value.trim());};
funPrev.onclick=()=>funPesquisar(Math.max(0,funPagina-1));
funNext.onclick=()=>funPesquisar(funPagina+1);


return {carregar:()=>funPesquisar(0,funBusca.elements.busca.value.trim()), ocupado:()=>funOcupado};
}
