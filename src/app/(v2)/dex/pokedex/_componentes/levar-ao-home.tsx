"use client";

/**
 * "Levar ao HOME" na Pokédex da v2 (PKD-05 de `docs/design-v2/parity.md`): as
 * vagas que a pessoa pode preencher agora, porque já tem o Pokémon num jogo e
 * a vaga ainda não está no HOME (`oportunidadesHome`). É o "o que já dá para
 * alocar" das cartas.
 *
 * Agrupado por jogo, como na v1 (`painel-oportunidades.tsx`): jogo só de
 * envio vem marcado "sem volta"; abrir o grupo mostra cada Pokémon; enviar um
 * ou o grupo inteiro é `POST /api/dex/registros/mover` com `local: "home"`,
 * pelo fluxo compartilhado (`useTransferencia`). Sair de um jogo só de envio
 * pergunta pelo diálogo de confirmação, e cancelar não envia nada. O que o
 * HOME não recebe daquele jogo nunca aparece aqui (`naoTransferiveis`).
 *
 * Depois de um envio aceito, ou de uma recusa por lista velha (404, 409), a
 * página é lida de novo (`router.refresh`): os registros vêm do servidor, e a
 * grade abaixo muda de estado junto.
 */

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";

import { useRotuloForma } from "@/app/_comum/dex/use-rotulo-forma";
import { naoTransferiveis } from "@/lib/dominio/dex-disponibilidade";
import { oportunidadesHome } from "@/lib/dominio/dex-inventario";
import { jogoDex, LOCAL_HOME } from "@/lib/dominio/dex-jogos";
import type { FormaDexDTO, RegistroDexDTO } from "@/lib/dominio/tipos-cliente";

import { useAviso } from "../../../_componentes/primitivos/aviso-flutuante";
import { Botao } from "../../../_componentes/primitivos/botao";
import { AvisoEmLinha, Painel } from "../../../_componentes/primitivos/painel";
import { SpriteDex } from "../../_componentes/sprite-dex";
import { useTransferencia } from "../../_componentes/use-transferencia";

import estilos from "./pokedex.module.css";

export function LevarAoHome({ formas, registros }: { formas: FormaDexDTO[]; registros: RegistroDexDTO[] }) {
  const t = useTranslations("v2Dex.levar");
  const td = useTranslations("dex");
  const router = useRouter();
  const avisar = useAviso();
  const rotulo = useRotuloForma(formas);
  const aoConcluir = useCallback(
    (movidos: number) => {
      avisar(t("enviados", { quantidade: movidos }), { tom: "sucesso" });
      router.refresh();
    },
    [avisar, router, t],
  );
  // 404 ou 409: outra aba moveu ou apagou um registro do lote, e nada foi
  // gravado. A frase fica; a lista é lida de novo, para o próximo clique
  // partir do que o servidor tem.
  const aoRecusar = useCallback(
    (status: number) => {
      if (status === 404 || status === 409) router.refresh();
    },
    [router],
  );
  const { mover, ocupado, erro, dialogo } = useTransferencia(aoConcluir, { aoRecusar });
  const [abertos, setAbertos] = useState<ReadonlySet<string>>(new Set());

  const formaPorId = useMemo(() => new Map(formas.map((f) => [f.id, f])), [formas]);
  const grupos = useMemo(() => oportunidadesHome(registros, naoTransferiveis()), [registros]);
  const totalVagas = grupos.reduce((soma, g) => soma + g.itens.length, 0);

  function alternar(jogoId: string) {
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(jogoId)) novo.delete(jogoId);
      else novo.add(jogoId);
      return novo;
    });
  }

  return (
    <Painel as="section" className={estilos.levar} aria-labelledby="pokedex-levar">
      <div className={estilos.levarCab}>
        <h2 id="pokedex-levar" className={estilos.blocoTitulo}>
          {t("titulo")}
        </h2>
        <span className={estilos.nota}>
          {totalVagas === 0 ? t("nenhuma") : t("resumo", { vagas: totalVagas })}
        </span>
      </div>
      {erro && (
        <AvisoEmLinha tom="perigo" papel="alert">
          {erro}
        </AvisoEmLinha>
      )}

      {grupos.length > 0 && (
        <ul className={estilos.grupos}>
          {grupos.map((g) => {
            const jogo = jogoDex(g.jogoId);
            const nome = jogo?.nome ?? g.jogoId;
            const aberto = abertos.has(g.jogoId);
            const idLista = `levar-${g.jogoId}`;
            return (
              <li key={g.jogoId} className={estilos.grupo}>
                <div className={estilos.grupoCab}>
                  <span className={estilos.grupoNome}>
                    <b>{nome}</b>
                    <span className={`${estilos.nota} v2-num`}>{g.itens.length}</span>
                    {jogo?.conexaoHome === "so_envio" && <span className={estilos.seloAviso}>{t("semVolta")}</span>}
                  </span>
                  <span className={estilos.grupoAcoes}>
                    <Botao
                      pequeno
                      variante="fantasma"
                      aria-expanded={aberto}
                      aria-controls={idLista}
                      onClick={() => alternar(g.jogoId)}
                    >
                      {aberto ? t("ocultar") : t("ver")}
                    </Botao>
                    <Botao
                      pequeno
                      variante="primario"
                      disabled={ocupado}
                      onClick={() => mover(g.itens.map((i) => i.registroId), LOCAL_HOME)}
                    >
                      {t("enviarTodas", { quantidade: g.itens.length })}
                    </Botao>
                  </span>
                </div>
                <ul id={idLista} className={estilos.itens} hidden={!aberto}>
                  {aberto &&
                    g.itens.map((item) => {
                      const forma = formaPorId.get(item.formaId);
                      if (!forma) return null;
                      const shiny = item.trilha === "shiny";
                      const nomeForma = rotulo.nome(forma);
                      return (
                        <li key={item.registroId} className={estilos.item}>
                          <SpriteDex sprite={forma.sprite} shiny={shiny} tamanho={56} />
                          <span className={estilos.itemNome}>{nomeForma}</span>
                          {shiny && <span className={estilos.seloShiny}>{td("trilha.shiny")}</span>}
                          <Botao
                            pequeno
                            disabled={ocupado}
                            aria-label={t("enviarRotulo", { nome: shiny ? `${nomeForma} (${td("trilha.shiny")})` : nomeForma })}
                            onClick={() => mover([item.registroId], LOCAL_HOME)}
                          >
                            {t("enviar")}
                          </Botao>
                        </li>
                      );
                    })}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
      {dialogo}
    </Painel>
  );
}
