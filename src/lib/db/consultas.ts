/**
 * Consultas usadas pelos route handlers da Fase 1 (cadastro por set,
 * cadastro por busca, inventário). Camada fina sobre o Drizzle — a
 * validação e as regras (o que é obrigatório, o fallback de idioma etc.)
 * ficam em `lib/dominio/`; aqui só monta e roda SQL.
 */

import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { alias, type AnyPgColumn } from "drizzle-orm/pg-core";

import type { Database, Transacao } from "./client";
import { cartaCatalogo, colecao, copia, imagemLocal, melhoriaDescartada, vaga } from "./schema";
import type { Condicao, Idioma, VarianteCopia } from "@/lib/dominio/enums";
import { compararLocalId } from "@/lib/dominio/ordenacao";
import { type Recusa, recusa } from "@/lib/dominio/recusa";
import type { OrigemImagem } from "@/lib/dominio/origem-imagem";
import { casaNumeroCarta } from "@/lib/dominio/busca-carta";
import { resolverIdiomaCatalogoDoSet } from "@/lib/dominio/idioma-catalogo";
import { resolverDexIdsPorNome } from "@/lib/dominio/nome-especie";
import { derivarForma } from "@/lib/dominio/forma";
import { energiaDaCarta, type TipoEnergia } from "@/lib/dominio/tipo-energia";
import {
  idCartaManual,
  type CartaManualValida,
} from "@/lib/dominio/carta-manual";
import type { CopiaParaInserir } from "@/lib/dominio/lote-copias";
import { fundirCopias } from "@/lib/dominio/fusao-copias";
import {
  selecionarMelhorias,
  type EixoMelhoria,
} from "@/lib/dominio/melhoria-vaga";
import type { CopiaCriadaValida, PatchCopiaValido } from "@/lib/dominio/copia";
import type { FiltrosInventario } from "@/lib/dominio/filtros-inventario";
import type { FiltrosRepetidas } from "@/lib/dominio/filtros-repetidas";
import {
  variantesDisponiveis,
  validarVariantesContraCatalogo,
  type ErroVarianteCatalogo,
  type FlagsVariantesCatalogo,
} from "@/lib/dominio/variantes-catalogo";

/**
 * Imagem da carta e a PROCEDÊNCIA dela — cadeia de prioridade resolvida
 * em SQL.
 *
 * Ordem, do melhor para o pior:
 *
 * 1. `propria`  — foto que o usuário enviou (upload ou link baixado).
 *                 Correção deliberada dele sobre o que o catálogo diz:
 *                 vence até quando existe imagem oficial.
 * 2. `catalogo` — `imagem_url` da linha do próprio idioma. O caso normal.
 * 3. `mypcards` — scan de terceiro baixado para o nosso volume, no MESMO
 *                 idioma. Fica abaixo do catálogo oficial e acima do
 *                 empréstimo, porque idioma certo vale mais que fonte
 *                 oficial em língua errada.
 * 4. `catalogo-pt` / `catalogo-en` — a foto do MESMO card (mesmo `id`) na
 *                 outra língua ocidental. Recupera 509 das 1.129 linhas pt
 *                 sem foto, e 85 das en (medido em 2026-08-29). Seguro
 *                 para identificação: em pt/en o id é o mesmo, então é a
 *                 mesma arte, o mesmo número e o mesmo set — só muda a
 *                 língua impressa. Vai marcada com selo na tela
 *                 (`seloOrigemImagem`), a pedido do usuário: o sistema não
 *                 pode deixá-lo achar que tem a versão inglesa quando a
 *                 cópia é a portuguesa.
 * 5. `cdn`      — palpite montado direto no CDN de assets da TCGdex.
 *
 * **O degrau 5 vale só para `jp`, e esse corte é o ponto desta mudança.**
 * Até 2026-08-29 ele valia para os três idiomas. Em pt/en o palpite erra
 * quase sempre (0 de 1.082 em pt, 59 de 915 em en — medição de
 * 2026-08-26), e errar é caro de um jeito que não estava previsto: **o
 * CDN não devolve 404 para arquivo inexistente — ele segura a conexão por
 * 60 s e responde 504** (medido em 2026-08-29). Como o navegador abre no
 * máximo 6 conexões por host, cada palpite errado ocupa um desses slots
 * por um minuto inteiro, e as fotos que EXISTEM ficam na fila atrás dele:
 * poucas cartas sem foto travam a exibição da grade inteira. No japonês o
 * palpite acerta ~52% e segue valendo — lá o importador do repositório
 * não traz imagem nenhuma, então é a única fonte que existe.
 *
 * A ordem é declarada UMA vez (`degrausImagem`) e lida por duas funções:
 * uma devolve a URL exibida, a outra a origem correspondente. As duas
 * leem a mesma lista de propósito — se divergissem, a tela mostraria uma
 * foto com o selo de outra.
 */

export interface ColunasImagem {
  // Tipado pelas colunas, não pela tabela: a mesma expressão serve para
  // `cartaCatalogo` e para o alias `cartaCopia` do join das cópias.
  id: AnyPgColumn;
  imagemUrl: AnyPgColumn;
  setSerieId: AnyPgColumn;
  idioma: AnyPgColumn;
  setId: AnyPgColumn;
  localId: AnyPgColumn;
  /** Resultado da verificação do CDN; `null` = ainda não verificado. */
  imagemCdnExiste: AnyPgColumn;
}

/**
 * Os degraus, em ordem: `[posição, url ou null, rótulo da origem]`.
 * Renderizado dentro de um `VALUES` correlacionado — forma conferida
 * contra o banco real antes de entrar aqui.
 */
function degrausImagem(t: ColunasImagem) {
  const urlLocal = (ehPropria: boolean) => sql`(
      select '/api/imagens-locais/' || ${imagemLocal.cartaId} || '/' || ${imagemLocal.idioma}::text
      from ${imagemLocal}
      where ${imagemLocal.cartaId} = ${t.id}
        and ${imagemLocal.idioma} = ${t.idioma}
        and ${imagemLocal.origem}::text ${ehPropria ? sql`in ('upload', 'url')` : sql`= 'mypcards'`}
    )::text`;

  // Alias escrito à mão, e não via `alias()` do Drizzle: dentro de um
  // template `sql` cru, o objeto de alias renderiza só o nome do alias,
  // sem a tabela por trás — o que dá `relation does not exist` (42P01)
  // na hora, conferido contra o banco. Interpolando a tabela e nomeando
  // o alias aqui, o SQL sai completo. O nome precisa ser diferente do
  // usado pela consulta de fora (às vezes já é `carta_copia`), senão a
  // subconsulta se referiria a si mesma.
  const urlEmprestada = sql`(
      select emprestimo.imagem_url
      from ${cartaCatalogo} as emprestimo
      where emprestimo.id = ${t.id}
        and emprestimo.idioma = (case when ${t.idioma} = 'pt' then 'en' else 'pt' end)::idioma
        and ${t.idioma} in ('pt', 'en')
    )::text`;

  // Duas portas de entrada, e a diferença entre elas é o que separa
  // "palpite" de "fato":
  //
  // - **Verificado como existente** (`imagem_cdn_existe = true`): vale
  //   para qualquer idioma. É por aqui que voltam as 59 cartas em inglês
  //   cujo arquivo está no CDN mesmo com `imagem_url` nulo — o corte de
  //   pt/en tinha levado essas junto, e a verificação as devolve sem
  //   trazer o custo de volta.
  // - **Japonês ainda não verificado** (`null`): segue no palpite, que lá
  //   acerta ~52% e é a única fonte que existe (o importador do
  //   repositório não traz imagem nenhuma).
  //
  // Verificado como AUSENTE nunca gera URL, em idioma nenhum. E pt/en não
  // verificado também não: é exatamente o palpite que pendurava a página
  // por 60 s, e lá ele erra quase sempre.
  const urlCdn = sql`(case
      when ${t.setSerieId} is not null
       and (
         ${t.imagemCdnExiste} = true
         or (${t.idioma} = 'jp' and ${t.imagemCdnExiste} is null)
       ) then
        'https://assets.tcgdex.net/'
        || case when ${t.idioma} = 'jp' then 'ja' else ${t.idioma}::text end
        || '/' || ${t.setSerieId} || '/' || ${t.setId} || '/' || ${t.localId}
    end)::text`;

  return sql`(values
      (1, ${urlLocal(true)}, 'propria'::text),
      (2, ${t.imagemUrl}::text, 'catalogo'::text),
      (3, ${urlLocal(false)}, 'mypcards'::text),
      (4, ${urlEmprestada}, (case when ${t.idioma} = 'pt' then 'catalogo-en' else 'catalogo-pt' end)::text),
      (5, ${urlCdn}, 'cdn'::text)
    ) as degrau(ordem, url, origem)`;
}

/**
 * A URL da imagem a exibir — o primeiro degrau que tem foto.
 *
 * Exportada (com `origemDaImagem` e `ColunasImagem`) porque a Fase 6 lê a
 * mesma cadeia de outro módulo (`lib/db/liga.ts`). Reimplementar lá faria
 * exatamente o que o comentário acima proíbe: duas ordens que divergem e uma
 * tela mostrando foto de um degrau com o selo de outro.
 */
export function imagemDaCarta(t: ColunasImagem) {
  return sql<string | null>`(
    select degrau.url from ${degrausImagem(t)}
    where degrau.url is not null order by degrau.ordem limit 1
  )`;
}

/** De onde veio a foto exibida — o rótulo do MESMO degrau escolhido acima. */
export function origemDaImagem(t: ColunasImagem) {
  return sql<OrigemImagem | null>`(
    select degrau.origem from ${degrausImagem(t)}
    where degrau.url is not null order by degrau.ordem limit 1
  )`;
}
import type { ColecaoCriadaValida, PatchColecaoValido } from "@/lib/dominio/colecao";
import type { ParametroPokedex, ParametroSet, TipoColecao } from "@/lib/dominio/parametro-colecao";
import {
  detectarCatalogoIncompleto,
  type AvisoCatalogoIncompleto,
} from "@/lib/dominio/catalogo-incompleto";
import {
  resolverUniversoVagasSet,
  type AvisoSemNumeracaoOficial,
} from "@/lib/dominio/numeracao-oficial-set";
import {
  resolverNomeEspecie,
  type LinhaCatalogoParaNome,
} from "@/lib/dominio/nome-especie";
import {
  avaliarElegibilidade,
  ehForaDePadrao,
} from "@/lib/dominio/elegibilidade-vaga";
import { planejarAlocacaoDeLote } from "@/lib/dominio/divisao-lote";
import { proximaChaveSequencial } from "@/lib/dominio/chave-sequencial";
import {
  agruparChavesPorRegiao,
  calcularDiffEscopoPokedex,
  formatarContagemPorRegiao,
} from "@/lib/dominio/escopo-colecao";
import {
  calcularProgressoPorRegiao,
  type ProgressoRegiao,
} from "@/lib/dominio/progresso-regiao";

// --- Sets (cadastro rápido por set) ----------------------------------------

export interface SetParaCadastro {
  setId: string;
  setNome: string;
  setSerie: string;
  /**
   * Id estável da série (`carta_catalogo.set_serie_id`), sensível a
   * caixa — chave real do agrupamento em `agruparSetsPorSerie`
   * (`lib/dominio/agrupamento-sets.ts`); `setSerie` (nome) é só rótulo,
   * porque vem traduzido conforme a linha de catálogo disponível. `null`
   * quando o catálogo não tem o id para nenhuma linha deste set (não
   * deveria acontecer hoje — 100% das 47.719 linhas preenchidas em
   * 2026-08-26 — mas o schema permite).
   */
  setSerieId: string | null;
  /** Sigla impressa na carta (ex.: "MEW"). Null quando o upstream não tem. */
  setSigla: string | null;
  /** Data de lançamento ISO ("YYYY-MM-DD"). Null quando o upstream não tem. */
  setLancamento: string | null;
  idiomaCatalogo: Idioma;
  temPt: boolean;
  /** Todos os idiomas em que o CATÁLOGO tem este set (filtro + rótulo do seletor de expansão). */
  idiomasDisponiveis: Idioma[];
  qtdOficial: number;
  qtdTotal: number;
  /**
   * Quantas cartas desse set (no `idiomaCatalogo` resolvido) já estão
   * materializadas no catálogo local — mesmo dado que `formatarRotuloSet`
   * usa via `resolverUniversoVagasSet` pra não anunciar "0 cartas" em
   * set sem numeração oficial (achado do coordenador, caso `mep`).
   */
  qtdCartasNoCatalogo: number;
}

/** pt > en > jp — mesma preferência de `resolverIdiomaCatalogoDoSet`, estendida ao 3º idioma. */
const PRIORIDADE_IDIOMA_CATALOGO: readonly Idioma[] = ["pt", "en", "jp"];

/**
 * Lista todos os sets cadastráveis, um por `set_id`, já com o idioma de
 * catálogo resolvido (pt se existir, senão en — regra 7 do AGENTS.md /
 * `resolverIdiomaCatalogoDoSet`) e todos os idiomas em que o catálogo
 * tem aquele set (`idiomasDisponiveis`, para o filtro e o rótulo do
 * seletor de expansão — tarefa do filtro de idioma).
 *
 * Uma query só, agrupada por `(set_id, idioma, ...)`: dá até uma linha
 * por idioma de cada set (hoje pt e/ou en; jp entra sozinho quando
 * houver sync), nunca N+1 — e o `Map` por `set_id` abaixo garante que
 * cada expansão aparece **uma vez** na lista final, mesmo tendo várias
 * linhas de origem. Universo é o de `en` (199 sets na Fase 0), porque
 * todo set sincronizado tem ao menos a linha `en`.
 */
export async function listarSetsParaCadastro(
  db: Database,
): Promise<SetParaCadastro[]> {
  const linhas = await db
    .select({
      setId: cartaCatalogo.setId,
      idioma: cartaCatalogo.idioma,
      nome: cartaCatalogo.setNome,
      serie: cartaCatalogo.setSerie,
      serieId: cartaCatalogo.setSerieId,
      sigla: cartaCatalogo.setSigla,
      lancamento: cartaCatalogo.setLancamento,
      qtdOficial: cartaCatalogo.setQtdOficial,
      qtdTotal: cartaCatalogo.setQtdTotal,
      // Contagem de cartas ativas materializadas para este (set, idioma)
      // — alimenta `qtdCartasNoCatalogo` sem consulta extra por set.
      qtdCartasNoCatalogo: sql<number>`count(*)::int`,
    })
    .from(cartaCatalogo)
    .where(eq(cartaCatalogo.ativa, true))
    .groupBy(
      cartaCatalogo.setId,
      cartaCatalogo.idioma,
      cartaCatalogo.setNome,
      cartaCatalogo.setSerie,
      cartaCatalogo.setSerieId,
      cartaCatalogo.setSigla,
      cartaCatalogo.setLancamento,
      cartaCatalogo.setQtdOficial,
      cartaCatalogo.setQtdTotal,
    );

  const porSetId = new Map<string, typeof linhas>();
  for (const linha of linhas) {
    const grupo = porSetId.get(linha.setId);
    if (grupo) grupo.push(linha);
    else porSetId.set(linha.setId, [linha]);
  }

  return Array.from(porSetId.values())
    .map((linhasDoSet): SetParaCadastro => {
      const idiomasDisponiveis = PRIORIDADE_IDIOMA_CATALOGO.filter((idioma) =>
        linhasDoSet.some((l) => l.idioma === idioma),
      );
      const idiomaCatalogo = resolverIdiomaCatalogoDoSet(idiomasDisponiveis);
      const temPt = idiomasDisponiveis.includes("pt");
      // Linha "representante" pra nome/sigla/data/contagem: mesma
      // preferência pt > en > jp usada pra escolher idiomaCatalogo.
      const escolhido =
        linhasDoSet.find((l) => l.idioma === idiomaCatalogo) ?? linhasDoSet[0];
      return {
        setId: escolhido.setId,
        setNome: escolhido.nome,
        setSerie: escolhido.serie,
        setSerieId: escolhido.serieId,
        setSigla: escolhido.sigla,
        setLancamento: escolhido.lancamento,
        idiomaCatalogo,
        temPt,
        idiomasDisponiveis,
        qtdOficial: escolhido.qtdOficial,
        qtdTotal: escolhido.qtdTotal,
        qtdCartasNoCatalogo: escolhido.qtdCartasNoCatalogo,
      };
    })
    .sort((a, b) => {
      // Mais recente primeiro; set sem data de lançamento vai pro fim
      // (não some) — pedido do usuário; quem já tem set_lancamento
      // preenchido (backfill 2026-08-25) domina a ordem.
      if (a.setLancamento === null && b.setLancamento === null) {
        return a.setNome.localeCompare(b.setNome, "pt-BR");
      }
      if (a.setLancamento === null) return 1;
      if (b.setLancamento === null) return -1;
      if (a.setLancamento !== b.setLancamento) {
        return a.setLancamento < b.setLancamento ? 1 : -1;
      }
      return a.setNome.localeCompare(b.setNome, "pt-BR");
    });
}

export interface CartaParaGrade {
  cartaId: string;
  localId: string;
  nome: string;
  categoria: string;
  raridade: string | null;
  imagemUrl: string | null;
  /** De onde veio a foto acima (`origemDaImagem`) — governa o selo na tela. */
  imagemOrigem: OrigemImagem | null;
  varianteNormalDisponivel: boolean;
  varianteReverseDisponivel: boolean;
  varianteHoloDisponivel: boolean;
  variantePrimeiraEdicaoDisponivel: boolean;
  variantePromoDisponivel: boolean;
}

export interface GradeDoSet {
  setId: string;
  setNome: string;
  idiomaCatalogo: Idioma;
  temPt: boolean;
  cartas: CartaParaGrade[];
}

/**
 * Grade de cadastro de um set: resolve o fallback de idioma (regra 7) e
 * devolve as cartas na ordem impressa (`compararLocalId`).
 */
export async function obterGradeDoSet(
  db: Database,
  setId: string,
): Promise<GradeDoSet | null> {
  // Quais idiomas este set tem no catálogo local. Consulta os três de uma
  // vez em vez de só perguntar "existe pt?": um set exclusivo do Japão
  // (116 deles) não tem pt nem en, e responder "en" para ele fazia a grade
  // devolver "Set não encontrado".
  const idiomasDoSet = await db
    .selectDistinct({ idioma: cartaCatalogo.idioma })
    .from(cartaCatalogo)
    .where(
      and(eq(cartaCatalogo.setId, setId), eq(cartaCatalogo.ativa, true)),
    );

  const idiomaCatalogo = resolverIdiomaCatalogoDoSet(
    idiomasDoSet.map((l) => l.idioma),
  );
  const temPt = idiomasDoSet.some((l) => l.idioma === "pt");

  const linhas = await db
    .select({
      cartaId: cartaCatalogo.id,
      localId: cartaCatalogo.localId,
      nome: cartaCatalogo.nome,
      dexIds: cartaCatalogo.dexIds,
      categoria: cartaCatalogo.categoria,
      raridade: cartaCatalogo.raridade,
      imagemUrl: imagemDaCarta(cartaCatalogo),
      imagemOrigem: origemDaImagem(cartaCatalogo),
      varianteNormalDisponivel: cartaCatalogo.varianteNormalDisponivel,
      varianteReverseDisponivel: cartaCatalogo.varianteReverseDisponivel,
      varianteHoloDisponivel: cartaCatalogo.varianteHoloDisponivel,
      variantePrimeiraEdicaoDisponivel:
        cartaCatalogo.variantePrimeiraEdicaoDisponivel,
      variantePromoDisponivel: cartaCatalogo.variantePromoDisponivel,
      setNome: cartaCatalogo.setNome,
    })
    .from(cartaCatalogo)
    .where(
      and(
        eq(cartaCatalogo.setId, setId),
        eq(cartaCatalogo.idioma, idiomaCatalogo),
        eq(cartaCatalogo.ativa, true),
      ),
    );

  if (linhas.length === 0) return null;

  const cartas = await comNomeEspecie(
    db,
    linhas
      .slice()
      .sort((a, b) => compararLocalId(a.localId, b.localId))
      // A grade inteira é de um set só, logo de um idioma de catálogo só —
      // `comNomeEspecie` decide carta a carta, então precisa do campo.
      .map((c) => ({ ...c, idiomaCatalogo })),
  );

  return {
    setId,
    setNome: linhas[0].setNome,
    idiomaCatalogo,
    temPt,
    cartas: cartas.map((c) => ({
      cartaId: c.cartaId,
      localId: c.localId,
      nome: c.nome,
      nomeEspecie: c.nomeEspecie,
      categoria: c.categoria,
      raridade: c.raridade,
      imagemUrl: c.imagemUrl,
      imagemOrigem: c.imagemOrigem,
      varianteNormalDisponivel: c.varianteNormalDisponivel,
      varianteReverseDisponivel: c.varianteReverseDisponivel,
      varianteHoloDisponivel: c.varianteHoloDisponivel,
      variantePrimeiraEdicaoDisponivel: c.variantePrimeiraEdicaoDisponivel,
      variantePromoDisponivel: c.variantePromoDisponivel,
    })),
  };
}

// --- Cadastro por busca ------------------------------------------------

export interface CartaEncontrada {
  cartaId: string;
  idiomaCatalogo: Idioma;
  localId: string;
  nome: string;
  /**
   * Nome ocidental da espécie, só para carta cujo nome está em japonês —
   * `null` no resto (e em Treinador/Energia japonês, que não têm número
   * de Pokédex). A tela mostra "フシギソウ (Ivysaur)".
   */
  nomeEspecie: string | null;
  setId: string;
  setNome: string;
  categoria: string;
  raridade: string | null;
  imagemUrl: string | null;
  /** De onde veio a foto acima (`origemDaImagem`) — governa o selo na tela. */
  imagemOrigem: OrigemImagem | null;
  varianteNormalDisponivel: boolean;
  varianteReverseDisponivel: boolean;
  varianteHoloDisponivel: boolean;
  variantePrimeiraEdicaoDisponivel: boolean;
  variantePromoDisponivel: boolean;
}

/**
 * Busca cartas por nome, set, número ou sigla+número. Uma linha por `id`
 * de carta, preferindo a linha `pt` quando existir e caindo para `en`
 * (mesma regra 7 da grade por set) — via `DISTINCT ON (id)` ordenado para
 * priorizar pt.
 *
 * `sigla` é a sigla impressa na carta (`carta_catalogo.set_sigla`, ver
 * migration 0003 e `scripts/backfill-metadados-set.ts`). Quando vem
 * junto de `numero`, o filtro de número em SQL é exato (`=`) — não
 * tolera zero à esquerda —, então a tolerância é aplicada depois, em JS,
 * com `casaNumeroCarta` (lib/dominio/busca-carta.ts): o filtro por sigla
 * já reduz o resultado a um único set (no máximo algumas centenas de
 * cartas), então filtrar em JS ali é barato e evita reproduzir em SQL a
 * lógica de "remover zero à esquerda mantendo sufixo" (o lugar certo
 * dessa lógica é o módulo puro testado, não uma expressão SQL).
 */
/**
 * Nome ocidental da espécie para cartas cujo nome está em japonês.
 *
 * **Por que existe (2026-08-26).** Com o catálogo japonês, as telas de
 * cadastro e inventário passaram a mostrar `フシギソウ` e `ヒトカゲ` — quem
 * não lê japonês não tem como saber que carta é. Não há nome ocidental na
 * fonte: o repositório traz nome latino em só ~3% das cartas japonesas (e
 * não nas que motivam o cadastro), e nenhum nome em inglês para os
 * sets. O que existe é o **número da Pokédex**, o mesmo vínculo que a
 * busca por nome já usa.
 *
 * Resolve em lote, numa consulta só, e só para os números que aparecem
 * nas linhas japonesas recebidas — nunca carrega o catálogo inteiro.
 * Carta sem `dexId` (Treinador, Energia) ou com mais de um (tag team)
 * fica sem nome ocidental: **nunca inventamos um**.
 */
async function nomesEspeciePara(
  db: Database,
  numeros: readonly number[],
): Promise<Map<number, string | null>> {
  const unicos = [...new Set(numeros)];
  if (unicos.length === 0) return new Map();

  const linhas = await db
    .select({
      nome: cartaCatalogo.nome,
      idioma: cartaCatalogo.idioma,
      dexIds: cartaCatalogo.dexIds,
    })
    .from(cartaCatalogo)
    .where(
      and(
        eq(cartaCatalogo.ativa, true),
        // Só pt/en: são as linhas que têm o nome que o usuário reconhece.
        inArray(cartaCatalogo.idioma, ["pt", "en"]),
        sql`array_length(${cartaCatalogo.dexIds}, 1) = 1`,
        sql`${cartaCatalogo.dexIds} && ${sql.raw(`ARRAY[${unicos.join(",")}]::integer[]`)}`,
      ),
    );

  const porNumero = new Map<number, LinhaCatalogoParaNome[]>();
  for (const l of linhas) {
    const numero = (l.dexIds ?? [])[0];
    if (numero === undefined) continue;
    const lista = porNumero.get(numero);
    const entrada = { nome: l.nome, idioma: l.idioma, dexIds: l.dexIds ?? [] };
    if (lista) lista.push(entrada);
    else porNumero.set(numero, [entrada]);
  }

  const resultado = new Map<number, string | null>();
  for (const numero of unicos) {
    resultado.set(numero, resolverNomeEspecie(numero, porNumero.get(numero) ?? []));
  }
  return resultado;
}

/**
 * Anexa `nomeEspecie` às linhas cujo nome está em japonês. Devolve a
 * mesma lista, na mesma ordem, com o campo a mais — `null` onde não há
 * como resolver.
 */
async function comNomeEspecie<
  T extends { idiomaCatalogo: Idioma; dexIds?: readonly number[] | null },
>(db: Database, linhas: T[]): Promise<(T & { nomeEspecie: string | null })[]> {
  const numeros: number[] = [];
  for (const l of linhas) {
    if (l.idiomaCatalogo !== "jp") continue;
    const dex = l.dexIds ?? [];
    if (dex.length === 1) numeros.push(dex[0]);
  }
  const nomes = await nomesEspeciePara(db, numeros);
  return linhas.map((l) => {
    const dex = l.dexIds ?? [];
    const nomeEspecie =
      l.idiomaCatalogo === "jp" && dex.length === 1
        ? (nomes.get(dex[0]) ?? null)
        : null;
    return { ...l, nomeEspecie };
  });
}

/**
 * Números de Pokédex que o texto digitado identifica, olhando só as linhas
 * ocidentais (pt/en) — são elas que têm o nome que o usuário digita.
 *
 * Consulta estreita de propósito: só nome, idioma e dexIds, só cartas
 * ocidentais com dexId preenchido, e com teto. Sem o teto, digitar uma
 * letra sozinha varreria dezenas de milhares de linhas para depois
 * montar um `ARRAY[...]` gigante — a busca do cadastro roda a cada tecla.
 */
const LIMITE_LINHAS_PARA_DEXID = 400;

async function dexIdsDoNome(db: Database, nome: string): Promise<number[]> {
  const linhas = await db
    .select({
      nome: cartaCatalogo.nome,
      idioma: cartaCatalogo.idioma,
      dexIds: cartaCatalogo.dexIds,
    })
    .from(cartaCatalogo)
    .where(
      and(
        eq(cartaCatalogo.ativa, true),
        // Os TRÊS idiomas, desde 2026-08-29. Antes só pt/en, o que fazia
        // a ponte funcionar num sentido só: "Ivysaur" achava フシギソウ,
        // mas フシギソウ não achava as cartas ocidentais de Ivysaur. Como
        // a ponte é o número da Pokédex — que não tem idioma —, ler o
        // japonês como fonte é o que torna a busca simétrica.
        ilike(cartaCatalogo.nome, `%${nome}%`),
        sql`array_length(${cartaCatalogo.dexIds}, 1) = 1`,
      ),
    )
    .limit(LIMITE_LINHAS_PARA_DEXID);

  return resolverDexIdsPorNome(
    nome,
    linhas.map((l) => ({
      nome: l.nome,
      idioma: l.idioma,
      dexIds: l.dexIds ?? [],
    })),
  );
}

/**
 * Cria (ou atualiza) uma linha de catálogo criada à mão pelo usuário,
 * para carta que a TCGdex não tem. Ver `carta_catalogo.origem` no schema
 * e `lib/dominio/carta-manual.ts`.
 *
 * Idempotente por `(id, idioma)`: reenviar a mesma carta corrige os
 * dados em vez de duplicar — e **nunca rebaixa `origem`**, para a carta
 * seguir protegida da inativação do sync.
 *
 * Variantes: libera todas. O catálogo real diz quais existem, mas aqui
 * não há catálogo — restringir seria inventar uma limitação sobre uma
 * carta que só o usuário está vendo.
 */
export async function criarCartaManual(
  db: Database,
  carta: CartaManualValida,
): Promise<{ cartaId: string; jaExistia: boolean }> {
  const id = idCartaManual(carta.setId, carta.localId);

  const existente = await db
    .select({ id: cartaCatalogo.id })
    .from(cartaCatalogo)
    .where(
      and(eq(cartaCatalogo.id, id), eq(cartaCatalogo.idioma, carta.idioma)),
    )
    .limit(1);

  const linha = {
    id,
    idioma: carta.idioma,
    setId: carta.setId,
    setNome: carta.setNome,
    // Sem série no upstream: a carta manual fica no seu próprio grupo do
    // seletor, rotulado pela sigla do set. Nunca chuta uma série real.
    setSerie: carta.setNome,
    setSerieId: null,
    setSigla: carta.setId,
    setLancamento: null,
    localId: carta.localId,
    nome: carta.nome,
    categoria: carta.dexIds.length > 0 ? "Pokemon" : "Trainer",
    raridade: carta.raridade,
    dexIds: carta.dexIds,
    forma: derivarForma(carta.nome),
    varianteNormalDisponivel: true,
    varianteReverseDisponivel: true,
    varianteHoloDisponivel: true,
    variantePrimeiraEdicaoDisponivel: true,
    variantePromoDisponivel: true,
    imagemUrl: null,
    ilustrador: null,
    setQtdOficial: carta.qtdSet ?? 0,
    setQtdTotal: carta.qtdSet ?? 0,
    ativa: true,
    origem: "manual" as const,
    atualizadoEm: new Date(),
  };

  await db
    .insert(cartaCatalogo)
    .values(linha)
    .onConflictDoUpdate({
      target: [cartaCatalogo.id, cartaCatalogo.idioma],
      set: {
        setNome: linha.setNome,
        setSerie: linha.setSerie,
        setSigla: linha.setSigla,
        localId: linha.localId,
        nome: linha.nome,
        categoria: linha.categoria,
        raridade: linha.raridade,
        dexIds: linha.dexIds,
        forma: linha.forma,
        setQtdOficial: linha.setQtdOficial,
        setQtdTotal: linha.setQtdTotal,
        ativa: true,
        origem: "manual",
        atualizadoEm: linha.atualizadoEm,
      },
    });

  return { cartaId: id, jaExistia: existente.length > 0 };
}

export async function buscarCartas(
  db: Database,
  filtros: { nome?: string; setId?: string; numero?: string; sigla?: string },
): Promise<CartaEncontrada[]> {
  const condicoes = [eq(cartaCatalogo.ativa, true)];
  if (filtros.nome) {
    // Busca por nome também alcança o catálogo japonês, que guarda o nome
    // em japonês (`フシギソウ`, não "Ivysaur"). O vínculo entre as duas
    // grafias já existe no dado: o número da Pokédex. Descobrimos os
    // números que o texto digitado identifica nas linhas pt/en e
    // incluímos as cartas que os têm — sem tabela de tradução, sem API.
    const dexIds = await dexIdsDoNome(db, filtros.nome);
    const porNome = ilike(cartaCatalogo.nome, `%${filtros.nome}%`);
    condicoes.push(
      dexIds.length > 0
        ? or(
            porNome,
            sql`${cartaCatalogo.dexIds} && ${sql.raw(`ARRAY[${dexIds.join(",")}]::integer[]`)}`,
          )!
        : porNome,
    );
  }
  if (filtros.setId) {
    condicoes.push(
      or(
        // Case-insensitive de propósito: os ids de set japoneses são
        // maiúsculos (`SV2a`, `SM3H`) e o que vem impresso na carta é
        // minúsculo (`sv2a 002/165`). Exigir a caixa exata fazia a busca
        // do set não achar nada para quem digita o que está lendo na
        // carta — que é o fluxo normal de cadastro.
        ilike(cartaCatalogo.setId, filtros.setId),
        ilike(cartaCatalogo.setNome, `%${filtros.setId}%`),
      )!,
    );
  }
  if (filtros.sigla) {
    // ILIKE sem coringa = igualdade exata case-insensitive.
    //
    // Cai para o id do set quando não há sigla gravada: o catálogo
    // japonês não traz `abbreviation` (fica nulo, e nunca inventamos um
    // valor), mas a sigla impressa na carta japonesa É o id do set —
    // conferido em duas cartas físicas reais, `SM3H` no Charmander e
    // `sv2a` no Ivysaur. Sem isto, o atalho "sigla + número numa entrada
    // só" simplesmente não funciona para nenhuma carta japonesa.
    condicoes.push(
      or(
        ilike(cartaCatalogo.setSigla, filtros.sigla),
        ilike(cartaCatalogo.setId, filtros.sigla),
      )!,
    );
  }
  if (filtros.numero && !filtros.sigla) {
    condicoes.push(eq(cartaCatalogo.localId, filtros.numero));
  }

  const linhas = await db
    .selectDistinctOn([cartaCatalogo.id], {
      cartaId: cartaCatalogo.id,
      idiomaCatalogo: cartaCatalogo.idioma,
      localId: cartaCatalogo.localId,
      nome: cartaCatalogo.nome,
      dexIds: cartaCatalogo.dexIds,
      setId: cartaCatalogo.setId,
      setNome: cartaCatalogo.setNome,
      categoria: cartaCatalogo.categoria,
      raridade: cartaCatalogo.raridade,
      imagemUrl: imagemDaCarta(cartaCatalogo),
      imagemOrigem: origemDaImagem(cartaCatalogo),
      varianteNormalDisponivel: cartaCatalogo.varianteNormalDisponivel,
      varianteReverseDisponivel: cartaCatalogo.varianteReverseDisponivel,
      varianteHoloDisponivel: cartaCatalogo.varianteHoloDisponivel,
      variantePrimeiraEdicaoDisponivel: cartaCatalogo.variantePrimeiraEdicaoDisponivel,
      variantePromoDisponivel: cartaCatalogo.variantePromoDisponivel,
    })
    .from(cartaCatalogo)
    .where(and(...condicoes))
    .orderBy(
      cartaCatalogo.id,
      // dentro de cada id, pt vem primeiro — DISTINCT ON fica com a 1ª linha.
      sql`(${cartaCatalogo.idioma} = 'pt') desc`,
    )
    // Busca por sigla é escopada a UM set (no máximo ~307 cartas no
    // catálogo atual) — 100 cortaria sets grandes antes do filtro de
    // número (bug real: "MEW 151" voltava vazio porque local_id "151"
    // ficava fora dos 100 primeiros por ordem de `id`). Sem sigla, a
    // busca é texto livre no catálogo inteiro — mantém o teto de 100.
    .limit(filtros.sigla ? 500 : 100);

  const linhasFiltradas =
    filtros.sigla && filtros.numero
      ? linhas.filter((l) => casaNumeroCarta(l.localId, filtros.numero!))
      : linhas;

  const ordenadas = linhasFiltradas
    .slice()
    .sort((a, b) => {
      if (a.setId !== b.setId) return a.setId.localeCompare(b.setId);
      return compararLocalId(a.localId, b.localId);
    });

  return comNomeEspecie(db, ordenadas);
}

// --- Variantes disponíveis (restrição da Fase 1 — validação real com
// fichário: cadastro não pode gravar variante que a carta não tem) --------

const COLUNAS_FLAGS_VARIANTE = {
  varianteNormalDisponivel: cartaCatalogo.varianteNormalDisponivel,
  varianteReverseDisponivel: cartaCatalogo.varianteReverseDisponivel,
  varianteHoloDisponivel: cartaCatalogo.varianteHoloDisponivel,
  variantePrimeiraEdicaoDisponivel: cartaCatalogo.variantePrimeiraEdicaoDisponivel,
  variantePromoDisponivel: cartaCatalogo.variantePromoDisponivel,
} as const;

/**
 * Variantes disponíveis (já resolvidas via `variantesDisponiveis`, ver
 * lib/dominio/variantes-catalogo.ts) para um lote de cartas do MESMO
 * idioma de catálogo — usado pelo cadastro por set, que valida a grade
 * inteira contra o catálogo antes de gravar.
 */
export async function obterVariantesDisponiveisPorCarta(
  db: Database,
  idiomaCatalogo: Idioma,
  cartaIds: readonly string[],
): Promise<Record<string, VarianteCopia[]>> {
  if (cartaIds.length === 0) return {};
  const linhas = await db
    .select({ cartaId: cartaCatalogo.id, ...COLUNAS_FLAGS_VARIANTE })
    .from(cartaCatalogo)
    .where(
      and(eq(cartaCatalogo.idioma, idiomaCatalogo), inArray(cartaCatalogo.id, [...cartaIds])),
    );

  const mapa: Record<string, VarianteCopia[]> = {};
  for (const linha of linhas) {
    const { cartaId, ...flags } = linha;
    mapa[cartaId] = variantesDisponiveis(flags as FlagsVariantesCatalogo);
  }
  return mapa;
}

/** Mesma coisa, para uma única carta (cadastro por busca e edição de cópia). */
export async function obterVariantesDisponiveisDaCarta(
  db: Database,
  cartaId: string,
  idiomaCatalogo: Idioma,
): Promise<VarianteCopia[] | null> {
  const [linha] = await db
    .select(COLUNAS_FLAGS_VARIANTE)
    .from(cartaCatalogo)
    .where(and(eq(cartaCatalogo.id, cartaId), eq(cartaCatalogo.idioma, idiomaCatalogo)))
    .limit(1);
  if (!linha) return null;
  return variantesDisponiveis(linha as FlagsVariantesCatalogo);
}

// --- Inserção de cópias --------------------------------------------------

/**
 * Procura, para uma cópia que está entrando, a linha existente com que
 * ela deve se fundir — ou `null` quando deve virar linha nova.
 *
 * Regras em `lib/dominio/fusao-copias.ts`. As duas exclusões que moram
 * aqui, e não lá, porque dependem do banco:
 *
 * - **`graded_empresa` nulo**: carta graded nunca funde (certificado é
 *   único). O lado puro decide sobre a cópia NOVA; aqui se garante que a
 *   candidata antiga também não é graded.
 * - **Sem vaga apontando para ela**: alocar divide o lote e a linha
 *   alocada fica sempre com quantidade 1 (`divisao-lote.ts`). Somar numa
 *   linha alocada faria a vaga apontar para um lote de 2.
 *
 * `FOR UPDATE` porque quem chama vai somar em cima do que leu: sem o
 * lock, dois cadastros simultâneos da mesma carta leriam quantidade 1 e
 * ambos gravariam 2, perdendo uma unidade. Um usuário só torna isso
 * improvável, não impossível — duas abas bastam.
 *
 * Mais antiga primeiro: é ela que sobrevive, mesma decisão da divisão de
 * lote.
 */
async function acharCopiaParaFundir(
  tx: Database | Transacao,
  dados: {
    cartaId: string;
    idiomaCatalogo: Idioma;
    idioma: Idioma;
    variante: VarianteCopia;
    condicao: Condicao;
    localizacao: string | null;
  },
): Promise<CopiaFundivel | null> {
  const localizacaoNormalizada = dados.localizacao?.trim() ?? "";
  const linhas = await tx
    .select({
      id: copia.id,
      quantidade: copia.quantidade,
      gradedEmpresa: copia.gradedEmpresa,
      aquisicaoData: copia.aquisicaoData,
      aquisicaoOrigem: copia.aquisicaoOrigem,
      aquisicaoPreco: copia.aquisicaoPreco,
      notas: copia.notas,
    })
    .from(copia)
    .where(
      and(
        eq(copia.cartaId, dados.cartaId),
        eq(copia.idiomaCatalogo, dados.idiomaCatalogo),
        eq(copia.idioma, dados.idioma),
        eq(copia.variante, dados.variante),
        eq(copia.condicao, dados.condicao),
        sql`coalesce(btrim(${copia.localizacao}), '') = ${localizacaoNormalizada}`,
        isNull(copia.gradedEmpresa),
        sql`not exists (select 1 from ${vaga} where ${vaga.copiaId} = ${copia.id})`,
      ),
    )
    .orderBy(asc(copia.criadoEm))
    .limit(1)
    .for("update");
  return linhas[0] ?? null;
}

interface CopiaFundivel {
  id: string;
  quantidade: number;
  gradedEmpresa: string | null;
  aquisicaoData: string | null;
  aquisicaoOrigem: string | null;
  aquisicaoPreco: string | null;
  notas: string | null;
}

/**
 * Soma a cópia nova na linha encontrada. Devolve a quantidade final.
 */
async function somarNaCopiaExistente(
  tx: Database | Transacao,
  existente: CopiaFundivel,
  entrante: {
    quantidade: number;
    aquisicaoData: string | null;
    aquisicaoOrigem: string | null;
    aquisicaoPreco: string | null;
    notas: string | null;
  },
): Promise<number> {
  const fundida = fundirCopias(
    existente,
    { ...entrante, gradedEmpresa: null },
    new Date().toISOString().slice(0, 10),
  );
  await tx
    .update(copia)
    .set({
      quantidade: fundida.quantidade,
      aquisicaoData: fundida.aquisicaoData,
      aquisicaoOrigem: fundida.aquisicaoOrigem,
      aquisicaoPreco: fundida.aquisicaoPreco,
      notas: fundida.notas,
      atualizadoEm: new Date(),
    })
    .where(eq(copia.id, existente.id));
  return fundida.quantidade;
}

/**
 * Grava o lote do cadastro por set. Item que já existe no inventário
 * **soma na quantidade** em vez de virar linha nova (decisão de
 * 2026-08-29) — ver `lib/dominio/fusao-copias.ts`.
 *
 * Processa item a item dentro da transação, em vez de um `insert` em
 * bloco. Custa um round-trip por item (lote típico: dezenas, em rede
 * local), e compra duas coisas: a fusão contra o que já estava no banco,
 * e a fusão **entre itens do próprio lote** — o item já gravado fica
 * visível para o seguinte dentro da mesma transação, sem código
 * especial. Continua tudo-ou-nada: uma falha desfaz o lote inteiro.
 */
export async function inserirLoteCopias(
  db: Database,
  copias: CopiaParaInserir[],
): Promise<{ inseridas: number; fundidas: number }> {
  return db.transaction(async (tx) => {
    let inseridas = 0;
    let fundidas = 0;

    for (const c of copias) {
      const existente = await acharCopiaParaFundir(tx, c);
      if (existente) {
        await somarNaCopiaExistente(tx, existente, {
          quantidade: c.quantidade,
          // O cadastro por set não coleta aquisição nem notas.
          aquisicaoData: null,
          aquisicaoOrigem: null,
          aquisicaoPreco: null,
          notas: null,
        });
        fundidas += 1;
        continue;
      }
      await tx.insert(copia).values({
        cartaId: c.cartaId,
        idiomaCatalogo: c.idiomaCatalogo,
        idioma: c.idioma,
        variante: c.variante,
        quantidade: c.quantidade,
        condicao: c.condicao,
        localizacao: c.localizacao,
      });
      inseridas += 1;
    }

    return { inseridas, fundidas };
  });
}

/**
 * Grava uma cópia do cadastro unitário. Cópia igual já no inventário
 * **soma na quantidade** em vez de virar linha nova — era o pedido: duas
 * cartas iguais cadastradas em momentos diferentes viravam dois
 * registros de quantidade 1 (caso do Ambipom reverse `me02-079`).
 *
 * Regras do que é "igual", e o que acontece com aquisição e notas
 * divergentes, em `lib/dominio/fusao-copias.ts`. Carta graded nunca
 * funde, e nunca se soma em linha que já ocupa vaga.
 *
 * Devolve `fundida` para a tela dizer o que aconteceu — "somado à cópia
 * existente" e "cadastrada" são resultados diferentes, e esconder a
 * diferença faria parecer que o cadastro se perdeu.
 */
export async function inserirCopia(
  db: Database,
  dados: CopiaCriadaValida,
): Promise<{ id: string; fundida: boolean; quantidadeFinal: number }> {
  return db.transaction(async (tx) => {
    if (!dados.gradedEmpresa) {
      const existente = await acharCopiaParaFundir(tx, dados);
      if (existente) {
        const quantidadeFinal = await somarNaCopiaExistente(tx, existente, dados);
        return { id: existente.id, fundida: true, quantidadeFinal };
      }
    }

    const [linha] = await tx
      .insert(copia)
      .values({
        cartaId: dados.cartaId,
        idiomaCatalogo: dados.idiomaCatalogo,
        idioma: dados.idioma,
        variante: dados.variante,
        quantidade: dados.quantidade,
        condicao: dados.condicao,
        localizacao: dados.localizacao,
        gradedEmpresa: dados.gradedEmpresa,
        gradedNota: dados.gradedNota,
        gradedCertificado: dados.gradedCertificado,
        aquisicaoData: dados.aquisicaoData,
        aquisicaoOrigem: dados.aquisicaoOrigem,
        aquisicaoPreco: dados.aquisicaoPreco,
        notas: dados.notas,
      })
      .returning({ id: copia.id });
    return { id: linha.id, fundida: false, quantidadeFinal: dados.quantidade };
  });
}

// --- Inventário ------------------------------------------------------------

export interface CopiaDoInventario {
  id: string;
  cartaId: string;
  idiomaCatalogo: Idioma;
  idioma: Idioma;
  variante: string;
  quantidade: number;
  condicao: string;
  gradedEmpresa: string | null;
  gradedNota: string | null;
  gradedCertificado: string | null;
  localizacao: string | null;
  aquisicaoData: string | null;
  aquisicaoOrigem: string | null;
  aquisicaoPreco: string | null;
  notas: string | null;
  cartaNome: string;
  cartaLocalId: string;
  setId: string;
  setNome: string;
  raridade: string | null;
  imagemUrl: string | null;
  /** De onde veio a foto acima (`origemDaImagem`) — governa o selo na tela. */
  imagemOrigem: OrigemImagem | null;
  varianteNormalDisponivel: boolean;
  varianteReverseDisponivel: boolean;
  varianteHoloDisponivel: boolean;
  variantePrimeiraEdicaoDisponivel: boolean;
  variantePromoDisponivel: boolean;
  /** true = ocupa uma vaga; false = livre no inventário. */
  alocada: boolean;
  /** Onde a cópia está alocada — nulos quando `alocada` é false (item 1, alocar pelo inventário). */
  vagaId: string | null;
  vagaChave: string | null;
  colecaoId: string | null;
  colecaoNome: string | null;
}

export async function listarCopias(
  db: Database,
  filtros: FiltrosInventario,
): Promise<{ itens: CopiaDoInventario[]; total: number }> {
  const vagaCopiaIds = db.select({ copiaId: vaga.copiaId }).from(vaga).where(isNotNull(vaga.copiaId));

  const condicoes = [];
  if (filtros.setId) condicoes.push(eq(cartaCatalogo.setId, filtros.setId));
  if (filtros.idioma) condicoes.push(eq(copia.idioma, filtros.idioma));
  if (filtros.raridade) condicoes.push(eq(cartaCatalogo.raridade, filtros.raridade));
  if (filtros.variante) condicoes.push(eq(copia.variante, filtros.variante));
  if (filtros.condicao) condicoes.push(eq(copia.condicao, filtros.condicao));
  if (filtros.localizacao) {
    condicoes.push(ilike(copia.localizacao, `%${filtros.localizacao}%`));
  }
  if (filtros.q) {
    // Mesma ponte do cadastro por busca (`buscarCartas`): o texto
    // digitado identifica números da Pokédex e a busca inclui as cartas
    // que os têm, em qualquer idioma. Sem isto, procurar "Ivysaur" no
    // inventário não achava a cópia japonesa — a linha do catálogo se
    // chama フシギソウ, e o nome ocidental que a tela mostra entre
    // parênteses é resolvido DEPOIS da consulta, então não dá para
    // filtrar por ele.
    //
    // A expansão soma resultados, nunca substitui: continua achando pelo
    // nome escrito. Carta sem número de Pokédex (Treinador, Energia) não
    // tem por onde ser ligada entre idiomas e segue só pelo nome.
    const dexIds = await dexIdsDoNome(db, filtros.q);
    const porNome = ilike(cartaCatalogo.nome, `%${filtros.q}%`);
    condicoes.push(
      dexIds.length > 0
        ? or(
            porNome,
            sql`${cartaCatalogo.dexIds} && ${sql.raw(`ARRAY[${dexIds.join(",")}]::integer[]`)}`,
          )!
        : porNome,
    );
  }
  if (filtros.graded !== undefined) {
    condicoes.push(
      filtros.graded
        ? isNotNull(copia.gradedEmpresa)
        : isNull(copia.gradedEmpresa),
    );
  }
  if (filtros.alocada !== undefined) {
    condicoes.push(
      filtros.alocada
        ? inArray(copia.id, vagaCopiaIds)
        : sql`${copia.id} not in ${vagaCopiaIds}`,
    );
  }
  if (filtros.semImagem) {
    // Sem imagem própria E sem imagem no catálogo — as duas fontes que o
    // servidor consegue afirmar. O terceiro caminho (URL montada no CDN)
    // fica de fora de propósito: só o navegador sabe se aquele arquivo
    // existe, e checar aqui exigiria bater no CDN carta a carta. Ver o
    // comentário de `semImagem` em `lib/dominio/filtros-inventario.ts`.
    condicoes.push(isNull(cartaCatalogo.imagemUrl));
    condicoes.push(
      sql`not exists (
        select 1 from ${imagemLocal}
        where ${imagemLocal.cartaId} = ${cartaCatalogo.id}
          and ${imagemLocal.idioma} = ${cartaCatalogo.idioma}
      )`,
    );
  }

  const where = condicoes.length > 0 ? and(...condicoes) : undefined;

  const base = db
    .select({
      id: copia.id,
      cartaId: copia.cartaId,
      idiomaCatalogo: copia.idiomaCatalogo,
      idioma: copia.idioma,
      variante: copia.variante,
      quantidade: copia.quantidade,
      condicao: copia.condicao,
      gradedEmpresa: copia.gradedEmpresa,
      gradedNota: copia.gradedNota,
      gradedCertificado: copia.gradedCertificado,
      localizacao: copia.localizacao,
      aquisicaoData: copia.aquisicaoData,
      aquisicaoOrigem: copia.aquisicaoOrigem,
      aquisicaoPreco: copia.aquisicaoPreco,
      notas: copia.notas,
      cartaNome: cartaCatalogo.nome,
      cartaDexIds: cartaCatalogo.dexIds,
      cartaLocalId: cartaCatalogo.localId,
      setId: cartaCatalogo.setId,
      setNome: cartaCatalogo.setNome,
      raridade: cartaCatalogo.raridade,
      imagemUrl: imagemDaCarta(cartaCatalogo),
      imagemOrigem: origemDaImagem(cartaCatalogo),
      varianteNormalDisponivel: cartaCatalogo.varianteNormalDisponivel,
      varianteReverseDisponivel: cartaCatalogo.varianteReverseDisponivel,
      varianteHoloDisponivel: cartaCatalogo.varianteHoloDisponivel,
      variantePrimeiraEdicaoDisponivel: cartaCatalogo.variantePrimeiraEdicaoDisponivel,
      variantePromoDisponivel: cartaCatalogo.variantePromoDisponivel,
      // LEFT JOIN: cada cópia tem NO MÁXIMO uma vaga (constraint
      // `vaga_copia_id_unique`, regra 1), então este join nunca duplica
      // linha — só resolve "onde está" pra quem já está alocada, sem
      // round-trip extra por cópia (item 1, alocar pelo inventário).
      vagaId: vaga.id,
      vagaChave: vaga.chave,
      colecaoId: colecao.id,
      colecaoNome: colecao.nome,
    })
    .from(copia)
    .innerJoin(
      cartaCatalogo,
      and(
        eq(copia.cartaId, cartaCatalogo.id),
        eq(copia.idiomaCatalogo, cartaCatalogo.idioma),
      ),
    )
    .leftJoin(vaga, eq(vaga.copiaId, copia.id))
    .leftJoin(colecao, eq(colecao.id, vaga.colecaoId))
    .where(where);

  const [linhas, totalRows] = await Promise.all([
    base
      .orderBy(asc(cartaCatalogo.setNome), asc(cartaCatalogo.localId))
      .limit(filtros.tamanhoPagina)
      .offset((filtros.pagina - 1) * filtros.tamanhoPagina),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(copia)
      .innerJoin(
        cartaCatalogo,
        and(
          eq(copia.cartaId, cartaCatalogo.id),
          eq(copia.idiomaCatalogo, cartaCatalogo.idioma),
        ),
      )
      .where(where),
  ]);

  const comAlocacao = linhas.map((l) => ({
    ...l,
    alocada: l.vagaId !== null,
    dexIds: l.cartaDexIds,
  }));

  return {
    itens: await comNomeEspecie(db, comAlocacao),
    total: totalRows[0]?.total ?? 0,
  };
}

export interface CopiaIdentidade {
  id: string;
  cartaId: string;
  idiomaCatalogo: Idioma;
  variante: VarianteCopia;
}

export async function obterCopiaPorId(
  db: Database,
  id: string,
): Promise<CopiaIdentidade | null> {
  const [linha] = await db
    .select({
      id: copia.id,
      cartaId: copia.cartaId,
      idiomaCatalogo: copia.idiomaCatalogo,
      variante: copia.variante,
    })
    .from(copia)
    .where(eq(copia.id, id))
    .limit(1);
  return linha ?? null;
}

export async function atualizarCopia(
  db: Database,
  id: string,
  patch: PatchCopiaValido,
): Promise<boolean> {
  if (Object.keys(patch).length === 0) {
    const existe = await obterCopiaPorId(db, id);
    return existe !== null;
  }
  const resultado = await db
    .update(copia)
    .set({ ...patch, atualizadoEm: new Date() })
    .where(eq(copia.id, id))
    .returning({ id: copia.id });
  return resultado.length > 0;
}

/**
 * Remove uma cópia. Se ela estava alocada, a FK `vaga.copia_id` (ON DELETE
 * SET NULL) libera a vaga automaticamente — não precisa de lógica extra
 * aqui (critério de aceite da Fase 1, confirmado também via SQL direto no
 * relatório da tarefa).
 */
export async function removerCopia(db: Database, id: string): Promise<boolean> {
  const resultado = await db
    .delete(copia)
    .where(eq(copia.id, id))
    .returning({ id: copia.id });
  return resultado.length > 0;
}

// --- Exportação CSV (Fase 3) -------------------------------------------------

export interface CopiaParaExportacao {
  cartaNome: string;
  cartaLocalId: string;
  setNome: string;
  setSigla: string | null;
  idioma: Idioma;
  variante: VarianteCopia;
  condicao: Condicao;
  quantidade: number;
  gradedEmpresa: string | null;
  gradedNota: string | null;
  gradedCertificado: string | null;
  localizacao: string | null;
  aquisicaoData: string | null;
  aquisicaoOrigem: string | null;
  aquisicaoPreco: string | null;
  notas: string | null;
}

const CAMPOS_EXPORTACAO = {
  cartaNome: cartaCatalogo.nome,
  cartaLocalId: cartaCatalogo.localId,
  setNome: cartaCatalogo.setNome,
  setSigla: cartaCatalogo.setSigla,
  idioma: copia.idioma,
  variante: copia.variante,
  condicao: copia.condicao,
  quantidade: copia.quantidade,
  gradedEmpresa: copia.gradedEmpresa,
  gradedNota: copia.gradedNota,
  gradedCertificado: copia.gradedCertificado,
  localizacao: copia.localizacao,
  aquisicaoData: copia.aquisicaoData,
  aquisicaoOrigem: copia.aquisicaoOrigem,
  aquisicaoPreco: copia.aquisicaoPreco,
  notas: copia.notas,
} as const;

/**
 * Todas as cópias do inventário, para exportação CSV (spec §5/§6 Fase 3).
 * Deliberadamente sem paginação nem filtro — o critério de aceite é
 * "número de linhas do arquivo confere com o número de cópias" na
 * tabela inteira. Mesmo JOIN de `listarCopias`, com `setSigla` a mais
 * (coluna exigida na exportação) — não duplica regra de negócio, só a
 * projeção de colunas muda.
 */
export async function listarCopiasParaExportacao(
  db: Database,
): Promise<CopiaParaExportacao[]> {
  return db
    .select(CAMPOS_EXPORTACAO)
    .from(copia)
    .innerJoin(
      cartaCatalogo,
      and(
        eq(copia.cartaId, cartaCatalogo.id),
        eq(copia.idiomaCatalogo, cartaCatalogo.idioma),
      ),
    )
    .orderBy(asc(cartaCatalogo.setNome), asc(cartaCatalogo.localId));
}

export interface VagaPreenchidaParaExportacao extends CopiaParaExportacao {
  /** Número da Pokédex ou local_id do set — a vaga que a cópia ocupa. */
  vagaChave: string;
}

/**
 * Vagas PREENCHIDAS de uma coleção, para exportação CSV. Traz só o que
 * está alocado — "o que falta" já tem tela própria (AGENTS.md decisão
 * fechada); misturar quebraria o critério de aceite "linhas = vagas
 * preenchidas". O INNER JOIN com `copia` já faz esse filtro sozinho:
 * vaga com `copia_id` nulo não casa e nunca aparece no resultado.
 */
export async function listarVagasPreenchidasParaExportacao(
  db: Database,
  colecaoId: string,
): Promise<VagaPreenchidaParaExportacao[]> {
  const linhas = await db
    .select({ vagaChave: vaga.chave, ...CAMPOS_EXPORTACAO })
    .from(vaga)
    .innerJoin(copia, eq(vaga.copiaId, copia.id))
    .innerJoin(
      cartaCatalogo,
      and(
        eq(copia.cartaId, cartaCatalogo.id),
        eq(copia.idiomaCatalogo, cartaCatalogo.idioma),
      ),
    )
    .where(eq(vaga.colecaoId, colecaoId));

  return linhas.slice().sort((a, b) => compararLocalId(a.vagaChave, b.vagaChave));
}

// --- Valores distintos para popular os selects de filtro -------------------

export async function listarSetsDoInventario(
  db: Database,
): Promise<{ setId: string; setNome: string }[]> {
  return db
    .selectDistinct({ setId: cartaCatalogo.setId, setNome: cartaCatalogo.setNome })
    .from(copia)
    .innerJoin(
      cartaCatalogo,
      and(
        eq(copia.cartaId, cartaCatalogo.id),
        eq(copia.idiomaCatalogo, cartaCatalogo.idioma),
      ),
    )
    .orderBy(asc(cartaCatalogo.setNome));
}

export async function listarRaridadesDoInventario(
  db: Database,
): Promise<string[]> {
  const linhas = await db
    .selectDistinct({ raridade: cartaCatalogo.raridade })
    .from(copia)
    .innerJoin(
      cartaCatalogo,
      and(
        eq(copia.cartaId, cartaCatalogo.id),
        eq(copia.idiomaCatalogo, cartaCatalogo.idioma),
      ),
    )
    .where(isNotNull(cartaCatalogo.raridade));
  return linhas
    .map((l) => l.raridade)
    .filter((r): r is string => r !== null)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// --- Catálogo para materialização de vagas (Fase 2) -----------------------

export interface InfoSetParaVagas {
  /** Todos os `local_id` do set, no idioma de catálogo pedido. */
  localIds: string[];
  qtdOficial: number;
  qtdTotal: number;
}

/**
 * Info do catálogo necessária para gerar as vagas de uma coleção de set
 * (regra 4: vagas = `set_qtd_oficial`, ou `set_qtd_total` com secretas —
 * `lib/dominio/vagas-colecao.ts` faz o corte). Não filtra por `ativa`:
 * `set_qtd_oficial`/`set_qtd_total` refletem o set completo do upstream,
 * e todo o conjunto de `local_id` precisa estar disponível para bater
 * com essas contagens (confirmado ao vivo: sv03.5 tem as 207 linhas
 * ativas, mas outros sets podem ter cartas inativadas sem deixar de
 * contar para a numeração oficial).
 */
export async function obterInfoSetParaVagas(
  db: Database,
  setId: string,
  idiomaCatalogo: Idioma,
): Promise<InfoSetParaVagas | null> {
  const linhas = await db
    .select({
      localId: cartaCatalogo.localId,
      qtdOficial: cartaCatalogo.setQtdOficial,
      qtdTotal: cartaCatalogo.setQtdTotal,
    })
    .from(cartaCatalogo)
    .where(
      and(eq(cartaCatalogo.setId, setId), eq(cartaCatalogo.idioma, idiomaCatalogo)),
    );
  if (linhas.length === 0) return null;
  return {
    localIds: linhas.map((l) => l.localId),
    qtdOficial: linhas[0].qtdOficial,
    qtdTotal: linhas[0].qtdTotal,
  };
}

export interface AvisosDeSet {
  /** Só presente quando o catálogo local não conhece o set inteiro. */
  avisoCatalogoIncompleto: AvisoCatalogoIncompleto | null;
  /** Só presente quando o set não tem numeração oficial no upstream (ex.: `mep`). */
  avisoSemNumeracaoOficial: AvisoSemNumeracaoOficial | null;
}

const SEM_AVISOS: AvisosDeSet = {
  avisoCatalogoIncompleto: null,
  avisoSemNumeracaoOficial: null,
};

/**
 * Compara o que foi materializado para uma coleção de set contra o que o
 * catálogo diz ser o universo esperado (achado do coordenador,
 * 2026-08-25: sets promocionais como `mfb` vêm incompletos no upstream;
 * `mep` não tem numeração oficial — `qtdOficial = 0` — e usa `qtdTotal`
 * como universo, `lib/dominio/numeracao-oficial-set.ts`). Não persiste
 * nada — recalcula contra o estado atual do catálogo a cada chamada, com
 * uma única consulta a `obterInfoSetParaVagas`, então se um sync futuro
 * completar o set os avisos somem sozinhos. `null` em ambos quando o
 * tipo não é `set` ou o universo já está completo (regra: coleção com
 * catálogo completo e numeração oficial válida nunca ganha aviso).
 */
export async function obterAvisosDeSet(
  db: Database,
  tipo: TipoColecao,
  parametro: unknown,
  vagasMaterializadas: number,
): Promise<AvisosDeSet> {
  if (tipo !== "set") return SEM_AVISOS;
  const p = parametro as ParametroSet;
  const info = await obterInfoSetParaVagas(db, p.setId, p.idiomaCatalogo);
  if (!info) return SEM_AVISOS;
  const universo = resolverUniversoVagasSet({
    qtdOficial: info.qtdOficial,
    qtdTotal: info.qtdTotal,
    incluirSecretas: p.incluirSecretas,
    qtdCartasNoCatalogo: info.localIds.length,
  });
  return {
    avisoCatalogoIncompleto: detectarCatalogoIncompleto(
      vagasMaterializadas,
      universo.vagasEsperadas,
    ),
    avisoSemNumeracaoOficial: universo.avisoSemNumeracaoOficial,
  };
}

/**
 * Todas as linhas de catálogo elegíveis para resolução de nome de
 * espécie (`lib/dominio/nome-especie.ts`): ativas, com exatamente um
 * `dexId`. Busca o universo inteiro de uma vez (pt + en, ~poucos
 * milhares de linhas) porque é mais simples e barato do que filtrar por
 * número no SQL contra um array — quem chama agrupa por número em JS.
 */
async function obterLinhasElegiveisParaNomeEspecie(
  db: Database,
): Promise<LinhaCatalogoParaNome[]> {
  const linhas = await db
    .select({
      nome: cartaCatalogo.nome,
      idioma: cartaCatalogo.idioma,
      dexIds: cartaCatalogo.dexIds,
    })
    .from(cartaCatalogo)
    .where(
      and(eq(cartaCatalogo.ativa, true), sql`array_length(${cartaCatalogo.dexIds}, 1) = 1`),
    );
  return linhas;
}

/**
 * Resolve o nome de espécie para cada número pedido, a partir do
 * catálogo local (spec: vaga vazia de Pokédex mostra "25 — Pikachu").
 */
export async function obterNomesEspeciePorNumero(
  db: Database,
  numeros: readonly number[],
): Promise<Map<number, string | null>> {
  const resultado = new Map<number, string | null>();
  if (numeros.length === 0) return resultado;

  const todas = await obterLinhasElegiveisParaNomeEspecie(db);
  const porNumero = new Map<number, LinhaCatalogoParaNome[]>();
  for (const linha of todas) {
    const numero = linha.dexIds[0];
    let lista = porNumero.get(numero);
    if (!lista) {
      lista = [];
      porNumero.set(numero, lista);
    }
    lista.push(linha);
  }

  for (const numero of numeros) {
    resultado.set(numero, resolverNomeEspecie(numero, porNumero.get(numero) ?? []));
  }
  return resultado;
}

// --- Coleções (Fase 2) ------------------------------------------------------

export interface ColecaoComProgresso {
  id: string;
  nome: string;
  tipo: TipoColecao;
  parametro: unknown;
  idiomaExigido: Idioma | null;
  notas: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
  totalVagas: number;
  vagasPreenchidas: number;
  /** Só presente quando o catálogo local não conhece o set inteiro. */
  avisoCatalogoIncompleto?: AvisoCatalogoIncompleto;
  /** Só presente em coleção de set sem numeração oficial no upstream (ex.: `mep`). */
  avisoSemNumeracaoOficial?: AvisoSemNumeracaoOficial;
}

/**
 * Lista todas as coleções com progresso (vagas totais e preenchidas).
 * Para coleções de set, anexa `avisoCatalogoIncompleto` e/ou
 * `avisoSemNumeracaoOficial` quando aplicável — omitidos por completo
 * quando o set está completo e com numeração oficial válida (nunca muda
 * o denominador de uma coleção normal, ex.: `sv03.5`).
 */
export async function listarColecoes(db: Database): Promise<ColecaoComProgresso[]> {
  const linhas = await db
    .select({
      id: colecao.id,
      nome: colecao.nome,
      tipo: colecao.tipo,
      parametro: colecao.parametro,
      idiomaExigido: colecao.idiomaExigido,
      notas: colecao.notas,
      criadoEm: colecao.criadoEm,
      atualizadoEm: colecao.atualizadoEm,
      totalVagas: sql<number>`count(${vaga.id})::int`,
      vagasPreenchidas: sql<number>`count(${vaga.copiaId})::int`,
    })
    .from(colecao)
    .leftJoin(vaga, eq(vaga.colecaoId, colecao.id))
    .groupBy(colecao.id)
    .orderBy(desc(colecao.criadoEm));

  return Promise.all(
    linhas.map(async (linha) => {
      const avisos = await obterAvisosDeSet(db, linha.tipo, linha.parametro, linha.totalVagas);
      return {
        ...linha,
        ...(avisos.avisoCatalogoIncompleto
          ? { avisoCatalogoIncompleto: avisos.avisoCatalogoIncompleto }
          : {}),
        ...(avisos.avisoSemNumeracaoOficial
          ? { avisoSemNumeracaoOficial: avisos.avisoSemNumeracaoOficial }
          : {}),
      };
    }),
  );
}

export interface DadosCriacaoColecao extends ColecaoCriadaValida {
  /** Chaves de vaga já resolvidas (`lib/dominio/vagas-colecao.ts`). */
  chaves: string[];
}

/**
 * Cria a coleção e materializa as vagas na mesma transação (critério de
 * aceite da Fase 2): ou a coleção nasce com todas as vagas, ou nada é
 * gravado.
 */
export async function criarColecaoComVagas(
  db: Database,
  dados: DadosCriacaoColecao,
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const [linha] = await tx
      .insert(colecao)
      .values({
        nome: dados.nome,
        tipo: dados.tipo,
        parametro: dados.parametro,
        idiomaExigido: dados.idiomaExigido,
        notas: dados.notas,
      })
      .returning({ id: colecao.id });

    if (dados.chaves.length > 0) {
      await tx.insert(vaga).values(
        dados.chaves.map((chave) => ({ colecaoId: linha.id, chave })),
      );
    }

    return { id: linha.id };
  });
}

export interface ColecaoBasica {
  id: string;
  nome: string;
  tipo: TipoColecao;
  parametro: unknown;
  idiomaExigido: Idioma | null;
  notas: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

export async function obterColecaoPorId(
  db: Database,
  id: string,
): Promise<ColecaoBasica | null> {
  const [linha] = await db.select().from(colecao).where(eq(colecao.id, id)).limit(1);
  return linha ?? null;
}

export interface VagaDaColecao {
  id: string;
  chave: string;
  copiaId: string | null;
  /** Só preenchido para coleção tipo pokedex (`lib/dominio/nome-especie.ts`). */
  nomeEspecie: string | null;
  /**
   * Dados de exibição da carta desta vaga — de onde vêm depende do
   * estado da vaga (tela da coleção, spec §5 Fase 2, e "o que falta",
   * AGENTS.md regra 6):
   * - Preenchida: da CÓPIA alocada (join copia → carta_catalogo pelo par
   *   cartaId/idiomaCatalogo da própria cópia — nunca pelo idiomaCatalogo
   *   da coleção, regra 7).
   * - Vazia, coleção `set`: da carta ESPERADA naquele `local_id`, no
   *   `idiomaCatalogo` da coleção (join direto por setId+idioma+localId).
   *   "Falta a carta 042" é inútil; "falta Golbat (042)" é a lista de
   *   compras.
   * - Vazia, coleção `pokedex`: null — usa `nomeEspecie` acima, porque
   *   não há uma carta única por número (vários Pokémon compartilham o
   *   mesmo grupo elegível, regra 3: forma não desdobra vaga).
   */
  cartaNome: string | null;
  cartaLocalId: string | null;
  setNome: string | null;
  imagemUrl: string | null;
  /** De onde veio a foto acima (`origemDaImagem`) — governa o selo na tela. */
  imagemOrigem: OrigemImagem | null;
  /**
   * Quantas cópias livres do inventário cabem nesta vaga. `0` em vaga
   * preenchida (não há o que alocar) e em vaga vazia sem candidata —
   * é o que desabilita o botão "Alocar" na tela.
   */
  candidatosDisponiveis: number;
  /** Só quando preenchida — vêm da cópia alocada, não do catálogo. */
  variante: VarianteCopia | null;
  /** Idioma FÍSICO da cópia alocada — nunca o idiomaCatalogo. */
  idiomaFisico: Idioma | null;
  condicao: Condicao | null;
  /**
   * Tipo que tinge a vaga na grade (`lib/dominio/tipo-energia.ts`).
   *
   * Vem da cópia alocada quando preenchida, e da carta esperada quando a
   * vaga está vazia numa coleção de SET. Em coleção pokedex a vaga vazia
   * fica `null` de propósito: pela regra 3, vários Pokémon disputam o mesmo
   * número, então não existe "a carta esperada" — e pintar a vaga com o
   * tipo de um palpite seria inventar dado.
   */
  energia: TipoEnergia | null;
}

export interface ColecaoComVagas extends ColecaoBasica {
  vagas: VagaDaColecao[];
  /** Só presente quando o catálogo local não conhece o set inteiro. */
  avisoCatalogoIncompleto?: AvisoCatalogoIncompleto;
  /** Só presente em coleção de set sem numeração oficial no upstream (ex.: `mep`). */
  avisoSemNumeracaoOficial?: AvisoSemNumeracaoOficial;
  /** Só presente em coleção `pokedex` (item 2): progresso por região. */
  progressoPorRegiao?: ProgressoRegiao[];
}

/**
 * Lê uma coleção com todas as suas vagas, ordenadas de forma natural, já
 * com os dados de exibição de carta resolvidos por JOIN — sem N+1: uma
 * Pokédex nacional (1025 vagas) não pode disparar uma consulta por vaga.
 * No total, esta função roda um número FIXO de consultas (não
 * proporcional ao número de vagas): a query principal (vagas + cópia
 * alocada, via LEFT JOIN), mais no máximo mais duas — uma para as cartas
 * esperadas do set (só `tipo === "set"`) e uma para nome de espécie (só
 * `tipo === "pokedex"`) — cada uma buscando o universo inteiro de uma vez
 * e casando em memória por chave.
 *
 * Para coleção de set, anexa `avisoCatalogoIncompleto` (omitido quando o
 * catálogo está completo) — mesma regra de `listarColecoes`.
 */
export async function obterColecaoComVagas(
  db: Database,
  id: string,
): Promise<ColecaoComVagas | null> {
  const colecaoLinha = await obterColecaoPorId(db, id);
  if (!colecaoLinha) return null;

  const cartaCopia = alias(cartaCatalogo, "carta_copia");

  const vagasLinhas = await db
    .select({
      id: vaga.id,
      chave: vaga.chave,
      copiaId: vaga.copiaId,
      variante: copia.variante,
      idiomaFisico: copia.idioma,
      condicao: copia.condicao,
      cartaNome: cartaCopia.nome,
      cartaLocalId: cartaCopia.localId,
      setNome: cartaCopia.setNome,
      tipos: cartaCopia.tipos,
      imagemUrl: imagemDaCarta(cartaCopia),
      imagemOrigem: origemDaImagem(cartaCopia),
    })
    .from(vaga)
    .leftJoin(copia, eq(vaga.copiaId, copia.id))
    .leftJoin(
      cartaCopia,
      and(eq(copia.cartaId, cartaCopia.id), eq(copia.idiomaCatalogo, cartaCopia.idioma)),
    )
    .where(eq(vaga.colecaoId, id));

  const ordenadas = vagasLinhas
    .slice()
    .sort((a, b) => compararLocalId(a.chave, b.chave));

  // Uma consulta para a coleção inteira, não uma por vaga.
  const candidatosPorVaga = await contarCandidatosPorVagaVazia(
    db,
    id,
    colecaoLinha.tipo,
    colecaoLinha.parametro,
  );

  // Vaga vazia de coleção `set`: busca o universo de cartas do set uma
  // vez só (não por vaga) e casa por `local_id` em memória.
  let cartasEsperadasPorLocalId: Map<
    string,
    {
      nome: string;
      setNome: string;
      tipos: string[];
      imagemUrl: string | null;
      imagemOrigem: OrigemImagem | null;
    }
  > = new Map();
  if (colecaoLinha.tipo === "set") {
    const parametro = colecaoLinha.parametro as ParametroSet;
    const linhasSet = await db
      .select({
        localId: cartaCatalogo.localId,
        nome: cartaCatalogo.nome,
        setNome: cartaCatalogo.setNome,
        tipos: cartaCatalogo.tipos,
        imagemUrl: imagemDaCarta(cartaCatalogo),
        imagemOrigem: origemDaImagem(cartaCatalogo),
      })
      .from(cartaCatalogo)
      .where(
        and(
          eq(cartaCatalogo.setId, parametro.setId),
          eq(cartaCatalogo.idioma, parametro.idiomaCatalogo),
        ),
      );
    cartasEsperadasPorLocalId = new Map(linhasSet.map((l) => [l.localId, l]));
  }

  let nomesPorNumero: Map<number, string | null> = new Map();
  if (colecaoLinha.tipo === "pokedex") {
    const numeros = ordenadas
      .map((v) => Number(v.chave))
      .filter((n) => Number.isInteger(n));
    nomesPorNumero = await obterNomesEspeciePorNumero(db, numeros);
  }

  const avisos = await obterAvisosDeSet(
    db,
    colecaoLinha.tipo,
    colecaoLinha.parametro,
    ordenadas.length,
  );

  // Progresso por região (item 2) — cálculo puro sobre as vagas já
  // carregadas acima, sem consulta própria (evita duplicar o LEFT JOIN
  // de vagas só para contar).
  const progressoPorRegiao =
    colecaoLinha.tipo === "pokedex"
      ? calcularProgressoPorRegiao(
          ordenadas.map((v) => ({ chave: v.chave, preenchida: v.copiaId !== null })),
        )
      : undefined;

  return {
    ...colecaoLinha,
    vagas: ordenadas.map((v) => {
      const preenchida = v.copiaId !== null;
      const esperada = !preenchida ? cartasEsperadasPorLocalId.get(v.chave) : undefined;
      return {
        id: v.id,
        chave: v.chave,
        copiaId: v.copiaId,
        nomeEspecie:
          colecaoLinha.tipo === "pokedex"
            ? (nomesPorNumero.get(Number(v.chave)) ?? null)
            : null,
        cartaNome: preenchida ? v.cartaNome : (esperada?.nome ?? null),
        cartaLocalId: preenchida ? v.cartaLocalId : (esperada ? v.chave : null),
        setNome: preenchida ? v.setNome : (esperada?.setNome ?? null),
        imagemUrl: preenchida ? v.imagemUrl : (esperada?.imagemUrl ?? null),
        // Segue a MESMA condicional da url acima: vaga preenchida mostra a
        // foto da cópia do usuário, vaga vazia mostra a da carta esperada —
        // o selo tem que falar da foto que está sendo exibida, não da outra.
        imagemOrigem: preenchida ? v.imagemOrigem : (esperada?.imagemOrigem ?? null),
        // Vaga preenchida nao tem o que alocar; vazia sem candidata da 0
        // (a consulta so devolve as que tem alguma).
        candidatosDisponiveis: preenchida ? 0 : (candidatosPorVaga.get(v.id) ?? 0),
        variante: preenchida ? v.variante : null,
        idiomaFisico: preenchida ? v.idiomaFisico : null,
        condicao: preenchida ? v.condicao : null,
        energia: energiaDaCarta(preenchida ? v.tipos : esperada?.tipos),
      };
    }),
    ...(avisos.avisoCatalogoIncompleto
      ? { avisoCatalogoIncompleto: avisos.avisoCatalogoIncompleto }
      : {}),
    ...(avisos.avisoSemNumeracaoOficial
      ? { avisoSemNumeracaoOficial: avisos.avisoSemNumeracaoOficial }
      : {}),
    ...(progressoPorRegiao ? { progressoPorRegiao } : {}),
  };
}

/** Edita nome, notas e/ou idiomaExigido. Nunca toca no parâmetro estrutural. */
export async function atualizarColecao(
  db: Database,
  id: string,
  patch: PatchColecaoValido,
): Promise<boolean> {
  if (Object.keys(patch).length === 0) {
    const existe = await obterColecaoPorId(db, id);
    return existe !== null;
  }
  const resultado = await db
    .update(colecao)
    .set({ ...patch, atualizadoEm: new Date() })
    .where(eq(colecao.id, id))
    .returning({ id: colecao.id });
  return resultado.length > 0;
}

/**
 * Exclui a coleção. As vagas caem por cascade (`onDelete: "cascade"` em
 * `vaga.colecao_id`); as cópias NUNCA são tocadas — `vaga.copia_id` só
 * referencia `copia`, apagar a vaga não apaga a cópia do inventário.
 */
export async function excluirColecao(db: Database, id: string): Promise<boolean> {
  const resultado = await db
    .delete(colecao)
    .where(eq(colecao.id, id))
    .returning({ id: colecao.id });
  return resultado.length > 0;
}

export type ResultadoToggleSecretas =
  | { ok: true }
  | { ok: false; motivo: Recusa };

/**
 * Liga/desliga "incluir secretas" numa coleção de set — a única edição
 * permitida ao parâmetro estrutural (só acrescenta ou remove vagas no
 * fim da numeração, spec §4 regra 4). Ao desligar, recusa se alguma vaga
 * secreta estiver preenchida — nunca apaga alocação do usuário.
 */
export async function alternarSecretasDaColecao(
  db: Database,
  id: string,
  incluirSecretas: boolean,
): Promise<ResultadoToggleSecretas> {
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(colecao).where(eq(colecao.id, id)).limit(1);
    if (!c) return { ok: false, motivo: recusa("colecaoNaoEncontrada") };
    if (c.tipo !== "set") {
      return { ok: false, motivo: recusa("secretasSoEmSet") };
    }

    const parametro = c.parametro as ParametroSet;
    if (parametro.incluirSecretas === incluirSecretas) {
      return { ok: true }; // já está nesse estado — no-op idempotente
    }

    const linhasSet = await tx
      .select({ localId: cartaCatalogo.localId })
      .from(cartaCatalogo)
      .where(
        and(
          eq(cartaCatalogo.setId, parametro.setId),
          eq(cartaCatalogo.idioma, parametro.idiomaCatalogo),
        ),
      );
    if (linhasSet.length === 0) {
      return { ok: false, motivo: recusa("setNaoEncontradoNoCatalogo") };
    }

    // Precisa das contagens oficiais/total — vêm denormalizadas em toda
    // linha do set, então a primeira serve.
    const [{ qtdOficial, qtdTotal }] = await tx
      .select({
        qtdOficial: cartaCatalogo.setQtdOficial,
        qtdTotal: cartaCatalogo.setQtdTotal,
      })
      .from(cartaCatalogo)
      .where(
        and(
          eq(cartaCatalogo.setId, parametro.setId),
          eq(cartaCatalogo.idioma, parametro.idiomaCatalogo),
        ),
      )
      .limit(1);

    // Set sem numeração oficial (`numeracao-oficial-set.ts`, caso `mep`):
    // `qtdOficial = 0` faria `chavesSecretas` abaixo cobrir o set INTEIRO
    // (slice(0, qtdTotal)), e desligar secretas apagaria todas as vagas —
    // reabriria em silêncio a mesma coleção vazia que a criação já evita.
    // Não há distinção oficial/secreta pra alternar nesse caso.
    if (qtdOficial === 0) {
      return { ok: false, motivo: recusa("setSemNumeracaoOficialSeparada") };
    }

    const ordenados = linhasSet.map((l) => l.localId).sort(compararLocalId);
    const chavesSecretas = ordenados.slice(qtdOficial, qtdTotal);

    if (!incluirSecretas) {
      const preenchidas = await tx
        .select({ chave: vaga.chave })
        .from(vaga)
        .where(
          and(
            eq(vaga.colecaoId, id),
            inArray(vaga.chave, chavesSecretas),
            isNotNull(vaga.copiaId),
          ),
        );
      if (preenchidas.length > 0) {
        return {
          ok: false,
          motivo: recusa("secretasPreenchidas", { total: String(preenchidas.length) }),
        };
      }
      if (chavesSecretas.length > 0) {
        await tx
          .delete(vaga)
          .where(and(eq(vaga.colecaoId, id), inArray(vaga.chave, chavesSecretas)));
      }
    } else if (chavesSecretas.length > 0) {
      await tx
        .insert(vaga)
        .values(chavesSecretas.map((chave) => ({ colecaoId: id, chave })))
        .onConflictDoNothing();
    }

    await tx
      .update(colecao)
      .set({
        parametro: { ...parametro, incluirSecretas },
        atualizadoEm: new Date(),
      })
      .where(eq(colecao.id, id));

    return { ok: true };
  });
}

export type ResultadoAlterarEscopo =
  | { ok: true; adicionadas: number; removidas: number }
  | { ok: false; motivo: Recusa };

/**
 * Adiciona e/ou remove região do escopo de uma coleção `pokedex` — a
 * segunda exceção estrutural além de `alternarSecretasDaColecao`, mesmo
 * espírito: só mexe em vaga vazia, nunca apaga alocação do usuário, e o
 * cálculo de "o que muda" é 100% função pura (`escopo-colecao.ts`), esta
 * função só resolve o que só o banco sabe — quais vagas do universo
 * removido estão preenchidas — e materializa numa única transação.
 *
 * Adicionar região NUNCA toca vaga já existente: só insere as chaves
 * novas (`onConflictDoNothing`, mesmo padrão de secretas). Remover
 * região é recusado por inteiro se qualquer vaga da faixa removida
 * estiver preenchida — a mensagem conta quantas, agrupadas por região
 * (`agruparChavesPorRegiao`), nunca um "operação inválida" genérico.
 */
export async function alterarEscopoDaColecaoPokedex(
  db: Database,
  id: string,
  novoParametro: ParametroPokedex,
): Promise<ResultadoAlterarEscopo> {
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(colecao).where(eq(colecao.id, id)).limit(1);
    if (!c) return { ok: false, motivo: recusa("colecaoNaoEncontrada") };
    if (c.tipo !== "pokedex") {
      return { ok: false, motivo: recusa("escopoSoEmPokedex") };
    }

    const parametroAtual = c.parametro as ParametroPokedex;
    const { chavesParaAdicionar, chavesParaRemover } = calcularDiffEscopoPokedex(
      parametroAtual,
      novoParametro,
    );

    if (chavesParaAdicionar.length === 0 && chavesParaRemover.length === 0) {
      return { ok: true, adicionadas: 0, removidas: 0 }; // já está nesse estado — no-op idempotente
    }

    if (chavesParaRemover.length > 0) {
      const preenchidas = await tx
        .select({ chave: vaga.chave })
        .from(vaga)
        .where(
          and(
            eq(vaga.colecaoId, id),
            inArray(vaga.chave, chavesParaRemover),
            isNotNull(vaga.copiaId),
          ),
        );
      if (preenchidas.length > 0) {
        const contagens = agruparChavesPorRegiao(preenchidas.map((p) => p.chave));
        return {
          ok: false,
          motivo: recusa("escopoVagasPreenchidas", {
            total: String(preenchidas.length),
            porRegiao: formatarContagemPorRegiao(contagens),
          }),
        };
      }
      await tx
        .delete(vaga)
        .where(and(eq(vaga.colecaoId, id), inArray(vaga.chave, chavesParaRemover)));
    }

    if (chavesParaAdicionar.length > 0) {
      await tx
        .insert(vaga)
        .values(chavesParaAdicionar.map((chave) => ({ colecaoId: id, chave })))
        .onConflictDoNothing();
    }

    await tx
      .update(colecao)
      .set({ parametro: novoParametro, atualizadoEm: new Date() })
      .where(eq(colecao.id, id));

    return { ok: true, adicionadas: chavesParaAdicionar.length, removidas: chavesParaRemover.length };
  });
}

// --- Alocação de cópia a vaga (Fase 2, parte B) -----------------------

function violaUnicidadeVagaCopiaId(err: unknown): boolean {
  const e = err as { code?: string; constraint_name?: string; constraint?: string } | undefined;
  return (
    e?.code === "23505" &&
    (e.constraint_name === "vaga_copia_id_unique" || e.constraint === "vaga_copia_id_unique")
  );
}

export type ResultadoAlocacao =
  | { ok: true; copiaAlocadaId: string; dividida: boolean; foraDePadrao: boolean }
  | { ok: false; motivo: Recusa };

/**
 * Aloca uma cópia a uma vaga: valida elegibilidade (regras 2, 3, 5, 7 do
 * AGENTS.md, `lib/dominio/elegibilidade-vaga.ts`), divide o lote quando
 * `quantidade > 1` (`lib/dominio/divisao-lote.ts`) e preenche a vaga —
 * tudo numa única transação (ou tudo acontece, ou nada).
 *
 * A cópia é lida com `FOR UPDATE` (lock de linha) para que duas
 * alocações concorrentes do mesmo lote não decidam a divisão a partir da
 * mesma quantidade "velha" (corrida rara num app de usuário único, mas
 * sem custo real evitar). A exclusividade FINAL (regra 1) é garantida
 * pela constraint `vaga_copia_id_unique` no banco — a checagem em
 * aplicação abaixo é só para devolver um motivo legível; se uma corrida
 * escapar dela, o `catch` traduz a violação de unicidade do Postgres em
 * erro de negócio, nunca um 500.
 */
export async function alocarCopiaNaVaga(
  db: Database,
  vagaId: string,
  copiaId: string,
  opcoes: { permitirForaDePadrao?: boolean } = {},
): Promise<ResultadoAlocacao> {
  try {
    return await db.transaction((tx) => alocarNaTransacao(tx, vagaId, copiaId, opcoes));
  } catch (err) {
    if (violaUnicidadeVagaCopiaId(err)) {
      return { ok: false, motivo: recusa("copiaJaAlocada") };
    }
    throw err;
  }
}

/**
 * O corpo da alocação, dentro de uma transação que já existe. Extraído de
 * `alocarCopiaNaVaga` quando a TROCA entrou (2026-09-05,
 * `trocarCopiaDaVaga`): trocar é desalocar e alocar sem soltar a
 * transação no meio, e reimplementar a validação lá seria manter duas
 * cópias da elegibilidade — a que é regra de negócio e a que ninguém
 * lembraria de atualizar.
 *
 * Não captura a violação de unicidade: quem abre a transação traduz
 * (`violaUnicidadeVagaCopiaId`), porque só lá dá para desfazer.
 */
async function alocarNaTransacao(
  tx: Transacao,
  vagaId: string,
  copiaId: string,
  opcoes: { permitirForaDePadrao?: boolean } = {},
): Promise<ResultadoAlocacao> {
  const [vagaLinha] = await tx.select().from(vaga).where(eq(vaga.id, vagaId)).limit(1);
  if (!vagaLinha) return { ok: false, motivo: recusa("vagaNaoEncontrada") };
  if (vagaLinha.copiaId !== null) {
    return { ok: false, motivo: recusa("vagaJaPreenchida") };
  }

  const [colecaoLinha] = await tx
    .select()
    .from(colecao)
    .where(eq(colecao.id, vagaLinha.colecaoId))
    .limit(1);
  if (!colecaoLinha) return { ok: false, motivo: recusa("colecaoDaVagaNaoEncontrada") };

  const [copiaLinha] = await tx
    .select()
    .from(copia)
    .where(eq(copia.id, copiaId))
    .for("update")
    .limit(1);
  if (!copiaLinha) return { ok: false, motivo: recusa("copiaNaoEncontrada") };

  const jaAlocada = await tx
    .select({ id: vaga.id })
    .from(vaga)
    .where(eq(vaga.copiaId, copiaId))
    .limit(1);
  if (jaAlocada.length > 0) {
    return { ok: false, motivo: recusa("copiaJaAlocada") };
  }

  const [cartaLinha] = await tx
    .select({
      setId: cartaCatalogo.setId,
      localId: cartaCatalogo.localId,
      dexIds: cartaCatalogo.dexIds,
    })
    .from(cartaCatalogo)
    .where(
      and(
        eq(cartaCatalogo.id, copiaLinha.cartaId),
        eq(cartaCatalogo.idioma, copiaLinha.idiomaCatalogo),
      ),
    )
    .limit(1);
  if (!cartaLinha) {
    return { ok: false, motivo: recusa("cartaDeCatalogoDaCopiaNaoEncontrada") };
  }

  const elegibilidade = avaliarElegibilidade(
    {
      tipo: colecaoLinha.tipo,
      chave: vagaLinha.chave,
      parametro: colecaoLinha.parametro as ParametroPokedex | ParametroSet | null,
      idiomaExigido: colecaoLinha.idiomaExigido,
    },
    cartaLinha,
    { idioma: copiaLinha.idioma },
    { permitirForaDePadrao: opcoes.permitirForaDePadrao },
  );
  if (!elegibilidade.elegivel) {
    return { ok: false, motivo: elegibilidade.motivo };
  }

  const plano = planejarAlocacaoDeLote(copiaLinha.quantidade);

  let copiaAlocadaId = copiaLinha.id;
  if (plano.dividir) {
    await tx
      .update(copia)
      .set({ quantidade: plano.quantidadeRestanteNaOriginal, atualizadoEm: new Date() })
      .where(eq(copia.id, copiaLinha.id));

    const [nova] = await tx
      .insert(copia)
      .values({
        cartaId: copiaLinha.cartaId,
        idiomaCatalogo: copiaLinha.idiomaCatalogo,
        idioma: copiaLinha.idioma,
        variante: copiaLinha.variante,
        quantidade: 1,
        condicao: copiaLinha.condicao,
        gradedEmpresa: copiaLinha.gradedEmpresa,
        gradedNota: copiaLinha.gradedNota,
        gradedCertificado: copiaLinha.gradedCertificado,
        localizacao: copiaLinha.localizacao,
        aquisicaoData: copiaLinha.aquisicaoData,
        aquisicaoOrigem: copiaLinha.aquisicaoOrigem,
        aquisicaoPreco: copiaLinha.aquisicaoPreco,
        notas: copiaLinha.notas,
      })
      .returning({ id: copia.id });
    copiaAlocadaId = nova.id;
  }

  const preenchida = await tx
    .update(vaga)
    .set({ copiaId: copiaAlocadaId, atualizadoEm: new Date() })
    .where(and(eq(vaga.id, vagaId), isNull(vaga.copiaId)))
    .returning({ id: vaga.id });
  if (preenchida.length === 0) {
    // Alguém preencheu a vaga entre a leitura e este UPDATE — aborta
    // a transação inteira (o rollback desfaz também a divisão de
    // lote acima, coerente com "ou tudo acontece, ou nada").
    throw new Error("Conflito: a vaga foi preenchida por outra operação simultânea.");
  }

  return {
    ok: true,
    copiaAlocadaId,
    dividida: plano.dividir,
    foraDePadrao: elegibilidade.foraDePadrao,
  };
}

export type ResultadoDesalocacao = { ok: true } | { ok: false; motivo: Recusa };

/**
 * Libera uma vaga. A cópia volta ao inventário livre e NUNCA é apagada —
 * regra dura do projeto contra deleção. Não funde lotes divididos
 * anteriormente: se 1 de 3 foi alocado e depois desalocado, ficam duas
 * linhas (2 e 1) em vez de uma de 3 — fragmentação conhecida e
 * deliberada (ver relatório da tarefa); fundir por conta própria seria
 * uma surpresa que ninguém pediu.
 *
 * Comportamento depende do TIPO da coleção (decisão fechada em
 * 2026-08-25):
 * - `pokedex`/`set`: a vaga faz parte do universo fixo da coleção — ela
 *   permanece, só com `copia_id = null`. É ela que alimenta o "o que
 *   falta" (regra 6 do AGENTS.md).
 * - `customizada`: não tem universo fixo, e por decisão explícita NUNCA
 *   tem vaga vazia — a vaga nasceu junto com a alocação
 *   (`adicionarCopiaEmColecaoCustomizada`), então desalocar aqui apaga a
 *   PRÓPRIA VAGA. A cópia não é tocada por este delete: `vaga` só
 *   referencia `copia`, nunca o contrário, então apagar a vaga não
 *   apaga nem afeta a linha da cópia — ela simplesmente deixa de ter
 *   qualquer vaga apontando pra ela, ou seja, volta a aparecer como
 *   livre no inventário. A chave apagada nunca é reaproveitada
 *   (`lib/dominio/chave-sequencial.ts` sempre avança a partir do maior
 *   número já usado) — buraco na numeração é irrelevante aqui.
 */
export async function desalocarVaga(db: Database, vagaId: string): Promise<ResultadoDesalocacao> {
  return db.transaction(async (tx) => {
    const [vagaLinha] = await tx.select().from(vaga).where(eq(vaga.id, vagaId)).limit(1);
    if (!vagaLinha) return { ok: false, motivo: recusa("vagaNaoEncontrada") };

    const [colecaoLinha] = await tx
      .select({ tipo: colecao.tipo })
      .from(colecao)
      .where(eq(colecao.id, vagaLinha.colecaoId))
      .limit(1);

    if (colecaoLinha?.tipo === "customizada") {
      await tx.delete(vaga).where(eq(vaga.id, vagaId));
      return { ok: true };
    }

    await tx
      .update(vaga)
      .set({ copiaId: null, atualizadoEm: new Date() })
      .where(eq(vaga.id, vagaId));
    return { ok: true };
  });
}

function violaUnicidadeVagaChave(err: unknown): boolean {
  const e = err as { code?: string; constraint_name?: string; constraint?: string } | undefined;
  return (
    e?.code === "23505" &&
    (e.constraint_name === "vaga_colecao_chave_unique" || e.constraint === "vaga_colecao_chave_unique")
  );
}

export type ResultadoAdicionarCopiaCustomizada =
  | {
      ok: true;
      vagaId: string;
      chave: string;
      copiaAlocadaId: string;
      dividida: boolean;
      foraDePadrao: boolean;
    }
  | { ok: false; motivo: Recusa };

/**
 * Adiciona uma cópia a uma coleção CUSTOMIZADA: cria a vaga (chave
 * sequencial, `lib/dominio/chave-sequencial.ts`) e aloca a cópia na
 * MESMA transação — customizada não tem universo fixo, então não existe
 * vaga vazia pré-criada para "preencher" (spec §3.3; decisão fechada
 * em 2026-08-25). Para pokedex/set, use `alocarCopiaNaVaga`
 * numa vaga já existente; esta função recusa se a coleção não for
 * customizada.
 *
 * A linha da COLEÇÃO é lida com `FOR UPDATE` logo no início — trava a
 * seção crítica no banco, não em memória: duas adições concorrentes à
 * MESMA coleção serializam (a segunda espera a primeira commitar/dar
 * rollback), então a chave sequencial nunca colide com
 * `vaga_colecao_chave_unique` nem fura em silêncio. Isto é a resolução
 * "no banco" pedida pelo coordenador — não um `SELECT max()+1` solto
 * fora de uma seção crítica.
 *
 * Reaproveita a mesma lógica de elegibilidade (idiomaExigido/
 * permitirForaDePadrao) e de divisão de lote da alocação normal.
 */
export async function adicionarCopiaEmColecaoCustomizada(
  db: Database,
  colecaoId: string,
  copiaId: string,
  opcoes: { permitirForaDePadrao?: boolean } = {},
): Promise<ResultadoAdicionarCopiaCustomizada> {
  try {
    return await db.transaction(async (tx) => {
      const [colecaoLinha] = await tx
        .select()
        .from(colecao)
        .where(eq(colecao.id, colecaoId))
        .for("update")
        .limit(1);
      if (!colecaoLinha) return { ok: false, motivo: recusa("colecaoNaoEncontrada") };
      if (colecaoLinha.tipo !== "customizada") {
        return { ok: false, motivo: recusa("fluxoSoParaCustomizada") };
      }

      const [copiaLinha] = await tx
        .select()
        .from(copia)
        .where(eq(copia.id, copiaId))
        .for("update")
        .limit(1);
      if (!copiaLinha) return { ok: false, motivo: recusa("copiaNaoEncontrada") };

      const jaAlocada = await tx
        .select({ id: vaga.id })
        .from(vaga)
        .where(eq(vaga.copiaId, copiaId))
        .limit(1);
      if (jaAlocada.length > 0) {
        return { ok: false, motivo: recusa("copiaJaAlocada") };
      }

      // Coleção customizada não tem universo fixo (qualquer cópia serve) —
      // só resta checar o idiomaExigido, igual à alocação normal.
      const foraDePadrao = ehForaDePadrao(colecaoLinha.idiomaExigido, copiaLinha.idioma);
      if (foraDePadrao && !opcoes.permitirForaDePadrao) {
        return {
          ok: false,
          // Mesmo raciocínio de `avaliarElegibilidade`: `foraDePadrao`
          // só é true com `idiomaExigido` preenchido.
          motivo: recusa("idiomaExigido", {
            exigido: colecaoLinha.idiomaExigido!,
            copia: copiaLinha.idioma,
          }),
        };
      }

      const existentes = await tx
        .select({ chave: vaga.chave })
        .from(vaga)
        .where(eq(vaga.colecaoId, colecaoId));
      const chave = proximaChaveSequencial(existentes.map((e) => e.chave));

      const plano = planejarAlocacaoDeLote(copiaLinha.quantidade);
      let copiaAlocadaId = copiaLinha.id;
      if (plano.dividir) {
        await tx
          .update(copia)
          .set({ quantidade: plano.quantidadeRestanteNaOriginal, atualizadoEm: new Date() })
          .where(eq(copia.id, copiaLinha.id));

        const [nova] = await tx
          .insert(copia)
          .values({
            cartaId: copiaLinha.cartaId,
            idiomaCatalogo: copiaLinha.idiomaCatalogo,
            idioma: copiaLinha.idioma,
            variante: copiaLinha.variante,
            quantidade: 1,
            condicao: copiaLinha.condicao,
            gradedEmpresa: copiaLinha.gradedEmpresa,
            gradedNota: copiaLinha.gradedNota,
            gradedCertificado: copiaLinha.gradedCertificado,
            localizacao: copiaLinha.localizacao,
            aquisicaoData: copiaLinha.aquisicaoData,
            aquisicaoOrigem: copiaLinha.aquisicaoOrigem,
            aquisicaoPreco: copiaLinha.aquisicaoPreco,
            notas: copiaLinha.notas,
          })
          .returning({ id: copia.id });
        copiaAlocadaId = nova.id;
      }

      const [novaVaga] = await tx
        .insert(vaga)
        .values({ colecaoId, chave, copiaId: copiaAlocadaId })
        .returning({ id: vaga.id });

      return {
        ok: true,
        vagaId: novaVaga.id,
        chave,
        copiaAlocadaId,
        dividida: plano.dividir,
        foraDePadrao,
      };
    });
  } catch (err) {
    if (violaUnicidadeVagaCopiaId(err)) {
      return { ok: false, motivo: recusa("copiaJaAlocada") };
    }
    if (violaUnicidadeVagaChave(err)) {
      return { ok: false, motivo: recusa("conflitoAoGerarProximaVaga") };
    }
    throw err;
  }
}

// --- Sugestão de candidatos para uma vaga -------------------------------

export interface CopiaCandidataDaVaga {
  id: string;
  cartaId: string;
  idiomaCatalogo: Idioma;
  /** Idioma FÍSICO da cópia. */
  idioma: Idioma;
  variante: VarianteCopia;
  quantidade: number;
  condicao: string;
  cartaNome: string;
  cartaLocalId: string;
  setId: string;
  setNome: string;
  imagemUrl: string | null;
  /** De onde veio a foto acima (`origemDaImagem`) — governa o selo na tela. */
  imagemOrigem: OrigemImagem | null;
  /** true = fora do idiomaExigido da coleção; oferecida, nunca omitida. */
  foraDePadrao: boolean;
}

export type ResultadoCandidatosVaga =
  | { ok: true; candidatos: CopiaCandidataDaVaga[] }
  | { ok: false; motivo: Recusa };

/**
 * Lista as cópias do inventário elegíveis para preencher uma vaga:
 * dentro do universo da vaga (regras 2, 3 e 7 do AGENTS.md, já filtradas
 * em SQL), ainda LIVRES (sem vaga em nenhuma coleção). Quando a coleção
 * tem `idiomaExigido`, cópias de outro idioma FÍSICO vêm incluídas e
 * marcadas `foraDePadrao` — nunca omitidas (spec §5 Fase 2, item 4).
 *
 * Regra 5 do AGENTS.md: isto é só a lista de sugestão — nada aqui aloca
 * nada sozinho.
 */
export async function listarCandidatosDaVaga(
  db: Database,
  vagaId: string,
): Promise<ResultadoCandidatosVaga> {
  const [vagaLinha] = await db.select().from(vaga).where(eq(vaga.id, vagaId)).limit(1);
  if (!vagaLinha) return { ok: false, motivo: recusa("vagaNaoEncontrada") };

  const colecaoLinha = await obterColecaoPorId(db, vagaLinha.colecaoId);
  if (!colecaoLinha) return { ok: false, motivo: recusa("colecaoDaVagaNaoEncontrada") };

  const vagaCopiaIds = db.select({ copiaId: vaga.copiaId }).from(vaga).where(isNotNull(vaga.copiaId));

  const condicoesUniverso = [];
  if (colecaoLinha.tipo === "pokedex") {
    const numero = Number(vagaLinha.chave);
    condicoesUniverso.push(
      sql`array_length(${cartaCatalogo.dexIds}, 1) = 1 AND ${cartaCatalogo.dexIds}[1] = ${numero}`,
    );
  } else if (colecaoLinha.tipo === "set") {
    const parametro = colecaoLinha.parametro as ParametroSet;
    condicoesUniverso.push(eq(cartaCatalogo.setId, parametro.setId));
    condicoesUniverso.push(eq(cartaCatalogo.localId, vagaLinha.chave));
  }
  // customizada: sem filtro de universo — qualquer cópia livre serve.

  const linhas = await db
    .select({
      id: copia.id,
      cartaId: copia.cartaId,
      idiomaCatalogo: copia.idiomaCatalogo,
      idioma: copia.idioma,
      variante: copia.variante,
      quantidade: copia.quantidade,
      condicao: copia.condicao,
      cartaNome: cartaCatalogo.nome,
      cartaLocalId: cartaCatalogo.localId,
      setId: cartaCatalogo.setId,
      setNome: cartaCatalogo.setNome,
      imagemUrl: imagemDaCarta(cartaCatalogo),
      imagemOrigem: origemDaImagem(cartaCatalogo),
    })
    .from(copia)
    .innerJoin(
      cartaCatalogo,
      and(eq(copia.cartaId, cartaCatalogo.id), eq(copia.idiomaCatalogo, cartaCatalogo.idioma)),
    )
    .where(and(sql`${copia.id} not in ${vagaCopiaIds}`, ...condicoesUniverso));

  const candidatos: CopiaCandidataDaVaga[] = linhas.map((l) => ({
    ...l,
    foraDePadrao: ehForaDePadrao(colecaoLinha.idiomaExigido, l.idioma),
  }));

  return { ok: true, candidatos };
}

/**
 * Quantas cópias LIVRES do inventário cabem em cada vaga VAZIA de uma
 * coleção — numa única consulta, não uma por vaga.
 *
 * Para que serve: o botão "Alocar" da tela da coleção só faz sentido
 * quando existe alguma cópia para alocar. Medido em 2026-08-29 numa
 * Pokédex real: **240 vagas vazias, e só 11 com candidato** —
 * ou seja, 95% dos botões abriam uma lista vazia. Com a contagem em mãos
 * a tela desabilita o resto e mostra quantas opções existem antes do
 * clique.
 *
 * Nada aqui é regra nova. A condição de universo é a MESMA de
 * `listarCandidatosDaVaga` e de `contarCopiasElegiveisParaVagasVazias`,
 * que por sua vez traduzem `pertenceAoUniversoPokedex`/`...Set`
 * (`lib/dominio/elegibilidade-vaga.ts`): pokedex exige `dex_ids` com
 * exatamente um elemento igual ao número da vaga (regra 2; a FORMA nunca
 * entra, regra 3); set exige mesmo `set_id` + `local_id`.
 *
 * **Cópia fora do idioma exigido CONTA como candidata**, de propósito.
 * Ela é oferecida na lista de candidatos, marcada e nunca omitida (spec
 * §5 Fase 2) — se ela não contasse aqui, o botão ficaria cinza escondendo
 * uma alocação que o sistema aceita fazer. Por isso `idioma_exigido` não
 * aparece na condição abaixo.
 *
 * O tipo entra por parâmetro, e não por `OR` cobrindo os dois casos, para
 * que `chave::int` só seja avaliado em coleção `pokedex`. Em coleção
 * `set` a chave é o `local_id` impresso ("SM84", "SV001") e o cast
 * quebraria.
 *
 * Devolve só as vagas com pelo menos uma candidata; quem chama assume
 * zero para o resto. Regra 5 do AGENTS.md: isto só conta — nunca aloca.
 */
async function contarCandidatosPorVagaVazia(
  db: Database,
  colecaoId: string,
  tipo: TipoColecao,
  parametro: unknown,
): Promise<Map<string, number>> {
  // `customizada` nunca tem vaga vazia (spec §3.3) — nada a contar.
  if (tipo !== "pokedex" && tipo !== "set") return new Map();

  const universo =
    tipo === "pokedex"
      ? sql`array_length(cc.dex_ids, 1) = 1 AND cc.dex_ids[1] = vv.chave::int`
      : sql`cc.set_id = ${(parametro as ParametroSet).setId} AND cc.local_id = vv.chave`;

  const linhas = await db.execute<{ vaga_id: string; total: number | string }>(sql`
    WITH vagas_vazias AS (
      SELECT v.id, v.chave
      FROM vaga v
      WHERE v.colecao_id = ${colecaoId} AND v.copia_id IS NULL
    ),
    copias_livres AS (
      SELECT cp.id, cp.carta_id, cp.idioma_catalogo
      FROM copia cp
      WHERE NOT EXISTS (SELECT 1 FROM vaga v2 WHERE v2.copia_id = cp.id)
    )
    SELECT vv.id AS vaga_id, count(*)::int AS total
    FROM vagas_vazias vv
    JOIN copias_livres cl ON TRUE
    JOIN carta_catalogo cc
      ON cc.id = cl.carta_id AND cc.idioma = cl.idioma_catalogo
    WHERE ${universo}
    GROUP BY vv.id
  `);

  return new Map(linhas.map((l) => [l.vaga_id, Number(l.total)]));
}

// --- Aviso "você tem cartas que preenchem vagas vazias" (item 3) -------

export interface ContagemVagasElegiveis {
  /** Elegível para ao menos uma vaga vazia SEM precisar de permitirForaDePadrao. */
  prontas: number;
  /**
   * Elegível só para vaga(s) cujo idiomaExigido é diferente do idioma
   * físico da cópia — contada À PARTE, nunca somada a `prontas` (não
   * infla o número como se coubesse sem ressalva).
   */
  foraDePadrao: number;
}

/**
 * Conta, numa ÚNICA consulta SQL, quantas cópias LIVRES do inventário
 * (sem vaga em nenhuma coleção) são elegíveis para ao menos uma vaga
 * VAZIA de alguma coleção `pokedex`/`set` (`customizada` nunca tem vaga
 * vazia, spec §3.3 — fora do universo aqui). Alimenta o aviso "você tem
 * cartas que preenchem vagas vazias" (item 3) na lista de coleções.
 *
 * Nada aqui é regra de negócio NOVA: a condição de universo por tipo de
 * vaga (JOIN `vagas_vazias`↔`carta_catalogo`) é a mesma de
 * `pertenceAoUniversoPokedex`/`pertenceAoUniversoSet`
 * (lib/dominio/elegibilidade-vaga.ts) — pokedex exige `dex_ids` com
 * exatamente 1 elemento igual ao número da vaga (regra 2 do AGENTS.md;
 * a FORMA nunca entra na condição, regra 3); set exige mesmo
 * `set_id`+`local_id` da vaga. E a condição "dentro do padrão" é a
 * mesma de `ehForaDePadrao`: `idioma_exigido` nulo, ou igual ao idioma
 * FÍSICO da cópia. É uma tradução para SQL das MESMAS funções puras já
 * testadas em `elegibilidade-vaga.test.ts` — necessária porque testar
 * cada par (cópia livre × vaga vazia) em memória exigiria buscar as
 * duas listas inteiras a cada carregamento da tela de coleções; em SQL
 * o casamento e a contagem viram um único round-trip, independente de
 * quantas cópias/vagas existam. Resolvido em SQL por pedido explícito
 * da tarefa; custo medido com os dados reais no relatório da tarefa.
 *
 * Regra 5 do AGENTS.md: isto só CONTA e informa — nunca aloca nada.
 */
export async function contarCopiasElegiveisParaVagasVazias(
  db: Database,
): Promise<ContagemVagasElegiveis> {
  const resultado = await db.execute<{
    prontas: number | string;
    fora_de_padrao: number | string;
  }>(sql`
    WITH vagas_vazias AS (
      SELECT v.chave, c.tipo, c.parametro, c.idioma_exigido
      FROM vaga v
      JOIN colecao c ON c.id = v.colecao_id
      WHERE v.copia_id IS NULL AND c.tipo IN ('pokedex', 'set')
    ),
    copias_livres AS (
      SELECT cp.id, cp.idioma, cp.carta_id, cp.idioma_catalogo
      FROM copia cp
      WHERE NOT EXISTS (SELECT 1 FROM vaga v2 WHERE v2.copia_id = cp.id)
    ),
    casamentos AS (
      SELECT
        cl.id AS copia_id,
        bool_or(vv.idioma_exigido IS NULL OR vv.idioma_exigido = cl.idioma) AS tem_match_no_padrao
      FROM copias_livres cl
      JOIN carta_catalogo cc ON cc.id = cl.carta_id AND cc.idioma = cl.idioma_catalogo
      JOIN vagas_vazias vv ON (
           (vv.tipo = 'pokedex' AND array_length(cc.dex_ids, 1) = 1 AND cc.dex_ids[1] = vv.chave::int)
        OR (vv.tipo = 'set' AND (vv.parametro ->> 'setId') = cc.set_id AND vv.chave = cc.local_id)
      )
      GROUP BY cl.id
    )
    SELECT
      count(*) FILTER (WHERE tem_match_no_padrao) AS prontas,
      count(*) FILTER (WHERE NOT tem_match_no_padrao) AS fora_de_padrao
    FROM casamentos
  `);
  const linha = resultado[0];
  return {
    prontas: Number(linha?.prontas ?? 0),
    foraDePadrao: Number(linha?.fora_de_padrao ?? 0),
  };
}

// --- Alocar a partir do inventário (item 1 do incremento pós-Fase 3) ---

export interface DestinoElegivelDaCopia {
  colecaoId: string;
  colecaoNome: string;
  colecaoTipo: TipoColecao;
  idiomaExigido: Idioma | null;
  /** true = fora do idiomaExigido da coleção; oferecido, nunca omitido (regra 7). */
  foraDePadrao: boolean;
  /**
   * Vaga vazia já existente (pokedex/set). Nulo para `customizada`, que
   * nunca tem vaga vazia — a ação ali é "adicionar" (`POST
   * /api/colecoes/:id/copias`), que cria a vaga junto com a alocação
   * (spec §3.3, decisão 2026-08-25).
   */
  vagaId: string | null;
  chave: string | null;
}

export type ResultadoDestinosDaCopia =
  | { ok: true; destinos: DestinoElegivelDaCopia[] }
  | { ok: false; motivo: Recusa };

/**
 * Fluxo inverso do "alocar pela vaga" (item 1): dada uma cópia do
 * inventário, em quais coleções/vagas ela é elegível? Reaproveita as
 * MESMAS regras de `lib/dominio/elegibilidade-vaga.ts` — não
 * reimplementa nada: a condição de universo por tipo de vaga abaixo é a
 * tradução SQL de `pertenceAoUniversoPokedex`/`pertenceAoUniversoSet` (a
 * MESMA tradução já usada em `contarCopiasElegiveisParaVagasVazias`), e
 * `foraDePadrao` vem de `ehForaDePadrao`, a função pura já testada.
 *
 * Resolvido em 4 consultas fixas, independente de quantas coleções/vagas
 * existirem — nunca N+1, nunca laço sobre vagas de todas as coleções
 * (pedido explícito da tarefa):
 * 1. a própria cópia (idioma físico);
 * 2. a carta de catálogo que a identifica (setId/localId/dexIds);
 * 3. vagas vazias de coleções pokedex/set cujo universo casa com essa
 *    carta — um único SELECT com JOIN, filtrado nas duas condições de
 *    universo possíveis;
 * 4. todas as coleções customizadas (universo livre — qualquer cópia
 *    serve, spec §3.3), pra oferecer a ação "adicionar".
 *
 * Regra 5 do AGENTS.md: só lista candidatos a destino — nunca aloca.
 */
export async function listarDestinosElegiveisDaCopia(
  db: Database,
  copiaId: string,
): Promise<ResultadoDestinosDaCopia> {
  const [copiaLinha] = await db
    .select({ id: copia.id, cartaId: copia.cartaId, idiomaCatalogo: copia.idiomaCatalogo, idioma: copia.idioma })
    .from(copia)
    .where(eq(copia.id, copiaId))
    .limit(1);
  if (!copiaLinha) return { ok: false, motivo: recusa("copiaNaoEncontrada") };

  const [cartaLinha] = await db
    .select({ setId: cartaCatalogo.setId, localId: cartaCatalogo.localId, dexIds: cartaCatalogo.dexIds })
    .from(cartaCatalogo)
    .where(
      and(eq(cartaCatalogo.id, copiaLinha.cartaId), eq(cartaCatalogo.idioma, copiaLinha.idiomaCatalogo)),
    )
    .limit(1);
  if (!cartaLinha) return { ok: false, motivo: recusa("cartaDeCatalogoDaCopiaNaoEncontrada") };

  // Regra 2: só carta com EXATAMENTE um dexId é candidata a vaga de
  // pokedex — a forma (regra 3) nunca entra aqui, de propósito, igual
  // a `pertenceAoUniversoPokedex`.
  const numeroDex = cartaLinha.dexIds.length === 1 ? String(cartaLinha.dexIds[0]) : null;

  const condicoesUniverso = [
    and(eq(colecao.tipo, "set"), sql`(${colecao.parametro} ->> 'setId') = ${cartaLinha.setId}`, eq(vaga.chave, cartaLinha.localId)),
  ];
  if (numeroDex !== null) {
    condicoesUniverso.unshift(and(eq(colecao.tipo, "pokedex"), eq(vaga.chave, numeroDex)));
  }

  const vagasVazias = await db
    .select({
      vagaId: vaga.id,
      chave: vaga.chave,
      colecaoId: colecao.id,
      colecaoNome: colecao.nome,
      colecaoTipo: colecao.tipo,
      idiomaExigido: colecao.idiomaExigido,
    })
    .from(vaga)
    .innerJoin(colecao, eq(colecao.id, vaga.colecaoId))
    .where(and(isNull(vaga.copiaId), or(...condicoesUniverso)))
    .orderBy(asc(colecao.nome), asc(vaga.chave));

  const customizadas = await db
    .select({ id: colecao.id, nome: colecao.nome, idiomaExigido: colecao.idiomaExigido })
    .from(colecao)
    .where(eq(colecao.tipo, "customizada"))
    .orderBy(asc(colecao.nome));

  const destinos: DestinoElegivelDaCopia[] = [
    ...vagasVazias.map((v) => ({
      colecaoId: v.colecaoId,
      colecaoNome: v.colecaoNome,
      colecaoTipo: v.colecaoTipo,
      idiomaExigido: v.idiomaExigido,
      foraDePadrao: ehForaDePadrao(v.idiomaExigido, copiaLinha.idioma),
      vagaId: v.vagaId,
      chave: v.chave,
    })),
    ...customizadas.map((c) => ({
      colecaoId: c.id,
      colecaoNome: c.nome,
      colecaoTipo: "customizada" as const,
      idiomaExigido: c.idiomaExigido,
      foraDePadrao: ehForaDePadrao(c.idiomaExigido, copiaLinha.idioma),
      vagaId: null,
      chave: null,
    })),
  ];

  return { ok: true, destinos };
}

// --- Edição em massa no inventário (item 2 do incremento pós-Fase 3) ---

export type ResultadoEdicaoMassa =
  | { ok: true; atualizadas: number }
  | { ok: false; motivo: Recusa; detalhes?: ErroVarianteCatalogo[] };

/**
 * Aplica o mesmo patch (condição, localização, idioma físico, variante)
 * a um lote de cópias, numa única transação: ou todas mudam, ou nenhuma
 * (item 2). NUNCA toca a tabela `vaga` — edição em massa não desaloca,
 * não realoca, não apaga vaga; só o `UPDATE copia ... WHERE id IN (...)`
 * abaixo, um único statement, atômico por natureza do Postgres.
 *
 * Pré-checagem de existência: se algum `copiaIds` não corresponder a
 * uma cópia real, a função devolve erro SEM escrever nada — nenhuma das
 * cópias válidas da seleção é alterada por causa de uma id inválida no
 * meio do lote (mesmo espírito do "forçar falha no meio não altera
 * nenhuma" pedido nos critérios de aceite).
 *
 * Variante diverge por honestidade, não por acidente: quando o patch
 * pede uma variante, cada cópia é validada contra o QUE O CATÁLOGO DELA
 * OFERECE (`obterVariantesDisponiveisPorCarta`, reaproveitada — mesma
 * função do cadastro por set/busca), agrupando por `idiomaCatalogo`
 * (no máximo 3 grupos — pt/en/jp — nunca uma consulta por cópia). Se a
 * seleção mistura cartas com catálogos de variantes diferentes e a
 * variante pedida não existe para alguma delas, a operação inteira é
 * recusada com a lista de quais cartas falham — nunca aplica a variante
 * só nas que aceitam e ignora silenciosamente as que não aceitam.
 */
export async function atualizarCopiasEmMassa(
  db: Database,
  copiaIds: readonly string[],
  patch: {
    condicao?: Condicao;
    localizacao?: string | null;
    idioma?: Idioma;
    variante?: VarianteCopia;
  },
): Promise<ResultadoEdicaoMassa> {
  return db.transaction(async (tx) => {
    const linhas = await tx
      .select({ id: copia.id, cartaId: copia.cartaId, idiomaCatalogo: copia.idiomaCatalogo })
      .from(copia)
      .where(inArray(copia.id, [...copiaIds]));

    if (linhas.length !== copiaIds.length) {
      const encontrados = new Set(linhas.map((l) => l.id));
      const faltando = copiaIds.filter((id) => !encontrados.has(id));
      return {
        ok: false,
        motivo: recusa("copiasNaoEncontradasNadaAlterado", { ids: faltando.join(", ") }),
      };
    }

    if (patch.variante !== undefined) {
      const cartaIdsPorIdioma = new Map<Idioma, string[]>();
      for (const l of linhas) {
        const grupo = cartaIdsPorIdioma.get(l.idiomaCatalogo) ?? [];
        grupo.push(l.cartaId);
        cartaIdsPorIdioma.set(l.idiomaCatalogo, grupo);
      }

      // Chave composta (cartaId + idiomaCatalogo): o `id` da TCGdex é
      // estável entre idiomas (spec §3.1), então o mesmo cartaId pode
      // aparecer em mais de um grupo — sem a composição, o resultado de
      // um idioma sobrescreveria o do outro no mapa combinado.
      const variantesPorChave: Record<string, VarianteCopia[]> = {};
      for (const [idiomaCatalogo, cartaIds] of cartaIdsPorIdioma) {
        const mapa = await obterVariantesDisponiveisPorCarta(tx as unknown as Database, idiomaCatalogo, cartaIds);
        for (const [cartaId, disponiveis] of Object.entries(mapa)) {
          variantesPorChave[`${cartaId}::${idiomaCatalogo}`] = disponiveis;
        }
      }

      const erros = validarVariantesContraCatalogo(
        linhas.map((l) => ({ cartaId: `${l.cartaId}::${l.idiomaCatalogo}`, variante: patch.variante! })),
        variantesPorChave,
      );
      if (erros.length > 0) {
        return {
          ok: false,
          motivo: recusa("varianteForaDoCatalogoNaSelecao", {
            variante: patch.variante!,
            total: String(erros.length),
          }),
          detalhes: erros.map((e) => ({ ...e, cartaId: linhas[e.indice].id })),
        };
      }
    }

    const setPatch: Record<string, unknown> = { atualizadoEm: new Date() };
    if (patch.condicao !== undefined) setPatch.condicao = patch.condicao;
    if (patch.localizacao !== undefined) setPatch.localizacao = patch.localizacao;
    if (patch.idioma !== undefined) setPatch.idioma = patch.idioma;
    if (patch.variante !== undefined) setPatch.variante = patch.variante;

    const resultado = await tx
      .update(copia)
      .set(setPatch)
      .where(inArray(copia.id, [...copiaIds]))
      .returning({ id: copia.id });

    return { ok: true, atualizadas: resultado.length };
  });
}

// --- Aviso de carta repetida no cadastro (item 3 do incremento pós-Fase 3) ---

/**
 * Quantas unidades o usuário já possui de cada carta (item 3): soma
 * `quantidade` de TODAS as cópias com aquele `carta_id`, em QUALQUER
 * `idiomaCatalogo` — o `id` da TCGdex é estável entre idiomas (spec
 * §3.1), então uma cópia identificada pela linha `en` de uma carta e
 * outra pela linha `pt` da MESMA carta física ainda são "a mesma carta"
 * pra fim de aviso de repetida (mesmo raciocínio já fechado pra
 * alocação — "casa pelo carta_id, sem o idioma de catálogo", spec §3.3).
 *
 * Uma única consulta para o lote inteiro de `cartaIds` — a grade de um
 * set inteiro (até ~300 cartas) ou os resultados de uma busca chamam
 * isto UMA vez, nunca uma consulta por carta (pedido explícito da
 * tarefa). Informativo, nunca bloqueia cadastro (duas cópias da mesma
 * carta é legítimo).
 */
export async function contarCopiasPorCartaId(
  db: Database,
  cartaIds: readonly string[],
): Promise<Record<string, number>> {
  if (cartaIds.length === 0) return {};
  const linhas = await db
    .select({ cartaId: copia.cartaId, total: sql<number>`sum(${copia.quantidade})::int` })
    .from(copia)
    .where(inArray(copia.cartaId, [...cartaIds]))
    .groupBy(copia.cartaId);

  const mapa: Record<string, number> = {};
  for (const l of linhas) mapa[l.cartaId] = l.total;
  return mapa;
}

// --- Visão geral do inventário (item 1) -------------------------------------
//
// Todas as consultas abaixo agregam em SQL (GROUP BY / sum / count), nunca
// trazem uma linha por cópia para somar em JavaScript — pedido explícito da
// tarefa, para escalar de 8 cópias a milhares sem mudar de forma. O volume
// que cruza para a aplicação é sempre o já agregado: uma linha por set, por
// raridade, por idioma, por condição ou por variante — nunca uma por cópia.

export interface TotaisInventario {
  cartasDistintas: number;
  totalUnidades: number;
  unidadesAlocadas: number;
  unidadesLivres: number;
}

/**
 * Totais do topo da tela (item 1): cartas distintas (`count(distinct
 * carta_id)`), unidades (`sum(quantidade)` — diferente de nº de linhas,
 * por causa de `quantidade > 1`), unidades alocadas e livres. Uma
 * consulta só, sem GROUP BY (agrega a tabela inteira numa linha) — mesmo
 * padrão da contagem total de `listarCopias`.
 *
 * `unidadesAlocadas` soma `quantidade` das cópias que TÊM vaga (LEFT JOIN
 * com `vaga`, que nunca duplica linha: `vaga_copia_id_unique` garante no
 * máximo uma vaga por cópia). Como toda cópia alocada tem `quantidade =
 * 1` (regra da divisão de lote — a linha alocada nasce com 1 unidade), a
 * soma aqui é equivalente a contar linhas alocadas; somar é a forma
 * literalmente correta e não depende desse invariante para estar certa.
 */
export async function obterTotaisInventario(db: Database): Promise<TotaisInventario> {
  const [linha] = await db
    .select({
      cartasDistintas: sql<number>`count(distinct ${copia.cartaId})::int`,
      totalUnidades: sql<number>`coalesce(sum(${copia.quantidade}), 0)::int`,
      unidadesAlocadas: sql<number>`coalesce(sum(case when ${vaga.id} is not null then ${copia.quantidade} else 0 end), 0)::int`,
    })
    .from(copia)
    .leftJoin(vaga, eq(vaga.copiaId, copia.id));

  const totalUnidades = linha?.totalUnidades ?? 0;
  const unidadesAlocadas = linha?.unidadesAlocadas ?? 0;
  return {
    cartasDistintas: linha?.cartasDistintas ?? 0,
    totalUnidades,
    unidadesAlocadas,
    unidadesLivres: totalUnidades - unidadesAlocadas,
  };
}

export interface DistribuicaoExpansao {
  setId: string;
  setNome: string;
  unidades: number;
}

/**
 * Unidades por expansão. Agrupa só por `set_id` — nunca por
 * `(set_id, set_nome)`: o mesmo set pode ter cópias identificadas ora
 * pela linha de catálogo `pt`, ora pela `en` (regra 7 do AGENTS.md), e
 * `set_nome` vem traduzido por linha — agrupar pelas duas colunas
 * partiria o mesmo set físico em dois grupos. O rótulo (nome) reaproveita
 * `listarSetsParaCadastro`, que já resolve pt > en > jp por set — não
 * recalcula a prioridade de idioma aqui.
 */
export async function obterDistribuicaoPorExpansao(
  db: Database,
): Promise<DistribuicaoExpansao[]> {
  const [somas, sets] = await Promise.all([
    db
      .select({
        setId: cartaCatalogo.setId,
        unidades: sql<number>`sum(${copia.quantidade})::int`,
      })
      .from(copia)
      .innerJoin(
        cartaCatalogo,
        and(eq(copia.cartaId, cartaCatalogo.id), eq(copia.idiomaCatalogo, cartaCatalogo.idioma)),
      )
      .groupBy(cartaCatalogo.setId)
      .orderBy(desc(sql`sum(${copia.quantidade})`)),
    listarSetsParaCadastro(db),
  ]);

  const nomePorSetId = new Map(sets.map((s) => [s.setId, s.setNome]));
  return somas.map((s) => ({
    setId: s.setId,
    setNome: nomePorSetId.get(s.setId) ?? s.setId,
    unidades: s.unidades,
  }));
}

export interface DistribuicaoRaridade {
  /** Nulo quando a carta não tem raridade no catálogo (Treinador/Energia em alguns sets). */
  raridade: string | null;
  unidades: number;
}

export async function obterDistribuicaoPorRaridade(
  db: Database,
): Promise<DistribuicaoRaridade[]> {
  return db
    .select({
      raridade: cartaCatalogo.raridade,
      unidades: sql<number>`sum(${copia.quantidade})::int`,
    })
    .from(copia)
    .innerJoin(
      cartaCatalogo,
      and(eq(copia.cartaId, cartaCatalogo.id), eq(copia.idiomaCatalogo, cartaCatalogo.idioma)),
    )
    .groupBy(cartaCatalogo.raridade)
    .orderBy(desc(sql`sum(${copia.quantidade})`));
}

export interface DistribuicaoIdioma {
  idioma: Idioma;
  unidades: number;
}

/** Idioma FÍSICO da cópia (`copia.idioma`) — não o idioma de catálogo. */
export async function obterDistribuicaoPorIdioma(db: Database): Promise<DistribuicaoIdioma[]> {
  return db
    .select({ idioma: copia.idioma, unidades: sql<number>`sum(${copia.quantidade})::int` })
    .from(copia)
    .groupBy(copia.idioma)
    .orderBy(desc(sql`sum(${copia.quantidade})`));
}

export interface DistribuicaoCondicao {
  condicao: Condicao;
  unidades: number;
}

export async function obterDistribuicaoPorCondicao(db: Database): Promise<DistribuicaoCondicao[]> {
  return db
    .select({ condicao: copia.condicao, unidades: sql<number>`sum(${copia.quantidade})::int` })
    .from(copia)
    .groupBy(copia.condicao)
    .orderBy(desc(sql`sum(${copia.quantidade})`));
}

export interface DistribuicaoVariante {
  variante: VarianteCopia;
  unidades: number;
}

export async function obterDistribuicaoPorVariante(db: Database): Promise<DistribuicaoVariante[]> {
  return db
    .select({ variante: copia.variante, unidades: sql<number>`sum(${copia.quantidade})::int` })
    .from(copia)
    .groupBy(copia.variante)
    .orderBy(desc(sql`sum(${copia.quantidade})`));
}

// --- Repetidas / o que sobra para troca (item 2) ----------------------------

export interface CartaRepetidaIdioma {
  /** Idioma FÍSICO (não o de catálogo) — relevante para decidir o que trocar. */
  idioma: Idioma;
  quantidade: number;
  livres: number;
}

export interface CartaRepetida {
  cartaId: string;
  cartaNome: string;
  cartaLocalId: string;
  setNome: string;
  raridade: string | null;
  imagemUrl: string | null;
  /** De onde veio a foto acima (`origemDaImagem`) — governa o selo na tela. */
  imagemOrigem: OrigemImagem | null;
  /** Soma de `quantidade` de todas as cópias desta carta, em qualquer idioma de catálogo. */
  total: number;
  /** Soma de `quantidade` das cópias alocadas a alguma vaga. */
  alocadas: number;
  /** `total - alocadas`. */
  livres: number;
  /** Quebra por idioma FÍSICO — a mesma carta pode ter cópias em mais de um idioma. */
  idiomas: CartaRepetidaIdioma[];
}

const PRIORIDADE_IDIOMA_REPRESENTANTE: readonly Idioma[] = ["pt", "en", "jp"];

/**
 * Fragmento HAVING compartilhado pela consulta de página e pela de
 * contagem: `total >= 2` (definição fechada de "repetida") e,
 * opcionalmente, `livres >= 1` (filtro "o que dá para trocar"). O
 * `${soLivres}::boolean = false OR …` deixa o filtro como parâmetro
 * ligado (bind), não como texto SQL montado condicionalmente — mesmo
 * cuidado de todo o resto do arquivo com entrada dinâmica.
 */
function havingRepetidas(soLivres: boolean) {
  return sql`
    sum(c.quantidade) >= 2
    AND (
      ${soLivres}::boolean = false
      OR (sum(c.quantidade) - coalesce(sum(CASE WHEN v.id IS NOT NULL THEN c.quantidade ELSE 0 END), 0)) >= 1
    )
  `;
}

/**
 * Lista cartas repetidas (`total >= 2`), agrupando por `carta_id` ATRAVÉS
 * dos idiomas de catálogo (mesma regra já fechada para alocação e para o
 * aviso de repetida no cadastro, spec §3.3 / `contarCopiasPorCartaId`) —
 * uma cópia identificada pela linha `pt` e outra pela `en` da MESMA carta
 * física contam para o mesmo grupo. `idioma` FÍSICO de cada cópia (não o
 * de catálogo) aparece à parte, em `idiomas`, porque é o que importa para
 * decidir o que oferecer numa troca.
 *
 * Quatro consultas, todas O(nº de grupos ou nº de cartas da página) —
 * NUNCA O(nº de cópias):
 * 1. página de grupos (`carta_id`, `total`, `alocadas`, `livres`),
 *    agregado em SQL com HAVING, ORDER BY, LIMIT/OFFSET — só a página
 *    pedida cruza para a aplicação;
 * 2. contagem de grupos que casam o HAVING, para paginação;
 * 3. carta de catálogo representante de cada `carta_id` da página (nome,
 *    imagem, raridade) — bounded a `tamanhoPagina` ids;
 * 4. quebra por idioma físico dos mesmos `carta_id` da página.
 *
 * (1) e (2) são SQL cru (`db.execute`) pelo mesmo motivo de
 * `contarCopiasElegiveisParaVagasVazias`: a agregação com HAVING
 * condicional fica mais direta em SQL do que no query builder. (3) e (4)
 * usam o query builder com `inArray`, já testado em outras rotas deste
 * arquivo.
 */
export async function listarCartasRepetidas(
  db: Database,
  filtros: FiltrosRepetidas,
): Promise<{ itens: CartaRepetida[]; total: number }> {
  const offset = (filtros.pagina - 1) * filtros.tamanhoPagina;
  const having = havingRepetidas(filtros.soLivres);

  const [paginaLinhas, contagemLinhas] = await Promise.all([
    db.execute<{
      carta_id: string;
      total: number | string;
      alocadas: number | string;
      livres: number | string;
    }>(sql`
      SELECT c.carta_id AS carta_id,
             sum(c.quantidade)::int AS total,
             coalesce(sum(CASE WHEN v.id IS NOT NULL THEN c.quantidade ELSE 0 END), 0)::int AS alocadas,
             (sum(c.quantidade) - coalesce(sum(CASE WHEN v.id IS NOT NULL THEN c.quantidade ELSE 0 END), 0))::int AS livres
      FROM copia c
      LEFT JOIN vaga v ON v.copia_id = c.id
      GROUP BY c.carta_id
      HAVING ${having}
      ORDER BY livres DESC, c.carta_id ASC
      LIMIT ${filtros.tamanhoPagina} OFFSET ${offset}
    `),
    db.execute<{ total: number | string }>(sql`
      SELECT count(*)::int AS total FROM (
        SELECT c.carta_id
        FROM copia c
        LEFT JOIN vaga v ON v.copia_id = c.id
        GROUP BY c.carta_id
        HAVING ${having}
      ) grupos
    `),
  ]);

  const total = Number(contagemLinhas[0]?.total ?? 0);
  if (paginaLinhas.length === 0) return { itens: [], total };

  const cartaIds = paginaLinhas.map((l) => l.carta_id);

  const [catalogoLinhas, idiomaLinhas] = await Promise.all([
    db
      .select({
        cartaId: cartaCatalogo.id,
        idioma: cartaCatalogo.idioma,
        nome: cartaCatalogo.nome,
        localId: cartaCatalogo.localId,
        setNome: cartaCatalogo.setNome,
        raridade: cartaCatalogo.raridade,
        imagemUrl: imagemDaCarta(cartaCatalogo),
        imagemOrigem: origemDaImagem(cartaCatalogo),
      })
      .from(cartaCatalogo)
      .where(inArray(cartaCatalogo.id, cartaIds)),
    db
      .select({
        cartaId: copia.cartaId,
        idioma: copia.idioma,
        quantidade: sql<number>`sum(${copia.quantidade})::int`,
        livres: sql<number>`coalesce(sum(case when ${vaga.id} is null then ${copia.quantidade} else 0 end), 0)::int`,
      })
      .from(copia)
      .leftJoin(vaga, eq(vaga.copiaId, copia.id))
      .where(inArray(copia.cartaId, cartaIds))
      .groupBy(copia.cartaId, copia.idioma),
  ]);

  const catalogoPorCartaId = new Map<string, typeof catalogoLinhas>();
  for (const l of catalogoLinhas) {
    const grupo = catalogoPorCartaId.get(l.cartaId);
    if (grupo) grupo.push(l);
    else catalogoPorCartaId.set(l.cartaId, [l]);
  }

  const idiomasPorCartaId = new Map<string, CartaRepetidaIdioma[]>();
  for (const l of idiomaLinhas) {
    const grupo = idiomasPorCartaId.get(l.cartaId) ?? [];
    grupo.push({ idioma: l.idioma, quantidade: l.quantidade, livres: l.livres });
    idiomasPorCartaId.set(l.cartaId, grupo);
  }

  const itens: CartaRepetida[] = paginaLinhas.map((linha) => {
    const cartaId = linha.carta_id;
    const linhasCatalogo = catalogoPorCartaId.get(cartaId) ?? [];
    const representante =
      PRIORIDADE_IDIOMA_REPRESENTANTE.map((idioma) =>
        linhasCatalogo.find((l) => l.idioma === idioma),
      ).find((l) => l !== undefined) ?? linhasCatalogo[0];

    return {
      cartaId,
      cartaNome: representante?.nome ?? cartaId,
      cartaLocalId: representante?.localId ?? "",
      setNome: representante?.setNome ?? "",
      raridade: representante?.raridade ?? null,
      imagemUrl: representante?.imagemUrl ?? null,
      imagemOrigem: representante?.imagemOrigem ?? null,
      total: Number(linha.total),
      alocadas: Number(linha.alocadas),
      livres: Number(linha.livres),
      idiomas: (idiomasPorCartaId.get(cartaId) ?? []).sort((a, b) =>
        a.idioma.localeCompare(b.idioma),
      ),
    };
  });

  return { itens, total };
}

// --- Exportação LigaPokemon (Fase 7) -------------------------------------

export interface CopiaParaLiga {
  setNomePt: string | null;
  setNomeEn: string | null;
  setSigla: string | null;
  cartaNomePt: string | null;
  cartaNomeEn: string | null;
  quantidade: number;
  condicao: Condicao;
  idioma: Idioma;
  raridade: string | null;
  categoria: string | null;
  tipos: string[];
  variante: VarianteCopia;
  localId: string;
  notas: string | null;
  setQtdOficial: number;
}

export interface InventarioParaLiga {
  itens: CopiaParaLiga[];
  /** Cópias deixadas de fora, com o motivo — o resumo diz isso ao usuário. */
  excluidas: { cartaId: string; nome: string; motivo: string }[];
}

/**
 * O inventário no formato que a exportação da LigaPokemon precisa.
 *
 * Traz os nomes nos DOIS idiomas ocidentais para a mesma carta (o arquivo
 * deles tem coluna de edição e de card em pt e en), buscando cada um na
 * sua linha de catálogo pelo mesmo `carta_id`.
 *
 * **Cópias de catálogo japonês ficam de fora** (decisão de
 * 2026-08-29): o nome sairia em japonês nas colunas de pt e en, e a
 * maioria dessas linhas não tem sigla de set — o arquivo provavelmente
 * seria recusado. Elas voltam em `excluidas`, para o resumo do download
 * dizer o que não foi.
 */
export async function listarInventarioParaLiga(
  db: Database,
): Promise<InventarioParaLiga> {
  const catalogoPt = alias(cartaCatalogo, "catalogo_pt");
  const catalogoEn = alias(cartaCatalogo, "catalogo_en");

  const linhas = await db
    .select({
      cartaId: copia.cartaId,
      idiomaCatalogo: copia.idiomaCatalogo,
      quantidade: copia.quantidade,
      condicao: copia.condicao,
      idioma: copia.idioma,
      variante: copia.variante,
      notas: copia.notas,
      nomeCatalogo: cartaCatalogo.nome,
      localId: cartaCatalogo.localId,
      raridade: cartaCatalogo.raridade,
      categoria: cartaCatalogo.categoria,
      tipos: cartaCatalogo.tipos,
      setSigla: cartaCatalogo.setSigla,
      setQtdOficial: cartaCatalogo.setQtdOficial,
      setNomePt: catalogoPt.setNome,
      setNomeEn: catalogoEn.setNome,
      cartaNomePt: catalogoPt.nome,
      cartaNomeEn: catalogoEn.nome,
    })
    .from(copia)
    .innerJoin(
      cartaCatalogo,
      and(eq(copia.cartaId, cartaCatalogo.id), eq(copia.idiomaCatalogo, cartaCatalogo.idioma)),
    )
    .leftJoin(
      catalogoPt,
      and(eq(catalogoPt.id, copia.cartaId), eq(catalogoPt.idioma, "pt")),
    )
    .leftJoin(
      catalogoEn,
      and(eq(catalogoEn.id, copia.cartaId), eq(catalogoEn.idioma, "en")),
    )
    .orderBy(cartaCatalogo.setId, cartaCatalogo.localId);

  const itens: CopiaParaLiga[] = [];
  const excluidas: InventarioParaLiga["excluidas"] = [];

  for (const l of linhas) {
    if (l.idiomaCatalogo === "jp") {
      excluidas.push({
        cartaId: l.cartaId,
        nome: l.nomeCatalogo,
        motivo: "carta de catálogo japonês — a LigaPokemon não tem esta edição",
      });
      continue;
    }
    itens.push({
      setNomePt: l.setNomePt,
      setNomeEn: l.setNomeEn,
      setSigla: l.setSigla,
      cartaNomePt: l.cartaNomePt,
      cartaNomeEn: l.cartaNomeEn,
      quantidade: l.quantidade,
      condicao: l.condicao as Condicao,
      idioma: l.idioma,
      raridade: l.raridade,
      categoria: l.categoria,
      tipos: l.tipos ?? [],
      variante: l.variante,
      localId: l.localId,
      notas: l.notas,
      setQtdOficial: l.setQtdOficial,
    });
  }

  return { itens, excluidas };
}

// --- Sugestão de melhoria de vaga preenchida (Fase 9, 2026-09-05) ---------

/** A cópia que está na vaga hoje — o lado que a sugestão quer substituir. */
export interface CopiaAlocadaNaVaga {
  copiaId: string;
  cartaNome: string;
  cartaLocalId: string;
  setNome: string;
  raridade: string | null;
  idioma: Idioma;
  variante: VarianteCopia;
  condicao: Condicao;
  imagemUrl: string | null;
  imagemOrigem: OrigemImagem | null;
}

/** Uma cópia livre que supera a alocada, com o eixo que a fez ganhar. */
export interface CandidataMelhoria {
  id: string;
  cartaId: string;
  idiomaCatalogo: Idioma;
  cartaNome: string;
  cartaLocalId: string;
  setId: string;
  setNome: string;
  raridade: string | null;
  idioma: Idioma;
  variante: VarianteCopia;
  condicao: Condicao;
  quantidade: number;
  imagemUrl: string | null;
  imagemOrigem: OrigemImagem | null;
  eixo: EixoMelhoria;
}

export interface MelhoriaDaVaga {
  vagaId: string;
  chave: string;
  atual: CopiaAlocadaNaVaga;
  /** Ordenadas da melhor para a pior. Nunca vazia — vaga sem melhoria não entra na lista. */
  candidatas: CandidataMelhoria[];
}

export type ResultadoMelhorias =
  | { ok: true; itens: MelhoriaDaVaga[] }
  | { ok: false; motivo: Recusa };

/**
 * As vagas PREENCHIDAS desta coleção para as quais existe uma cópia livre
 * melhor no inventário (spec §5, Fase 9).
 *
 * Divisão de trabalho, deliberada: **o SQL faz o casamento, a escada é do
 * módulo puro.** A consulta devolve os pares (vaga preenchida × cópia
 * livre do mesmo universo) e o `selecionarMelhorias`
 * (`lib/dominio/melhoria-vaga.ts`) decide quem é melhoria e em que ordem.
 * Traduzir a escada para `CASE` no meio do SQL duplicaria a regra num
 * lugar onde ela não tem teste — e a classificação de raridade já é um
 * `includes` sobre 56 valores de texto livre, que em SQL viraria uma
 * pilha de `ILIKE` divergindo do glifo que a tela desenha.
 *
 * O universo é o MESMO de `listarCandidatosDaVaga` e
 * `contarCandidatosPorVagaVazia`, traduzido de
 * `pertenceAoUniversoPokedex`/`...Set`: pokedex casa a espécie
 * (`dex_ids` com exatamente um elemento igual à chave — regra 2; a forma
 * nunca entra, regra 3) e ignora o set, que é o ponto ("mais raridade
 * independente do set", pedido do usuário); set casa `set_id` + `local_id`, a
 * mesma carta, onde só a variante pode diferir.
 *
 * **`customizada` não tem melhoria e devolve lista vazia.** Lá a vaga não
 * tem universo — qualquer cópia caberia, então "melhor" não quer dizer
 * nada: a carta foi escolhida a dedo, não por preencher um lugar.
 *
 * **Coleção com `idiomaExigido` só recebe candidata dentro do padrão.** A
 * escada de idioma (en > jp > pt) não passa por cima da exigência da
 * coleção: numa Pokédex "toda em português", uma inglesa melhor não é
 * melhoria, é violação do que o usuário pediu. Aqui é diferente da alocação de
 * vaga VAZIA, onde a fora de padrão aparece marcada — preencher buraco
 * com o que há é útil; trocar o que já está certo pelo fora de padrão,
 * não.
 *
 * Regra 5 do AGENTS.md intacta: isto lista e ordena — a troca é sempre um
 * clique do usuário (`trocarCopiaDaVaga`).
 */
export async function listarMelhoriasDaColecao(
  db: Database,
  colecaoId: string,
): Promise<ResultadoMelhorias> {
  const colecaoLinha = await obterColecaoPorId(db, colecaoId);
  if (!colecaoLinha) return { ok: false, motivo: recusa("colecaoNaoEncontrada") };
  if (colecaoLinha.tipo !== "pokedex" && colecaoLinha.tipo !== "set") {
    return { ok: true, itens: [] };
  }

  const copiaAtual = alias(copia, "copia_atual");
  const cartaAtual = alias(cartaCatalogo, "carta_atual");
  const copiaCandidata = alias(copia, "copia_candidata");
  const cartaCandidata = alias(cartaCatalogo, "carta_candidata");

  const universo =
    colecaoLinha.tipo === "pokedex"
      ? sql`array_length(${cartaCandidata.dexIds}, 1) = 1 and ${cartaCandidata.dexIds}[1] = ${vaga.chave}::int`
      : and(
          eq(cartaCandidata.setId, (colecaoLinha.parametro as ParametroSet).setId),
          eq(cartaCandidata.localId, vaga.chave),
        );

  const linhas = await db
    .select({
      vagaId: vaga.id,
      chave: vaga.chave,

      atualCopiaId: copiaAtual.id,
      atualIdioma: copiaAtual.idioma,
      atualVariante: copiaAtual.variante,
      atualCondicao: copiaAtual.condicao,
      atualRaridade: cartaAtual.raridade,
      atualNome: cartaAtual.nome,
      atualLocalId: cartaAtual.localId,
      atualSetNome: cartaAtual.setNome,
      atualImagemUrl: imagemDaCarta(cartaAtual),
      atualImagemOrigem: origemDaImagem(cartaAtual),

      id: copiaCandidata.id,
      cartaId: copiaCandidata.cartaId,
      idiomaCatalogo: copiaCandidata.idiomaCatalogo,
      idioma: copiaCandidata.idioma,
      variante: copiaCandidata.variante,
      condicao: copiaCandidata.condicao,
      quantidade: copiaCandidata.quantidade,
      raridade: cartaCandidata.raridade,
      cartaNome: cartaCandidata.nome,
      cartaLocalId: cartaCandidata.localId,
      setId: cartaCandidata.setId,
      setNome: cartaCandidata.setNome,
      imagemUrl: imagemDaCarta(cartaCandidata),
      imagemOrigem: origemDaImagem(cartaCandidata),
    })
    .from(vaga)
    .innerJoin(copiaAtual, eq(vaga.copiaId, copiaAtual.id))
    .innerJoin(
      cartaAtual,
      and(eq(copiaAtual.cartaId, cartaAtual.id), eq(copiaAtual.idiomaCatalogo, cartaAtual.idioma)),
    )
    .innerJoin(cartaCandidata, universo)
    .innerJoin(
      copiaCandidata,
      and(
        eq(copiaCandidata.cartaId, cartaCandidata.id),
        eq(copiaCandidata.idiomaCatalogo, cartaCandidata.idioma),
      ),
    )
    .where(
      and(
        eq(vaga.colecaoId, colecaoId),
        isNotNull(vaga.copiaId),
        // Só cópia LIVRE: roubar carta alocada em outra coleção quebraria
        // a regra 1 (alocação exclusiva) por sugestão do próprio sistema.
        sql`not exists (select 1 from vaga v2 where v2.copia_id = ${copiaCandidata.id})`,
        // Sugestão que o usuário já mandou calar, para ESTE par.
        sql`not exists (
          select 1 from melhoria_descartada md
          where md.vaga_id = ${vaga.id} and md.copia_id = ${copiaCandidata.id}
        )`,
        colecaoLinha.idiomaExigido
          ? eq(copiaCandidata.idioma, colecaoLinha.idiomaExigido)
          : undefined,
      ),
    );

  const porVaga = new Map<string, { vaga: MelhoriaDaVaga; candidatas: CandidataMelhoria[] }>();
  for (const l of linhas) {
    let grupo = porVaga.get(l.vagaId);
    if (!grupo) {
      grupo = {
        vaga: {
          vagaId: l.vagaId,
          chave: l.chave,
          atual: {
            copiaId: l.atualCopiaId,
            cartaNome: l.atualNome,
            cartaLocalId: l.atualLocalId,
            setNome: l.atualSetNome,
            raridade: l.atualRaridade,
            idioma: l.atualIdioma,
            variante: l.atualVariante,
            condicao: l.atualCondicao,
            imagemUrl: l.atualImagemUrl,
            imagemOrigem: l.atualImagemOrigem,
          },
          candidatas: [],
        },
        candidatas: [],
      };
      porVaga.set(l.vagaId, grupo);
    }
    grupo.candidatas.push({
      id: l.id,
      cartaId: l.cartaId,
      idiomaCatalogo: l.idiomaCatalogo,
      cartaNome: l.cartaNome,
      cartaLocalId: l.cartaLocalId,
      setId: l.setId,
      setNome: l.setNome,
      raridade: l.raridade,
      idioma: l.idioma,
      variante: l.variante,
      condicao: l.condicao,
      quantidade: l.quantidade,
      imagemUrl: l.imagemUrl,
      imagemOrigem: l.imagemOrigem,
      // Substituído logo abaixo por `selecionarMelhorias`, que é quem
      // sabe o eixo. O valor aqui nunca chega à tela.
      eixo: "raridade",
    });
  }

  const itens: MelhoriaDaVaga[] = [];
  for (const { vaga: v, candidatas } of porVaga.values()) {
    const melhorias = selecionarMelhorias(v.atual, candidatas);
    if (melhorias.length > 0) {
      itens.push({ ...v, candidatas: melhorias });
    }
  }

  return { ok: true, itens: itens.sort((a, b) => compararLocalId(a.chave, b.chave)) };
}

/**
 * Silencia uma sugestão: esta cópia, nesta vaga, não interessa.
 *
 * Idempotente (`onConflictDoNothing`) — descartar duas vezes é a mesma
 * coisa que descartar uma. Não valida se o par é de fato uma melhoria: se
 * não for, a linha só nunca terá efeito, e recusar aqui obrigaria a
 * repetir a escada num lugar onde ela não decide nada.
 */
export async function descartarMelhoria(
  db: Database,
  vagaId: string,
  copiaId: string,
): Promise<{ ok: true } | { ok: false; motivo: Recusa }> {
  const [vagaLinha] = await db.select({ id: vaga.id }).from(vaga).where(eq(vaga.id, vagaId)).limit(1);
  if (!vagaLinha) return { ok: false, motivo: recusa("vagaNaoEncontrada") };

  const [copiaLinha] = await db.select({ id: copia.id }).from(copia).where(eq(copia.id, copiaId)).limit(1);
  if (!copiaLinha) return { ok: false, motivo: recusa("copiaNaoEncontrada") };

  await db.insert(melhoriaDescartada).values({ vagaId, copiaId }).onConflictDoNothing();
  return { ok: true };
}

/** Desfaz o descarte — a sugestão volta a aparecer. Idempotente. */
export async function restaurarMelhoria(
  db: Database,
  vagaId: string,
  copiaId: string,
): Promise<{ ok: true }> {
  await db
    .delete(melhoriaDescartada)
    .where(and(eq(melhoriaDescartada.vagaId, vagaId), eq(melhoriaDescartada.copiaId, copiaId)));
  return { ok: true };
}

/**
 * Recusa de negócio dentro da transação da troca. Existe para que o
 * rollback e a mensagem legível andem juntos: `return` fecharia a
 * transação com sucesso e deixaria a vaga vazia; um `Error` cru viraria
 * 500 e esconderia o motivo.
 */
class ErroTrocaRecusada extends Error {
  readonly motivo: Recusa;

  constructor(m: Recusa) {
    super(m.chave);
    this.motivo = m;
    this.name = "ErroTrocaRecusada";
  }
}

export type ResultadoTroca =
  | { ok: true; copiaAlocadaId: string; copiaLiberadaId: string; dividida: boolean; foraDePadrao: boolean }
  | { ok: false; motivo: Recusa };

/**
 * Troca a cópia de uma vaga preenchida pela melhor: libera a que está lá
 * e aloca a nova **na mesma transação** (spec §5, Fase 9).
 *
 * Por que transação única, e não "desalocar depois alocar" pela tela: no
 * meio dos dois passos a vaga fica vazia, e um erro no segundo (cópia já
 * alocada por outra aba, elegibilidade recusada, container reiniciado)
 * deixaria a vaga vazia com a carta boa fora dela — o sistema teria
 * PIORADO a coleção por conta própria. Aqui ou a troca inteira acontece,
 * ou nada muda.
 *
 * A validação da nova cópia é a de sempre (`alocarNaTransacao`, que
 * chama `avaliarElegibilidade`): a troca não é um atalho para burlar
 * regra nenhuma. Ela não checa se a nova é MELHOR — a escada decide o que
 * o sistema sugere, não o que ele permite; se o usuário quiser trocar por
 * outra coisa, a decisão é dele (regra 5).
 *
 * A cópia liberada volta ao inventário livre e **não refunde o lote**,
 * igual a `desalocarVaga` — fragmentação deliberada, mesma decisão de
 * 2026-08-25.
 */
export async function trocarCopiaDaVaga(
  db: Database,
  vagaId: string,
  copiaId: string,
  opcoes: { permitirForaDePadrao?: boolean } = {},
): Promise<ResultadoTroca> {
  try {
    return await db.transaction(async (tx) => {
      const [vagaLinha] = await tx.select().from(vaga).where(eq(vaga.id, vagaId)).limit(1);
      if (!vagaLinha) return { ok: false, motivo: recusa("vagaNaoEncontrada") };
      if (vagaLinha.copiaId === null) {
        return { ok: false, motivo: recusa("vagaVaziaUseAlocacao") };
      }
      if (vagaLinha.copiaId === copiaId) {
        return { ok: false, motivo: recusa("copiaJaNestaVaga") };
      }

      const [colecaoLinha] = await tx
        .select({ tipo: colecao.tipo })
        .from(colecao)
        .where(eq(colecao.id, vagaLinha.colecaoId))
        .limit(1);
      if (colecaoLinha?.tipo === "customizada") {
        // Lá a vaga nasce com a cópia e morre com ela (spec §3.3): trocar
        // seria remover uma e adicionar outra, duas ações que já existem.
        return { ok: false, motivo: recusa("customizadaNaoTemTroca") };
      }

      const copiaLiberadaId = vagaLinha.copiaId;
      await tx
        .update(vaga)
        .set({ copiaId: null, atualizadoEm: new Date() })
        .where(and(eq(vaga.id, vagaId), eq(vaga.copiaId, copiaLiberadaId)));

      const alocacao = await alocarNaTransacao(tx, vagaId, copiaId, opcoes);
      if (!alocacao.ok) {
        // Devolver o motivo daqui não basta: o `return` fecha a transação
        // com sucesso, o UPDATE acima fica valendo e a vaga termina VAZIA
        // por causa de uma troca que falhou. A exceção desfaz tudo, e o
        // motivo volta legível pelo `catch` lá embaixo.
        throw new ErroTrocaRecusada(alocacao.motivo);
      }

      return {
        ok: true,
        copiaAlocadaId: alocacao.copiaAlocadaId,
        copiaLiberadaId,
        dividida: alocacao.dividida,
        foraDePadrao: alocacao.foraDePadrao,
      };
    });
  } catch (err) {
    if (err instanceof ErroTrocaRecusada) {
      return { ok: false, motivo: err.motivo };
    }
    if (violaUnicidadeVagaCopiaId(err)) {
      return { ok: false, motivo: recusa("copiaJaAlocada") };
    }
    throw err;
  }
}
