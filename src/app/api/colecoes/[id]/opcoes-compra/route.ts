import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { obterColecaoPorId } from "@/lib/db/consultas";
import {
  criarVarredura,
  encerrarVarredurasMortas,
  listarOpcoesDaVarredura,
  listarVagasVaziasPokedex,
  listarVagasVaziasSet,
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
  segundosDeVarredura,
} from "@/lib/dominio/estimativa-varredura";
import { corpoDaRecusa, corpoRecusa, recusa } from "@/lib/dominio/recusa";
import { ritmoLigaPadrao } from "@/lib/liga/ritmo";
import {
  FILTROS_PADRAO,
  FILTROS_PADRAO_SET,
  montarOpcoesPorVaga,
  type Filtros,
  type Ordenacao,
  type VagaParaAgrupar,
} from "@/lib/dominio/liga-opcoes";
import { listarEscolhas } from "@/lib/db/escolhas";
import { gerarListaLiga, totalDaLista } from "@/lib/dominio/exportacao-lista-compra";
import { identidadeDaCarta } from "@/lib/dominio/identidade-carta";
import { linhaDaEscolha } from "@/lib/liga/lista-compra";
import { ehUuid } from "@/lib/dominio/uuid";
import { executarVarredura, vagasParaVarrer } from "@/lib/liga/varredura";

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

/** As vagas vazias de hoje, no formato que o agrupamento da tela espera. */
async function vagasParaAgrupar(
  colecaoId: string,
  tipo: TipoComVaga,
): Promise<VagaParaAgrupar[]> {
  if (tipo === "pokedex") {
    const vagas = await listarVagasVaziasPokedex(db, colecaoId);
    return vagas.map((v) => ({ chave: v.chave, rotulo: v.especie, dex: v.dex }));
  }
  const vagas = await listarVagasVaziasSet(db, colecaoId);
  return vagas.map((v) => ({ chave: v.chave, rotulo: v.nome, dex: null }));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const janela = janelaSemBatimentoSegundos(ritmo.intervaloSegundos);

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
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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
    listaLiga: "",
    total: 0,
    semPreco: 0,
    precoMaisAntigo: null,
  };

  if (colecao.tipo !== "pokedex" && colecao.tipo !== "set") {
    return NextResponse.json(vazio);
  }

  // A triagem dele vem PRIMEIRO e independe de varredura — é o que faz o bloco
  // para colar estar pronto quando ele abre a tela, sem rodar nada (decisão
  // dele em 2026-09-17).
  const escolhas = await listarEscolhas(db, id);
  // `vagaVazia` é o filtro que faz a lista encolher sozinha conforme ele
  // cadastra as cartas. A escolha de vaga já preenchida não some do banco —
  // fica guardada, e volta se a cópia sair da vaga.
  const daLista = escolhas.filter((e) => e.vagaVazia);
  const linhas = daLista.map(linhaDaEscolha);

  const precos = daLista.map((e) => e.precoEm).filter((d): d is Date => d !== null);
  const resumoDaLista = {
    selecionadas: daLista.length,
    guardadas: escolhas.length - daLista.length,
    listaLiga: gerarListaLiga(linhas),
    total: totalDaLista(linhas),
    // Preço sem data é armadilha: a carta que sumiu da varredura seguinte
    // continua aqui com o preço de antes, e a tela precisa poder dizer isso.
    semPreco: daLista.filter((e) => e.preco === null).length,
    precoMaisAntigo:
      precos.length === 0
        ? null
        : new Date(Math.min(...precos.map((d) => d.getTime()))).toISOString(),
  };

  // Mesma limpeza do POST: quem abre a tela depois de um reinício precisa ver
  // "interrompida", não uma ampulheta eterna. E a mesma janela elástica: no
  // ritmo do robots.txt, uma rodada viva fica minutos sem bater.
  await encerrarVarredurasMortas(
    db,
    id,
    janelaSemBatimentoSegundos(ritmo.intervaloSegundos),
  );

  const varredura = await obterUltimaVarredura(db, id);
  if (!varredura) {
    // Sem varredura a tela ainda tem o que mostrar: a lista para colar.
    return NextResponse.json({ ...vazio, ...resumoDaLista });
  }

  const opcoes = await listarOpcoesDaVarredura(db, varredura.id);

  // A marcação de cada opção é DERIVADA da escolha, não uma coluna dela: a
  // verdade mora em `escolha_compra`, e a linha da varredura é descartável.
  // É isso que faz a varredura nova já nascer com a triagem no lugar.
  const escolhidas = new Set(escolhas.map((e) => `${e.chave}|${e.identidade}`));
  const opcoesComMarcacao = opcoes.map((o) => ({
    ...o,
    // `edicaoId` é o `edid` deles — o nome muda entre a linha da busca e a
    // coluna do banco, e a identidade precisa do valor, não do rótulo.
    selecionada: escolhidas.has(
      `${o.chave}|${identidadeDaCarta({
        edid: o.edicaoId,
        edicaoSigla: o.edicaoSigla,
        numero: o.numero,
      })}`,
    ),
  }));

  // A lista de vagas vem das vagas vazias de HOJE, não das opções gravadas.
  //
  // Derivá-la das opções fazia sumir justamente a vaga mais informativa: a que
  // não achou nenhuma carta dentro do teto. Na primeira varredura completa
  // foram 6 de 161, e a tela dizia "155 de 155" — escondendo a pergunta certa,
  // que é "quais Pokémon não têm carta comprável por esse preço?". Regra 6:
  // vaga vazia é saída de primeira classe.
  //
  // Efeito colateral desejado: vaga que ele preencheu depois da varredura sai
  // da lista sozinha, em vez de oferecer compra do que já é dele.
  const vagasDaRodada = await vagasParaAgrupar(id, colecao.tipo);
  const agrupadas = montarOpcoesPorVaga(opcoesComMarcacao, vagasDaRodada, varredura.filtros);

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
}
