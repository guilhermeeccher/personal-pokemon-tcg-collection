-- Desfaz a camada 2 (ofertas por loja), que viveu algumas horas em 2026-09-16.
--
-- Decisão dele no mesmo dia: a organização por loja é da LigaPokemon, não
-- nossa. A "Otimizar minha Lista de Compras" deles roda sobre o marketplace
-- inteiro e com preço real; nós víamos uma fatia e nem preço por loja
-- tínhamos. Dividir a lista por variante ainda piorava o frete, porque duas
-- listas viram duas otimizações independentes lá.
--
-- O que estas tabelas guardavam era CACHE DE TERCEIRO, não dado dele: ofertas
-- de marketplace colhidas hoje, sem valor nenhum depois que o código que as lê
-- deixa de existir. Nada de `copia`, `colecao`, `vaga` ou `carta_catalogo` é
-- tocado aqui, e as duas colunas removidas de `liga_opcao` nasceram hoje, na
-- mesma frente.

DROP TABLE "liga_coleta" CASCADE;--> statement-breakpoint
DROP TABLE "liga_loja" CASCADE;--> statement-breakpoint
DROP TABLE "liga_oferta" CASCADE;--> statement-breakpoint
ALTER TABLE "liga_opcao" DROP COLUMN "ofertas_consultadas_em";--> statement-breakpoint
ALTER TABLE "liga_opcao" DROP COLUMN "ofertas_encontradas";