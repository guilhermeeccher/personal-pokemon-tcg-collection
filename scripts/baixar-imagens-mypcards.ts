/**
 * `pnpm baixar:imagens-mypcards` — baixa, para o nosso volume, a foto das
 * cartas que continuam sem imagem em todas as fontes oficiais.
 *
 * Por que existe: 620 linhas do catálogo não têm foto nem em português
 * nem em inglês, porque a TCGdex não digitalizou 15 sets inteiros —
 * energias, promos e galerias de treinador. Não há fonte oficial para
 * elas. O mypcards tem, e a decisão foi usá-lo como fonte
 * secundária, marcada como tal na tela (selo "MYP").
 *
 * **Baixa, não faz hotlink.** Apontar o `<img>` direto para o CDN deles
 * quebraria quando eles mudassem o caminho, consumiria banda deles a cada
 * página aberta e deixaria a coleção dependente de um terceiro para
 * funcionar. O arquivo vem uma vez para o volume de imagens locais que já
 * existe (`imagens_locais`, no compose.yaml) e depois é servido por nós.
 *
 * Só age em set já mapeado (`set_mypcards`). O número do set é interno
 * deles e entra por link colado na tela — ver `lib/dominio/mypcards.ts`.
 *
 * O download em si (teto de taxa, validação por assinatura, gravação)
 * mora em `lib/download-mypcards.ts`, compartilhado com a rota que a tela
 * chama: duas implementações divergiriam justamente no que importa.
 *
 * Idempotente: a lista de candidatas é recalculada a cada rodada a partir
 * da ausência de foto, então repetir o comando não rebaixa nada.
 *
 * Uso:
 *   docker compose exec -T app pnpm baixar:imagens-mypcards
 *   docker compose exec -T app pnpm baixar:imagens-mypcards --set mee
 *   docker compose exec -T app pnpm baixar:imagens-mypcards --dry-run
 */
import "dotenv/config";

import { client, db } from "../src/lib/db/client";
import { baixarImagensDeSets } from "../src/lib/download-mypcards";
import {
  listarCartasSemFotoDeSetMapeado,
  listarMapeamentos,
  obterMapeamentoSet,
} from "../src/lib/db/mypcards";
import { urlImagemMypcards } from "../src/lib/dominio/mypcards";

interface Opcoes {
  setId?: string;
  dryRun: boolean;
}

function lerOpcoes(argv: string[]): Opcoes {
  const i = argv.indexOf("--set");
  return {
    setId: i !== -1 ? argv[i + 1] : undefined,
    dryRun: argv.includes("--dry-run"),
  };
}

async function principal(): Promise<void> {
  const opcoes = lerOpcoes(process.argv.slice(2));

  const mapeamentos = await listarMapeamentos(db);
  if (mapeamentos.length === 0) {
    console.log(
      "Nenhum set mapeado ainda. Cole o link de uma imagem do set na tela da carta sem foto.",
    );
    return;
  }

  if (opcoes.setId && !(await obterMapeamentoSet(db, opcoes.setId))) {
    console.error(`Set "${opcoes.setId}" não está mapeado no mypcards.`);
    process.exitCode = 1;
    return;
  }

  const numeroPorSet = new Map(mapeamentos.map((m) => [m.setId, m.numero]));
  const cartas = await listarCartasSemFotoDeSetMapeado(db, opcoes.setId);
  const alvo = opcoes.setId ? `o set ${opcoes.setId}` : `${mapeamentos.length} set(s) mapeado(s)`;
  console.log(`${cartas.length} carta(s) sem foto em ${alvo}.`);

  if (opcoes.dryRun) {
    for (const c of cartas.slice(0, 20)) {
      const numero = numeroPorSet.get(c.setId);
      const url =
        numero !== undefined && (c.idioma === "pt" || c.idioma === "en")
          ? urlImagemMypcards({
              numeroSet: numero,
              setId: c.setId,
              localId: c.localId,
              idioma: c.idioma,
            })
          : "(idioma não publicado no mypcards)";
      console.log(`  ${c.setId} ${c.localId} (${c.idioma}) ${c.nome} -> ${url}`);
    }
    if (cartas.length > 20) console.log(`  … e mais ${cartas.length - 20}.`);
    return;
  }

  const resumo = await baixarImagensDeSets(
    db,
    numeroPorSet,
    opcoes.setId,
    (carta, resultado) => {
      if (resultado === "baixada") {
        console.log(`  ok   ${carta.setId} ${carta.localId} (${carta.idioma}) ${carta.nome}`);
      } else if (resultado === "falhou") {
        console.log(`  ERRO ${carta.setId} ${carta.localId} (${carta.idioma}) ${carta.nome}`);
      }
    },
  );

  console.log(
    `\nBaixadas: ${resumo.baixadas} | sem scan lá: ${resumo.ausentes} | falhas: ${resumo.falhas} | puladas: ${resumo.puladas}`,
  );
}

principal()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => client.end());
