import { supabase } from "../supabase.js";
import { elemento, patentes, histRPC, funRotulo, adminCatalogoOrdenado } from "./admin-comum.js";
export function montarNotificacoes(estaAutorizado, carregar) {
const notPainel=document.getElementById("admin-notificacoes");
const notConteudo=document.getElementById("admin-not-conteudo");
let notOcupado=false,notInicializado=false;
async function notMontar(){
    notOcupado=true;notConteudo.replaceChildren(elemento("p","Carregando catálogo..."));
    try{
        const catalogo=await adminCatalogoOrdenado();
        notConteudo.replaceChildren();
        const form=elemento("form","");form.className="admin-mil-form";
        function campo(rotulo,tag){const l=elemento("label",rotulo),c=document.createElement(tag);l.append(c);form.append(l);return c;}
        const titulo=campo("Título","input"),mensagem=campo("Mensagem","textarea"),link=campo("Link interno (opcional)","select"),just=campo("Justificativa administrativa","textarea");
        titulo.required=mensagem.required=just.required=true;
        function opcao(select,valor,rotulo){const o=elemento("option",rotulo);o.value=valor;select.append(o);}
        opcao(link,"","Sem link");
        for(const [p,n] of Object.entries({"dashboard.html":"Início","noticias.html":"Notícias","documentos.html":"Documentos","consultar.html":"Consultar militares","controle-patentes.html":"Controle de efetivo","alistamento.html":"Alistamento","acoes.html":"Ações","aulas.html":"Aulas","orgaos.html":"Órgãos","ciclos.html":"Ciclos de promoção","permanencia.html":"Permanência","monitoramento.html":"Monitoramento","administracao.html":"Administração"}))opcao(link,p,n);
        const criterios=new Map();
        const tipo=campo("Tipo de destinatário","select");
        for(const [v,n] of Object.entries({todos:"Todos os militares",orgao:"Órgão",unidade:"Unidade",funcao:"Função institucional",patente:"Patente",classificacao:"Classificação hierárquica",militar:"Militar específico"}))opcao(tipo,v,n);
        const seletor=campo("Destinatário","select");
        const busca=campo("Pesquisar militar por nome ou Discord ID","input");
        const buscar=elemento("button","Pesquisar");buscar.type="button";form.append(buscar);
        const adicionar=elemento("button","Adicionar destinatário");adicionar.type="button";form.append(adicionar);
        const lista=elemento("div",""),previa=elemento("div",""),status=elemento("p","");status.setAttribute("role","status");
        const consultar=elemento("button","Visualizar destinatários");consultar.type="button";
        const enviar=elemento("button","Confirmar envio");enviar.type="submit";enviar.disabled=true;
        form.append(lista,consultar,previa,enviar,status);notConteudo.append(form);
        let opcoes=[],confirmados=null;
        function invalidar(){confirmados=null;enviar.disabled=true;previa.replaceChildren();}
        function renderLista(){
            lista.replaceChildren(elemento("strong","Critérios selecionados"));
            if(!criterios.size)lista.append(elemento("p","Nenhum destinatário selecionado."));
            for(const [k,item] of criterios){const linha=elemento("div","");linha.className="admin-mil-linha";const b=elemento("button","Remover");b.type="button";b.onclick=()=>{if(notOcupado)return;criterios.delete(k);invalidar();renderLista();};linha.append(elemento("span",item.rotulo),b);lista.append(linha);}
        }
        function preencher(items){opcoes=items;seletor.replaceChildren();opcao(seletor,"","Selecione");items.forEach((x,i)=>opcao(seletor,String(i),x.rotulo));}
        function item(tipo,codigo,rotulo,orgao){return {criterio:{tipo,...(codigo?{codigo}:{}),...(orgao?{orgao}:{})},rotulo};}
        function ajustar(){
            const t=tipo.value;busca.parentElement.hidden=buscar.hidden=t!=="militar";seletor.parentElement.hidden=t==="todos";
            let items=[];
            if(t==="orgao")items=[...new Map(catalogo.map(c=>[c.orgao,item(t,c.orgao,c.orgao_nome||c.orgao)])).values()];
            if(t==="unidade")items=[...new Map(catalogo.filter(c=>c.unidade).map(c=>[JSON.stringify([c.orgao,c.unidade]),item(t,c.unidade,(c.orgao_nome||c.orgao)+" — "+(c.unidade_nome||c.unidade),c.orgao)])).values()];
            if(t==="funcao")items=catalogo.map(c=>item(t,c.codigo_vinculo,funRotulo(c)));
            if(t==="patente")items=patentes.map(p=>item(t,p,p));
            if(t==="classificacao")items=Object.entries({oficial_general:"Oficial General",oficial_superior:"Oficial Superior",oficial_intermediario:"Oficial Intermediário",oficial_subalterno:"Oficial Subalterno",praca_especial:"Praça Especial",praca_graduado:"Praça Graduado",praca_base:"Praça de Base"}).map(([k,v])=>item(t,k,v));
            preencher(items);
        }
        tipo.onchange=ajustar;
        buscar.onclick=async()=>{
            if(notOcupado)return;notOcupado=true;buscar.disabled=true;
            try{
                const args={p_pesquisa:busca.value.trim()||null,p_limite:100,p_offset:0};
                const grupos=await Promise.all(["ativo","afastado"].map(p_status=>histRPC("admin_listar_militares",{...args,p_status})));
                preencher(grupos.flat().map(m=>item("militar",m.id,m.nome+" — "+m.patente+" — "+m.discord_id)));
                status.textContent=opcoes.length+" resultado(s)."+(grupos.some(g=>g.length===100)?" Refine a pesquisa para encontrar outros militares.":"");
            }catch(e){status.textContent=e.message;}finally{notOcupado=false;buscar.disabled=false;}
        };
        adicionar.onclick=()=>{if(notOcupado)return;const x=tipo.value==="todos"?item("todos",null,"Todos os militares"):seletor.value!==""?opcoes[Number(seletor.value)]:null;if(!x){status.textContent="Selecione um destinatário.";return;}criterios.set(JSON.stringify(x.criterio),x);invalidar();renderLista();status.textContent="";};
        const selecao=()=>[...criterios.values()].map(x=>x.criterio);
        consultar.onclick=async()=>{
            if(notOcupado)return;invalidar();if(!criterios.size){status.textContent="Selecione pelo menos um destinatário.";return;}
            notOcupado=true;consultar.disabled=true;
            try{
                const d=await histRPC("admin_notificacoes_previa",{p_destinatarios:selecao()});
                if(d?.sucesso!==true)throw new Error("Prévia não confirmada.");
                previa.append(elemento("strong",d.total+" destinatário(s) — "+d.ativos+" ativos, "+d.afastados+" afastados"));
                const detalhes=elemento("details","");detalhes.append(elemento("summary","Relação nominal"));
                for(const m of d.militares)detalhes.append(elemento("p",m.nome+" — "+m.patente+" — "+m.status));
                previa.append(detalhes);confirmados=d.militares.map(m=>m.id);enviar.disabled=!confirmados.length;status.textContent=d.total?"Confira a prévia antes de enviar.":"Nenhum destinatário elegível.";
            }catch(e){status.textContent=e.message;}finally{notOcupado=false;consultar.disabled=false;}
        };
        form.onsubmit=async e=>{
            e.preventDefault();if(notOcupado||!confirmados?.length)return;
            if(!titulo.value.trim()||!mensagem.value.trim()||!just.value.trim()){status.textContent="Preencha título, mensagem e justificativa.";return;}
            if(!window.confirm("Enviar a notificação para "+confirmados.length+" militar(es)?"))return;
            notOcupado=true;enviar.disabled=true;
            try{
                const d=await histRPC("admin_notificacoes_enviar",{p_titulo:titulo.value,p_mensagem:mensagem.value,p_link:link.value||null,p_justificativa:just.value,p_destinatarios:selecao(),p_destinatarios_confirmados:confirmados});
                if(d?.sucesso!==true)throw new Error(d?.mensagem||"Envio não confirmado.");
                form.reset();criterios.clear();invalidar();renderLista();ajustar();status.textContent=d.mensagem+" Total: "+d.total_enviadas+".";carregar(true);
            }catch(e){invalidar();status.textContent=(e.message||"Falha no envio.")+" Consulte a auditoria e atualize a prévia antes de tentar novamente.";}finally{notOcupado=false;}
        };
        ajustar();renderLista();notInicializado=true;
    }catch(e){notConteudo.replaceChildren(elemento("p",e.message||"Falha ao carregar catálogo."));}finally{notOcupado=false;}
}

return {carregar:()=>{if(!notInicializado)notMontar();}, ocupado:()=>notOcupado};
}
