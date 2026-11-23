// CRME — Entrega autorizada de documentos PDF.
// Deploy: supabase functions deploy documentos-visualizar
import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function json(message: string, status: number): Response {
  return new Response(JSON.stringify({ erro: message }), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST") return json("Método não permitido.", 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) {
    console.error("Configuração Supabase ausente.");
    return json("Serviço indisponível.", 503);
  }

  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json("Autenticação obrigatória.", 401);

  let documentId: string;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || !("documento_id" in body)) {
      return json("Informe documento_id.", 400);
    }
    const id = (body as Record<string, unknown>).documento_id;
    if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return json("Identificador de documento inválido.", 400);
    }
    documentId = id;
  } catch {
    return json("Corpo JSON inválido.", 400);
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: identity, error: identityError } = await userClient.auth.getUser(token);
  if (identityError || !identity.user) return json("Sessão inválida ou expirada.", 401);

  const { data: permitted, error: permissionError } = await userClient.rpc(
    "documentos_pode_visualizar",
    { p_documento_id: documentId },
  );
  if (permissionError) {
    console.error("Erro ao verificar autorização:", permissionError.message);
    return json("Não foi possível verificar a autorização.", 500);
  }
  if (permitted !== true) return json("Você não possui acesso a este documento.", 403);

  // A leitura do registro ocorre com o JWT do próprio usuário e respeita o RLS.
  const { data: document, error: documentError } = await userClient
    .from("documentos")
    .select("arquivo_caminho, arquivo_nome")
    .eq("id", documentId)
    .single();
  if (documentError || !document?.arquivo_caminho) {
    return json("Documento não encontrado ou indisponível.", 404);
  }

  // Credencial privilegiada somente no servidor, após autorização pelo JWT.
  const adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: pdf, error: downloadError } = await adminClient.storage
    .from("documentos")
    .download(document.arquivo_caminho);
  if (downloadError || !pdf) {
    console.error("Erro ao obter PDF:", downloadError?.message);
    return json("Arquivo PDF indisponível.", 404);
  }

  // Auditoria executada na identidade do usuário; falhas impedem a entrega.
  const { data: registered, error: auditError } = await userClient.rpc(
    "documentos_registrar_visualizacao",
    { p_documento_id: documentId },
  );
  if (auditError || registered !== true) {
    console.error("Erro ao registrar visualização:", auditError?.message);
    return json("Não foi possível registrar a visualização.", 500);
  }

  const bytes = await pdf.arrayBuffer();
  const safeName = (document.arquivo_nome || "documento.pdf")
    .replace(/[\r\n"\\/]/g, "_")
    .replace(/[^\x20-\x7E]/g, "_")
    .slice(0, 120);
  const filename = safeName.toLowerCase().endsWith(".pdf") ? safeName : `${safeName}.pdf`;

  return new Response(bytes, {
    status: 200,
    headers: {
      ...headers,
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
    },
  });
});
