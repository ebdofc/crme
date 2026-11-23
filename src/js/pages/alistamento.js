
import { supabase } from "../supabase.js";

const form = document.getElementById("enlistment-form");
const recruitsList = document.getElementById("recruits-list");

// ========================================
// CARREGAR RECRUTAS
// ========================================

async function loadRecruits() {
    const { data, error } = await supabase
        .from("militares")
        .select("nome, ingresso, status")
        .eq("patente", "Recruta")
        .order("ingresso", { ascending: false });

    recruitsList.replaceChildren();

    if (error) {
        const row = recruitsList.insertRow();
        const cell = row.insertCell();

        cell.colSpan = 3;
        cell.textContent = "Erro ao carregar recrutas.";

        console.error(error);
        return;
    }

    if (!data || data.length === 0) {
        const row = recruitsList.insertRow();
        const cell = row.insertCell();

        cell.colSpan = 3;
        cell.textContent = "Nenhum recruta encontrado.";
        return;
    }

    data.forEach(militar => {
        const row = recruitsList.insertRow();

        row.insertCell().textContent = militar.nome;

        row.insertCell().textContent =
            new Date(militar.ingresso + "T00:00:00")
                .toLocaleDateString("pt-BR");

        row.insertCell().textContent = militar.status;
    });
}

// ========================================
// EXTRAIR ERRO DA EDGE FUNCTION
// ========================================

async function obterMensagemErro(error) {
    if (error?.context) {
        try {
            const resposta = await error.context.json();

            if (resposta?.erro) {
                return resposta.erro;
            }

            if (resposta?.mensagem) {
                return resposta.mensagem;
            }
        } catch {
            // A resposta não contém JSON válido.
        }
    }

    return error?.message ||
        "Não foi possível concluir o alistamento.";
}

// ========================================
// REALIZAR ALISTAMENTO
// ========================================

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const discordId = document
        .getElementById("discord-id")
        .value
        .trim();

    const button = form.querySelector(
        'button[type="submit"]'
    );

    // ========================================
    // VALIDAÇÃO DO ID DISCORD
    // ========================================

    if (!discordId) {
        alert("Informe o ID Discord do candidato.");
        return;
    }

    if (!/^\d{17,20}$/.test(discordId)) {
        alert("Informe um ID Discord válido.");
        return;
    }

    button.disabled = true;

    try {
        // ========================================
        // ALISTAMENTO PROTEGIDO
        // ========================================

        button.textContent = "Verificando e alistando...";

        const { data, error } =
            await supabase.functions.invoke(
                "realizar-alistamento",
                {
                    body: {
                        discord_id: discordId
                    }
                }
            );

        if (error) {
            const mensagem = await obterMensagemErro(error);
            throw new Error(mensagem);
        }

        if (!data?.sucesso) {
            throw new Error(
                data?.erro ||
                "O servidor não confirmou o alistamento."
            );
        }

        // ========================================
        // ALISTAMENTO CONCLUÍDO
        // ========================================

        const nome = data.nome || "Candidato";

        alert(
            `Alistamento realizado com sucesso!\n\n` +
            `Militar: ${nome}\n` +
            `ID Discord: ${discordId}\n` +
            `Patente: Recruta`
        );

        form.reset();

        await loadRecruits();

    } catch (error) {
        console.error("Erro no alistamento:", error);

        alert(
            error.message ||
            "Não foi possível concluir o alistamento."
        );

    } finally {
        button.disabled = false;
        button.textContent = "Realizar Alistamento";
    }
});

// ========================================
// CARREGAMENTO INICIAL
// ========================================

loadRecruits();
