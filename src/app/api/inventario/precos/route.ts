import { NextResponse } from "next/server";

import { comAcesso, leituraPodeGravar } from "@/lib/acesso";
import {
  cartasParaConsultarCardmarket,
  executarRodadaCardmarket,
  JANELA_SEM_BATIMENTO_CARDMARKET_SEGUNDOS,
  segundosDeRodadaCardmarket,
} from "@/lib/cardmarket/precos";
import { obterPtaxEuro } from "@/lib/cotacao/ptax";
import { db } from "@/lib/db/client";
import { consultasCardmarketDesde, listarPrecosCardmarket } from "@/lib/db/precos-cardmarket";
import {
  consultasDePrecoDesde,
  criarRodadaDePreco,
  criarRodadaDePrecoSeLivre,
  encerrarRodadasDePrecoMortas,
  listarCartasEspeciaisPossuidas,
  listarPrecos,
  listarRodadasDePreco,
  listarSerieDePrecos,
  obterUltimaRodadaDePreco,
  rodadaDePrecoViva,
} from "@/lib/db/precos-liga";
import type { CotacaoPtax } from "@/lib/dominio/cotacao-ptax";
import {
  formatarDuracao,
  janelaSemBatimentoSegundos,
  previsaoDeTermino,
  segundosDeVarredura,
} from "@/lib/dominio/estimativa-varredura";
import { fonteDePreco } from "@/lib/dominio/fonte-preco";
import {
  corteDeFrescor,
  separarPorFrescor,
  VALIDADE_CONSULTA_HORAS,
} from "@/lib/dominio/frescor-consulta";
import {
  comoPrecoDeCarta,
  cotacaoMaisRecente,
  valorCardmarket,
} from "@/lib/dominio/preco-cardmarket";
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
 * Preço das cartas especiais (holo, secretas e as clássicas de 30 Anos) — a
 * tela `/inventario/precos`.
 *
 * `POST` dispara a rodada e devolve na hora o id dela; o trabalho segue no
 * processo, como na varredura de opções de compra (`colecoes/[id]/opcoes-compra`).
 * `GET` lê o **snapshot** — nunca bate no site deles, nem para saber o ritmo:
 * usa o último estado já conhecido (`ritmo.atual()`, sem I/O).
 *
 * A fonte é escolha de quem instala (`fonteDePreco`, lida a cada
 * requisição): `liga`, o padrão, é a LigaPokemon, e o ramo dela é o de
 * sempre — a resposta do `GET` só ganhou `fonte: "liga"`. `cardmarket` é a
 * tendência do Cardmarket via TCGdex, convertida pela PTAX
 * (`lib/cardmarket/precos.ts`), com as suas próprias rodadas, série e
 * janela de rodada morta; as duas fontes nunca se misturam numa resposta.
 */

/** A janela de "rodada morta" acompanha o ritmo e o pior caso desta rodada. */
const janelaDaRodada = (intervaloSegundos: number) =>
  janelaSemBatimentoSegundos(intervaloSegundos, REQUISICOES_NO_PIOR_CASO_POR_CARTA);

export const POST = comAcesso(async function POST(req: Request) {
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

  if (fonteDePreco() === "cardmarket") return iniciarRodadaCardmarket(validadeHoras);

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
});

export const GET = comAcesso(async function GET(req: Request) {
  if (fonteDePreco() === "cardmarket") return lerCardmarket(req);

  const ritmo = ritmoLigaPadrao().atual();
  // Com o acesso por senha ligado, a limpeza só roda quando a leitura vem
  // da própria tela (ver `leituraPodeGravar`); senão a resposta mostra a
  // rodada como está no banco.
  if (leituraPodeGravar(req)) {
    await encerrarRodadasDePrecoMortas(db, janelaDaRodada(ritmo.intervaloSegundos));
  }

  const [precos, rodada, selecionadas, serie, rodadas] = await Promise.all([
    listarPrecos(db),
    obterUltimaRodadaDePreco(db),
    listarCartasEspeciaisPossuidas(db),
    listarSerieDePrecos(db),
    listarRodadasDePreco(db),
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
    fonte: "liga",
    ritmo: { intervaloSegundos: ritmo.intervaloSegundos, origem: ritmo.origem },
    cartasEspeciais: selecionadas.length,
    ultimaAtualizacao: ultimaAtualizacao?.toISOString() ?? null,
    varredura,
    resumo: resumirPrecos(precos),
    serie,
    rodadas: rodadas.map((r) => ({
      ...r,
      criadoEm: r.criadoEm.toISOString(),
      concluidaEm: r.concluidaEm?.toISOString() ?? null,
    })),
    itens,
  });
});

// --- Fonte Cardmarket -------------------------------------------------------

/** A recusa de um disparo sem nada a consultar: sem carta especial, ou tudo fresco. */
function nadaAConsultar(
  { puladas, total }: { puladas: readonly unknown[]; total: number },
  validadeHoras: number,
) {
  const nada =
    total === 0
      ? recusa("semCartasEspeciais")
      : recusa("precosJaConsultados", {
          total: String(puladas.length),
          horas: String(validadeHoras),
        });
  return NextResponse.json({ ...corpoDaRecusa(nada), cartasPuladas: puladas.length }, { status: 400 });
}

/**
 * `POST` com a fonte Cardmarket. Mesma ordem de recusas da Liga — rodada
 * viva (409), nada a consultar (400) —, mais a cotação: sem a PTAX do euro a
 * rodada não começa (503 `cotacaoIndisponivel`), em vez de gravar preço sem
 * conversão ou convertido por uma taxa inventada. A cotação é buscada uma
 * vez, antes de a rodada existir, e a rodada inteira converte por ela.
 */
async function iniciarRodadaCardmarket(validadeHoras: number) {
  const janela = JANELA_SEM_BATIMENTO_CARDMARKET_SEGUNDOS;
  await encerrarRodadasDePrecoMortas(db, janela, "cardmarket");
  const emAndamento = await rodadaDePrecoViva(db, janela, "cardmarket");
  if (emAndamento) {
    return NextResponse.json(
      { ...corpoRecusa("precosEmAndamento"), rodadaId: emAndamento.id },
      { status: 409 },
    );
  }

  const antes = await cartasParaConsultarCardmarket(db, { validadeHoras });
  if (antes.pendentes.length === 0) return nadaAConsultar(antes, validadeHoras);

  let cotacao: CotacaoPtax;
  try {
    cotacao = await obterPtaxEuro();
  } catch (err) {
    // A tela mostra a recusa pela chave; o motivo técnico fica no log.
    console.error(`[preços cardmarket] ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json(corpoRecusa("cotacaoIndisponivel"), { status: 503 });
  }

  // A busca da cotação pode levar segundos (até duas tentativas com teto de
  // 20 s), e um segundo clique nesse meio passaria pelas checagens lá de
  // cima. Outra rodada pode ter começado — ou até terminado, consultando as
  // mesmas cartas. Por isso a lista é refeita depois da cotação (a primeira
  // só evita buscar a PTAX num clique que não tem o que fazer), e a checagem
  // final e a criação vão juntas, serializadas por fonte
  // (`criarRodadaDePrecoSeLivre`): rodada viva dá 409, e o que outra já
  // consultou sai da lista. Sobra a janela entre refazer a lista e pegar a
  // trava — normalmente milissegundos, mas sem garantia (espera pelo banco,
  // pausa do processo). Se outra rodada começar e terminar inteira nela, as
  // cartas dela são consultadas de novo: requisições a mais, nunca dado
  // errado (o upsert grava o mesmo preço e o histórico só acrescenta).
  const depois = await cartasParaConsultarCardmarket(db, { validadeHoras });
  if (depois.pendentes.length === 0) return nadaAConsultar(depois, validadeHoras);
  const { pendentes, puladas } = depois;

  const criacao = await criarRodadaDePrecoSeLivre(db, pendentes.length, janela, "cardmarket");
  if ("viva" in criacao) {
    return NextResponse.json({ ...corpoRecusa("precosEmAndamento"), rodadaId: criacao.viva }, { status: 409 });
  }
  const rodadaId = criacao.criada;

  const estimativaSegundos = segundosDeRodadaCardmarket(pendentes.length);

  // Deliberadamente sem `await`: a resposta sai agora e a rodada segue.
  void executarRodadaCardmarket(db, rodadaId, pendentes, cotacao).catch(() => {});

  return NextResponse.json(
    {
      rodadaId,
      cartasParaConsultar: pendentes.length,
      cartasPuladas: puladas.length,
      estimativaSegundos,
      estimativaTexto: formatarDuracao(estimativaSegundos),
      previsaoTermino: previsaoDeTermino(new Date(), estimativaSegundos).toISOString(),
      cotacao: { valor: cotacao.cotacao, data: cotacao.data },
    },
    { status: 202 },
  );
}

/**
 * `GET` com a fonte Cardmarket: só as tabelas, as rodadas e as fotos desta
 * fonte. Os valores em reais vêm convertidos e cada item traz a cotação que
 * o converteu; `cotacao` no topo é a da linha encontrada mais recente.
 */
async function lerCardmarket(req: Request) {
  const janela = JANELA_SEM_BATIMENTO_CARDMARKET_SEGUNDOS;
  // Mesma regra da Liga: com o acesso por senha ligado, a limpeza só roda
  // quando a leitura vem da própria tela (ver `leituraPodeGravar`).
  if (leituraPodeGravar(req)) {
    await encerrarRodadasDePrecoMortas(db, janela, "cardmarket");
  }

  const [precos, rodada, selecionadas, serie, rodadas] = await Promise.all([
    listarPrecosCardmarket(db),
    obterUltimaRodadaDePreco(db, "cardmarket"),
    listarCartasEspeciaisPossuidas(db),
    listarSerieDePrecos(db, "cardmarket"),
    listarRodadasDePreco(db, "cardmarket"),
  ]);

  // O valor que ordena é o da fonte: a tendência, senão a média.
  const valor = (p: (typeof precos)[number]) => ({ preco: null, precoMedio: valorCardmarket(p) });
  const itens = [...precos]
    .sort(
      (a, b) =>
        compararPorValorDesc(valor(a), valor(b)) ||
        a.nome.localeCompare(b.nome) ||
        a.cartaId.localeCompare(b.cartaId),
    )
    .map((p) => ({
      cartaId: p.cartaId,
      nome: p.nome,
      setNome: p.setNome,
      localId: p.localId,
      raridade: p.raridade,
      encontrada: p.encontrada,
      minimo: p.minimo,
      tendencia: p.tendencia,
      media: p.media,
      tendenciaEur: p.tendenciaEur,
      foil: p.foil,
      cotacao: p.cotacao,
      cotacaoData: p.cotacaoData,
      consultadoEm: p.consultadoEm.toISOString(),
    }));

  const ultimaAtualizacao = precos.reduce<Date | null>(
    (maisNova, p) => (maisNova === null || p.consultadoEm > maisNova ? p.consultadoEm : maisNova),
    null,
  );

  let varredura = null;
  if (rodada) {
    const emAndamento = rodada.concluidaEm === null;
    // O que falta, pela mesma regra de frescor que a rodada usa (ver o ramo
    // da Liga): depois de um reinício o total gravado já não descreve o resto.
    const agora = new Date();
    const restantes = emAndamento
      ? separarPorFrescor(
          selecionadas,
          await consultasCardmarketDesde(
            db,
            corteDeFrescor({ agora, validadeHoras: VALIDADE_CONSULTA_HORAS }),
          ),
          { agora, validadeHoras: VALIDADE_CONSULTA_HORAS },
        ).pendentes.length
      : null;
    const segundosRestantes = restantes === null ? null : segundosDeRodadaCardmarket(restantes);
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
    fonte: "cardmarket",
    // Não há ritmo a mostrar: o teto é o limitador do cliente da TCGdex, e a
    // rodada pede uma carta por vez.
    ritmo: null,
    cotacao: cotacaoMaisRecente(precos),
    cartasEspeciais: selecionadas.length,
    ultimaAtualizacao: ultimaAtualizacao?.toISOString() ?? null,
    varredura,
    // `comoPrecoDeCarta`: a soma do resumo é a das tendências.
    resumo: resumirPrecos(precos.map(comoPrecoDeCarta)),
    serie,
    rodadas: rodadas.map((r) => ({
      ...r,
      criadoEm: r.criadoEm.toISOString(),
      concluidaEm: r.concluidaEm?.toISOString() ?? null,
    })),
    itens,
  });
}
