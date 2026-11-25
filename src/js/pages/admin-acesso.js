import { supabase } from "../supabase.js";

export function montarAcesso(painel, atualizarAuditoria) {
 const $=id=>painel.querySelector("#ac-"+id);
 painel.innerHTML=`<h2>Gerenciamento de acesso</h2>
 <div class="admin-mil-acoes"><button type="button" id="ac-tab-cargos">Patentes e cargos autorizados</button><button type="button" id="ac-tab-bloqueios">Bloqueios individuais</button><button type="button" id="ac-atualizar">Atualizar</button></div>
 <form class="admin-mil-form" id="ac-cargos" hidden><p>Administradores mantêm acesso. Cargos do Poder Administrativo prevalecem sobre a patente.</p><div class="admin-mil-acoes"><button type="button" id="ac-todos">Selecionar todos</button><button type="button" id="ac-nenhum">Desmarcar todos</button></div><div id="ac-opcoes"></div><label>Justificativa<textarea id="ac-just" required></textarea></label><button type="submit">Salvar autorizações</button></form>
 <div id="ac-bloqueios" hidden><form class="admin-mil-form" id="ac-buscar"><label>Pesquisar militar<input id="ac-busca" placeholder="Nome ou Discord ID" required></label><button>Pesquisar</button></form><div id="ac-resultados"></div><form class="admin-mil-form" id="ac-bloquear" hidden><h3 id="ac-alvo"></h3><label>Justificativa<textarea id="ac-motivo" required></textarea></label><label>Término (horário de Brasília)<input type="datetime-local" id="ac-termino"></label><p>Deixe vazio para bloqueio indeterminado.</p><button class="admin-perigo">Bloquear acesso</button></form><h3>Bloqueios registrados</h3><div id="ac-lista"></div></div><p id="ac-status" role="status"></p>`;
 let ocupado=false, config=null, alvo=null, aba="cargos";
 const el=(tag,t)=>{const e=document.createElement(tag);e.textContent=t;return e;};
 const rpc=async(n,args={})=>{const {data,error}=await supabase.rpc(n,args);if(error)throw error;return data;};
 const botao=(t,fn)=>{const b=el("button",t);b.type="button";b.onclick=fn;return b;};
 const data=v=>v?new Date(v).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}):"Indeterminado";
 function mostrar(){ $("cargos").hidden=!config||aba!=="cargos";$("bloqueios").hidden=!config||aba!=="bloqueios"; }
 function preencher(d){
  if(!Array.isArray(d?.opcoes)||!Array.isArray(d?.bloqueios))throw Error("Resposta inválida.");
  config=d; $("opcoes").replaceChildren(); const grupos=new Map();
  for(const a of d.opcoes){
   if(!grupos.has(a.grupo)){const f=el("fieldset","");f.append(el("legend",a.grupo));grupos.set(a.grupo,f);$("opcoes").append(f);}
   const l=el("label"," "+a.nome),c=document.createElement("input");c.type="checkbox";c.value=a.codigo;c.checked=a.autorizado;l.prepend(c);grupos.get(a.grupo).append(l);
  }
  $("just").value="";$("lista").replaceChildren();
  for(const b of d.bloqueios){
   const linha=el("div","");linha.className="admin-registro";
   linha.append(el("strong",b.nome+" — "+(b.patente||"Sem patente")),el("p","Situação: "+({ativo:"Ativo",encerrado:"Expirado",desbloqueado:"Desbloqueado"}[b.situacao]||b.situacao)),el("p","Justificativa: "+b.justificativa),el("p","Responsável: "+(b.responsavel||"—")+" | Início: "+data(b.bloqueado_em)+" | Término: "+data(b.termino_em)));
   if(b.situacao==="ativo")linha.append(botao("Desbloquear",()=>{if(ocupado)return;const j=prompt("Justificativa do desbloqueio:");if(j?.trim()&&confirm("Confirmar desbloqueio?"))executar(async()=>{await rpc("sistema_acesso_desbloquear",{p_bloqueio_id:b.id,p_justificativa:j.trim()});await recarregar();atualizarAuditoria();});}));
   $("lista").append(linha);
  }
  if(!d.bloqueios.length)$("lista").append(el("p","Nenhum bloqueio registrado."));
  mostrar();
 }
 async function executar(fn){if(ocupado)return;ocupado=true;const controles=[...painel.querySelectorAll("button,input,textarea")];controles.forEach(c=>c.disabled=true);$("status").textContent="Processando...";try{await fn();$("status").textContent="Operação concluída.";}catch(e){$("status").textContent=e.message||"Falha na operação.";}finally{ocupado=false;controles.forEach(c=>c.disabled=false);}}
 const recarregar=async()=>preencher(await rpc("sistema_acesso_consultar"));
 const carregar=()=>executar(recarregar);
 $("atualizar").onclick=carregar;
 $("tab-cargos").onclick=()=>{aba="cargos";mostrar();};
 $("tab-bloqueios").onclick=()=>{aba="bloqueios";mostrar();};
 for(const [id,valor] of [["todos",true],["nenhum",false]])$(id).onclick=()=>{for(const c of $("opcoes").querySelectorAll("input"))c.checked=valor;};
 $("cargos").onsubmit=e=>{e.preventDefault();if(!confirm("Salvar as autorizações de acesso?"))return;executar(async()=>{await rpc("sistema_acesso_configurar",{p_autorizados:[...$("opcoes").querySelectorAll("input:checked")].map(c=>c.value),p_justificativa:$("just").value.trim()});await recarregar();atualizarAuditoria();});};
 $("buscar").onsubmit=e=>{e.preventDefault();executar(async()=>{
  alvo=null;$("bloquear").hidden=true;$("resultados").replaceChildren();
  const busca=$("busca").value.trim();if(!busca)throw Error("Informe nome ou Discord ID.");
  const grupos=await Promise.all(["ativo","afastado"].map(s=>rpc("admin_listar_militares",{p_pesquisa:busca,p_status:s,p_limite:100,p_offset:0})));
  for(const m of grupos.flat()){const linha=el("div","");linha.className="admin-mil-linha";linha.append(el("span",m.nome+" — "+m.patente+" — "+m.discord_id),botao("Selecionar",()=>{if(ocupado)return;alvo=m;$("alvo").textContent=m.nome;$("bloquear").reset();$("bloquear").hidden=false;}));$("resultados").append(linha);}
  if(!$("resultados").children.length)$("resultados").append(el("p","Nenhum militar encontrado."));
 });};
 $("bloquear").onsubmit=e=>{e.preventDefault();if(!alvo||!confirm("Bloquear o acesso de "+alvo.nome+"?"))return;executar(async()=>{const t=$("termino").value;await rpc("sistema_acesso_bloquear",{p_militar_id:alvo.id,p_justificativa:$("motivo").value.trim(),p_termino_em:t?new Date(t+":00-03:00").toISOString():null});alvo=null;$("bloquear").hidden=true;await recarregar();atualizarAuditoria();});};
 return {carregar,ocupado:()=>ocupado};
}
