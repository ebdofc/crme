import { supabase } from "../supabase.js";

const $ = (id) => document.getElementById(id);
const state = { documents: [], selected: null, militarId: null, pdfUrl: null, catalog: [] };
const MAX_BYTES = 10485760;
const uuid = () => crypto.randomUUID();
const date = (value) => value ? new Date(value).toLocaleDateString("pt-BR") : "—";
const safe = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
function message(text, error = false) {
  $("doc-message").textContent = text;
  $("doc-message").className = error ? "doc-error" : "doc-success";
}
function fail(error) { message(error?.message || String(error), true); }
async function rpc(name, params = {}) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data;
}
function closeViewer() {
  $("viewer-panel").hidden = true;
  $("pdf-frame").src = "about:blank";
  if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl);
  state.pdfUrl = null;
}
function render() {
  const term = $("doc-search").value.trim().toLocaleLowerCase("pt-BR");
  const category = $("doc-category").value;
  const visibility = $("doc-visibility").value;
  const docs = state.documents.filter(d =>
    (!category || d.categoria === category) &&
    (!visibility || d.visibilidade === visibility) &&
    (!term || [d.titulo, d.descricao, d.orgao, d.unidade].some(v => String(v || "").toLocaleLowerCase("pt-BR").includes(term)))
  );
  $("doc-list").innerHTML = docs.length ? docs.map(d => `<article class="doc-item"><h3>${safe(d.titulo)}</h3><div class="doc-meta">${safe(d.categoria)} · ${safe(d.orgao)}${d.unidade ? " / " + safe(d.unidade) : ""} · ${safe(d.visibilidade)} · ${date(d.criado_em)}</div><p>${safe(d.descricao || "Sem descrição.")}</p><button type="button" data-open="${d.id}">Detalhes</button></article>`).join("") : "<p>Nenhum documento disponível para sua conta ou filtros.</p>";
}
async function load() {
  $("doc-list").textContent = "Carregando documentos...";
  const { data, error } = await supabase.from("documentos").select("id,titulo,descricao,categoria,orgao,unidade,arquivo_nome,tamanho_bytes,visibilidade,criado_em").order("criado_em", { ascending: false }).limit(300);
  if (error) { fail(error); $("doc-list").textContent = "Não foi possível carregar os documentos."; return; }
  state.documents = data || [];
  const current = $("doc-category").value;
  const categories = [...new Set(state.documents.map(d => d.categoria).filter(Boolean))].sort();
  $("doc-category").innerHTML = '<option value="">Todas</option>' + categories.map(c => `<option value="${safe(c)}">${safe(c)}</option>`).join("");
  $("doc-category").value = categories.includes(current) ? current : "";
  render();
}
async function openDocument(id) {
  closeViewer();
  const doc = state.documents.find(d => d.id === id);
  if (!doc) return;
  state.selected = doc;
  $("detail-panel").hidden = false;
  $("detail-title").textContent = doc.titulo;
  $("detail-meta").textContent = [doc.categoria, doc.orgao, doc.unidade, doc.visibilidade, date(doc.criado_em)].filter(Boolean).join(" · ");
  $("detail-description").textContent = doc.descricao || "Sem descrição.";
  $("manage-panel").hidden = true;
  $("detail-panel").scrollIntoView({ behavior: "smooth" });
  try {
    const permitted = await rpc("documentos_pode_gerenciar", { p_documento_id: id });
    if (state.selected?.id !== id || permitted !== true) return;
    $("manage-panel").hidden = false;
    const form = $("edit-form");
    for (const field of ["titulo","descricao","categoria","orgao","unidade","visibilidade"]) {
      form.elements[field].value = doc[field] || "";
    }
    await loadPermissions(id);
  } catch (error) { fail(error); }
}
async function loadPermissions(id) {
  const { data, error } = await supabase.from("documentos_permissoes").select("tipo,codigo").eq("documento_id", id).order("tipo");
  if (error) { $("permissions-list").textContent = "Permissões não disponíveis."; return; }
  $("permissions-list").innerHTML = (data || []).length ? data.map(p => `<div class="permission"><span>${safe(p.tipo)}: ${safe(p.codigo)}</span><button type="button" data-remove-type="${safe(p.tipo)}" data-remove-code="${safe(p.codigo)}">Remover</button></div>`).join("") : "<p>Nenhuma permissão específica cadastrada.</p>";
}
async function loadCatalog() {
  try {
    const response = await fetch("/orgaos.json");
    if (!response.ok) throw new Error("Catálogo de órgãos indisponível.");
    const catalog = await response.json();
    state.catalog = (catalog.categorias || []).flatMap(c => c.orgaos || []);
    $("publish-orgao").innerHTML = '<option value="">Selecione</option>' + state.catalog.map(o => `<option value="${safe(o.codigo)}">${safe(o.nome)} (${safe(o.codigo)})</option>`).join("");
  } catch (error) { fail(error); }
}
function updateUnits() {
  const organ = state.catalog.find(o => o.codigo === $("publish-orgao").value);
  $("publish-unidade").innerHTML = '<option value="">Sem unidade</option>' + (organ?.unidades || []).map(u => `<option value="${safe(u.codigo)}">${safe(u.nome)} (${safe(u.codigo)})</option>`).join("");
}
async function publish(event) {
  event.preventDefault();
  const button = $("publish-submit");
  if (button.disabled) return;
  const form = event.currentTarget;
  const file = form.elements.arquivo.files[0];
  if (!file || file.size < 1 || file.size > MAX_BYTES || !file.name.toLowerCase().endsWith(".pdf") || file.type !== "application/pdf") {
    message("Selecione um PDF válido de até 10 MB.", true); return;
  }
  const organ = form.elements.orgao.value;
  const unit = form.elements.unidade.value;
  if (!organ || !state.militarId) { message("Órgão ou identidade militar indisponível.", true); return; }
  // Segmentos controlados pelo catálogo; o nome original não compõe o caminho.
  const path = `${state.militarId}/${organ}/${unit || "_"}/${uuid()}.pdf`;
  button.disabled = true;
  message("Enviando arquivo...");
  let uploaded = false;
  try {
    const { error: uploadError } = await supabase.storage.from("documentos").upload(path, file, { contentType: "application/pdf", upsert: false });
    if (uploadError) throw uploadError;
    uploaded = true;
    const id = await rpc("documentos_publicar", {
      p_titulo: form.elements.titulo.value.trim(),
      p_descricao: form.elements.descricao.value.trim(),
      p_categoria: form.elements.categoria.value.trim(),
      p_orgao: organ,
      p_unidade: unit || null,
      p_arquivo_caminho: path,
      p_arquivo_nome: file.name,
      p_tamanho_bytes: file.size
    });
    if (!id) throw new Error("A publicação não retornou um identificador.");
    form.reset();
    updateUnits();
    $("publish-panel").hidden = true;
    message("Documento publicado com visibilidade restrita.");
    await load();
  } catch (error) {
    // Não tentamos remover diretamente: o bucket não permite DELETE ao cliente.
    fail(error);
    if (uploaded) message("Upload realizado, mas a publicação falhou. O arquivo pode precisar de limpeza administrativa. " + (error.message || ""), true);
  } finally { button.disabled = false; }
}
async function view() {
  const id = state.selected?.id;
  if (!id) return;
  closeViewer();
  message("Preparando visualização...");
  $("view-document").disabled = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Sessão expirada. Faça login novamente.");
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/documentos-visualizar`;
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ documento_id: id })
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.erro || `Falha na visualização (HTTP ${response.status}).`);
    }
    const blob = await response.blob();
    if (state.selected?.id !== id) return;
    state.pdfUrl = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
    $("pdf-frame").src = state.pdfUrl;
    $("viewer-panel").hidden = false;
    $("viewer-panel").scrollIntoView({ behavior: "smooth" });
    message("Visualização registrada.");
  } catch (error) { fail(error); }
  finally { $("view-document").disabled = false; }
}
$("doc-list").addEventListener("click", e => { const button = e.target.closest("[data-open]"); if (button) openDocument(button.dataset.open); });
for (const id of ["doc-search","doc-category","doc-visibility"]) $(id).addEventListener("input", render);
$("doc-refresh").addEventListener("click", load);
$("new-document").addEventListener("click", () => { $("publish-panel").hidden = false; $("publish-panel").scrollIntoView({ behavior: "smooth" }); });
$("publish-cancel").addEventListener("click", () => { $("publish-panel").hidden = true; });
$("publish-orgao").addEventListener("change", updateUnits);
$("publish-form").addEventListener("submit", publish);
$("close-detail").addEventListener("click", () => { $("detail-panel").hidden = true; state.selected = null; closeViewer(); });
$("view-document").addEventListener("click", view);
$("close-viewer").addEventListener("click", closeViewer);
$("edit-form").addEventListener("submit", async e => {
  e.preventDefault();
  const doc = state.selected;
  if (!doc) return;
  const f = e.currentTarget.elements;
  try {
    await rpc("documentos_editar", { p_documento_id: doc.id, p_titulo: f.titulo.value.trim(), p_descricao: f.descricao.value.trim(), p_categoria: f.categoria.value.trim(), p_orgao: doc.orgao, p_unidade: doc.unidade, p_visibilidade: f.visibilidade.value });
    message("Documento atualizado."); await load(); await openDocument(doc.id);
  } catch (error) { fail(error); }
});
$("permission-form").addEventListener("submit", async e => {
  e.preventDefault();
  const doc = state.selected; if (!doc) return;
  const f = e.currentTarget.elements;
  try {
    await rpc("documentos_adicionar_permissao", { p_documento_id: doc.id, p_tipo: f.tipo.value, p_codigo: f.codigo.value.trim() });
    f.codigo.value = ""; message("Permissão adicionada."); await loadPermissions(doc.id);
  } catch (error) { fail(error); }
});
$("permissions-list").addEventListener("click", async e => {
  const button = e.target.closest("[data-remove-type]"); const doc = state.selected;
  if (!button || !doc || !confirm("Remover esta permissão?")) return;
  try {
    await rpc("documentos_remover_permissao", { p_documento_id: doc.id, p_tipo: button.dataset.removeType, p_codigo: button.dataset.removeCode });
    message("Permissão removida."); await loadPermissions(doc.id);
  } catch (error) { fail(error); }
});
window.addEventListener("beforeunload", closeViewer);
(async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    state.militarId = await rpc("crme_militar_id");
    await loadCatalog();
    const admin = await rpc("documentos_admin_global");
    // A autorização real de publicação é validada no banco e no Storage.
    $("new-document").hidden = !state.militarId;
    await load();
  } catch (error) { fail(error); }
})();
