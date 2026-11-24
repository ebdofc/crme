-- Execute uma única vez no SQL Editor do Supabase.
-- A ordem é compartilhada por todos os leitores, mas só pode ser modificada
-- por quem gerencia TODOS os documentos da seção/filtro selecionado.
CREATE TABLE IF NOT EXISTS public.documentos_ordem (
  documento_id uuid PRIMARY KEY REFERENCES public.documentos(id) ON DELETE CASCADE,
  posicao bigint NOT NULL CHECK (posicao > 0)
);
ALTER TABLE public.documentos_ordem ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS documentos_ordem_leitura ON public.documentos_ordem;
CREATE POLICY documentos_ordem_leitura ON public.documentos_ordem
  FOR SELECT TO authenticated
  USING (public.documentos_pode_ler(documento_id));
REVOKE ALL ON public.documentos_ordem FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.documentos_ordem TO authenticated;

CREATE OR REPLACE FUNCTION public.documentos_reordenar(
  p_secao text, p_filtro text, p_documentos uuid[]
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_visibilidade text;
  v_atuais uuid[];
  v_todos uuid[];
  v_novos uuid[];
  v_id uuid;
  v_i integer;
  v_j integer := 1;
BEGIN
  IF auth.uid() IS NULL OR public.crme_militar_id() IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária.';
  END IF;
  v_visibilidade := CASE p_secao
    WHEN 'oficiais' THEN 'geral'
    WHEN 'setoriais' THEN 'restrito'
    WHEN 'patentes' THEN 'patentes'
    ELSE NULL END;
  IF v_visibilidade IS NULL THEN RAISE EXCEPTION 'Seção inválida.'; END IF;
  IF p_filtro IS NOT NULL AND p_filtro <> '' AND
     (p_secao = 'oficiais' OR split_part(p_filtro, ':', 1) NOT IN ('setor', 'patente')) THEN
    RAISE EXCEPTION 'Filtro inválido.';
  END IF;
  -- Serializa alterações de ordem por seção.
  PERFORM pg_advisory_xact_lock(hashtext('crme_documentos_ordem:' || v_visibilidade));
  SELECT COALESCE(array_agg(d.id ORDER BY COALESCE(o.posicao, 9223372036854775807), d.criado_em, d.id), ARRAY[]::uuid[])
    INTO v_todos
  FROM public.documentos d
  LEFT JOIN public.documentos_ordem o ON o.documento_id = d.id
  WHERE d.visibilidade = v_visibilidade;
  SELECT COALESCE(array_agg(d.id ORDER BY COALESCE(o.posicao, 9223372036854775807), d.criado_em, d.id), ARRAY[]::uuid[])
    INTO v_atuais
  FROM public.documentos d
  LEFT JOIN public.documentos_ordem o ON o.documento_id = d.id
  WHERE d.visibilidade = v_visibilidade
    AND public.documentos_pode_ler(d.id)
    AND (NULLIF(p_filtro, '') IS NULL OR EXISTS (
      SELECT 1 FROM public.documentos_filtros_disponiveis() f
      WHERE f.documento_id = d.id AND f.tipo || ':' || f.codigo = p_filtro
    ));
  IF cardinality(v_atuais) < 2 THEN
    RAISE EXCEPTION 'Não há documentos suficientes para organizar.';
  END IF;
  IF cardinality(p_documentos) <> cardinality(v_atuais)
     OR (SELECT array_agg(x ORDER BY x) FROM unnest(p_documentos) x)
        IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(v_atuais) x)
  THEN RAISE EXCEPTION 'A lista mudou. Atualize a página e tente novamente.'; END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_atuais) x
    WHERE NOT public.documentos_pode_gerenciar(x)
  ) THEN RAISE EXCEPTION 'Sem permissão para organizar todos os documentos desta seleção.'; END IF;
  -- Substitui somente as posições dos documentos filtrados.
  v_novos := v_todos;
  FOR v_i IN 1..cardinality(v_todos) LOOP
    v_id := v_todos[v_i];
    IF v_id = ANY(v_atuais) THEN
      v_novos[v_i] := p_documentos[v_j];
      v_j := v_j + 1;
    END IF;
  END LOOP;
  INSERT INTO public.documentos_ordem(documento_id, posicao)
  SELECT x.id, x.ord
  FROM unnest(v_novos) WITH ORDINALITY AS x(id, ord)
  ON CONFLICT (documento_id) DO UPDATE SET posicao = EXCLUDED.posicao;
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.documentos_reordenar(text,text,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.documentos_reordenar(text,text,uuid[]) TO authenticated;
