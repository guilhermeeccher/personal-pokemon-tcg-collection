/**
 * A edição de uma cópia no detalhe (modo cópia): o formulário em texto e o
 * corpo do `PATCH /api/copias/:id` que sai dele. Módulo puro.
 *
 * ## Só o que mudou
 *
 * A janela da v1 mandava os doze campos a cada "Salvar". O detalhe manda os
 * mesmos campos, com os mesmos nomes e tipos, **só os que a pessoa mudou** —
 * a rota já aceita um corpo parcial ("só o que vier no corpo é atualizado",
 * `validarEdicaoCopia`). Duas razões:
 *
 * - **Não desfazer a outra aba.** Com o corpo inteiro, salvar a nota numa aba
 *   regravava a localização que outra aba acabara de mudar, com o valor velho
 *   que este formulário leu.
 * - **Não esbarrar na checagem de variante à toa.** A rota confere a variante
 *   contra o catálogo sempre que ela vem no corpo; uma cópia antiga com uma
 *   variante que o catálogo deixou de listar não salvaria mais nada.
 *
 * Nada mudou: nenhum pedido sai (`corpo: null`).
 *
 * ## Mesma normalização da rota
 *
 * Texto vazio ou só espaço é `null` e o texto vai aparado (`textoOpcional`);
 * data em `AAAA-MM-DD`; preço com duas casas (`numeric(10,2)`). A comparação
 * com o original é feita já normalizada, para "  Fichário 1 " contra
 * "Fichário 1" não contar como mudança. O preço aceita vírgula — o teclado
 * decimal do celular em português a escreve.
 *
 * ## Regra 7
 *
 * O idioma aqui é o **físico**, da carta que a pessoa tem na mão. A ficha do
 * catálogo que identifica a carta não é editável por esta rota, e o detalhe
 * não oferece trocá-la: mudar o idioma físico nunca mexe na ficha.
 */

import type { Condicao, Idioma, VarianteCopia } from "@/lib/dominio/enums";
import type { CopiaDoDetalheV2DTO } from "@/lib/dominio/tipos-cliente";

/** O formulário como os campos o guardam: texto, exceto os três de escolha. */
export interface FormularioCopia {
  quantidade: string;
  idioma: Idioma;
  variante: VarianteCopia;
  condicao: Condicao;
  localizacao: string;
  gradedEmpresa: string;
  gradedNota: string;
  gradedCertificado: string;
  aquisicaoData: string;
  aquisicaoOrigem: string;
  aquisicaoPreco: string;
  notas: string;
}

/** O corpo do `PATCH /api/copias/:id`: as chaves da v1, só as que mudaram. */
export interface CorpoEdicaoCopia {
  quantidade?: number;
  idioma?: Idioma;
  variante?: VarianteCopia;
  condicao?: Condicao;
  localizacao?: string | null;
  gradedEmpresa?: string | null;
  gradedNota?: string | null;
  gradedCertificado?: string | null;
  aquisicaoData?: string | null;
  aquisicaoOrigem?: string | null;
  aquisicaoPreco?: string | null;
  notas?: string | null;
}

export type CampoComErro = "quantidade" | "aquisicaoData" | "aquisicaoPreco";

export type ResultadoEdicao =
  | { ok: true; corpo: CorpoEdicaoCopia | null }
  | { ok: false; erros: CampoComErro[] };

export function formularioDaCopia(c: CopiaDoDetalheV2DTO): FormularioCopia {
  return {
    quantidade: String(c.quantidade),
    idioma: c.idioma,
    variante: c.variante,
    condicao: c.condicao,
    localizacao: c.localizacao ?? "",
    gradedEmpresa: c.gradedEmpresa ?? "",
    gradedNota: c.gradedNota ?? "",
    gradedCertificado: c.gradedCertificado ?? "",
    aquisicaoData: c.aquisicaoData ?? "",
    aquisicaoOrigem: c.aquisicaoOrigem ?? "",
    aquisicaoPreco: c.aquisicaoPreco ?? "",
    notas: c.notas ?? "",
  };
}

function texto(v: string): string | null {
  const t = v.trim();
  return t === "" ? null : t;
}

/** `null` para vazio; `undefined` para inválido. */
function preco(v: string): string | null | undefined {
  const t = v.trim().replace(",", ".");
  if (t === "") return null;
  if (!/^\d+(\.\d+)?$/.test(t)) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n.toFixed(2) : undefined;
}

function data(v: string): string | null | undefined {
  const t = v.trim();
  if (t === "") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : undefined;
}

/** O preço guardado, na mesma forma do normalizado (o banco devolve `numeric` como texto). */
function precoGuardado(v: string | null): string | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : v;
}

const TEXTOS = [
  "localizacao",
  "gradedEmpresa",
  "gradedNota",
  "gradedCertificado",
  "aquisicaoOrigem",
  "notas",
] as const;

export function corpoDaEdicao(original: CopiaDoDetalheV2DTO, f: FormularioCopia): ResultadoEdicao {
  const erros: CampoComErro[] = [];
  const corpo: CorpoEdicaoCopia = {};

  const quantidade = /^\d+$/.test(f.quantidade.trim()) ? Number(f.quantidade.trim()) : Number.NaN;
  if (!Number.isInteger(quantidade) || quantidade < 1) erros.push("quantidade");
  else if (quantidade !== original.quantidade) corpo.quantidade = quantidade;

  if (f.idioma !== original.idioma) corpo.idioma = f.idioma;
  if (f.variante !== original.variante) corpo.variante = f.variante;
  if (f.condicao !== original.condicao) corpo.condicao = f.condicao;

  for (const campo of TEXTOS) {
    const novo = texto(f[campo]);
    if (novo !== (original[campo] ?? null)) corpo[campo] = novo;
  }

  const novaData = data(f.aquisicaoData);
  if (novaData === undefined) erros.push("aquisicaoData");
  else if (novaData !== (original.aquisicaoData ?? null)) corpo.aquisicaoData = novaData;

  const novoPreco = preco(f.aquisicaoPreco);
  if (novoPreco === undefined) erros.push("aquisicaoPreco");
  else if (novoPreco !== precoGuardado(original.aquisicaoPreco)) corpo.aquisicaoPreco = novoPreco;

  if (erros.length > 0) return { ok: false, erros };
  return { ok: true, corpo: Object.keys(corpo).length > 0 ? corpo : null };
}
