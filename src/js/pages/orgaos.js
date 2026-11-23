
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

let militar = null, vinculos = [], catalogo = [];
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

function cartao(estrutura, nome, acao) {
    const e = btn("", acao, "organ-card");
    e.append(
        el("span", "organ-card-name", nome),
        el("span", "organ-card-code", estrutura.codigo)
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

function botaoPainel(texto, carregar, classe = "") {
    const secao = el("section", classe);
    const painel = el("div");
    painel.hidden = true;
    const abrir = btn(texto, async () => {
        painel.hidden = !painel.hidden;
        abrir.setAttribute("aria-expanded", String(!painel.hidden));
        if (!painel.hidden) await carregar(painel);
    });
    abrir.setAttribute("aria-expanded", "false");
    secao.append(abrir, painel);
    elementos.conteudo.append(secao);
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

        catalogo = dados.categorias.flatMap(c => c.orgaos || []);
        catalogoFuncoes = catalogo.flatMap(funcoes);
        mapaFuncoes.clear();
        catalogo.forEach(o => indexarFuncoes(o));

        militar = await buscarMilitar(discordId);
        if (!militar) throw Error("Militar não encontrado no CRME.");

        await carregarVinculos();

        elementos.nome.textContent = militar.nome;
        elementos.discord.textContent = militar.discord_id;
        elementos.patente.textContent = militar.patente;

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

    lista.forEach(o => elementos.orgaos.append(cartao(
        o, o.codigo === "DEC" ? "Departamento de Educação e Ciência" : o.nome,
        () => { caminho = [o]; renderizar(); }
    )));
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

    elementos.conteudo.append(el("p", "section-description", caminho.map(e => e.codigo).join(" / ")));

    mostrarMinhasFuncoes(estrutura);
    mostrarDivisoes(estrutura);
    await mostrarGerenciamento(estrutura, atual);

    if (atual !== versao) return;

    mostrarAutogerenciamento(estrutura, atual);
    mostrarAcoesAdministrativas(estrutura, atual);
    mostrarAcaoMonitoramento(estrutura);
    await mostrarIntegrantes(estrutura, atual);
}

function mostrarMinhasFuncoes(estrutura) {
    elementos.conteudo.append(titulo("Minhas funções"));

    const codigos = (estrutura.funcoes || []).map(f => f.codigo);
    const lista = vinculos.filter(v => codigos.includes(v.codigo_vinculo));

    if (!lista.length) {
        elementos.conteudo.append(mensagem("Você não possui funções diretamente vinculadas a esta divisão."));
        return;
    }

    lista.forEach(v => elementos.conteudo.append(detalhes(v.funcao, v.codigo_vinculo)));
}

function mostrarDivisoes(estrutura) {
    const lista = filhos(estrutura).filter(d => podeAcessar(d, caminho));
    if (!lista.length) return;

    elementos.conteudo.append(titulo(caminho.length === 1 ? "Unidades" : "Subunidades"));

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
    }, "organ-autogerenciamento-section");
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

    let secao = [...elementos.conteudo.querySelectorAll(".organ-admin-section")]
        .find(e => e.querySelector(".organ-admin-buttons"));

    if (!secao) {
        secao = el("section", "organ-integrantes-section organ-admin-section");
        secao.append(titulo("Ações do Órgão"), el("div", "organ-admin-buttons"));
        elementos.conteudo.append(secao);
    }

    secao.querySelector(".organ-admin-buttons").append(btn(
        "Monitoramento", () => { window.location.href = "/monitoramento.html"; },
        "organ-submit-button organ-admin-button"
    ));
}

function mostrarAcoesAdministrativas(estrutura, atual) {
    if (caminho.length !== 1 || !["P", "M"].includes(estrutura.codigo)) return;

    const nivel = nivelAdministrativo();
    if (nivel < 1 || (estrutura.codigo === "P" && nivel < 2)) return;

    const secao = el("section", "organ-integrantes-section organ-admin-section");
    const botoes = el("div", "organ-admin-buttons");
    const painel = el("div", "organ-admin-panel");

    painel.hidden = true;

    ["promocao", "rebaixamento"].forEach(tipo => botoes.append(btn(
        tipo === "promocao" ? "Promoção Administrativa" : "Rebaixamento Administrativo",
        () => abrirAcao(tipo, painel, atual, nivel),
        "organ-submit-button organ-admin-button"
    )));

    secao.append(titulo("Ações do Órgão"), botoes, painel);
    elementos.conteudo.append(secao);
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
    secao.append(titulo("Integrantes"), conteudo);
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
