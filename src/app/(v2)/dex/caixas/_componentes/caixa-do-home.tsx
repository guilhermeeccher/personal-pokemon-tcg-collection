"use client";

/**
 * Uma caixa do HOME na v2: 30 posições (6 × 5), cada uma uma vaga da Dex, um
 * buraco marcado ou um vazio de fim de grupo. É o item da `GradeVirtual` da
 * tela (`caixas-home.tsx`); o que ela desenha tem altura exata, e a conta
 * está em `geometria-caixa.ts`.
 *
 * - **Uma vaga é um botão**: tocar abre o cartão do Pokémon com "Registrar"
 *   (CX-03). Na v1 o clique no desktop ia direto ao cadastro e só o celular
 *   passava por um detalhe; a v2 usa o mesmo caminho em toda largura, como a
 *   Pokédex (`rules.md`, regra 37).
 * - **Um buraco também abre o cartão**, sem ação: é como o motivo (forma sem
 *   shiny, seção desligada) chega a quem não tem mouse. A v1 só o mostrava ao
 *   passar o mouse.
 * - **O número nacional fica escrito em toda vaga**: na v1 só o celular o
 *   mostrava, porque o mouse tinha o cartão; aqui nada é só de hover.
 * - O elemento focável da grade virtual (`celula`) é a própria caixa: as setas
 *   andam de caixa em caixa, e o Tab entra nas vagas **da caixa ativa** — as
 *   vagas das outras caixas montadas ficam fora da ordem do Tab (`tabIndex`
 *   -1), como a grade pede de qualquer célula (regra 28): uma parada de Tab
 *   por caixa a mais, e não 30 por caixa montada.
 */

import { memo, type PointerEvent } from "react";

import { numeroDex } from "../../pokedex/_componentes/celula-pokedex";
import { VAGAS_POR_CAIXA, type CaixaDex, type GrupoCaixa } from "@/lib/dominio/dex-caixas";
import { estadoDaVaga, type EstadoVagaDex, type MapaEstadosDex } from "@/lib/dominio/dex-estado";
import type { TrilhaDex } from "@/lib/dominio/dex-grade";
import type { FormaDexDTO } from "@/lib/dominio/tipos-cliente";

import { ATRIBUTO_CELULA } from "../../../_componentes/grade/grade-virtual";
import type { DadosCartaoPokemon } from "../../_componentes/cartao-pokemon";
import { SpriteDex } from "../../_componentes/sprite-dex";

import estilos from "./caixas.module.css";

/** Os textos que a caixa precisa, já traduzidos: assim ela não depende do idioma e o `memo` vale. */
export interface TextosCaixa {
  /** "Caixa 54". */
  caixaN: (numero: number) => string;
  /** "Regionais · Hisui 1". */
  nome: (caixa: CaixaDex<FormaDexDTO>) => string;
  /** "#0001–#0030", só nos grupos ordenados pelo número. */
  faixa: (inicio: number, fim: number) => string;
  /** "Nome da forma". */
  forma: (f: FormaDexDTO) => string;
  estado: (e: EstadoVagaDex) => string;
  buraco: (motivo: "sem_shiny" | "secao_desligada") => string;
  /** "Caixa 54 · posição 3". */
  lugar: (caixa: number, posicao: number) => string;
}

/** A faixa "#0001–#0030" só diz algo nos grupos ordenados pelo número; os outros vão por lançamento. */
const GRUPO_POR_NUMERO: ReadonlySet<GrupoCaixa> = new Set(["nacional", "genero"]);

/** O que a folha do Pokémon mostra de uma vaga, e para onde "Registrar" leva. */
export interface VagaAberta {
  dados: DadosCartaoPokemon;
  /** O número nacional para "Registrar"; nulo no buraco, onde nada se registra. */
  registrarNumero: number | null;
  formaId: string;
  chaveCaixa: string;
}

interface Props {
  caixa: CaixaDex<FormaDexDTO>;
  /**
   * Os dois campos da `celula` da grade, em separado: o objeto da grade é
   * novo a cada render e furaria o `memo`. `tabIndex` é 0 só na caixa ativa
   * (a da entrada do Tab) e vale para a caixa e para as 30 vagas dela.
   */
  tabIndex: 0 | -1;
  indice: number;
  trilha: TrilhaDex;
  estados: MapaEstadosDex;
  textos: TextosCaixa;
  aoAbrir: (v: VagaAberta) => void;
  previsao: (dados: DadosCartaoPokemon) => (e: PointerEvent<HTMLElement>) => void;
  fecharPrevisao: () => void;
}

export const chaveDaCaixa = (c: { numero: number }) => String(c.numero);

function CaixaDoHomeBruta({ caixa, tabIndex, indice, trilha, estados, textos, aoAbrir, previsao, fecharPrevisao }: Props) {
  const shiny = trilha === "shiny";
  const chaveCaixa = chaveDaCaixa(caixa);
  const nome = textos.nome(caixa);
  const idTitulo = `caixa-${chaveCaixa}`;
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
          <span className={estilos.nomeCaixa}>{nome}</span>
        </h2>
        {GRUPO_POR_NUMERO.has(caixa.grupo) && primeira !== undefined && ultima !== undefined && (
          <span className={`${estilos.faixa} v2-num`}>{textos.faixa(primeira, ultima)}</span>
        )}
      </header>
      <ol className={estilos.posicoes}>
        {caixa.lugares.map(({ forma: f, buraco }, i) => {
          const posicao = i + 1;
          const nomeForma = textos.forma(f);
          const lugar = textos.lugar(caixa.numero, posicao);
          if (buraco) {
            const motivo = textos.buraco(buraco);
            /* Buraco: o sprite é o normal, bem apagado (a trilha shiny não tem o dele). */
            const dados: DadosCartaoPokemon = { sprite: f.sprite, shiny: false, nome: nomeForma, linhas: [numeroDex(f.numero), motivo, lugar] };
            return (
              <li key={f.id}>
                <button
                  type="button"
                  className={`${estilos.vaga} ${estilos.buraco}`}
                  data-v2-vaga={f.id}
                  tabIndex={tabIndex}
                  aria-label={`${posicao}. ${nomeForma} — ${motivo}`}
                  aria-haspopup="dialog"
                  onClick={() => {
                    fecharPrevisao();
                    aoAbrir({ dados, registrarNumero: null, formaId: f.id, chaveCaixa });
                  }}
                  onPointerEnter={previsao(dados)}
                  onPointerLeave={fecharPrevisao}
                >
                  <SpriteDex sprite={f.sprite} shiny={false} tamanho={56} className={estilos.spriteVaga} apagado />
                </button>
              </li>
            );
          }
          const estado = estadoDaVaga(estados, f.id, trilha);
          const textoEstado = textos.estado(estado);
          const dados: DadosCartaoPokemon = { sprite: f.sprite, shiny, nome: nomeForma, linhas: [numeroDex(f.numero), textoEstado, lugar] };
          return (
            <li key={f.id}>
              <button
                type="button"
                className={estilos.vaga}
                data-estado={estado}
                data-v2-vaga={f.id}
                tabIndex={tabIndex}
                aria-label={`${posicao}. ${nomeForma} — ${textoEstado}`}
                aria-haspopup="dialog"
                onClick={() => {
                  fecharPrevisao();
                  aoAbrir({ dados, registrarNumero: f.numero, formaId: f.id, chaveCaixa });
                }}
                onPointerEnter={previsao(dados)}
                onPointerLeave={fecharPrevisao}
              >
                <SpriteDex sprite={f.sprite} shiny={shiny} tamanho={56} className={estilos.spriteVaga} apagado={estado === "falta"} />
                <span className={`${estilos.numeroVaga} v2-num`}>{numeroDex(f.numero).slice(1)}</span>
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

/**
 * `memo`: a grade virtual renderiza de novo a cada quadro de rolagem que muda
 * a faixa, e uma caixa montada que não mudou não tem de refazer as 30 vagas.
 */
export const CaixaDoHome = memo(CaixaDoHomeBruta);
