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
  varreduraViva,
} from "@/lib/db/liga";
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
 * processo, porque 161 vagas a uma requisição a cada 3 segundos dão ~12
 * minutos e nenhum navegador espera isso. `GET` lê o snapshot — **nunca** bate
 * no site deles durante a renderização.
 *
 * Coleção customizada fica de fora: a vaga dela nasce ao alocar, com chave
 * sequencial, e não representa uma carta que falta comprar.
 */

type TipoComVaga = "pokedex" | "set";

function validarFiltros(
  corpo: unknown,
  padrao: Filtros,
): { ok: true; filtros: Filtros; chaves?: string[] } | { ok: false; erro: string } {
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

  return {
    ok: true,
    chaves,
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

/**
 * Segundos estimados da rodada — o número que evita a pergunta "travou?".
 *
 * A base é 3,75 s por requisição (3 s de intervalo mais o jitter médio). Na
 * Pokédex é uma requisição por vaga. No set a busca pode precisar de até três
 * páginas até achar a carta, e as de Treinador podem ainda gastar uma segunda
 * tentativa com o nome em português — na primeira rodada real do PFL a média
 * é o que vai calibrar isto; até lá, 1,6 requisição por vaga é a estimativa
 * declarada como estimativa.
 */
function estimativaSegundos(tipo: TipoComVaga, vagas: number): number {
  return Math.round(vagas * 3.75 * (tipo === "set" ? 1.6 : 1));
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
    return NextResponse.json({ erro: "Coleção não encontrada." }, { status: 404 });
  }

  const colecao = await obterColecaoPorId(db, id);
  if (!colecao) {
    return NextResponse.json({ erro: "Coleção não encontrada." }, { status: 404 });
  }
  if (colecao.tipo !== "pokedex" && colecao.tipo !== "set") {
    // Coleção customizada não tem vaga vazia no sentido de "carta que falta":
    // a vaga dela nasce ao alocar. Não há o que buscar.
    return NextResponse.json(
      { erro: "Opções de compra existem para coleção do tipo Pokédex ou set." },
      { status: 400 },
    );
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

  // Rodada morta por reinício do processo fica "em andamento" para sempre —
  // fecha antes de decidir se há uma viva.
  await encerrarVarredurasMortas(db, id);

  const emAndamento = await varreduraViva(db, id);
  if (emAndamento) {
    // Duas rodadas simultâneas DOBRAM o ritmo contra o site deles: o
    // limitador é por rodada e não enxerga a irmã. Aconteceu em 2026-09-02,
    // com dois cliques no botão.
    return NextResponse.json(
      {
        erro: "Já existe uma varredura em andamento nesta coleção. Espere ela terminar.",
        varreduraId: emAndamento.id,
        vagasConsultadas: emAndamento.vagasConsultadas,
      },
      { status: 409 },
    );
  }

  const vagas = await vagasParaVarrer(db, id, tipo, validacao.chaves);
  if (vagas.length === 0) {
    return NextResponse.json(
      {
        erro:
          tipo === "set"
            ? "Nenhuma vaga vazia com carta identificável nesta coleção."
            : "Nenhuma vaga vazia com espécie identificável nesta coleção.",
      },
      { status: 400 },
    );
  }

  const varreduraId = await criarVarredura(db, id, validacao.filtros);

  // Deliberadamente sem `await`: a resposta sai agora e a varredura segue.
  // O `catch` existe para que uma falha aqui não vire rejeição sem dono no
  // processo do Next.
  void executarVarredura(db, id, varreduraId, vagas, validacao.filtros).catch(() => {});

  return NextResponse.json(
    {
      varreduraId,
      vagasParaConsultar: vagas.length,
      estimativaSegundos: estimativaSegundos(tipo, vagas.length),
    },
    { status: 202 },
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ehUuid(id)) {
    return NextResponse.json({ erro: "Coleção não encontrada." }, { status: 404 });
  }

  const colecao = await obterColecaoPorId(db, id);
  if (!colecao) {
    return NextResponse.json({ erro: "Coleção não encontrada." }, { status: 404 });
  }

  const vazio = {
    tipo: colecao.tipo,
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
  // "interrompida", não uma ampulheta eterna.
  await encerrarVarredurasMortas(db, id);

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

  return NextResponse.json({
    tipo: colecao.tipo,
    varredura: {
      id: varredura.id,
      filtros: varredura.filtros,
      vagasConsultadas: varredura.vagasConsultadas,
      requisicoes: varredura.requisicoes,
      concluidaEm: varredura.concluidaEm,
      erro: varredura.erro,
      criadoEm: varredura.criadoEm,
      emAndamento: varredura.concluidaEm === null,
    },
    vagas: agrupadas,
    ...resumoDaLista,
  });
}
