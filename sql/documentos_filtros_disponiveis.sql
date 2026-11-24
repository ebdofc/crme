-- Executar no SQL Editor do Supabase após o deploy do frontend.
-- Retorna apenas destinatários de documentos que o militar autenticado pode ler.
CREATE OR REPLACE FUNCTION public.documentos_filtros_disponiveis()
RETURNS TABLE(documento_id uuid, tipo text, codigo text, nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH visiveis AS (
    SELECT d.id, d.visibilidade, d.patente_modo, d.patente_alvos
    FROM public.documentos d
    WHERE auth.uid() IS NOT NULL
      AND public.crme_militar_id() IS NOT NULL
      AND public.documentos_pode_ler(d.id)
      AND d.visibilidade IN ('restrito', 'patentes')
  ),
  setores AS (
    SELECT v.id AS documento_id,
           'setor'::text AS tipo,
           dp.codigo::text AS codigo,
           COALESCE(
             (SELECT s.nome FROM public.documentos_setores_disponiveis() s
              WHERE s.codigo = dp.codigo LIMIT 1),
             dp.codigo
           )::text AS nome
    FROM visiveis v
    JOIN public.documentos_permissoes dp ON dp.documento_id = v.id
    WHERE v.visibilidade = 'restrito' AND dp.tipo = 'estrutura'
  ),
  patentes AS (
    SELECT v.id AS documento_id,
           'patente'::text AS tipo,
           CASE WHEN v.patente_modo = 'todos' THEN 'todos'
                ELSE COALESCE(alvo.nome, 'todos') END::text AS codigo,
           CASE WHEN v.patente_modo = 'todos' THEN 'Todos os oficiais'
                WHEN v.patente_modo = 'grupo' THEN 'Grupo: ' || alvo.nome
                ELSE 'Patente: ' || alvo.nome END::text AS nome
    FROM visiveis v
    LEFT JOIN LATERAL unnest(
      CASE WHEN v.patente_modo = 'todos'
           THEN ARRAY['todos']::text[]
           ELSE COALESCE(v.patente_alvos, ARRAY[]::text[]) END
    ) AS alvo(nome) ON TRUE
    WHERE v.visibilidade = 'patentes'
  )
  SELECT * FROM setores
  UNION ALL
  SELECT * FROM patentes;
$$;

REVOKE ALL ON FUNCTION public.documentos_filtros_disponiveis() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.documentos_filtros_disponiveis() TO authenticated;
