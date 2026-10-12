"use client";

/**
 * "Levar ao HOME" — as vagas que o usuário pode preencher agora, porque já
 * tem o Pokémon num jogo e a vaga ainda não está no HOME
 * (`oportunidadesHome`). É o "o que já dá para alocar" das cartas.
 *
 * Agrupado por jogo; jogo só de envio vem marcado "sem volta", e enviar
 * dele passa pela confirmação de `useTransferencia`.
 */

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Alerta } from "@/app/_componentes/alerta";
import { Botao } from "@/app/_componentes/botao";
import { Distintivo } from "@/app/_componentes/distintivo";
import { Painel } from "@/app/_componentes/painel";
import { naoTransferiveis } from "@/lib/dominio/dex-disponibilidade";
import { oportunidadesHome } from "@/lib/dominio/dex-inventario";
import { jogoDex, LOCAL_HOME } from "@/lib/dominio/dex-jogos";
import type { FormaDexDTO, RegistroDexDTO } from "@/lib/dominio/tipos-cliente";

import { SpriteDex } from "../_componentes/sprite-dex";
import { useRotuloForma } from "../_componentes/use-rotulo-forma";
import { useTransferencia } from "../_componentes/use-transferencia";

export function PainelOportunidades({
  formas,
  registros,
}: {
  formas: FormaDexDTO[];
  registros: RegistroDexDTO[];
}) {
  const t = useTranslations("dex");
  const router = useRouter();
  const rotulo = useRotuloForma(formas);
  const { mover, ocupado, erro, modal } = useTransferencia(() => router.refresh());
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});

  const formaPorId = useMemo(() => new Map(formas.map((f) => [f.id, f])), [formas]);
  const grupos = useMemo(() => oportunidadesHome(registros, naoTransferiveis()), [registros]);
  const totalVagas = grupos.reduce((soma, g) => soma + g.itens.length, 0);

  return (
    <Painel className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="text-base font-bold text-strong">{t("oportunidades.titulo")}</h2>
        <span className="text-sm text-muted">
          {totalVagas === 0 ? t("oportunidades.nenhuma") : t("oportunidades.resumo", { vagas: String(totalVagas) })}
        </span>
      </div>
      {erro && <Alerta tom="perigo">{erro}</Alerta>}

      {grupos.map((g) => {
        const jogo = jogoDex(g.jogoId);
        const aberto = abertos[g.jogoId] ?? false;
        return (
          <div key={g.jogoId} className="flex flex-col gap-2 border-t border-hairline pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-strong">{jogo?.nome ?? g.jogoId}</span>
              <span className="font-mono text-sm tabular-nums text-muted">{g.itens.length}</span>
              {jogo?.conexaoHome === "so_envio" && <Distintivo tom="aviso">{t("oportunidades.semVolta")}</Distintivo>}
              <div className="ml-auto flex gap-1">
                <Botao tamanho="xs" onClick={() => setAbertos((a) => ({ ...a, [g.jogoId]: !aberto }))}>
                  {aberto ? t("oportunidades.ocultar") : t("oportunidades.ver")}
                </Botao>
                <Botao
                  tamanho="xs"
                  variante="primario"
                  disabled={ocupado}
                  onClick={() => mover(g.itens.map((i) => i.registroId), LOCAL_HOME)}
                >
                  {t("oportunidades.enviarTodas", { quantidade: String(g.itens.length) })}
                </Botao>
              </div>
            </div>
            {aberto && (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {g.itens.map((item) => {
                  const forma = formaPorId.get(item.formaId);
                  if (!forma) return null;
                  return (
                    <li
                      key={item.registroId}
                      className="flex flex-col items-center gap-1 rounded-card border border-hairline p-2 text-center"
                    >
                      <SpriteDex sprite={forma.sprite} shiny={item.trilha === "shiny"} tamanho={56} />
                      <span className="text-xs font-semibold text-strong">{rotulo.nome(forma)}</span>
                      {item.trilha === "shiny" && <Distintivo tom="acento">{t("trilha.shiny")}</Distintivo>}
                      <Botao tamanho="xs" disabled={ocupado} onClick={() => mover([item.registroId], LOCAL_HOME)}>
                        {t("oportunidades.enviar")}
                      </Botao>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
      {modal}
    </Painel>
  );
}
