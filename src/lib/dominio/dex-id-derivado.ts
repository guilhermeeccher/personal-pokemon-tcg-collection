/**
 * Deriva o número da Pokédex de cartas que a TCGdex publica **sem
 * `dexId`**, lendo a espécie no próprio nome da carta.
 *
 * ## Por que existe
 *
 * Um "Diglett da Equipe Rocket" cadastrado à mão não apareceu
 * como candidato à vaga 50 da Pokédex. A causa não é a regra 2 (só carta
 * com exatamente um `dexId` ocupa vaga) — é o dado: a linha do catálogo
 * tem `dex_ids` vazio, apesar da categoria "Pokémon". Conferido no clone
 * do repositório upstream: **o arquivo da carta não tem campo `dexId`**.
 *
 * São 586 cartas assim no catálogo (medição de 2026-08-29):
 *
 * - **132 ocidentais** (66 pt + 66 en), todas do mecanismo "Pokémon de
 *   personagem": `Diglett da Equipe Rocket`, `Darumaka do N`,
 *   `Metagross ex do Steven`, `Team Rocket's Diglett`, `N's Darumaka`.
 * - **454 japonesas**, o mesmo mecanismo com a partícula `の`
 *   (`ナンジャモのハラバリーex`) mais cartas `ex`/Mega.
 *
 * Em todas, o nome da espécie está dentro do nome da carta. O catálogo
 * já sabe o número dessa espécie por outras cartas — é só ligar as duas
 * pontas, sem tabela de tradução e sem API.
 *
 * ## O que este módulo faz, e o que ele não faz
 *
 * Faz: reduzir o nome de uma carta ao nome da ESPÉCIE, tirando o dono
 * (personagem) e a mecânica. Quem procura esse nome no catálogo e decide
 * gravar é o script (`scripts/derivar-dex-ids.ts`).
 *
 * Não faz: adivinhar. Nome que não reduz a nada, ou que reduz a algo com
 * mais de um número possível, fica sem derivação — a carta continua fora
 * da Pokédex, que é o comportamento de hoje. Chutar um número colocaria
 * a carta errada como candidata de uma vaga, e a regra 5 diz que o
 * sistema sugere, nunca decide.
 *
 * Módulo puro, sem I/O.
 */

import { normalizarNomeCarta } from "./nome-especie";

/**
 * Possessivo de personagem em português. O dono vem DEPOIS da espécie
 * ("Diglett da Equipe Rocket"), então corta-se a partir da preposição.
 *
 * Só com espaço dos dois lados: sem isso, "Dodrio" perderia o "do" no
 * meio da palavra. Aceita `de`, `da`, `do` e as contrações com artigo
 * (`das`, `dos`) — o catálogo tem "da Equipe Rocket", "do N", "da
 * Cíntia", "do Ethan".
 */
const POSSESSIVO_PT = /\s+d[aeo]s?\s+/;

/**
 * Possessivo em inglês. O dono vem ANTES ("Team Rocket's Diglett"), então
 * fica-se com o que vem depois do apóstrofo. Aceita o apóstrofo reto e o
 * tipográfico — os dois aparecem no upstream.
 */
const POSSESSIVO_EN = /^.*?['’]s\s+/;

/**
 * Possessivo japonês: `の` liga dono e espécie
 * (`ナンジャモのハラバリーex` = Bellibolt ex da Iono). Fica-se com o que
 * vem DEPOIS da última partícula — `の` também aparece dentro de nomes de
 * mecânica, e a espécie é sempre o último termo.
 */
const POSSESSIVO_JP = /^.*の/;

/** Prefixos e sufixos japoneses de mecânica/forma, que `normalizarNomeCarta` não conhece. */
const PREFIXOS_JP = ["メガ", "アローラ", "ガラル", "ヒスイ", "パルデア"] as const;
const SUFIXOS_JP = ["ex", "EX", "GX", "VMAX", "VSTAR", "V"] as const;

function tirarSufixosJp(nome: string): string {
  let atual = nome.trim();
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const s of SUFIXOS_JP) {
      if (atual.endsWith(s)) {
        atual = atual.slice(0, -s.length);
        mudou = true;
      }
    }
  }
  return atual.trim();
}

function tirarPrefixosJp(nome: string): string {
  let atual = nome.trim();
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const p of PREFIXOS_JP) {
      if (atual.startsWith(p)) {
        atual = atual.slice(p.length);
        mudou = true;
      }
    }
  }
  return atual.trim();
}

/**
 * Os nomes de espécie que um nome de carta pode representar, **do mais
 * específico para o mais geral**, sem repetição.
 *
 * A ordem é o ponto. Em japonês, o prefixo de forma não tem separador:
 * `メガ` (Mega) cola na espécie. E há espécies cujo NOME COMEÇA com
 * `メガ` — `メガヤンマ` é Yanmega (469), não "Mega Yanma", e
 * `メガニウム` é Meganium (154). Tirar o prefixo cegamente transformaria
 * Yanmega em Yanma (193): a carta errada, na vaga errada, sem nada
 * indicando o erro.
 *
 * Por isso a lista vem em dois níveis: primeiro o nome só sem mecânica
 * (`メガヤンマ`), depois também sem o prefixo de forma (`ヤンマ`). Quem
 * consulta o índice tenta na ordem e para no primeiro que o catálogo
 * conhece — o específico vence.
 *
 * Em pt/en um nível basta: os prefixos ocidentais carregam separador
 * (`"Mega "`, `"M-"`), então "Meganium" nunca é confundido com uma forma
 * Mega de "nium".
 *
 * Tira-se o dono ANTES da mecânica: "Metagross ex do Steven" precisa
 * perder " do Steven" para então perder o " ex" que ficou na ponta; na
 * ordem inversa o " ex" está no meio da string e não é sufixo de nada.
 */
export function especiesCandidatasDoNome(
  nome: string,
  idioma: "pt" | "en" | "jp",
): string[] {
  const bruto = nome.trim();
  if (bruto === "") return [];

  if (idioma === "jp") {
    const semDono = bruto.replace(POSSESSIVO_JP, "");
    const semMecanica = tirarSufixosJp(semDono);
    const semForma = tirarPrefixosJp(semMecanica);
    return [...new Set([semMecanica, semForma])].filter((n) => n !== "");
  }

  const semDono =
    idioma === "en"
      ? bruto.replace(POSSESSIVO_EN, "")
      : bruto.split(POSSESSIVO_PT)[0];

  const normalizado = normalizarNomeCarta(semDono).trim();
  return normalizado === "" ? [] : [normalizado];
}

/**
 * O nome de espécie mais geral de uma carta — o último degrau de
 * `especiesCandidatasDoNome`, ou `""` quando não sobra nada.
 */
export function especieDoNomeDaCarta(nome: string, idioma: "pt" | "en" | "jp"): string {
  const candidatos = especiesCandidatasDoNome(nome, idioma);
  return candidatos.length === 0 ? "" : candidatos[candidatos.length - 1];
}

/**
 * Chave do índice de espécies. O idioma entra na chave para que a
 * comparação nunca atravesse idiomas.
 */
function chaveEspecie(idioma: "pt" | "en" | "jp", especie: string): string {
  return `${idioma}:${especie.toLowerCase()}`;
}

/**
 * O número da Pokédex de uma carta sem `dexId`, ou `null` quando não dá
 * para afirmar.
 *
 * `conhecidas` vem de `indexarEspeciesConhecidas`, e a chave dele já
 * carrega o idioma.
 *
 * Devolve `null` em três casos, todos deliberados: o nome não reduziu a
 * nada; a espécie não existe no catálogo; ou existe com mais de um número
 * (ambiguidade — nunca escolhe um).
 */
export function derivarDexId(
  nome: string,
  idioma: "pt" | "en" | "jp",
  conhecidas: ReadonlyMap<string, ReadonlySet<number>>,
): number | null {
  // Do mais específico para o mais geral, parando no primeiro que o
  // catálogo conhece sem ambiguidade. É o que faz メガヤンマex resolver
  // como Yanmega (469) em vez de Yanma (193).
  //
  // A chave carrega o idioma: comparar entre idiomas casaria "Diglett"
  // com "ディグダ" só por acaso de grafia.
  for (const especie of especiesCandidatasDoNome(nome, idioma)) {
    const numeros = conhecidas.get(chaveEspecie(idioma, especie));
    if (numeros?.size === 1) return [...numeros][0];
  }
  return null;
}

/**
 * Monta o índice de espécies conhecidas a partir das linhas do catálogo
 * que JÁ têm exatamente um número.
 *
 * **O índice é LITERAL: cada linha entra só sob o seu nome mais
 * específico** (sem mecânica, mas com a forma preservada). Quem
 * generaliza é a busca, descendo os níveis de
 * `especiesCandidatasDoNome`.
 *
 * A assimetria é deliberada e foi paga com um teste vermelho. Indexar
 * também a forma geral fazia `メガヤンマ` (Yanmega, 469) escrever na
 * chave `ヤンマ`, onde Yanma (193) já morava: a chave virava ambígua e
 * as DUAS espécies paravam de resolver. Com o índice literal,
 * `メガヤンマ` tem entrada própria (469), `ヤンマ` continua sozinha
 * (193), e uma carta `メガユキノオーex` — cuja forma específica não
 * existe como espécie — desce sozinha para `ユキノオー` (460).
 */
export function indexarEspeciesConhecidas(
  linhas: readonly { nome: string; idioma: "pt" | "en" | "jp"; dexId: number }[],
): Map<string, Set<number>> {
  const indice = new Map<string, Set<number>>();
  for (const l of linhas) {
    const [maisEspecifica] = especiesCandidatasDoNome(l.nome, l.idioma);
    if (!maisEspecifica) continue;
    const chave = chaveEspecie(l.idioma, maisEspecifica);
    const atual = indice.get(chave);
    if (atual) atual.add(l.dexId);
    else indice.set(chave, new Set([l.dexId]));
  }
  return indice;
}
