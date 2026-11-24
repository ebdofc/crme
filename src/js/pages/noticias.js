import { registerDivider, insertDivider } from "../quill-divider.js";
import { supabase } from "../supabase.js";

const $ = id => document.getElementById(id);

const STATUS = {
    publicada: "Publicada",
    pendente: "Pendente de aprovação",
    reprovada: "Reprovada"
};

const estado = {
    militar: null,
    permissoes: { criar: false, publicar: false },
    noticias: [],
    selecionada: null,
    editando: null,
    aba: "published-news",
    editor: null,
    ocupado: false
};

async function consultar(promise) {
    const { data, error } = await promise;
    if (error) throw new Error(error.message);
    return data;
}

const rpc = (nome, parametros = {}) =>
    consultar(supabase.rpc(nome, parametros));

const autor = n =>
    `${n.autor_patente} ${n.autor_nome} — ${n.autor_vinculo}`;

const dataBR = data => data
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo"
    }).format(new Date(data))
    : "";

function el(tag, classe = "", texto = "") {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    e.textContent = texto;
    return e;
}

function feedback(texto = "", tipo = "success") {
    const e = $("news-feedback");
    e.hidden = !texto;
    e.textContent = texto;
    e.className = texto ? tipo : "";
}

function ocupado(valor) {
    estado.ocupado = valor;

    [
        "submit-news-button",
        "confirm-approval-button",
        "confirm-rejection-button",
        "approve-news-button",
        "reject-news-button",
        "edit-news-button",
        "new-news-button",
        "delete-news-button",
        "confirm-delete-button"
    ].forEach(id => {
        if ($(id)) $(id).disabled = valor;
    });
}

// Sanitização do conteúdo HTML
function sanitizarHTML(html) {
    const origem = new DOMParser().parseFromString(
        String(html || ""),
        "text/html"
    );

    const destino = document.createElement("div");

    const permitidas = new Set(
        "P BR STRONG B EM I U S H1 H2 H3 OL UL LI A SPAN DIV BLOCKQUOTE HR"
            .split(" ")
    );

    const bloqueadas = new Set(
        "SCRIPT STYLE IFRAME OBJECT EMBED IMG VIDEO AUDIO SVG MATH FORM INPUT BUTTON TEXTAREA LINK META TEMPLATE"
            .split(" ")
    );

    const classes = new Set([
        "ql-align-center",
        "ql-align-right",
        "ql-align-justify",
        "ql-direction-rtl",
        "ql-ui",
        ...Array.from(
            { length: 8 },
            (_, i) => `ql-indent-${i + 1}`
        )
    ]);

    function copiar(no, pai) {
        if (no.nodeType === Node.TEXT_NODE) {
            pai.append(document.createTextNode(no.textContent));
            return;
        }

        if (
            no.nodeType !== Node.ELEMENT_NODE ||
            bloqueadas.has(no.tagName)
        ) return;

        const tag = no.tagName;

        const novo = permitidas.has(tag)
            ? document.createElement(tag.toLowerCase())
            : pai;

        if (novo !== pai) {
            const validas = [...no.classList]
                .filter(c => classes.has(c));

            if (validas.length) {
                novo.className = validas.join(" ");
            }

            if (
                tag === "LI" &&
                ["ordered", "bullet"].includes(
                    no.getAttribute("data-list")
                )
            ) {
                novo.setAttribute(
                    "data-list",
                    no.getAttribute("data-list")
                );
            }

            if (
                tag === "SPAN" &&
                validas.includes("ql-ui")
            ) {
                novo.setAttribute(
                    "contenteditable",
                    "false"
                );
            }

            if (tag === "A") {
                try {
                    const url = new URL(
                        no.getAttribute("href") || ""
                    );

                    if (
                        ["http:", "https:", "mailto:"]
                            .includes(url.protocol)
                    ) {
                        novo.href = url.href;
                        novo.target = "_blank";
                        novo.rel = "noopener noreferrer";
                    }
                } catch {
                    // Link inválido.
                }
            }
        }

        [...no.childNodes].forEach(
            filho => copiar(filho, novo)
        );

        if (novo !== pai) pai.append(novo);
    }

    [...origem.body.childNodes].forEach(
        no => copiar(no, destino)
    );

    return destino.innerHTML;
}

function textoHTML(html) {
    const e = document.createElement("div");
    e.innerHTML = sanitizarHTML(html);

    return (e.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
}

function resumo(html) {
    const t = textoHTML(html);

    return t.length > 220
        ? t.slice(0, 220).trimEnd() + "..."
        : t;
}

// Permissões
const podeEditar = n => Boolean(
    n &&
    n.status !== "reprovada" &&
    (
        estado.permissoes.publicar ||
        (
            estado.permissoes.criar &&
            n.autor_id === estado.militar?.id &&
            n.status === "pendente"
        )
    )
);

const podeAvaliar = n => Boolean(
    estado.permissoes.publicar &&
    n?.status === "pendente"
);

// Editor Quill
function iniciarEditor() {
    if (estado.editor) return;

    if (!window.Quill) {
        throw new Error(
            "Não foi possível carregar o editor de notícias."
        );
    }

    registerDivider(window.Quill);
    estado.editor = new window.Quill("#news-editor", {
        theme: "snow",
        placeholder: "Escreva o conteúdo da notícia...",
        modules: {
            toolbar: { container: [
                [{ header: [1, 2, 3, false] }],
                ["bold", "italic", "underline", "strike"],
                [
                    { list: "ordered" },
                    { list: "bullet" }
                ],
                [{ align: [] }],
                ["blockquote", "link"],
                ["divider"],
                ["clean"]
            ], handlers: { divider() { insertDivider(this.quill); } } }
        },
        formats: [
            "header",
            "bold",
            "italic",
            "underline",
            "strike",
            "list",
            "align",
            "blockquote",
            "link",
            "divider"
        ]
    });

    estado.editor.root.addEventListener(
        "paste",
        e => {
            const arquivos = [
                ...(e.clipboardData?.items || [])
            ].some(
                i =>
                    i.kind === "file" ||
                    i.type.startsWith("image/")
            );

            if (arquivos) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }
        },
        true
    );

    estado.editor.root.addEventListener(
        "drop",
        e => {
            if (e.dataTransfer?.files?.length) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }
        },
        true
    );
}

// Navegação
function ocultarPaineis() {
    document.querySelectorAll(".news-panel")
        .forEach(e => e.hidden = true);

    $("news-view-section").hidden = true;
    $("news-editor-section").hidden = true;
}

function abrirAba(aba) {
    if (
        aba === "my-news" &&
        !estado.permissoes.criar
    ) return;

    if (
        ["pending-news", "manage-news"].includes(aba) &&
        !estado.permissoes.publicar
    ) return;

    estado.aba = aba;
    estado.selecionada = null;
    estado.editando = null;

    ocultarPaineis();

    document.querySelector(".news-tabs").hidden = false;

    document.querySelectorAll(".news-tab")
        .forEach(b => {
            b.classList.toggle(
                "active",
                b.dataset.tab === aba
            );
        });

    $(aba).hidden = false;

    $("new-news-button").hidden =
        !estado.permissoes.criar;
}

function statusElemento(status) {
    const e = el(
        "span",
        "news-status",
        STATUS[status] || status
    );

    if (STATUS[status]) {
        e.classList.add(status);
    }

    return e;
}

// Cards
function cardNoticia(n, comStatus = false) {
    const card = el("button", "news-card");
    card.type = "button";

    const cabecalho = el(
        "div",
        "news-card-header"
    );

    cabecalho.append(
        el(
            "span",
            "news-card-category",
            n.categoria
        )
    );

    if (comStatus) {
        cabecalho.append(
            statusElemento(n.status)
        );
    }

    const rodape = el(
        "div",
        "news-card-footer"
    );

    rodape.append(
        el(
            "span",
            "news-card-author",
            `${n.status === "publicada"
                ? "Publicado"
                : "Elaborado"} por ${autor(n)}`
        ),
        el(
            "span",
            "news-card-date",
            dataBR(n.publicada_em || n.criada_em)
        )
    );

    card.append(
        cabecalho,
        el(
            "span",
            "news-card-title",
            n.titulo
        ),
        el(
            "span",
            "news-card-description",
            resumo(n.conteudo)
        ),
        rodape
    );

    card.addEventListener(
        "click",
        () => abrirNoticia(n.id)
    );

    return card;
}

function listaNoticias(
    lista,
    listaId,
    vazioId,
    status = false
) {
    $(listaId).replaceChildren(
        ...lista.map(n => cardNoticia(n, status))
    );

    $(vazioId).hidden = lista.length > 0;
}

function renderizar() {
    const publicadas = estado.noticias
        .filter(n => n.status === "publicada")
        .sort(
            (a, b) =>
                new Date(b.publicada_em || b.criada_em) -
                new Date(a.publicada_em || a.criada_em)
        );

    const minhas = estado.noticias.filter(
        n => n.autor_id === estado.militar?.id
    );

    const pendentes = estado.noticias.filter(
        n => n.status === "pendente"
    );

    listaNoticias(
        publicadas,
        "published-news-list",
        "no-published-news"
    );

    listaNoticias(
        estado.permissoes.criar ? minhas : [],
        "my-news-list",
        "no-my-news",
        true
    );

    listaNoticias(
        estado.permissoes.publicar ? pendentes : [],
        "pending-news-list",
        "no-pending-news",
        true
    );

    // Gerenciamento inclui todos os status.
    listaNoticias(
        estado.permissoes.publicar
            ? estado.noticias
            : [],
        "manage-news-list",
        "no-manage-news",
        true
    );

    $("pending-news-count").textContent =
        pendentes.length;

    $("pending-news-count").hidden =
        !estado.permissoes.publicar ||
        !pendentes.length;
}

async function carregarNoticias() {
    estado.noticias = await consultar(
        supabase
            .from("noticias")
            .select("*")
            .order("criada_em", {
                ascending: false
            })
    ) || [];

    renderizar();
}

// Visualização
function abrirNoticia(id) {
    const n = estado.noticias.find(
        item => item.id === id
    );

    if (!n) {
        feedback(
            "Notícia não encontrada ou indisponível.",
            "error"
        );
        return;
    }

    estado.selecionada = n;
    estado.editando = null;

    ocultarPaineis();

    document.querySelector(".news-tabs").hidden = true;
    $("new-news-button").hidden = true;
    $("news-view-section").hidden = false;

    $("view-news-category").textContent = n.categoria;
    $("view-news-title").textContent = n.titulo;

    $("view-news-author").textContent =
        `${n.status === "publicada"
            ? "Publicado"
            : "Elaborado"} por ${autor(n)}`;

    $("view-news-date").textContent =
        n.publicada_em
            ? `Publicado em ${dataBR(n.publicada_em)}`
            : `Elaborado em ${dataBR(n.criada_em)}`;

    $("view-news-content").innerHTML =
        sanitizarHTML(n.conteudo);

    const referencia =
        n.publicada_em || n.criada_em;

    const alterada =
        n.atualizada_em &&
        new Date(n.atualizada_em) -
        new Date(referencia) > 1000;

    $("view-news-updated").hidden = !alterada;

    $("view-news-updated").textContent =
        alterada
            ? `Atualizado em ${dataBR(n.atualizada_em)}`
            : "";

    const status = $("view-news-status");

    status.className =
        `news-status ${STATUS[n.status] ? n.status : ""}`;

    status.hidden = n.status === "publicada";

    status.textContent =
        STATUS[n.status] || n.status;

    $("view-news-rejection").hidden =
        n.status !== "reprovada";

    $("view-news-rejection-reason").textContent =
        n.motivo_reprovacao || "";

    $("edit-news-button").hidden =
        !podeEditar(n);

    $("approve-news-button").hidden =
        !podeAvaliar(n);

    $("reject-news-button").hidden =
        !podeAvaliar(n);

    $("delete-news-button").hidden =
        !estado.permissoes.publicar;

    $("view-news-actions").hidden = !(
        podeEditar(n) ||
        podeAvaliar(n) ||
        estado.permissoes.publicar
    );

    window.scrollTo({
        top: 0,
        behavior: "instant"
    });
}

// Criação e edição
function abrirEditor(n = null) {
    if (
        estado.ocupado ||
        (
            n
                ? !podeEditar(n)
                : !estado.permissoes.criar
        )
    ) return;

    feedback();

    estado.editando = n;

    if (!n) {
        estado.selecionada = null;
    }

    ocultarPaineis();
    iniciarEditor();

    document.querySelector(".news-tabs").hidden = true;
    $("news-editor-section").hidden = false;
    $("new-news-button").hidden = true;

    $("news-editor-title").textContent =
        n ? "Editar notícia" : "Nova notícia";

    $("news-form").reset();

    $("news-title").value = n?.titulo || "";
    $("news-category").value = n?.categoria || "";

    estado.editor.setText("");

    if (n) {
        estado.editor.clipboard.dangerouslyPasteHTML(
            sanitizarHTML(n.conteudo)
        );
    }

    $("submit-news-button").textContent =
        n
            ? "Salvar alterações"
            : estado.permissoes.publicar
                ? "Publicar notícia"
                : "Enviar para aprovação";

    if (!n) {
        $("news-title").focus();
    }
}

function fecharEditor() {
    if (estado.ocupado) return;

    const id = estado.editando?.id;
    estado.editando = null;

    feedback();

    if (id) {
        abrirNoticia(id);
    } else {
        abrirAba(estado.aba);
    }
}

// Operações
async function aposOperacao(n, mensagem) {
    const i = estado.noticias.findIndex(
        item => item.id === n.id
    );

    if (i < 0) {
        estado.noticias.unshift(n);
    } else {
        estado.noticias[i] = n;
    }

    renderizar();
    abrirNoticia(n.id);
    feedback(mensagem);

    try {
        await carregarNoticias();
        abrirNoticia(n.id);
    } catch {
        feedback(
            `${mensagem} Não foi possível atualizar a lista completa.`,
            "warning"
        );
    }
}

async function executar(acao) {
    if (estado.ocupado) return;

    ocupado(true);

    try {
        await acao();
    } catch (e) {
        feedback(e.message, "error");
    } finally {
        ocupado(false);
    }
}

async function enviarNoticia(e) {
    e.preventDefault();

    if (
        !estado.permissoes.criar ||
        estado.ocupado
    ) return;

    feedback();

    const titulo = $("news-title").value.trim();
    const categoria = $("news-category").value.trim();

    const conteudo = sanitizarHTML(
        estado.editor.root.innerHTML
    );

    if (
        !titulo ||
        !categoria ||
        !textoHTML(conteudo)
    ) {
        feedback(
            "Preencha todos os campos obrigatórios.",
            "error"
        );
        return;
    }

    const edicao = estado.editando;

    await executar(async () => {
        if (edicao && !podeEditar(edicao)) {
            throw new Error(
                "Você não possui permissão para editar esta notícia."
            );
        }

        const parametros = {
            p_titulo: titulo,
            p_categoria: categoria,
            p_conteudo: conteudo
        };

        if (edicao) {
            parametros.p_noticia_id = edicao.id;
        }

        const n = await rpc(
            edicao
                ? "editar_noticia"
                : "criar_noticia",
            parametros
        );

        estado.editando = null;

        await aposOperacao(
            n,
            edicao
                ? "Notícia atualizada com sucesso."
                : n.status === "publicada"
                    ? "Notícia publicada com sucesso."
                    : "Notícia enviada para aprovação com sucesso."
        );
    });
}

// Aprovação e reprovação
function modal(id, permitido) {
    if (
        estado.ocupado ||
        !permitido
    ) return;

    feedback();

    if (id === "reject-news-modal") {
        $("reject-news-form").reset();
    }

    $(id).showModal();
}

async function avaliar(tipo, motivo = "") {
    if (
        !podeAvaliar(estado.selecionada) ||
        estado.ocupado
    ) return;

    const id = estado.selecionada.id;

    const nome =
        tipo === "aprovar"
            ? "aprovar_noticia"
            : "reprovar_noticia";

    await executar(async () => {
        const n = await rpc(nome, {
            p_noticia_id: id,
            ...(tipo === "reprovar"
                ? { p_motivo: motivo }
                : {})
        });

        $(
            tipo === "aprovar"
                ? "approve-news-modal"
                : "reject-news-modal"
        ).close();

        await aposOperacao(
            n,
            tipo === "aprovar"
                ? "Notícia aprovada e publicada com sucesso."
                : "Notícia reprovada com sucesso."
        );
    });
}

// Exclusão de notícias
function prepararExclusao() {
    const botao = el(
        "button",
        "news-delete-button",
        "Excluir notícia"
    );

    botao.id = "delete-news-button";
    botao.type = "button";
    botao.hidden = true;

    $("view-news-actions").append(botao);

    const dialogo = document.createElement("dialog");
    dialogo.id = "delete-news-modal";
    dialogo.className = "news-delete-modal";

    const conteudo = el(
        "div",
        "news-delete-content"
    );

    const titulo = el(
        "h2",
        "",
        "Excluir notícia"
    );

    const descricao = el(
        "p",
        "",
        "Tem certeza de que deseja excluir esta notícia? Esta ação é permanente e também solicitará a remoção da mensagem no Discord."
    );

    const nome = el(
        "p",
        "news-delete-title"
    );

    nome.id = "delete-news-title";

    const acoes = el(
        "div",
        "news-delete-actions"
    );

    const cancelar = el(
        "button",
        "",
        "Cancelar"
    );

    cancelar.type = "button";

    const confirmar = el(
        "button",
        "",
        "Excluir definitivamente"
    );

    confirmar.type = "button";
    confirmar.id = "confirm-delete-button";

    acoes.append(cancelar, confirmar);

    conteudo.append(
        titulo,
        descricao,
        nome,
        acoes
    );

    dialogo.append(conteudo);
    document.body.append(dialogo);

    // Estilos do botão e modal.
    const estilo = document.createElement("style");

    estilo.textContent = `
        .news-delete-button {
            padding: 10px 16px;
            border: 1px solid #b74c4c;
            border-radius: 7px;
            background: transparent;
            color: #b43e3e;
            font: inherit;
            cursor: pointer;
        }

        .news-delete-button:hover {
            background: #fff0f0;
        }

        .news-delete-modal {
            width: min(440px, calc(100% - 32px));
            max-width: 440px;
            border: 1px solid #d5d8d2;
            border-radius: 12px;
            padding: 0;
            background: #fff;
            color: #252a24;
            box-shadow: 0 18px 50px #0003;
        }

        .news-delete-modal::backdrop {
            background: #0008;
        }

        .news-delete-content {
            padding: 24px;
            display: grid;
            gap: 14px;
        }

        .news-delete-content h2,
        .news-delete-content p {
            margin: 0;
        }

        .news-delete-title {
            font-weight: 600;
            overflow-wrap: anywhere;
        }

        .news-delete-actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            flex-wrap: wrap;
        }

        .news-delete-actions button {
            padding: 10px 14px;
            border-radius: 7px;
            border: 1px solid #d5d8d2;
            background: white;
            font: inherit;
            cursor: pointer;
        }

        .news-delete-actions #confirm-delete-button {
            background: #a33434;
            color: white;
            border-color: #a33434;
        }

        .news-delete-actions button:disabled {
            opacity: .5;
            cursor: wait;
        }
    `;

    document.head.append(estilo);

    botao.addEventListener("click", () => {
        if (
            estado.ocupado ||
            !estado.permissoes.publicar ||
            !estado.selecionada
        ) return;

        $("delete-news-title").textContent =
            estado.selecionada.titulo;

        dialogo.showModal();
    });

    cancelar.addEventListener("click", () => {
        if (!estado.ocupado) {
            dialogo.close();
        }
    });

    dialogo.addEventListener("cancel", e => {
        if (estado.ocupado) {
            e.preventDefault();
        }
    });

    confirmar.addEventListener("click", async () => {
        if (
            estado.ocupado ||
            !estado.permissoes.publicar ||
            !estado.selecionada
        ) return;

        const id = estado.selecionada.id;

        await executar(async () => {
            await rpc("excluir_noticia", {
                p_noticia_id: id
            });

            dialogo.close();

            estado.noticias = estado.noticias.filter(
                n => n.id !== id
            );

            renderizar();
            abrirAba(estado.aba);

            feedback(
                "Notícia excluída do CRME. A remoção no Discord foi solicitada."
            );

            try {
                await carregarNoticias();
            } catch {
                feedback(
                    "Notícia excluída, mas não foi possível atualizar a lista.",
                    "warning"
                );
            }
        });
    });
}

// Eventos
function eventos() {
    document.querySelectorAll(".news-tab")
        .forEach(b => {
            b.addEventListener("click", () => {
                if (!estado.ocupado) {
                    feedback();
                    abrirAba(b.dataset.tab);
                }
            });
        });

    $("new-news-button").addEventListener(
        "click",
        () => abrirEditor()
    );

    $("back-to-news").addEventListener(
        "click",
        () => {
            if (!estado.ocupado) {
                feedback();
                abrirAba(estado.aba);
            }
        }
    );

    [
        "back-from-editor",
        "cancel-news-button"
    ].forEach(id => {
        $(id).addEventListener(
            "click",
            fecharEditor
        );
    });

    $("news-form").addEventListener(
        "submit",
        enviarNoticia
    );

    $("edit-news-button").addEventListener(
        "click",
        () => abrirEditor(estado.selecionada)
    );

    $("approve-news-button").addEventListener(
        "click",
        () => modal(
            "approve-news-modal",
            podeAvaliar(estado.selecionada)
        )
    );

    $("reject-news-button").addEventListener(
        "click",
        () => modal(
            "reject-news-modal",
            podeAvaliar(estado.selecionada)
        )
    );

    $("confirm-approval-button").addEventListener(
        "click",
        () => avaliar("aprovar")
    );

    $("reject-news-form").addEventListener(
        "submit",
        e => {
            e.preventDefault();

            const motivo = $("reject-news-reason")
                .value.trim();

            if (!motivo) {
                $("reject-news-reason").focus();
                return;
            }

            avaliar("reprovar", motivo);
        }
    );

    [
        [
            "cancel-approval-button",
            "approve-news-modal"
        ],
        [
            "cancel-rejection-button",
            "reject-news-modal"
        ]
    ].forEach(([botao, modalId]) => {
        $(botao).addEventListener(
            "click",
            () => {
                if (!estado.ocupado) {
                    $(modalId).close();
                }
            }
        );

        $(modalId).addEventListener(
            "cancel",
            e => {
                if (estado.ocupado) {
                    e.preventDefault();
                }
            }
        );
    });
}

// Inicialização
async function inicializar() {
    try {
        const { data, error } =
            await supabase.auth.getUser();

        if (error || !data.user) {
            throw new Error(
                "Não foi possível identificar a sessão."
            );
        }

        const id = await rpc(
            "usuario_noticias_id"
        );

        if (!id) {
            throw new Error(
                "Você não possui autorização para acessar as notícias."
            );
        }

        estado.militar = { id };

        const [criar, publicar] = await Promise.all([
            rpc("pode_criar_noticia"),
            rpc("pode_publicar_noticia")
        ]);

        estado.permissoes = {
            criar: Boolean(criar),
            publicar: Boolean(publicar)
        };

        $("new-news-button").hidden = !criar;
        $("my-news-tab").hidden = !criar;
        $("pending-news-tab").hidden = !publicar;
        $("manage-news-tab").hidden = !publicar;

        prepararExclusao();
        eventos();

        await carregarNoticias();

        abrirAba("published-news");

        const noticiaId = new URLSearchParams(
            location.search
        ).get("id");

        if (noticiaId) {
            abrirNoticia(noticiaId);
        }

    } catch (e) {
        $("published-news-list").replaceChildren();

        [
            "new-news-button",
            "my-news-tab",
            "pending-news-tab",
            "manage-news-tab"
        ].forEach(id => {
            $(id).hidden = true;
        });

        feedback(e.message, "error");

        console.error(
            "Erro ao inicializar notícias:",
            e
        );
    }
}

document.addEventListener(
    "DOMContentLoaded",
    inicializar
);