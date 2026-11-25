
import { supabase } from "../supabase.js";

document.body.style.visibility = "hidden";

const ICONES_LAYOUT = {
    "dashboard.html": "M3 10l9-7 9 7v11h-6v-7H9v7H3z",
    "noticias.html": "M4 3h16v18H4z M7 7h10 M7 11h10 M7 15h10",
    "documentos.html": "M6 2h8l4 4v16H6z M14 2v5h4 M9 11h6 M9 15h6",
    "consultar.html": "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6",
    "controle-patentes.html": "M3 21v-7h5v7 M10 21V9h5v12 M17 21V3h5v18",
    "alistamento.html": "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M2 21v-3a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v3 M19 5v8 M15 9h8",
    "acoes.html": "M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6",
    "aulas.html": "M2 5h8l2 2 2-2h8v15h-8l-2 2-2-2H2z M12 7v15",
    "orgaos.html": "M9 2h6v6H9z M12 8v5 M5 16v-3h14v3 M2 16h6v6H2z M16 16h6v6h-6z",
    "ciclos.html": "M20 7a9 9 0 1 0 1 9 M20 2v5h-5 M12 7v5l3 2",
    "monitoramento.html": "M2 12h5l3-8 4 16 3-8h5",
    "permanencia.html": "M12 2l9 4v7c0 5-9 9-9 9s-9-4-9-9V6z M8 12l3 3 5-6",
    menu: "M3 6h18 M3 12h18 M3 18h18",
    sair: "M10 3H3v18h7 M9 12h12 M17 8l4 4-4 4"
};
function iconeLayout(tipo) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns,"svg");
    for (const [k,v] of Object.entries({viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":"1.7","stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":"true"})) svg.setAttribute(k,v);
    svg.classList.add("crme-layout-icon");
    const p = document.createElementNS(ns,"path");
    p.setAttribute("d",ICONES_LAYOUT[tipo]); svg.append(p); return svg;
}
function atualizarIconesMenu() {
    for (const link of document.querySelectorAll(".sidebar nav a")) {
        const arquivo = new URL(link.href,location.href).pathname.split("/").pop();
        if (!ICONES_LAYOUT[arquivo] || link.querySelector(".crme-layout-icon")) continue;
        const nome = arquivo === "controle-patentes.html" ? "Controle de Efetivo" : link.textContent.trim();
        const span = document.createElement("span"); span.className = "crme-nav-label"; span.textContent = nome;
        link.setAttribute("aria-label",nome); link.title = nome;
        link.replaceChildren(iconeLayout(arquivo),span);
    }
}


// ========================================
// CONFIGURAÇÕES DO MONITORAMENTO
// ========================================

const INTERVALO_ATUALIZACAO = 15000;

const NOMES_PAGINAS = {
    "dashboard.html": "Início",
    "noticias.html": "Notícias",
    "documentos.html": "Documentos",
    "consultar.html": "Consultar Militares",
    "controle-patentes.html": "Controle de Efetivo",
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
    atualizarIconesMenu();
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
menuToggle.replaceChildren(iconeLayout("menu"));
mobileMenuButton.replaceChildren(iconeLayout("menu"));
const sair = document.getElementById("logout-button");
sair.prepend(iconeLayout("sair"));
atualizarIconesMenu();

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

    