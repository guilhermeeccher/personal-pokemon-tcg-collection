import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";

import { exigirSessao } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { listarFormasDex, listarJogosPossuidos } from "@/lib/db/dex";
import { listarPlanos, listarTrofeus } from "@/lib/db/dex-planejamento";
import { moduloLivingDexAtivo } from "@/lib/modulos";

import { AvisoEmLinha } from "../../_componentes/primitivos/painel";
import { TentarDeNovo } from "../_componentes/tentar-de-novo";

import { PainelPlanos } from "./_componentes/painel-planos";

/**
 * `/dex/planos` na v2 (pacote 5e-b): os planos ativos com as tarefas e as
 * etapas, e o histórico. As leituras são as da página da v1, as mesmas
 * funções, no servidor.
 *
 * A guarda do módulo vem antes de tudo (`rules.md`, "Dex shared code", A):
 * desligado, 404 direto, sem tocar no banco. `connection()` antes da flag,
 * para o build não congelar o valor dela. Uma leitura que falha vira erro na
 * tela, com "Tentar de novo", nunca "nenhum plano".
 */
export default async function PaginaPlanos() {
  await exigirSessao();
  await connection();
  if (!moduloLivingDexAtivo()) notFound();

  let lido;
  try {
    lido = await Promise.all([listarPlanos(db), listarTrofeus(db), listarJogosPossuidos(db), listarFormasDex(db)]);
  } catch (erro) {
    console.error("planos da Dex: falha ao ler", erro);
    const t = await getTranslations("v2Dex");
    return (
      <AvisoEmLinha
        tom="perigo"
        papel="alert"
        titulo={t("erroCarregar")}
        acao={<TentarDeNovo rotulo={t("tentarDeNovo")} />}
      >
        {t("erroCarregarTexto")}
      </AvisoEmLinha>
    );
  }

  const [planos, trofeus, jogos, formas] = lido;
  // Só as vagas que alguma tarefa mira: o catálogo inteiro não precisa ir ao navegador.
  const usadas = new Set(planos.flatMap((p) => p.tarefas.flatMap((t) => t.formaIds)));
  return (
    <PainelPlanos
      planos={planos}
      trofeus={trofeus.map((t) => ({ id: t.id, jogoId: t.jogoId, textos: t.textos }))}
      jogos={jogos}
      formas={formas.filter((f) => usadas.has(f.id))}
    />
  );
}
