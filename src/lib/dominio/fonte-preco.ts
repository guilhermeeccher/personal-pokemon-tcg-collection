/**
 * De onde vem o preço das cartas especiais — escolha de quem instala, pelo
 * `.env` (`PRECO_FONTE`).
 *
 * - `liga` (o padrão): a LigaPokemon, em reais, sem conversão — o coletor de
 *   `lib/liga/`, no ritmo do `robots.txt` deles.
 * - `cardmarket`: a tendência do Cardmarket que a TCGdex entrega no campo
 *   `pricing` da ficha da carta, convertida em reais pela PTAX de fechamento
 *   do Banco Central (`lib/cardmarket/precos.ts`).
 *
 * A fonte nova existe porque, em 2026-11-11, a LigaPokemon passou a barrar o
 * coletor com um 403 do firewall de borda, enquanto o navegador da mesma rede
 * entrava normalmente. Bloqueio não se contorna (nada de navegador
 * automatizado, User-Agent de navegador, cookie de sessão ou troca de IP):
 * a saída foi uma segunda fonte, que quem instala escolhe.
 *
 * **Só o valor exato `cardmarket` liga a fonte nova**, como o `1` de
 * `lib/modulos.ts`: qualquer outra coisa — vazio, ausente, `Cardmarket`,
 * um erro de digitação — fica na Liga, que é o comportamento de antes, sem
 * nenhuma mudança visível. Errar para o lado de "nada mudou" é o seguro.
 *
 * Lido em tempo de requisição, nunca no build: a imagem Docker é construída
 * sem o `.env`, e um valor capturado ali ficaria preso na imagem.
 *
 * Espelha o enum Postgres `fonte_preco` (`src/lib/db/schema.ts`); se um
 * mudar, o outro muda junto (o teste do schema confere).
 */

export const FONTES_PRECO = ["liga", "cardmarket"] as const;
export type FontePreco = (typeof FONTES_PRECO)[number];

type Ambiente = Readonly<Record<string, string | undefined>>;

export function fonteDePreco(ambiente: Ambiente = process.env): FontePreco {
  return ambiente.PRECO_FONTE === "cardmarket" ? "cardmarket" : "liga";
}
