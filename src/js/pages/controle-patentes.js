
import { supabase } from "../supabase.js";

const patentesList = document.getElementById("patentes-list");
const militaresList = document.getElementById("militares-list");

// Relação de patentes em ordem hierárquica

const patentes = [
    "Marechal",
    "General-de-Exército",
    "General-de-Divisão",
    "General-de-Brigada",
    "Coronel",
    "Tenente-Coronel",
    "Major",
    "Capitão",
    "Primeiro-Tenente",
    "Segundo-Tenente",
    "Aspirante-a-Oficial",
    "Cadete",
    "Subtenente",
    "Primeiro-Sargento",
    "Segundo-Sargento",
    "Terceiro-Sargento",
    "Cabo",
    "Soldado",
    "Soldado-Recruta",
    "Recruta"
];



const funcoesList = document.getElementById("funcoes-list");
const resumo = document.getElementById("efetivo-resumo");
const tabs = [document.getElementById("tab-patentes"), document.getElementById("tab-funcoes")];
let militares = [], vinculos = [], categorias = [];
const criar = (tag, texto, classe) => {
    const e = document.createElement(tag);
    if (texto) e.textContent = texto;
    if (classe) e.className = classe;
    return e;
};
async function todos(tabela, colunas, filtrar = q => q) {
    const lista = [];
    for (let inicio = 0; ; inicio += 500) {
        const { data, error } = await filtrar(supabase.from(tabela).select(colunas))
            .order("id").range(inicio, inicio + 499);
        if (error) throw error;
        lista.push(...data);
        if (data.length < 500) return lista;
    }
}
function listaMilitares(lista, vazio) {
    const box = criar("div", "", "efetivo-membros");
    if (!lista.length) box.append(criar("p", vazio, "efetivo-vago"));
    for (const m of [...lista].sort((a,b) => a.nome.localeCompare(b.nome,"pt-BR"))) {
        const linha = criar("div", "", "efetivo-membro");
        linha.append(criar("strong", m.nome), criar("span", [m.patente, m.status === "afastado" ? "Afastado" : ""].filter(Boolean).join(" · ")));
        box.append(linha);
    }
    return box;
}
function carregarPatentes() {
    patentesList.replaceChildren();
    for (const patente of patentes) {
        const lista = militares.filter(m => m.patente === patente);
        const button = criar("button", patente + " (" + lista.length + ")", "patente-item");
        button.type = "button";
        button.addEventListener("click", () => {
            patentesList.querySelectorAll("button").forEach(b => b.classList.toggle("active", b === button));
            militaresList.replaceChildren(criar("h2", patente), listaMilitares(lista, "Nenhum militar nesta patente."));
        });
        patentesList.append(button);
    }
}
function estrutura(no, raiz = false) {
    const box = criar(raiz ? "details" : "section", "", raiz ? "efetivo-orgao" : "efetivo-unidade");
    box.append(criar(raiz ? "summary" : "h4", no.nome));
    for (const f of no.funcoes || []) {
        const item = criar("div", "", "efetivo-funcao");
        const ids = new Set(vinculos.filter(v => v.codigo_vinculo === f.codigo).map(v => v.militar_id));
        item.append(criar("h5", f.nome), listaMilitares(militares.filter(m => ids.has(m.id)), "Vago"));
        box.append(item);
    }
    for (const filho of [...(no.unidades || []), ...(no.subunidades || [])]) box.append(estrutura(filho));
    return box;
}
function carregarFuncoes() {
    funcoesList.replaceChildren();
    for (const categoria of categorias) {
        funcoesList.append(criar("h3", categoria.nome));
        for (const orgao of categoria.orgaos || []) funcoesList.append(estrutura(orgao, true));
    }
}
tabs.forEach((tab,i) => tab.addEventListener("click", () => {
    tabs.forEach((t,k) => t.setAttribute("aria-pressed", String(i === k)));
    patentesList.hidden = militaresList.hidden = i !== 0;
    funcoesList.hidden = i !== 1;
}));
async function iniciar() {
    try {
        const [ms, vs, resposta] = await Promise.all([
            todos("militares", "id,nome,patente,status", q => q.in("status", ["ativo","afastado"])),
            todos("funcoes", "id,militar_id,codigo_vinculo"),
            fetch("/orgaos.json")
        ]);
        if (!resposta.ok) throw Error("Catálogo indisponível.");
        militares = ms; vinculos = vs; categorias = (await resposta.json()).categorias;
        if (!Array.isArray(categorias)) throw Error("Catálogo inválido.");
        for (const [nome,valor] of [["Efetivo total",ms.length],["Ativos",ms.filter(m=>m.status==="ativo").length],["Afastados",ms.filter(m=>m.status==="afastado").length]]) {
            const card = criar("div"); card.append(criar("span",nome),criar("strong",String(valor))); resumo.append(card);
        }
        carregarPatentes(); carregarFuncoes();
    } catch (erro) {
        console.error(erro);
        patentesList.textContent = funcoesList.textContent = "Não foi possível consultar o efetivo.";
    }
}
iniciar();
