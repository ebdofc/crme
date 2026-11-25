import { supabase } from "../supabase.js";
import { elemento, patentes, histRPC, funRotulo, adminCatalogoOrdenado } from "./admin-comum.js";
export function montarAuditoria(estaAutorizado) {
const lista = document.getElementById("admin-auditoria");
const status = document.getElementById("admin-status");
const mais = document.getElementById("admin-mais");
const atualizar = document.getElementById("admin-atualizar");
let ocupado = false, offset = 0;
async function carregar(reiniciar = false) {
    if (!estaAutorizado() || ocupado) return;
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
atualizar.addEventListener("click",()=>carregar(true));
mais.addEventListener("click",()=>carregar());


return {carregar:()=>carregar(true), ocupado:()=>ocupado};
}
