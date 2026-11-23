"use client";

/**
 * `/dex/inventario` na v2 (pacote 5e-a): os Pokémon cadastrados, como o
 * inventário das cartas. Portado de `(v1)/v1/dex/inventario/
 * inventario-dex.tsx`, com as mesmas leituras e as mesmas rotas.
 *
 * - **Um registro por Pokémon no banco, agrupado só na tela**
 *   (`linhasDoInventario`, que usa `agruparInventario`). As ações de uma
 *   linha agem sobre **um** Pokémon do grupo — enviar ao HOME, mover, apagar
 *   —, e corrigir vale para o grupo inteiro (AGENTS.md, "One row per Pokémon
 *   in the database, grouped only on screen").
 * - **Mover e corrigir são operações separadas.** Mover é
 *   `POST /api/dex/registros/mover`, pelo fluxo compartilhado da Dex
 *   (`useTransferencia`): sair de um jogo só de envio pergunta pelo diálogo
 *   de confirmação, e só o clique em "Transferir" reenvia — nunca é
 *   automático. Corrigir é `PATCH /api/dex/registros` e nunca toca o local.
 *   O que o HOME não aceita daquele jogo não sai dele: o servidor recusa e a
 *   frase aparece.
 * - **Apagar pergunta antes** (o diálogo de confirmação da v2 no lugar do
 *   `window.confirm`), e cancelar não envia nada.
 *
 * Tudo vem do servidor de uma vez e filtra local; depois de uma ação aceita,
 * ou de uma recusa que diz que a lista está velha (404, 409 — outra aba
 * moveu ou apagou), a página é lida de novo (`router.refresh`).
 */

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useId, useMemo, useState } from "react";

import { useRotuloForma } from "@/app/_comum/dex/use-rotulo-forma";
import { textoDaRecusa } from "@/app/_comum/recusa";
import { jogoDex, LOCAL_HOME } from "@/lib/dominio/dex-jogos";
import type { FormaDexDTO, JogoPossuidoDTO, RegistroDexDTO } from "@/lib/dominio/tipos-cliente";

import { useAviso } from "../../../_componentes/primitivos/aviso-flutuante";
import { Botao, BotaoLink } from "../../../_componentes/primitivos/botao";
import { Campo, Selecao } from "../../../_componentes/primitivos/campo";
import { useConfirmacao } from "../../../_componentes/primitivos/dialogo-confirmacao";
import { AvisoEmLinha, Painel } from "../../../_componentes/primitivos/painel";
import { SpriteDex } from "../../_componentes/sprite-dex";
import { useTransferencia } from "../../_componentes/use-transferencia";

import { CorrecaoGrupo } from "./correcao-grupo";
import estilos from "./inventario-dex.module.css";
import {
  destinosDoGrupo,
  FILTROS_INVENTARIO_VAZIOS,
  type FiltrosInventarioDex,
  filtrosNoPainel,
  idParaApagar,
  idParaMover,
  type LinhaInventarioDex,
  linhasDoInventario,
  totalDePokemon,
} from "./linhas-inventario";

/*
 * Quantas linhas aparecem por vez. Quem cadastrou anos de GO tem centenas de
 * grupos, e cada linha leva o sprite e os botões: montar todos estouraria o
 * orçamento de nós da regra 13 de `docs/design-v2/rules.md`. "Mostrar mais"
 * soma outro tanto; mudar um filtro volta ao começo. A contagem do topo é
 * sempre a da lista inteira.
 */
const POR_VEZ = 60;

export function InventarioDex({
  formas,
  jogos,
  registros,
}: {
  formas: FormaDexDTO[];
  jogos: JogoPossuidoDTO[];
  registros: RegistroDexDTO[];
}) {
  const t = useTranslations("v2DexInventario");
  const td = useTranslations("dex");
  const tr = useTranslations("recusas");
  const router = useRouter();
  const avisar = useAviso();
  const rotulo = useRotuloForma(formas);
  const idPainelFiltros = useId();
  const { confirmar, dialogo: dialogoApagar } = useConfirmacao();

  const [filtros, setFiltros] = useState<FiltrosInventarioDex>(FILTROS_INVENTARIO_VAZIOS);
  // Só a visibilidade do painel muda abaixo de 768 px; a partir dali o CSS o mostra sempre.
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [aVista, setAVista] = useState(POR_VEZ);
  const [erro, setErro] = useState<string | null>(null);
  const [apagando, setApagando] = useState(false);
  const [corrigindo, setCorrigindo] = useState<LinhaInventarioDex | null>(null);

  const aoConcluir = useCallback(
    (movidos: number) => {
      avisar(t("movidos", { quantidade: movidos }), { tom: "sucesso" });
      router.refresh();
    },
    [avisar, router, t],
  );
  // 404 ou 409: outra aba moveu ou apagou o registro, e nada foi gravado. A
  // frase fica; a lista é lida de novo, para o próximo clique partir do que
  // o servidor tem.
  const aoRecusar = useCallback(
    (status: number) => {
      if (status === 404 || status === 409) router.refresh();
    },
    [router],
  );
  const { mover, ocupado: movendo, erro: erroMover, dialogo: dialogoMover } = useTransferencia(aoConcluir, { aoRecusar });
  const ocupado = movendo || apagando;

  const linhas = useMemo(() => linhasDoInventario(registros, formas, filtros), [registros, formas, filtros]);
  const totalPokemon = totalDePokemon(linhas);
  const noPainel = filtrosNoPainel(filtros);
  const nomeLocal = (id: string) => (id === LOCAL_HOME ? td("home") : (jogoDex(id)?.nome ?? id));

  function mudarFiltros(mudanca: Partial<FiltrosInventarioDex>) {
    setFiltros((atual) => ({ ...atual, ...mudanca }));
    setAVista(POR_VEZ);
  }

  async function apagarUm(linha: LinhaInventarioDex) {
    const nome = rotulo.nome(linha.forma);
    const ok = await confirmar({
      titulo: t("apagarTitulo", { nome }),
      descricao: t("apagarTexto"),
      rotuloConfirmar: t("apagarConfirmar"),
      perigoso: true,
    });
    if (!ok) return;
    setApagando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/dex/registros/${idParaApagar(linha.grupo)}`, { method: "DELETE" });
      if (!r.ok) {
        setErro(textoDaRecusa(tr, await r.json().catch(() => null), td("inventario.erro")));
        // 404: o registro já não existe (outra aba apagou ou moveu); a lista é lida de novo.
        if (r.status === 404) router.refresh();
        return;
      }
      avisar(t("apagado", { nome }), { tom: "sucesso" });
      router.refresh();
    } catch {
      setErro(td("inventario.erro"));
    } finally {
      setApagando(false);
    }
  }

  const erroVisivel = erro ?? erroMover;

  return (
    <div className={estilos.pagina}>
      <header className={estilos.cabecalho}>
        <div>
          <p className={estilos.sobretitulo}>Living Dex</p>
          <h1 className={estilos.titulo}>{td("inventario.titulo")}</h1>
          <p className={estilos.subtitulo}>{t("descricao")}</p>
        </div>
        <div className={estilos.acoesCab}>
          <BotaoLink href="/dex" pequeno>
            {t("voltarVisaoGeral")}
          </BotaoLink>
          <BotaoLink href="/dex/jogos" pequeno>
            {t("abrirJogos")}
          </BotaoLink>
        </div>
      </header>

      <section className={estilos.filtros} aria-label={t("filtros")}>
        <div className={estilos.busca}>
          <Campo
            type="search"
            rotulo={td("inventario.buscar")}
            placeholder={td("inventario.placeholderBuscar")}
            value={filtros.busca}
            onChange={(e) => mudarFiltros({ busca: e.target.value })}
            autoComplete="off"
            enterKeyHint="search"
          />
        </div>
        {/* Abaixo de 768 px o lugar e o "só shiny" moram num painel que abre por
            este botão (a busca fica à vista); a partir dali o botão some e o
            painel fica sempre aberto. O estado dos filtros é um só. */}
        <div className={estilos.alternarFiltros}>
          <Botao
            pequeno
            aria-expanded={filtrosAbertos}
            aria-controls={idPainelFiltros}
            onClick={() => setFiltrosAbertos((a) => !a)}
          >
            {noPainel > 0 ? t("filtrosAtivos", { total: noPainel }) : t("maisFiltros")}
          </Botao>
        </div>
        <div id={idPainelFiltros} className={estilos.painelFiltros} data-aberto={filtrosAbertos || undefined}>
          <Selecao
            rotulo={td("inventario.filtroLocal")}
            value={filtros.local}
            onChange={(e) => mudarFiltros({ local: e.target.value })}
          >
            <option value="">{td("inventario.todos")}</option>
            <option value={LOCAL_HOME}>{td("home")}</option>
            {jogos.map((j) => (
              <option key={j.jogoId} value={j.jogoId}>
                {j.nome}
              </option>
            ))}
          </Selecao>
          <button
            type="button"
            className={estilos.chip}
            aria-pressed={filtros.soShiny}
            onClick={() => mudarFiltros({ soShiny: !filtros.soShiny })}
          >
            {td("inventario.soShiny")}
          </button>
        </div>
        <div className={estilos.resumo}>
          <p className={estilos.nota} role="status">
            {t("total", { grupos: linhas.length, pokemon: totalPokemon })}
          </p>
          {noPainel > 0 && (
            <Botao pequeno variante="fantasma" onClick={() => mudarFiltros({ local: "", soShiny: false })}>
              {t("limparFiltros")}
            </Botao>
          )}
        </div>
      </section>

      {erroVisivel && (
        <AvisoEmLinha tom="perigo" papel="alert">
          {erroVisivel}
        </AvisoEmLinha>
      )}

      {registros.length === 0 ? (
        <AvisoEmLinha
          acao={
            <BotaoLink href="/dex/cadastrar" pequeno variante="primario">
              {t("cadastrar")}
            </BotaoLink>
          }
        >
          {td("inventario.vazio")}
        </AvisoEmLinha>
      ) : linhas.length === 0 ? (
        <AvisoEmLinha>{td("inventario.nenhum")}</AvisoEmLinha>
      ) : (
        <Painel as="section" className={estilos.lista} aria-label={t("lista")}>
          <ul className={estilos.linhas}>
            {linhas.slice(0, aVista).map((linha) => {
              const { grupo: g, forma } = linha;
              const nome = rotulo.nome(forma);
              const nomeAcessivel = g.shiny ? `${nome} (${td("trilha.shiny")})` : nome;
              const nomeForma = rotulo.forma(forma);
              const destinos = destinosDoGrupo(g.local, jogos);
              const detalhes = [g.capturadoEm, g.notas].filter(Boolean).join(" · ");
              return (
                <li key={g.chave} className={estilos.linha}>
                  <SpriteDex sprite={forma.sprite} shiny={g.shiny} tamanho={48} className={estilos.sprite} />
                  <div className={estilos.info}>
                    <p className={estilos.nome}>
                      <span className={`${estilos.numero} v2-num`}>#{String(forma.numero).padStart(4, "0")}</span>
                      <b>{forma.especie}</b>
                      {nomeForma && <span className={estilos.forma}>{nomeForma}</span>}
                      {g.shiny && <span className={estilos.seloShiny}>{td("trilha.shiny")}</span>}
                    </p>
                    <p className={estilos.lugares}>
                      <span>
                        <span className={estilos.rotuloLugar}>{td("inventario.colOrigem")}</span> {nomeLocal(g.jogoOrigem)}
                      </span>
                      <span>
                        <span className={estilos.rotuloLugar}>{td("inventario.colLocal")}</span>{" "}
                        <span className={estilos.local} data-home={g.local === LOCAL_HOME || undefined}>
                          {nomeLocal(g.local)}
                        </span>
                      </span>
                    </p>
                    {detalhes && <p className={estilos.detalhes}>{detalhes}</p>}
                  </div>
                  <span className={`${estilos.quantidade} v2-num`}>
                    <span className="v2-so-leitor">{td("inventario.colQtd")} </span>×{g.ids.length}
                  </span>
                  <div className={estilos.acoes}>
                    {g.local !== LOCAL_HOME && (
                      <Botao
                        pequeno
                        variante="primario"
                        className={estilos.enviar}
                        disabled={ocupado}
                        aria-label={t("enviarRotulo", { nome: nomeAcessivel })}
                        onClick={() => mover([idParaMover(g)], LOCAL_HOME)}
                      >
                        {td("inventario.enviarHome")}
                      </Botao>
                    )}
                    {destinos.length > 1 && (
                      <Selecao
                        aria-label={t("moverRotulo", { nome: nomeAcessivel })}
                        className={estilos.mover}
                        value=""
                        disabled={ocupado}
                        onChange={(e) => {
                          if (e.target.value) void mover([idParaMover(g)], e.target.value);
                        }}
                      >
                        <option value="">{td("inventario.moverPara")}</option>
                        {destinos.map((d) => (
                          <option key={d} value={d}>
                            {nomeLocal(d)}
                          </option>
                        ))}
                      </Selecao>
                    )}
                    <Botao
                      pequeno
                      disabled={ocupado}
                      aria-label={t("corrigirRotulo", { nome: nomeAcessivel, quantidade: g.ids.length })}
                      onClick={() => setCorrigindo(linha)}
                    >
                      {td("inventario.corrigir")}
                    </Botao>
                    <Botao
                      pequeno
                      variante="perigo"
                      disabled={ocupado}
                      aria-label={t("apagarRotulo", { nome: nomeAcessivel })}
                      onClick={() => void apagarUm(linha)}
                    >
                      {td("inventario.apagar")}
                    </Botao>
                  </div>
                </li>
              );
            })}
          </ul>
          {linhas.length > aVista && (
            <Botao variante="fantasma" onClick={() => setAVista((n) => n + POR_VEZ)}>
              {t("mostrarMais", { restantes: linhas.length - aVista })}
            </Botao>
          )}
        </Painel>
      )}

      {dialogoMover}
      {dialogoApagar}
      <CorrecaoGrupo
        linha={corrigindo}
        nome={corrigindo ? rotulo.nome(corrigindo.forma) : ""}
        jogos={jogos}
        aoFechar={(salvou) => {
          setCorrigindo(null);
          if (salvou) {
            avisar(t("corrigido"), { tom: "sucesso" });
            router.refresh();
          }
        }}
        aoRecusar={(status) => {
          if (status === 404) router.refresh();
        }}
      />
    </div>
  );
}
