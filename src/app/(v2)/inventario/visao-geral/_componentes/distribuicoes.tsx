import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

import { classificarRaridade } from "@/lib/dominio/raridade-visual";
import type { ResumoInventario } from "@/lib/db/resumo-inventario";
import { type FiltroInventario, fatiaDaDistribuicao, hrefInventario } from "@/lib/dominio/visao-geral-v2";

import { rotuloDaRaridade } from "./rotulos";
import estilos from "./visao-geral.module.css";

interface Linha {
  chave: string;
  rotulo: string;
  unidades: number;
  /** `null`: a linha não leva a lugar nenhum (a "sem raridade" não é um filtro do inventário). */
  href: string | null;
  /** A cor da barra, só para as raridades (a classe visual de `raridade-visual.ts`). */
  classe?: string;
}

/**
 * "Estatísticas": as cinco distribuições do inventário, cada linha um link
 * para `/inventario` com a **mesma querystring** que a tela de inventário lê
 * (`hrefInventario`; nenhum filtro novo). A linha escreve a contagem e a fatia
 * em texto — a barra só reforça. O idioma é o **físico** da cópia (regra 7).
 */
export async function Distribuicoes({ resumo }: { resumo: ResumoInventario }) {
  const t = await getTranslations("v2VisaoGeral.estatisticas");
  const tCom = await getTranslations("componentes");
  const tRaridades = await getTranslations("raridadesCarta");
  const { distribuicoes: d, totais } = resumo;
  const link = (chave: FiltroInventario, valor: string) => hrefInventario({ chave, valor });

  const grupos: { id: string; titulo: string; linhas: Linha[] }[] = [
    {
      id: "expansao",
      titulo: t("porExpansao"),
      linhas: d.porExpansao.map((i) => ({
        chave: i.setId,
        rotulo: i.setNome,
        unidades: i.unidades,
        href: link("set", i.setId),
      })),
    },
    {
      id: "raridade",
      titulo: t("porRaridade"),
      linhas: d.porRaridade.map((i) => ({
        chave: i.raridade ?? "sem-raridade",
        rotulo: rotuloDaRaridade(tRaridades, tCom("semRaridade"), i.raridade),
        unidades: i.unidades,
        href: i.raridade ? link("raridade", i.raridade) : null,
        classe: classificarRaridade(i.raridade),
      })),
    },
    {
      id: "idioma",
      titulo: t("porIdioma"),
      linhas: d.porIdioma.map((i) => ({
        chave: i.idioma,
        rotulo: i.idioma,
        unidades: i.unidades,
        href: link("idioma", i.idioma),
      })),
    },
    {
      id: "condicao",
      titulo: t("porCondicao"),
      linhas: d.porCondicao.map((i) => ({
        chave: i.condicao,
        rotulo: i.condicao,
        unidades: i.unidades,
        href: link("condicao", i.condicao),
      })),
    },
    {
      id: "variante",
      titulo: t("porVariante"),
      linhas: d.porVariante.map((i) => ({
        chave: i.variante,
        rotulo: tCom.has(`variante.${i.variante}`) ? tCom(`variante.${i.variante}`) : i.variante,
        unidades: i.unidades,
        href: link("variante", i.variante),
      })),
    },
  ];

  const formato = await getFormatter();

  return (
    <section className={estilos.secao} aria-labelledby="vg-estatisticas">
      <div>
        <h2 id="vg-estatisticas" className={estilos.tituloSecao}>
          {t("titulo")}
        </h2>
        <p className={estilos.textoSecao}>{t("descricao")}</p>
      </div>
      <div className={estilos.distribuicoes}>
        {grupos.map((g) => (
          <section key={g.id} className={`v2-painel ${estilos.grupo}`} aria-labelledby={`vg-dist-${g.id}`}>
            <h3 id={`vg-dist-${g.id}`} className={estilos.tituloGrupo}>
              {g.titulo}
            </h3>
            {g.linhas.length === 0 ? (
              <p className={estilos.vazioGrupo}>{t("nenhumaCopia")}</p>
            ) : (
              <ul className={estilos.linhas}>
                {g.linhas.map((l) => {
                  const fatia = fatiaDaDistribuicao(l.unidades, totais.totalUnidades);
                  const conteudo = (
                    <>
                      <span className={estilos.linhaTopo}>
                        <span className={estilos.linhaRotulo}>{l.rotulo}</span>
                        <span className={`${estilos.linhaNumeros} v2-num`}>
                          {formato.number(l.unidades)} · {formato.number(fatia, { style: "percent", maximumFractionDigits: 1 })}
                        </span>
                      </span>
                      <span className={estilos.barra} aria-hidden>
                        <span
                          className={[estilos.barraPreenchida, l.classe ? estilos[`raridade_${l.classe}`] : null]
                            .filter(Boolean)
                            .join(" ")}
                          style={{ width: `${fatia * 100}%` }}
                        />
                      </span>
                    </>
                  );
                  return (
                    <li key={l.chave}>
                      {l.href ? (
                        <Link href={l.href} className={estilos.linha} aria-label={t("abrirFiltrado", { rotulo: l.rotulo })}>
                          {conteudo}
                        </Link>
                      ) : (
                        <div className={estilos.linha}>{conteudo}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
        <Link href="/inventario/repetidas" className={`v2-painel ${estilos.grupo} ${estilos.painelLink}`}>
          <h3 className={estilos.tituloGrupo}>{t("repetidas")}</h3>
          <p className={estilos.textoSecao}>{t("repetidasDescricao")}</p>
        </Link>
      </div>
    </section>
  );
}
