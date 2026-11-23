import type { CartaParaGradeDTO } from "@/lib/dominio/tipos-cliente";
import type { FlagsVariantesCatalogo } from "@/lib/dominio/variantes-catalogo";

/** As variantes que o catálogo tem para a carta, como `reduzirGrade` e `variantesDisponiveis` as leem. */
export function flagsDaCarta(carta: CartaParaGradeDTO): FlagsVariantesCatalogo {
  return {
    varianteNormalDisponivel: carta.varianteNormalDisponivel,
    varianteReverseDisponivel: carta.varianteReverseDisponivel,
    varianteHoloDisponivel: carta.varianteHoloDisponivel,
    variantePrimeiraEdicaoDisponivel: carta.variantePrimeiraEdicaoDisponivel,
    variantePromoDisponivel: carta.variantePromoDisponivel,
  };
}
