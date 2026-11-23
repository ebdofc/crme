import { supabase } from "../supabase.js";

const newsList = document.getElementById("latest-news-list");
const noNews = document.getElementById("no-latest-news");

function formatarData(data) {
    if (!data) return "";

    return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeZone: "America/Sao_Paulo"
    }).format(new Date(data));
}

function criarNoticia(noticia) {
    const artigo = document.createElement("article");
    artigo.className = "news-item";

    const link = document.createElement("a");
    link.className = "news-item-link";
    link.href = `noticias.html?id=${encodeURIComponent(noticia.id)}`;

    const titulo = document.createElement("h3");
    titulo.textContent = noticia.titulo;

    const informacoes = document.createElement("div");
    informacoes.className = "news-item-info";

    const categoria = document.createElement("span");
    categoria.className = "news-item-category";
    categoria.textContent = noticia.categoria;

    const data = document.createElement("span");
    data.className = "news-item-date";
    data.textContent = formatarData(noticia.publicada_em);

    const autor = document.createElement("p");
    autor.className = "news-item-author";

    const nomeAutor = [
        noticia.autor_patente,
        noticia.autor_nome
    ].filter(Boolean).join(" ");

    autor.textContent = `Publicado por ${nomeAutor}`;

    informacoes.append(categoria, data);
    link.append(titulo, informacoes, autor);
    artigo.appendChild(link);

    return artigo;
}

async function carregarNoticias() {
    try {
        const { data, error } = await supabase
            .from("noticias")
            .select(`
                id,
                titulo,
                categoria,
                publicada_em,
                autor_nome,
                autor_patente
            `)
            .eq("status", "publicada")
            .order("publicada_em", {
                ascending: false,
                nullsFirst: false
            })
            .limit(3);

        if (error) throw error;

        newsList.replaceChildren();

        noNews.hidden = data.length > 0;

        data.forEach(noticia => {
            newsList.appendChild(criarNoticia(noticia));
        });

    } catch (error) {
        console.error("Erro ao carregar notícias:", error);

        noNews.hidden = true;
        newsList.textContent =
            "Não foi possível carregar as notícias.";
    }
}

carregarNoticias();