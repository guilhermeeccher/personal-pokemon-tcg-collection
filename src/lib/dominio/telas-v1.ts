import ts from "typescript";

import { PREFIXO_V1 } from "./destino-v1";

/**
 * Análise estática da convivência entre a v1 (em `/v1/...`) e a v2 (na raiz),
 * desde 2026-11-22. O teste (`telas-v1.test.ts`) lê `src/app` do disco e usa
 * estas funções; elas não tocam o disco, e cada uma é provada com fontes de
 * exemplo no próprio teste.
 *
 * O que se garante, e por quê:
 * - **Toda tela da v1 tem par na raiz** (página real da v2 ou ponte): um
 *   favorito antigo nunca cai em 404.
 * - **Toda ponte aponta para a mesma tela, e ela existe na v1.**
 * - **A v1 nunca linka para a raiz.** Um fluxo começado na v1 termina na v1:
 *   um link solto para `/colecoes/nova` cairia na v2 no meio do fluxo assim que
 *   ela existisse. Vale para a v1 e para `_componentes/`, que é a pele dela.
 * - **A v2 não importa a pele da v1** (`_componentes/`, `(v1)/`): sem os tokens
 *   da v1, aqueles componentes ficariam sem cor.
 */

/* ---------- rotas a partir do caminho do arquivo ---------- */

/** A rota de um `page.tsx`, a partir do caminho relativo a `src/app`, com os
 *  route groups e as pastas privadas fora: `(v1)/v1/colecoes/[id]/page.tsx`
 *  → `/v1/colecoes/[id]`. Devolve `null` para o que não é página. */
export function rotaDaPagina(relativoAoApp: string): string | null {
  const partes = relativoAoApp.split("/");
  if (partes.pop() !== "page.tsx") return null;
  if (partes.some((p) => p.startsWith("_"))) return null;
  const segmentos = partes.filter((p) => !(p.startsWith("(") && p.endsWith(")")));
  return `/${segmentos.join("/")}`;
}

const segmentosDe = (rota: string) => rota.split("/").filter(Boolean);
const ehDinamico = (s: string) => /^\[[^.[\]]+\]$/.test(s);
const ehCatchAll = (s: string) => /^\[\.\.\.[^\]]+\]$/.test(s);
const ehCatchAllOpcional = (s: string) => /^\[\[\.\.\.[^\]]+\]\]$/.test(s);

/** Se a rota `padrao` (com `[x]`, `[...x]`, `[[...x]]`) responde por toda URL
 *  que a rota `alvo` responde. Um `[id]` do alvo só casa com um segmento
 *  dinâmico ou com um catch-all do padrão, nunca com um estático. */
export function rotaCobre(padrao: string, alvo: string): boolean {
  const p = segmentosDe(padrao);
  const a = segmentosDe(alvo);
  for (let i = 0; i < p.length; i++) {
    if (ehCatchAllOpcional(p[i])) return true;
    if (ehCatchAll(p[i])) return a.length > i;
    if (i >= a.length) return false;
    if (ehDinamico(p[i])) {
      if (ehCatchAll(a[i]) || ehCatchAllOpcional(a[i])) return false;
      continue;
    }
    if (p[i] !== a[i]) return false;
  }
  return p.length === a.length;
}

/** A rota da v1 sem o prefixo: `/v1/colecoes` → `/colecoes`, `/v1` → `/`. */
export function semPrefixoV1(rota: string): string | null {
  if (rota === PREFIXO_V1) return "/";
  return rota.startsWith(`${PREFIXO_V1}/`) ? rota.slice(PREFIXO_V1.length) : null;
}

/* ---------- as pontes ---------- */

export const FUNCAO_PONTE = "irParaV1";

/**
 * O destino que a ponte monta, como rota: o primeiro argumento de
 * `irParaV1(...)`, que tem de ser um array literal de segmentos — texto fixo,
 * um identificador (o parâmetro dinâmico de mesmo nome) ou o espalhamento do
 * catch-all. `["colecoes", id]` → `/colecoes/[id]`; `["dex", ...resto]` →
 * `/dex/[[...resto]]`. `null` se o arquivo não chama a ponte; `"invalido"` se
 * chama de um jeito que não dá para conferir.
 */
export function destinoDaPonte(fonte: string, catchAllOpcional: ReadonlySet<string>): string | null | "invalido" {
  const sf = ts.createSourceFile("ponte.tsx", fonte, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let achado: string | null | "invalido" = null;
  const visitar = (no: ts.Node): void => {
    if (ts.isCallExpression(no) && ts.isIdentifier(no.expression) && no.expression.text === FUNCAO_PONTE) {
      if (achado !== null) {
        achado = "invalido";
        return;
      }
      const arg = no.arguments[0];
      if (!arg || !ts.isArrayLiteralExpression(arg)) {
        achado = "invalido";
        return;
      }
      const segmentos: string[] = [];
      for (const el of arg.elements) {
        if (ts.isStringLiteral(el)) segmentos.push(el.text);
        else if (ts.isIdentifier(el)) segmentos.push(`[${el.text}]`);
        else if (ts.isSpreadElement(el) && ts.isIdentifier(el.expression)) {
          const nome = el.expression.text;
          segmentos.push(catchAllOpcional.has(nome) ? `[[...${nome}]]` : `[...${nome}]`);
        } else {
          achado = "invalido";
          return;
        }
      }
      achado = `/${segmentos.join("/")}`;
    }
    ts.forEachChild(no, visitar);
  };
  visitar(sf);
  return achado;
}

/** Os nomes dos catch-all opcionais de uma rota: `/dex/[[...resto]]` →
 *  `resto`. Servem para `destinoDaPonte` ler `...resto` do jeito certo. */
export function catchAllsOpcionais(rota: string): Set<string> {
  return new Set(
    segmentosDe(rota)
      .filter(ehCatchAllOpcional)
      .map((s) => s.slice(5, -2)),
  );
}

/* ---------- literais de caminho de tela ---------- */

/**
 * Caminhos que ficam na raiz e servem às duas versões: a API, o login (que
 * mora em `(v1)/login` com a URL `/login`), os ícones e o manifesto do PWA e o
 * favicon. Qualquer outro literal que começa por `/` num arquivo da v1 é um
 * caminho de tela, e tem de começar por `/v1`.
 */
const RAIZ_COMUM = [/^\/api\//, /^\/login(?=$|[/?#])/, /^\/pwa\//, /^\/manifest\.webmanifest$/, /^\/favicon\.ico$/];
const COM_PREFIXO_V1 = new RegExp(`^${PREFIXO_V1}(?=$|[/?#])`);

export function ehCaminhoDeTelaSemV1(texto: string): boolean {
  if (!texto.startsWith("/") || texto.startsWith("//")) return false;
  if (COM_PREFIXO_V1.test(texto)) return false;
  return !RAIZ_COMUM.some((r) => r.test(texto));
}

/**
 * Os literais de código (texto, template e atributo JSX) que são caminho de
 * tela sem `/v1`, com a linha. Um template conta pelo começo
 * (`` `/colecoes/${id}` ``), que é o que decide para onde o link vai.
 *
 * Ficam de fora:
 * - comentários e especificadores de import, que não são link;
 * - literais de tipo (`PageProps<"/v1/colecoes/nova">`): a rota tipada é
 *   conferida pelo `typecheck`, que falha se ela não existir;
 * - o template que começa por `/` seguido direto de uma substituição
 *   (`` `/${total}` ``) **fora de posição de navegação**: é a numeração
 *   "n/total" das cartas, num texto de tela. Em posição de navegação (ver
 *   `emPosicaoDeNavegacao`) ele conta, porque `` `/${secao}/planos` `` sai da
 *   v1 tanto quanto `"/dex/planos"`.
 */
export function literaisDeTelaSemV1(fonte: string): { linha: number; texto: string }[] {
  const sf = ts.createSourceFile("arquivo.tsx", fonte, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const achados: { linha: number; texto: string }[] = [];
  const conferir = (no: ts.Node, texto: string) => {
    if (ehCaminhoDeTelaSemV1(texto)) {
      achados.push({ linha: sf.getLineAndCharacterOfPosition(no.getStart(sf)).line + 1, texto });
    }
  };
  const visitar = (no: ts.Node): void => {
    if (ts.isImportDeclaration(no) || ts.isExportDeclaration(no) || ts.isLiteralTypeNode(no)) return;
    if (ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no)) conferir(no, no.text);
    else if (ts.isTemplateExpression(no) && (no.head.text !== "/" || emPosicaoDeNavegacao(no))) {
      conferir(no, no.head.text);
    }
    ts.forEachChild(no, visitar);
  };
  visitar(sf);
  return achados;
}

/* Atributos, propriedades e chamadas cujo valor é para onde a tela vai. */
const ATRIBUTOS_DE_NAVEGACAO = new Set(["href", "action", "formAction"]);
const PROPRIEDADES_DE_NAVEGACAO = new Set(["href", "pathname", "url", "volta"]);
const CHAMADAS_DE_NAVEGACAO = new Set(["push", "replace", "prefetch", "assign", "redirect", "permanentRedirect"]);

/**
 * Se o valor de `no` acaba sendo um destino de navegação: o `href` de um
 * elemento ou do `Link`, o `pathname`/`href` de um objeto (o `Link` aceita
 * `{ pathname }`), ou o argumento de `router.push`/`replace`/`prefetch`,
 * `redirect`, `location.assign`/`replace`. Sobe por parênteses, ternário,
 * `+`, `??`, `||` e `as`, que não mudam para onde o valor vai.
 */
export function emPosicaoDeNavegacao(no: ts.Node): boolean {
  let atual = no;
  let pai = no.parent;
  while (
    pai &&
    (ts.isParenthesizedExpression(pai) ||
      ts.isAsExpression(pai) ||
      ts.isSatisfiesExpression(pai) ||
      ts.isNonNullExpression(pai) ||
      (ts.isConditionalExpression(pai) && pai.condition !== atual) ||
      (ts.isBinaryExpression(pai) &&
        [ts.SyntaxKind.PlusToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(
          pai.operatorToken.kind,
        )) ||
      ts.isJsxExpression(pai))
  ) {
    atual = pai;
    pai = pai.parent;
  }
  if (!pai) return false;
  if (ts.isJsxAttribute(pai)) return ATRIBUTOS_DE_NAVEGACAO.has(pai.name.getText());
  if (ts.isPropertyAssignment(pai) && pai.initializer === atual) {
    return PROPRIEDADES_DE_NAVEGACAO.has(pai.name.getText().replace(/^["']|["']$/g, ""));
  }
  if (ts.isCallExpression(pai) && pai.arguments[0] === atual) {
    const f = pai.expression;
    const nome = ts.isIdentifier(f) ? f.text : ts.isPropertyAccessExpression(f) ? f.name.text : null;
    return nome !== null && CHAMADAS_DE_NAVEGACAO.has(nome);
  }
  return false;
}
