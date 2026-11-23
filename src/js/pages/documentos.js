import { supabase } from "../supabase.js";

const $ = id => document.getElementById(id);
const state = {
  documents: [], selected: null, catalog: [], editor: null,
  editing: null, allowedTargets: new Set(), currentRequest: 0,
  militarId: null, manageableIds: new Set(), activeTab: "library-panel", central: false
};
const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[ch]));
const formatDate = value => value ? new Date(value).toLocaleDateString("pt-BR") : "—";
const rpc = async (name, params = {}) => {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data;
};
function feedback(text, error = false) {
  const node = $("doc-message");
  node.hidden = !text;
  node.textContent = text || "";
  node.className = error ? "doc-error" : "doc-success";
}
function fail(error) { feedback(error?.message || String(error), true); }
const tabIds = ["library-panel", "my-documents-panel", "manage-documents-panel"];
function show(panel) {
  const isTab = tabIds.includes(panel);
  for (const id of [...tabIds, "publish-panel", "detail-panel"]) {
    $(id).hidden = id !== panel;
  }
  $("document-tabs").hidden = !isTab;
  $("new-document").hidden = !isTab || state.catalog.length === 0;
  if (isTab) {
    state.activeTab = panel;
    document.querySelectorAll("[data-doc-tab]").forEach(button => {
      button.classList.toggle("active", button.dataset.docTab === panel);
    });
  }
  window.scrollTo({ top: 0, behavior: "instant" });
}
function backToTab() {
  state.selected = null;
  ++state.currentRequest;
  show(state.activeTab);
}

/* Quill gera HTML. Nunca inserir HTML vindo do banco sem filtragem. */
const allowedTags = new Set([
  "P", "BR", "STRONG", "B", "EM", "I", "U", "S", "H1", "H2", "H3",
  "OL", "UL", "LI", "A", "SPAN", "DIV", "BLOCKQUOTE"
]);
const allowedClasses = new Set([
  "ql-align-center", "ql-align-right", "ql-align-justify",
  "ql-indent-1", "ql-indent-2", "ql-indent-3", "ql-indent-4",
  "ql-indent-5", "ql-indent-6", "ql-indent-7", "ql-indent-8"
]);
function sanitizeHtml(html) {
  const input = new DOMParser().parseFromString(String(html || ""), "text/html");
  const output = document.createElement("div");
  const blocked = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "FORM", "IMG", "VIDEO", "AUDIO"]);
  function copy(node, target) {
    if (node.nodeType === Node.TEXT_NODE) {
      target.appendChild(document.createTextNode(node.textContent || ""));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || blocked.has(node.tagName)) return;
    const tag = allowedTags.has(node.tagName) ? node.tagName.toLowerCase() : "span";
    const element = document.createElement(tag);
    if (node.tagName === "A") {
      const href = node.getAttribute("href") || "";
      try {
        const parsed = new URL(href, location.origin);
        if (["http:", "https:", "mailto:"].includes(parsed.protocol)) {
          element.setAttribute("href", parsed.href);
          element.setAttribute("rel", "noopener noreferrer");
          element.setAttribute("target", "_blank");
        }
      } catch { /* descarta URL inválida */ }
    }
    const classes = (node.getAttribute("class") || "").split(/\s+/)
      .filter(value => allowedClasses.has(value));
    if (classes.length) element.className = classes.join(" ");
    if (node.tagName === "LI") {
      const listType = node.getAttribute("data-list");
      if (["bullet", "ordered"].includes(listType)) element.dataset.list = listType;
    }
    for (const child of node.childNodes) copy(child, element);
    target.appendChild(element);
  }
  for (const child of input.body.childNodes) copy(child, output);
  return output.innerHTML;
}
function ensureEditor() {
  if (state.editor) return state.editor;
  if (!window.Quill) throw new Error("Editor Quill indisponível. Atualize a página.");
  state.editor = new window.Quill("#doc-editor", {
    theme: "snow",
    placeholder: "Redija o conteúdo do documento...",
    modules: { toolbar: [
      [{ header: [1, 2, 3, false] }],
      ["bold", "italic", "underline", "strike"],
      [{ list: "ordered" }, { list: "bullet" }],
      [{ align: [] }], ["blockquote", "link"], ["clean"]
    ] },
    formats: ["header", "bold", "italic", "underline", "strike", "list", "align", "blockquote", "link"]
  });
  return state.editor;
}
function setEditorHtml(html) {
  const editor = ensureEditor();
  editor.setText("");
  if (html) editor.clipboard.dangerouslyPasteHTML(sanitizeHtml(html), "silent");
}
function getEditorHtml() {
  const editor = ensureEditor();
  if (!editor.getText().trim()) throw new Error("Escreva o conteúdo do documento.");
  const html = sanitizeHtml(editor.root.innerHTML);
  if (html.length > 200000) throw new Error("O conteúdo excede o limite de 200 mil caracteres.");
  return html;
}
function targetsFor(org) {
  const options = [{ value: "", label: "Órgão inteiro (sem unidade)" }];
  for (const unit of org?.unidades || []) {
    options.push({ value: unit.codigo, label: unit.nome + " (" + unit.codigo + ")" });
    for (const child of unit.subunidades || []) {
      options.push({ value: child.codigo, label: "↳ " + child.nome + " (" + child.codigo + ")" });
    }
  }
  return options.filter(t => state.allowedTargets.has((org?.codigo || "") + "/" + t.value));
}
async function loadCatalog() {
  const response = await fetch("/orgaos.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Não foi possível carregar o catálogo de órgãos.");
  const data = await response.json();
  const all = (data.categorias || []).flatMap(group => group.orgaos || []);
  // Exibir apenas órgãos/unidades para os quais o banco confirmou permissão.
  const allowed = await Promise.all(all.map(async org => {
    const targets = [{value:""}, ...(org.unidades || []).flatMap(unit => [{value:unit.codigo}, ...(unit.subunidades || []).map(child=>({value:child.codigo}))])];
    const checks = await Promise.all(targets.map(async target => {
      try {
        const ok = await rpc("documentos_pode_criar", {
          p_orgao: org.codigo, p_unidade: target.value || null
        });
        if (ok) state.allowedTargets.add(org.codigo + "/" + target.value);
        return ok === true;
      } catch { return false; }
    }));
    if (!checks.some(Boolean)) return null;
    return { ...org, unidades: (org.unidades || []).map(unit => ({
      ...unit,
      subunidades: (unit.subunidades || []).filter(child =>
        state.allowedTargets.has(org.codigo + "/" + child.codigo))
    })).filter(unit =>
      state.allowedTargets.has(org.codigo + "/" + unit.codigo) ||
      (unit.subunidades || []).length > 0
    ) };
  }));
  state.catalog = allowed.filter(Boolean);
  $("publish-orgao").innerHTML = '<option value="">Selecione</option>' +
    state.catalog.map(o => '<option value="' + esc(o.codigo) + '">' +
      esc(o.nome) + ' (' + esc(o.codigo) + ')</option>').join("");
  updateUnits();
}

function updateUnits() {
  const organ = state.catalog.find(o => o.codigo === $("publish-orgao").value);
  const select = $("publish-unidade");
  select.innerHTML = targetsFor(organ).map(u =>
    '<option value="' + esc(u.value) + '">' + esc(u.label) + '</option>'
  ).join("");
  if (!select.options.length) {
    select.innerHTML = '<option value="">Nenhuma unidade autorizada</option>';
  }
  if (!state.editing) checkTarget();
}
async function checkTarget() {
  const organ = $("publish-orgao").value;
  const unit = $("publish-unidade").value;
  const key = organ + "/" + unit;
  const button = $("publish-submit");
  if (state.editing) return;
  button.disabled = true;
  if (!organ) return;
  try {
    if (!state.allowedTargets.has(key)) {
      const allowed = await rpc("documentos_pode_criar", {
        p_orgao: organ, p_unidade: unit || null
      });
      if (!allowed) return;
      state.allowedTargets.add(key);
    }
    if (!state.editing && $("publish-orgao").value === organ && $("publish-unidade").value === unit) {
      button.disabled = false;
    }
  } catch (error) { fail(error); }
}
function documentCard(doc) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "news-card";
  const meta = document.createElement("div");
  meta.className = "news-card-header";
  const category = document.createElement("span");
  category.className = "news-card-category";
  category.textContent = doc.categoria || "INSTITUCIONAL";
  meta.append(category);
  const title = document.createElement("span");
  title.className = "news-card-title";
  title.textContent = doc.titulo;
  const desc = document.createElement("span");
  desc.className = "news-card-description";
  const plain = new DOMParser().parseFromString(sanitizeHtml(doc.conteudo || ""), "text/html").body.textContent.trim();
  desc.textContent = (plain || doc.descricao || "").slice(0, 220) +
    ((plain || doc.descricao || "").length > 220 ? "..." : "");
  const footer = document.createElement("div");
  footer.className = "news-card-footer";
  const origin = document.createElement("span");
  origin.className = "news-card-author";
  origin.textContent = "Publicado por " + doc.orgao + (doc.unidade ? " / " + doc.unidade : "") +
    " · " + (doc.visibilidade === "geral" ? "Oficial" : doc.visibilidade === "patentes" ? "Por patente" : "Setorial");
  const date = document.createElement("span");
  date.className = "news-card-date";
  date.textContent = formatDate(doc.criado_em);
  footer.append(origin, date);
  card.append(meta, title, desc, footer);
  card.addEventListener("click", () => openDocument(doc.id));
  return card;
}
function renderList(id, emptyId, documents) {
  $(id).replaceChildren(...documents.map(documentCard));
  $(emptyId).hidden = documents.length > 0;
}
function render() {
  const section = $("doc-section").value;
  renderList("doc-list", "doc-empty", state.documents.filter(d =>
    section === "oficiais" ? d.visibilidade === "geral" :
    section === "patentes" ? d.visibilidade === "patentes" : d.visibilidade === "restrito"
  ));
  renderList("my-documents-list", "my-documents-empty",
    state.documents.filter(d => d.criado_por === state.militarId));
  renderList("manage-documents-list", "manage-documents-empty",
    state.documents.filter(d => state.manageableIds.has(d.id)));
}
async function load() {
  const { data, error } = await supabase.from("documentos")
    .select("id,titulo,descricao,conteudo,categoria,orgao,unidade,visibilidade,criado_por,criado_em,atualizado_em")
    .order("criado_em", { ascending: true }).limit(300);
  if (error) throw error;
  state.documents = data || [];
  const rights = await Promise.all(state.documents.map(async d => {
    try {
      return await rpc("documentos_pode_gerenciar", { p_documento_id: d.id }) === true;
    } catch { return false; }
  }));
  state.manageableIds = new Set(state.documents.filter((_, i) => rights[i]).map(d => d.id));
  $("my-documents-tab").hidden = state.catalog.length === 0 &&
    !state.documents.some(d => d.criado_por === state.militarId);
  $("manage-documents-tab").hidden = state.manageableIds.size === 0 &&
    state.catalog.length === 0;
  render();
}

async function openDocument(id) {
  const request = ++state.currentRequest;
  feedback("");
  try {
    const { data: doc, error } = await supabase.from("documentos").select("*").eq("id", id).single();
    if (error) throw error;
    if (request !== state.currentRequest) return;
    state.selected = doc;
    $("detail-title").textContent = doc.titulo;
    $("detail-meta").textContent = [doc.categoria, doc.orgao, doc.unidade,
      doc.visibilidade === "geral" ? "Oficial" : doc.visibilidade === "patentes" ? "Por patente" : "Setorial", formatDate(doc.criado_em)]
      .filter(Boolean).join(" · ");
    $("detail-description").textContent = doc.descricao || "";
    $("document-content").innerHTML = sanitizeHtml(doc.conteudo);
    $("manage-panel").hidden = true;
    show("detail-panel");
    const allowed = await rpc("documentos_pode_gerenciar", { p_documento_id: id });
    if (request !== state.currentRequest || !allowed) return;
    $("manage-panel").hidden = false;
    $("permission-form").hidden = doc.visibilidade !== "restrito";
    $("permissions-list").textContent = doc.visibilidade === "restrito"
      ? "Carregando destinatários..." : "Documento geral: disponível aos militares autorizados pela política de leitura.";
    if (doc.visibilidade === "restrito") await loadPermissions(id);
  } catch (error) { if (request === state.currentRequest) fail(error); }
}
async function loadPermissions(id) {
  try {
    const list = await rpc("documentos_listar_permissoes", { p_documento_id: id });
    if (state.selected?.id !== id) return;
    $("permissions-list").innerHTML = list?.length ? list.map(p =>
      '<div class="permission"><span>' + esc(p.tipo) + ': ' + esc(p.codigo) + '</span>' +
      '<button type="button" data-remove-type="' + esc(p.tipo) + '" data-remove-code="' + esc(p.codigo) +
      '" class="secondary">Remover</button></div>'
    ).join("") : "<p>Nenhum destinatário específico cadastrado.</p>";
  } catch (error) { $("permissions-list").textContent = "Não foi possível carregar os destinatários."; fail(error); }
}
function resetEditor() {
  state.editing = null;
  $("publish-form").reset();
  renderRankChoices();
  updateVisibility();
  $("publish-heading").textContent = "Publicar documento";
  $("publish-submit").textContent = "Publicar documento";
  $("publish-orgao").disabled = false;
  $("publish-unidade").disabled = false;
  $("publish-visibility").disabled = false;
  updateUnits();
  setEditorHtml("");
}
function startNew() {
  resetEditor();
  feedback("");
  show("publish-panel");
}
function startEdit() {
  const doc = state.selected;
  if (!doc) return;
  state.editing = doc.id;
  $("publish-heading").textContent = "Editar documento";
  $("publish-submit").textContent = "Salvar alterações";
  const f = $("publish-form").elements;
  for (const name of ["titulo", "categoria", "descricao", "orgao", "visibilidade"]) {
    f[name].value = doc[name] || "";
  }
  updateUnits();
  f.unidade.value = doc.unidade || "";
  if (doc.visibilidade === "patentes") {
    $("rank-mode").value = doc.patente_modo || "todos";
    renderRankChoices();
    for (const input of document.querySelectorAll("#rank-choices input")) input.checked = (doc.patente_alvos || []).includes(input.value);
  }
  updateVisibility();
  f.orgao.disabled = true;
  f.unidade.disabled = true;
  f.visibilidade.disabled = true;
  $("publish-submit").disabled = false;
  setEditorHtml(doc.conteudo);
  feedback("");
  show("publish-panel");
}
async function save(event) {
  event.preventDefault();
  const button = $("publish-submit");
  if (button.disabled) return;
  const f = event.currentTarget.elements;
  button.disabled = true;
  try {
    if (!state.editing) {
      const target = f.orgao.value + "/" + (f.unidade.value || "");
      if (!state.allowedTargets.has(target)) throw new Error("Você não possui autorização para publicar nesta seção.");
      const confirmed = await rpc("documentos_pode_criar", {
        p_orgao: f.orgao.value, p_unidade: f.unidade.value || null
      });
      if (confirmed !== true) throw new Error("Permissão de publicação negada pelo servidor.");
    }
    const html = getEditorHtml();
    const fields = {
      p_titulo: f.titulo.value.trim(),
      p_descricao: f.descricao.value.trim(),
      p_categoria: f.categoria.value.trim(),
      p_conteudo: html
    };
    if (!fields.p_titulo || !fields.p_categoria) throw new Error("Preencha título e categoria.");
    if (state.editing) {
      const id = state.editing;
      const result = await rpc("documentos_editar", { p_documento_id: id, ...fields });
      if (result !== true) throw new Error("A edição não foi confirmada.");
      if (f.visibilidade.value === "patentes") {
        const targets = [...document.querySelectorAll("#rank-choices input:checked")].map(input => input.value);
        const updated = await rpc("documentos_atualizar_patentes", {
          p_documento_id: id,
          p_patente_modo: $("rank-mode").value,
          p_patente_alvos: $("rank-mode").value === "todos" ? [] : targets
        });
        if (updated !== true) throw new Error("Não foi possível atualizar os destinatários por patente.");
      }
      resetEditor();
      await load();
      await openDocument(id);
      feedback("Documento atualizado com sucesso.");
    } else {
      const organ = f.orgao.value;
      const unit = f.unidade.value || null;
      if (!state.catalog.some(o => o.codigo === organ && targetsFor(o).some(t => t.value === (unit || "")))) {
        throw new Error("Órgão ou unidade inválidos.");
      }
      const visibility = f.visibilidade.value;
      const targets = [...document.querySelectorAll("#rank-choices input:checked")].map(input => input.value);
      if (visibility === "patentes" && $("rank-mode").value !== "todos" && !targets.length) throw new Error("Selecione os destinatários por patente.");
      const id = await rpc("documentos_publicar_v2", {
        ...fields, p_orgao: organ, p_unidade: unit,
        p_visibilidade: visibility,
        p_patente_modo: visibility === "patentes" ? $("rank-mode").value : null,
        p_patente_alvos: visibility === "patentes" ? ($("rank-mode").value === "todos" ? [] : targets) : []
      });
      if (!id) throw new Error("A publicação não retornou o identificador.");
      resetEditor();
      await load();
      await openDocument(id);
      feedback("Documento publicado. Se for restrito, cadastre os destinatários abaixo.");
    }
  } catch (error) { fail(error); }
  finally { button.disabled = false; }
}
async function removeDocument() {
  const doc = state.selected;
  if (!doc || !confirm('Excluir definitivamente o documento "' + doc.titulo + '"?')) return;
  try {
    const result = await rpc("documentos_excluir", { p_documento_id: doc.id });
    if (result !== true) throw new Error("A exclusão não foi confirmada.");
    state.selected = null;
    ++state.currentRequest;
    await load();
    show(state.activeTab);
    feedback("Documento excluído.");
  } catch (error) { fail(error); }
}
document.querySelectorAll("[data-doc-tab]").forEach(button => {
  button.addEventListener("click", () => show(button.dataset.docTab));
});

const rankOptions = {
  todos: [],
  grupo: ["Subalterno", "Intermediário", "Superior", "General"],
  patente: ["Aspirante-a-Oficial", "Segundo-Tenente", "Primeiro-Tenente", "Capitão",
    "Major", "Tenente-Coronel", "Coronel", "General-de-Brigada",
    "General-de-Divisão", "General-de-Exército", "Marechal"]
};
function renderRankChoices() {
  const mode = $("rank-mode").value;
  const container = $("rank-choices");
  container.replaceChildren();
  for (const option of rankOptions[mode]) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox"; input.value = option;
    label.append(input, document.createTextNode(option));
    container.append(label);
  }
}
function updateVisibility() {
  const visibility = $("publish-visibility");
  for (const option of visibility.options) {
    if (option.value !== "restrito") option.hidden = !state.central;
  }
  if (!state.central && visibility.value !== "restrito") visibility.value = "restrito";
  $("rank-targets").hidden = visibility.value !== "patentes";
  $("rank-choices").hidden = $("rank-mode").value === "todos";
}
$("publish-visibility").addEventListener("change", updateVisibility);
$("rank-mode").addEventListener("change", () => { renderRankChoices(); updateVisibility(); });
$("doc-section").addEventListener("change", render);

$("new-document").addEventListener("click", startNew);
for (const id of ["publish-cancel", "publish-cancel-bottom"]) {
  $(id).addEventListener("click", () => {
    resetEditor();
    show(state.selected ? "detail-panel" : state.activeTab);
  });
}
$("publish-orgao").addEventListener("change", updateUnits);
$("publish-unidade").addEventListener("change", checkTarget);
$("publish-form").addEventListener("submit", save);
$("close-detail").addEventListener("click", backToTab);
$("edit-document").addEventListener("click", startEdit);
$("delete-document").addEventListener("click", removeDocument);
$("permission-form").addEventListener("submit", async e => {
  e.preventDefault();
  const doc = state.selected;
  if (!doc) return;
  const form = e.currentTarget;
  const f = form.elements;
  const button = $("permission-submit");
  button.disabled = true;
  try {
    const result = await rpc("documentos_adicionar_permissao", {
      p_documento_id: doc.id, p_tipo: f.tipo.value, p_codigo: f.codigo.value.trim()
    });
    if (result !== true) throw new Error("A permissão não foi confirmada.");
    f.codigo.value = "";
    await loadPermissions(doc.id);
    feedback("Destinatário adicionado.");
  } catch (error) { fail(error); }
  finally { button.disabled = false; }
});
$("permissions-list").addEventListener("click", async e => {
  const button = e.target.closest("[data-remove-type]");
  const doc = state.selected;
  if (!button || !doc || !confirm("Remover este destinatário?")) return;
  button.disabled = true;
  try {
    const result = await rpc("documentos_remover_permissao", {
      p_documento_id: doc.id, p_tipo: button.dataset.removeType,
      p_codigo: button.dataset.removeCode
    });
    if (result !== true) throw new Error("A remoção não foi confirmada.");
    await loadPermissions(doc.id);
    feedback("Destinatário removido.");
  } catch (error) { fail(error); }
  finally { button.disabled = false; }
});
(async function init() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Faça login para acessar os documentos.");
    const militaryId = await rpc("crme_militar_id");
    if (!militaryId) throw new Error("Registro militar não encontrado.");
    state.militarId = militaryId;
    state.central = await rpc("documentos_autoridade_central");
    ensureEditor();
    await loadCatalog();
    updateVisibility();
    // A interface usa as permissões confirmadas pelo banco; o banco também
    // deve validar novamente cada operação de publicação e edição.
    await load();
    show("library-panel");
  } catch (error) { fail(error); $("doc-list").textContent = "Não foi possível carregar a biblioteca."; }
})();
