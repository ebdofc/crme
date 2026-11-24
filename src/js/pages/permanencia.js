import { supabase } from "../supabase.js";
const $ = id => document.getElementById(id);
let efetivo = [], ocorrencias = [], aba = "pendente", ocupado = false, autorizado = false, meuId;
const data = v => v ? new Date(v).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}) : "Não verificado";
const presenca = m => m?.presente_servidor === true ? "Presente" : m?.presente_servidor === false ? "Ausente" : "Indeterminada";
const situacao = v => ({ativo:"Ativo",afastado:"Afastado",desligamento_pendente:"Desligamento pendente",desligado:"Desligado",mantido:"Mantido",reativado:"Reativado"})[v] || v || "Não informada";
function el(tag, texto, classe) {
 const e = document.createElement(tag); e.textContent = texto ?? ""; if(classe)e.className=classe; return e;
}
function conferir(r){if(r.error)throw r.error;return r.data;}
async function carregar(){
 if(conferir(await supabase.rpc("permanencia_pode_gerenciar"))!==true)throw new Error("Acesso não autorizado.");
 efetivo=conferir(await supabase.rpc("permanencia_listar_efetivo"))||[];
 const lista=[];
 for(let i=0;;i+=500){
 const parte=conferir(await supabase.from("permanencia_ocorrencias").select("*,militares!permanencia_ocorrencias_militar_id_fkey(nome,discord_id,patente,status)").order("aberta_em",{ascending:false}).order("id").range(i,i+499))||[];
 lista.push(...parte);if(parte.length<500)break;
 }
 ocorrencias=lista;renderizar();
}
function renderizar(){
 const lista=$("lista");lista.replaceChildren();
 const busca=$("pesquisa").value.trim().toLowerCase();
 const itens=aba==="efetivo"?efetivo:ocorrencias.filter(o=>o.situacao===aba);
 for(const item of itens){
 const m=aba==="efetivo"?item:item.militares||{};
 const atual=efetivo.find(e=>e.militar_id===item.militar_id);
 if(![m.nome,m.discord_id,situacao(m.status),m.patente,situacao(item.status_anterior)].some(v=>String(v??"").toLowerCase().includes(busca)))continue;
 const card=el("article","","permanencia-card");
 card.append(el("h3",m.nome||"Militar"),el("p",[m.patente||"Sem patente",situacao(m.status),m.discord_id].filter(Boolean).join(" · ")));
 if(aba==="efetivo"||aba==="pendente"){
 card.append(el("p",atual?presenca(atual)+" · Última verificação: "+data(atual.ultima_verificacao):"Fora do efetivo monitorado"));
 }
 if(aba!=="efetivo"){
 card.append(el("p","Abertura: "+data(item.aberta_em)));
 if(item.status_anterior)card.append(el("p","Situação anterior: "+situacao(item.status_anterior)));
 const movimentos=el("ul","");
 for(const mov of item.movimentacoes||[])movimentos.append(el("li",(mov.verificacao_inicial?"Ausência inicial":mov.tipo==="saida"?"Saída":"Retorno")+" — "+data(mov.detectado_em)+" ("+mov.origem+")"));
 card.append(movimentos);
 if(aba==="resolvida")card.append(el("p","Decisão: "+situacao(item.decisao)+" · "+data(item.resolvida_em)),el("p","Responsável: "+item.responsavel_nome),el("p","Justificativa: "+item.justificativa));
 else if(item.militar_id!==meuId){
 const form=el("form","","permanencia-form");
 const label=el("label","Justificativa obrigatória");const campo=el("textarea","");campo.required=true;label.append(campo);form.append(label);
 for(const decisao of ["reativado","desligado"]){
 const b=el("button",decisao==="reativado"?"Reativar militar":"Confirmar desligamento");b.type="button";b.disabled=ocupado||(decisao==="reativado"&&(m.status!=="desligamento_pendente"||atual?.presente_servidor!==true));
 b.onclick=()=>resolver(item,decisao,campo.value);form.append(b);
 }card.append(form);
 }
 }lista.append(card);
 }
 if(!lista.children.length)lista.append(el("p","Nenhum registro encontrado."));
}
async function verificar(){
 const r=conferir(await supabase.functions.invoke("verificar-permanencia",{body:{}}));
 if(!r?.sucesso)throw new Error("Verificação incompleta. Consulte os logs.");
 return r;
}
async function executar(fn){
 if(ocupado||!autorizado)return;ocupado=true;$("verificar").disabled=true;$("atualizar").disabled=true;
 try{await fn();await carregar();}catch(e){$("resultado").textContent=e.message||"Falha na operação.";}
 finally{ocupado=false;$("verificar").disabled=false;$("atualizar").disabled=false;renderizar();}
}
function resolver(o,decisao,justificativa){
 if(!justificativa.trim()){$("resultado").textContent="Informe a justificativa.";return;}
 if(!confirm(decisao==="reativado"?"Reativar militar?":"Confirmar desligamento definitivo?"))return;
 executar(async()=>{
 if(decisao==="reativado"){await verificar();await carregar();if(efetivo.find(m=>m.militar_id===o.militar_id)?.presente_servidor!==true)throw new Error("Presença não confirmada.");}
 conferir(await supabase.rpc("permanencia_resolver_ocorrencia",{p_ocorrencia_id:o.id,p_decisao:decisao,p_justificativa:justificativa.trim()}));
 $("resultado").textContent="Ocorrência resolvida.";
 });
}
$("verificar").onclick=()=>executar(async()=>{const r=await verificar();$("resultado").textContent="Verificados: "+r.verificados+" · Presentes: "+r.presentes+" · Ausentes: "+r.ausentes;});
$("atualizar").onclick=()=>executar(async()=>{$("resultado").textContent="Lista atualizada.";});
$("pesquisa").oninput=renderizar;
document.querySelectorAll("[data-aba]").forEach(b=>b.onclick=()=>{aba=b.dataset.aba;document.querySelectorAll("[data-aba]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));renderizar();});
window.addEventListener("pageshow",async()=>{
 try{
 meuId=conferir(await supabase.rpc("crme_militar_id"));
 await carregar();autorizado=true;$("acesso").hidden=true;$("permanencia").hidden=false;
 }catch(e){$("acesso").textContent=e.message||"Não foi possível acessar o módulo.";}
});
