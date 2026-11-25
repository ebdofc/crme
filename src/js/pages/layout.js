
import { supabase } from "../supabase.js";

document.body.style.visibility = "hidden";

// ========================================
// CONFIGURAÇÕES DO MONITORAMENTO
// ========================================

const INTERVALO_ATUALIZACAO = 15000;

const NOMES_PAGINAS = {
    "dashboard.html": "Início",
    "noticias.html": "Notícias",
    "documentos.html": "Documentos",
    "consultar.html": "Consultar Militares",
    "controle-patentes.html": "Controle de Patentes",
    "alistamento.html": "Alistamento",
    "acoes.html": "Ações",
    "aulas.html": "Aulas",
    "orgaos.html": "Órgãos",
    "monitoramento.html": "Monitoramento",
    "permanencia.html": "Controle de Permanência"
};

let militarPresencaId = null;
let intervaloPresenca = null;
let atualizacaoEmAndamento = false;
let presencaAtiva = false;
let sessaoRegistrada = false;
let paginaAtual = null;

// Cada carregamento recebe uma identificação exclusiva.
// Duas abas abertas terão identificadores diferentes.
const abaId = crypto.randomUUID();

// ========================================
// EXTRAIR MENSAGEM DE ERRO
// ========================================

async function obterMensagemErro(error) {
    if (error?.context) {
        try {
            const resposta = await error.context.json();

            if (resposta?.erro) {
                return resposta.erro;
            }
        } catch {
            // Resposta sem JSON válido.
        }
    }

    return error?.message ||
        "Não foi possível verificar seu acesso.";
}

// ========================================
// IDENTIFICAR PÁGINA
// ========================================

function identificarPagina() {
    const arquivo = window.location.pathname
        .split("/")
        .pop()
        .toLowerCase();

    return NOMES_PAGINAS[arquivo] ||
        document.title.replace("CRME | ", "") ||
        "Página desconhecida";
}

// ========================================
// IDENTIFICAR MILITAR AUTENTICADO
// ========================================

async function obterMilitarPresenca() {
    const { data, error } = await supabase.rpc(
        "crme_militar_id"
    );

    if (error) {
        throw error;
    }

    return data;
}

// ========================================
// REGISTRAR OU ATUALIZAR PRESENÇA
// ========================================

async function atualizarPresenca() {
    if (
        !presencaAtiva ||
        !militarPresencaId ||
        atualizacaoEmAndamento
    ) {
        return;
    }

    atualizacaoEmAndamento = true;

    try {
        const dados = {
            militar_id: militarPresencaId,
            aba_id: abaId,
            pagina: paginaAtual,
            visivel: document.visibilityState === "visible",
            ultima_atividade: new Date().toISOString()
        };

        let error = null;

        if (!sessaoRegistrada) {
            const resposta = await supabase
                .from("sessoes_online")
                .upsert(dados, {
                    onConflict: "aba_id"
                });

            error = resposta.error;

            if (!error) {
                sessaoRegistrada = true;
            }
        } else {
            const resposta = await supabase
                .from("sessoes_online")
                .update({
                    pagina: dados.pagina,
                    visivel: dados.visivel,
                    ultima_atividade: dados.ultima_atividade
                })
                .eq("aba_id", abaId)
                .eq("militar_id", militarPresencaId)
                .select("id");

            error = resposta.error;

            if (!error && !resposta.data?.length) {
                sessaoRegistrada = false;
            }
        }

        if (error) {
            console.error(
                "Erro ao atualizar presença:",
                error
            );
        }

    } catch (error) {
        console.error(
            "Falha no monitoramento de presença:",
            error
        );
    } finally {
        atualizacaoEmAndamento = false;
    }
}

// ========================================
// INICIAR MONITORAMENTO
// ========================================

async function iniciarMonitoramento() {
    if (presencaAtiva) return;

    try {
        militarPresencaId = await obterMilitarPresenca();

        if (!militarPresencaId) {
            return;
        }

        paginaAtual = identificarPagina();
        presencaAtiva = true;

        await atualizarPresenca();

        intervaloPresenca = window.setInterval(() => {
            atualizarPresenca();
        }, INTERVALO_ATUALIZACAO);

    } catch (error) {
        console.error(
            "Não foi possível iniciar o monitoramento:",
            error
        );
    }
}

// ========================================
// ENCERRAR MONITORAMENTO
// ========================================

function pararMonitoramento() {
    presencaAtiva = false;

    if (intervaloPresenca !== null) {
        clearInterval(intervaloPresenca);
        intervaloPresenca = null;
    }
}

async function removerPresenca() {
    pararMonitoramento();

    if (!militarPresencaId) return;

    try {
        const { error } = await supabase
            .from("sessoes_online")
            .delete()
            .eq("aba_id", abaId)
            .eq("militar_id", militarPresencaId);

        if (error) throw error;

        sessaoRegistrada = false;

    } catch (error) {
        console.error(
            "Erro ao remover presença:",
            error
        );
    }
}

// ========================================
// ATUALIZAR VISIBILIDADE
// ========================================

document.addEventListener("visibilitychange", () => {
    if (presencaAtiva) {
        atualizarPresenca();
    }
});

// Ao voltar para uma aba, atualizar imediatamente.
window.addEventListener("focus", () => {
    if (presencaAtiva) {
        atualizarPresenca();
    }
});

// ========================================
// VERIFICAR LOGIN E AUTORIZAÇÃO
// ========================================

async function verificarLogin() {
    const { data: { session }, error } =
        await supabase.auth.getSession();

    if (error || !session) {
        pararMonitoramento();
        window.location.replace("/");
        return;
    }

    // ========================================
    // VERIFICAR CARGOS NO DISCORD
    // ========================================

    const { data: acesso, error: acessoError } =
        await supabase.functions.invoke(
            "verificar-acesso-crme",
            {
                body: {}
            }
        );

    if (acessoError || !acesso?.autorizado) {
        const mensagem = acessoError
            ? await obterMensagemErro(acessoError)
            : acesso?.erro || "Acesso não autorizado.";

        alert(mensagem);

        await removerPresenca();
        await supabase.auth.signOut();

        window.location.replace("/");
        return;
    }

    // ========================================
    // CARREGAR DADOS DO USUÁRIO
    // ========================================

    const user = session.user;

    document.getElementById("user-name").textContent =
        user.user_metadata.full_name ||
        user.user_metadata.name ||
        user.user_metadata.user_name ||
        "Usuário Discord";

    const discordId = acesso.discord_id;

    // ========================================
    // CONSULTAR PATENTE
    // ========================================

    const { data: militar, error: militarError } =
        await supabase
            .from("militares")
            .select("patente")
            .eq("discord_id", discordId)
            .maybeSingle();

    if (militarError) {
        console.error(
            "Erro ao carregar patente:",
            militarError
        );
    }

    document.getElementById("user-rank").textContent =
        militar?.patente || "Sem patente cadastrada";

    // Exibir Aulas somente para militares ativos com vínculo autorizado.
    const linksAulas = document.querySelectorAll('.sidebar nav a[href="aulas.html"]');
    let podeAulas = false;
    try {
        const { data: militarId, error: erroId } = await supabase.rpc("crme_militar_id");
        if (erroId) throw erroId;
        if (militarId) {
            const { data: vinculos, error: erroVinculos } = await supabase
                .from("funcoes")
                .select("codigo_vinculo")
                .eq("militar_id", militarId);
            if (erroVinculos) throw erroVinculos;
            const administrativos = new Set([
                "Presidente", "Vice-Presidente", "Ministro da Defesa", "Ministro"
            ]);
            podeAulas = (vinculos || []).some(v =>
                v.codigo_vinculo?.startsWith("DEC/") ||
                administrativos.has(v.codigo_vinculo)
            );
        }
    } catch (erro) {
        console.error("Erro ao verificar permissão do menu Aulas:", erro);
    }
    if (!podeAulas) {
        linksAulas.forEach(link => link.remove());
        if (window.location.pathname.split("/").pop().toLowerCase().replace(/\.html$/, "") === "aulas") {
            window.location.replace("dashboard.html");
            return;
        }
    }

    const { data: podePermanencia } = await supabase.rpc("permanencia_pode_gerenciar");
    if (podePermanencia === true) {
        const nav = document.querySelector(".sidebar nav");
        if (nav && !nav.querySelector('a[href="permanencia.html"]')) {
            const link = document.createElement("a");
            link.href = "permanencia.html";
            link.textContent = "Controle de Permanência";
            nav.append(link);
        }
    }
    document.body.style.visibility = "visible";

    // ========================================
    // INICIAR REGISTRO DE PRESENÇA
    // ========================================

    iniciarMonitoramento();
}

// ========================================
// ELEMENTOS DO LAYOUT
// ========================================

const sidebar = document.getElementById("sidebar");
const mainContent = document.querySelector(".main-content");
const menuToggle = document.getElementById("menu-toggle");
const topHeader = document.querySelector(".top-header");

const mobileQuery = window.matchMedia("(max-width: 700px)");

// ========================================
// CRIAR BOTÃO MOBILE
// ========================================

const mobileMenuButton = document.createElement("button");

mobileMenuButton.type = "button";
mobileMenuButton.className = "mobile-menu-button";
mobileMenuButton.textContent = "☰";
mobileMenuButton.setAttribute("aria-label", "Abrir menu");
mobileMenuButton.setAttribute("aria-controls", "sidebar");
mobileMenuButton.setAttribute("aria-expanded", "false");

topHeader.prepend(mobileMenuButton);

// ========================================
// CRIAR SOBREPOSIÇÃO
// ========================================

const sidebarOverlay = document.createElement("div");

sidebarOverlay.className = "sidebar-overlay";
sidebarOverlay.setAttribute("aria-hidden", "true");

document.body.appendChild(sidebarOverlay);

// ========================================
// ABRIR MENU MOBILE
// ========================================

function abrirMenuMobile() {
    sidebar.classList.add("mobile-open");
    sidebarOverlay.classList.add("active");
    document.body.classList.add("menu-open");

    mobileMenuButton.setAttribute("aria-expanded", "true");
    mobileMenuButton.setAttribute("aria-label", "Fechar menu");

    menuToggle.setAttribute("aria-label", "Fechar menu");
    menuToggle.focus();
}

// ========================================
// FECHAR MENU MOBILE
// ========================================

function fecharMenuMobile(devolverFoco = false) {
    const estavaAberto =
        sidebar.classList.contains("mobile-open");

    sidebar.classList.remove("mobile-open");
    sidebarOverlay.classList.remove("active");
    document.body.classList.remove("menu-open");

    mobileMenuButton.setAttribute("aria-expanded", "false");
    mobileMenuButton.setAttribute("aria-label", "Abrir menu");

    menuToggle.setAttribute("aria-label", "Recolher menu");

    if (devolverFoco && estavaAberto) {
        mobileMenuButton.focus();
    }
}

// ========================================
// CONTROLAR MENU
// ========================================

menuToggle.addEventListener("click", () => {
    if (mobileQuery.matches) {
        fecharMenuMobile(true);
        return;
    }

    sidebar.classList.toggle("collapsed");
    mainContent.classList.toggle("expanded");
});

mobileMenuButton.addEventListener("click", () => {
    if (sidebar.classList.contains("mobile-open")) {
        fecharMenuMobile(true);
    } else {
        abrirMenuMobile();
    }
});

sidebarOverlay.addEventListener("click", () => {
    fecharMenuMobile(true);
});

// Fechar ao selecionar uma página
sidebar.querySelectorAll("nav a").forEach(link => {
    link.addEventListener("click", () => {
        if (mobileQuery.matches) {
            fecharMenuMobile();
        }
    });
});

// Fechar ao pressionar Escape
document.addEventListener("keydown", (event) => {
    if (
        event.key === "Escape" &&
        sidebar.classList.contains("mobile-open")
    ) {
        fecharMenuMobile(true);
    }
});

// Fechar ao mudar para a versão desktop
mobileQuery.addEventListener("change", () => {
    fecharMenuMobile();
});

// ========================================
// VERIFICAR AO ABRIR A PÁGINA
// ========================================

window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
        window.location.reload();
        return;
    }

    verificarLogin().catch(async (error) => {
        console.error("Erro ao verificar acesso:", error);

        alert("Não foi possível validar seu acesso ao CRME.");

        await removerPresenca();
        await supabase.auth.signOut();

        window.location.replace("/");
    });
});

// ========================================
// LOGOUT
// ========================================

document.getElementById("logout-button")
    .addEventListener("click", async () => {
        await removerPresenca();

        const { error } = await supabase.auth.signOut();

        if (error) {
            alert("Erro ao sair: " + error.message);
            return;
        }

        window.location.replace("/");
    });

    