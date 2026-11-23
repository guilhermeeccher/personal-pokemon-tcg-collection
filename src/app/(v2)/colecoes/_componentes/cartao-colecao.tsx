import { Layers } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { progressoDaColecao, type ColecaoListaV2DTO } from "@/lib/dominio/lista-colecoes-v2";

import { AnelProgresso, ContagemEmCirculo } from "./anel-progresso";
import estilos from "./colecoes.module.css";
import { ImagemEscada } from "../../_componentes/primitivos/imagem-escada";
import { rotuloDoTema } from "./rotulo-tema";

/**
 * O cartão de uma coleção: capa, nome, o que ela é, o anel de progresso e, no
 * rodapé, "faltam N" com as primeiras vagas vazias como silhueta. O cartão
 * inteiro é um link só para `/colecoes/<id>` — um alvo de toque grande, e sem
 * botão dentro de link. As ações de organizar (mover, agrupar) são do pacote
 * 4b e, até lá, vivem na v1.
 *
 * - **A capa é a carta mais vistosa já alocada**; sem nenhuma, o logo do set;
 *   sem nenhum, um ícone. Capa e logo vêm em `low.webp`.
 * - **A silhueta na Pokédex é a espécie, nunca uma carta** (regra 3): a vaga
 *   não sabe qual carta vai entrar nela. Em set, a carta esperada, apagada.
 * - **"Customizada" não tem denominador** (só o que foi alocado): sem anel e
 *   sem "faltam".
 */
export async function CartaoColecao({ colecao }: { colecao: ColecaoListaV2DTO }) {
  const t = await getTranslations("v2Colecoes");
  const tTema = await getTranslations("temaColecao");
  const tTipos = await getTranslations("tiposPokemon");
  const tRaridades = await getTranslations("raridadesCarta");

  const progresso = progressoDaColecao(colecao);
  const tipo = t.has(`tipo.${colecao.tipo}`) ? t(`tipo.${colecao.tipo}`) : colecao.tipo;
  const partesDoSub = [
    tipo,
    colecao.tema
      ? t("temaDaColecao", {
          tema: rotuloDoTema(colecao.tema, { tTema, tTipos, tRaridades }),
        })
      : null,
    colecao.idiomaExigido ? t("idiomaExigido", { idioma: colecao.idiomaExigido }) : null,
  ].filter((p): p is string => p !== null);

  return (
    <Link
      href={`/colecoes/${colecao.id}`}
      className={["v2-painel", estilos.cartao, progresso.tipo === "anel" && progresso.completa ? estilos.completa : null]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={estilos.capa} aria-hidden>
        {colecao.capa ? (
          <ImagemEscada fontes={[colecao.capa.url]} className={estilos.capaImg} fallback={<CapaDeLogo logos={colecao.logos} />} />
        ) : (
          <CapaDeLogo logos={colecao.logos} />
        )}
      </div>

      <div className={estilos.corpo}>
        <h3 className={estilos.nome}>{colecao.nome}</h3>
        <p className={estilos.sub}>{partesDoSub.join(" · ")}</p>
        {(colecao.avisoCatalogoIncompleto || colecao.avisoSemNumeracaoOficial) && (
          <div className={estilos.chips}>
            {colecao.avisoCatalogoIncompleto && <span className={estilos.chip}>{t("catalogoIncompleto")}</span>}
            {colecao.avisoSemNumeracaoOficial && <span className={estilos.chip}>{t("semNumeracaoOficial")}</span>}
          </div>
        )}
      </div>

      {progresso.tipo === "anel" && <AnelProgresso percentual={progresso.percentual} completo={progresso.completa} />}
      {progresso.tipo === "contagem" && <ContagemEmCirculo quantas={progresso.quantas} />}

      <div className={estilos.rodape}>
        {progresso.tipo === "anel" &&
          (progresso.completa ? (
            <span className={estilos.fechada}>{t("completa")}</span>
          ) : (
            <span className={estilos.faltam}>{t("faltam", { total: progresso.faltam })}</span>
          ))}
        {progresso.tipo === "contagem" && (
          <span className={estilos.neutra}>{t("cartas", { total: progresso.quantas })}</span>
        )}
        {progresso.tipo === "semVagas" && <span className={estilos.neutra}>{t("semVagas")}</span>}

        {colecao.miniaturas.length > 0 && (
          <ul className={estilos.sombras} aria-hidden>
            {colecao.miniaturas.map((m) => (
              <li key={m.rotulo} className={estilos.sombra}>
                {m.url ? (
                  <ImagemEscada
                    fontes={[m.url]}
                    className={m.silhueta ? estilos.sombraSprite : estilos.sombraCarta}
                    fallback={<span>{m.rotulo}</span>}
                  />
                ) : (
                  <span>{m.rotulo}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Link>
  );
}

function CapaDeLogo({ logos }: { logos: readonly string[] }) {
  return (
    <ImagemEscada
      fontes={logos}
      className={estilos.capaLogo}
      fallback={
        <span className={estilos.capaVazia}>
          <Layers />
        </span>
      }
    />
  );
}
