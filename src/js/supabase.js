import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const operacoesAdministrativas = new Set([
    "admin_editar_militar", "admin_alterar_discord_id", "admin_alterar_status",
    "admin_editar_cursos_patente", "admin_excluir_militar",
    "admin_excluir_historico", "admin_editar_historico", "admin_adicionar_historico",
    "admin_adicionar_funcao", "admin_substituir_funcao", "admin_remover_funcao",
    "admin_notificacoes_enviar", "sistema_acesso_desbloquear",
    "sistema_acesso_configurar", "sistema_acesso_bloquear",
    "sistema_manutencao_configurar", "sistema_manutencao_desativar"
]);

export const supabase = createClient(supabaseUrl, supabaseKey, {
    global: {
        fetch: (input, init) => {
            const url = new URL(typeof input === "string" ? input : input.url || input.href, location.href);
            const opcao = document.getElementById("admin-nao-registrar-auditoria");
            const rpc = url.pathname.split("/").pop();
            if (opcao?.checked && !opcao.closest("[hidden]") &&
                url.origin === new URL(supabaseUrl).origin &&
                url.pathname.includes("/rest/v1/rpc/") &&
                operacoesAdministrativas.has(rpc) &&
                (init?.method || "").toUpperCase() === "POST") {
                opcao.checked = false;
                const headers = new Headers(init.headers);
                headers.set("x-crme-nao-registrar-auditoria", "true");
                return fetch(input, {...init, headers});
            }
            return fetch(input, init);
        }
    }
});