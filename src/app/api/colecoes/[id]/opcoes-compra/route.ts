import { NextResponse } from "next/server";

import { comAcesso, leituraPodeGravar } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { obterColecaoPorId } from "@/lib/db/consultas";
import {
  criarVarredura,
  encerrarVarredurasMortas,
  obterUltimaVarredura,
  ultimaConsultaPorChave,
  varreduraViva,
} from "@/lib/db/liga";
import {
  corteDeFrescor,
  separarPorFrescor,
  VALIDADE_CONSULTA_HORAS,
} from "@/lib/dominio/frescor-consulta";
import {
  formatarDuracao,
  janelaSemBatimentoSegundos,
  previsaoDeTermino,
  requisicoesNoPiorCasoPorVaga,
  segundosDeVarredura,
} from "@/lib/dominio/estimativa-varredura";
import { corpoDaRecusa, corpoRecusa, recusa } from "@/lib/dominio/recusa";
import { ritmoLigaPadrao } from "@/lib/liga/ritmo";
import {
  FILTROS_PADRAO,
  FILTROS_PADRAO_SET,
  type Filtros,
  type Ordenacao,
} from "@/lib/dominio/liga-opcoes";
import { listarEscolhas } from "@/lib/db/escolhas";
import {
  opcoesDaVarreduraPorVaga,
  opcoesDasCandidatasPorVaga,
  resumoDaListaDeCompra,
} from "@/lib/liga/opcoes-da-colecao";
import { ehUuid } from "@/lib/dominio/uuid";
import { executarVarredura, vagasParaVarrer } from "@/lib/liga/varredura";
import { fonteDePreco } from "@/lib/dominio/fonte-preco";
import type { EscolhaSalva } from "@/lib/db/escolhas";
import {
  encerrarRodadasDeCandidatasMortas,
  listarCandidatasDaColecao,
  ultimaRodadaDeCandidatas,
} from "@/lib/db/candidatas-compra";
import {
  executarRodadaCandidatas,
  iniciarRodadaCandidatas,
} from "@/lib/cardmarket/candidatas";
import {
  JANELA_SEM_BATIMENTO_CARDMARKET_SEGUNDOS,
  segundosDeRodadaCardmarket,
} from "@/lib/cardmarket/precos";
import { VALIDADE_PRECO_CANDIDATA_HORAS } from "@/lib/dominio/candidatas-compra";

/**
 * Opções de compra das vagas vazias de uma coleção — a Fase 6 da spec, pela
 * LigaPokemon (decidido em 2026-09-02; estendido à coleção de
 * set em 2026-09-03).
 *
 * `POST` dispara a varredura e devolve na hora o id dela; o trabalho segue no
 * processo, porque 161 vagas no ritmo do `robots.txt` deles dão ~16 horas e
 * nenhum navegador espera isso. `GET` lê o snapshot — **nunca** bate no site
 * deles durante a renderização, nem para saber o ritmo: ele usa o último
 * estado já conhecido (`ritmo.atual()`, sem I/O).
 *
 * Coleção customizada fica de fora: a vaga dela nasce ao alocar, com chave
 * sequencial, e não representa uma carta que falta comprar.
 *
 * ## Com `PRECO_FONTE=cardmarket`, as opções saem do catálogo
 *
 * Desde 2026-11-11 a busca da Liga barra o coletor, e a varredura não acha
 * mais nada. Nessa fonte (decisão de 2026-11-12), o `GET` lista as cartas do
 * catálogo que servem para cada vaga vazia, com o valor de referência do
 * Cardmarket de cada uma, e o `POST` dispara a busca desse valor na TCGdex —
 * minutos, não horas. Teto e ordenação não vão para o servidor: a tela recebe
 * todas as candidatas e filtra na hora (`filtrarCandidatas`), porque mudar o
 * teto não pede rodada nova. A lista para colar, as abas e o "sem estoque"
 * seguem iguais. Ver `lib/dominio/candidatas-compra.ts`.
 */

type TipoComVaga = "pokedex" | "set";

function validarFiltros(
  corpo: unknown,
  padrao: Filtros,
):
  | { ok: true; filtros: Filtros; chaves?: string[]; validadeHoras: number }
  | { ok: false; erro: string } {
  if (typeof corpo !== "object" || corpo === null) {
    return { ok: false, erro: "Corpo inválido (JSON esperado)." };
  }
  const bruto = corpo as Record<string, unknown>;

  const teto = bruto.tetoPreco;
  if (teto !== null && teto !== undefined && (typeof teto !== "number" || teto <= 0)) {
    return { ok: false, erro: "tetoPreco deve ser um número positivo ou null." };
  }

  const ordenacao = bruto.ordenacao ?? padrao.ordenacao;
  if (ordenacao !== "preferencia" && ordenacao !== "preco") {
    return { ok: false, erro: 'ordenacao deve ser "preferencia" ou "preco".' };
  }

  // `chaves` é a forma geral (número da Pokédex ou `local_id` do set); `dex`
  // continua aceito porque é o que a tela da Pokédex sempre mandou.
  let chaves: string[] | undefined;
  const chavesBruto = bruto.chaves;
  if (chavesBruto !== undefined) {
    if (!Array.isArray(chavesBruto) || chavesBruto.some((c) => typeof c !== "string")) {
      return { ok: false, erro: "chaves deve ser uma lista de chaves de vaga." };
    }
    chaves = chavesBruto as string[];
  }

  const dexBruto = bruto.dex;
  if (dexBruto !== undefined) {
    if (!Array.isArray(dexBruto) || dexBruto.some((d) => !Number.isInteger(d))) {
      return { ok: false, erro: "dex deve ser uma lista de números da Pokédex." };
    }
    chaves = [...(chaves ?? []), ...(dexBruto as number[]).map(String)];
  }

  // Validade da consulta anterior: é o que faz a rodada nova pular a vaga que
  // já tem dado recente. Zero força reconsulta de tudo — a saída para quem
  // quer preço novo hoje, custe o tempo que custar.
  const validadeBruta = bruto.validadeHoras;
  if (
    validadeBruta !== undefined &&
    (typeof validadeBruta !== "number" || !Number.isFinite(validadeBruta) || validadeBruta < 0)
  ) {
    return { ok: false, erro: "validadeHoras deve ser um número de horas não negativo." };
  }

  return {
    ok: true,
    chaves,
    validadeHoras:
      validadeBruta === undefined ? VALIDADE_CONSULTA_HORAS : (validadeBruta as number),
    filtros: {
      tetoPreco: teto === undefined ? padrao.tetoPreco : (teto as number | null),
      incluirForaDoCatalogo:
        typeof bruto.incluirForaDoCatalogo === "boolean"
          ? bruto.incluirForaDoCatalogo
          : padrao.incluirForaDoCatalogo,
      ordenacao: ordenacao as Ordenacao,
      limitePorVaga:
        typeof bruto.limitePorVaga === "number" && bruto.limitePorVaga > 0
          ? bruto.limitePorVaga
          : null,
    },
  };
}

export const POST = comAcesso(async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ehUuid(id)) {
    return NextResponse.json(corpoRecusa("colecaoNaoEncontrada"), { status: 404 });
  }

  const colecao = await obterColecaoPorId(db, id);
  if (!colecao) {
    return NextResponse.json(corpoRecusa("colecaoNaoEncontrada"), { status: 404 });
  }
  if (colecao.tipo !== "pokedex" && colecao.tipo !== "set") {
    // Coleção customizada não tem vaga vazia no sentido de "carta que falta":
    // a vaga dela nasce ao alocar. Não há o que buscar.
    return NextResponse.json(corpoRecusa("opcoesDeCompraSoPokedexOuSet"), { status: 400 });
  }
  const tipo: TipoComVaga = colecao.tipo;

  let corpo: unknown = {};
  try {
    corpo = await req.json();
  } catch {
    // Corpo vazio é válido: usa os filtros padrão do tipo.
  }

  if (fonteDePreco() === "cardmarket") return dispararBuscaDePrecos(colecao, corpo);

  const validacao = validarFiltros(
    corpo,
    tipo === "set" ? FILTROS_PADRAO_SET : FILTROS_PADRAO,
  );
  if (!validacao.ok) {
    return NextResponse.json({ erro: validacao.erro }, { status: 400 });
  }

  // Uma leitura do `robots.txt` antes de qualquer decisão desta rota: é dela
  // que saem a janela de batimento e a estimativa, e é ela que garante que a
  // primeira requisição da rodada já sai no ritmo certo, em vez de descobrir
  // isso no meio do caminho. Cacheada — não é uma leitura por clique.
  const ritmo = await ritmoLigaPadrao().atualizar();

  // A janela de "morta" acompanha o ritmo: com 360 s entre requisições, uma
  // vaga sozinha passa dos 2 minutos que bastavam a 3 s, e a janela antiga
  // daria como morta uma rodada viva — liberando uma segunda em paralelo, que
  // é justamente o que dobra o ritmo contra o site deles.
  const janela = janelaSemBatimentoSegundos(
    ritmo.intervaloSegundos,
    requisicoesNoPiorCasoPorVaga(tipo),
  );

  // Rodada morta por reinício do processo fica "em andamento" para sempre —
  // fecha antes de decidir se há uma viva.
  await encerrarVarredurasMortas(db, id, janela);

  const emAndamento = await varreduraViva(db, id, janela);
  if (emAndamento) {
    // Duas rodadas simultâneas DOBRAM o ritmo contra o site deles: o
    // limitador é por rodada e não enxerga a irmã. Aconteceu em 2026-09-02,
    // com dois cliques no botão.
    return NextResponse.json(
      {
        ...corpoRecusa("varreduraEmAndamento"),
        varreduraId: emAndamento.id,
        vagasConsultadas: emAndamento.vagasConsultadas,
      },
      { status: 409 },
    );
  }

  // Vaga com opção recente é pulada: na escala de horas do ritmo novo,
  // disparar de novo depois de um reinício tem que continuar de onde parou, e
  // não refazer tudo. Ver `lib/dominio/frescor-consulta.ts`.
  const { pendentes, puladas } = await vagasParaVarrer(db, id, tipo, {
    apenasChaves: validacao.chaves,
    validadeHoras: validacao.validadeHoras,
  });

  if (pendentes.length === 0) {
    const nadaAConsultar =
      puladas.length > 0
        ? recusa("vagasJaConsultadas", {
            total: String(puladas.length),
            horas: String(validacao.validadeHoras),
          })
        : tipo === "set"
          ? recusa("semVagaVaziaComCartaIdentificavel")
          : recusa("semVagaVaziaComEspecieIdentificavel");
    return NextResponse.json(
      { ...corpoDaRecusa(nadaAConsultar), vagasPuladas: puladas.length },
      { status: 400 },
    );
  }

  const estimativaSegundos = segundosDeVarredura({
    tipo,
    vagas: pendentes.length,
    intervaloSegundos: ritmo.intervaloSegundos,
  });

  const varreduraId = await criarVarredura(db, id, validacao.filtros);

  // Deliberadamente sem `await`: a resposta sai agora e a varredura segue.
  // O `catch` existe para que uma falha aqui não vire rejeição sem dono no
  // processo do Next.
  void executarVarredura(db, id, varreduraId, pendentes, validacao.filtros).catch(() => {});

  return NextResponse.json(
    {
      varreduraId,
      vagasParaConsultar: pendentes.length,
      vagasPuladas: puladas.length,
      estimativaSegundos,
      estimativaTexto: formatarDuracao(estimativaSegundos),
      previsaoTermino: previsaoDeTermino(new Date(), estimativaSegundos).toISOString(),
      ritmo: { intervaloSegundos: ritmo.intervaloSegundos, origem: ritmo.origem },
    },
    { status: 202 },
  );
});

export const GET = comAcesso(async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ehUuid(id)) {
    return NextResponse.json(corpoRecusa("colecaoNaoEncontrada"), { status: 404 });
  }

  const colecao = await obterColecaoPorId(db, id);
  if (!colecao) {
    return NextResponse.json(corpoRecusa("colecaoNaoEncontrada"), { status: 404 });
  }

  // Estado do ritmo SEM I/O: a tela se atualiza a cada 5 segundos, e ler o
  // arquivo deles a cada render seria exatamente o padrão que a regra "a tela
  // lê snapshot, nunca o site" existe para impedir. Quem mantém isto quente é
  // a varredura.
  const ritmo = ritmoLigaPadrao().atual();

  const vazio = {
    tipo: colecao.tipo,
    ritmo: { intervaloSegundos: ritmo.intervaloSegundos, origem: ritmo.origem },
    varredura: null,
    vagas: [],
    selecionadas: 0,
    guardadas: 0,
    abasLiga: [],
    multiplas: [],
    total: 0,
    semPreco: 0,
    precoMaisAntigo: null,
  };

  if (colecao.tipo !== "pokedex" && colecao.tipo !== "set") {
    return NextResponse.json(vazio);
  }

  // A triagem do usuário vem PRIMEIRO e independe de varredura — é o que faz
  // o bloco para colar estar pronto quando ele abre a tela, sem rodar nada
  // (decisão de 2026-09-17).
  const escolhas = await listarEscolhas(db, id);
  // A lista para colar, com o preço na fonte da instalação — a mesma
  // montagem da leitura do "o que falta" (`resumoDaListaDeCompra`).
  const fonte = fonteDePreco();
  const { resumo: resumoDaLista } = await resumoDaListaDeCompra(
    db,
    { tipo: colecao.tipo, parametro: colecao.parametro },
    escolhas,
    fonte,
  );

  if (fonte === "cardmarket") {
    return NextResponse.json(
      await respostaDasCandidatas(req, colecao, escolhas, { ...vazio, ...resumoDaLista }),
    );
  }

  // Mesma limpeza do POST: quem abre a tela depois de um reinício precisa ver
  // "interrompida", não uma ampulheta eterna. E a mesma janela elástica: no
  // ritmo do robots.txt, uma rodada viva fica minutos sem bater.
  // Com o acesso por senha ligado, só quando a leitura vem da própria tela
  // (ver `leituraPodeGravar`); senão a rodada aparece como está no banco.
  if (leituraPodeGravar(req)) {
    await encerrarVarredurasMortas(
      db,
      id,
      janelaSemBatimentoSegundos(
        ritmo.intervaloSegundos,
        requisicoesNoPiorCasoPorVaga(colecao.tipo),
      ),
    );
  }

  const varredura = await obterUltimaVarredura(db, id);
  if (!varredura) {
    // Sem varredura a tela ainda tem o que mostrar: a lista para colar.
    return NextResponse.json({ ...vazio, ...resumoDaLista });
  }

  // As opções salvas, vaga a vaga, marcadas pela triagem e sem as sem
  // estoque — salvo a marcada (`opcoesDaVarreduraPorVaga`, que explica o
  // porquê de cada passo). A lista de vagas é a das vagas vazias de HOJE
  // (regra 6), não a das opções gravadas.
  const { vagas: agrupadas, vagasDaRodada } = await opcoesDaVarreduraPorVaga(
    db,
    id,
    colecao.tipo,
    escolhas,
    varredura.filtros,
  );

  const emAndamento = varredura.concluidaEm === null;

  // Quanto falta, em escala de horas.
  //
  // Derivado da mesma regra de frescor que a varredura usa, e não de um total
  // gravado na rodada: o que sobra aqui é exatamente o que uma rodada nova
  // consultaria agora — inclusive depois de um reinício, quando o total
  // original já não descreveria o trabalho restante. Mesmo ponto cego,
  // declarado uma vez em `frescor-consulta.ts`: vaga consultada que não achou
  // oferta conta como restante.
  const agora = new Date();
  const restantes = emAndamento
    ? separarPorFrescor(
        vagasDaRodada,
        await ultimaConsultaPorChave(
          db,
          id,
          corteDeFrescor({ agora, validadeHoras: VALIDADE_CONSULTA_HORAS }),
        ),
        { agora, validadeHoras: VALIDADE_CONSULTA_HORAS },
      ).pendentes.length
    : null;

  const segundosRestantes =
    restantes === null
      ? null
      : segundosDeVarredura({
          tipo: colecao.tipo,
          vagas: restantes,
          intervaloSegundos: ritmo.intervaloSegundos,
        });

  return NextResponse.json({
    tipo: colecao.tipo,
    ritmo: { intervaloSegundos: ritmo.intervaloSegundos, origem: ritmo.origem },
    varredura: {
      id: varredura.id,
      filtros: varredura.filtros,
      vagasConsultadas: varredura.vagasConsultadas,
      requisicoes: varredura.requisicoes,
      concluidaEm: varredura.concluidaEm,
      erro: varredura.erro,
      criadoEm: varredura.criadoEm,
      emAndamento,
      vagasRestantes: restantes,
      segundosRestantes,
      previsaoTermino:
        segundosRestantes === null
          ? null
          : previsaoDeTermino(agora, segundosRestantes).toISOString(),
    },
    vagas: agrupadas,
    ...resumoDaLista,
  });
});

type ColecaoComVaga = { id: string; tipo: string; parametro: unknown };

/**
 * `POST` na fonte Cardmarket: dispara a busca do valor de referência das
 * candidatas desta coleção (`iniciarRodadaCandidatas`). Mesmas recusas da
 * rodada do inventário, e a mesma resposta imediata da varredura: a rodada
 * segue no processo, e a tela acompanha pelo `GET`.
 *
 * `validadeHoras: 0` pergunta tudo de novo, como o "reconsultar tudo" da
 * varredura; o padrão pula o que foi perguntado na última semana.
 */
async function dispararBuscaDePrecos(colecao: ColecaoComVaga, corpo: unknown) {
  const validadeHoras =
    typeof corpo === "object" && corpo !== null
      ? (corpo as Record<string, unknown>).validadeHoras
      : undefined;
  if (
    validadeHoras !== undefined &&
    (typeof validadeHoras !== "number" || !Number.isFinite(validadeHoras) || validadeHoras < 0)
  ) {
    return NextResponse.json(
      { erro: "validadeHoras deve ser um número de horas não negativo." },
      { status: 400 },
    );
  }

  const inicio = await iniciarRodadaCandidatas(db, colecao, {
    validadeHoras: validadeHoras as number | undefined,
  });
  if (!inicio.iniciada) {
    return NextResponse.json(
      {
        ...corpoDaRecusa(inicio.recusa),
        rodadaId: inicio.viva?.id ?? null,
        cartasPuladas: inicio.cartasPuladas ?? 0,
      },
      { status: inicio.status },
    );
  }

  // Sem `await`, como a varredura: a resposta sai agora e a rodada segue. O
  // `catch` existe para uma falha aqui não virar rejeição sem dono.
  void executarRodadaCandidatas(db, inicio.rodadaId, inicio.pendentes, inicio.cotacao).catch(
    (err) => console.error(`[preços candidatas ${inicio.rodadaId}] ${String(err)}`),
  );

  const estimativaSegundos = segundosDeRodadaCardmarket(inicio.pendentes.length);
  return NextResponse.json(
    {
      rodadaId: inicio.rodadaId,
      cartasParaConsultar: inicio.pendentes.length,
      cartasPuladas: inicio.puladas.length,
      estimativaSegundos,
      previsaoTermino: previsaoDeTermino(new Date(), estimativaSegundos).toISOString(),
      cotacao: inicio.cotacao,
    },
    { status: 202 },
  );
}

/**
 * `GET` na fonte Cardmarket: as candidatas de cada vaga vazia, com o valor de
 * referência de cada uma, sem filtro (a tela filtra), e a busca de preços
 * desta coleção.
 *
 * A marcação é derivada da escolha pela carta (`carta_id`), como na
 * varredura ela era derivada pela identidade da Liga. A escolha que nenhuma
 * candidata explica — de uma varredura antiga, fora do catálogo — entra na
 * grade da vaga dela, marcada: é o único lugar em que dá para desmarcá-la.
 */
async function respostaDasCandidatas(
  req: Request,
  colecao: ColecaoComVaga,
  escolhas: readonly EscolhaSalva[],
  base: Record<string, unknown>,
) {
  // Mesma limpeza da varredura, com a mesma condição da senha.
  if (leituraPodeGravar(req)) {
    await encerrarRodadasDeCandidatasMortas(db, JANELA_SEM_BATIMENTO_CARDMARKET_SEGUNDOS);
  }

  const [vagas, rodada] = await Promise.all([
    listarCandidatasDaColecao(db, colecao, { comImagem: true }),
    ultimaRodadaDeCandidatas(db, colecao.id),
  ]);

  // As candidatas de cada vaga, com o valor de referência, a marcação
  // derivada da escolha (pela carta) e o filtro de sem estoque — salvo a
  // marcada. A escolha que nenhuma candidata explica entra marcada na vaga
  // dela. O porquê de cada passo está em `ofertarCandidatas`.
  const {
    vagas: vagasDaTela,
    cartasCandidatas,
    precos,
  } = await opcoesDasCandidatasPorVaga(db, vagas, escolhas);

  // Quanto do preço já existe — o que a tela diz ao lado do botão. "A buscar"
  // é exatamente o que uma rodada disparada agora perguntaria.
  const corte = corteDeFrescor({ agora: new Date(), validadeHoras: VALIDADE_PRECO_CANDIDATA_HORAS });
  let comPreco = 0;
  let semPrecoNoCardmarket = 0;
  let aBuscar = 0;
  for (const cartaId of cartasCandidatas) {
    const p = precos.get(cartaId);
    if (p?.valor != null) comPreco++;
    else if (p !== undefined) semPrecoNoCardmarket++;
    if (p === undefined || p.consultadoEm.getTime() <= corte.getTime()) aBuscar++;
  }

  const emAndamento = rodada !== null && rodada.concluidaEm === null;
  return {
    ...base,
    vagas: vagasDaTela,
    precosCandidatas: {
      cartas: cartasCandidatas.size,
      comPreco,
      semPrecoNoCardmarket,
      aBuscar,
      validadeDias: Math.round(VALIDADE_PRECO_CANDIDATA_HORAS / 24),
    },
    rodada:
      rodada === null
        ? null
        : {
            id: rodada.id,
            totalCartas: rodada.totalCartas,
            cartasConsultadas: rodada.cartasConsultadas,
            cartasComFalha: rodada.cartasComFalha,
            requisicoes: rodada.requisicoes,
            concluidaEm: rodada.concluidaEm,
            erro: rodada.erro,
            criadoEm: rodada.criadoEm,
            emAndamento,
            segundosRestantes: emAndamento
              ? segundosDeRodadaCardmarket(
                  Math.max(0, rodada.totalCartas - rodada.cartasConsultadas - rodada.cartasComFalha),
                )
              : null,
          },
  };
}
