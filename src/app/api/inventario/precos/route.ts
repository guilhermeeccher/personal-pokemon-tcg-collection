import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import {
  consultasDePrecoDesde,
  criarRodadaDePreco,
  encerrarRodadasDePrecoMortas,
  listarCartasEspeciaisPossuidas,
  listarPrecos,
  listarSerieDePrecos,
  obterUltimaRodadaDePreco,
  rodadaDePrecoViva,
} from "@/lib/db/precos-liga";
import {
  formatarDuracao,
  janelaSemBatimentoSegundos,
  previsaoDeTermino,
  segundosDeVarredura,
} from "@/lib/dominio/estimativa-varredura";
import { corteDeFrescor, VALIDADE_CONSULTA_HORAS } from "@/lib/dominio/frescor-consulta";
import {
  compararPorValorDesc,
  resumirPrecos,
  separarCartasPorFrescor,
} from "@/lib/dominio/precos-cartas-especiais";
import { corpoDaRecusa, corpoRecusa, recusa } from "@/lib/dominio/recusa";
import { ritmoLigaPadrao } from "@/lib/liga/ritmo";
import {
  cartasParaConsultar,
  executarRodadaDePrecos,
  MAX_PAGINAS_PRECO,
  REQUISICOES_NO_PIOR_CASO_POR_CARTA,
} from "@/lib/liga/precos";

/**
 * Preço das cartas especiais (holo, secretas e as clássicas de 30 Anos) na
 * LigaPokemon — a tela `/inventario/precos`.
 *
 * `POST` dispara a rodada e devolve na hora o id dela; o trabalho segue no
 * processo, como na varredura de opções de compra (`colecoes/[id]/opcoes-compra`).
 * `GET` lê o **snapshot** — nunca bate no site deles, nem para saber o ritmo:
 * usa o último estado já conhecido (`ritmo.atual()`, sem I/O).
 */

/** A janela de "rodada morta" acompanha o ritmo e o pior caso desta rodada. */
const janelaDaRodada = (intervaloSegundos: number) =>
  janelaSemBatimentoSegundos(intervaloSegundos, REQUISICOES_NO_PIOR_CASO_POR_CARTA);

export async function POST(req: Request) {
  let corpo: Record<string, unknown> = {};
  try {
    const bruto: unknown = await req.json();
    if (typeof bruto === "object" && bruto !== null) corpo = bruto as Record<string, unknown>;
  } catch {
    // Corpo vazio é válido.
  }
  const validadeBruta = corpo.validadeHoras;
  if (
    validadeBruta !== undefined &&
    (typeof validadeBruta !== "number" || !Number.isFinite(validadeBruta) || validadeBruta < 0)
  ) {
    return NextResponse.json(
      { erro: "validadeHoras deve ser um número de horas não negativo." },
      { status: 400 },
    );
  }
  const validadeHoras = (validadeBruta as number | undefined) ?? VALIDADE_CONSULTA_HORAS;

  // Uma leitura do `robots.txt` antes de decidir (cacheada): dela saem a
  // janela de batimento e a estimativa, e a primeira requisição já sai no
  // ritmo certo.
  const ritmo = await ritmoLigaPadrao().atualizar();
  const janela = janelaDaRodada(ritmo.intervaloSegundos);

  await encerrarRodadasDePrecoMortas(db, janela);
  const emAndamento = await rodadaDePrecoViva(db, janela);
  if (emAndamento) {
    // Duas rodadas simultâneas DOBRAM o ritmo contra o site deles.
    return NextResponse.json(
      { ...corpoRecusa("precosEmAndamento"), rodadaId: emAndamento.id },
      { status: 409 },
    );
  }

  const { pendentes, puladas, total } = await cartasParaConsultar(db, {
    validadeHoras,
    maxPaginas: MAX_PAGINAS_PRECO,
  });
  if (pendentes.length === 0) {
    const nada =
      total === 0
        ? recusa("semCartasEspeciais")
        : recusa("precosJaConsultados", {
            total: String(puladas.length),
            horas: String(validadeHoras),
          });
    return NextResponse.json({ ...corpoDaRecusa(nada), cartasPuladas: puladas.length }, { status: 400 });
  }

  const estimativaSegundos = segundosDeVarredura({
    tipo: "set",
    vagas: pendentes.length,
    intervaloSegundos: ritmo.intervaloSegundos,
  });
  const rodadaId = await criarRodadaDePreco(db, pendentes.length);

  // Deliberadamente sem `await`: a resposta sai agora e a rodada segue.
  void executarRodadaDePrecos(db, rodadaId, pendentes).catch(() => {});

  return NextResponse.json(
    {
      rodadaId,
      cartasParaConsultar: pendentes.length,
      cartasPuladas: puladas.length,
      estimativaSegundos,
      estimativaTexto: formatarDuracao(estimativaSegundos),
      previsaoTermino: previsaoDeTermino(new Date(), estimativaSegundos).toISOString(),
      ritmo: { intervaloSegundos: ritmo.intervaloSegundos, origem: ritmo.origem },
    },
    { status: 202 },
  );
}

export async function GET() {
  const ritmo = ritmoLigaPadrao().atual();
  await encerrarRodadasDePrecoMortas(db, janelaDaRodada(ritmo.intervaloSegundos));

  const [precos, rodada, selecionadas, serie] = await Promise.all([
    listarPrecos(db),
    obterUltimaRodadaDePreco(db),
    listarCartasEspeciaisPossuidas(db),
    listarSerieDePrecos(db),
  ]);

  const itens = precos
    .sort(
      (a, b) =>
        compararPorValorDesc(a, b) ||
        a.nome.localeCompare(b.nome) ||
        a.cartaId.localeCompare(b.cartaId),
    )
    .map((p) => ({ ...p, consultadoEm: p.consultadoEm.toISOString() }));

  const ultimaAtualizacao = precos.reduce<Date | null>(
    (maisNova, p) => (maisNova === null || p.consultadoEm > maisNova ? p.consultadoEm : maisNova),
    null,
  );

  let varredura = null;
  if (rodada) {
    const emAndamento = rodada.concluidaEm === null;
    // O que falta, derivado da mesma regra de frescor que a rodada usa, e não
    // do total gravado: depois de um reinício o total original já não
    // descreveria o trabalho que sobra.
    const agora = new Date();
    const restantes = emAndamento
      ? separarCartasPorFrescor(
          selecionadas,
          await consultasDePrecoDesde(
            db,
            corteDeFrescor({ agora, validadeHoras: VALIDADE_CONSULTA_HORAS }),
          ),
          { agora, validadeHoras: VALIDADE_CONSULTA_HORAS, maxPaginas: MAX_PAGINAS_PRECO },
        ).pendentes.length
      : null;
    const segundosRestantes =
      restantes === null
        ? null
        : segundosDeVarredura({
            tipo: "set",
            vagas: restantes,
            intervaloSegundos: ritmo.intervaloSegundos,
          });
    varredura = {
      id: rodada.id,
      totalCartas: rodada.totalCartas,
      cartasConsultadas: rodada.cartasConsultadas,
      cartasComFalha: rodada.cartasComFalha,
      requisicoes: rodada.requisicoes,
      concluidaEm: rodada.concluidaEm,
      erro: rodada.erro,
      criadoEm: rodada.criadoEm,
      emAndamento,
      segundosRestantes,
      previsaoTermino:
        segundosRestantes === null
          ? null
          : previsaoDeTermino(agora, segundosRestantes).toISOString(),
    };
  }

  return NextResponse.json({
    ritmo: { intervaloSegundos: ritmo.intervaloSegundos, origem: ritmo.origem },
    cartasEspeciais: selecionadas.length,
    ultimaAtualizacao: ultimaAtualizacao?.toISOString() ?? null,
    varredura,
    resumo: resumirPrecos(precos),
    serie,
    itens,
  });
}
