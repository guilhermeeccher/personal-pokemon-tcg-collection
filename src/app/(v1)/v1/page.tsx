import { connection } from "next/server";
import { getLocale } from "next-intl/server";

import { exigirSessao } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { lerSecoesDex, listarFormasDex, listarJogosPossuidos, listarRegistrosDex } from "@/lib/db/dex";
import { listarPlanos, listarTrofeus } from "@/lib/db/dex-planejamento";
import { lerTcgInicio } from "@/lib/db/inicio";
import type { IdiomaTrofeu } from "@/lib/dominio/dex-trofeus";
import { resumoDexInicio } from "@/lib/dominio/resumo-inicio";
import type { ResumoDexInicioDTO } from "@/lib/dominio/tipos-cliente";
import { moduloLivingDexAtivo } from "@/lib/modulos";

import { Inicio } from "./inicio";

/**
 * Página inicial (`/`). Desde 2026-10-24 não é mais um menu de seis cartões
 * do TCG: cada módulo tem os três atalhos que o usuário mais usa e um resumo
 * da sua visão geral — o TCG sempre, a Living Dex só com o módulo ligado.
 *
 * - **Os números são os das visões gerais.** O TCG lê pelas mesmas consultas
 *   de `GET /api/inventario/resumo`; a Dex, pelas mesmas leituras da `/dex`,
 *   e o resumo sai de `resumoDexInicio`, que chama as mesmas funções de
 *   domínio da `visao-geral-dex.tsx`. Divergência é bug.
 * - **O cálculo fica no servidor.** A `/dex` manda ao navegador o catálogo
 *   inteiro e todos os registros; esta é a primeira tela no celular, e manda
 *   só os DTOs compactos de `tipos-cliente.ts` (seção "Página inicial").
 * - **`connection()` antes da flag**, como nas telas da Dex: a página lê o
 *   banco e a flag a cada requisição, e o build não tem nem um nem outro.
 * - **O "Quase lá" recebe todas as coleções.** O corte em 4 é só da lista
 *   "Suas coleções", e vem depois. A parte do TCG mora em `lib/db/inicio.ts`
 *   (`lerTcgInicio`) para essa ligação ser testada.
 *
 * Falha de banco derruba a página, como em qualquer outra tela: não há
 * resumo parcial.
 */
export default async function PaginaInicial() {
  await exigirSessao();
  await connection();
  const livingDex = moduloLivingDexAtivo();

  const [tcg, dex] = await Promise.all([lerTcgInicio(db), livingDex ? lerDex() : null]);
  return <Inicio {...tcg} dex={dex} />;
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
