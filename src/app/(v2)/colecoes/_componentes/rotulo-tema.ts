import type { ColecaoListaV2DTO } from "@/lib/dominio/lista-colecoes-v2";

/** O mínimo do `t` do next-intl que o rótulo precisa: ler uma chave e saber se ela existe. */
interface Tradutor {
  (chave: string, valores?: Record<string, string>): string;
  has(chave: string): boolean;
}

/**
 * Como a tela escreve o tema de uma coleção temática no idioma da interface.
 * O servidor guarda o valor como o catálogo o tem (o tipo em inglês, a forma
 * como enum, a espécie como número nacional); traduzir é da tela, e o que ela
 * não sabe traduzir ela mostra como está — nunca adivinha (decisão de
 * 2026-11-22). Espécie: o nome vem de `rotulo` (`temaRotulo` da coleção); só
 * sem nome cai em "Pokémon nº N". Ilustrador: exatamente como gravado.
 */
export function rotuloDoTema(
  tema: NonNullable<ColecaoListaV2DTO["tema"]>,
  t: { tTema: Tradutor; tTipos: Tradutor; tRaridades: Tradutor },
): string {
  switch (tema.tipo) {
    case "especie":
      return tema.rotulo ?? t.tTema("especieSemNome", { numero: tema.valor });
    case "tipo":
      return t.tTipos.has(tema.valor) ? t.tTipos(tema.valor) : tema.valor;
    case "raridade":
      // O valor é a raridade canônica (a da ficha en); sem tradução, como está.
      return t.tRaridades.has(tema.valor) ? t.tRaridades(tema.valor) : tema.valor;
    case "forma":
      return t.tTema.has(`formas.${tema.valor}`) ? t.tTema(`formas.${tema.valor}`) : tema.valor;
    case "ilustrador":
      return tema.valor;
  }
}
