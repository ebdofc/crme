import { registerDivider, insertDivider } from "../quill-divider.js";
import { supabase } from "../supabase.js";

const $ = id => document.getElementById(id);
const state = {
  documents: [], selected: null, catalog: [], editor: null,
  editing: null, allowedTargets: new Set(), currentRequest: 0,
  militarId: null, documentFilters: new Map(), filterCatalog: new Map(), manageableIds: new Set(), activeTab: "library-panel", central: false, sectors: [], identities: [], militaryNames: new Map(), institutionNames: new Map()
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
  const reading = panel === "detail-panel";
  const isTab = tabIds.includes(panel);
  for (const id of tabIds) $(id).hidden = reading ? id !== "library-panel" : id !== panel;
  $("publish-panel").hidden = panel !== "publish-panel";
  $("detail-panel").hidden = !reading;
  $("doc-library-layout").classList.toggle("doc-reading", reading);
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
  "OL", "UL", "LI", "A", "SPAN", "DIV", "BLOCKQUOTE", "HR"
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
  registerDivider(window.Quill);
  state.editor = new window.Quill("#doc-editor", {
    theme: "snow",
    placeholder: "Redija o conteúdo do documento...",
    modules: { toolbar: { container: [
      [{ header: [1, 2, 3, false] }],
      ["bold", "italic", "underline", "strike"],
      [{ list: "ordered" }, { list: "bullet" }],
      [{ align: [] }], ["blockquote", "link"], ["divider"], ["clean"]
    ], handlers: { divider() { insertDivider(this.quill); } } } },
    formats: ["header", "bold", "italic", "underline", "strike", "list", "align", "blockquote", "link", "divider"]
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
async function loadCatalog() {
  const response = await fetch("/orgaos.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Não foi possível carregar o catálogo de órgãos.");
  const data = await response.json();
  const all = (data.categorias || []).flatMap(group => group.orgaos || []);
  const allowed = await Promise.all(all.map(async org => {
    const targets = [{ value: "" }, ...(org.unidades || []).flatMap(unit =>
      [{ value: unit.codigo }, ...(unit.subunidades || []).map(child => ({ value: child.codigo }))])];
    const checks = await Promise.all(targets.map(async target => {
      try {
        const ok = await rpc("documentos_pode_criar", { p_orgao: org.codigo, p_unidade: target.value || null });
        if (ok === true) state.allowedTargets.add(org.codigo + "/" + target.value);
        return ok === true;
      } catch { return false; }
    }));
    return checks.some(Boolean) ? org : null;
  }));
  state.catalog = allowed.filter(Boolean);
}
function publishingScope(visibility, identity, selectedSectors) {
  const scopes = [...state.allowedTargets].map(key => {
    const index = key.indexOf("/");
    return { orgao: key.slice(0, index), unidade: key.slice(index + 1) };
  });
  const central = scopes.find(s => s.orgao === "P" && !s.unidade) ||
    scopes.find(s => s.orgao === "M" && !s.unidade);
  if (visibility !== "restrito") return central || null;
  const source = identity !== "pessoal" ? identity : selectedSectors[0];
  if (!source) return null;
  const parts = source.split("/");
  const orgao = parts[0];
  const unit = parts.length === 1 ? "" : parts[parts.length - 1];
  const sameOrg = scopes.filter(s => s.orgao === orgao);
  // Preferir o departamento inteiro quando o militar é sua autoridade.
  return sameOrg.find(s => !s.unidade) ||
    sameOrg.find(s => s.unidade === unit) ||
    sameOrg[0] || central || null;
}
async function loadSectors() {
  const data = await rpc("documentos_setores_disponiveis");
  state.sectors = Array.isArray(data) ? data : [];
  renderSectorChoices();
}
function renderSectorChoices() {
  const container = $("sector-choices");
  container.replaceChildren();
  if (!state.sectors.length) {
    container.textContent = "Nenhum setor destinatário autorizado.";
    return;
  }

  const available = new Map(state.sectors.map(sector => [sector.codigo, sector]));
  const names = new Map([
    ["DEC", "Departamento de Educação e Ciência"],
    ["DGP", "Departamento-Geral do Pessoal"],
    ["DTC", "Departamento de Tecnologia e Comunicação"],
    ["DEC/DEA", "Diretoria de Ensino Avançado"],
    ["DEC/DEB", "Diretoria de Ensino Básico"]
  ]);
  const nodes = new Map();
  const ensure = code => {
    if (nodes.has(code)) return nodes.get(code);
    const parentCode = code.includes("/") ? code.slice(0, code.lastIndexOf("/")) : null;
    const node = { code, parentCode, children: [], sector: available.get(code) || null };
    nodes.set(code, node);
    if (parentCode) ensure(parentCode).children.push(node);
    return node;
  };
  for (const sector of state.sectors) ensure(sector.codigo);

  const selected = new Map();
  const createOption = (node, host) => {
    const label = document.createElement("label");
    label.className = "doc-sector-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = node.code;
    const name = document.createElement("span");
    name.textContent = node.sector.nome;
    label.append(input, name);
    host.append(label);
    selected.set(node.code, { input, label });
    input.addEventListener("change", () => {
      if (input.checked) {
        // Um setor superior já inclui seus subordinados, mas não uma direção
        // exclusiva: a direção é uma permissão independente.
        for (const [otherCode, other] of selected) {
          if (otherCode !== node.code && otherCode.startsWith(node.code + "/") &&
              !otherCode.endsWith("/D") && otherCode !== "DGP/DG") {
            other.input.checked = false;
          }
        }
      }
      refresh();
    });
  };
  const isExclusive = code => [
    "DGP/DG", "DEC/D", "DEC/DEA/D", "DEC/DEB/D", "DTC/D"
  ].includes(code);
  function refresh() {
    for (const [code, item] of selected) {
      const covered = [...selected].some(([ancestor, other]) =>
        ancestor !== code && other.input.checked &&
        code.startsWith(ancestor + "/") && !isExclusive(code));
      item.label.classList.toggle("doc-sector-covered", covered);
      item.input.disabled = covered;
      if (covered) item.input.checked = false;
    }
  }
  function renderNode(node, host, depth = 0) {
    const section = document.createElement(depth === 0 ? "details" : "div");
    section.className = depth === 0 ? "doc-sector-group" :
      depth === 1 ? "doc-sector-branch" : "doc-sector-leaf";
    let body = section;
    if (depth === 0) {
      const heading = document.createElement("summary");
      heading.className = "doc-sector-heading";
      const title = document.createElement("strong");
      title.textContent = node.sector?.nome || names.get(node.code) || node.code;
      const count = document.createElement("span");
      count.className = "doc-sector-count";
      count.hidden = true;
      heading.append(title, count);
      section.append(heading);
      body = document.createElement("div");
      body.className = "doc-sector-body";
      section.append(body);
      section.addEventListener("change", () => {
        const n = body.querySelectorAll("input[type=checkbox]:checked").length;
        count.textContent = n === 1 ? "1 selecionado" : n + " selecionados";
        count.hidden = n === 0;
      });
    }
    if (node.sector) createOption(node, body);
    else if (depth > 0) {
      const title = document.createElement("div");
      title.className = "doc-sector-subheading";
      title.textContent = names.get(node.code) || node.code;
      body.append(title);
    }
    if (node.children.length) {
      const wrapper = document.createElement("div");
      wrapper.className = depth === 0 ? "doc-sector-branches" : "doc-sector-leaves";
      for (const child of node.children) renderNode(child, wrapper, depth + 1);
      body.append(wrapper);
    }
    host.append(section);
  }
  for (const node of nodes.values()) {
    if (!node.parentCode) renderNode(node, container);
  }
  refresh();
}
function selectedSectors() {
  return [...document.querySelectorAll("#sector-choices input:checked")].map(input => input.value);
}
function authorLabel(doc) {
  if (doc.publicado_por_tipo === "institucional" && doc.publicado_por_codigo) {
    return state.institutionNames.get(doc.publicado_por_codigo) || doc.publicado_por_codigo;
  }
  const military = state.militaryNames.get(doc.criado_por);
  if (military) return [military.patente_atual, military.nome].filter(Boolean).join(" ");
  return "Militar responsável";
}
function updateAuthorOptions(selected = "pessoal") {
  const select = $("publish-author");
  select.replaceChildren();
  select.add(new Option("Patente e nome do militar", "pessoal"));
  for (const identity of state.identities) {
    select.add(new Option(identity.nome, identity.codigo));
  }
  if ([...select.options].some(option => option.value === selected)) select.value = selected;
  else select.value = "pessoal";
  $("publish-author-help").textContent = state.editing
    ? "A identificação desta publicação não pode ser alterada na edição."
    : "A identidade escolhida será exibida publicamente. O militar responsável permanece registrado.";
}
async function loadIdentities() {
  const identities = await rpc("documentos_identificacoes_disponiveis");
  state.identities = Array.isArray(identities) ? identities : [];
  // A ordem institucional segue o catálogo de órgãos, não a ordem alfabética da RPC.
  const response = await fetch("/orgaos.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Não foi possível ordenar as identificações institucionais.");
  const catalog = await response.json();
  const order = new Map();
  for (const org of (catalog.categorias || []).flatMap(group => group.orgaos || [])) {
    if (!order.has(org.codigo)) order.set(org.codigo, order.size);
    for (const unit of org.unidades || []) {
      const unitCode = org.codigo + "/" + unit.codigo;
      if (!order.has(unitCode)) order.set(unitCode, order.size);
      for (const child of unit.subunidades || []) {
        const childCode = org.codigo + "/" + child.codigo;
        if (!order.has(childCode)) order.set(childCode, order.size);
      }
    }
  }
  state.identities.sort((a, b) =>
    (order.get(a.codigo) ?? Number.MAX_SAFE_INTEGER) -
    (order.get(b.codigo) ?? Number.MAX_SAFE_INTEGER) ||
    a.nome.localeCompare(b.nome, "pt-BR")
  );
  for (const identity of state.identities) state.institutionNames.set(identity.codigo, identity.nome);
  updateAuthorOptions();
}
async function loadMilitaryNames(documents) {
  const ids = [...new Set(documents.map(doc => doc.criado_por).filter(Boolean))];
  if (!ids.length) return;
  const { data, error } = await supabase.from("militares")
    .select("id,nome,patente_atual").in("id", ids);
  if (!error) for (const military of data || []) state.militaryNames.set(military.id, military);
}
async function loadInstitutionNames() {
  const response = await fetch("/orgaos.json", { cache: "no-store" });
  if (!response.ok) return;
  const catalog = await response.json();
  for (const org of (catalog.categorias || []).flatMap(category => category.orgaos || [])) {
    state.institutionNames.set(org.codigo, org.nome);
    for (const unit of org.unidades || []) {
      state.institutionNames.set(org.codigo + "/" + unit.codigo, unit.nome);
      for (const child of unit.subunidades || [])
        state.institutionNames.set(org.codigo + "/" + child.codigo, child.nome);
    }
  }
  state.institutionNames.set("ACE/P", "Presidência do Alto-Comando do Exército");
  state.institutionNames.set("ACE/ACE", "Conselho do Alto-Comando do Exército");
  state.institutionNames.set("DEC/D", "Direção do Departamento de Educação e Ciência");
  state.institutionNames.set("DTC/D", "Direção do Departamento de Tecnologia e Comunicação");
  state.institutionNames.set("DGP/DG", "Direção-Geral do Departamento-Geral do Pessoal");
  state.institutionNames.set("EME/Ch", "Chefia do Estado-Maior do Exército");
}
function documentCard(doc) {
  const card = document.createElement("button");
  card.type = "button";
  card.dataset.documentId = doc.id;
  card.className = "news-card";
  if (state.selected?.id === doc.id) card.classList.add("doc-selected");
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
  const summary = doc.descricao || plain || "";
  desc.textContent = summary.slice(0, 220) + (summary.length > 220 ? "..." : "");
  const footer = document.createElement("div");
  footer.className = "news-card-footer";
  const origin = document.createElement("span");
  origin.className = "news-card-author";
  origin.textContent = "Publicado por " + authorLabel(doc) +
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
function filterOptionsFor(section) {
  const visibility = section === "setoriais" ? "restrito" : "patentes";
  const options = new Map();
  for (const doc of state.documents.filter(d => d.visibilidade === visibility)) {
    for (const entry of state.documentFilters.get(doc.id) || []) {
      const key = entry.tipo + ":" + entry.codigo;
      if (!options.has(key)) options.set(key, entry.nome);
    }
  }
  return [...options].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
}
function updateDocumentFilter() {
  const section = $("doc-section").value;
  const wrap = $("doc-filter-wrap");
  const select = $("doc-filter");
  const current = select.value;
  wrap.hidden = section === "oficiais";
  if (wrap.hidden) {
    select.value = "";
    return;
  }
  $("doc-filter-label").textContent = section === "setoriais" ? "Filtrar por divisão" : "Filtrar por destinatários";
  select.replaceChildren();
  const all = document.createElement("option");
  all.value = "";
  all.textContent = section === "setoriais" ? "Todas as divisões" : "Todos os destinatários";
  select.append(all);
  for (const [key, name] of filterOptionsFor(section)) {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = name;
    select.append(option);
  }
  if ([...select.options].some(o => o.value === current)) select.value = current;
}
function render() {
  const section = $("doc-section").value;
  updateDocumentFilter();
  const selected = $("doc-filter").value;
  renderList("doc-list", "doc-empty", state.documents.filter(d => {
    const matching = section === "oficiais" ? d.visibilidade === "geral" :
      section === "patentes" ? d.visibilidade === "patentes" : d.visibilidade === "restrito";
    if (!matching || !selected) return matching;
    return (state.documentFilters.get(d.id) || []).some(entry =>
      entry.tipo + ":" + entry.codigo === selected);
  }));
  renderList("my-documents-list", "my-documents-empty",
    state.documents.filter(d => d.criado_por === state.militarId));
  renderList("manage-documents-list", "manage-documents-empty",
    state.documents.filter(d => state.manageableIds.has(d.id)));
}
async function loadDocumentFilters() {
  const data = await rpc("documentos_filtros_disponiveis");
  state.documentFilters = new Map();
  for (const item of data || []) {
    if (!state.documentFilters.has(item.documento_id)) state.documentFilters.set(item.documento_id, []);
    state.documentFilters.get(item.documento_id).push(item);
  }
}
async function load() {
  const { data, error } = await supabase.from("documentos")
    .select("id,titulo,descricao,conteudo,categoria,orgao,unidade,visibilidade,criado_por,criado_em,atualizado_em,publicado_por_tipo,publicado_por_codigo")
    .order("criado_em", { ascending: true }).limit(300);
  if (error) throw error;
  state.documents = data || [];
  await loadMilitaryNames(state.documents);
  await loadDocumentFilters();
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
    await loadMilitaryNames([doc]);
    $("detail-meta").textContent = ["Publicado por " + authorLabel(doc), doc.categoria,
      doc.visibilidade === "geral" ? "Oficial" : doc.visibilidade === "patentes" ? "Por patente" : "Setorial", formatDate(doc.criado_em)]
      .filter(Boolean).join(" · ");
    $("detail-description").textContent = doc.descricao || "";
    $("document-content").innerHTML = sanitizeHtml(doc.conteudo);
    $("manage-panel").hidden = true;
    show("detail-panel");
    document.querySelectorAll("#doc-list .news-card").forEach(card => card.classList.toggle("doc-selected", card.dataset.documentId === id));
    const allowed = await rpc("documentos_pode_gerenciar", { p_documento_id: id });
    if (request !== state.currentRequest || !allowed) return;
    $("manage-panel").hidden = false;

  } catch (error) { if (request === state.currentRequest) fail(error); }
}
function resetEditor() {
  state.editing = null;
  $("publish-form").reset();
  $("publish-author").disabled = false;
  updateAuthorOptions();
  renderRankChoices();
  renderSectorChoices();
  updateVisibility();
  $("publish-heading").textContent = "Publicar documento";
  $("publish-submit").textContent = "Publicar documento";
  $("publish-visibility").disabled = false;
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
  f.unidade.value = doc.unidade || "";
  if (doc.visibilidade === "patentes") {
    $("rank-mode").value = doc.patente_modo || "todos";
    renderRankChoices();
    for (const input of document.querySelectorAll("#rank-choices input")) input.checked = (doc.patente_alvos || []).includes(input.value);
  }
  updateVisibility();
  updateAuthorOptions(doc.publicado_por_tipo === "institucional" ? doc.publicado_por_codigo : "pessoal");
  $("publish-author").disabled = true;
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
      const visibility = f.visibilidade.value;
      const sectors = visibility === "restrito" ? selectedSectors() : [];
      if (visibility === "restrito" && !sectors.length) throw new Error("Selecione pelo menos um setor destinatário.");
      if (sectors.some(code => !state.sectors.some(s => s.codigo === code))) throw new Error("Setor destinatário não autorizado.");
      const ranks = [...document.querySelectorAll("#rank-choices input:checked")].map(input => input.value);
      if (visibility === "patentes" && $("rank-mode").value !== "todos" && !ranks.length)
        throw new Error("Selecione os destinatários por patente.");
      const identity = $("publish-author").value;
      if (identity !== "pessoal" && !state.identities.some(item => item.codigo === identity))
        throw new Error("Identificação institucional não autorizada.");
      const scope = publishingScope(visibility, identity, sectors);
      if (!scope) throw new Error("Não foi possível identificar um órgão de publicação autorizado.");
      const confirmed = await rpc("documentos_pode_criar", {
        p_orgao: scope.orgao, p_unidade: scope.unidade || null
      });
      if (confirmed !== true) throw new Error("Permissão de publicação negada pelo servidor.");
      const id = await rpc("documentos_publicar_v4", {
        ...fields,
        p_orgao: scope.orgao,
        p_unidade: scope.unidade || null,
        p_visibilidade: visibility,
        p_patente_modo: visibility === "patentes" ? $("rank-mode").value : null,
        p_patente_alvos: visibility === "patentes" ? ($("rank-mode").value === "todos" ? [] : ranks) : [],
        p_publicado_por_tipo: identity === "pessoal" ? "pessoal" : "institucional",
        p_publicado_por_codigo: identity === "pessoal" ? null : identity,
        p_destinatarios: sectors
      });
      if (!id) throw new Error("A publicação não retornou o identificador.");
      resetEditor();
      await load();
      await openDocument(id);
      feedback("Documento publicado com sucesso.");
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
  $("sector-targets").hidden = visibility.value !== "restrito" || !!state.editing;
  $("rank-targets").hidden = visibility.value !== "patentes";
  $("rank-choices").hidden = $("rank-mode").value === "todos";
}
$("publish-visibility").addEventListener("change", updateVisibility);
$("rank-mode").addEventListener("change", () => { renderRankChoices(); updateVisibility(); });
$("doc-section").addEventListener("change", () => { $("doc-filter").value = ""; render(); });
$("doc-filter").addEventListener("change", render);

$("new-document").addEventListener("click", startNew);
for (const id of ["publish-cancel", "publish-cancel-bottom"]) {
  $(id).addEventListener("click", () => {
    resetEditor();
    show(state.selected ? "detail-panel" : state.activeTab);
  });
}
$("publish-form").addEventListener("submit", save);
$("close-detail").addEventListener("click", backToTab);
$("edit-document").addEventListener("click", startEdit);
$("delete-document").addEventListener("click", removeDocument);
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
    await loadInstitutionNames();
    await loadIdentities();
    await loadSectors();
    updateVisibility();
    // A interface usa as permissões confirmadas pelo banco; o banco também
    // deve validar novamente cada operação de publicação e edição.
    await load();
    show("library-panel");
  } catch (error) { fail(error); $("doc-list").textContent = "Não foi possível carregar a biblioteca."; }
})();
