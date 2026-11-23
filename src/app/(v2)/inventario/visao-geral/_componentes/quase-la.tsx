import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { rotuloChaveVaga } from "@/lib/dominio/chave-vaga-set";
import type { ResumoInventario } from "@/lib/db/resumo-inventario";
import { percentualSemFechar } from "@/lib/dominio/visao-geral-v2";
import { urlImagemCarta, urlSpritePokemon } from "@/lib/imagens";

import { ImagemEscada } from "../../../colecoes/_componentes/imagem-escada";

import { BarraDeProgresso, rotuloDaDivisao } from "./capa-colecao";
import estilos from "./visao-geral.module.css";

/**
 * "Quase lá": as divisões mais perto de fechar, com as primeiras cartas que
 * faltam, apagadas como a vaga vazia da grade. É a lista de compras virando
 * meta (regra 6: a vaga vazia é saída de primeira classe). Cada linha leva à
 * coleção. O percentual nunca arredonda até fechar (`percentualSemFechar`):
 * "100%" com "faltam 1" não existe.
 */
export async function QuaseLa({ itens }: { itens: ResumoInventario["quaseLa"] }) {
  const t = await getTranslations("v2VisaoGeral.quaseLa");
  const rotulos = await Promise.all(itens.map((q) => rotuloDaDivisao(q.divisao)));

  return (
    <section className={estilos.secao} aria-labelledby="vg-quase-la">
      <div>
        <h2 id="vg-quase-la" className={estilos.tituloSecao}>
          {t("titulo")}
        </h2>
        <p className={estilos.textoSecao}>{t("descricao")}</p>
      </div>
      <ul className={`v2-painel ${estilos.listaQuaseLa}`}>
        {itens.map((q, i) => (
          <li key={`${q.colecaoId}|${q.divisao.id}`}>
            <Link href={`/colecoes/${q.colecaoId}`} className={estilos.linhaQuaseLa}>
              <div className={estilos.quaseLaTexto}>
                <div className={estilos.divisaoLinha}>
                  <span className={estilos.divisaoNome}>
                    <b>{rotulos[i]}</b> <span className={estilos.colecaoDaDivisao}>· {q.colecaoNome}</span>
                  </span>
                  <span className={`${estilos.divisaoNumeros} v2-num`}>
                    {percentualSemFechar(q.divisao.preenchidas, q.divisao.total)}%
                  </span>
                </div>
                <BarraDeProgresso preenchidas={q.divisao.preenchidas} total={q.divisao.total} completa={false} />
                <span className={estilos.faltam}>{t("faltam", { total: q.faltam })}</span>
              </div>
              <ul className={estilos.faltantes} aria-hidden>
                {q.faltantes.map((f) => {
                  // Pokédex não tem "a carta esperada" (regra 3): é o sprite da espécie.
                  const url = q.tipo === "pokedex" ? urlSpritePokemon(f.chave) : urlImagemCarta(f.imagemUrl, "low");
                  return (
                    <li key={f.chave} className={q.tipo === "pokedex" ? estilos.faltanteSprite : estilos.faltanteCarta}>
                      {url ? (
                        <ImagemEscada fontes={[url]} fallback={<span>{rotuloChaveVaga(f.chave)}</span>} />
                      ) : (
                        <span>{rotuloChaveVaga(f.chave)}</span>
                      )}
                    </li>
                  );
                })}
                {q.faltam > q.faltantes.length && (
                  <li className={`${estilos.maisFaltantes} v2-num`}>+{q.faltam - q.faltantes.length}</li>
                )}
              </ul>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
