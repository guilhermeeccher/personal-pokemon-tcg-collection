"use client";

/**
 * Seletor de expansão (filtro de idioma do catálogo + busca por nome OU
 * sigla + select agrupado por série, série e sets ordenados do
 * lançamento mais recente para o mais antigo) — extraído do cadastro por
 * set (Fase 1) para ser reaproveitado por qualquer tela que precise
 * escolher um set do catálogo, sem duplicar a lógica de busca/
 * agrupamento/ordenação (pedido explícito da tarefa da Fase 2: "não
 * escreva outro").
 *
 * Busca `/api/sets` uma vez na montagem; a lista já vem ordenada do
 * servidor (`listarSetsParaCadastro`). Aqui filtra por idioma do
 * catálogo, nome/sigla, e delega derivação de opções, agrupamento,
 * ordenação e rótulo a `lib/dominio/` (regra de negócio, não enfeite de
 * componente).
 *
 * Atenção: o idioma filtrado aqui é o do CATÁLOGO ("em quais idiomas a
 * TCGdex tem esta expansão") — nunca o idioma da carta FÍSICA, que é
 * escolhido no cadastro da cópia e é governado pela regra 7 do
 * AGENTS.md. Um set filtrado para fora ("só Inglês") continua podendo
 * receber cópia física em qualquer idioma; este filtro só decide o que
 * aparece na lista de expansões.
 */

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
import type { SetParaCadastroDTO } from "@/lib/dominio/tipos-cliente";

export function SeletorExpansao({
  setSelecionadoId,
  onSelecionar,
}: {
  setSelecionadoId: string;
  /** `null` quando o valor selecionado é "" (nenhum set). */
  onSelecionar: (set: SetParaCadastroDTO | null) => void;
}) {
  const t = useTranslations("seletorExpansao");
  const formatador = useFormatter();
  const [sets, setSets] = useState<SetParaCadastroDTO[] | null>(null);

  /* Os dois pedaços do rótulo do `<option>` que falam com o usuário. A
     data sai do `Intl` no idioma da interface (dd/mm/aaaa em pt-BR,
     mm/dd/yyyy em en) — o resto do rótulo é dado do catálogo. */
  const textosRotuloSet = useMemo<TextosRotuloSet>(
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
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");
  // Padrão "Todos" — nunca começa filtrado (pedido explícito da tarefa).
  const [filtroIdioma, setFiltroIdioma] = useState<FiltroIdiomaSet>(FILTRO_IDIOMA_TODOS);

  useEffect(() => {
    fetch("/api/sets")
      .then((r) => r.json())
      .then((d) => setSets(d.sets))
      .catch(() => setErro(t("erroCarregar")));
  }, [t]);

  // Opções derivadas dos dados que já chegaram, com a contagem de cada
  // uma — nunca de uma lista fixa no código, e a contagem é sempre sobre
  // TODOS os sets (nunca sobre `setsFiltrados`): sem isso, "Todos" e
  // "Inglês" empatados em 199 (todo set sincronizado tem linha `en`)
  // parecem um filtro quebrado, achado do coordenador — a contagem
  // explica que é um fato do catálogo, não um bug. Enquanto nenhum set
  // tiver linha em "jp" (a API da TCGdex está fora do ar), a opção não
  // aparece; quando o sync trouxer o japonês, ela surge sozinha, sem
  // mexer nesta tela.
  const opcoesIdioma = useMemo(
    () => derivarOpcoesFiltroIdiomaComContagem(sets ?? []),
    [sets],
  );

  // Já chega ordenado do servidor (mais recente primeiro). Combina o
  // filtro de idioma do catálogo com a busca por nome OU sigla — a sigla
  // é o que está impresso na carta física ("MEW" no 151).
  const setsFiltrados = useMemo(() => {
    if (!sets) return [];
    const porIdioma = filtrarSetsPorIdioma(sets, filtroIdioma);
    const termo = filtro.trim().toLowerCase();
    if (!termo) return porIdioma;
    return porIdioma.filter(
      (s) =>
        s.setNome.toLowerCase().includes(termo) ||
        (s.setSigla?.toLowerCase().includes(termo) ?? false) ||
        // O id do set entra na busca porque, no catálogo japonês, ele É a
        // sigla impressa na carta ("sv2a 002/165") — lá `setSigla` é
        // sempre nulo, e o nome está em japonês. Sem isto, digitar o que
        // está escrito na carta não encontrava a expansão.
        s.setId.toLowerCase().includes(termo),
    );
  }, [sets, filtro, filtroIdioma]);

  // Agrupamento por série (ex.: "Megaevolução", "Escarlate e Violeta"),
  // série e sets ordenados do lançamento mais recente para o mais antigo.
  // Série sem nenhum set depois do filtro simplesmente não aparece —
  // `agruparSetsPorSerie` só cria grupo pros sets que sobraram.
  const gruposFiltrados = useMemo(() => agruparSetsPorSerie(setsFiltrados), [setsFiltrados]);

  return (
    <div className="flex flex-col gap-2">
      <fieldset className="flex flex-wrap items-center gap-1 text-sm">
        <legend className="mb-1 font-medium">{t("idiomaCatalogo")}</legend>
        {opcoesIdioma.map((opcao) => (
          <button
            key={opcao.filtro}
            type="button"
            onClick={() => setFiltroIdioma(opcao.filtro)}
            aria-pressed={filtroIdioma === opcao.filtro}
            className={`rounded border px-2 py-1 text-xs ${
              filtroIdioma === opcao.filtro
                ? "border-accent bg-accent text-accent-fg"
                : "border-line text-muted"
            }`}
          >
            {t(`idioma.${opcao.filtro}`)} ({opcao.quantidade})
          </button>
        ))}
      </fieldset>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t("buscar")}</span>
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder={t("placeholderBuscar")}
            className="w-full max-w-xs rounded border border-line bg-transparent p-2"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">{t("expansao")}</span>
          <select
            className="w-full max-w-xl rounded border border-line bg-transparent p-2"
            value={setSelecionadoId}
            onChange={(e) => {
              const novoId = e.target.value;
              const set = (sets ?? []).find((s) => s.setId === novoId) ?? null;
              onSelecionar(set);
            }}
          >
            <option value="">
              {setsFiltrados.length === 0 ? t("nenhumSet") : t("selecione")}
            </option>
            {gruposFiltrados.map((grupo) => (
              <optgroup key={grupo.serieId} label={grupo.serie}>
                {grupo.sets.map((s) => (
                  <option key={s.setId} value={s.setId}>
                    {formatarRotuloSet(s, textosRotuloSet)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      {erro && <p className="text-sm text-danger">{erro}</p>}
    </div>
  );
}
