
import { supabase } from "../supabase.js";

// ========================================
// CONFIGURAÇÕES E AUXILIARES
// ========================================

const $ = id => document.getElementById(id);

const searchInput = $("military-search");
const searchButton = $("search-button");
const searchResults = $("search-results");
const militaryProfile = $("military-profile");

const ORDEM_ORGAOS = [
    "P", "M", "CE", "ACE", "EME",
    "JME", "CIE", "DGP", "DEC", "DTC", "PE"
];

function criarElemento(tag, texto = "", classe = "") {
    const elemento = document.createElement(tag);
    elemento.textContent = texto;
    if (classe) elemento.className = classe;
    return elemento;
}

function formatarData(data) {
    if (!data) return "Não informado";
    const valor = new Date(data.length === 10 ? `${data}T00:00:00` : data);
    return valor.toLocaleDateString("pt-BR");
}

function formatarDataHoraHistorico(data, criadoEm) {
    const dataOficial = formatarData(data);
    if (!criadoEm) return dataOficial;

    const instante = new Date(criadoEm);
    if (Number.isNaN(instante.getTime())) return dataOficial;

    const hora = new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    }).format(instante);

    return `${dataOficial} às ${hora}`;
}

const formatarPatente = patente => patente ?? "Ex-Militar";

function ordemOrgao(codigo) {
    const indice = ORDEM_ORGAOS.indexOf(codigo);
    return indice === -1 ? 999 : indice;
}

// ========================================
// PESQUISAR MILITARES
// ========================================

async function pesquisarMilitares() {
    const termo = searchInput.value.trim();

    militaryProfile.replaceChildren();
    searchResults.replaceChildren();

    if (!termo) {
        searchResults.textContent = "Digite um nome ou ID do Discord.";
        return;
    }

    searchButton.disabled = true;
    searchButton.textContent = "Pesquisando...";

    try {
        let query = supabase.from("militares")
            .select("id, nome, discord_id, patente, status, ingresso");

        query = /^\d+$/.test(termo)
            ? query.eq("discord_id", termo)
            : query.ilike("nome", `%${termo}%`);

        const { data, error } = await query.order("nome", { ascending: true });

        if (error) throw error;

        if (!data.length) {
            searchResults.textContent = "Nenhum militar encontrado.";
            return;
        }

        data.forEach(militar => {
            const resultado = criarElemento("div", "", "search-result");

            resultado.append(
                criarElemento("strong", militar.nome),
                criarElemento("span", formatarPatente(militar.patente))
            );

            resultado.addEventListener("click", () => {
                document.querySelectorAll(".search-result")
                    .forEach(item => item.classList.remove("selected"));

                resultado.classList.add("selected");
                carregarFicha(militar);
            });

            searchResults.append(resultado);
        });

    } catch (error) {
        searchResults.textContent = "Erro ao pesquisar militares.";
        console.error(error);
    } finally {
        searchButton.disabled = false;
        searchButton.textContent = "Pesquisar";
    }
}

// ========================================
// ÓRGÃOS VINCULADOS
// ========================================

async function carregarOrgaos(militar, container) {
    container.textContent = "Carregando órgãos...";

    try {
        const { data, error } = await supabase.rpc(
            "consultar_orgaos_militar",
            { p_discord_id: militar.discord_id }
        );

        if (error) throw error;

        const orgaos = [...new Set(
            (data || [])
                .map(v => String(v.orgao || "").trim().split("/")[0])
                .filter(Boolean)
        )].sort((a, b) =>
            ordemOrgao(a) - ordemOrgao(b) ||
            a.localeCompare(b, "pt-BR")
        );

        container.replaceChildren();

        if (!orgaos.length) {
            container.append(criarElemento("span", "Nenhum órgão vinculado"));
            return;
        }

        orgaos.forEach(orgao => {
            container.append(criarElemento("span", orgao, "rank-badge"));
        });

    } catch (error) {
        container.textContent = "Não foi possível carregar os órgãos.";
        console.error("Erro ao consultar órgãos:", error);
    }
}

// ========================================
// FICHA INDIVIDUAL
// ========================================

async function carregarFicha(militar) {
    militaryProfile.replaceChildren();

    // Bloco único da ficha individual
    const ficha = criarElemento("section", "", "profile-header");
    const identificadores = criarElemento("div", "", "profile-badges");

    identificadores.append(
        criarElemento("span", formatarPatente(militar.patente), "rank-badge"),
        criarElemento(
            "span",
            (militar.status || "Não informado").toUpperCase(),
            `status-badge status-${militar.status}`
        )
    );

    ficha.append(
        criarElemento("span", "FICHA INDIVIDUAL · CRME", "profile-label"),
        criarElemento("h2", militar.nome, "profile-name"),
        identificadores
    );

    // Órgãos dentro da ficha individual
    const orgaosSecao = criarElemento("div");
    const orgaosLista = criarElemento("div", "", "profile-badges");

    orgaosSecao.style.marginTop = "16px";

    orgaosSecao.append(
        criarElemento("span", "Órgãos", "profile-data-label"),
        orgaosLista
    );

    ficha.append(orgaosSecao);

    // Identificação militar dentro da mesma ficha
    const identificacao = criarElemento("div");
    const dados = criarElemento("div", "", "profile-data-grid");

    identificacao.style.marginTop = "20px";
    identificacao.style.paddingTop = "16px";
    identificacao.style.borderTop = "1px solid rgba(128,128,128,0.2)";

    const campos = [
        ["ID Discord", militar.discord_id],
        ["Data de ingresso", formatarData(militar.ingresso)]
    ];

    campos.forEach(([campo, valor]) => {
        const bloco = criarElemento("div", "", "profile-data");

        bloco.append(
            criarElemento("span", campo, "profile-data-label"),
            criarElemento("strong", valor, "profile-data-value")
        );

        dados.append(bloco);
    });

    identificacao.append(
        criarElemento("h3", "Identificação Militar"),
        dados
    );

    ficha.append(identificacao);

    // Histórico militar em bloco separado
    const historicoSecao = criarElemento("section", "", "profile-history");

    historicoSecao.append(
        criarElemento("h3", "Histórico Militar")
    );

    militaryProfile.append(ficha, historicoSecao);

    await Promise.all([
        carregarOrgaos(militar, orgaosLista),
        carregarHistorico(militar, historicoSecao)
    ]);
}

// ========================================
// HISTÓRICO MILITAR
// ========================================

async function carregarHistorico(militar, historicoSecao) {
    try {
        const { data: historico, error } = await supabase
            .from("historico")
            .select("*")
            .eq("militar_id", militar.id)
            .order("data", { ascending: false })
            .order("criado_em", { ascending: false })
            .order("id", { ascending: false });

        if (error) throw error;

        if (!historico.length) {
            historicoSecao.append(criarElemento("p", "Nenhum registro encontrado."));
            return;
        }

        const historyList = criarElemento("div", "", "history-list");

        historico.forEach(registro => {
            historyList.append(criarRegistroHistorico(registro));
        });

        historicoSecao.append(historyList);

    } catch (error) {
        historicoSecao.append(criarElemento("p", "Erro ao carregar histórico."));
        console.error(error);
    }
}

// ========================================
// REGISTROS DO HISTÓRICO
// ========================================

function criarRegistroHistorico(registro) {
    const item = criarElemento("article", "", "history-item");

    const titulo = criarElemento(
        "strong",
        obterTituloRegistro(registro),
        `history-title ${obterClasseRegistro(registro)}`
    );

    const data = criarElemento("span", formatarDataHoraHistorico(registro.data, registro.criado_em), "history-date");
    const detalhes = criarElemento("div", "", "history-details");

    function adicionarDetalhe(campo, valor) {
        if (valor === null || valor === undefined || valor === "") return;

        const paragrafo = criarElemento("p");

        paragrafo.append(
            criarElemento("strong", `${campo}: `),
            document.createTextNode(String(valor))
        );

        detalhes.append(paragrafo);
    }

    if (["promocao", "rebaixamento"].includes(registro.tipo)) {
        const classe = registro.tipo === "promocao"
            ? "rank-transition-promotion"
            : "rank-transition-demotion";

        const transicao = criarElemento("div", "", `rank-transition ${classe}`);

        transicao.append(
            criarElemento(
                "span",
                registro.patente_anterior || "Não informado",
                "rank-transition-old"
            ),
            criarElemento("span", "→", "rank-transition-arrow"),
            criarElemento(
                "span",
                registro.nova_patente || "Não informado",
                "rank-transition-new"
            )
        );

        detalhes.append(transicao);

    } else if (registro.tipo === "desligamento") {
        adicionarDetalhe("Última patente", registro.patente_anterior);
        adicionarDetalhe("Situação após desligamento", "Ex-Militar");

    } else {
        adicionarDetalhe("Patente anterior", registro.patente_anterior);
        adicionarDetalhe("Nova patente", registro.nova_patente);
    }

    adicionarDetalhe("Curso", registro.nome_curso);
    adicionarDetalhe("Resultado", registro.resultado);

    if (registro.data_inicio) {
        adicionarDetalhe("Início do afastamento", formatarData(registro.data_inicio));
    }

    if (registro.data_termino) {
        adicionarDetalhe("Término do afastamento", formatarData(registro.data_termino));
    }

    adicionarDetalhe("Observação", registro.observacao);
    adicionarDetalhe("Responsável", registro.autor_nome);

    item.append(titulo, data, detalhes);

    return item;
}

// ========================================
// TÍTULOS E CORES DOS REGISTROS
// ========================================

const TITULOS_REGISTROS = {
    ingresso: "Alistado",
    reingresso: "Reingresso",
    promocao: "Promovido",
    rebaixamento: "Rebaixado",
    advertencia_escrita: "Advertido",
    afastamento: "Afastado",
    retorno: "Retornou",
    desligamento: "Desligado"
};

const CORES_REGISTROS = {
    ingresso: "history-green-olive",
    reingresso: "history-green-olive",
    promocao: "history-yellow",
    rebaixamento: "history-red",
    advertencia_escrita: "history-orange",
    desligamento: "history-purple"
};

function cursoAprovado(registro) {
    return registro.resultado?.toLowerCase() === "aprovado";
}

function obterTituloRegistro(registro) {
    if (registro.tipo === "curso") {
        return cursoAprovado(registro) ? "Aprovado" : "Reprovado";
    }

    return TITULOS_REGISTROS[registro.tipo] || registro.tipo;
}

function obterClasseRegistro(registro) {
    if (registro.tipo === "curso") {
        return cursoAprovado(registro) ? "history-green" : "history-red";
    }

    return CORES_REGISTROS[registro.tipo] || "history-neutral";
}

// ========================================
// EVENTOS
// ========================================

searchButton.addEventListener("click", pesquisarMilitares);

searchInput.addEventListener("keydown", event => {
    if (event.key === "Enter") pesquisarMilitares();
});
