"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";

import { CONDICOES, IDIOMAS, VARIANTES_COPIA } from "@/lib/dominio/enums";

import { Botao } from "../../_componentes/primitivos/botao";
import { Campo, Selecao } from "../../_componentes/primitivos/campo";
import type { ChaveFiltro, FiltrosTela } from "./estado-inventario";
import estilos from "./inventario.module.css";

/** Os valores que existem no inventário, como `GET /api/copias` os devolve em `opcoes`. */
export interface OpcoesFiltro {
  sets: { setId: string; setNome: string }[];
  raridades: string[];
}

/** O nome completo das condições: vocabulário de colecionador, em inglês nas duas línguas (como a v1). */
const CONDICAO_COMPLETA: Record<(typeof CONDICOES)[number], string> = {
  NM: "Near Mint",
  LP: "Lightly Played",
  MP: "Moderately Played",
  HP: "Heavily Played",
  DMG: "Damaged",
};

/**
 * A busca por nome, sempre à vista, e o painel com os outros nove filtros da
 * v1. A partir de 768 px o painel está sempre aberto; abaixo, recolhe atrás do
 * botão "Filtros (n)". Só visibilidade, decidida em CSS (sem medir a largura
 * em JavaScript): os valores ficam em `filtros`, iguais com o painel aberto ou
 * fechado e ao girar o aparelho.
 */
export function PainelFiltros({
  filtros,
  opcoes,
  aberto,
  noPainel,
  algumFiltro,
  onMudar,
  onAlternar,
  onLimpar,
}: {
  filtros: FiltrosTela;
  opcoes: OpcoesFiltro;
  aberto: boolean;
  noPainel: number;
  algumFiltro: boolean;
  onMudar: (chave: ChaveFiltro, valor: string) => void;
  onAlternar: () => void;
  onLimpar: () => void;
}) {
  const t = useTranslations("v2Inventario.filtros");
  const tInv = useTranslations("v2Inventario");
  const tComp = useTranslations("componentes");
  const idPainel = "inventario-painel-filtros";

  // Um valor que chegou pela URL e não está entre as opções lidas (um set que
  // saiu do inventário, uma raridade digitada à mão) continua escolhido e
  // visível, em vez de o seletor fingir "todos" enquanto a lista filtra.
  const setsComAtual =
    filtros.set && !opcoes.sets.some((s) => s.setId === filtros.set)
      ? [...opcoes.sets, { setId: filtros.set, setNome: filtros.set }]
      : opcoes.sets;
  const raridadesComAtual =
    filtros.raridade && !opcoes.raridades.includes(filtros.raridade)
      ? [...opcoes.raridades, filtros.raridade]
      : opcoes.raridades;

  return (
    <section className={estilos.filtros} aria-label={t("rotulo")}>
      <div className={estilos.linhaBusca}>
        <div className={estilos.busca}>
          <Search aria-hidden size={18} className={estilos.lupa} />
          <Campo
            type="search"
            aria-label={t("busca")}
            placeholder={t("busca")}
            value={filtros.q}
            className={estilos.campoBusca}
            onChange={(e) => onMudar("q", e.target.value)}
            enterKeyHint="search"
            autoComplete="off"
          />
        </div>
        <Botao
          className={estilos.botaoFiltros}
          icone={<SlidersHorizontal aria-hidden size={18} />}
          aria-expanded={aberto}
          aria-controls={idPainel}
          onClick={onAlternar}
        >
          {noPainel > 0 ? t("abrirComTotal", { total: noPainel }) : t("abrir")}
        </Botao>
        <Botao variante="fantasma" disabled={!algumFiltro} onClick={onLimpar}>
          {tInv("limparFiltros")}
        </Botao>
      </div>

      <div id={idPainel} className={estilos.painelFiltros} data-aberto={aberto || undefined}>
        <Selecao rotulo={t("set")} value={filtros.set} onChange={(e) => onMudar("set", e.target.value)}>
          <option value="">{t("todos")}</option>
          {setsComAtual.map((s) => (
            <option key={s.setId} value={s.setId}>
              {s.setNome}
            </option>
          ))}
        </Selecao>
        <Selecao rotulo={t("idioma")} value={filtros.idioma} onChange={(e) => onMudar("idioma", e.target.value)}>
          <option value="">{t("todos")}</option>
          {IDIOMAS.map((i) => (
            <option key={i} value={i}>
              {tInv(`idioma.${i}`)}
            </option>
          ))}
        </Selecao>
        <Selecao rotulo={t("raridade")} value={filtros.raridade} onChange={(e) => onMudar("raridade", e.target.value)}>
          <option value="">{t("todas")}</option>
          {raridadesComAtual.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Selecao>
        <Selecao rotulo={t("variante")} value={filtros.variante} onChange={(e) => onMudar("variante", e.target.value)}>
          <option value="">{t("todas")}</option>
          {VARIANTES_COPIA.map((v) => (
            <option key={v} value={v}>
              {tComp(`variante.${v}`)}
            </option>
          ))}
        </Selecao>
        <Selecao rotulo={t("condicao")} value={filtros.condicao} onChange={(e) => onMudar("condicao", e.target.value)}>
          <option value="">{t("todas")}</option>
          {CONDICOES.map((c) => (
            <option key={c} value={c}>
              {c} · {CONDICAO_COMPLETA[c]}
            </option>
          ))}
        </Selecao>
        <Selecao rotulo={t("graded")} value={filtros.graded} onChange={(e) => onMudar("graded", e.target.value)}>
          <option value="">{t("todas")}</option>
          <option value="true">{t("gradedSim")}</option>
          <option value="false">{t("gradedNao")}</option>
        </Selecao>
        <Selecao rotulo={t("alocacao")} value={filtros.alocacao} onChange={(e) => onMudar("alocacao", e.target.value)}>
          <option value="">{t("todas")}</option>
          <option value="alocada">{t("alocadas")}</option>
          <option value="livre">{t("livres")}</option>
        </Selecao>
        <Selecao
          rotulo={t("imagem")}
          dica={t("imagemDica")}
          value={filtros.semImagem}
          onChange={(e) => onMudar("semImagem", e.target.value)}
        >
          <option value="">{t("todas")}</option>
          <option value="true">{t("semImagem")}</option>
        </Selecao>
        <Campo
          rotulo={t("localizacao")}
          placeholder={t("localizacaoExemplo")}
          value={filtros.localizacao}
          onChange={(e) => onMudar("localizacao", e.target.value)}
          autoComplete="off"
        />
      </div>
    </section>
  );
}
