/**
 * Estado e regras do cadastro rápido por set (spec §5 Fase 1). Extraído
 * de `src/app/cadastro/set/page.tsx` para módulo puro e testado, fora de
 * componente React (AGENTS.md).
 *
 * Regra central, corrigida a partir de uso real com fichário físico: cada
 * linha só guarda o que o usuário efetivamente tocou (`undefined` = "usa
 * o default corrente"), e editar um campo de uma linha específica também
 * empurra o default corrente para a frente ("herdado da última carta
 * marcada"). O BUG que isso causava: uma linha que ganhou quantidade mas
 * nunca teve seu selo de variante/idioma/condição tocado continuava
 * `undefined` indefinidamente — então ela não só *exibia* o default
 * corrente, ela também era *gravada* com ele no momento do envio. Marcar
 * 40 cartas normais e, na 41ª, mudar para holo, silenciosamente
 * transformava as 40 anteriores em holo no payload de submissão, mesmo
 * sem o usuário ter tocado nelas.
 *
 * A correção: no instante em que uma linha recebe quantidade >= 1, os
 * defaults correntes são MATERIALIZADOS nela, campo a campo — variante,
 * idioma e condição que a linha ainda não tinha viram valores próprios
 * dela, imunes a qualquer mudança de default depois disso.
 * O default só continua valendo para linhas que ainda não foram marcadas.
 */

import {
  escolherVarianteDisponivel,
  type FlagsVariantesCatalogo,
} from "./variantes-catalogo";
import type { Condicao, Idioma, VarianteCopia } from "./enums";

export interface LinhaGrade {
  quantidade: number;
  variante?: VarianteCopia;
  idioma?: Idioma;
  condicao?: Condicao;
}

export interface DefaultsGrade {
  variante: VarianteCopia;
  idioma: Idioma;
  condicao: Condicao;
}

export interface EstadoGrade {
  linhas: Record<string, LinhaGrade>;
  defaults: DefaultsGrade;
}

export type AcaoGrade =
  | { tipo: "quantidade"; cartaId: string; valor: number; flags: FlagsVariantesCatalogo }
  | { tipo: "campoLinha"; cartaId: string; campo: keyof DefaultsGrade; valor: string }
  | { tipo: "campoDefault"; campo: keyof DefaultsGrade; valor: string }
  | { tipo: "reset" };

// Defaults iniciais: pt / normal / NM são o caso mais comum ao começar a
// digitar uma coleção nova (decisão de UX sem base explícita na spec —
// ver relatório da tarefa).
export const DEFAULTS_INICIAIS: DefaultsGrade = {
  variante: "normal",
  idioma: "pt",
  condicao: "NM",
};

export function estadoGradeInicial(defaults: DefaultsGrade = DEFAULTS_INICIAIS): EstadoGrade {
  return { linhas: {}, defaults };
}

export function reduzirGrade(estado: EstadoGrade, acao: AcaoGrade): EstadoGrade {
  switch (acao.tipo) {
    case "quantidade": {
      const existente = estado.linhas[acao.cartaId];
      // A materialização é campo a campo (correção de 2026-11-23): quem
      // ajustou só o idioma de uma carta antes de dar a quantidade deixava a
      // variante e a condição dela `undefined`, seguindo o padrão do lote
      // até o envio — o mesmo buraco de 2026-08-24, por outra porta. Agora
      // cada campo que a linha ainda não tem recebe o padrão corrente no
      // instante da marcação, e o que ela já tinha fica.
      if (acao.valor <= 0) {
        return {
          ...estado,
          linhas: { ...estado.linhas, [acao.cartaId]: { ...existente, quantidade: acao.valor } },
        };
      }
      return {
        ...estado,
        linhas: {
          ...estado.linhas,
          [acao.cartaId]: {
            ...existente,
            quantidade: acao.valor,
            // Nunca materializa uma variante impossível para a carta: cai
            // para a primeira disponível dela quando o default corrente não
            // existir naquela carta (caso Alakazam do Base Set, só holo).
            variante:
              existente?.variante ?? escolherVarianteDisponivel(estado.defaults.variante, acao.flags),
            idioma: existente?.idioma ?? estado.defaults.idioma,
            condicao: existente?.condicao ?? estado.defaults.condicao,
          },
        },
      };
    }
    case "campoLinha": {
      const existente = estado.linhas[acao.cartaId] ?? { quantidade: 0 };
      return {
        linhas: {
          ...estado.linhas,
          [acao.cartaId]: { ...existente, [acao.campo]: acao.valor },
        },
        // **Mexer numa linha NÃO mexe no padrão do lote** (decisão de
        // 2026-08-26). Até então, mudar a variante de uma
        // carta reescrevia o default e, com ele, o valor exibido em toda
        // carta ainda não marcada — parecia que a grade inteira mudava
        // sozinha. Pior: a carta marcada DEPOIS era gravada com a
        // variante herdada, sem o usuário ter tocado nela. As já marcadas
        // sempre estiveram protegidas (correção de 2026-08-24); o buraco
        // era o das não marcadas.
        //
        // A herança continua existindo, mas só pela barra do topo
        // (`campoDefault`), que é uma escolha explícita para o lote.
        defaults: estado.defaults,
      };
    }
    case "campoDefault":
      return { ...estado, defaults: { ...estado.defaults, [acao.campo]: acao.valor } };
    case "reset":
      return { linhas: {}, defaults: estado.defaults };
    default:
      return estado;
  }
}

export interface ItemSubmissaoGrade {
  cartaId: string;
  /** Idioma da ficha desta carta — a grade decide carta a carta, não o lote. */
  idiomaCatalogo: Idioma;
  quantidade: number;
  variante: VarianteCopia;
  idioma: Idioma;
  condicao: Condicao;
}

/**
 * Monta o payload de envio: só linhas com quantidade > 0. O fallback
 * `?? estado.defaults.X` cobre só a janela entre focar o campo de
 * quantidade e a materialização ocorrer (mesmo tick) — na prática, depois
 * da correção acima, toda linha marcada já chega aqui com campos
 * próprios.
 *
 * `idiomaCatalogoDe` diz a ficha de cada carta: num set traduzido pela
 * metade, uma grade em pt tem cartas identificadas pela ficha en
 * (`escolherLinhaPorCarta`), e a cópia precisa apontar para a linha que
 * existe.
 */
export function construirItensSubmissao(
  estado: EstadoGrade,
  idiomaCatalogoDe: (cartaId: string) => Idioma,
): ItemSubmissaoGrade[] {
  return Object.entries(estado.linhas)
    .filter(([, l]) => l.quantidade > 0)
    .map(([cartaId, l]) => ({
      cartaId,
      idiomaCatalogo: idiomaCatalogoDe(cartaId),
      quantidade: l.quantidade,
      variante: l.variante ?? estado.defaults.variante,
      idioma: l.idioma ?? estado.defaults.idioma,
      condicao: l.condicao ?? estado.defaults.condicao,
    }));
}
