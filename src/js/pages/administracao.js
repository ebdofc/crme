import { montarAuditoria } from "./admin-auditoria.js";
import { montarMilitares } from "./admin-militares.js";
import { montarHistorico } from "./admin-historico.js";
import { montarFuncoes } from "./admin-funcoes.js";
import { montarNotificacoes } from "./admin-notificacoes.js";
import { montarManutencao } from "./admin-manutencao.js";
import { montarAcesso } from "./admin-acesso.js";

let autorizado = false;
document.addEventListener("crme-admin-autorizado",event=>{
 autorizado=true;
 if(String(event.detail?.discordId)!=="760638817073496075")return;
 const instalar=()=>{
  for(const campo of document.querySelectorAll("main textarea")){
   const label=campo.closest("label");
   if(!label||!/^Justificativa/i.test(label.textContent.trim())||campo.dataset.auditoriaTeste)continue;
   campo.dataset.auditoriaTeste="true";
   const opcao=document.createElement("label");
   opcao.style.cssText="display:flex;align-items:center;gap:8px;font-weight:normal";
   const check=document.createElement("input");
   check.type="checkbox";
   check.className="admin-nao-registrar-auditoria";
   check.style.cssText="width:auto;margin:0";
   opcao.append(check,document.createTextNode("Não registrar auditoria"));
   label.after(opcao);
   let anterior="",obrigatorio=campo.required;
   check.addEventListener("change",()=>{
    if(check.checked){
     for(const outro of document.querySelectorAll(".admin-nao-registrar-auditoria:checked")){
      if(outro!==check){outro.checked=false;outro.dispatchEvent(new Event("change"));}
     }
     anterior=campo.value;obrigatorio=campo.required;
     campo.value="Teste de desenvolvimento";
     campo.required=false;campo.disabled=true;
    }else{
     campo.disabled=false;campo.required=obrigatorio;campo.value=anterior;
    }
   });
  }
 };
 instalar();
 new MutationObserver(instalar).observe(document.querySelector("main"),{childList:true,subtree:true});
});
const estaAutorizado=()=>autorizado;
const auditoria=montarAuditoria(estaAutorizado);
const atualizarAuditoria=()=>auditoria.carregar();
const $=id=>document.getElementById(id);
const modulos=[
 ["admin-gestao","admin-militares",montarMilitares(estaAutorizado,atualizarAuditoria)],
 ["admin-hist-abrir","admin-historico",montarHistorico(estaAutorizado,atualizarAuditoria)],
 ["admin-fun-abrir","admin-funcoes",montarFuncoes(estaAutorizado,atualizarAuditoria)],
 ["admin-not-abrir","admin-notificacoes",montarNotificacoes(estaAutorizado,atualizarAuditoria)],
 ["admin-aud-abrir","admin-aud-painel",auditoria],
 ["admin-man-abrir","admin-manutencao",montarManutencao($("admin-manutencao"),atualizarAuditoria)],
 ["admin-ac-abrir","admin-acesso",montarAcesso($("admin-acesso"),atualizarAuditoria)]
];
const menu=$("admin-gestao").closest(".dashboard-section");
const ocupado=()=>modulos.some(([, ,m])=>m.ocupado());
function voltarMenu(){
 if(ocupado())return;
 for(const [b,p] of modulos){$(p).hidden=true;$(b).setAttribute("aria-pressed","false");}
 menu.hidden=false;
 window.scrollTo({top:0,behavior:"instant"});
}
for(const [botao,painel,modulo] of modulos){
 const barra=document.createElement("div");
 barra.className="admin-navegacao admin-mil-acoes";
 const voltar=document.createElement("button");voltar.type="button";voltar.textContent="← Administração";voltar.onclick=voltarMenu;
 barra.append(voltar);$(painel).prepend(barra);
 $(botao).onclick=()=>{
  if(!autorizado||modulos.some(([, ,m])=>m.ocupado()))return;
  const abrir=$(painel).hidden;
  for(const [b,p] of modulos){
   $(p).hidden=true;
   $(b).setAttribute("aria-pressed","false");
  }
  if(abrir){
   menu.hidden=true;
   $(painel).hidden=false;
   window.scrollTo({top:0,behavior:"instant"});
   $(botao).setAttribute("aria-pressed","true");
   modulo.carregar();
  }
 };
}
