/**
 * `pnpm precos:cardmarket` — roda uma rodada de preços da fonte Cardmarket
 * (`PRECO_FONTE=cardmarket`) e espera ela terminar. É a rodada do botão
 * "Atualizar preços (Cardmarket)", pela mesma porta (`iniciarRodadaCardmarket`):
 * as mesmas recusas, a mesma cotação, a mesma trava por fonte. A rodada
 * aparece na tela como qualquer outra e nunca roda junto com uma do botão.
 *
 *   docker compose exec -T app pnpm precos:cardmarket --simular
 *   docker compose exec -T app pnpm precos:cardmarket --json
 *
 * Existe para ser agendado **de fora do app** (o `cron` do host, por
 * exemplo): agendar é permitido só nesta fonte, e a Liga continua sem job
 * automático (AGENTS.md). O contrato com quem agenda — a linha de JSON e os
 * códigos de saída 0, 1 e 2 — está em `lib/dominio/comando-precos-cardmarket.ts`.
 *
 * `--simular` não sai para a rede nem grava nada: nem a PTAX, nem a TCGdex,
 * nem o encerramento de rodadas mortas. Só lê quantas cartas a rodada
 * consultaria e quantas pularia.
 */
import "dotenv/config";

import {
  cartasParaConsultarCardmarket,
  executarRodadaCardmarket,
  iniciarRodadaCardmarket,
  JANELA_SEM_BATIMENTO_CARDMARKET_SEGUNDOS,
} from "../src/lib/cardmarket/precos";
import { client, db } from "../src/lib/db/client";
import { listarSerieDePrecos, obterFotoDaRodada, rodadaDePrecoViva } from "../src/lib/db/precos-liga";
import {
  codigoDeSaidaPrecosCardmarket,
  duracaoEmSegundos,
  fotoAnteriorNoGrafico,
  lerArgumentosPrecosCardmarket,
  resumoLegivelPrecosCardmarket,
  resumoLegivelSimulacao,
  SAIDA_OK,
  SAIDA_USO,
  saidaJsonPrecosCardmarket,
  saidaJsonSimulacao,
  USO_PRECOS_CARDMARKET,
  type DesfechoPrecosCardmarket,
  type SimulacaoPrecosCardmarket,
} from "../src/lib/dominio/comando-precos-cardmarket";
import { fonteDePreco } from "../src/lib/dominio/fonte-preco";

const argv = process.argv.slice(2);
/* Decidido antes de ler os argumentos: um uso errado também deve a linha de
   JSON a quem pediu `--json`, para o agendador nunca ficar sem resposta. */
const querJson = argv.includes("--json");
const comeco = Date.now();
const segundos = () => duracaoEmSegundos(Date.now() - comeco);

/* Com `--json`, o stdout é só a linha do fim. O que mais escreveria nele (um
   NOTICE do Postgres, que o driver manda para `console.log`) vai para o stderr,
   junto com os avisos da rodada. */
const escreverLinha = (texto: string) => process.stdout.write(`${texto}\n`);
if (querJson) console.log = (...partes: unknown[]) => console.error(...partes);

function terminar(desfecho: DesfechoPrecosCardmarket, codigo = codigoDeSaidaPrecosCardmarket(desfecho)) {
  if (querJson) escreverLinha(JSON.stringify(saidaJsonPrecosCardmarket(desfecho, segundos())));
  else for (const linha of resumoLegivelPrecosCardmarket(desfecho, segundos())) escreverLinha(linha);
  return codigo;
}

async function simular(validadeHoras: number): Promise<number> {
  // Só leituras: sem encerrar rodadas mortas (isso grava), sem PTAX, sem TCGdex.
  const [cartas, viva] = await Promise.all([
    cartasParaConsultarCardmarket(db, { validadeHoras }),
    rodadaDePrecoViva(db, JANELA_SEM_BATIMENTO_CARDMARKET_SEGUNDOS, "cardmarket"),
  ]);
  const s: SimulacaoPrecosCardmarket = {
    cartasParaConsultar: cartas.pendentes.length,
    cartasPuladas: cartas.puladas.length,
    cartasEspeciais: cartas.total,
    rodadaEmAndamento: viva?.id ?? null,
    validadeHoras,
  };
  if (querJson) escreverLinha(JSON.stringify(saidaJsonSimulacao(s, segundos())));
  else for (const linha of resumoLegivelSimulacao(s)) escreverLinha(linha);
  return SAIDA_OK;
}

async function rodar(validadeHoras: number): Promise<DesfechoPrecosCardmarket> {
  const disparo = new Date();
  const inicio = await iniciarRodadaCardmarket(db, { validadeHoras });
  if (!inicio.iniciada) {
    return {
      tipo: "recusada",
      recusa: inicio.recusa,
      ...(inicio.rodadaId !== undefined ? { rodadaId: inicio.rodadaId } : {}),
      ...(inicio.detalhe !== undefined ? { detalhe: inicio.detalhe } : {}),
    };
  }
  const { rodadaId, pendentes, cotacao } = inicio;
  try {
    // Com `await`, ao contrário do botão: o comando relata o fim da rodada.
    const resumo = await executarRodadaCardmarket(db, rodadaId, pendentes, cotacao);
    const [foto, serie] = await Promise.all([
      obterFotoDaRodada(db, rodadaId),
      listarSerieDePrecos(db, "cardmarket"),
    ]);
    // A anterior é a última foto da série do gráfico tirada antes da desta
    // rodada; sem foto desta (a gravação falhou), antes do disparo.
    const anterior = fotoAnteriorNoGrafico(serie, foto ? new Date(foto.tiradoEm) : disparo);
    return {
      tipo: "rodada",
      rodadaId,
      resumo: {
        cartasConsultadas: resumo.cartasConsultadas,
        cartasComFalha: resumo.cartasComFalha,
        achadas: resumo.achadas,
        naoAchadas: resumo.naoAchadas,
        requisicoes: resumo.requisicoes,
        ...(resumo.erro !== undefined ? { erro: resumo.erro } : {}),
      },
      cotacao,
      foto,
      anterior,
    };
  } catch (err) {
    return { tipo: "erro", erro: err instanceof Error ? err.message : String(err), rodadaId };
  }
}

async function main(): Promise<number> {
  const lidos = lerArgumentosPrecosCardmarket(argv);
  if (!lidos.ok) {
    console.error(`precos:cardmarket — ${lidos.erro}\n\n${USO_PRECOS_CARDMARKET}`);
    if (querJson) escreverLinha(JSON.stringify(saidaJsonPrecosCardmarket({ tipo: "erro", erro: lidos.erro }, segundos())));
    return SAIDA_USO;
  }
  const { ajuda, simular: soSimular, validadeHoras } = lidos.args;
  if (ajuda) {
    escreverLinha(USO_PRECOS_CARDMARKET);
    return SAIDA_OK;
  }
  if (fonteDePreco() !== "cardmarket") {
    // Antes de tocar o banco: numa instalação Liga a rodada gravaria tabelas
    // que a tela não mostra, e uma foto numa série que ninguém vê.
    const erro =
      'PRECO_FONTE is not "cardmarket": this install takes its prices from LigaPokemon, ' +
      "and a Cardmarket round would write tables the prices screen does not show.";
    if (querJson) return terminar({ tipo: "erro", erro }, SAIDA_USO);
    console.error(`precos:cardmarket — ${erro}`);
    return SAIDA_USO;
  }
  if (soSimular) return simular(validadeHoras);
  return terminar(await rodar(validadeHoras));
}

main()
  .catch((err: unknown) => {
    const erro = err instanceof Error ? err.message : String(err);
    console.error("precos:cardmarket failed:", err);
    return terminar({ tipo: "erro", erro });
  })
  .then((codigo) => {
    process.exitCode = codigo;
  })
  .finally(async () => {
    // Encerra o pool do Postgres para o processo sair sozinho. Num uso errado
    // sem `DATABASE_URL` (fora do container), o cliente nem chega a existir e
    // criá-lo só para fechar estouraria: o código de saída 2 tem de sobreviver.
    try {
      await client.end();
    } catch {
      // Nada aberto, nada a fechar.
    }
  });
