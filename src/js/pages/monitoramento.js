
import { supabase } from "../supabase.js";

// ========================================
// CONFIGURAÇÕES
// ========================================

const INTERVALO_ATUALIZACAO = 15000;
const TEMPO_EXPIRACAO = 45000;

const $ = id => document.getElementById(id);

const elementos = {
    secao: $("monitoring-section"),
    acesso: $("monitoring-access-message"),
    quantidade: $("online-users-count"),
    paginas: $("open-pages-count"),
    conexao: $("monitoring-connection-status"),
    pesquisa: $("monitoring-search-input"),
    lista: $("online-users-list"),
    vazio: $("no-online-users")
};

let usuariosOnline = [];
let intervalo = null;
let carregando = false;
let autorizado = false;

// ========================================
// AUXILIARES
// ========================================

function criarElemento(tag, classe = "", texto = "") {
    const elemento = document.createElement(tag);

    if (classe) {
        elemento.className = classe;
    }

    if (texto) {
        elemento.textContent = texto;
    }

    return elemento;
}

function mostrarMensagem(texto) {
    elementos.acesso.replaceChildren(
        criarElemento("p", "", texto)
    );

    elementos.acesso.hidden = false;
    elementos.secao.hidden = true;
}

function atualizarConexao(texto, estado = "") {
    elementos.conexao.textContent = texto;

    elementos.conexao.classList.remove(
        "connected",
        "disconnected"
    );

    if (estado) {
        elementos.conexao.classList.add(estado);
    }
}

function obterLimiteAtividade() {
    return new Date(
        Date.now() - TEMPO_EXPIRACAO
    ).toISOString();
}

// ========================================
// VERIFICAR AUTENTICAÇÃO E PERMISSÃO
// ========================================

async function verificarPermissao() {
    const { data: { session }, error: sessionError } =
        await supabase.auth.getSession();

    if (sessionError || !session) {
        window.location.replace("/");
        return false;
    }

    const { data: permitido, error } = await supabase.rpc(
        "crme_pode_monitorar"
    );

    if (error) {
        throw error;
    }

    if (permitido !== true) {
        mostrarMensagem(
            "Você não possui autorização para acessar o Monitoramento."
        );

        return false;
    }

    return true;
}

// ========================================
// CONSULTAR SESSÕES ONLINE
// ========================================

async function consultarSessoes() {
    const { data, error } = await supabase
        .from("sessoes_online")
        .select(`
            aba_id,
            militar_id,
            pagina,
            visivel,
            ultima_atividade
        `)
        .gte(
            "ultima_atividade",
            obterLimiteAtividade()
        )
        .order("ultima_atividade", {
            ascending: false
        });

    if (error) {
        throw error;
    }

    return data || [];
}

// ========================================
// CONSULTAR MILITARES
// ========================================

async function consultarMilitares(ids) {
    if (!ids.length) {
        return [];
    }

    const { data, error } = await supabase
        .from("militares")
        .select("id,nome,discord_id,patente")
        .in("id", ids);

    if (error) {
        throw error;
    }

    return data || [];
}

// ========================================
// AGRUPAR SESSÕES POR MILITAR
// ========================================

function agruparSessoes(sessoes, militares) {
    const mapaMilitares = new Map(
        militares.map(m => [m.id, m])
    );

    const grupos = new Map();

    sessoes.forEach(sessao => {
        const militar = mapaMilitares.get(
            sessao.militar_id
        );

        if (!militar) {
            return;
        }

        if (!grupos.has(militar.id)) {
            grupos.set(militar.id, {
                id: militar.id,
                nome: militar.nome,
                discord_id: militar.discord_id,
                patente: militar.patente,
                paginas: new Map(),
                abas: 0,
                ultima_atividade: sessao.ultima_atividade
            });
        }

        const grupo = grupos.get(militar.id);

        grupo.abas++;

        if (
            new Date(sessao.ultima_atividade) >
            new Date(grupo.ultima_atividade)
        ) {
            grupo.ultima_atividade =
                sessao.ultima_atividade;
        }

        const pagina = sessao.pagina ||
            "Página desconhecida";

        if (!grupo.paginas.has(pagina)) {
            grupo.paginas.set(pagina, {
                nome: pagina,
                visivel: Boolean(sessao.visivel),
                quantidade: 1
            });
        } else {
            const existente = grupo.paginas.get(pagina);

            existente.quantidade++;

            if (sessao.visivel) {
                existente.visivel = true;
            }
        }
    });

    return [...grupos.values()]
        .map(grupo => ({
            ...grupo,
            paginas: [...grupo.paginas.values()]
                .sort((a, b) => {
                    if (a.visivel !== b.visivel) {
                        return a.visivel ? -1 : 1;
                    }

                    return a.nome.localeCompare(
                        b.nome,
                        "pt-BR"
                    );
                })
        }))
        .sort((a, b) =>
            a.nome.localeCompare(b.nome, "pt-BR")
        );
}

// ========================================
// CRIAR CARTÃO DO MILITAR
// ========================================

function criarCartaoMilitar(militar) {
    const cartao = criarElemento(
        "article",
        "monitoring-user"
    );

    const cabecalho = criarElemento(
        "div",
        "monitoring-user-header"
    );

    const informacoes = criarElemento(
        "div",
        "monitoring-user-info"
    );

    const nome = criarElemento(
        "h3",
        "monitoring-user-name",
        militar.nome
    );

    const discord = criarElemento(
        "span",
        "monitoring-user-discord",
        `Discord ID: ${militar.discord_id}`
    );

    const patente = criarElemento(
        "span",
        "monitoring-user-discord",
        `Patente: ${militar.patente}`
    );

    informacoes.append(
        nome,
        discord,
        patente
    );

    const status = criarElemento(
        "span",
        "monitoring-user-status",
        "Online"
    );

    cabecalho.append(
        informacoes,
        status
    );

    const paginas = criarElemento(
        "div",
        "monitoring-user-pages"
    );

    militar.paginas.forEach(pagina => {
        const etiqueta = criarElemento(
            "span",
            "monitoring-page",
            pagina.nome
        );

        if (pagina.visivel) {
            etiqueta.classList.add("active");
        }

        if (pagina.quantidade > 1) {
            etiqueta.textContent =
                `${pagina.nome} (${pagina.quantidade} abas)`;
        }

        etiqueta.title = pagina.visivel
            ? "Pelo menos uma aba está visível"
            : "Página aberta em segundo plano";

        paginas.append(etiqueta);
    });

    cartao.append(
        cabecalho,
        paginas
    );

    return cartao;
}

// ========================================
// FILTRAR USUÁRIOS
// ========================================

function filtrarUsuarios() {
    const pesquisa = elementos.pesquisa.value
        .trim()
        .toLocaleLowerCase("pt-BR");

    if (!pesquisa) {
        return usuariosOnline;
    }

    return usuariosOnline.filter(militar =>
        militar.nome
            .toLocaleLowerCase("pt-BR")
            .includes(pesquisa) ||
        String(militar.discord_id)
            .includes(pesquisa)
    );
}

// ========================================
// RENDERIZAR LISTA
// ========================================

function renderizarUsuarios() {
    elementos.lista.replaceChildren();

    const filtrados = filtrarUsuarios();

    elementos.vazio.hidden = filtrados.length > 0;

    if (!filtrados.length) {
        elementos.vazio.textContent =
            usuariosOnline.length
                ? "Nenhum militar encontrado para esta pesquisa."
                : "Nenhum militar online no momento.";

        return;
    }

    filtrados.forEach(militar => {
        elementos.lista.append(
            criarCartaoMilitar(militar)
        );
    });
}

// ========================================
// ATUALIZAR CONTADORES
// ========================================

function atualizarContadores(sessoes) {
    elementos.quantidade.textContent =
        String(usuariosOnline.length);

    elementos.paginas.textContent =
        String(sessoes.length);
}

// ========================================
// ATUALIZAR MONITORAMENTO
// ========================================

async function atualizarMonitoramento() {
    if (!autorizado || carregando) {
        return;
    }

    carregando = true;

    try {
        const sessoes = await consultarSessoes();

        const ids = [
            ...new Set(
                sessoes.map(sessao =>
                    sessao.militar_id
                )
            )
        ];

        const militares = await consultarMilitares(ids);

        usuariosOnline = agruparSessoes(
            sessoes,
            militares
        );

        atualizarContadores(sessoes);
        renderizarUsuarios();

        atualizarConexao(
            "Atualizado",
            "connected"
        );

    } catch (error) {
        console.error(
            "Erro ao atualizar monitoramento:",
            error
        );

        atualizarConexao(
            "Falha na atualização",
            "disconnected"
        );

        if (!usuariosOnline.length) {
            elementos.lista.replaceChildren(
                criarElemento(
                    "p",
                    "",
                    "Não foi possível carregar os usuários online."
                )
            );

            elementos.vazio.hidden = true;
        }

    } finally {
        carregando = false;
    }
}

// ========================================
// INICIALIZAÇÃO
// ========================================

async function iniciarMonitoramento() {
    try {
        const permitido = await verificarPermissao();

        if (!permitido) {
            return;
        }

        autorizado = true;

        elementos.acesso.hidden = true;
        elementos.secao.hidden = false;

        atualizarConexao("Conectando...");

        await atualizarMonitoramento();

        intervalo = window.setInterval(
            atualizarMonitoramento,
            INTERVALO_ATUALIZACAO
        );

    } catch (error) {
        console.error(
            "Erro ao iniciar monitoramento:",
            error
        );

        mostrarMensagem(
            "Não foi possível verificar sua permissão de acesso."
        );
    }
}

// ========================================
// EVENTOS
// ========================================

elementos.pesquisa.addEventListener(
    "input",
    renderizarUsuarios
);

document.addEventListener(
    "visibilitychange",
    () => {
        if (
            document.visibilityState === "visible" &&
            autorizado
        ) {
            atualizarMonitoramento();
        }
    }
);

window.addEventListener("pageshow", event => {
    if (event.persisted) {
        return;
    }

    iniciarMonitoramento();
});

window.addEventListener("pagehide", () => {
    if (intervalo !== null) {
        clearInterval(intervalo);
        intervalo = null;
    }

    autorizado = false;
});
