import { supabase } from "../supabase.js";
export function elemento(tag, texto) {
    const el = document.createElement(tag);
    el.textContent = texto;
    return el;
}
export const patentes = ["Recruta","Soldado-Recruta","Soldado","Cabo","Terceiro-Sargento","Segundo-Sargento","Primeiro-Sargento","Subtenente","Cadete","Aspirante-a-Oficial","Segundo-Tenente","Primeiro-Tenente","Capitão","Major","Tenente-Coronel","Coronel","General-de-Brigada","General-de-Divisão","General-de-Exército","Marechal"];
export async function histRPC(nome,args){
    const {data,error}=await supabase.rpc(nome,args);if(error)throw error;return data;
}
export function funRotulo(c){return [c.orgao_nome||c.orgao,c.unidade_nome||c.unidade,c.funcao].filter(Boolean).join(" — ");}
export async function adminCatalogoOrdenado(){
    const [catalogo,resposta]=await Promise.all([
        histRPC("admin_listar_catalogo_vinculos",{}),
        fetch("/orgaos.json",{cache:"no-store"})
    ]);
    if(!resposta.ok)throw new Error("Não foi possível carregar a ordem institucional.");
    const estrutura=await resposta.json();
    const normalizar=v=>String(v??"").trim().normalize("NFC").toLocaleLowerCase("pt-BR");
    const ordem=[];
    function visitar(no,orgao,unidade=null){
        for(const f of no.funcoes||[])ordem.push({orgao,unidade,f});
        for(const u of [...(no.unidades||[]),...(no.subunidades||[])])visitar(u,orgao,u);
    }
    for(const categoria of estrutura.categorias)for(const orgao of categoria.orgaos||[])visitar(orgao,orgao);
    const igual=(valor,...alternativas)=>normalizar(valor)!==""&&alternativas.some(a=>normalizar(a)===normalizar(valor));
    const pos=c=>{
        const i=ordem.findIndex(({orgao,unidade,f})=>
            (igual(c.orgao,orgao.codigo,orgao.nome)||igual(c.orgao_nome,orgao.nome))&&
            (igual(c.codigo_vinculo,f.codigo)||(
                (unidade?(igual(c.unidade,unidade.codigo,unidade.nome)||igual(c.unidade_nome,unidade.nome)):!c.unidade&&!c.unidade_nome)&&
                (igual(c.funcao_codigo,f.codigo,f.nome)||igual(c.funcao,f.nome))
            ))
        );
        return i<0?Number.MAX_SAFE_INTEGER:i;
    };
    return catalogo.slice().sort((a,b)=>pos(a)-pos(b));
}

export function topoAdmin(){window.scrollTo({top:0,behavior:"instant"});}
export function etapaAdmin(area, voltar, rotulo, ocupado=()=>false){
    const pai=area.parentElement;
    if(!pai)return;
    const anteriores=[...pai.children].filter(e=>e!==area&&!e.hidden&&!e.classList.contains("admin-navegacao")&&e.tagName!=="H2");
    anteriores.forEach(e=>e.hidden=true);
    const barra=elemento("div","");barra.className="admin-navegacao admin-mil-acoes";
    const b=elemento("button","← "+rotulo);b.type="button";
    const restaurar=()=>{anteriores.forEach(e=>e.hidden=false);barra.remove();};
    b.onclick=()=>{if(ocupado())return;restaurar();voltar();topoAdmin();};
    area.prepend(barra);
    const obs=new MutationObserver(()=>{if(!area.contains(barra)){restaurar();obs.disconnect();}});
    obs.observe(area,{childList:true});
    topoAdmin();
}
