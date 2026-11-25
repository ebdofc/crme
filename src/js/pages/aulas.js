import { supabase } from "../supabase.js";

// ========================================
// CONFIGURAÇÕES
// ========================================

const DIRETORIAS = {
    DEA: {
        nome: "Diretoria de Ensino Avançado",
        unidades: ["EPCE", "AMFO", "AMFS"]
    },
    DEB: {
        nome: "Diretoria de Ensino Básico",
        unidades: ["CIM", "CAM"]
    },
};

const NOMES_UNIDADES = {
    CIM: "Centro de Instrução Militar",
    CAM: "Centro de Aperfeiçoamento Militar",
    EPCE: "Escola de Preparação de Cadetes do Exército",
    AMFO: "Academia Militar de Formação de Oficiais",
    AMFS: "Academia Militar de Formação Superior"
};

const ORDEM_CURSOS = {
    CIM: ["IIB", "CFSd", "CFCb"],
    CAM: ["CFSg", "CASg", "CFSb", "CASb"],
    EPCE: ["CIC", "CPC"],
    AMFO: ["CFO", "CAO", "CFCp", "ADOM"],
    AMFS: ["CFMj", "CQOS", "AOC", "AFOS"]
};

const DIRECAO_DEC = ["DEC/Dir", "DEC/VDir"];
const CHEFIAS = ["Dir", "VDir", "Coord"];
const LIMITE_AULAS = 50;
const VALIDADORES_EPCE = new Set([
    "DEC/Dir", "DEC/VDir", "DEC/DEA/Dir",
    "DEC/DEA/VDir", "DEC/DEA/Coord"
]);
let versaoPendencias = 0;
let validacaoEmAndamento = false;

function podeValidarEPCE() {
    return militarAtual?.status === "ativo" &&
        vinculosAtuais.some(v => VALIDADORES_EPCE.has(v.codigo_vinculo));
}

function fecharValidacoes() {
    if (validacaoEmAndamento) return;
    versaoPendencias++;
    el("validation-modal").hidden = true;
}

async function carregarPendencias() {
    const versao = ++versaoPendencias;
    const lista = el("validation-list");
    const mensagem = el("validation-message");
    lista.replaceChildren();
    mensagem.textContent = "Carregando promoções pendentes...";

    try {
        const { data, error } = await supabase.rpc(
            "listar_promocoes_aulas_pendentes"
        );
        if (versao !== versaoPendencias || el("validation-modal").hidden) return;
        if (error) throw error;
        mensagem.textContent = data?.length ? "" : "Nenhuma promoção pendente de validação.";

        for (const item of data || []) {
            const registro = document.createElement("article");
            registro.className = "class-record validation-record";
            const titulo = document.createElement("strong");
            titulo.className = "class-record-title";
            titulo.textContent = `${item.militar_nome} — ${item.curso_codigo}`;
            registro.appendChild(titulo);
            detalhe(registro, `Curso: ${item.curso_nome}`);
            detalhe(registro, `Instrutor: ${item.instrutor_nome || "Não disponível"}`);
            detalhe(registro, `Data da aula: ${formatarData(item.data_aula)}`);
            detalhe(registro, `Promoção: ${item.patente_atual} → ${item.nova_patente}`);
            const botao = document.createElement("button");
            botao.type = "button";
            botao.className = "primary-button";
            botao.textContent = "Validar promoção";
            botao.addEventListener("click", () => validarPromocao(item));
            registro.appendChild(botao);
            lista.appendChild(registro);
        }
    } catch (erro) {
        if (versao !== versaoPendencias) return;
        console.error("Erro ao consultar validações:", erro);
        mensagem.textContent = erro.message || "Não foi possível consultar as pendências.";
    }
}

function abrirValidacoes() {
    if (unidadeAtual !== "EPCE" || !podeValidarEPCE()) return;
    el("validation-modal").hidden = false;
    carregarPendencias();
}

async function validarPromocao(item) {
    if (validacaoEmAndamento || !podeValidarEPCE()) return;
    const confirmado = window.confirm(
        `Confirmar a promoção de ${item.militar_nome} de ${item.patente_atual} ` +
        `para ${item.nova_patente}, por aprovação no ${item.curso_codigo}?`
    );
    if (!confirmado) return;

    validacaoEmAndamento = true;
    const mensagem = el("validation-message");
    const botoes = el("validation-list").querySelectorAll("button");
    botoes.forEach(b => b.disabled = true);
    el("close-validation-button").disabled = true;
    mensagem.textContent = "Validando promoção...";
    try {
        const { data, error } = await supabase.rpc("validar_promocao_aula", {
            p_aula_id: item.aula_id
        });
        if (error) throw error;
        if (!data?.sucesso) throw new Error("O sistema não confirmou a promoção.");
        await carregarPendencias();
        mensagem.textContent = `Promoção confirmada: ${data.militar} — ${data.nova_patente}.`;
        if (unidadeAtual === "EPCE") {
            try { await carregarAulas(); }
            catch (erro) { console.error("Erro ao atualizar aulas:", erro); }
        }
    } catch (erro) {
        console.error("Erro ao validar promoção:", erro);
        mensagem.textContent = erro.message || "Não foi possível validar a promoção.";
    } finally {
        validacaoEmAndamento = false;
        el("close-validation-button").disabled = false;
        el("validation-list").querySelectorAll("button").forEach(b => b.disabled = false);
    }
}

const el = id => document.getElementById(id);

let usuarioAtual = null;
let militarAtual = null;
let vinculosAtuais = [];
let cursosAtuais = [];
let diretoriaAtual = null;
let unidadeAtual = null;
let alunoConfirmado = null;
let versaoConsulta = 0;
let versaoVerificacao = 0;

// ========================================
// PERMISSÕES
// ========================================

function unidadesPermitidas() {
    const unidades = new Set();

    if (militarAtual?.status !== "ativo") {
        return unidades;
    }

    const codigos = new Set(
        vinculosAtuais.map(v => v.codigo_vinculo)
    );

    if (DIRECAO_DEC.some(c => codigos.has(c))) {
        Object.keys(NOMES_UNIDADES).forEach(
            unidade => unidades.add(unidade)
        );
    }

    for (const diretoria of Object.keys(DIRETORIAS)) {
        if (CHEFIAS.some(c =>
            codigos.has(`DEC/${diretoria}/${c}`)
        )) {
            DIRETORIAS[diretoria].unidades.forEach(
                unidade => unidades.add(unidade)
            );
        }
    }

    for (const unidade of Object.keys(NOMES_UNIDADES)) {
        if (codigos.has(`DEC/${unidade}/Ins`)) {
            unidades.add(unidade);
        }
    }

    return unidades;
}

// ========================================
// ELEMENTOS
// ========================================

function mostrarErro(mensagem) {
    el("directorates-list").replaceChildren();
    el("no-directorates").hidden = false;
    el("no-directorates").textContent = mensagem;
}

function criarCartao(nome, codigo, acao) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "selection-card";

    const titulo = document.createElement("span");
    titulo.className = "selection-card-name";
    titulo.textContent = nome;

    const sigla = document.createElement("span");
    sigla.className = "selection-card-code";
    sigla.textContent = codigo;

    botao.append(titulo, sigla);
    botao.addEventListener("click", acao);

    return botao;
}

// ========================================
// INICIALIZAÇÃO
// ========================================

async function inicializar() {
    try {
        const {
            data: { user },
            error: erroUsuario
        } = await supabase.auth.getUser();

        if (erroUsuario || !user) {
            throw new Error(
                "Não foi possível identificar o usuário autenticado."
            );
        }

        usuarioAtual = user;

        const discordId =
            user.user_metadata?.provider_id ||
            user.user_metadata?.sub;

        if (!discordId) {
            throw new Error(
                "Não foi possível identificar seu ID do Discord."
            );
        }

        const {
            data: militar,
            error: erroMilitar
        } = await supabase
            .from("militares")
            .select("id, nome, discord_id, patente, status")
            .eq("discord_id", discordId)
            .maybeSingle();

        if (erroMilitar) throw erroMilitar;

        if (!militar) {
            throw new Error(
                "Militar não encontrado no cadastro do CRME."
            );
        }

        militarAtual = militar;

        const {
            data: vinculos,
            error: erroVinculos
        } = await supabase
            .from("funcoes")
            .select(
                "orgao, unidade, funcao, funcao_codigo, codigo_vinculo"
            )
            .eq("militar_id", militar.id);

        if (erroVinculos) throw erroVinculos;

        vinculosAtuais = vinculos || [];

        el("military-name").textContent = militar.nome;
        el("military-discord-id").textContent = militar.discord_id;
        el("military-rank").textContent =
            militar.patente || "Ex-Militar";

        const lista = el("military-functions-list");
        lista.replaceChildren();

        if (!vinculosAtuais.length) {
            const vazio = document.createElement("p");
            vazio.className = "empty-message";
            vazio.textContent =
                "Nenhum vínculo institucional cadastrado.";
            lista.appendChild(vazio);
        }

        for (const vinculo of vinculosAtuais) {
            const item = document.createElement("span");
            item.className = "function-item";
            item.textContent = vinculo.codigo_vinculo;
            lista.appendChild(item);
        }

        exibirDiretorias();

    } catch (erro) {
        console.error("Erro ao inicializar Aulas:", erro);
        mostrarErro(
            erro.message ||
            "Não foi possível carregar a página."
        );
    }
}

// ========================================
// DIRETORIAS
// ========================================

function exibirDiretorias() {
    fecharValidacoes();
    versaoConsulta++;

    diretoriaAtual = null;
    unidadeAtual = null;

    el("directorates-section").hidden = false;
    el("units-section").hidden = true;
    el("classes-section").hidden = true;

    const lista = el("directorates-list");
    lista.replaceChildren();

    const permitidas = unidadesPermitidas();
    let quantidade = 0;

    for (const [codigo, diretoria] of Object.entries(DIRETORIAS)) {
        if (!diretoria.unidades.some(u => permitidas.has(u))) {
            continue;
        }

        quantidade++;

        lista.appendChild(
            criarCartao(diretoria.nome, codigo, () => {
                exibirUnidades(codigo);
            })
        );
    }

    el("no-directorates").hidden = quantidade > 0;
}

// ========================================
// UNIDADES
// ========================================

function exibirUnidades(codigo) {
    fecharValidacoes();
    versaoConsulta++;

    diretoriaAtual = codigo;
    unidadeAtual = null;

    el("directorates-section").hidden = true;
    el("units-section").hidden = false;
    el("classes-section").hidden = true;

    el("selected-directorate-name").textContent =
        DIRETORIAS[codigo].nome;

    const lista = el("units-list");
    lista.replaceChildren();

    const permitidas = unidadesPermitidas();

    for (const unidade of DIRETORIAS[codigo].unidades) {
        if (!permitidas.has(unidade)) continue;

        lista.appendChild(
            criarCartao(
                NOMES_UNIDADES[unidade],
                unidade,
                () => abrirUnidade(unidade)
            )
        );
    }
}

// ========================================
// ABERTURA DA UNIDADE
// ========================================

async function abrirUnidade(unidade) {
    if (!unidadesPermitidas().has(unidade)) return;

    fecharValidacoes();
    unidadeAtual = unidade;
    el("validate-classes-button").hidden = unidade !== "EPCE" || !podeValidarEPCE();

    const versao = ++versaoConsulta;

    el("units-section").hidden = true;
    el("classes-section").hidden = false;

    el("selected-unit-name").textContent =
        `${NOMES_UNIDADES[unidade]} (${unidade})`;

    el("class-form").hidden = true;
    el("classes-list").replaceChildren();
    el("classes-message").textContent = "Carregando aulas...";

    try {
        const {
            data: cursos,
            error: erroCursos
        } = await supabase
            .from("catalogo_cursos")
            .select(
                "codigo, nome, unidade, patente_exigida"
            )
            .eq("unidade", unidade)
            .eq("ativo", true);

        if (erroCursos) throw erroCursos;
        if (versao !== versaoConsulta) return;

        const ordem = ORDEM_CURSOS[unidade] || [];

        cursosAtuais = (cursos || []).sort((a, b) => {
            const posicaoA = ordem.indexOf(a.codigo);
            const posicaoB = ordem.indexOf(b.codigo);

            const indiceA = posicaoA === -1
                ? Number.MAX_SAFE_INTEGER
                : posicaoA;

            const indiceB = posicaoB === -1
                ? Number.MAX_SAFE_INTEGER
                : posicaoB;

            if (indiceA !== indiceB) {
                return indiceA - indiceB;
            }

            return a.nome.localeCompare(b.nome, "pt-BR");
        });

        preencherCursos();
        await carregarAulas(versao);

    } catch (erro) {
        if (versao !== versaoConsulta) return;

        console.error("Erro ao abrir unidade:", erro);

        el("classes-message").textContent =
            erro.message ||
            "Não foi possível carregar as aulas.";
    }
}

// ========================================
// CURSOS
// ========================================

function preencherCursos() {
    const select = el("class-course");

    select.replaceChildren(
        new Option("Selecione um curso", "")
    );

    for (const curso of cursosAtuais) {
        select.add(
            new Option(
                `${curso.codigo} — ${curso.nome}`,
                curso.codigo
            )
        );
    }

    el("required-rank").textContent = "";
    el("class-student-discord").value = "";
    invalidarAluno();
}

function invalidarAluno() {
    versaoVerificacao++;
    alunoConfirmado = null;
    el("student-verification").textContent = "";
}

function atualizarCurso() {
    const curso = cursosAtuais.find(
        c => c.codigo === el("class-course").value
    );

    el("required-rank").textContent = curso
        ? `Patente exigida: ${curso.patente_exigida}`
        : "";

    el("class-student-discord").value = "";
    invalidarAluno();
}

// ========================================
// FORMATAÇÃO
// ========================================

function formatarData(valor) {
    if (!valor) return "Data indisponível";

    return new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    }).format(new Date(valor));
}

function detalhe(registro, texto) {
    const elemento = document.createElement("span");
    elemento.className = "class-record-detail";
    elemento.textContent = texto;
    registro.appendChild(elemento);
}

// ========================================
// CONSULTA DAS ÚLTIMAS 50 AULAS
// ========================================

async function carregarAulas(versao = versaoConsulta) {
    const codigos = cursosAtuais.map(c => c.codigo);
    const lista = el("classes-list");

    lista.replaceChildren();

    if (!codigos.length) {
        el("classes-message").textContent =
            "Nenhum curso ativo cadastrado nesta unidade.";
        return;
    }

    const {
        data: aulas,
        error
    } = await supabase
        .from("aulas")
        .select(
            "id, militar_id, instrutor_id, curso_codigo, resultado, observacao, criado_em"
        )
        .in("curso_codigo", codigos)
        .order("criado_em", { ascending: false })
        .limit(LIMITE_AULAS);

    if (versao !== versaoConsulta) return;
    if (error) throw error;

    if (!aulas?.length) {
        el("classes-message").textContent =
            "Nenhuma aula registrada nesta unidade.";
        return;
    }

    const ids = [
        ...new Set(
            aulas.flatMap(a => [
                a.militar_id,
                a.instrutor_id
            ])
        )
    ];

    const {
        data: militares,
        error: erroMilitares
    } = await supabase
        .from("militares")
        .select("id, nome, patente")
        .in("id", ids);

    if (versao !== versaoConsulta) return;
    if (erroMilitares) throw erroMilitares;

    const nomes = new Map(
        (militares || []).map(m => [m.id, m.nome])
    );

    el("classes-message").textContent = "";

    for (const aula of aulas) {
        const curso = cursosAtuais.find(
            c => c.codigo === aula.curso_codigo
        );

        const registro = document.createElement("div");
        registro.className = "class-record";

        const titulo = document.createElement("span");
        titulo.className = "class-record-title";
        titulo.textContent =
            `${aula.curso_codigo} — ${aula.resultado}`;

        registro.appendChild(titulo);

        detalhe(
            registro,
            `Curso: ${curso?.nome || aula.curso_codigo}`
        );

        detalhe(
            registro,
            `Aluno: ${nomes.get(aula.militar_id) || "Militar não disponível"}`
        );

        detalhe(
            registro,
            `Instrutor: ${nomes.get(aula.instrutor_id) || "Militar não disponível"}`
        );

        detalhe(
            registro,
            `Registrado em: ${formatarData(aula.criado_em)}`
        );

        if (aula.observacao) {
            detalhe(
                registro,
                `Observação: ${aula.observacao}`
            );
        }

        lista.appendChild(registro);
    }
}

// ========================================
// VERIFICAÇÃO DO MILITAR
// ========================================

async function verificarAluno() {
    const versao = ++versaoVerificacao;
    alunoConfirmado = null;

    const mensagem = el("student-verification");
    const discordId =
        el("class-student-discord").value.trim();

    const curso = cursosAtuais.find(
        c => c.codigo === el("class-course").value
    );

    mensagem.textContent = "";

    if (!curso) {
        mensagem.textContent =
            "Selecione um curso antes de informar o militar.";
        return;
    }

    if (!discordId) return;

    if (!/^\d{17,20}$/.test(discordId)) {
        mensagem.textContent =
            "Informe um ID Discord válido.";
        return;
    }

    mensagem.textContent = "Verificando militar...";

    try {
        const {
            data: militar,
            error
        } = await supabase
            .from("militares")
            .select(
                "id, nome, discord_id, patente, status"
            )
            .eq("discord_id", discordId)
            .maybeSingle();

        if (versao !== versaoVerificacao) return;

        if (error) throw error;

        if (!militar) {
            mensagem.textContent =
                "Militar não encontrado no CRME.";
            return;
        }

        if (militar.status !== "ativo") {
            mensagem.textContent =
                "O militar não está ativo.";
            return;
        }

        if (militar.patente !== curso.patente_exigida) {
            mensagem.textContent =
                `Militar não habilitado. Patente atual: ${militar.patente}. Patente exigida: ${curso.patente_exigida}.`;
            return;
        }

        alunoConfirmado = militar;

        mensagem.textContent =
            `Militar confirmado: ${militar.nome} — ${militar.discord_id}`;

    } catch (erro) {
        if (versao !== versaoVerificacao) return;

        console.error(
            "Erro ao verificar militar:",
            erro
        );

        mensagem.textContent =
            erro.message ||
            "Não foi possível verificar o militar.";
    }
}

// ========================================
// REGISTRO DE AULA
// ========================================

async function registrarAula(evento) {
    evento.preventDefault();

    const botao = el("save-class-button");
    const mensagem = el("class-form-message");

    const curso = cursosAtuais.find(
        c => c.codigo === el("class-course").value
    );

    const discordId =
        el("class-student-discord").value.trim();

    const observacao =
        el("class-observation").value.trim();

    if (
        !curso ||
        curso.unidade !== unidadeAtual ||
        !unidadesPermitidas().has(unidadeAtual)
    ) {
        mensagem.textContent =
            "Curso ou unidade não autorizados.";
        return;
    }

    if (
        !alunoConfirmado ||
        alunoConfirmado.discord_id !== discordId
    ) {
        mensagem.textContent =
            "Informe e confirme um militar válido.";
        return;
    }

    if (!el("class-result").value) {
        mensagem.textContent =
            "Selecione o resultado da aula.";
        return;
    }

    if (!observacao) {
        mensagem.textContent =
            "Preencha a observação da aula.";
        return;
    }

    botao.disabled = true;
    mensagem.textContent = "Registrando aula...";

    try {
        const { error } = await supabase.rpc(
            "registrar_aula_segura",
            {
                p_militar_id: alunoConfirmado.id,
                p_curso_codigo: curso.codigo,
                p_resultado: el("class-result").value,
                p_observacao: observacao,
                p_autor_uid: usuarioAtual.id
            }
        );

        if (error) throw error;

        el("class-form").reset();
        el("class-form").hidden = true;

        preencherCursos();

        await carregarAulas();

    } catch (erro) {
        console.error(
            "Erro ao registrar aula:",
            erro
        );

        mensagem.textContent =
            erro.message ||
            "Não foi possível registrar a aula.";

    } finally {
        botao.disabled = false;
    }
}

// ========================================
// NAVEGAÇÃO
// ========================================

el("validate-classes-button").addEventListener("click", abrirValidacoes);
el("close-validation-button").addEventListener("click", fecharValidacoes);
el("validation-modal").addEventListener("click", evento => {
    if (evento.target === el("validation-modal")) fecharValidacoes();
});
document.addEventListener("keydown", evento => {
    if (evento.key === "Escape" && !el("validation-modal").hidden) fecharValidacoes();
});

el("back-to-directorates").addEventListener(
    "click",
    exibirDiretorias
);

el("back-to-units").addEventListener(
    "click",
    () => exibirUnidades(diretoriaAtual)
);

el("new-class-button").addEventListener(
    "click",
    () => {
        el("class-form").reset();
        preencherCursos();

        el("class-form-message").textContent = "";
        el("class-form").hidden = false;
    }
);

el("cancel-class-button").addEventListener(
    "click",
    () => {
        invalidarAluno();
        el("class-form").hidden = true;
    }
);

el("class-course").addEventListener(
    "change",
    atualizarCurso
);

el("class-student-discord").addEventListener(
    "input",
    invalidarAluno
);

el("class-student-discord").addEventListener(
    "change",
    verificarAluno
);

el("class-student-discord").addEventListener(
    "blur",
    verificarAluno
);

el("class-form").addEventListener(
    "submit",
    registrarAula
);

document.addEventListener(
    "DOMContentLoaded",
    inicializar
);
