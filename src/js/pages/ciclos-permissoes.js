/**
 * CRME — Permissões da página Ciclo de Promoções
 * Lê a identidade autenticada, os vínculos do militar e o catálogo oficial.
 * Este módulo NÃO faz alterações no banco e NÃO substitui RLS/RPC.
 */

export const CODIGOS_CPO = Object.freeze({
    comandante: 'Comandante do Exército',
    acePresidente: 'ACE/P',
    aceVicePresidente: 'ACE/VP',
    aceConselheiro: 'ACE',
    dapDiretor: 'DGP/DAP/Dir',
    dapAuxiliar: 'DGP/DAP/Aux',
    auditores: Object.freeze([
        'Presidente', 'Vice-Presidente', 'Ministro da Defesa', 'Ministro'
    ])
});

function coletarCodigosCatalogo(categorias) {
    const codigos = new Set();
    function visitar(orgao) {
        for (const funcao of orgao.funcoes || []) {
            if (typeof funcao.codigo === 'string') codigos.add(funcao.codigo);
        }
        for (const unidade of orgao.unidades || []) visitar(unidade);
        for (const subunidade of orgao.subunidades || []) visitar(subunidade);
    }
    for (const categoria of categorias || []) {
        for (const orgao of categoria.orgaos || []) visitar(orgao);
    }
    return codigos;
}

/** Funções calculadas sempre com igualdade EXATA do código de vínculo. */
export function calcularPermissoesCPO(militar, vinculos, codigosCatalogo = null) {
    const ativo = String(militar?.status || '').trim().toLowerCase() === 'ativo';
    const codigos = new Set((vinculos || []).map(v => v?.codigo_vinculo).filter(Boolean));
    const contem = codigo => ativo && codigos.has(codigo) &&
        (!codigosCatalogo || codigosCatalogo.has(codigo));
    const presidenciaACE = contem(CODIGOS_CPO.acePresidente) ||
        contem(CODIGOS_CPO.aceVicePresidente);
    const conselhoACE = contem(CODIGOS_CPO.aceConselheiro) || presidenciaACE;
    const diretorDAP = contem(CODIGOS_CPO.dapDiretor);
    const auxiliarDAP = contem(CODIGOS_CPO.dapAuxiliar);
    const auditor = CODIGOS_CPO.auditores.some(contem);
    const comandante = contem(CODIGOS_CPO.comandante);

    return Object.freeze({
        ativo,
        comandante,
        presidenciaACE,
        conselhoACE,
        diretorDAP,
        auxiliarDAP,
        auditor,
        consultarPublico: true, // acesso público a qualquer usuário AUTENTICADO
        indicar: comandante || conselhoACE,
        consultarDAP: diretorDAP || auxiliarDAP || auditor,
        avaliarDAP: diretorDAP || auxiliarDAP,
        validarDAP: diretorDAP,
        consultarACE: conselhoACE || auditor,
        votarACE: conselhoACE,
        decidirPresidencia: presidenciaACE,
        gerenciarCiclo: presidenciaACE,
        confirmarCargo: conselhoACE,
        auditar: auditor
    });
}

function validarDiscordId(user) {
    const id = String(user?.user_metadata?.provider_id || user?.user_metadata?.sub || '').trim();
    return /^\d{17,20}$/.test(id) ? id : null;
}

async function dados(pedido) {
    const { data, error } = await pedido;
    if (error) throw new Error(error.message || 'Falha na consulta ao CRME.');
    return data;
}

/**
 * Falha fechada: sem sessão, catálogo ou vínculo confiável, nenhuma permissão
 * administrativa é concedida. A consulta pública é liberada só após autenticação.
 */
export async function carregarAcessoCPO(supabase, buscarCatalogo = fetch) {
    const resposta = await supabase.auth.getUser();
    if (resposta.error) throw new Error('Não foi possível verificar a autenticação no CRME.');
    const user = resposta.data?.user;
    if (!user) throw new Error('É necessário entrar no CRME para consultar os ciclos de promoção.');

    const respostaCatalogo = await buscarCatalogo('/orgaos.json');
    if (!respostaCatalogo.ok) throw new Error('Não foi possível consultar o catálogo de funções do CRME.');
    const catalogo = await respostaCatalogo.json();
    if (!Array.isArray(catalogo.categorias)) throw new Error('Catálogo institucional inválido.');
    const codigosCatalogo = coletarCodigosCatalogo(catalogo.categorias);

    const discordId = validarDiscordId(user);
    // Um usuário Discord autenticado sem registro militar continua podendo
    // consultar a área pública. Ele nunca recebe permissões operacionais.
    if (!discordId) {
        return { user, discordId: null, militar: null, vinculos: [],
            permissoes: calcularPermissoesCPO(null, [], codigosCatalogo) };
    }

    const militar = await dados(supabase.from('militares')
        .select('id,nome,discord_id,patente,status')
        .eq('discord_id', discordId).maybeSingle());

    const vinculos = militar ? await dados(supabase.from('funcoes')
        .select('codigo_vinculo')
        .eq('militar_id', militar.id)) : [];

    return {
        user, discordId, militar, vinculos: vinculos || [],
        permissoes: calcularPermissoesCPO(militar, vinculos || [], codigosCatalogo)
    };
}
