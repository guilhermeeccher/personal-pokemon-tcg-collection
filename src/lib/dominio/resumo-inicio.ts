/**
 * Página inicial (`/`) — o resumo das duas visões gerais. Módulo puro.
 *
 * ## Por que existe (decisão de 2026-10-24)
 *
 * A página inicial era um menu: seis cartões com parágrafo, todos do TCG,
 * repetindo a navegação, e no celular seis blocos antes de qualquer coisa
 * útil. Agora cada módulo tem três atalhos e um resumo da sua visão geral
 * (`/inventario/visao-geral` e `/dex`).
 *
 * ## Os números são os das visões gerais
 *
 * Divergência entre a página inicial e a visão geral é bug. Os cálculos
 * principais reutilizam as funções de domínio que a `visao-geral-dex.tsx`
 * chama, sobre os mesmos dados:
 *
 * - progresso no HOME: `progressoDex`;
 * - recebidos: `pendentesAGuardar`, a mesma rodada de `montarRecebidos`;
 * - levar ao HOME: `oportunidadesHome`;
 * - troféus: `comTrofeusDoHome`, `estanteDeTrofeus` e `proximoTrofeuHome`.
 *
 * Os filtros e as contagens da composição reproduzem aqui as regras da
 * visão geral, e são protegidos pelos testes de paridade de
 * `resumo-inicio.test.ts` — quem mudar uma regra lá tem de mudar aqui:
 *
 * - a vista principal (`vistaDaCategoria === "principal"`) antes do
 *   progresso;
 * - só os troféus do HOME e dos jogos do usuário, antes de calculá-los;
 * - levar ao HOME é a soma das vagas dos grupos, não o número de grupos
 *   (uma vaga por trilha está num só grupo);
 * - `todosDoHome` pela lista do HOME, nunca pelo próximo nulo;
 * - progresso do plano: tarefas que não estão abertas (feitas **e**
 *   descartadas) sobre o total.
 *
 * ## Por que no servidor
 *
 * A `/dex` manda ao navegador as ~1.220 formas e todos os registros. A página
 * inicial é a primeira tela no celular e manda só o resumo
 * (`ResumoDexInicioDTO`): o cálculo fica no servidor.
 */
import { naoTransferiveis } from "./dex-disponibilidade";
import { mapearEstadosDex, progressoDex } from "./dex-estado";
import { progressoEtapas } from "./dex-etapas";
import { vistaDaCategoria } from "./dex-grade";
import { oportunidadesHome } from "./dex-inventario";
import { jogoDex } from "./dex-jogos";
import { pendentesAGuardar } from "./dex-recebidos";
import type { SecoesContadas } from "./dex-secoes";
import { JOGO_HOME, type IdiomaTrofeu } from "./dex-trofeus";
import { comTrofeusDoHome, proximoTrofeuHome } from "./dex-trofeus-home";
import { estanteDeTrofeus } from "./dex-visao-geral";
import type {
  ColecaoInicioDTO,
  FormaDexDTO,
  JogoPossuidoDTO,
  PlanoDexDTO,
  RegistroDexDTO,
  ResumoDexInicioDTO,
  TrofeuDexDTO,
} from "./tipos-cliente";

/** Quantos planos e quantas tarefas abertas por plano a página inicial mostra. */
export const LIMITES_PLANOS_INICIO = { planos: 2, tarefas: 2 } as const;

/** Coleções listadas em "Suas coleções"; o resto fica no "Ver todas". */
export const COLECOES_NO_INICIO = 4;

/** Nome do jogo de uma tarefa, como a `/dex` escreve; `null` sem jogo. */
function nomeDoJogo(jogoId: string | null): string | null {
  if (jogoId === null) return null;
  return jogoId === JOGO_HOME ? "Pokémon HOME" : (jogoDex(jogoId)?.nome ?? jogoId);
}

/**
 * Os planos ativos da página inicial: os primeiros `limites.planos`, na
 * ordem recebida (a de `listarPlanos`: ativos primeiro, `inicio` e
 * `criado_em` mais recentes antes), cada um com as primeiras
 * `limites.tarefas` tarefas abertas por `ordem`. Plano que não é ativo não
 * entra, nem conta em `planosAlem`.
 */
export function planosNoInicio(
  planos: readonly PlanoDexDTO[],
  limites: { planos: number; tarefas: number } = LIMITES_PLANOS_INICIO,
): Pick<ResumoDexInicioDTO, "planos" | "planosAlem"> {
  const ativos = planos.filter((p) => p.status === "ativo");
  const mostrados = ativos.slice(0, limites.planos).map((p) => {
    const abertas = p.tarefas.filter((x) => x.status === "aberta").sort((a, b) => a.ordem - b.ordem);
    const escolhidas = abertas.slice(0, limites.tarefas);
    return {
      id: p.id,
      titulo: p.titulo,
      feitas: p.tarefas.filter((x) => x.status !== "aberta").length,
      total: p.tarefas.length,
      tarefas: escolhidas.map((x) => {
        const etapas = progressoEtapas(x.etapas);
        return {
          id: x.id,
          titulo: x.titulo,
          jogoNome: nomeDoJogo(x.jogoId),
          etapasFeitas: etapas.feitas,
          etapasTotal: etapas.total,
        };
      }),
      abertasAlem: abertas.length - escolhidas.length,
    };
  });
  return { planos: mostrados, planosAlem: ativos.length - mostrados.length };
}

/**
 * As coleções de "Suas coleções": as primeiras `limite`, só com os campos da
 * tela, e quantas sobram. O corte é só desta lista — o "Quase lá" recebe
 * todas as coleções, antes dele.
 */
export function colecoesNoInicio(
  colecoes: readonly ColecaoInicioDTO[],
  limite: number = COLECOES_NO_INICIO,
): { colecoes: ColecaoInicioDTO[]; sobram: number } {
  const mostradas = colecoes.slice(0, limite).map((c) => ({
    id: c.id,
    nome: c.nome,
    tipo: c.tipo,
    vagasPreenchidas: c.vagasPreenchidas,
    totalVagas: c.totalVagas,
  }));
  return { colecoes: mostradas, sobram: colecoes.length - mostradas.length };
}

export interface EntradaResumoDexInicio {
  formas: readonly Pick<FormaDexDTO, "id" | "numero" | "especie" | "forma" | "categoria" | "shinyObtenivel">[];
  secoes: SecoesContadas;
  registros: readonly Omit<RegistroDexDTO, "atualizadoEm">[];
  jogos: readonly Pick<JogoPossuidoDTO, "jogoId">[];
  trofeus: readonly TrofeuDexDTO[];
  planos: readonly PlanoDexDTO[];
  idioma: IdiomaTrofeu;
}

/** O resumo da Living Dex da página inicial, com os números da `/dex`. */
export function resumoDexInicio({
  formas,
  secoes,
  registros,
  jogos,
  trofeus: trofeusBrutos,
  planos,
  idioma,
}: EntradaResumoDexInicio): ResumoDexInicioDTO {
  const mapa = mapearEstadosDex(registros);

  const principal = formas.filter((f) => vistaDaCategoria(f.categoria) === "principal");
  const progresso = progressoDex(principal, mapa, secoes);

  /* Só os troféus do HOME e dos jogos do usuário, como na `/dex`. */
  const meus = new Set([JOGO_HOME, ...jogos.map((j) => j.jogoId)]);
  const trofeus = comTrofeusDoHome(
    trofeusBrutos.filter((x) => meus.has(x.jogoId)),
    formas,
    mapa,
    secoes,
  );
  const doHome = trofeus.filter((x) => x.jogoId === JOGO_HOME);
  const proximo = proximoTrofeuHome(doHome, formas, mapa, secoes);

  return {
    progresso: {
      normal: { noHome: progresso.normal.noHome, contam: progresso.normal.contam },
      shiny: { noHome: progresso.shiny.noHome, contam: progresso.shiny.contam },
    },
    recebidos: pendentesAGuardar(registros).length,
    levarAoHome: oportunidadesHome(registros, naoTransferiveis()).reduce((s, g) => s + g.itens.length, 0),
    semJogos: jogos.length === 0,
    estante: estanteDeTrofeus(trofeus),
    proximoTrofeu: proximo && {
      titulo: proximo.trofeu.textos[idioma].titulo,
      nivel: proximo.trofeu.nivel,
      feito: proximo.feito,
      alvo: proximo.alvo,
    },
    /* Pela lista, não pelo próximo nulo: um troféu de alvo 0 (região sem vaga
       que conte) não é próximo e também não está conquistado. */
    todosDoHome: doHome.length > 0 && doHome.every((x) => x.obtido),
    ...planosNoInicio(planos),
  };
}
