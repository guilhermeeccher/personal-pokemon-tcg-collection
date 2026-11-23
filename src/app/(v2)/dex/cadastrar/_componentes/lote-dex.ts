/**
 * O lote do cadastro por jogo na v2 (`/dex/cadastrar`, pacote 5c). Módulo
 * puro: o que a tela faz com as quantidades, a lista à vista e a resposta da
 * rota, sem React e sem banco.
 *
 * A regra é a da v1 (`(v1)/v1/dex/cadastrar/cadastro-por-jogo.tsx`), aqui
 * separada para ter teste: o lote mora num mapa por forma, independente do
 * jogo escolhido e do filtro — trocar de jogo ou filtrar não apaga o que se
 * digitou, e o que sai da vista continua no lote (a barra diz quantos).
 */
import type { DisponibilidadeForma } from "@/lib/dominio/dex-disponibilidade";
import { filtrarFormasDex, type TrilhaDex, type VistaDex } from "@/lib/dominio/dex-grade";
import { MAX_QUANTIDADE_POR_LINHA, type LoteCadastroDex } from "@/lib/dominio/dex-registro";
import { categoriaConta, type SecoesContadas } from "@/lib/dominio/dex-secoes";
import { especiesTrancadas, type IdiomaTrofeu } from "@/lib/dominio/dex-trofeus";
import type { FormaDexDTO, TrofeuDexDTO } from "@/lib/dominio/tipos-cliente";

/** Quantos de cada forma entram no lote. Uma forma sem nenhum não tem entrada. */
export type QuantidadesDex = Readonly<Record<string, { readonly normal: number; readonly shiny: number }>>;

/** O que o usuário já tem de cada forma, por trilha (os registros, contados no servidor). */
export type TenhoDex = Readonly<Record<string, { readonly normal: number; readonly shiny: number }>>;

/**
 * O número de um campo de quantidade. O campo é texto com teclado numérico
 * (não `type="number"`, que aceita "e", "-" e vírgula e devolve vazio para
 * eles): só os dígitos contam, e o teto é o da rota, `MAX_QUANTIDADE_POR_LINHA`
 * — digitar 999 por engano não cria 999 registros.
 */
export function quantidadeDoTexto(texto: string): number {
  const digitos = texto.replace(/\D/g, "").slice(0, 3);
  return digitos === "" ? 0 : Math.min(MAX_QUANTIDADE_POR_LINHA, Number(digitos));
}

/** O − e o + do stepper: dentro de 0..`MAX_QUANTIDADE_POR_LINHA`. */
export function ajustarQuantidade(atual: number, delta: number): number {
  return Math.min(Math.max(atual + delta, 0), MAX_QUANTIDADE_POR_LINHA);
}

/**
 * O lote com a quantidade de uma trilha de uma forma trocada. Uma forma que
 * volta a zero nas duas trilhas sai do mapa (não vai no corpo como item
 * vazio). Devolve o mesmo objeto quando nada muda, para o React não
 * redesenhar à toa.
 */
export function comQuantidade(atual: QuantidadesDex, formaId: string, trilha: TrilhaDex, valor: number): QuantidadesDex {
  const antes = atual[formaId] ?? { normal: 0, shiny: 0 };
  if (antes[trilha] === valor) return atual;
  const linha = { ...antes, [trilha]: valor };
  const proximo = { ...atual };
  if (linha.normal + linha.shiny === 0) delete proximo[formaId];
  else proximo[formaId] = linha;
  return proximo;
}

/** Quantos Pokémon o lote cria: um registro por unidade, nas duas trilhas. */
export function totalDoLote(q: QuantidadesDex): number {
  let total = 0;
  for (const linha of Object.values(q)) total += linha.normal + linha.shiny;
  return total;
}

/** O corpo de `POST /api/dex/registros`, o mesmo da v1: `{ jogoId, itens: [{ formaId, normal, shiny }] }`. */
export function corpoDoLote(jogoId: string, q: QuantidadesDex): LoteCadastroDex {
  return {
    jogoId,
    itens: Object.entries(q).map(([formaId, linha]) => ({ formaId, normal: linha.normal, shiny: linha.shiny })),
  };
}

/** Quantas formas do lote não estão na lista à vista (outro filtro, outra vista, fora do catálogo do jogo). */
export function marcadasForaDaVista(q: QuantidadesDex, visiveis: readonly { id: string }[]): number {
  const aVista = new Set(visiveis.map((f) => f.id));
  return Object.keys(q).filter((id) => !aVista.has(id)).length;
}

/**
 * O jogo com que a tela abre: o de `?jogo=` quando ele está entre as opções
 * (um jogo possuído e ativo, ou o HOME), senão a primeira — como na v1. O fim
 * de uma tarefa de plano chega com o jogo dela; um jogo parado ou removido
 * desde então cai na primeira opção, sem erro.
 */
export function jogoEscolhido(opcoes: readonly { id: string }[], pedido: string): string {
  return opcoes.some((o) => o.id === pedido) ? pedido : (opcoes[0]?.id ?? "");
}

/**
 * O destino do lote depois da abertura: o jogo escolhido enquanto ele está
 * entre as opções, senão nenhum. Diferente da abertura, aqui **não** cai na
 * primeira opção: o jogo some da lista quando é parado ou removido em outra
 * aba (a tela relê depois de uma recusa), e trocar o destino em silêncio faria
 * o clique seguinte gravar o lote inteiro num jogo que a pessoa não escolheu.
 * Sem jogo, a tela pede a escolha e o "Cadastrar" fica travado.
 */
export function jogoAtual(opcoes: readonly { id: string }[], escolhido: string): string | null {
  return opcoes.some((o) => o.id === escolhido) ? escolhido : null;
}

export interface FiltroCadastroDex {
  vista: VistaDex;
  busca: string;
  secoes: SecoesContadas;
  /** O catálogo do jogo (`catalogoDoJogo`); nulo = jogo sem catálogo, ou o HOME: mostra todas. */
  catalogo: ReadonlyMap<string, DisponibilidadeForma> | null;
  mostrarTodas: boolean;
  soQueNaoTenho: boolean;
  tenho: TenhoDex;
}

/**
 * A lista à vista, na ordem recebida (o servidor manda por nome). A mesma
 * conta da v1:
 *
 * - a vista (principal ou cosméticas) e a busca por nome ou número
 *   (`filtrarFormasDex`, que acha também o nome da forma em português);
 * - uma seção desligada na Pokédex some daqui (`categoriaConta`);
 * - o catálogo do jogo é o filtro padrão, **não uma recusa**: "Mostrar todas"
 *   abre o resto, para o Pokémon que chegou de fora, e a rota aceita
 *   (AGENTS.md, "Each game has a catalog");
 * - "Só o que não tenho": nenhum registro da forma, em trilha nenhuma.
 */
export function formasVisiveis(formas: readonly FormaDexDTO[], filtro: FiltroCadastroDex): FormaDexDTO[] {
  return filtrarFormasDex(formas, { vista: filtro.vista, regiao: "todas", categoria: "todas", busca: filtro.busca }).filter(
    (f) =>
      categoriaConta(f.categoria, filtro.secoes) &&
      (filtro.mostrarTodas || !filtro.catalogo || filtro.catalogo.has(f.id)) &&
      (!filtro.soQueNaoTenho || !filtro.tenho[f.id]),
  );
}

/**
 * Espécie trancada no jogo → os títulos dos checkpoints que faltam, juntos
 * por " + ". `checkpoints` são os troféus-checkpoint ainda não conquistados
 * (o servidor já filtra), então o conjunto de obtidos é vazio. Trancada
 * **marca, nunca recusa** (AGENTS.md, "Trophies"): o Pokémon pode ter chegado
 * por troca. Um troféu sem texto no idioma cai no id, como na v1.
 */
export function rotulosTrancadas(
  checkpoints: readonly TrofeuDexDTO[],
  jogoId: string,
  idioma: IdiomaTrofeu,
): Map<number, string> {
  const titulo = new Map(checkpoints.map((c) => [c.id, c.textos[idioma]?.titulo ?? c.id]));
  const r = new Map<number, string>();
  for (const [numero, ids] of especiesTrancadas(checkpoints, jogoId, new Set())) {
    r.set(numero, ids.map((id) => titulo.get(id) ?? id).join(" + "));
  }
  return r;
}

/** Uma marca da célula, na ordem em que aparece. */
export type SeloCadastro =
  | { tipo: "foraDoJogo" }
  | { tipo: "como"; como: "troca" | "evento" }
  | { tipo: "trancada"; checkpoint: string }
  | { tipo: "naoVaiAoHome" }
  | { tipo: "semShiny" };

/**
 * As marcas de uma forma no jogo escolhido — as da v1, mais "sem shiny":
 *
 * - **fora do jogo**: o jogo tem catálogo e a forma não está nele (só aparece
 *   com "Mostrar todas");
 * - **troca** ou **evento**: como se obtém no jogo (livre não marca);
 * - **trancada**: um checkpoint do jogo ainda não conquistado libera a espécie;
 * - **não vai ao HOME**: o HOME não recebe essa forma daquele jogo;
 * - **sem shiny**: a forma nunca saiu em shiny. Só informa: a rota aceita, e
 *   na dúvida a forma conta como obtenível (AGENTS.md, "Two tracks").
 *
 * Nenhuma recusa: a tela marca, quem decide é a pessoa.
 */
export function selosDaForma(
  forma: Pick<FormaDexDTO, "id" | "numero" | "shinyObtenivel">,
  catalogo: ReadonlyMap<string, DisponibilidadeForma> | null,
  trancadas: ReadonlyMap<number, string>,
): SeloCadastro[] {
  const selos: SeloCadastro[] = [];
  const disponibilidade = catalogo?.get(forma.id);
  if (catalogo && !disponibilidade) selos.push({ tipo: "foraDoJogo" });
  if (disponibilidade && disponibilidade.como !== "livre") selos.push({ tipo: "como", como: disponibilidade.como });
  const trancada = trancadas.get(forma.numero);
  if (trancada) selos.push({ tipo: "trancada", checkpoint: trancada });
  if (disponibilidade && !disponibilidade.transferivel) selos.push({ tipo: "naoVaiAoHome" });
  if (!forma.shinyObtenivel) selos.push({ tipo: "semShiny" });
  return selos;
}

/* ---------------------------------------------------------- Envio */

/** Por que o "Cadastrar" está travado agora, ou `null` quando pode enviar. */
export type BloqueioCadastro = "vazio" | "semJogo" | "enviando" | "relendo" | "semReleitura";

/**
 * Se o lote pode ir ao servidor. Além do óbvio (lote vazio, sem jogo, um envio
 * em curso), duas travas protegem contra gravar o mesmo lote duas vezes
 * depois de uma resposta incerta, quando o lote pode ter entrado:
 *
 * - **`relendo`**: a releitura da página (o "tenho") ainda não chegou;
 * - **`semReleitura`**: a última releitura falhou no servidor, e o que está na
 *   tela é a leitura anterior. A trava dura até uma releitura boa — fechar o
 *   aviso não a solta —, porque é com o "tenho" atual que a pessoa confere se
 *   o lote entrou.
 */
export function bloqueioDoCadastro(e: {
  total: number;
  jogoId: string | null;
  enviando: boolean;
  relendo: boolean;
  releituraFalhou: boolean;
}): BloqueioCadastro | null {
  if (e.total === 0) return "vazio";
  if (e.jogoId === null) return "semJogo";
  if (e.enviando) return "enviando";
  if (e.relendo) return "relendo";
  if (e.releituraFalhou) return "semReleitura";
  return null;
}

/**
 * O que a tela mostra de uma leitura do servidor: a nova quando veio, a
 * anterior quando a releitura falhou (`nova` nula) — nunca a árvore de erro
 * por cima do lote digitado. Nulo só na abertura sem leitura nenhuma.
 */
export function leituraNaTela<T>(nova: T | null, anterior: T | null): { leitura: T | null; releituraFalhou: boolean } {
  if (nova !== null) return { leitura: nova, releituraFalhou: false };
  return { leitura: anterior, releituraFalhou: anterior !== null };
}

/**
 * O `tabIndex` de um campo de quantidade. Com o foco dentro da lista, todo
 * campo entra no Tab (normal → shiny → forma seguinte, como a tabela da v1);
 * fora dela, só os da célula de entrada da grade (`tabIndexCelula`, 0 só na
 * ativa ou na primeira à vista), para o Tab de fora não cair num campo de uma
 * linha de sobra fora da tela (regra 28).
 */
export function tabIndexDoCampo(focoNaLista: boolean, tabIndexCelula: 0 | -1): 0 | -1 {
  return focoNaLista ? 0 : tabIndexCelula;
}

/* ---------------------------------------------------------- Resposta */

export type RespostaCadastroDex =
  | { tipo: "gravado"; criados: number }
  /** A rota recusou (4xx com o corpo dela): o lote é tudo ou nada, nada foi gravado. */
  | { tipo: "recusado" }
  /**
   * Nem gravação confirmada nem recusa reconhecível: 5xx, um proxy no
   * caminho, um corpo que não é o da rota. A resposta pode ter se perdido
   * depois do commit, então a tela trata como a queda de rede — mantém o
   * lote, avisa e relê o "tenho" —, nunca como "nada foi gravado".
   */
  | { tipo: "incerto" };

/**
 * Lê a resposta de `POST /api/dex/registros`. 201 traz `{ ok, criados }`;
 * a recusa vem em 400 com `{ recusas }` (a validação do lote) ou `{ erro }`
 * (corpo malformado), e em 401/403/404 do proxy, do acesso e do módulo
 * desligado — todos antes de qualquer escrita.
 */
export function lerRespostaCadastro(status: number, corpo: unknown): RespostaCadastroDex {
  const c = (typeof corpo === "object" && corpo !== null ? corpo : {}) as Record<string, unknown>;
  if (status >= 200 && status < 300) {
    const criados = c.criados;
    return typeof criados === "number" && Number.isInteger(criados) && criados >= 0
      ? { tipo: "gravado", criados }
      : { tipo: "incerto" };
  }
  if (status >= 400 && status < 500) return { tipo: "recusado" };
  return { tipo: "incerto" };
}
