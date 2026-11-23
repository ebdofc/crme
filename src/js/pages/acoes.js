
import { supabase } from "../supabase.js";

const acoesList = document.getElementById("acoes-list");
const acaoForm = document.getElementById("acao-form");

const patentes = [
    "Recruta",
    "Soldado-Recruta",
    "Soldado",
    "Cabo",
    "Terceiro-Sargento",
    "Segundo-Sargento",
    "Primeiro-Sargento",
    "Subtenente",
    "Cadete",
    "Aspirante-a-Oficial",
    "Segundo-Tenente",
    "Primeiro-Tenente",
    "Capitão",
    "Major",
    "Tenente-Coronel",
    "Coronel",
    "General-de-Brigada",
    "General-de-Divisão",
    "General-de-Exército",
    "Marechal"
];

const acoes = {
    promocao: {
        titulo: "Promoção",
        descricao: "Informe o ID do Discord do militar que será promovido."
    },
    rebaixamento: {
        titulo: "Rebaixamento",
        descricao: "Informe o ID do Discord do militar que será rebaixado."
    },
    advertencia: {
        titulo: "Advertência Escrita",
        descricao: "Informe o ID do Discord do militar que receberá a advertência."
    }
};

const funcoes = {
    promocao: "realizar_promocao",
    rebaixamento: "realizar_rebaixamento",
    advertencia: "realizar_advertencia"
};

let acaoSelecionada = null;
let militarSelecionado = null;
let versaoConsulta = 0;

function criarElemento(tag, texto = "", classe = "") {
    const elemento = document.createElement(tag);
    elemento.textContent = String(texto ?? "");

    if (classe) {
        elemento.className = classe;
    }

    return elemento;
}

function formatarData(data) {
    if (!data) return "Não informado";

    return new Date(`${data}T00:00:00`)
        .toLocaleDateString("pt-BR");
}

function formatarPatente(patente) {
    return patente ?? "Ex-Militar";
}

function adicionarMensagem(container, mensagem, tipo = "") {
    const elemento = criarElemento(
        "div",
        mensagem,
        `acao-mensagem ${tipo}`.trim()
    );

    container.appendChild(elemento);
    return elemento;
}

function criarCampoDados(titulo, valor) {
    const bloco = document.createElement("div");
    bloco.className = "profile-data";

    bloco.appendChild(
        criarElemento("span", titulo, "profile-data-label")
    );

    bloco.appendChild(
        criarElemento(
            "strong",
            valor ?? "Não informado",
            "profile-data-value"
        )
    );

    return bloco;
}

function criarTransicao(patenteAnterior, novaPatente) {
    const transicao = document.createElement("div");
    transicao.className = "rank-transition";

    transicao.appendChild(
        criarElemento(
            "span",
            patenteAnterior,
            "rank-transition-old"
        )
    );

    transicao.appendChild(
        criarElemento(
            "span",
            "→",
            "rank-transition-arrow"
        )
    );

    transicao.appendChild(
        criarElemento(
            "span",
            novaPatente,
            "rank-transition-new"
        )
    );

    return transicao;
}

function obterTextoBotao(acao) {
    const textos = {
        promocao: "Registrar promoção",
        rebaixamento: "Registrar rebaixamento",
        advertencia: "Registrar advertência"
    };

    return textos[acao];
}

/* Seleção da ação */

acoesList.addEventListener("click", event => {
    const botao = event.target.closest(".acao-item");

    if (!botao || botao.disabled) return;

    const acao = botao.dataset.acao;

    if (!acoes[acao]) return;

    versaoConsulta++;
    acaoSelecionada = acao;
    militarSelecionado = null;

    document.querySelectorAll(".acao-item").forEach(item => {
        item.classList.remove("active");
    });

    botao.classList.add("active");
    carregarFormulario(acao);
});

/* Formulário */

function carregarFormulario(acao) {
    acaoForm.replaceChildren();

    acaoForm.appendChild(
        criarElemento("h2", acoes[acao].titulo)
    );

    acaoForm.appendChild(
        criarElemento("p", acoes[acao].descricao)
    );

    const formulario = document.createElement("form");
    formulario.id = "form-acao";

    const label = criarElemento(
        "label",
        "ID do Discord do militar"
    );

    const campoId = document.createElement("input");
    campoId.type = "text";
    campoId.name = "discord_id";
    campoId.placeholder = "Digite o ID do Discord...";
    campoId.autocomplete = "off";
    campoId.inputMode = "numeric";
    campoId.required = true;

    label.htmlFor = "acao-discord-id";
    campoId.id = "acao-discord-id";

    const pesquisa = document.createElement("div");
    pesquisa.className = "acao-search";

    const botaoPesquisar = document.createElement("button");
    botaoPesquisar.type = "button";
    botaoPesquisar.textContent = "Consultar militar";

    pesquisa.append(campoId, botaoPesquisar);

    const resultado = document.createElement("div");
    resultado.id = "militar-resultado";

    formulario.append(label, pesquisa, resultado);

    botaoPesquisar.addEventListener("click", () => {
        consultarMilitar(campoId.value.trim(), resultado, botaoPesquisar);
    });

    campoId.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            consultarMilitar(
                campoId.value.trim(),
                resultado,
                botaoPesquisar
            );
        }
    });

    campoId.addEventListener("input", () => {
        versaoConsulta++;
        militarSelecionado = null;
        resultado.replaceChildren();
    });

    formulario.addEventListener("submit", async event => {
        event.preventDefault();

        if (!militarSelecionado) {
            alert("Consulte um militar antes de registrar a ação.");
            return;
        }

        if (campoId.value.trim() !== militarSelecionado.discord_id) {
            alert("Consulte novamente o militar.");
            return;
        }

        const observacao = formulario
            .querySelector('textarea[name="observacao"]')
            ?.value.trim();

        if (!observacao) {
            alert("Preencha a observação.");
            return;
        }

        const botaoRegistrar = formulario.querySelector(
            'button[type="submit"]'
        );

        if (!botaoRegistrar || botaoRegistrar.disabled) return;

        const militar = militarSelecionado;
        const acaoAtual = acao;

        botaoRegistrar.disabled = true;
        botaoRegistrar.textContent = "Registrando...";

        campoId.disabled = true;
        botaoPesquisar.disabled = true;

        document.querySelectorAll(".acao-item").forEach(item => {
            item.disabled = true;
        });

        try {
            const { data, error } = await supabase.rpc(
                funcoes[acaoAtual],
                {
                    p_discord_id: militar.discord_id,
                    p_observacao: observacao
                }
            );

            if (error) throw error;

            const painelResultado = document.createElement("div");

            if (acaoAtual === "advertencia") {
                exibirResultadoAdvertencia(data, painelResultado);
            } else if (data?.desligado) {
                adicionarMensagem(
                    painelResultado,
                    `${data.militar} foi desligado automaticamente em decorrência do rebaixamento de Recruta.`,
                    "sucesso"
                );
            } else {
                adicionarMensagem(
                    painelResultado,
                    `${data.militar} foi ${
                        acaoAtual === "promocao" ? "promovido" : "rebaixado"
                    } de ${data.patente_anterior} para ${data.nova_patente}.`,
                    "sucesso"
                );
            }

            resultado.appendChild(painelResultado);

            botaoRegistrar.textContent = "Ação registrada";
            botaoRegistrar.disabled = true;
            militarSelecionado = null;

            console.log(`${acaoAtual} registrada:`, data);

        } catch (error) {
            console.error(`Erro ao registrar ${acaoAtual}:`, error);

            adicionarMensagem(
                resultado,
                error.message || "Não foi possível registrar a ação.",
                "erro"
            );

            botaoRegistrar.disabled = false;
            botaoRegistrar.textContent = obterTextoBotao(acaoAtual);

        } finally {
            campoId.disabled = false;
            botaoPesquisar.disabled = false;

            document.querySelectorAll(".acao-item").forEach(item => {
                item.disabled = false;
            });
        }
    });

    acaoForm.appendChild(formulario);
}

/* Consulta do militar */

async function consultarMilitar(discordId, resultado, botaoPesquisar) {
    const consultaAtual = ++versaoConsulta;

    resultado.replaceChildren();
    militarSelecionado = null;

    if (!/^\d{17,20}$/.test(discordId)) {
        adicionarMensagem(
            resultado,
            "Informe um ID do Discord válido, com 17 a 20 dígitos.",
            "erro"
        );
        return;
    }

    botaoPesquisar.disabled = true;
    botaoPesquisar.textContent = "Consultando...";

    adicionarMensagem(resultado, "Consultando militar...");

    try {
        const { data: militar, error } = await supabase
            .from("militares")
            .select(
                "id, nome, discord_id, patente, status, ingresso, advertencias"
            )
            .eq("discord_id", discordId)
            .maybeSingle();

        if (consultaAtual !== versaoConsulta) return;

        resultado.replaceChildren();

        if (error) throw error;

        if (!militar) {
            adicionarMensagem(
                resultado,
                "Nenhum militar encontrado com esse ID.",
                "erro"
            );
            return;
        }

        if (militar.status !== "ativo") {
            adicionarMensagem(
                resultado,
                "Este militar não está ativo e não pode receber esta ação.",
                "aviso"
            );
            return;
        }

        militarSelecionado = militar;
        exibirMilitar(militar, resultado);

    } catch (error) {
        if (consultaAtual !== versaoConsulta) return;

        console.error(error);
        resultado.replaceChildren();

        adicionarMensagem(
            resultado,
            "Erro ao consultar o militar.",
            "erro"
        );

    } finally {
        if (consultaAtual === versaoConsulta) {
            botaoPesquisar.disabled = false;
            botaoPesquisar.textContent = "Consultar militar";
        }
    }
}

/* Painel do militar */

function exibirMilitar(militar, resultado) {
    const identificacao = document.createElement("div");
    identificacao.className = "militar-identificado";

    const cabecalho = document.createElement("div");
    cabecalho.className = "profile-header";

    cabecalho.appendChild(
        criarElemento(
            "span",
            "IDENTIFICAÇÃO MILITAR · CRME",
            "profile-label"
        )
    );

    cabecalho.appendChild(
        criarElemento("h2", militar.nome, "profile-name")
    );

    const badges = document.createElement("div");
    badges.className = "profile-badges";

    badges.appendChild(
        criarElemento(
            "span",
            formatarPatente(militar.patente),
            "rank-badge"
        )
    );

    badges.appendChild(
        criarElemento(
            "span",
            (militar.status || "Não informado").toUpperCase(),
            `status-badge status-${militar.status}`
        )
    );

    cabecalho.appendChild(badges);

    const secaoDados = document.createElement("section");
    secaoDados.className = "profile-identification";

    secaoDados.appendChild(
        criarElemento("h3", "Identificação Militar")
    );

    const grade = document.createElement("div");
    grade.className = "profile-data-grid";

    grade.appendChild(
        criarCampoDados("ID Discord", militar.discord_id)
    );

    grade.appendChild(
        criarCampoDados(
            "Data de ingresso",
            formatarData(militar.ingresso)
        )
    );

    grade.appendChild(
        criarCampoDados(
            "Advertências escritas",
            `${militar.advertencias ?? 0}/3`
        )
    );

    secaoDados.appendChild(grade);

    const detalhes = document.createElement("section");
    detalhes.className = "acao-details";

    detalhes.appendChild(
        criarElemento("h3", "Detalhes da Ação Administrativa")
    );

    if (acaoSelecionada === "promocao") {
        prepararPromocao(militar, detalhes);
    }

    if (acaoSelecionada === "rebaixamento") {
        prepararRebaixamento(militar, detalhes);
    }

    if (acaoSelecionada === "advertencia") {
        prepararAdvertencia(militar, detalhes);
    }

    identificacao.append(cabecalho, secaoDados, detalhes);
    resultado.appendChild(identificacao);
}

/* Promoção */

function prepararPromocao(militar, detalhes) {
    const indice = patentes.indexOf(militar.patente);

    if (indice === -1 || indice > 6) {
        adicionarMensagem(
            detalhes,
            "Este militar não pode ser promovido por esta ação administrativa.",
            "aviso"
        );
        return;
    }

    detalhes.appendChild(
        criarTransicao(
            militar.patente,
            patentes[indice + 1]
        )
    );

    adicionarObservacao(detalhes);
}

/* Rebaixamento */

function prepararRebaixamento(militar, detalhes) {
    const indice = patentes.indexOf(militar.patente);

    const podeRebaixar =
        indice >= 0 &&
        (indice <= 7 || militar.patente === "Aspirante-a-Oficial");

    if (!podeRebaixar) {
        adicionarMensagem(
            detalhes,
            "Este militar não pode ser rebaixado por esta ação administrativa.",
            "aviso"
        );
        return;
    }

    if (militar.patente === "Recruta") {
        adicionarMensagem(
            detalhes,
            "O rebaixamento de um Recruta resultará em desligamento automático. O motivo será registrado no histórico.",
            "aviso"
        );

    } else {
        const novaPatente =
            militar.patente === "Aspirante-a-Oficial"
                ? "Subtenente"
                : patentes[indice - 1];

        detalhes.appendChild(
            criarTransicao(militar.patente, novaPatente)
        );
    }

    adicionarObservacao(detalhes);
}

/* Advertência escrita */

function prepararAdvertencia(militar, detalhes) {
    const quantidade = militar.advertencias || 0;

    detalhes.appendChild(
        criarElemento(
            "span",
            `Advertências acumuladas: ${quantidade}/3`,
            "advertencia-contador"
        )
    );

    const proximaAdvertencia = quantidade + 1;

    if (proximaAdvertencia >= 3) {
        adicionarMensagem(
            detalhes,
            "Esta advertência atingirá o limite de três e provocará uma consequência automática.",
            "aviso"
        );

        const consequencia = calcularConsequenciaDisciplinar(
            militar.patente
        );

        detalhes.appendChild(
            criarElemento(
                "div",
                `Consequência: ${consequencia}`,
                "acao-alerta"
            )
        );

    } else {
        detalhes.appendChild(
            criarElemento(
                "p",
                `Faltam ${3 - proximaAdvertencia} advertência(s) para atingir o limite.`
            )
        );
    }

    adicionarObservacao(detalhes);
}

function calcularConsequenciaDisciplinar(patente) {
    const indice = patentes.indexOf(patente);

    if (patente === "Recruta") {
        return "Desligamento automático";
    }

    if (
        patente === "Aspirante-a-Oficial" ||
        patente === "Cadete"
    ) {
        return "Rebaixamento automático para Subtenente";
    }

    if (indice > 0) {
        return `Rebaixamento automático para ${patentes[indice - 1]}`;
    }

    return "Consequência não definida para esta patente";
}

/* Observação e registro */

function adicionarObservacao(container) {
    const label = criarElemento(
        "label",
        acaoSelecionada === "advertencia"
            ? "Descrição da advertência"
            : "Observação"
    );

    const observacao = document.createElement("textarea");
    observacao.name = "observacao";
    observacao.id = "acao-observacao";
    observacao.rows = 4;
    observacao.required = true;
    observacao.placeholder = "Digite a observação...";

    label.htmlFor = observacao.id;

    const botao = document.createElement("button");
    botao.type = "submit";
    botao.className = "acao-submit";
    botao.textContent = obterTextoBotao(acaoSelecionada);

    container.append(label, observacao, botao);
}

/* Resultado da advertência */

function exibirResultadoAdvertencia(data, resultado) {
    adicionarMensagem(
        resultado,
        `Advertência registrada para ${data.militar}.`,
        "sucesso"
    );

    if (data.consequencia) {
        adicionarMensagem(
            resultado,
            `Consequência automática: ${data.consequencia}.`,
            "aviso"
        );

        adicionarMensagem(
            resultado,
            "O contador de advertências foi zerado."
        );

        return;
    }

    adicionarMensagem(
        resultado,
        `Advertências acumuladas: ${data.advertencias}/3.`
    );
}
