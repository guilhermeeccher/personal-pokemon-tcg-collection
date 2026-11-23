"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { urlSpritePokemon } from "@/lib/imagens";

import { Carta } from "../../../_componentes/carta/carta";
import { Botao, BotaoLink } from "../../../_componentes/primitivos/botao";
import { AvisoEmLinha } from "../../../_componentes/primitivos/painel";
import { Segmentado } from "../../../_componentes/primitivos/segmentado";

import { type ColecaoFaltaGeral, type GrupoNaTela, type VagaFaltaGeral, montarFaltaGeral } from "./falta-geral";
import estilos from "./falta-geral.module.css";

/** Quantas vagas cada coleção mostra de cara, e quantas cada "mostrar mais" soma. */
const VAGAS_DE_CARA = 24;
const VAGAS_POR_VEZ = 60;

/**
 * `/colecoes/falta`: toda vaga vazia de toda coleção Pokédex e de set, por
 * coleção, com o que já dá para alocar marcado (regra 6: a vaga vazia é a
 * razão de ser do sistema). Só leitura — alocar e marcar compra são na
 * coleção, que cada painel abre já na aba "O que falta".
 *
 * Uma Pokédex nacional tem até mil vagas: cada coleção mostra as primeiras e
 * cresce por "mostrar mais", para a tela não montar milhares de imagens de
 * uma vez (o orçamento da regra 13 de `rules.md`). As imagens entram
 * preguiçosas, `low.webp` no set e o sprite da espécie na Pokédex (regra 3).
 */
export function FaltaGeral({ colecoes }: { colecoes: readonly ColecaoFaltaGeral[] }) {
  const t = useTranslations("v2Falta.geral");
  const [soAlocaveis, setSoAlocaveis] = useState(false);
  const { totalVagas, totalAlocaveis, grupos } = montarFaltaGeral(colecoes, soAlocaveis);

  return (
    <div className={estilos.pagina}>
      <Link href="/colecoes" className={estilos.voltar}>
        <ArrowLeft aria-hidden />
        {t("voltar")}
      </Link>
      <header className={estilos.cabecalho}>
        <h1 className={estilos.titulo}>{t("titulo")}</h1>
        <p className={estilos.subtitulo}>
          {colecoes.length === 0 ? t("nadaFalta") : t("resumo", { vagas: totalVagas, colecoes: colecoes.length })}
        </p>
      </header>

      {/* Só aparece quando há alguma: filtro que sempre dá zero é ruído fixo. */}
      {totalAlocaveis > 0 ? (
        <Segmentado
          rotulo={t("filtro")}
          opcoes={[
            { valor: "todas", rotulo: t("todas") },
            { valor: "alocaveis", rotulo: t("soAlocaveis", { total: totalAlocaveis }) },
          ]}
          valor={soAlocaveis ? "alocaveis" : "todas"}
          aoMudar={(v) => setSoAlocaveis(v === "alocaveis")}
        />
      ) : null}

      {colecoes.length === 0 ? (
        <AvisoEmLinha tom="sucesso" titulo={t("nadaTitulo")}>
          {t("nadaFalta")}
        </AvisoEmLinha>
      ) : null}

      {grupos.map((g) => (
        <PainelColecao key={g.colecao.id} grupo={g} />
      ))}
    </div>
  );
}

function PainelColecao({ grupo }: { grupo: GrupoNaTela }) {
  const t = useTranslations("v2Falta.geral");
  const [mostrar, setMostrar] = useState(VAGAS_DE_CARA);
  const { colecao, exibidas, alocaveis } = grupo;
  const href = `/colecoes/${colecao.id}?aba=falta`;
  const idTitulo = `falta-${colecao.id}`;

  return (
    <section className={`${estilos.painel} v2-painel`} aria-labelledby={idTitulo}>
      <div className={estilos.cabecalhoPainel}>
        <h2 id={idTitulo} className={estilos.nomeColecao}>
          <Link href={href} className={estilos.linkColecao}>
            {colecao.nome}
          </Link>
        </h2>
        <div className={estilos.contagens}>
          {alocaveis > 0 ? <span className={estilos.pilulaLivre}>{t("jaDaParaAlocar", { total: alocaveis })}</span> : null}
          <span className={`${estilos.faltando} v2-num`}>{t("faltando", { total: colecao.vagas.length })}</span>
        </div>
        <BotaoLink href={href} pequeno>
          {t("abrir")}
        </BotaoLink>
      </div>
      <ul className={estilos.vagas}>
        {exibidas.slice(0, mostrar).map((v) => (
          <ItemVaga key={v.id} vaga={v} tipo={colecao.tipo} />
        ))}
      </ul>
      {exibidas.length > mostrar ? (
        <Botao pequeno variante="fantasma" className={estilos.mais} onClick={() => setMostrar((m) => m + VAGAS_POR_VEZ)}>
          {t("mostrarMais", { total: exibidas.length - mostrar })}
        </Botao>
      ) : null}
    </section>
  );
}

function ItemVaga({ vaga, tipo }: { vaga: VagaFaltaGeral; tipo: ColecaoFaltaGeral["tipo"] }) {
  const t = useTranslations("v2Falta.geral");
  const alocavel = vaga.livres > 0;
  const sprite = tipo === "pokedex" ? urlSpritePokemon(vaga.chave) : null;
  return (
    <li className={`${estilos.vaga} ${alocavel ? estilos.alocavel : ""}`}>
      <span className={estilos.miniatura} aria-hidden>
        {sprite ? (
          // eslint-disable-next-line @next/next/no-img-element -- sprite pequeno do PokeAPI, servido do CDN deles na hora (AGENTS.md, Living Dex).
          <img className={estilos.sprite} src={sprite} alt="" width={96} height={96} loading="lazy" decoding="async" draggable={false} />
        ) : vaga.imagemUrl ? (
          <Carta imagemUrl={vaga.imagemUrl} origem={vaga.imagemOrigem} alt="" className={estilos.cartaApagada} fallback={<span />} />
        ) : null}
      </span>
      <span className={estilos.textoVaga}>
        <span className={`${estilos.numero} v2-num`}>#{vaga.numero}</span>
        {vaga.nome ? <span className={estilos.nome}>{vaga.nome}</span> : null}
        {alocavel ? <span className={estilos.suas}>{t("copiasSuas", { total: vaga.livres })}</span> : null}
      </span>
    </li>
  );
}
