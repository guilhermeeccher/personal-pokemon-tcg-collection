-- Coleção de set passa a ter RECEITA (vários sets) e vaga com chave
-- qualificada pelo set (`set/local_id`, `lib/dominio/chave-vaga-set.ts`).
-- 2026-09-30: juntar sets numa coleção e incluir/excluir carta avulsa.
--
-- Idempotente: cada UPDATE só toca o que ainda está no formato antigo, então
-- rodar de novo não faz nada. Nada é apagado — só reescrito.

-- 1. Parâmetro: `setId` (um set) vira `sets: [setId]`.
UPDATE colecao
SET parametro = (parametro - 'setId') || jsonb_build_object('sets', jsonb_build_array(parametro -> 'setId'))
WHERE tipo = 'set' AND parametro ? 'setId';
--> statement-breakpoint

-- 2. Vagas das coleções de set: `001` vira `<set>/001`. Toda coleção de set
-- anterior a esta migração tem um set só na receita, que é o da vaga.
UPDATE vaga v
SET chave = (c.parametro -> 'sets' ->> 0) || '/' || v.chave
FROM colecao c
WHERE c.id = v.colecao_id AND c.tipo = 'set' AND position('/' in v.chave) = 0;
--> statement-breakpoint

-- 3. A triagem de compra identifica a vaga pela mesma chave.
UPDATE escolha_compra e
SET chave = (c.parametro -> 'sets' ->> 0) || '/' || e.chave
FROM colecao c
WHERE c.id = e.colecao_id AND c.tipo = 'set' AND position('/' in e.chave) = 0;
--> statement-breakpoint

-- 4. As opções das varreduras da Liga também.
UPDATE liga_opcao o
SET chave = (c.parametro -> 'sets' ->> 0) || '/' || o.chave
FROM liga_varredura lv
JOIN colecao c ON c.id = lv.colecao_id
WHERE lv.id = o.varredura_id AND c.tipo = 'set' AND position('/' in o.chave) = 0;
