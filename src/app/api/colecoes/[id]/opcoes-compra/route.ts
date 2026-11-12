import { NextResponse } from "next/server";

import { comAcesso, leituraPodeGravar } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { nomesDosSets, obterColecaoPorId } from "@/lib/db/consultas";
import {
  criarVarredura,
  encerrarVarredurasMortas,
  listarOpcoesMaisRecentesPorVaga,
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
  requisicoesNoPiorCasoPorVaga,
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
import { compararChavesVaga, lerChaveVagaSet } from "@/lib/dominio/chave-vaga-set";
import type { ParametroSet } from "@/lib/dominio/parametro-colecao";
import { listarSemEstoqueVigente } from "@/lib/db/sem-estoque";
import { chaveSemEstoque } from "@/lib/dominio/sem-estoque-liga";
import { totalDaLista } from "@/lib/dominio/exportacao-lista-compra";
import { identidadeDaCarta } from "@/lib/dominio/identidade-carta";
import { abasDaLista, linhaDaEscolha, precosDasEscolhas } from "@/lib/liga/lista-compra";
import { ehUuid } from "@/lib/dominio/uuid";
import { executarVarredura, vagasParaVarrer } from "@/lib/liga/varredura";
import { fonteDePreco } from "@/lib/dominio/fonte-preco";
import type { EscolhaSalva } from "@/lib/db/escolhas";
import {
  encerrarRodadasDeCandidatasMortas,
  listarCandidatasDaColecao,
  precosDasCandidatas,
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
  return vagas.map((v) => ({ chave: v.chave, rotulo: v.nome, dex: null, setNome: v.setNome }));
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

function vagasComVariasEscolhas(
  escolhas: ReadonlyArray<{ chave: string; especie: string | null; nome: string }>,
): Array<{ chave: string; rotulo: string; quantidade: number }> {
  const porVaga = new Map<string, { rotulo: string; quantidade: number }>();
  for (const e of escolhas) {
    const atual = porVaga.get(e.chave);
    if (atual) atual.quantidade++;
    else porVaga.set(e.chave, { rotulo: e.especie ?? e.nome, quantidade: 1 });
  }
  return [...porVaga]
    .filter(([, v]) => v.quantidade > 1)
    .map(([chave, v]) => ({ chave, ...v }))
    .sort((a, b) => compararChavesVaga()(a.chave, b.chave));
}

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
  // `vagaVazia` é o filtro que faz a lista encolher sozinha conforme o
  // usuário cadastra as cartas. A escolha de vaga já preenchida não some
  // do banco — fica guardada, e volta se a cópia sair da vaga.
  const daLista = escolhas.filter((e) => e.vagaVazia);
  // O preço é o da fonte da instalação, nunca as duas somadas
  // (`precosDasEscolhas`) — a mesma função da exportação.
  const fonte = fonteDePreco();
  const precoDe = await precosDasEscolhas(db, daLista, fonte);
  const linhas = daLista.map((e) => linhaDaEscolha(e, precoDe(e)));

  // Coleção que junta sets: uma aba por set, com o nome dele no rótulo.
  const ordemSets = colecao.tipo === "set" ? ((colecao.parametro as ParametroSet).sets ?? []) : [];
  const nomesSets =
    colecao.tipo === "set"
      ? await nomesDosSets(
          db,
          [...new Set(linhas.flatMap((l) => lerChaveVagaSet(l.chave)?.setId ?? []))],
          (colecao.parametro as ParametroSet).idiomaCatalogo,
        )
      : new Map<string, string>();

  const precos = daLista.map((e) => precoDe(e).em).filter((d): d is Date => d !== null);
  const resumoDaLista = {
    fonte,
    selecionadas: daLista.length,
    guardadas: escolhas.length - daLista.length,
    // Em abas de até 110 cartas, o limite da Compra por Lista deles — por
    // região na Pokédex. Ver `dividirListaCompra`.
    abasLiga: abasDaLista(linhas, colecao.tipo, ordemSets, nomesSets),
    // Vagas com mais de uma carta na string. Várias por vaga é permitido
    // (decisão de 2026-09-17), então é aviso, não recusa: na Pokédex é quase
    // sempre sobra de triagem, e cada linha a mais é uma carta a mais comprada.
    multiplas: vagasComVariasEscolhas(daLista),
    total: totalDaLista(linhas),
    // Preço sem data é armadilha: a carta que sumiu da varredura seguinte
    // continua aqui com o preço de antes, e a tela precisa poder dizer isso.
    semPreco: daLista.filter((e) => precoDe(e).preco === null).length,
    precoMaisAntigo:
      precos.length === 0
        ? null
        : new Date(Math.min(...precos.map((d) => d.getTime()))).toISOString(),
  };

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

  // Vaga a vaga, a consulta mais nova — não só a última rodada, que depois do
  // filtro de frescor pode ter consultado poucas vagas.
  const opcoes = await listarOpcoesMaisRecentesPorVaga(db, id);

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
  // Efeito colateral desejado: vaga que o usuário preencheu depois da
  // varredura sai da lista sozinha, em vez de oferecer compra do que já é
  // dele.
  // A carta que a Liga devolveu como "sem estoque" deixa de ser oferecida
  // (decisão de 2026-09-24, `lib/dominio/sem-estoque-liga.ts`). A varredura a
  // acharia de novo, com preço de outra condição — o filtro é aqui, na
  // leitura, e não na gravação, para que o registro vencido a traga de volta
  // sem varredura nova.
  //
  // **A já selecionada fica**, com a marca: esconder uma carta que está na
  // string tiraria do usuário o único jeito de desmarcá-la pela grade.
  const semEstoque = new Set((await listarSemEstoqueVigente(db)).map((r) => r.chave));
  const escondidasPorVaga = new Map<string, number>();
  const oferecidas = opcoesComMarcacao
    .map((o) => ({ ...o, semEstoque: semEstoque.has(chaveSemEstoque(o)) }))
    .filter((o) => {
      if (!o.semEstoque || o.selecionada) return true;
      escondidasPorVaga.set(o.chave, (escondidasPorVaga.get(o.chave) ?? 0) + 1);
      return false;
    });

  const vagasDaRodada = await vagasParaAgrupar(id, colecao.tipo);
  const agrupadas = montarOpcoesPorVaga(oferecidas, vagasDaRodada, varredura.filtros).map(
    (v) => ({ ...v, semEstoque: escondidasPorVaga.get(v.chave) ?? 0 }),
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

  const escolhasPorVaga = new Map<string, EscolhaSalva[]>();
  for (const e of escolhas) {
    if (!e.vagaVazia) continue;
    const lista = escolhasPorVaga.get(e.chave);
    if (lista) lista.push(e);
    else escolhasPorVaga.set(e.chave, [e]);
  }

  const cartasCandidatas = new Set(vagas.flatMap((v) => v.candidatas.map((c) => c.cartaId)));
  const precos = await precosDasCandidatas(db, [
    ...cartasCandidatas,
    ...escolhas.flatMap((e) => (e.cartaId === null ? [] : [e.cartaId])),
  ]);

  // Enxuto de propósito: uma Pokédex manda milhares de candidatas, e a tela
  // relê tudo a cada 10 s enquanto a busca anda. Vai só o que ela lê — a
  // data da pergunta só quando não há preço (para dizer "o Cardmarket não
  // tem"), a tendência só quando ela foi trocada pela média de 30 dias.
  const precoDaCarta = (cartaId: string | null) => {
    const p = cartaId === null ? undefined : precos.get(cartaId);
    if (p === undefined) return { preco: null };
    if (p.valor === null) return { preco: null, consultadaEm: p.consultadoEm.toISOString() };
    return {
      preco: p.valor,
      cardmarket: {
        valorEur: p.valorEur,
        criterioValor: p.criterioValor,
        ...(p.criterioValor === "media30" ? { tendenciaEur: p.tendenciaEur } : {}),
        cotacao: p.cotacao,
        cotacaoData: p.cotacaoData,
      },
    };
  };

  // Mesma regra da varredura: a carta que a Liga devolveu como sem estoque
  // some da grade, salvo se estiver marcada.
  const semEstoque = new Set((await listarSemEstoqueVigente(db)).map((r) => r.chave));

  const vagasDaTela = vagas.map((v) => {
    const daVaga = escolhasPorVaga.get(v.chave) ?? [];
    const explicadas = new Set<string>();
    const candidatas = v.candidatas.map((c) => {
      const marcadas = daVaga.filter((e) => e.cartaId === c.cartaId);
      for (const e of marcadas) explicadas.add(e.id);
      // Sem `caminho`: a tela o monta do nome (`caminhoBuscaLiga`).
      return {
        id: `${v.chave}|${c.cartaId}`,
        chave: v.chave,
        nome: c.nome,
        ...(c.nomeExibicao === null ? {} : { nomeExibicao: c.nomeExibicao }),
        edicaoNome: c.edicaoNome,
        numero: c.numero,
        total: c.total,
        raridade: c.raridade,
        cartaId: c.cartaId,
        selecionada: marcadas.length > 0,
        semEstoque: semEstoque.has(chaveSemEstoque(c)),
        imagemUrl: c.imagemUrl,
        imagemOrigem: c.imagemOrigem,
        ...precoDaCarta(c.cartaId),
      };
    });
    const avulsas = daVaga
      .filter((e) => !explicadas.has(e.id))
      .map((e) => ({
        id: `escolha|${e.id}`,
        escolhaId: e.id,
        chave: v.chave,
        nome: e.nome,
        edicaoNome: e.edicaoNome,
        numero: e.numero,
        total: e.total,
        raridade: e.raridade,
        cartaId: e.cartaId,
        caminho: e.caminho,
        selecionada: true,
        semEstoque: semEstoque.has(chaveSemEstoque(e)),
        imagemUrl: null,
        imagemOrigem: null,
        ...precoDaCarta(e.cartaId),
      }));

    let escondidas = 0;
    const oferecidas = [...avulsas, ...candidatas].filter((o) => {
      if (!o.semEstoque || o.selecionada) return true;
      escondidas++;
      return false;
    });
    return {
      chave: v.chave,
      rotulo: v.rotulo,
      setNome: v.setNome,
      dex: v.dex,
      opcoes: oferecidas,
      descartadas: 0,
      semEstoque: escondidas,
    };
  });

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
