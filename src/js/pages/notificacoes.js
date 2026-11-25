import { supabase } from "../supabase.js";
import "../../css/pages/notificacoes.css";

let iniciado = false;
export async function iniciarNotificacoes(discordId) {
    if (iniciado) return;
    const sair = document.getElementById("logout-button");
    if (!sair) return;
    const {data: militar,error} = await supabase.from("militares").select("id").eq("discord_id",discordId).maybeSingle();
    if (error || !militar) throw error || new Error("Militar não localizado");
    iniciado = true;
    const id = militar.id;
    const criar = (tag,classe,texto) => {
        const el = document.createElement(tag);
        el.className = classe;
        if (texto !== undefined) el.textContent = texto;
        return el;
    };
    const raiz = criar("div","crme-notificacoes");
    const sino = criar("button","crme-not-sino");
    sino.type = "button";
    sino.setAttribute("aria-label","Notificações");
    sino.setAttribute("aria-expanded","false");
    sino.setAttribute("aria-controls","crme-not-painel");
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns,"svg");
    svg.setAttribute("viewBox","0 0 24 24");
    svg.setAttribute("fill","none");
    svg.setAttribute("stroke","currentColor");
    svg.setAttribute("stroke-width","1.7");
    svg.setAttribute("aria-hidden","true");
    const path = document.createElementNS(ns,"path");
    path.setAttribute("d","M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4");
    svg.append(path);
    const contador = criar("span","crme-not-contador");
    contador.hidden = true;
    sino.append(svg,contador);
    const painel = criar("section","crme-not-painel");
    painel.id = "crme-not-painel";
    painel.hidden = true;
    painel.setAttribute("aria-label","Notificações");
    const topo = criar("div","crme-not-topo");
    const todas = criar("button","crme-not-todas","Marcar todas como lidas");
    todas.type = "button";
    topo.append(criar("strong","","Notificações"),todas);
    const lista = criar("div","crme-not-lista");
    const estado = criar("p","crme-not-estado","Carregando...");
    estado.setAttribute("role","status");
    const mais = criar("button","crme-not-mais","Mostrar mais");
    mais.type = "button";
    mais.hidden = true;
    painel.append(topo,estado,lista,mais);
    raiz.append(sino,painel);
    sair.before(raiz);
    let limite = 30, ocupado = false, atualizarDepois = false, alterando = false, total = 0;
    function fechar() {
        painel.hidden = true;
        sino.setAttribute("aria-expanded","false");
    }
    function destino(link) {
        if (!link) return null;
        try {
            const url = new URL(link,location.href);
            return url.origin === location.origin && /^https?:$/.test(url.protocol) ? url.href : null;
        } catch { return null; }
    }
    async function atualizar() {
        if (ocupado || alterando) { atualizarDepois = true; return; }
        ocupado = true;
        try {
            const {data,count,error} = await supabase.from("notificacoes")
                .select("id,titulo,mensagem,link,criada_em",{count:"exact"})
                .eq("militar_id",id).order("criada_em",{ascending:false})
                .order("id",{ascending:false}).limit(limite);
            if (error) throw error;
            total = count ?? data.length;
            contador.textContent = total > 99 ? "99+" : String(total);
            contador.hidden = total === 0;
            sino.setAttribute("aria-label","Notificações: "+total+" pendentes");
            todas.disabled = total === 0;
            mais.hidden = total <= data.length;
            lista.replaceChildren();
            estado.textContent = total ? "" : "Nenhuma notificação.";
            for (const n of data) {
                const item = criar("button","crme-not-item");
                item.type = "button";
                item.append(criar("strong","",n.titulo),criar("span","",n.mensagem),
                    criar("small","",new Date(n.criada_em).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})));
                item.addEventListener("click",()=>excluir(n));
                lista.append(item);
            }
        } catch (erro) {
            estado.textContent = "Não foi possível atualizar as notificações.";
            console.error(erro);
        } finally {
            ocupado = false;
            if (atualizarDepois) { atualizarDepois = false; atualizar(); }
        }
    }
    async function excluir(n) {
        if (alterando || ocupado) return;
        alterando = true;
        todas.disabled = true;
        try {
            let consulta = supabase.from("notificacoes").delete().eq("militar_id",id);
            if (n) consulta = consulta.eq("id",n.id);
            else consulta = consulta.lte("criada_em",new Date().toISOString());
            const {error} = await consulta;
            if (error) throw error;
            const url = destino(n?.link);
            if (url) location.assign(url);
        } catch (erro) {
            estado.textContent = "Não foi possível excluir a notificação.";
            console.error(erro);
            alterando = false;
            todas.disabled = total === 0;
            return;
        }
        alterando = false;
        atualizar();
    }
    todas.addEventListener("click",()=>excluir(null));
    mais.addEventListener("click",()=>{limite += 30; atualizar();});
    sino.addEventListener("click",()=>{
        if (!painel.hidden) fechar();
        else { painel.hidden = false; sino.setAttribute("aria-expanded","true"); atualizar(); }
    });
    document.addEventListener("click",e=>{if (!raiz.contains(e.target)) fechar();});
    document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!painel.hidden){fechar();sino.focus();}});
    const canal = supabase.channel("crme-not-"+crypto.randomUUID())
        .on("postgres_changes",{event:"INSERT",schema:"public",table:"notificacoes",filter:"militar_id=eq."+id},atualizar)
        .subscribe(status=>{if(status==="SUBSCRIBED") atualizar();});
    const timer = setInterval(()=>{if(document.visibilityState==="visible") atualizar();},30000);
    window.addEventListener("focus",atualizar);
    window.addEventListener("pagehide",()=>{clearInterval(timer);supabase.removeChannel(canal);},{once:true});
    await atualizar();
}
