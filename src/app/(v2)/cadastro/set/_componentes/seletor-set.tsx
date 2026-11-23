"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { agruparSetsPorSerie, type TextosRotuloSet } from "@/lib/dominio/agrupamento-sets";
import {
  FILTRO_IDIOMA_TODOS,
  derivarOpcoesFiltroIdiomaComContagem,
  filtrarSetsPorIdioma,
  type FiltroIdiomaSet,
} from "@/lib/dominio/filtro-idioma-set";
import {
  type CatalogoDoSet,
  buscarSets,
  catalogoDoSetEscolhido,
  rotuloDoSetNoSeletor,
} from "@/lib/dominio/nova-colecao-v2";
import type { SetParaCadastroDTO } from "@/lib/dominio/tipos-cliente";

import { Campo, Selecao } from "../../../_componentes/primitivos/campo";
import estilos from "./cadastro-set.module.css";

export interface SetEscolhido {
  set: SetParaCadastroDTO;
  catalogo: CatalogoDoSet;
}

/**
 * O seletor de set do cadastro: filtro de idioma do catálogo, busca por nome,
 * sigla ou id, e o select agrupado por série. Lê `/api/sets` uma vez (a lista
 * já vem ordenada do servidor) e usa as mesmas funções puras do seletor da
 * nova coleção (`nova-colecao-v2.ts`, `agrupamento-sets.ts`,
 * `filtro-idioma-set.ts`); o componente é outro porque lá o select acrescenta
 * um set a uma receita, e aqui escolhe o set da grade.
 *
 * O idioma filtrado é o do **catálogo**, nunca o da carta física (regra 7).
 * Ele também decide de qual catálogo vem um set que existe nos dois (`neo1` a
 * `neo4`): escolhido sob "Japonês", é a grade japonesa
 * (`catalogoDoSetEscolhido`). Por isso o select só mostra o set escolhido
 * enquanto o filtro ainda o leria do mesmo catálogo; trocar o filtro depois
 * não troca a grade, e o nome do set à vista fica no cabeçalho da grade.
 */
export function SeletorSet({
  escolhido,
  aoEscolher,
}: {
  escolhido: SetEscolhido | null;
  aoEscolher: (escolha: SetEscolhido) => void;
}) {
  const t = useTranslations("v2CadastroSet.seletor");
  const formatador = useFormatter();
  const [sets, setSets] = useState<SetParaCadastroDTO[] | null>(null);
  const [erro, setErro] = useState(false);
  const [termo, setTermo] = useState("");
  // "Todos" por padrão: nunca começa filtrado.
  const [filtro, setFiltro] = useState<FiltroIdiomaSet>(FILTRO_IDIOMA_TODOS);

  useEffect(() => {
    let ativo = true;
    fetch("/api/sets")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("sets"))))
      .then((d: { sets?: SetParaCadastroDTO[] }) => {
        if (ativo) setSets(Array.isArray(d.sets) ? d.sets : []);
      })
      .catch(() => {
        if (ativo) setErro(true);
      });
    return () => {
      ativo = false;
    };
  }, []);

  // A data sai do `Intl` no idioma da interface; o resto do rótulo é dado do catálogo.
  const textosRotulo = useMemo<TextosRotuloSet>(
    () => ({
      cartas: (quantidade) => t("cartas", { total: quantidade }),
      data: (lancamento) => {
        const partes = lancamento.split("-").map(Number);
        if (partes.length !== 3 || partes.some((n) => !Number.isFinite(n))) return null;
        const [ano, mes, dia] = partes;
        return formatador.dateTime(new Date(Date.UTC(ano, mes - 1, dia)), {
          timeZone: "UTC",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
      },
    }),
    [t, formatador],
  );

  // A contagem de cada opção é sobre o catálogo inteiro, nunca sobre a busca.
  const opcoesIdioma = useMemo(() => derivarOpcoesFiltroIdiomaComContagem(sets ?? []), [sets]);
  const visiveis = useMemo(() => buscarSets(filtrarSetsPorIdioma(sets ?? [], filtro), termo), [sets, filtro, termo]);
  const grupos = useMemo(() => agruparSetsPorSerie(visiveis), [visiveis]);

  const valor =
    escolhido &&
    catalogoDoSetEscolhido(escolhido.set, filtro) === escolhido.catalogo &&
    visiveis.some((s) => s.setId === escolhido.set.setId)
      ? escolhido.set.setId
      : "";

  return (
    <div className={estilos.seletor}>
      <fieldset className={estilos.filtroIdioma}>
        <legend className={estilos.rotuloFiltro}>{t("idiomaCatalogo")}</legend>
        {opcoesIdioma.map((opcao) => (
          <button
            key={opcao.filtro}
            type="button"
            className={estilos.pilula}
            aria-pressed={filtro === opcao.filtro}
            onClick={() => setFiltro(opcao.filtro)}
          >
            {t(`idioma.${opcao.filtro}`)}
            <span className={`${estilos.pilulaContagem} v2-num`}>{opcao.quantidade}</span>
          </button>
        ))}
      </fieldset>
      <div className={estilos.camposSeletor}>
        <Campo
          rotulo={t("buscar")}
          placeholder={t("placeholderBuscar")}
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          autoComplete="off"
          enterKeyHint="search"
        />
        <Selecao
          rotulo={t("expansao")}
          value={valor}
          disabled={sets === null}
          erro={erro ? t("erroCarregar") : undefined}
          onChange={(e) => {
            const set = (sets ?? []).find((s) => s.setId === e.target.value);
            if (set) aoEscolher({ set, catalogo: catalogoDoSetEscolhido(set, filtro) });
          }}
        >
          <option value="">{visiveis.length === 0 && sets !== null ? t("nenhumSet") : t("selecione")}</option>
          {grupos.map((grupo) => (
            <optgroup key={grupo.serieId} label={grupo.serie}>
              {grupo.sets.map((s) => (
                <option key={s.setId} value={s.setId}>
                  {rotuloDoSetNoSeletor(s, filtro, textosRotulo)}
                </option>
              ))}
            </optgroup>
          ))}
        </Selecao>
      </div>
    </div>
  );
}
