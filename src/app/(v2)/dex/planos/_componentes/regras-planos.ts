/**
 * O que a tela de planos da v2 decide, sem pele, para o teste cobrir sem
 * navegador. As regras das etapas são as de `lib/dominio/dex-etapas.ts`,
 * as mesmas que o servidor aplica; aqui só o que é da tela.
 *
 * - **Concluir oferece, nunca registra.** Uma tarefa de captura, evolução ou
 *   troca concluída oferece o cadastro já no jogo dela
 *   (`/dex/cadastrar?jogo=…&busca=…`); o Pokémon só entra quando a pessoa
 *   cadastra lá (AGENTS.md, "Plans, tasks and planning sessions").
 * - **As etapas só mudam com a tarefa aberta num plano ativo**
 *   (`recusaSeFechada` no servidor; aqui `etapasEditaveis`), e marcar a
 *   última não conclui a tarefa: a tela só avisa (`avisoTodasFeitas`).
 * - **Os formulários conferem antes de enviar** o que a rota conferiria com
 *   uma frase em inglês (`{ erro }` de `lerDadosPlano` e `lerDadosEtapa`):
 *   título vazio, fim antes do início, texto da etapa vazio ou longo demais.
 *   O que só o servidor sabe (o limite de 50 contra a lista de agora, a
 *   tarefa fechada por outra aba, a ordem velha) volta como recusa com chave
 *   e é traduzido por `recusa.ts`.
 */
import { MAX_DETALHE_ETAPA, MAX_ETAPAS_POR_TAREFA, MAX_TEXTO_ETAPA, todasFeitas } from "@/lib/dominio/dex-etapas";
import type { PlanoDexDTO, TarefaDexDTO } from "@/lib/dominio/tipos-cliente";

const OFERECE_CADASTRO: ReadonlySet<TarefaDexDTO["tipo"]> = new Set(["captura", "evolucao", "troca"]);

/** Concluir uma tarefa deste tipo oferece o cadastro do Pokémon. */
export function ofereceCadastro(tipo: TarefaDexDTO["tipo"]): boolean {
  return OFERECE_CADASTRO.has(tipo);
}

/**
 * O cadastro da tarefa, como a v1 monta: o jogo dela, e a busca pela espécie
 * quando a tarefa mira uma vaga só. Sem jogo e sem vaga única, o cadastro
 * abre sem filtro e a pessoa escolhe.
 */
export function hrefCadastroDaTarefa(
  tarefa: Pick<TarefaDexDTO, "jogoId" | "formaIds">,
  especieDe: (formaId: string) => string | undefined,
): string {
  const q = new URLSearchParams();
  if (tarefa.jogoId) q.set("jogo", tarefa.jogoId);
  const especie = tarefa.formaIds.length === 1 ? especieDe(tarefa.formaIds[0]) : undefined;
  if (especie) q.set("busca", especie);
  const query = q.toString();
  return query ? `/dex/cadastrar?${query}` : "/dex/cadastrar";
}

/** Tarefa aberta num plano ativo: só aí as etapas mudam. */
export function etapasEditaveis(plano: Pick<PlanoDexDTO, "status">, tarefa: Pick<TarefaDexDTO, "status">): boolean {
  return plano.status === "ativo" && tarefa.status === "aberta";
}

/**
 * O aviso de "todas as etapas feitas" ao lado de "Concluir": só numa tarefa
 * que ainda pode ser concluída. Quem conclui continua sendo a pessoa.
 */
export function avisoTodasFeitas(
  plano: Pick<PlanoDexDTO, "status">,
  tarefa: Pick<TarefaDexDTO, "status" | "etapas">,
): boolean {
  return etapasEditaveis(plano, tarefa) && todasFeitas(tarefa.etapas);
}

/** Cabe mais uma etapa na tarefa, pela lista que a tela tem. O servidor confere de novo. */
export function cabeMaisEtapa(quantas: number): boolean {
  return quantas < MAX_ETAPAS_POR_TAREFA;
}

/** Uma recusa que diz que a tela está velha (outra aba mexeu): a página é lida de novo. */
export function telaVelha(status: number): boolean {
  return status === 404 || status === 409;
}

export type ErroPlano = "tituloVazio" | "inicioVazio" | "fimAntesDoInicio";

/** O que a rota recusaria num plano novo, conferido antes de enviar. As datas vêm do campo de data (`AAAA-MM-DD` ou vazio). */
export function erroDoPlano(p: { titulo: string; inicio: string; fim: string }): ErroPlano | null {
  if (p.titulo.trim() === "") return "tituloVazio";
  if (p.inicio === "") return "inicioVazio";
  if (p.fim !== "" && p.fim < p.inicio) return "fimAntesDoInicio";
  return null;
}

export type ErroEtapa = "textoVazio" | "textoLongo" | "detalheLongo";

/** O que a rota recusaria numa etapa, com o mesmo aparo que ela faz antes de medir. */
export function erroDaEtapa(e: { texto: string; detalhe: string }): ErroEtapa | null {
  const texto = e.texto.trim();
  if (texto === "") return "textoVazio";
  if (texto.length > MAX_TEXTO_ETAPA) return "textoLongo";
  if (e.detalhe.trim().length > MAX_DETALHE_ETAPA) return "detalheLongo";
  return null;
}
