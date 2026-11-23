import { getFormatter, getTranslations } from "next-intl/server";

import { fonteDePreco } from "@/lib/dominio/fonte-preco";
import type { ResumoInventario } from "@/lib/db/resumo-inventario";
import { hrefInventario, precoDaJoia } from "@/lib/dominio/visao-geral-v2";
import type { OrigemPrecoCardmarket } from "@/lib/dominio/visao-geral-v2";

import { BotaoLink } from "../../../_componentes/primitivos/botao";
import { Painel } from "../../../_componentes/primitivos/painel";

import { CapaColecao } from "./capa-colecao";
import { Distribuicoes } from "./distribuicoes";
import { Joias, type JoiaDaTela } from "./joias";
import { QuaseLa } from "./quase-la";
import { rotuloDaRaridade } from "./rotulos";
import estilos from "./visao-geral.module.css";
import Link from "next/link";

/**
 * `/inventario/visao-geral`: o inventário como vitrine, não como relatório. De
 * cima para baixo: as quatro contagens (cada uma leva ao inventário), as
 * joias, as coleções como capas de fichário, "Quase lá" e, no fim, as
 * distribuições. Tudo vem pronto de `lerResumoInventario` — a mesma leitura de
 * `GET /api/inventario/resumo` —, e esta tela só desenha.
 *
 * Só lê, só navega: nenhuma escrita acontece aqui. O detalhe que as joias
 * abrem é o do pacote 1b, em modo cópia, e é ele que escreve.
 */
export async function VisaoGeral({
  resumo,
  copiaPorCarta,
  origemCardmarket,
}: {
  resumo: ResumoInventario;
  copiaPorCarta: ReadonlyMap<string, string>;
  origemCardmarket: ReadonlyMap<string, OrigemPrecoCardmarket>;
}) {
  const t = await getTranslations("v2VisaoGeral");
  const tRaridades = await getTranslations("raridadesCarta");
  const tCom = await getTranslations("componentes");
  const formato = await getFormatter();
  const fonte = fonteDePreco();
  const { totais } = resumo;
  const semCartas = totais.totalUnidades === 0;

  const contagens = [
    { id: "distintas", rotulo: t("totais.cartasDistintas"), valor: totais.cartasDistintas, href: hrefInventario() },
    { id: "unidades", rotulo: t("totais.unidadesTotais"), valor: totais.totalUnidades, href: hrefInventario() },
    {
      id: "alocadas",
      rotulo: t("totais.alocadas"),
      valor: totais.unidadesAlocadas,
      href: hrefInventario({ chave: "alocacao", valor: "alocada" }),
    },
    {
      id: "livres",
      rotulo: t("totais.livres"),
      valor: totais.unidadesLivres,
      href: hrefInventario({ chave: "alocacao", valor: "livre" }),
    },
  ];

  const joias: JoiaDaTela[] = resumo.joias.map((j) => ({
    cartaId: j.cartaId,
    copiaId: copiaPorCarta.get(j.cartaId) ?? null,
    nome: j.nome,
    setNome: j.setNome,
    localId: j.localId,
    raridade: rotuloDaRaridade(tRaridades, tCom("semRaridade"), j.raridade),
    raridadeCrua: j.raridade,
    imagemUrl: j.imagemUrl,
    preco: precoDaJoia(fonte, j.preco, origemCardmarket.get(j.cartaId)),
  }));

  return (
    <div className={estilos.pagina}>
      <header className={estilos.cabecalho}>
        <div>
          <h1 className={estilos.titulo}>{t("titulo")}</h1>
          <p className={estilos.subtitulo}>{t("subtitulo")}</p>
        </div>
        <div className={estilos.acoes}>
          <BotaoLink href={hrefInventario()} variante="primario">
            {t("abrirInventario")}
          </BotaoLink>
          <BotaoLink href="/inventario/repetidas">{t("verRepetidas")}</BotaoLink>
        </div>
      </header>

      <ul className={estilos.contagens}>
        {contagens.map((c) => (
          <li key={c.id}>
            <Link href={c.href} className={`v2-painel ${estilos.contagem}`}>
              <span className={`${estilos.contagemValor} v2-num`}>{formato.number(c.valor)}</span>
              <span className={estilos.contagemRotulo}>{c.rotulo}</span>
            </Link>
          </li>
        ))}
      </ul>

      {semCartas && (
        <Painel className={estilos.estado}>
          <h2 className={estilos.estadoTitulo}>{t("vazio.titulo")}</h2>
          <p className={estilos.estadoTexto}>{t("vazio.texto")}</p>
          <div className={estilos.acoes}>
            <BotaoLink href="/cadastro/set" variante="primario">
              {t("vazio.porSet")}
            </BotaoLink>
            <BotaoLink href="/cadastro/busca">{t("vazio.porBusca")}</BotaoLink>
          </div>
        </Painel>
      )}

      {joias.length > 0 && <Joias joias={joias} fonte={fonte} />}

      <section className={estilos.secao} aria-labelledby="vg-colecoes">
        <div className={estilos.cabecaLinha}>
          <h2 id="vg-colecoes" className={estilos.tituloSecao}>
            {t("colecoes.titulo")}
          </h2>
          <Link href="/colecoes" className={estilos.linkSecao}>
            {t("colecoes.verTodas")}
          </Link>
        </div>
        {resumo.colecoes.length === 0 ? (
          <Painel className={estilos.estado}>
            <p className={estilos.estadoTexto}>{t("colecoes.nenhuma")}</p>
            <div className={estilos.acoes}>
              <BotaoLink href="/colecoes/nova" variante="primario">
                {t("colecoes.criar")}
              </BotaoLink>
            </div>
          </Painel>
        ) : (
          <ul className={estilos.capas}>
            {resumo.colecoes.map((c) => (
              <li key={c.id}>
                <CapaColecao colecao={c} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {resumo.quaseLa.length > 0 && <QuaseLa itens={resumo.quaseLa} />}

      {/* Sem nenhuma cópia, cinco painéis "nenhuma cópia" seriam ruído: o estado vazio acima já diz o que fazer. */}
      {!semCartas && <Distribuicoes resumo={resumo} />}
    </div>
  );
}
