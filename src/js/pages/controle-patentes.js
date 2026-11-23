
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


// Criar botões das patentes
function carregarPatentes() {
    patentesList.replaceChildren();

    patentes.forEach(patente => {
        const button = document.createElement("button");

        button.className = "patente-item";
        button.textContent = patente;

        button.addEventListener("click", () => {
            selecionarPatente(patente, button);
        });

        patentesList.appendChild(button);
    });
}

// Consultar militares da patente selecionada
async function selecionarPatente(patente, button) {
    document.querySelectorAll(".patente-item").forEach(item => {
        item.classList.remove("active");
    });

    button.classList.add("active");

    militaresList.textContent = "Carregando militares...";

    const { data, error } = await supabase
        .from("militares")
        .select("nome")
        .eq("patente", patente)
        .order("nome", { ascending: true });

    militaresList.replaceChildren();

    if (error) {
        militaresList.textContent = "Erro ao consultar militares.";
        console.error(error);
        return;
    }

    const titulo = document.createElement("h2");
    titulo.textContent = patente;
    militaresList.appendChild(titulo);

    if (data.length === 0) {
        const mensagem = document.createElement("p");
        mensagem.textContent = "Nenhum militar cadastrado nesta patente.";
        militaresList.appendChild(mensagem);
        return;
    }

    const lista = document.createElement("ul");

    data.forEach(militar => {
        const item = document.createElement("li");
        item.textContent = militar.nome;
        lista.appendChild(item);
    });

    militaresList.appendChild(lista);
}

// Inicializar página
carregarPatentes();
