import { connection } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";

import { exigirSessao } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { lerSecoesDex, listarFormasDex, listarJogosPossuidos, listarRegistrosDex } from "@/lib/db/dex";
import { listarPlanos, listarTrofeus } from "@/lib/db/dex-planejamento";
import { lerInicioV2 } from "@/lib/db/inicio-v2";
import type { IdiomaTrofeu } from "@/lib/dominio/dex-trofeus";
import type { InicioV2DTO } from "@/lib/dominio/inicio-v2";
import { resumoDexInicio } from "@/lib/dominio/resumo-inicio";
import type { ResumoDexInicioDTO } from "@/lib/dominio/tipos-cliente";
import { moduloLivingDexAtivo } from "@/lib/modulos";

import { AvisoEmLinha } from "./_componentes/primitivos/painel";
import { Inicio } from "./_inicio/inicio";
import { TentarDeNovo } from "./_inicio/tentar-de-novo";

/**
 * A página inicial da v2 (`/`, pacote 2a). Lê no servidor e entrega à tela só
 * os DTOs compactos: é a primeira tela no celular.
 *
 * - **Os números são os da v1** (`lerTcgInicio`, `resumoDexInicio`), com a
 *   vitrine das joias e as cadastradas nos últimos 7 dias por cima
 *   (`lib/db/inicio-v2.ts`).
 * - **`connection()` antes da flag**, como nas telas da Dex: a página lê o
 *   banco e a flag a cada requisição, e o build não tem nem um nem outro.
 * - **"Agora" é lido aqui**, uma vez por requisição: a janela de 7 dias e o
 *   "hoje" do bloco saem do mesmo instante.
 * - **Uma leitura que falha não vira página vazia**, que diria "nenhuma carta"
 *   a quem tem milhares: vira erro na tela, com "Tentar de novo".
 */
export default async function PaginaInicial() {
  await exigirSessao();
  await connection();
  const livingDex = moduloLivingDexAtivo();

  let dados: InicioV2DTO;
  try {
    const [tcg, dex] = await Promise.all([lerInicioV2(db, new Date()), livingDex ? lerDex() : null]);
    dados = { ...tcg, dex };
  } catch (erro) {
    console.error("início: falha ao ler", erro);
    const t = await getTranslations("v2Inicio");
    return (
      <AvisoEmLinha tom="perigo" papel="alert" titulo={t("erroCarregar")} acao={<TentarDeNovo />}>
        {t("erroCarregarTexto")}
      </AvisoEmLinha>
    );
  }

  return <Inicio dados={dados} />;
}

async function lerDex(): Promise<ResumoDexInicioDTO> {
  const [formas, secoes, registros, jogos, trofeus, planos, idioma] = await Promise.all([
    listarFormasDex(db),
    lerSecoesDex(db),
    listarRegistrosDex(db),
    listarJogosPossuidos(db),
    listarTrofeus(db),
    listarPlanos(db),
    getLocale(),
  ]);
  return resumoDexInicio({ formas, secoes, registros, jogos, trofeus, planos, idioma: idioma as IdiomaTrofeu });
}
