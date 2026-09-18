/**
 * Orquestração da varredura de opções de compra — o que acontece quando o
 * usuário aperta "Verificar opções faltantes" numa coleção.
 *
 * Server-only. O cliente HTTP e o ritmo estão em `./cliente.ts`; o filtro e a
 * ordenação em `lib/dominio/liga-opcoes.ts`; o casamento da vaga de set em
 * `lib/dominio/liga-set.ts`; a persistência em `lib/db/liga.ts`.
 *
 * ## Dois tipos de vaga, um só motor
 *
 * - **Pokédex**: a vaga é uma espécie. Uma busca pelo nome dela devolve
 *   dezenas de cartas, e todas são opção legítima — ele escolhe qual quer.
 * - **Set**: a vaga é uma carta específica. A busca é pelo nome da carta e o
 *   que sobra é uma linha só, a da edição e número certos; o resto do
 *   resultado é reimpressão em outras edições, que não preenche a vaga.
 *
 * O ritmo, o batimento, o tratamento de bloqueio e a gravação incremental são
 * idênticos nos dois — por isso o laço é um só.
 *
 * ## Por que roda em segundo plano
 *
 * 161 vagas vazias no ritmo do `robots.txt` deles dão ~16 horas (eram ~12
 * minutos quando o intervalo era 3 s — ver `./ritmo.ts`). Nenhum navegador
 * espera nem o menor dos dois numa requisição HTTP. Então o POST cria a linha
 * de varredura, devolve o id na hora, e o trabalho segue no processo: a tela
 * consulta o progresso e vai mostrando o que já chegou.
 *
 * **Grava por vaga, não no fim.** Se a varredura morrer no meio — bloqueio do
 * site, restart do container —, o que já foi consultado continua servindo. Uma
 * rodada que só entrega no fim transforma horas de trabalho em zero ao
 * primeiro tropeço.
 *
 * **E a rodada seguinte não refaz o que já tem.** Na escala de horas, reinício
 * é rotina; `vagasParaVarrer` pula a vaga cuja opção ainda está dentro da
 * validade, então disparar de novo consulta só o que faltava. É a outra metade
 * da mesma ideia: gravar cedo preserva o trabalho, pular o fresco evita
 * repeti-lo.
 */

import type { Database } from "@/lib/db/client";
import { atualizarPrecosDasEscolhas } from "@/lib/db/escolhas";
import {
  casarComCatalogo,
  casarComVagaSet,
  concluirVarredura,
  gravarOpcoes,
  listarVagasVaziasPokedex,
  listarVagasVaziasSet,
  registrarEdicoesVistas,
  tocarProgresso,
  ultimaConsultaPorChave,
  vinculosDoSet,
  type VagaVaziaPokedex,
  type VagaVaziaSet,
} from "@/lib/db/liga";
import {
  corteDeFrescor,
  separarPorFrescor,
  VALIDADE_CONSULTA_HORAS,
} from "@/lib/dominio/frescor-consulta";
import type { LinhaBuscaLiga } from "@/lib/dominio/liga-busca";
import { nomeCompativelComEspecie, termoDeBusca } from "@/lib/dominio/liga-busca";
import type { Filtros, OpcaoCompra } from "@/lib/dominio/liga-opcoes";
import { linhaCasaComVagaSet } from "@/lib/dominio/liga-set";
import { criarClienteLiga, ErroBloqueioLiga, type ClienteLiga } from "./cliente";

/** Uma vaga vazia a consultar, já sabendo de que tipo de coleção ela veio. */
export type VagaParaVarrer =
  | ({ tipo: "pokedex" } & VagaVaziaPokedex)
  | ({ tipo: "set" } & VagaVaziaSet);

/** Como a vaga aparece em mensagem de erro e log. */
function rotuloDaVaga(vaga: VagaParaVarrer): string {
  return vaga.tipo === "pokedex" ? vaga.especie : `${vaga.chave} ${vaga.nome}`;
}

export interface ResumoVarredura {
  vagasConsultadas: number;
  requisicoes: number;
  opcoesEncontradas: number;
  erro?: string;
  /** Vagas que falharam sozinhas, com o motivo. Nunca some em silêncio. */
  falhas: Array<{ vaga: string; motivo: string }>;
}

/**
 * Consulta uma vaga de Pokédex: tudo o que existe daquela espécie dentro do
 * teto vira opção.
 */
async function consultarVagaPokedex(
  db: Database,
  cliente: ClienteLiga,
  vaga: VagaVaziaPokedex,
  filtros: Filtros,
): Promise<{ opcoes: OpcaoCompra[]; requisicoes: number }> {
  const { termo, exigeCasamento } = termoDeBusca(vaga.especie);
  const { linhas, requisicoes } = await cliente.buscarEspecie(termo, filtros.tetoPreco);

  await registrarEdicoesVistas(db, linhas);

  const comVaga = linhas.map((l) => ({
    ...l,
    chave: vaga.chave,
    dex: vaga.dex,
    especie: vaga.especie,
  }));
  const opcoes = await casarComCatalogo(db, comVaga);

  return {
    requisicoes,
    opcoes: opcoes.filter(
      (o) =>
        o.preco !== null &&
        (filtros.tetoPreco === null || o.preco <= filtros.tetoPreco) &&
        // Termo ambíguo (Nidoran): só entra o que o catálogo confirmou ser
        // desta espécie. Ver `termoDeBusca`.
        (!exigeCasamento || o.cartaId !== null) &&
        // Carta fora do catálogo não tem `dexId` para provar a espécie, então
        // o nome precisa provar. Sem isso, "Mew" recebia oferta de Mewtwo.
        (o.cartaId !== null || nomeCompativelComEspecie(o.nome, vaga.especie)),
    ),
  };
}

/**
 * Consulta uma vaga de set: procura a carta pelo nome e fica só com a linha da
 * edição e do número certos.
 *
 * **A segunda tentativa existe por causa das cartas de Treinador.** O termo
 * padrão é o nome em inglês, que é como a lista deles escreve; quando ele não
 * acha nada, vale tentar o nome no idioma da coleção antes de declarar a vaga
 * sem oferta. Custa uma requisição a mais só onde a primeira já falhou.
 */
async function consultarVagaSet(
  db: Database,
  cliente: ClienteLiga,
  vaga: VagaVaziaSet,
  filtros: Filtros,
  setPorEdid: ReadonlyMap<number, string>,
): Promise<{ opcoes: OpcaoCompra[]; requisicoes: number }> {
  const alvo = { numero: vaga.chave, setId: vaga.setId, setSigla: vaga.setSigla };
  const achou = (linhas: readonly LinhaBuscaLiga[]) =>
    linhas.some((l) => linhaCasaComVagaSet(l, alvo, setPorEdid));

  let requisicoes = 0;
  let encontradas: OpcaoCompra[] = [];

  for (const nome of [vaga.nomeBusca, vaga.nomeAlternativo]) {
    if (nome === null) continue;

    const resultado = await cliente.buscarCarta(nome, achou);
    requisicoes += resultado.requisicoes;
    await registrarEdicoesVistas(db, resultado.linhas);

    encontradas = casarComVagaSet(vaga, resultado.linhas, setPorEdid);
    if (encontradas.length > 0) break;
  }

  return {
    requisicoes,
    opcoes: encontradas.filter(
      (o) => o.preco !== null && (filtros.tetoPreco === null || o.preco <= filtros.tetoPreco),
    ),
  };
}

/**
 * Consulta cada vaga vazia e grava as opções encontradas.
 *
 * Erro de bloqueio **para a rodada inteira** e é registrado na varredura — a
 * tela precisa dizer "parou porque fomos barrados", não fingir que acabou.
 * Erro de uma vaga só (5xx, timeout) pula a vaga e segue: uma vaga a menos é
 * melhor do que perder as outras 160.
 */
export async function executarVarredura(
  db: Database,
  colecaoId: string,
  varreduraId: string,
  vagas: ReadonlyArray<VagaParaVarrer>,
  filtros: Filtros,
  cliente: ClienteLiga = criarClienteLiga(),
): Promise<ResumoVarredura> {
  let requisicoes = 0;
  let vagasConsultadas = 0;
  let opcoesEncontradas = 0;
  let erro: string | undefined;
  const falhas: Array<{ vaga: string; motivo: string }> = [];
  // Guardadas para refrescar o preço da triagem dele no fim da rodada.
  const vistas: Array<{
    chave: string;
    edid: number | null;
    edicaoSigla: string;
    numero: string;
    preco: number;
  }> = [];

  // Uma consulta por rodada, e não por carta: a rodada inteira olha para o
  // mesmo set. A Pokédex não usa o mapa.
  const setId = vagas.find((v) => v.tipo === "set")?.setId;
  const setPorEdid = setId ? await vinculosDoSet(db, setId) : new Map<number, string>();

  for (const vaga of vagas) {
    try {
      const { opcoes, requisicoes: gastas } =
        vaga.tipo === "pokedex"
          ? await consultarVagaPokedex(db, cliente, vaga, filtros)
          : await consultarVagaSet(db, cliente, vaga, filtros, setPorEdid);
      requisicoes += gastas;

      await gravarOpcoes(db, varreduraId, opcoes);
      for (const o of opcoes) {
        if (o.preco !== null) {
          vistas.push({
            chave: o.chave,
            edid: o.edicaoId,
            edicaoSigla: o.edicaoSigla,
            numero: o.numero,
            preco: o.preco,
          });
        }
      }
      opcoesEncontradas += opcoes.length;
      vagasConsultadas++;
      // Batimento: progresso visível na tela e prova de que a rodada vive.
      await tocarProgresso(db, varreduraId, { vagasConsultadas, requisicoes });
    } catch (err) {
      if (err instanceof ErroBloqueioLiga) {
        erro = err.message;
        break;
      }
      // Vaga que falhou sozinha não derruba a rodada — mas também não
      // desaparece: sem o registro, uma varredura que consultou zero vagas
      // fica indistinguível de uma que não achou nada. Foi exatamente esse
      // buraco que escondeu o primeiro defeito real desta feature.
      const motivo = err instanceof Error ? err.message : String(err);
      falhas.push({ vaga: rotuloDaVaga(vaga), motivo });
      console.error(`[varredura ${varreduraId}] falha em ${rotuloDaVaga(vaga)}: ${motivo}`);
      continue;
    }
  }

  // Rodada em que TODAS as vagas falharam não é rodada bem-sucedida sem
  // resultado: é rodada quebrada, e a tela precisa dizer isso.
  const resumoFalhas =
    falhas.length === 0
      ? undefined
      : `${falhas.length} vaga(s) falharam. Primeira: ${falhas[0].vaga} — ${falhas[0].motivo}`;

  // Refresca o preço da triagem dele com o que esta rodada viu.
  //
  // É isto que torna útil rodar de novo: desde 2026-09-17 a escolha sobrevive
  // à varredura (`escolha_compra`), então uma rodada nova **atualiza** a lista
  // de compras em vez de apagá-la. Roda também quando a rodada abortou: o que
  // foi visto até ali é preço bom, e descartá-lo não ajudaria ninguém.
  //
  // Falha aqui não pode derrubar a varredura — ela já fez o trabalho caro.
  try {
    await atualizarPrecosDasEscolhas(db, colecaoId, vistas);
  } catch (err) {
    console.error(
      `[varredura ${varreduraId}] preços da triagem não atualizados: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  await concluirVarredura(db, varreduraId, {
    vagasConsultadas,
    requisicoes,
    erro: erro ?? resumoFalhas,
  });
  return { vagasConsultadas, requisicoes, opcoesEncontradas, erro, falhas };
}

export interface OpcoesVagasParaVarrer {
  /** Recorta a rodada a um subconjunto — a tela pedindo "só estas vagas". */
  apenasChaves?: readonly string[];
  /** Validade da consulta anterior, em horas. Zero consulta tudo de novo. */
  validadeHoras?: number;
  agora?: Date;
}

/**
 * As vagas que a varredura vai consultar, na ordem em que serão consultadas —
 * e as que ela vai pular por já terem dado recente.
 *
 * ## Por que pular
 *
 * Obedecendo o `Crawl-delay` deles, as 161 vagas de uma Pokédex levam ~16
 * horas em vez de ~12 minutos. Nessa escala, reinício de container é rotina, e
 * a gravação por vaga (que já existia) só resolvia metade do problema: o que
 * foi consultado sobrevivia, mas a rodada seguinte o consultava de novo do
 * mesmo jeito, porque a lista de vagas não tinha noção de "esta eu já
 * consultei faz pouco". Cair na hora 15 de 16 custava 15 horas e mandava o
 * dobro de requisições pedindo o que já temos — o oposto do motivo de estar
 * indo para o intervalo maior.
 *
 * Com o filtro, **quem dispara de novo continua de onde parou**, porque só o
 * que falta é consultado. Isto não é retomada automática: não há fila, worker
 * nem job persistente, e nada sobe sozinho com o container. Quem decide rodar
 * continua sendo o usuário.
 *
 * Vale igual para os dois tipos de vaga — é o mesmo motor.
 */
export async function vagasParaVarrer(
  db: Database,
  colecaoId: string,
  tipo: "pokedex" | "set",
  {
    apenasChaves,
    validadeHoras = VALIDADE_CONSULTA_HORAS,
    agora = new Date(),
  }: OpcoesVagasParaVarrer = {},
): Promise<{ pendentes: VagaParaVarrer[]; puladas: VagaParaVarrer[] }> {
  const todas: VagaParaVarrer[] =
    tipo === "pokedex"
      ? (await listarVagasVaziasPokedex(db, colecaoId)).map((v) => ({
          tipo: "pokedex" as const,
          ...v,
        }))
      : (await listarVagasVaziasSet(db, colecaoId)).map((v) => ({
          tipo: "set" as const,
          ...v,
        }));

  const pedidas =
    !apenasChaves || apenasChaves.length === 0
      ? todas
      : todas.filter((v) => new Set(apenasChaves).has(v.chave));

  if (validadeHoras <= 0) return { pendentes: pedidas, puladas: [] };

  const consultadas = await ultimaConsultaPorChave(
    db,
    colecaoId,
    corteDeFrescor({ agora, validadeHoras }),
  );
  return separarPorFrescor(pedidas, consultadas, { agora, validadeHoras });
}
