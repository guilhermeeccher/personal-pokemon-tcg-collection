"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import {
  agruparSetsPorSerie,
  formatarRotuloSet,
  type TextosRotuloSet,
} from "@/lib/dominio/agrupamento-sets";
import {
  FILTRO_IDIOMA_TODOS,
  derivarOpcoesFiltroIdiomaComContagem,
  filtrarSetsPorIdioma,
  type FiltroIdiomaSet,
} from "@/lib/dominio/filtro-idioma-set";
import { buscarSets } from "@/lib/dominio/nova-colecao-v2";
import type { SetParaCadastroDTO } from "@/lib/dominio/tipos-cliente";

import { Campo, Selecao } from "../../../_componentes/primitivos/campo";
import estilos from "./nova.module.css";

/**
 * O seletor de expansão da v2: filtro de idioma do catálogo, busca por nome,
 * sigla ou id, e um select agrupado por série (série e sets do lançamento mais
 * recente para o mais antigo). Lê `/api/sets` uma vez — a lista já vem
 * ordenada do servidor — e delega a derivação das opções, o agrupamento e o
 * rótulo a `lib/dominio/` (as mesmas funções do seletor da v1, de que a v2 não
 * pode importar a pele).
 *
 * O idioma filtrado aqui é o do **catálogo** ("em quais idiomas a TCGdex tem
 * esta expansão"), nunca o da carta física (regra 7): um set filtrado para
 * fora continua podendo receber cópia em qualquer idioma. O padrão é "Todos";
 * nunca começa filtrado, e a contagem de cada opção é sempre sobre o conjunto
 * inteiro, senão o número dança enquanto a pessoa digita.
 *
 * Escolher um set o entrega a quem chamou e o select volta a "" (a receita
 * guarda o escolhido, o seletor fica livre para o próximo).
 */
export function SeletorDeSet({ aoEscolher }: { aoEscolher: (set: SetParaCadastroDTO) => void }) {
  const t = useTranslations("v2Colecoes.formulario.seletor");
  const formatador = useFormatter();
  const [sets, setSets] = useState<SetParaCadastroDTO[] | null>(null);
  const [erro, setErro] = useState(false);
  const [termo, setTermo] = useState("");
  const [filtroIdioma, setFiltroIdioma] = useState<FiltroIdiomaSet>(FILTRO_IDIOMA_TODOS);

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

  const opcoesIdioma = useMemo(() => derivarOpcoesFiltroIdiomaComContagem(sets ?? []), [sets]);
  const visiveis = useMemo(
    () => buscarSets(filtrarSetsPorIdioma(sets ?? [], filtroIdioma), termo),
    [sets, filtroIdioma, termo],
  );
  const grupos = useMemo(() => agruparSetsPorSerie(visiveis), [visiveis]);

  return (
    <div className={estilos.seletor}>
      <fieldset className={estilos.filtroIdioma}>
        <legend className={estilos.rotuloFiltro}>{t("idiomaCatalogo")}</legend>
        {opcoesIdioma.map((opcao) => (
          <button
            key={opcao.filtro}
            type="button"
            className={estilos.pilula}
            aria-pressed={filtroIdioma === opcao.filtro}
            onClick={() => setFiltroIdioma(opcao.filtro)}
          >
            {t(`idioma.${opcao.filtro}`)}
            <span className={estilos.pilulaContagem}>{opcao.quantidade}</span>
          </button>
        ))}
      </fieldset>
      <Campo
        rotulo={t("buscar")}
        placeholder={t("placeholderBuscar")}
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        autoComplete="off"
      />
      <Selecao
        rotulo={t("expansao")}
        value=""
        disabled={sets === null}
        erro={erro ? t("erroCarregar") : undefined}
        onChange={(e) => {
          const escolhido = (sets ?? []).find((s) => s.setId === e.target.value);
          if (escolhido) aoEscolher(escolhido);
        }}
      >
        <option value="">{visiveis.length === 0 && sets !== null ? t("nenhumSet") : t("selecione")}</option>
        {grupos.map((grupo) => (
          <optgroup key={grupo.serieId} label={grupo.serie}>
            {grupo.sets.map((s) => (
              <option key={s.setId} value={s.setId}>
                {formatarRotuloSet(s, textosRotulo)}
              </option>
            ))}
          </optgroup>
        ))}
      </Selecao>
    </div>
  );
}
