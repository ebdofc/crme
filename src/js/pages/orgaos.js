import { carregarAdvertencias } from "./orgaos-advertencias.js";

import { supabase } from "../supabase.js";

// ==================================================
// CONFIGURAÇÕES E AUXILIARES
// ==================================================

const $ = id => document.getElementById(id);

const el = (tag, classe = "", texto = "") => {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto) e.textContent = texto;
    return e;
};

const btn = (texto, acao, classe = "organ-submit-button") => {
    const e = el("button", classe, texto);
    e.type = "button";
    if (acao) e.addEventListener("click", acao);
    return e;
};

const titulo = texto => el("h3", "organ-management-title", texto);
const mensagem = texto => el("p", "function-empty", texto);
const filhos = e => [...(e.unidades || []), ...(e.subunidades || [])];
const funcoes = e => [...(e.funcoes || []), ...filhos(e).flatMap(funcoes)];

async function consultar(pedido) {
    const { data, error } = await pedido;
    if (error) throw error;
    return data;
}

const rpc = (nome, parametros) => consultar(supabase.rpc(nome, parametros));

const ORDEM = ["P", "M", "CE", "ACE", "EME", "JME", "CIE", "DGP", "DEC", "DTC", "PE"];

const PATENTES_ADMIN = [
    "General-de-Exército", "Ministro",
    "Ministro da Defesa", "Vice-Presidente"
];

const NIVEIS_ADMIN = {
    "Presidente": 1,
    "Vice-Presidente": 2,
    "Ministro da Defesa": 3,
    "Ministro": 4
};

const DIRECOES = ["DGP", "DEC", "DTC"];

const UNIDADES_DIRECAO = [
    "DGP/DCR", "DGP/DAP", "DGP/DFP",
    "DEC/DEB", "DEC/DEA",
    "DTC/DSA", "DTC/DRI", "DTC/DCI"
];

const COORDENACOES = ["DEC/DEB", "DEC/DEA"];
const ORGAOS_MONITORAMENTO = new Set(["P", "M", "CE", "ACE", "EME", "JME", "CIE"]);

const AUTORIDADES = {
    ACE: ["ACE/P", "ACE/VP"],
    EME: ["EME/Ch", "EME/Sch"],
    JME: ["JME/J"],
    CIE: ["CIE/Cmd", "CIE/Scm"],
    PE: ["PE/Cmd", "PE/Sub", "PE/Ch"]
};

const elementos = {
    nome: $("military-name"),
    discord: $("military-discord-id"),
    patente: $("military-rank"),
    vinculos: $("military-functions-list"),
    orgaos: $("organs-list"),
    vazio: $("no-organs"),
    secao: $("organ-actions-section"),
    selecionado: $("selected-organ-name"),
    conteudo: $("organ-actions-list"),
    voltar: $("back-to-organs")
};

let militar = null, vinculos = [], catalogo = [], categorias = [];
let catalogoFuncoes = [], caminho = [], versao = 0;

const mapaFuncoes = new Map();
const tem = codigo => vinculos.some(v => v.codigo_vinculo === codigo);
const ativo = () => militar?.status === "ativo";
const poderAdministrativo = () => ativo() && Object.keys(NIVEIS_ADMIN).some(tem);
const direcao = codigo => tem(`${codigo}/Dir`) || tem(`${codigo}/VDir`);
const discordValido = id => /^\d{17,20}$/.test(id);

const ordem = (lista, valor) => {
    const i = lista.indexOf(valor);
    return i < 0 ? 9999 : i;
};

function ordenarVinculos(lista) {
    const codigos = catalogoFuncoes.map(f => f.codigo);
    return [...lista].sort((a, b) =>
        ordem(ORDEM, a.orgao) - ordem(ORDEM, b.orgao) ||
        ordem(codigos, a.codigo_vinculo) - ordem(codigos, b.codigo_vinculo)
    );
}

function campo(label, input) {
    const e = el("label", "organ-field", label);
    e.append(input);
    return e;
}

function aviso() {
    const e = el("p", "organ-form-message");
    e.setAttribute("aria-live", "polite");
    return e;
}

function detalhes(...linhas) {
    const e = el("div", "organ-action");
    linhas.forEach((linha, i) => e.append(el(
        i === 0 ? "strong" : "span",
        i === 0 ? "organ-action-title" : "organ-action-description",
        linha
    )));
    return e;
}

function icone(tipo) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.7");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("organ-icon");
    const formas = {
        next: "M9 6l6 6-6 6",
        up: "M12 20V4 M5 11l7-7 7 7",
        down: "M12 4v16 M5 13l7 7 7-7",
        activity: "M2 12h5l3-8 4 16 3-8h5",
        document: "M6 2h8l4 4v16H6z M14 2v5h4 M9 11h6 M9 15h6 M9 18h4",
        users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-4 M16 3a4 4 0 0 1 0 8",
        network: "M12 3v6 M5 15v-3h14v3 M12 9v3 M2 15h6v6H2z M16 15h6v6h-6z M9 2h6v6H9z",
        settings: "M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6"
    };
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", formas[tipo] || formas.next);
    svg.append(p);
    return svg;
}
function tituloIcone(texto, tipo) {
    const e = titulo(texto);
    e.prepend(icone(tipo));
    return e;
}
function cartao(estrutura, nome, acao) {
    const e = btn("", acao, "organ-card");
    e.append(
        el("span", "organ-card-code", estrutura.codigo),
        el("span", "organ-card-name", nome),
        icone("next")
    );
    return e;
}

function inputDiscord(placeholder = "ID Discord") {
    const input = el("input");
    Object.assign(input, {
        type: "text", required: true,
        autocomplete: "off", placeholder
    });
    return input;
}

function seletorFuncoes(lista) {
    const select = el("select");
    select.required = true;
    const inicial = new Option("Selecione uma função", "", true, true);
    inicial.disabled = true;
    select.append(inicial);
    lista.forEach(f => select.append(new Option(`${f.nome} — ${f.codigo}`, f.codigo)));
    return select;
}

function secaoOperacoes() {
    let secao = elementos.conteudo.querySelector(".organ-operations");
    if (!secao) {
        secao = el("section", "organ-operations");
        secao.append(tituloIcone("Operações administrativas", "settings"));
        elementos.conteudo.append(secao);
    }
    return secao;
}
function botaoPainel(texto, carregar, classe = "", tipo = "users") {
    const secao = el("div", "organ-operation " + classe);
    const painel = el("div", "organ-operation-panel");
    painel.hidden = true;
    const abrir = btn("", async () => {
        const expandir = painel.hidden;
        for (const outro of secaoOperacoes().querySelectorAll(".organ-operation-panel")) outro.hidden = true;
        for (const botao of secaoOperacoes().querySelectorAll("[aria-expanded]")) botao.setAttribute("aria-expanded", "false");
        if (expandir) {
            painel.hidden = false;
            abrir.setAttribute("aria-expanded", "true");
            await carregar(painel);
        }
    }, "organ-card organ-operation-button");
    abrir.append(icone(tipo), el("span", "organ-card-name", texto), icone("next"));
    abrir.setAttribute("aria-expanded", "false");
    secao.append(abrir, painel);
    secaoOperacoes().append(secao);
}

// ==================================================
// PERMISSÕES
// ==================================================

function nivelAdministrativo() {
    if (!ativo()) return -1;
    if (tem("Presidente")) return 3;
    if (tem("Vice-Presidente")) return 2;
    if (tem("Ministro da Defesa")) return 1;
    return -1;
}

function nivelAutogerenciamento() {
    if (!ativo()) return null;
    const niveis = vinculos.map(v => NIVEIS_ADMIN[v.codigo_vinculo]).filter(Number.isInteger);
    return niveis.length ? Math.min(...niveis) : null;
}

function inferiorParaAutogerenciamento(codigo) {
    const nivel = nivelAutogerenciamento();
    return nivel !== null && nivel < (NIVEIS_ADMIN[codigo] ?? 5);
}

function podeAcessar(estrutura, percurso = []) {
    const orgao = (percurso[0] || estrutura).codigo;

    if (orgao === "P") return ativo() && (tem("Presidente") || tem("Vice-Presidente"));
    if (poderAdministrativo()) return true;

    if (ativo()) {
        if (tem("Comandante do Exército") && !["P", "M"].includes(orgao)) return true;
        if ((AUTORIDADES[orgao] || []).some(tem)) return true;
    }

    if (funcoes(estrutura).some(f => tem(f.codigo))) return true;

    const [principal, unidade] = percurso;
    if (principal && DIRECOES.includes(principal.codigo) && direcao(principal.codigo)) return true;

    if (principal && unidade) {
        const codigo = `${principal.codigo}/${unidade.codigo}`;
        return (UNIDADES_DIRECAO.includes(codigo) && direcao(codigo)) ||
            (COORDENACOES.includes(codigo) && tem(`${codigo}/Coord`));
    }

    return false;
}

// ==================================================
// CATÁLOGO E INICIALIZAÇÃO
// ==================================================

function indexarFuncoes(estrutura, percurso = []) {
    const codigo = String(estrutura.codigo || "");
    const anterior = percurso.join("/");
    const atual = anterior && codigo.startsWith(`${anterior}/`)
        ? codigo.split("/")
        : [...percurso, codigo];

    (estrutura.funcoes || []).forEach(f => {
        mapaFuncoes.set(f.codigo, {
            nome: f.nome,
            divisao: atual.filter(Boolean).join("/")
        });
    });

    filhos(estrutura).forEach(e => indexarFuncoes(e, atual));
}

function formatarVinculo(v) {
    const referencia = mapaFuncoes.get(v.codigo_vinculo);
    const nome = v.funcao || referencia?.nome || v.codigo_vinculo;
    const divisao = referencia?.divisao || [v.orgao, v.unidade].filter(Boolean).join("/");
    return divisao ? `${nome} [${divisao}]` : nome;
}

function buscarMilitar(id) {
    return consultar(supabase.from("militares")
        .select("id,nome,discord_id,patente,status")
        .eq("discord_id", id).maybeSingle());
}

document.addEventListener("DOMContentLoaded", iniciar);

async function iniciar() {
    try {
        const { user } = await consultar(supabase.auth.getUser());
        if (!user) throw Error("Usuário não autenticado.");

        const discordId = user.user_metadata?.provider_id || user.user_metadata?.sub;
        if (!discordId) throw Error("Discord ID não identificado.");

        const resposta = await fetch("/orgaos.json");
        if (!resposta.ok) throw Error("Não foi possível carregar o catálogo.");

        const dados = await resposta.json();
        if (!Array.isArray(dados.categorias)) throw Error("Catálogo institucional inválido.");

        categorias = dados.categorias;
        catalogo = dados.categorias.flatMap(c => c.orgaos || []);
        catalogoFuncoes = catalogo.flatMap(funcoes);
        mapaFuncoes.clear();
        catalogo.forEach(o => indexarFuncoes(o));

        militar = await buscarMilitar(discordId);
        if (!militar) throw Error("Militar não encontrado no CRME.");

        await carregarVinculos();


        mostrarVinculos();
        mostrarOrgaos();

    } catch (erro) {
        console.error(erro);
        elementos.orgaos.replaceChildren(mensagem(erro.message));
    }
}

// ==================================================
// IDENTIFICAÇÃO FUNCIONAL
// ==================================================

async function carregarVinculos() {
    const dados = await consultar(supabase.from("funcoes")
        .select("id,orgao,unidade,funcao,funcao_codigo,codigo_vinculo")
        .eq("militar_id", militar.id));

    vinculos = ordenarVinculos(dados || []);
}

function mostrarVinculos() {
    elementos.vinculos.replaceChildren();

    if (!vinculos.length) {
        elementos.vinculos.append(mensagem("Nenhum vínculo institucional cadastrado."));
        return;
    }

    vinculos.forEach(v => elementos.vinculos.append(
        el("span", "function-item", formatarVinculo(v))
    ));
}

// ==================================================
// ÓRGÃOS E NAVEGAÇÃO
// ==================================================

function mostrarOrgaos() {
    elementos.orgaos.replaceChildren();

    const lista = catalogo.filter(o => podeAcessar(o))
        .sort((a, b) => ordem(ORDEM, a.codigo) - ordem(ORDEM, b.codigo));

    elementos.vazio.hidden = lista.length > 0;

    categorias.forEach(c => {
        const permitidos = lista.filter(o => (c.orgaos || []).includes(o));
        if (!permitidos.length) return;
        const grupo = el("section", "organ-category");
        grupo.append(tituloIcone(c.nome, "network"));
        const linhas = el("div", "organ-rows");
        permitidos.forEach(o => linhas.append(cartao(
            o, o.codigo === "DEC" ? "Departamento de Educação e Ciência" : o.nome,
            () => { caminho = [o]; renderizar(); }
        )));
        grupo.append(linhas);
        elementos.orgaos.append(grupo);
    });
}

function voltar() {
    versao++;
    caminho = [];
    elementos.secao.hidden = true;
    elementos.orgaos.parentElement.hidden = false;
    mostrarOrgaos();
}

elementos.voltar.addEventListener("click", () => {
    caminho.pop();
    caminho.length ? renderizar() : voltar();
});

async function renderizar() {
    const atual = ++versao, estrutura = caminho.at(-1);
    if (!estrutura) return voltar();

    elementos.orgaos.parentElement.hidden = true;
    elementos.secao.hidden = false;
    elementos.conteudo.replaceChildren();

    elementos.selecionado.textContent = caminho.length === 1 && estrutura.codigo === "DEC"
        ? "Departamento de Educação e Ciência" : estrutura.nome;

    elementos.voltar.textContent = caminho.length === 1
        ? "Voltar aos órgãos" : "Voltar à divisão anterior";

    const breadcrumb = $("organ-breadcrumb");
    breadcrumb.replaceChildren(btn("Órgãos", voltar, "organ-crumb"));
    caminho.forEach((item, i) => {
        breadcrumb.append(icone("next"));
        if (i === caminho.length - 1) {
            const atual = el("span", "", item.codigo);
            atual.setAttribute("aria-current", "page");
            breadcrumb.append(atual);
        } else {
            breadcrumb.append(btn(item.codigo, () => {
                caminho = caminho.slice(0, i + 1);
                renderizar();
            }, "organ-crumb"));
        }
    });

    mostrarMinhasFuncoes(estrutura);
    mostrarDivisoes(estrutura);
    await mostrarGerenciamento(estrutura, atual);

    if (atual !== versao) return;

    mostrarAutogerenciamento(estrutura, atual);
    mostrarAcoesAdministrativas(estrutura, atual);
    mostrarAcaoMonitoramento(estrutura);
    if (ativo()) {
        const destinos = funcoes(estrutura).map(f => f.codigo);
        const presidencia = ["Presidente", "Vice-Presidente"].filter(tem);
        const representacoes = new Set([
            "Ministro da Defesa", "Comandante do Exército",
            "ACE/P", "EME/Ch", "JME/J", "CIE/Cmd",
            "DGP/Dir", "DGP/DCR/Dir", "DGP/DAP/Dir", "DGP/DFP/Dir",
            "DEC/Dir", "DEC/DEB/Dir", "DEC/DEA/Dir",
            "DTC/Dir", "DTC/DSA/Dir", "DTC/DRI/Dir", "DTC/DCI/Dir", "PE/Cmd"
        ]);
        const locais = (estrutura.funcoes || []).map(f => f.codigo);
        const codigos = presidencia.length
            ? (estrutura.codigo === "P" ? presidencia : locais.filter(c => representacoes.has(c)))
            : destinos.filter(tem);
        const filtro = v => codigos.includes(v.vinculo_autor) &&
            (estrutura.codigo === "P" || destinos.includes(v.vinculo_destino));
        if (codigos.length) {
            try {
                const lista = await rpc("advertencias_institucionais_listar") || [];
                if (atual !== versao) return;
                if (lista.some(filtro)) {
                    botaoPainel("Advertência institucional",
                        painel => carregarAdvertencias(painel, codigos, () => atual === versao, estrutura.codigo === "P" ? null : destinos),
                        "", "document");
                }
            } catch (erro) {
                console.error("Erro ao consultar competências disciplinares:", erro);
            }
        }
    }
    if (atual !== versao) return;
    await mostrarDocumentos(estrutura, atual);
    if (atual !== versao) return;
    await mostrarIntegrantes(estrutura, atual);
}

function mostrarMinhasFuncoes(estrutura) {

    const codigos = (estrutura.funcoes || []).map(f => f.codigo);
    const lista = vinculos.filter(v => codigos.includes(v.codigo_vinculo));

    if (!lista.length) return;
    elementos.conteudo.append(tituloIcone("Minhas funções", "users"));

    lista.forEach(v => elementos.conteudo.append(detalhes(v.funcao, v.codigo_vinculo)));
}

function mostrarDivisoes(estrutura) {
    const lista = filhos(estrutura).filter(d => podeAcessar(d, caminho));
    if (!lista.length) return;

    elementos.conteudo.append(tituloIcone(caminho.length === 1 ? "Unidades subordinadas" : "Subunidades", "network"));

    const container = el("div", "organs-list");
    lista.forEach(d => container.append(cartao(d, d.nome, () => {
        caminho.push(d);
        renderizar();
    })));

    elementos.conteudo.append(container);
}

async function atualizar(atual) {
    await carregarVinculos();
    mostrarVinculos();
    mostrarOrgaos();

    if (atual !== versao) return;

    const indice = caminho.findIndex((e, i) => !podeAcessar(e, caminho.slice(0, i)));
    if (indice !== -1) caminho = caminho.slice(0, indice);

    await renderizar();
}

// ==================================================
// ADIÇÃO E REMOÇÃO DE VÍNCULOS
// ==================================================

async function adicionarVinculo(id, codigo, atual) {
    await rpc("adicionar_funcao", {
        p_discord_id: id,
        p_codigo_vinculo: codigo
    });
    await atualizar(atual);
}

function botaoRemover(id, atual, texto = "Remover", pergunta = "Deseja remover este vínculo?") {
    const remover = btn(texto, async () => {
        if (atual !== versao || !confirm(pergunta)) return;
        remover.disabled = true;

        try {
            const ok = await rpc("remover_funcao", { p_funcao_id: id });
            if (ok !== true) throw Error("O vínculo não foi removido.");
            await atualizar(atual);
        } catch (erro) {
            alert(erro.message);
            remover.disabled = false;
        }
    }, "organ-remove-button");

    return remover;
}

// ==================================================
// AUTOGERENCIAMENTO
// ==================================================

function mostrarAutogerenciamento(estrutura, atual) {
    if (nivelAutogerenciamento() === null) return;

    const disponiveis = [...new Map(funcoes(estrutura)
        .filter(f => inferiorParaAutogerenciamento(f.codigo))
        .map(f => [f.codigo, f])).values()];

    if (!disponiveis.length) return;

    botaoPainel("Gerenciar minhas funções", painel => {
        if (atual !== versao) return;
        painel.replaceChildren();

        const atuais = new Set(vinculos.map(v => v.codigo_vinculo));
        const livres = disponiveis.filter(f => !atuais.has(f.codigo));
        const minhas = vinculos.filter(v => disponiveis.some(f => f.codigo === v.codigo_vinculo));

        const formulario = el("form", "organ-management-form");
        const select = seletorFuncoes(livres), msg = aviso();
        const adicionar = btn("Adicionar à minha conta");

        adicionar.type = "submit";
        adicionar.disabled = !livres.length;

        formulario.append(
            titulo("Adicionar função a mim mesmo"),
            campo("Função inferior", select), adicionar, msg
        );

        if (!livres.length) formulario.append(mensagem("Você já possui todas as funções disponíveis nesta divisão."));

        formulario.addEventListener("submit", async e => {
            e.preventDefault();

            if (atual !== versao || adicionar.disabled) return;
            if (!livres.some(f => f.codigo === select.value)) return;

            adicionar.disabled = true;
            msg.textContent = "Adicionando função...";

            try {
                await adicionarVinculo(militar.discord_id, select.value, atual);
            } catch (erro) {
                msg.textContent = erro.message;
                adicionar.disabled = false;
            }
        });

        painel.append(formulario, titulo("Minhas funções nesta divisão"));

        if (!minhas.length) painel.append(mensagem("Você não possui funções inferiores nesta divisão."));

        minhas.forEach(v => {
            const item = detalhes(v.funcao, v.codigo_vinculo);
            item.append(botaoRemover(v.id, atual, "Remover de mim", `Remover sua função ${v.funcao}?`));
            painel.append(item);
        });
    }, "organ-autogerenciamento-section", "settings");
}

// ==================================================
// GERENCIAMENTO DE OUTROS MILITARES
// ==================================================

async function funcoesPermitidas(estrutura) {
    if (!ativo()) return [];

    const dados = await consultar(supabase.from("catalogo_vinculos").select("codigo_vinculo"));
    const existentes = new Set((dados || []).map(v => v.codigo_vinculo));

    const candidatos = [...new Set(funcoes(estrutura).map(f => f.codigo))]
        .filter(c => existentes.has(c));

    const resultados = await Promise.all(candidatos.map(async codigo =>
        await rpc("pode_gerenciar_vinculo", { p_codigo_vinculo: codigo }) === true ? codigo : null
    ));

    return resultados.filter(Boolean);
}

async function mostrarGerenciamento(estrutura, atual) {
    try {
        const permitidos = await funcoesPermitidas(estrutura);
        if (atual !== versao || !permitidos.length) return;

        let carregado = false;

        botaoPainel("Gerenciar vínculos", async painel => {
            if (carregado) return;

            carregado = true;
            painel.textContent = "Carregando vínculos...";

            try {
                await carregarPainelVinculos(painel, caminho[0], permitidos, atual);
            } catch (erro) {
                carregado = false;
                painel.textContent = erro.message;
            }
        });

    } catch (erro) {
        console.error("Erro ao verificar gerenciamento:", erro);
    }
}

async function carregarPainelVinculos(painel, orgao, permitidos, atual) {
    const dados = await rpc("listar_vinculos_gerenciaveis", { p_orgao: orgao.codigo });
    if (atual !== versao) return;

    painel.replaceChildren();

    const formulario = el("form", "organ-management-form");
    const discord = inputDiscord(), msg = aviso();
    const select = seletorFuncoes(catalogoFuncoes.filter(f => permitidos.includes(f.codigo)));

    const adicionar = btn("Adicionar vínculo");
    adicionar.type = "submit";

    formulario.append(
        titulo("Adicionar vínculo"),
        campo("ID Discord do militar", discord),
        campo("Função", select), adicionar, msg
    );

    formulario.addEventListener("submit", async e => {
        e.preventDefault();
        if (atual !== versao) return;

        const id = discord.value.trim();

        if (!discordValido(id) || !permitidos.includes(select.value)) {
            msg.textContent = "Informe um ID Discord e uma função válidos.";
            return;
        }

        adicionar.disabled = true;

        try {
            await adicionarVinculo(id, select.value, atual);
        } catch (erro) {
            msg.textContent = erro.message;
        } finally {
            adicionar.disabled = false;
        }
    });

    painel.append(formulario, titulo("Vínculos administráveis"));

    const lista = ordenarVinculos((dados || []).filter(v => permitidos.includes(v.codigo_vinculo)));

    if (!lista.length) painel.append(mensagem("Nenhum vínculo administrável encontrado."));

    lista.forEach(v => {
        const item = detalhes(`${v.nome} — ${v.discord_id}`, v.codigo_vinculo);
        item.append(botaoRemover(v.funcao_id, atual));
        painel.append(item);
    });
}

// ==================================================
// AÇÕES ADMINISTRATIVAS E MONITORAMENTO
// ==================================================

function destinoAdministrativo(patente, tipo, nivel) {
    const indice = PATENTES_ADMIN.indexOf(patente);
    if (indice < 0) return null;

    const destino = indice + (tipo === "promocao" ? 1 : -1);
    if (destino < 0 || destino >= PATENTES_ADMIN.length) return null;
    if (tipo === "promocao" && destino > nivel) return null;
    if (tipo === "rebaixamento" && indice > nivel) return null;

    return PATENTES_ADMIN[destino];
}

function podeMonitorar() {
    return ativo() && (
        vinculos.some(v => ORGAOS_MONITORAMENTO.has(v.orgao)) ||
        [...Object.keys(NIVEIS_ADMIN), "Comandante do Exército"].some(tem)
    );
}

function mostrarAcaoMonitoramento(estrutura) {
    if (caminho.length !== 1 || !ORGAOS_MONITORAMENTO.has(estrutura.codigo) || !podeMonitorar()) return;
    const botao = btn("", () => { window.location.href = "/monitoramento.html"; }, "organ-card organ-operation-button");
    botao.append(icone("activity"), el("span", "organ-card-name", "Monitoramento"), icone("next"));
    secaoOperacoes().append(botao);
}
function mostrarAcoesAdministrativas(estrutura, atual) {
    if (caminho.length !== 1 || !["P", "M"].includes(estrutura.codigo)) return;
    const nivel = nivelAdministrativo();
    if (nivel < 1 || (estrutura.codigo === "P" && nivel < 2)) return;
    for (const tipo of ["promocao", "rebaixamento"]) {
        botaoPainel(tipo === "promocao" ? "Promoção administrativa" : "Rebaixamento administrativo",
            painel => abrirAcao(tipo, painel, atual, nivel), "", tipo === "promocao" ? "up" : "down");
    }
}

function abrirAcao(tipo, painel, atual, nivel) {
    if (atual !== versao) return;

    painel.hidden = false;
    painel.replaceChildren();

    const promocao = tipo === "promocao";
    const nome = promocao ? "Promoção Administrativa" : "Rebaixamento Administrativo";

    const formulario = el("form", "organ-management-form organ-admin-form");
    const discord = inputDiscord("ID Discord do militar");
    discord.className = "organ-admin-input";

    const observacao = el("textarea", "organ-admin-input organ-admin-textarea");
    Object.assign(observacao, {
        required: true, rows: 4,
        placeholder: "Informe a justificativa da ação administrativa."
    });

    const msg = aviso(), resultado = el("div", "organ-action");
    const verificar = btn("Verificar militar");
    const confirmar = btn(promocao ? "Confirmar promoção" : "Confirmar rebaixamento");

    verificar.type = "submit";
    resultado.hidden = confirmar.hidden = true;

    let verificado = null, destino = null;

    function limpar() {
        verificado = destino = null;
        resultado.hidden = confirmar.hidden = true;
        resultado.replaceChildren();
        msg.textContent = "";
    }

    discord.addEventListener("input", limpar);

    formulario.addEventListener("submit", async e => {
        e.preventDefault();
        limpar();

        if (atual !== versao) return;

        const id = discord.value.trim();

        if (!discordValido(id)) {
            msg.textContent = "Informe um ID Discord válido.";
            return;
        }

        if (id === militar.discord_id) {
            msg.textContent = "Você não pode executar essa ação em si próprio.";
            return;
        }

        verificar.disabled = true;
        msg.textContent = "Verificando militar...";

        try {
            const alvo = await buscarMilitar(id);

            if (atual !== versao || discord.value.trim() !== id) return;
            if (!alvo) throw Error("Militar não encontrado ou consulta não permitida.");
            if (alvo.status !== "ativo") throw Error("O militar precisa estar ativo.");

            const nova = destinoAdministrativo(alvo.patente, tipo, nivel);
            if (!nova) throw Error("A patente atual não permite esta ação para sua autoridade.");

            verificado = alvo;
            destino = nova;

            resultado.replaceChildren(
                el("strong", "organ-action-title", `${alvo.nome} — ${alvo.discord_id}`),
                el("span", "organ-action-description", `Patente atual: ${alvo.patente}`),
                el("span", "organ-action-description", `Nova patente: ${nova}`)
            );

            resultado.hidden = confirmar.hidden = false;
            msg.textContent = "Militar apto na verificação inicial. Confirme para executar a ação.";

        } catch (erro) {
            msg.textContent = erro.message;
        } finally {
            verificar.disabled = false;
        }
    });

    confirmar.addEventListener("click", async () => {
        if (!verificado || !destino || atual !== versao) return;

        const justificativa = observacao.value.trim();

        if (!justificativa) {
            msg.textContent = "A observação é obrigatória para esta ação.";
            observacao.focus();
            return;
        }

        if (!confirm(`Confirma ${nome.toLowerCase()} de ${verificado.nome} para ${destino}?`)) return;

        confirmar.disabled = verificar.disabled = discord.disabled = true;
        msg.textContent = "Executando ação administrativa...";

        try {
            const resposta = await rpc(
                promocao ? "realizar_promocao_administrativa" : "realizar_rebaixamento_administrativo",
                { p_discord_id: verificado.discord_id, p_observacao: justificativa }
            );

            if (resposta?.sucesso !== true) throw Error("A operação não foi confirmada.");
            if (atual !== versao) return;

            resultado.replaceChildren(
                el("strong", "organ-action-title", `${resposta.militar} — ${resposta.discord_id}`),
                el("span", "organ-action-description", `${resposta.patente_anterior} → ${resposta.nova_patente}`)
            );

            resultado.hidden = false;
            confirmar.hidden = true;
            msg.textContent = "Ação realizada com sucesso e registrada no histórico militar.";

            verificado = destino = null;
            discord.value = observacao.value = "";

        } catch (erro) {
            msg.textContent = erro.message;
        } finally {
            confirmar.disabled = verificar.disabled = discord.disabled = false;
        }
    });

    formulario.append(
        titulo(nome), campo("ID Discord do militar", discord),
        verificar, resultado, campo("Observação *", observacao),
        confirmar, msg
    );

    painel.append(formulario);
}

// ==================================================
// INTEGRANTES
// ==================================================

async function mostrarIntegrantes(estrutura, atual) {
    const [orgao, unidade, subunidade] = caminho;
    const secao = el("section", "organ-integrantes-section");
    const conteudo = el("div", "organ-integrantes-content");

    conteudo.append(mensagem("Carregando integrantes..."));
    secao.append(tituloIcone("Integrantes", "users"), conteudo);
    elementos.conteudo.append(secao);

    try {
        const integrantes = await rpc("listar_integrantes_orgao", {
            p_orgao: orgao.codigo,
            p_unidade: unidade?.codigo || null,
            p_subunidade: subunidade?.codigo || null
        }) || [];

        if (atual !== versao) return;
        conteudo.replaceChildren();

        if (!integrantes.length) {
            conteudo.append(mensagem("Nenhum integrante ativo nesta estrutura."));
            return;
        }

        let grupos = 0;

        funcoes(estrutura).forEach(f => {
            const membros = integrantes.filter(m => m.codigo_vinculo === f.codigo)
                .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

            if (!membros.length) return;
            grupos++;

            const grupo = el("div", "organ-integrantes-grupo");
            grupo.append(el("h4", "organ-integrantes-funcao", `${f.nome} — ${f.codigo}`));

            membros.forEach(m => {
                const item = el("div", "organ-integrante");
                item.append(
                    el("strong", "organ-integrante-nome", m.nome),
                    el("span", "organ-integrante-detalhes", `${m.patente} • ${m.discord_id}`)
                );
                grupo.append(item);
            });

            conteudo.append(grupo);
        });

        if (!grupos) conteudo.append(mensagem("Não foi possível associar os vínculos ao catálogo institucional."));

    } catch (erro) {
        if (atual !== versao) return;
        console.error(erro);
        conteudo.replaceChildren(el("p", "organ-form-message", `Não foi possível carregar os integrantes: ${erro.message}`));
    }
}

async function mostrarDocumentos(estrutura, atual) {
    const orgao = caminho[0].codigo;
    const unidade = caminho.length > 1 ? estrutura.codigo : null;
    const codigo = caminho.map(e => e.codigo).join("/");
    try {
        // Destinatários explícitos, retornados apenas para documentos legíveis.
        const filtros = await rpc("documentos_filtros_disponiveis") || [];
        if (atual !== versao) return;
        const setores = new Map();
        for (const f of filtros) {
            if (f.tipo !== "setor") continue;
            if (!setores.has(f.documento_id)) setores.set(f.documento_id, []);
            setores.get(f.documento_id).push(f.codigo);
        }
        const documentos = [];
        for (let inicio = 0; ; inicio += 100) {
            const lote = await consultar(supabase.from("documentos")
                .select("id,titulo,orgao,unidade,visibilidade")
                .order("criado_em", { ascending: true })
                .order("id", { ascending: true })
                .range(inicio, inicio + 99));
            if (atual !== versao) return;
            documentos.push(...(lote || []));
            if (!lote || lote.length < 100) break;
        }
        const lista = documentos.filter(doc => {
            if (doc.visibilidade !== "restrito") {
                return doc.orgao === orgao && (doc.unidade || null) === unidade;
            }
            const destinos = setores.get(doc.id) || [];
            const principais = destinos.filter(c => !destinos.some(p =>
                p !== c && c.startsWith(p + "/")));
            return principais.includes(codigo);
        });
        if (!lista.length || atual !== versao) return;
        const secao = el("section", "organ-documents-section");
        secao.append(tituloIcone("Documentação institucional", "document"));
        const linhas = el("div", "organ-rows");
        lista.forEach(doc => {
            const link = el("a", "organ-card organ-document-link");
            link.href = "documentos.html?id=" + encodeURIComponent(doc.id);
            link.append(icone("document"), el("span", "organ-card-name", doc.titulo), icone("next"));
            linhas.append(link);
        });
        secao.append(linhas);
        elementos.conteudo.append(secao);
    } catch (erro) {
        if (atual !== versao) return;
        console.error("Erro ao carregar documentos institucionais:", erro);
        const secao = el("section", "organ-documents-section");
        secao.append(tituloIcone("Documentação institucional", "document"),
            mensagem("Não foi possível carregar os documentos."));
        elementos.conteudo.append(secao);
    }
}
