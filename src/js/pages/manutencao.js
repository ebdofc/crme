import { supabase } from "../supabase.js";

const paginas = new Set(["dashboard", "noticias", "documentos", "consultar", "controle-patentes", "alistamento", "acoes", "aulas", "orgaos", "ciclos", "permanencia", "monitoramento"]);
const origem = new URLSearchParams(location.search).get("origem") || "dashboard";
const pagina = paginas.has(origem) ? origem : "dashboard";
const titulo = document.getElementById("maintenance-title");
const descricao = document.getElementById("maintenance-description");
const termino = document.getElementById("maintenance-end");
const status = document.getElementById("maintenance-status");
const botao = document.getElementById("maintenance-retry");
let consultando = false;

async function verificar() {
    if (consultando) return;
    consultando = true;
    botao.disabled = true;
    try {
        const { data, error } = await supabase.rpc("sistema_manutencao_verificar", { p_pagina: pagina });
        if (error || typeof data?.bloqueada !== "boolean") throw error || new Error("Resposta inválida");
        if (!data.bloqueada) {
            const { data: auth, error: authError } = await supabase.auth.getSession();
            if (authError) throw authError;
            location.replace(auth.session ? "/" + pagina + ".html" : "/");
            return;
        }
        titulo.textContent = data.titulo || "Sistema em manutenção";
        descricao.textContent = data.descricao || "O sistema encontra-se temporariamente indisponível.";
        termino.hidden = !data.termino_em;
        if (data.termino_em) {
            termino.textContent = "Previsão de retorno: " + new Intl.DateTimeFormat("pt-BR", {
                dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo"
            }).format(new Date(data.termino_em)) + " (horário de Brasília)";
        }
        status.textContent = "A disponibilidade é verificada automaticamente.";
    } catch (error) {
        console.error("Erro ao consultar manutenção", error);
        status.textContent = "Não foi possível consultar a disponibilidade. Tentaremos novamente.";
    } finally {
        consultando = false;
        botao.disabled = false;
    }
}
botao.addEventListener("click", verificar);
document.addEventListener("visibilitychange", () => { if (!document.hidden) verificar(); });
verificar();
setInterval(verificar, 30000);
