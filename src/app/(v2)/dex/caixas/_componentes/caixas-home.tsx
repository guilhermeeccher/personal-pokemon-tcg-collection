"use client";

/**
 * `/dex/caixas` na v2 (pacote 5b): a Living Dex arrumada como as caixas do
 * HOME — 30 vagas por caixa (6 × 5), em grupos que começam em caixas fixas e
 * só crescem no fim (`dex-caixas.ts`). A leitura é a da v1
 * (`(v1)/v1/dex/caixas/caixas-home.tsx`), com as mesmas funções de domínio;
 * só o desenho e o toque mudam.
 *
 * - **Calculada, nunca guardada.** As caixas saem de `montarCaixasDex` a cada
 *   leitura, com a trilha, as seções e as caixas reservadas de agora. Nada
 *   daqui grava além de "Caixas antes da Nacional 1".
 * - **A numeração tem buracos de propósito**: as caixas de folga entre os
 *   grupos não aparecem, e o grupo de uma seção desligada some sem renumerar
 *   os outros. As duas trilhas têm o mesmo arranjo e moram no mesmo HOME: a
 *   shiny vem depois da normal, de `ANCORA_SHINY` em diante, cada caixa dela
 *   a da normal + 90 (`deslocamentoDaTrilha`), e só ela ganha a linha que o
 *   explica. Na shiny, a forma sem shiny é um buraco marcado.
 * - **As caixas são a `GradeVirtual`** (regra 13): uma trilha passa de 2.000
 *   vagas, e montá-las todas estoura o orçamento de nós e de toque. A conta
 *   da altura de uma caixa está em `geometria-caixa.ts`; abaixo de
 *   `LIMIAR_CAIXAS` (300 vagas) monta tudo. "Ir para" rola até a primeira
 *   caixa de um grupo, montando-a antes.
 */

import { useTranslations } from "next-intl";
import { useCallback, useMemo, useRef, useState } from "react";

import { useNomeCaixa } from "@/app/_comum/dex/use-nome-caixa";
import { useRotuloForma } from "@/app/_comum/dex/use-rotulo-forma";
import {
  ANCORA_SHINY,
  deslocamentoDaTrilha,
  GRUPOS_CAIXA,
  montarCaixasDex,
  vagasNaCaixa,
} from "@/lib/dominio/dex-caixas";
import { type EstadoVagaDex, mapearEstadosDex } from "@/lib/dominio/dex-estado";
import type { TrilhaDex } from "@/lib/dominio/dex-grade";
import type { SecoesContadas } from "@/lib/dominio/dex-secoes";
import type { FormaDexDTO, RegistroDexDTO } from "@/lib/dominio/tipos-cliente";

import { BotaoLink } from "../../../_componentes/primitivos/botao";
import { type ControleGradeVirtual, GradeVirtual } from "../../../_componentes/grade/grade-virtual";
import { AvisoEmLinha } from "../../../_componentes/primitivos/painel";
import { Segmentado } from "../../../_componentes/primitivos/segmentado";
import { hrefCadastroDex } from "../../_componentes/caminhos";
import { FolhaPokemon, useCartaoFlutuante } from "../../_componentes/cartao-pokemon";

import { CaixaDoHome, chaveDaCaixa, type TextosCaixa, type VagaAberta } from "./caixa-do-home";
import estilos from "./caixas.module.css";
import { LIMIAR_CAIXAS, MIN_CAIXA, ALTURA_EXTRA_CAIXA, PROPORCAO_CAIXA } from "./geometria-caixa";
import { CampoReservadas } from "./reservadas";

const ESTADOS_LEGENDA: readonly EstadoVagaDex[] = ["falta", "no_jogo", "no_home"];
const VAO_GRADE = 16;

export function CaixasHome({
  formas,
  secoes,
  registros,
  caixasReservadas,
}: {
  formas: FormaDexDTO[];
  secoes: SecoesContadas;
  registros: RegistroDexDTO[];
  /** Caixas do HOME antes da Nacional 1: desloca o número de toda caixa, nas duas trilhas. */
  caixasReservadas: number;
}) {
  const t = useTranslations("v2DexCaixas");
  const td = useTranslations("dex");
  const rotulo = useRotuloForma(formas);
  const nomeCaixa = useNomeCaixa();
  const [trilha, setTrilha] = useState<TrilhaDex>("normal");
  const [aberta, setAberta] = useState<VagaAberta | null>(null);
  const grade = useRef<ControleGradeVirtual>(null);
  const { abrir: previsao, fechar: fecharPrevisao, cartao } = useCartaoFlutuante();

  const estados = useMemo(() => mapearEstadosDex(registros), [registros]);
  const caixas = useMemo(
    () => montarCaixasDex(formas, trilha, secoes, caixasReservadas),
    [formas, trilha, secoes, caixasReservadas],
  );
  const totalVagas = useMemo(() => caixas.reduce((soma, c) => soma + vagasNaCaixa(c), 0), [caixas]);

  /* O que a caixa escreve: tudo já traduzido, e estável enquanto o idioma e o catálogo não mudam. */
  const textos = useMemo<TextosCaixa>(
    () => ({
      caixaN: (numero) => td("caixas.caixaN", { numero: String(numero) }),
      nome: nomeCaixa.nome,
      faixa: (inicio, fim) => td("caixas.faixa", { inicio: String(inicio).padStart(4, "0"), fim: String(fim).padStart(4, "0") }),
      forma: rotulo.nome,
      estado: (e) => td(`estado.${e}`),
      buraco: (m) => td(`caixas.buraco.${m}`),
      lugar: (caixa, posicao) => td("caixas.posicao", { caixa: String(caixa), posicao: String(posicao) }),
    }),
    [td, nomeCaixa.nome, rotulo.nome],
  );

  /* Em qual caixa abre cada atalho de grupo: a primeira daquele grupo, se a trilha tem alguma. */
  const saltos = useMemo(
    () =>
      GRUPOS_CAIXA.flatMap((grupo) => {
        const i = caixas.findIndex((c) => c.grupo === grupo);
        return i < 0 ? [] : [{ grupo, chave: chaveDaCaixa(caixas[i]) }];
      }),
    [caixas],
  );

  /*
   * "Ir para": monta a caixa, rola até ela, foca (o foco mantém a caixa
   * montada enquanto a rolagem chega) e a põe no alto da janela. A grade só
   * rola até mostrar, e o grupo pedido quase nunca está perto.
   */
  async function irPara(chave: string) {
    const el = await grade.current?.elementoDe(chave);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "start", behavior: "instant" });
  }

  // A última vaga aberta, para o foco voltar a ela depois de `aberta` voltar a nulo.
  const ultimaAberta = useRef<VagaAberta | null>(null);
  const aoAbrir = useCallback((v: VagaAberta) => {
    ultimaAberta.current = v;
    setAberta(v);
  }, []);

  /* O foco volta à vaga que abriu o cartão; se ela saiu do DOM, à caixa dela, montada de novo. */
  const devolverFoco = useCallback(async () => {
    const v = ultimaAberta.current;
    if (!v) return null;
    const vaga = document.querySelector<HTMLElement>(`[data-v2-vaga="${CSS.escape(v.formaId)}"]`);
    return vaga ?? (await grade.current?.elementoDe(v.chaveCaixa)) ?? null;
  }, []);

  return (
    <div className={estilos.pagina}>
      <header className={estilos.cabecalho}>
        <div>
          <p className={estilos.sobretitulo}>Living Dex</p>
          <h1 className={estilos.titulo}>{td("caixas.titulo")}</h1>
          <p className={estilos.subtitulo}>{t("descricao")}</p>
        </div>
        <div className={estilos.acoes}>
          <BotaoLink href="/dex/recebidos" pequeno>
            {t("recebidos")}
          </BotaoLink>
          <BotaoLink href="/dex/pokedex" pequeno>
            {t("pokedex")}
          </BotaoLink>
          <BotaoLink href="/dex" pequeno>
            {t("visaoGeral")}
          </BotaoLink>
        </div>
      </header>

      <section className={estilos.controles} aria-label={td("caixas.titulo")}>
        <div className={estilos.linhaControles}>
          <Segmentado
            rotulo={td("pokedex.trilha")}
            opcoes={(["normal", "shiny"] as const).map((v) => ({ valor: v, rotulo: td(`trilha.${v}`) }))}
            valor={trilha}
            aoMudar={setTrilha}
          />
          <p className={estilos.contagem} role="status">
            {td("caixas.contagem", { caixas: String(caixas.length), vagas: String(totalVagas) })}
          </p>
        </div>
        <CampoReservadas valor={caixasReservadas} />
        {saltos.length > 0 && (
          <nav className={estilos.chips} aria-label={td("caixas.irPara")}>
            {saltos.map(({ grupo, chave }) => (
              <button key={grupo} type="button" className={estilos.chip} onClick={() => irPara(chave)}>
                {td(`caixas.grupo.${grupo}`)}
              </button>
            ))}
          </nav>
        )}
        <p className={estilos.nota}>{td("caixas.folga")}</p>
        {trilha === "shiny" && (
          <p className={estilos.nota}>
            {td("caixas.shiny", {
              caixa: String(caixasReservadas + ANCORA_SHINY),
              deslocamento: String(deslocamentoDaTrilha("shiny")),
            })}
          </p>
        )}
        {/* Nada só de cor nem só de mouse: a legenda escreve o que cada moldura é. */}
        <ul className={estilos.legenda} aria-label={t("legenda")}>
          {ESTADOS_LEGENDA.map((e) => (
            <li key={e} className={estilos.legendaItem}>
              <span aria-hidden className={estilos.amostra} data-estado={e} />
              {td(`estado.${e}`)}
            </li>
          ))}
          <li className={estilos.legendaItem}>
            <span aria-hidden className={`${estilos.amostra} ${estilos.amostraBuraco}`} />
            <span>
              <b>{t("legendaBuraco")}</b>: {t("legendaBuracoTexto")}
            </span>
          </li>
        </ul>
      </section>

      {formas.length === 0 ? (
        <AvisoEmLinha>{td("pokedex.catalogoVazio")}</AvisoEmLinha>
      ) : caixas.length === 0 ? (
        <AvisoEmLinha>{td("caixas.vazio")}</AvisoEmLinha>
      ) : (
        <GradeVirtual
          ref={grade}
          itens={caixas}
          chaveDe={chaveDaCaixa}
          minCelula={MIN_CAIXA}
          vaoX={VAO_GRADE}
          vaoY={VAO_GRADE}
          proporcao={PROPORCAO_CAIXA}
          alturaExtra={ALTURA_EXTRA_CAIXA}
          limiar={LIMIAR_CAIXAS}
          manterMontadas={aberta ? [aberta.chaveCaixa] : undefined}
          rotulo={t("grade")}
          renderizar={(caixa, celula) => (
            <CaixaDoHome
              caixa={caixa}
              celula={celula}
              trilha={trilha}
              estados={estados}
              textos={textos}
              aoAbrir={aoAbrir}
              previsao={previsao}
              fecharPrevisao={fecharPrevisao}
            />
          )}
        />
      )}

      <FolhaPokemon
        dados={aberta?.dados ?? null}
        onFechar={() => setAberta(null)}
        devolverFocoPara={devolverFoco}
        acoes={
          aberta?.registrarNumero != null && (
            <BotaoLink href={hrefCadastroDex(aberta.registrarNumero)} variante="primario">
              {td("pokedex.registrarEsta")}
            </BotaoLink>
          )
        }
      />
      {cartao}
    </div>
  );
}
