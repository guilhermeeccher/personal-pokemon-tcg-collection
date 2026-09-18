/**
 * Variante disponível de uma carta, segundo o catálogo (spec §3.1:
 * `variantes_disponiveis` — flags normal/reverse/holo/1ª edição/promo).
 *
 * Decisão tomada na validação da Fase 1 com fichário real: o
 * cadastro rápido por set gravou o Base Set inteiro como `normal`, mas
 * várias dessas cartas (ex.: Alakazam) só existem em holo naquela era —
 * "normal" nem é uma cópia física possível. A partir de agora, a variante
 * de uma cópia é restrita ao que o catálogo marca como existente para
 * aquela carta — no cliente (grade e busca só oferecem as variantes
 * disponíveis) e no servidor (a API rejeita variante fora do catálogo).
 *
 * Módulo puro, sem I/O — testável sem banco. Quem chama entrega as flags
 * (tipicamente lidas de `carta_catalogo` por uma consulta em
 * `lib/db/consultas.ts`).
 */

import { VARIANTES_COPIA, type VarianteCopia } from "./enums";

export interface FlagsVariantesCatalogo {
  varianteNormalDisponivel: boolean;
  varianteReverseDisponivel: boolean;
  varianteHoloDisponivel: boolean;
  variantePrimeiraEdicaoDisponivel: boolean;
  variantePromoDisponivel: boolean;
}

const CAMPO_POR_VARIANTE: {
  campo: keyof FlagsVariantesCatalogo;
  variante: VarianteCopia;
}[] = [
  { campo: "varianteNormalDisponivel", variante: "normal" },
  { campo: "varianteReverseDisponivel", variante: "reverse" },
  { campo: "varianteHoloDisponivel", variante: "holo" },
  { campo: "variantePrimeiraEdicaoDisponivel", variante: "primeira_edicao" },
  { campo: "variantePromoDisponivel", variante: "promo" },
];

/** true quando o catálogo não marcou NENHUMA variante para a carta. */
export function semNenhumaVarianteMarcada(flags: FlagsVariantesCatalogo): boolean {
  return CAMPO_POR_VARIANTE.every(({ campo }) => !flags[campo]);
}

/**
 * Variantes que essa carta de fato tem, segundo o catálogo. Se o upstream
 * não marcou nenhuma (`semNenhumaVarianteMarcada`), não inventamos que só
 * "normal" existe: liberamos as cinco e quem chama decide como sinalizar
 * esse caso (a rotina de sync não garante 100% de cobertura desse dado).
 */
export function variantesDisponiveis(flags: FlagsVariantesCatalogo): VarianteCopia[] {
  const disponiveis = CAMPO_POR_VARIANTE.filter(({ campo }) => flags[campo]).map(
    ({ variante }) => variante,
  );
  return disponiveis.length > 0 ? disponiveis : [...VARIANTES_COPIA];
}

/**
 * Escolhe a variante a materializar numa linha da grade (ver
 * `grade-set.ts`): usa a desejada (tipicamente o default corrente) se ela
 * existir para a carta; senão cai para a primeira variante que a carta de
 * fato tem — nunca grava uma variante impossível.
 */
export function escolherVarianteDisponivel(
  desejada: VarianteCopia,
  flags: FlagsVariantesCatalogo,
): VarianteCopia {
  const disponiveis = variantesDisponiveis(flags);
  return disponiveis.includes(desejada) ? desejada : disponiveis[0];
}

export interface ErroVarianteCatalogo {
  indice: number;
  cartaId: string;
  motivo: string;
}

/**
 * Segunda passada de validação do lote (depois de `validarLoteCopias` em
 * `lote-copias.ts`), cruzando cada variante escolhida contra o catálogo.
 * Separado da validação estrutural de propósito: aquela é 100% pura sem
 * depender de dado externo; esta recebe o mapa carta→variantes já
 * resolvido pelo route handler (que consultou o banco) — continua pura
 * (só olha os dados recebidos), só não pode rodar sozinha sem essa
 * consulta prévia.
 */
export function validarVariantesContraCatalogo(
  itens: readonly { cartaId: string; variante: VarianteCopia }[],
  variantesPorCarta: Readonly<Record<string, readonly VarianteCopia[]>>,
): ErroVarianteCatalogo[] {
  const erros: ErroVarianteCatalogo[] = [];
  itens.forEach((item, indice) => {
    const disponiveis = variantesPorCarta[item.cartaId];
    if (!disponiveis) {
      erros.push({
        indice,
        cartaId: item.cartaId,
        motivo: "carta não encontrada no catálogo informado",
      });
      return;
    }
    if (!disponiveis.includes(item.variante)) {
      erros.push({
        indice,
        cartaId: item.cartaId,
        motivo: `variante '${item.variante}' não existe no catálogo para esta carta (disponíveis: ${disponiveis.join(", ")})`,
      });
    }
  });
  return erros;
}
