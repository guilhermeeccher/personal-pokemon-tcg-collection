import type { Metadata, Viewport } from "next";
import { getTranslations } from "next-intl/server";

import { moduloAcessoLigado } from "@/lib/dominio/acesso/configuracao";
import { SCRIPT_BFCACHE, metadadosPwa, viewportPwa } from "@/lib/pwa/cabeca";

/**
 * A cabeça comum aos dois layouts raiz (v1 e v2). Mora em `_comum/`, e não em
 * `_componentes/`, porque `_componentes/` é a pele da v1: a v2 não importa de
 * lá (`telas-v1.test.ts`). O que é decisão — o que o PWA põe e quando — está
 * em `lib/pwa/cabeca.ts`, puro e testado; aqui só se lê a flag e o idioma da
 * requisição.
 *
 * A flag é lida a cada requisição, como em todo o módulo de acesso: a imagem é
 * construída sem o `.env`.
 */
export async function metadadosDoApp(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: t("titulo"),
    description: t("descricao"),
    ...metadadosPwa(moduloAcessoLigado(process.env)),
  };
}

export function viewportDoApp(): Viewport {
  return viewportPwa(moduloAcessoLigado(process.env));
}

/* Só renderizado com o módulo ligado (quem chama decide): desligado, nenhum
   script, e o HTML fica o de antes do módulo. */
export function ScriptBfcache() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT_BFCACHE }} />;
}
