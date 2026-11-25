import { supabase } from "../supabase.js";

export async function carregarAdvertencias(painel, codigos, vigente) {
    painel.textContent = "Carregando subordinados...";
    try {
        const { data, error } = await supabase.rpc("advertencias_institucionais_listar");
        if (error) throw error;
        if (!vigente()) return;
        const lista = (data || []).filter(v => codigos.includes(v.vinculo_autor));
        painel.replaceChildren();
        if (!lista.length) {
            painel.textContent = "Nenhum subordinado disponível para advertência.";
            return;
        }
        const el = (tag, texto = "", classe = "") => {
            const e = document.createElement(tag);
            e.textContent = texto;
            e.className = classe;
            return e;
        };
        const campo = (nome, controle) => {
            const label = el("label", nome, "organ-field");
            label.append(controle);
            return label;
        };
        const form = el("form", "", "organ-management-form");
        const busca = el("input");
        busca.placeholder = "Nome ou ID Discord";
        const select = el("select");
        select.required = true;
        const autoria = el("p", "", "organ-action-description");
        const obs = el("textarea");
        obs.required = true;
        obs.rows = 4;
        const msg = el("p", "", "organ-form-message");
        msg.setAttribute("aria-live", "polite");
        const botao = el("button", "Aplicar advertência", "organ-submit-button");
        botao.type = "submit";
        const selecionado = () => select.value === "" ? null : lista[Number(select.value)];
        const atualizar = () => {
            const v = selecionado();
            autoria.textContent = v ? "Autoria: " + v.autoria + " | Advertências atuais: " + v.advertencias : "";
            botao.disabled = !v;
        };
        const filtrar = () => {
            const termo = busca.value.trim().toLocaleLowerCase("pt-BR");
            select.replaceChildren(new Option("Selecione o militar e a função", ""));
            lista.forEach((v, i) => {
                if (!(v.nome + " " + v.discord_id).toLocaleLowerCase("pt-BR").includes(termo)) return;
                select.append(new Option([v.nome, v.patente, v.funcao, v.vinculo_destino, v.autoria].join(" — "), String(i)));
            });
            atualizar();
        };
        busca.addEventListener("input", filtrar);
        select.addEventListener("change", atualizar);
        form.append(campo("Pesquisar militar", busca), campo("Militar e vínculo institucional", select), autoria, campo("Observação *", obs), botao, msg);
        painel.append(form);
        filtrar();
        form.addEventListener("submit", async e => {
            e.preventDefault();
            const v = selecionado(), justificativa = obs.value.trim();
            if (!vigente() || !v || !justificativa || botao.disabled) return;
            if (!confirm("Confirma a advertência de " + v.nome + " em nome de " + v.autoria + "?")) return;
            [busca, select, obs, botao].forEach(e => e.disabled = true);
            msg.textContent = "Registrando advertência...";
            try {
                const { data, error } = await supabase.rpc("realizar_advertencia_institucional", {
                    p_discord_id: v.discord_id,
                    p_observacao: justificativa,
                    p_vinculo_autor: v.vinculo_autor,
                    p_vinculo_destino: v.vinculo_destino
                });
                if (error) throw error;
                if (data?.sucesso !== true) throw Error(data?.mensagem || "A operação não foi confirmada.");
                if (!vigente()) return;
                await carregarAdvertencias(painel, codigos, vigente);
                painel.prepend(el("p", "Advertência registrada no histórico militar.", "organ-form-message"));
            } catch (erro) {
                msg.textContent = erro.message;
            } finally {
                [busca, select, obs].forEach(e => e.disabled = false);
                atualizar();
            }
        });
    } catch (erro) {
        if (vigente()) painel.textContent = erro.message;
    }
}
