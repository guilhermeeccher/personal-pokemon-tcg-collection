/**
 * A página inicial da v2 (`/`, pacote 2a): as formas que a tela recebe e a
 * montagem pura da vitrine e do bloco de cadastradas. A leitura do banco é de
 * `lib/db/inicio-v2.ts`; a regra da janela de 7 dias, de
 * `cadastradas-recentes.ts`.
 *
 * Os números das coleções, do "Quase lá" e da Dex são os da página inicial da
 * v1 (`lerTcgInicio`, `resumoDexInicio`), lidos pelas mesmas funções:
 * divergência entre as duas versões seria bug. A vitrine é a regra das joias
 * da visão geral (`listarJoias`): o preço guardado na fonte ativa primeiro,
 * depois a aparência.
 */

import type { Idioma, VarianteCopia } from "./enums";
import type { OrigemImagem } from "./origem-imagem";
import type {
  ColecaoInicioDTO,
  QuaseLaInicioDTO,
  ResumoDexInicioDTO,
} from "./tipos-cliente";

/** Quantas cartas a vitrine mostra: o leque de três do protótipo. */
export const CARTAS_NA_VITRINE = 3;

/** Uma carta que abre o detalhe em modo cópia: a carta, a cópia e o que a prévia desenha. */
export interface CartaDoInicioV2 {
  cartaId: string;
  copiaId: string;
  nome: string;
  setNome: string;
  localId: string;
  raridade: string | null;
  /** Variante da cópia física: o brilho, e o texto para leitor de tela. */
  variante: VarianteCopia;
  /** Idioma FÍSICO da cópia (regra 7). */
  idioma: Idioma;
  /** A URL crua da cadeia de procedência (`imagemDaCarta`); a `<Carta>` escolhe `low` ou `high`. */
  imagemUrl: string | null;
  imagemOrigem: OrigemImagem | null;
}

export interface CadastradaInicioV2 extends CartaDoInicioV2 {
  quantidade: number;
  /** O dia em que a cópia entrou no inventário, no fuso de São Paulo (`AAAA-MM-DD`). */
  dia: string;
}

export interface CadastradasInicioV2 {
  /** Hoje e o primeiro dia da janela, no fuso de São Paulo. */
  hoje: string;
  desde: string;
  /** Cópias (linhas) cadastradas na janela, todas, não só as mostradas. */
  copias: number;
  /** A soma das quantidades dessas cópias. */
  unidades: number;
  /** Cartas físicas distintas (`carta_id`) entre elas. */
  cartas: number;
  /** As mais recentes, até `LIMITE_CADASTRADAS`. */
  itens: CadastradaInicioV2[];
}

export interface InicioV2DTO {
  totais: { cartasDistintas: number; totalUnidades: number };
  vitrine: CartaDoInicioV2[];
  /** Até 4, na ordem de `listarColecoes`; `totalColecoes` diz se há mais. */
  colecoes: ColecaoInicioDTO[];
  totalColecoes: number;
  quaseLa: QuaseLaInicioDTO[];
  cadastradas: CadastradasInicioV2;
  /** `null` com a Living Dex desligada: o bloco não existe. */
  dex: ResumoDexInicioDTO | null;
}

/** Uma joia da visão geral, como `listarJoias` a devolve (o que a vitrine usa dela). */
export interface JoiaParaVitrine {
  cartaId: string;
  nome: string;
  setNome: string;
  localId: string;
  raridade: string | null;
}

export interface CopiaParaVitrine {
  id: string;
  cartaId: string;
  variante: VarianteCopia;
  idioma: Idioma;
  criadoEm: Date;
}

/**
 * A vitrine: as joias na ordem em que chegam, cada uma com a cópia que o toque
 * abre no detalhe. A joia é uma carta física (`carta_id`); a cópia escolhida é
 * a mais antiga (o `id` desempata), a mesma que o detalhe lista primeiro — o
 * detalhe mostra todas as cópias da carta de qualquer jeito. Uma joia sem
 * cópia (apagada entre as duas leituras) sai da vitrine em vez de abrir um
 * detalhe que não existe.
 */
export function montarVitrine(
  joias: readonly JoiaParaVitrine[],
  copias: readonly CopiaParaVitrine[],
  imagens: ReadonlyMap<string, { imagemUrl: string | null; imagemOrigem: OrigemImagem | null }>,
): CartaDoInicioV2[] {
  const primeira = new Map<string, CopiaParaVitrine>();
  for (const c of copias) {
    const atual = primeira.get(c.cartaId);
    const anterior =
      !atual ||
      c.criadoEm.getTime() < atual.criadoEm.getTime() ||
      (c.criadoEm.getTime() === atual.criadoEm.getTime() && c.id < atual.id);
    if (anterior) primeira.set(c.cartaId, c);
  }
  return joias.flatMap((j) => {
    const copia = primeira.get(j.cartaId);
    if (!copia) return [];
    const imagem = imagens.get(j.cartaId) ?? { imagemUrl: null, imagemOrigem: null };
    return [
      {
        cartaId: j.cartaId,
        copiaId: copia.id,
        nome: j.nome,
        setNome: j.setNome,
        localId: j.localId,
        raridade: j.raridade,
        variante: copia.variante,
        idioma: copia.idioma,
        imagemUrl: imagem.imagemUrl,
        imagemOrigem: imagem.imagemOrigem,
      },
    ];
  });
}
