/**
 * Módulos opcionais, ligados pelo `.env` de quem instala.
 *
 * Hoje há um: a **Living Dex** (`MODULO_LIVING_DEX=1`), o catálogo de
 * Pokémon do HOME. Desligado — o padrão, e o estado de qualquer instalação
 * que não pediu por ele — o grupo some do menu, as rotas `/dex/...` e
 * `/api/dex/...` respondem 404 e os comandos `dex:*` recusam. As tabelas
 * existem do mesmo jeito (ver `schema.ts`).
 *
 * Só o valor `1` liga, como o `SYNC_PROFUNDO`: um `MODULO_LIVING_DEX=0` ou
 * `=false` escrito para desligar não pode acabar ligando o módulo.
 *
 * Lido em tempo de requisição, nunca no build: a imagem Docker é construída
 * sem o `.env`, e um valor capturado ali ficaria preso na imagem.
 */

type Ambiente = Readonly<Record<string, string | undefined>>;

export function moduloLivingDexAtivo(ambiente: Ambiente = process.env): boolean {
  return ambiente.MODULO_LIVING_DEX === "1";
}
