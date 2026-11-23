"use client";

/**
 * Uma caixa do HOME na etapa 1 do Novo cadastro: as mesmas 30 posições e a
 * mesma altura da caixa de `/dex/caixas` (`geometria-caixa.ts`, do pacote
 * 5b), mas cada vaga **marca ou desmarca** o lote em vez de abrir o cartão.
 * É o item da `GradeVirtual` da tela (`novo-cadastro.tsx`).
 *
 * O que cada posição é:
 *
 * - **Em falta ou num jogo:** botão que alterna (`aria-pressed`). Marcada,
 *   ganha o anel e o visto; o estado também vai escrito no rótulo.
 * - **No HOME:** botão só informativo, sem `aria-pressed`: o toque (ou o
 *   foco de teclado) escreve na barra "— No HOME" e não seleciona nada
 *   (NCAD-02b). A exceção é a que já estava marcada quando chegou ao HOME
 *   (outra aba, depois do toque): segue com o anel e o toque a desmarca —
 *   senão ela só sairia do lote pela etapa 2.
 * - **Buraco** (forma sem shiny na trilha shiny, seção desligada): botão que
 *   só identifica, com o motivo, porque a v2 não guarda informação no hover.
 * - **Fora da busca:** aparece apagada, para a caixa não se desmontar, e não
 *   é botão — nem marca nem identifica.
 *
 * O foco de teclado identifica a vaga na barra; o foco do clique não (ver
 * `focoDeTeclado`). Como em `/dex/caixas`, a caixa é o elemento focável da
 * grade virtual e só a caixa ativa põe as 30 vagas na ordem do Tab.
 */

import { memo, type PointerEvent } from "react";

import { VAGAS_POR_CAIXA, type CaixaDex, type GrupoCaixa, type MotivoBuraco } from "@/lib/dominio/dex-caixas";
import { estadoDaVaga, type EstadoVagaDex, type MapaEstadosDex } from "@/lib/dominio/dex-estado";
import type { LadoGenero, TrilhaDex } from "@/lib/dominio/dex-grade";
import type { FormaDexDTO } from "@/lib/dominio/tipos-cliente";

import { ATRIBUTO_CELULA } from "../../../_componentes/grade/grade-virtual";
import type { DadosCartaoPokemon } from "../../_componentes/cartao-pokemon";
import { SpriteDex } from "../../_componentes/sprite-dex";
import { numeroDex } from "../../pokedex/_componentes/celula-pokedex";

import estilos from "./novo-cadastro.module.css";

/** Os textos da caixa, já traduzidos: assim ela não depende do idioma e o `memo` vale. */
export interface TextosCaixaEscolha {
  caixaN: (numero: number) => string;
  nome: (caixa: CaixaDex<FormaDexDTO>) => string;
  faixa: (inicio: number, fim: number) => string;
  forma: (f: FormaDexDTO) => string;
  estado: (e: EstadoVagaDex) => string;
  buraco: (m: MotivoBuraco) => string;
  lugar: (caixa: number, posicao: number) => string;
  marcada: string;
}

/** Uma vaga tocada ou focada: o que a barra escreve dela. */
export interface AlvoVaga {
  formaId: string;
  trilha: TrilhaDex;
  nome: string;
  caixa: number;
  posicao: number;
  chaveCaixa: string;
  /** O motivo, quando é buraco: a barra o escreve no lugar do estado. */
  buraco: MotivoBuraco | null;
}

/** O que o toque pede: alternar a vaga no lote, ou só identificá-la. */
export type AcaoVaga = { tipo: "alternar"; marcar: boolean } | { tipo: "identificar" };

/** O glifo de texto (U+FE0E): sem ele o Safari do iPhone pode desenhar ♂/♀ como emoji. */
export const SIMBOLO_GENERO: Record<LadoGenero, string> = { macho: "♂︎", femea: "♀︎" };

const GRUPO_POR_NUMERO: ReadonlySet<GrupoCaixa> = new Set(["nacional", "genero"]);

export const chaveDaCaixa = (c: { numero: number }) => String(c.numero);
/** O atributo que acha uma vaga no DOM, para o foco voltar a ela da etapa 2. */
export const ATRIBUTO_VAGA = "data-v2-vaga";

/**
 * O foco veio do teclado (Tab), e não de um clique? Só esse identifica a
 * vaga na barra: o clique já identifica pelo `onClick`, e escrever duas
 * vezes faria o leitor de tela repetir. Quem decide é a heurística do
 * navegador (`:focus-visible`); navegador que não conhece o seletor lança no
 * `matches`, e aí vale "não" — perde-se a linha para quem usa Tab, nunca o
 * clique.
 */
function focoDeTeclado(el: Element): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    return false;
  }
}

interface Props {
  caixa: CaixaDex<FormaDexDTO>;
  /** Os dois campos da `celula`, em separado: o objeto da grade é novo a cada render e furaria o `memo`. */
  tabIndex: 0 | -1;
  indice: number;
  trilha: TrilhaDex;
  estados: MapaEstadosDex;
  textos: TextosCaixaEscolha;
  /** Os ids marcados desta caixa nesta trilha, juntos por `|`: uma string, para o `memo` só redesenhar a caixa que mudou. */
  marcadas: string;
  /** Formas que casam com a busca; nulo sem busca (tudo casa). */
  casam: ReadonlySet<string> | null;
  /** Lado do par de gênero, quando as duas vagas do par estão nas caixas desta trilha. */
  generos: ReadonlyMap<string, LadoGenero>;
  aoTocar: (alvo: AlvoVaga, acao: AcaoVaga) => void;
  previsao: (dados: DadosCartaoPokemon) => (e: PointerEvent<HTMLElement>) => void;
  fecharPrevisao: () => void;
}

function CaixaEscolhaBruta({
  caixa,
  tabIndex,
  indice,
  trilha,
  estados,
  textos,
  marcadas,
  casam,
  generos,
  aoTocar,
  previsao,
  fecharPrevisao,
}: Props) {
  const shiny = trilha === "shiny";
  const chaveCaixa = chaveDaCaixa(caixa);
  const idTitulo = `nc-caixa-${chaveCaixa}`;
  const marcadasSet = new Set(marcadas ? marcadas.split("|") : []);
  const primeira = caixa.lugares[0]?.forma.numero;
  const ultima = caixa.lugares[caixa.lugares.length - 1]?.forma.numero;

  return (
    <section
      tabIndex={tabIndex}
      {...{ [ATRIBUTO_CELULA]: indice }}
      role="group"
      aria-labelledby={idTitulo}
      className={estilos.caixa}
      data-v2-caixa={chaveCaixa}
    >
      <header className={estilos.cabecalhoCaixa}>
        <h2 id={idTitulo} className={estilos.tituloCaixa}>
          <span className="v2-num">{textos.caixaN(caixa.numero)}</span>
          <span className={estilos.nomeCaixa}>{textos.nome(caixa)}</span>
        </h2>
        {GRUPO_POR_NUMERO.has(caixa.grupo) && primeira !== undefined && ultima !== undefined && (
          <span className={`${estilos.faixa} v2-num`}>{textos.faixa(primeira, ultima)}</span>
        )}
      </header>
      <ol className={estilos.posicoes}>
        {caixa.lugares.map(({ forma: f, buraco }, i) => {
          const posicao = i + 1;
          const nome = textos.forma(f);
          const lugar = textos.lugar(caixa.numero, posicao);
          const alvo: AlvoVaga = { formaId: f.id, trilha, nome, caixa: caixa.numero, posicao, chaveCaixa, buraco };
          const apagada = casam !== null && !casam.has(f.id);
          const lado = generos.get(f.id);
          const genero = lado && (
            <span aria-hidden className={estilos.genero}>
              {SIMBOLO_GENERO[lado]}
            </span>
          );

          if (buraco) {
            const motivo = textos.buraco(buraco);
            const dados: DadosCartaoPokemon = { sprite: f.sprite, shiny: false, nome, linhas: [numeroDex(f.numero), motivo, lugar] };
            return (
              <li key={f.id} data-apagada={apagada || undefined}>
                {apagada ? (
                  <span className={`${estilos.vaga} ${estilos.buraco}`} aria-label={`${posicao}. ${nome} — ${motivo}`}>
                    <SpriteDex sprite={f.sprite} shiny={false} tamanho={56} className={estilos.spriteVaga} apagado />
                  </span>
                ) : (
                  <button
                    type="button"
                    className={`${estilos.vaga} ${estilos.buraco}`}
                    {...{ [ATRIBUTO_VAGA]: `${f.id}:${trilha}` }}
                    tabIndex={tabIndex}
                    aria-label={`${posicao}. ${nome} — ${motivo}`}
                    onClick={() => {
                      fecharPrevisao();
                      aoTocar(alvo, { tipo: "identificar" });
                    }}
                    onFocus={(e) => {
                      if (focoDeTeclado(e.currentTarget)) aoTocar(alvo, { tipo: "identificar" });
                    }}
                    onPointerEnter={previsao(dados)}
                    onPointerLeave={fecharPrevisao}
                  >
                    <SpriteDex sprite={f.sprite} shiny={false} tamanho={56} className={estilos.spriteVaga} apagado />
                  </button>
                )}
              </li>
            );
          }

          const estado = estadoDaVaga(estados, f.id, trilha);
          const textoEstado = textos.estado(estado);
          const marcada = marcadasSet.has(f.id);
          const soInforma = estado === "no_home" && !marcada;
          const rotulo = `${posicao}. ${nome} — ${textoEstado}${marcada ? ` — ${textos.marcada}` : ""}`;
          const conteudo = (
            <>
              <SpriteDex
                sprite={f.sprite}
                shiny={shiny}
                tamanho={56}
                className={estilos.spriteVaga}
                apagado={estado === "falta" && !marcada}
              />
              <span className={`${estilos.numeroVaga} v2-num`}>{numeroDex(f.numero).slice(1)}</span>
              {genero}
              {marcada && (
                <span aria-hidden className={estilos.visto}>
                  ✓
                </span>
              )}
            </>
          );
          if (apagada) {
            return (
              <li key={f.id} data-apagada>
                <span className={estilos.vaga} data-estado={estado} data-marcada={marcada || undefined} aria-label={rotulo}>
                  {conteudo}
                </span>
              </li>
            );
          }
          const dados: DadosCartaoPokemon = {
            sprite: f.sprite,
            shiny,
            nome,
            linhas: marcada ? [numeroDex(f.numero), textoEstado, lugar, textos.marcada] : [numeroDex(f.numero), textoEstado, lugar],
          };
          return (
            <li key={f.id}>
              <button
                type="button"
                className={estilos.vaga}
                data-estado={estado}
                data-marcada={marcada || undefined}
                {...{ [ATRIBUTO_VAGA]: `${f.id}:${trilha}` }}
                tabIndex={tabIndex}
                aria-pressed={soInforma ? undefined : marcada}
                aria-label={rotulo}
                onClick={() => {
                  fecharPrevisao();
                  aoTocar(alvo, soInforma ? { tipo: "identificar" } : { tipo: "alternar", marcar: !marcada });
                }}
                onFocus={(e) => {
                  if (focoDeTeclado(e.currentTarget)) aoTocar(alvo, { tipo: "identificar" });
                }}
                onPointerEnter={previsao(dados)}
                onPointerLeave={fecharPrevisao}
              >
                {conteudo}
              </button>
            </li>
          );
        })}
        {Array.from({ length: VAGAS_POR_CAIXA - caixa.lugares.length }, (_, i) => (
          <li key={`vazia-${i}`} aria-hidden className={estilos.vazia} />
        ))}
      </ol>
    </section>
  );
}

/** `memo`: um toque redesenha a caixa que mudou, não as montadas todas. */
export const CaixaEscolha = memo(CaixaEscolhaBruta);
