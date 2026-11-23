/**
 * Regras do cadastro por busca da v2 (`/cadastro/busca`), fora do React para
 * que valham sem navegador e sem banco: o que a busca manda, o que a busca
 * rápida decide sozinha, o que o formulário da cópia grava e como a lista de
 * resultados acompanha uma gravação.
 *
 * Nada aqui decide regra de negócio nova. A variante vem do catálogo
 * (`variantesDisponiveis`, o mesmo módulo do cadastro por set) e o idioma da
 * cópia é o da carta física: **nunca é derivado da linha do catálogo** (regra
 * 7 do AGENTS.md). A linha diz qual carta é; a cópia diz como a minha é.
 */

import type { Condicao, Idioma, VarianteCopia } from "./enums";
import { parseSiglaNumero } from "./busca-carta";
import type { CartaEncontradaDTO } from "./tipos-cliente";
import { variantesDisponiveis } from "./variantes-catalogo";

export interface FiltrosBusca {
  nome: string;
  set: string;
  numero: string;
}

/**
 * Os parâmetros de `GET /api/cartas` para a busca por nome, set e número, ou
 * `null` quando os três estão vazios: a rota devolveria uma lista vazia sem
 * varrer o catálogo, e a tela diria "nenhuma carta" a quem só esqueceu de
 * digitar. Quem chama mostra o erro de critério.
 */
export function paramsDaBusca(filtros: FiltrosBusca): URLSearchParams | null {
  const nome = filtros.nome.trim();
  const set = filtros.set.trim();
  const numero = filtros.numero.trim();
  if (!nome && !set && !numero) return null;
  const params = new URLSearchParams();
  if (nome) params.set("nome", nome);
  if (set) params.set("set", set);
  if (numero) params.set("numero", numero);
  return params;
}

/** Os parâmetros da busca rápida ("MEW 151"), ou `null` se o texto não tem essa forma. */
export function paramsDaBuscaRapida(texto: string): URLSearchParams | null {
  const parseado = parseSiglaNumero(texto);
  if (!parseado) return null;
  return new URLSearchParams({ sigla: parseado.sigla, numero: parseado.numero });
}

/**
 * A busca rápida só resolve sozinha quando há **uma** candidata. Com zero ou
 * várias, mostra a lista: o sistema nunca escolhe a carta por quem cadastra
 * (regra 5, aplicada ao cadastro).
 */
export type DesfechoBuscaRapida =
  | { tipo: "unica"; carta: CartaEncontradaDTO }
  | { tipo: "lista"; cartas: CartaEncontradaDTO[] };

export function desfechoDaBuscaRapida(cartas: readonly CartaEncontradaDTO[]): DesfechoBuscaRapida {
  return cartas.length === 1 ? { tipo: "unica", carta: cartas[0] } : { tipo: "lista", cartas: [...cartas] };
}

/** O que a pessoa digita ao cadastrar uma cópia. Quantidade é texto, como digitada. */
export interface FormularioCopia {
  /** Pode ficar vazia enquanto se edita; só vira número, e só precisa ser >= 1, ao gravar. */
  quantidade: string;
  variante: VarianteCopia;
  idioma: Idioma;
  condicao: Condicao;
  localizacao: string;
}

/**
 * O formulário que abre ao escolher uma carta. Nunca nasce com uma variante
 * que a carta não tem: cai para a primeira que o catálogo marca (a mesma
 * regra do cadastro por set). O idioma físico nasce em `pt`, que é só o
 * padrão do formulário: o usuário escolhe o da carta que tem na mão, e a
 * linha do catálogo não entra nessa escolha (regra 7).
 */
export function formularioInicial(carta: CartaEncontradaDTO): FormularioCopia {
  const disponiveis = variantesDisponiveis(carta);
  return {
    quantidade: "1",
    variante: disponiveis.includes("normal") ? "normal" : disponiveis[0],
    idioma: "pt",
    condicao: "NM",
    localizacao: "",
  };
}

export type CorpoCopia = {
  cartaId: string;
  idiomaCatalogo: Idioma;
  idioma: Idioma;
  variante: VarianteCopia;
  quantidade: number;
  condicao: Condicao;
  localizacao?: string;
};

export type ResultadoCorpoCopia = { ok: true; corpo: CorpoCopia } | { ok: false; campo: "quantidade" };

/**
 * O corpo de `POST /api/copias`. Só inteiro de 1 em diante passa: `"1e1"`,
 * `"1.5"` e `"0"` seriam aceitos por um `Number()` solto, e nada abaixo de 1
 * pode chegar à API por outro caminho que não o do campo.
 */
export function corpoDaCopia(carta: CartaEncontradaDTO, form: FormularioCopia): ResultadoCorpoCopia {
  const texto = form.quantidade.trim();
  const quantidade = /^\d+$/.test(texto) ? Number(texto) : Number.NaN;
  if (!Number.isSafeInteger(quantidade) || quantidade < 1) return { ok: false, campo: "quantidade" };
  const localizacao = form.localizacao.trim();
  return {
    ok: true,
    corpo: {
      cartaId: carta.cartaId,
      idiomaCatalogo: carta.idiomaCatalogo,
      idioma: form.idioma,
      variante: form.variante,
      quantidade,
      condicao: form.condicao,
      localizacao: localizacao || undefined,
    },
  };
}

/** Uma linha da lista é a mesma carta de outra pela linha do catálogo, não só pelo `carta_id`. */
function mesmaLinha(a: CartaEncontradaDTO, b: { cartaId: string; idiomaCatalogo: Idioma }): boolean {
  return a.cartaId === b.cartaId && a.idiomaCatalogo === b.idiomaCatalogo;
}

export function chaveDoResultado(carta: { cartaId: string; idiomaCatalogo: Idioma }): string {
  return `${carta.cartaId}:${carta.idiomaCatalogo}`;
}

/**
 * Depois de gravar `quantidade` unidades, a lista acompanha: o aviso "já tem
 * N" de toda linha da mesma carta física sobe. `qtdPossuida` soma por
 * `carta_id` (o pt e o en da mesma carta são uma carta só), então a conta é a
 * mesma esteja a cópia fundida numa linha antiga ou nascendo numa nova.
 */
export function somarPossuidas(
  resultados: readonly CartaEncontradaDTO[],
  cartaId: string,
  quantidade: number,
): CartaEncontradaDTO[] {
  return resultados.map((r) => (r.cartaId === cartaId ? { ...r, qtdPossuida: r.qtdPossuida + quantidade } : r));
}

/**
 * O que fica escolhido quando a resposta de uma gravação chega: o formulário
 * só fecha se ainda é o da carta gravada. A pessoa pode ter escolhido outra
 * linha enquanto a primeira gravava, e a resposta velha não apaga isso.
 */
export function escolhaAposGravar<T extends { cartaId: string; idiomaCatalogo: Idioma }>(
  atual: T | null,
  gravada: { cartaId: string; idiomaCatalogo: Idioma },
): T | null {
  return atual && chaveDoResultado(atual) === chaveDoResultado(gravada) ? null : atual;
}

/**
 * A carta escolhida continua escolhida só enquanto a lista a tiver: uma nova
 * busca que a tira da tela não pode deixar um formulário órfão de uma carta
 * que a pessoa já não vê.
 */
export function escolhaContinuaValida(
  resultados: readonly CartaEncontradaDTO[] | null,
  escolhida: { cartaId: string; idiomaCatalogo: Idioma } | null,
): boolean {
  if (!escolhida || !resultados) return false;
  return resultados.some((r) => mesmaLinha(r, escolhida));
}

/**
 * O que a janela de carta à mão traz já preenchido: o que a pessoa acabou de
 * procurar sem achar. Vale a **última** busca feita, a dos três campos ou a
 * rápida ("MEW 151"), porque a outra pode ter sobrado de antes e preencheria
 * a janela com uma carta que ela já não procura. A rápida é a única que
 * separa a sigla do número; sem uma rápida válida, vale o que está nos campos.
 */
export function sugestaoParaCartaManual(
  filtros: FiltrosBusca,
  siglaNumero: string,
  ultima: "busca" | "rapida",
): { sigla: string; numero: string; nome: string } {
  const rapida = ultima === "rapida" ? parseSiglaNumero(siglaNumero) : null;
  if (rapida) return { sigla: rapida.sigla, numero: rapida.numero, nome: "" };
  return { sigla: filtros.set.trim(), numero: filtros.numero.trim(), nome: filtros.nome.trim() };
}

/**
 * A raridade que vale mostrar numa linha de resultado: a literal "None" (ou
 * "Sem raridade") é o upstream dizendo que a carta não tem raridade, não uma
 * raridade; escrevê-la na lista seria inventar informação.
 */
export function raridadeExibivel(raridade: string | null): string | null {
  const texto = raridade?.trim();
  if (!texto || /^(none|sem raridade)$/i.test(texto)) return null;
  return texto;
}
