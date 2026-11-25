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
 const secao=document.getElementById("admin-gestao")?.closest(".dashboard-section");
 if(!secao||document.getElementById("admin-nao-registrar-auditoria"))return;
 const bloco=document.createElement("p");
 const label=document.createElement("label");
 const check=document.createElement("input");
 check.type="checkbox";
 check.id="admin-nao-registrar-auditoria";
 check.checked=false;
 label.append(check,document.createTextNode(" Não registrar auditoria"));
 const nota=document.createElement("small");
 nota.textContent=" — Somente para a próxima operação administrativa de teste.";
 bloco.append(label,nota);
 secao.querySelector("p")?.after(bloco);
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
for(const [botao,painel,modulo] of modulos){
 $(botao).onclick=()=>{
  if(!autorizado||modulos.some(([, ,m])=>m.ocupado()))return;
  const abrir=$(painel).hidden;
  for(const [b,p] of modulos){
   $(p).hidden=true;
   $(b).setAttribute("aria-pressed","false");
  }
  if(abrir){
   $(painel).hidden=false;
   $(botao).setAttribute("aria-pressed","true");
   modulo.carregar();
  }
 };
}
