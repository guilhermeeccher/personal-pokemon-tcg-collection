/**
 * Análise estática da cobertura do acesso por senha: dado o texto de um
 * arquivo de `src/app`, diz o que falta para ele estar protegido. Quem
 * percorre o disco e aplica isto a todos os arquivos é
 * `cobertura-estatica.test.ts`.
 *
 * Lê a AST com o compilador do TypeScript, nunca regex sobre o texto: uma
 * regex aceitaria a chamada dentro de um comentário, de uma string ou de um
 * ramo morto, e é justamente o tipo de proteção que "parece" estar lá.
 *
 * Cada função devolve a lista de problemas em português, vazia quando o
 * arquivo está em ordem. São puras (recebem texto, não tocam o disco) para
 * o teste provar com fontes de exemplo que cada violação é pega.
 *
 * Só o teste importa este módulo (o compilador do TypeScript é dependência
 * de desenvolvimento): nada daqui entra no app.
 */
import ts from "typescript";

/** Métodos HTTP que o Next reconhece como export de um `route.ts`. */
export const METODOS_HTTP = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;
const METODOS: ReadonlySet<string> = new Set(METODOS_HTTP);

function analisar(fonte: string, nomeArquivo = "arquivo.tsx"): ts.SourceFile {
  return ts.createSourceFile(nomeArquivo, fonte, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function temExport(no: ts.Node): boolean {
  return ts.canHaveModifiers(no) && (ts.getModifiers(no) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

function temDefault(no: ts.Node): boolean {
  return ts.canHaveModifiers(no) && (ts.getModifiers(no) ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
}

/** As diretivas do topo (`"use client"`, `"use server"`): as instruções que
 *  são só uma string, antes de qualquer outra. */
function diretivas(sf: ts.SourceFile): string[] {
  const achadas: string[] = [];
  for (const st of sf.statements) {
    if (ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression)) achadas.push(st.expression.text);
    else break;
  }
  return achadas;
}

/** `await nome();` — e só isso, sem argumento. */
function ehChamadaAguardada(st: ts.Statement | undefined, nome: string): boolean {
  if (!st || !ts.isExpressionStatement(st)) return false;
  const e = st.expression;
  if (!ts.isAwaitExpression(e) || !ts.isCallExpression(e.expression)) return false;
  const chamada = e.expression;
  return ts.isIdentifier(chamada.expression) && chamada.expression.text === nome && chamada.arguments.length === 0;
}

type Corpo = ts.Block | undefined;
type FuncaoComCorpo = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;

function corpoDe(f: FuncaoComCorpo): Corpo {
  return f.body && ts.isBlock(f.body) ? f.body : undefined;
}

/** A função por trás de `const x = async () => ...` / `function () {}`. */
function funcaoDoInicializador(init: ts.Expression | undefined): FuncaoComCorpo | undefined {
  if (!init) return undefined;
  let e = init;
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e)) e = e.expression;
  return ts.isArrowFunction(e) || ts.isFunctionExpression(e) ? e : undefined;
}

/**
 * A guarda só conta se o identificador chamado for o import nomeado de
 * `@/lib/acesso`, sem sombreamento. Conferir só o nome aceitaria uma função
 * local vazia chamada `exigirSessao`, um `import { exigirSessao } from
 * "./falso"` ou um parâmetro com esse nome — todos "protegem" no texto e em
 * nada na prática. Sem análise de escopo (seria um compilador inteiro): vale
 * a regra mais dura, que é não existir **nenhuma outra declaração** com esse
 * nome em lugar nenhum do arquivo. Um falso positivo aqui custa renomear uma
 * variável; um falso negativo deixa uma rota aberta.
 */
function guardaVemDoAcesso(sf: ts.SourceFile, nome: string): boolean {
  if (!importaDoAcesso(sf, nome)) return false;
  let declaracoes = 0;
  const visitar = (no: ts.Node): void => {
    if (ts.isIdentifier(no) && no.text === nome) {
      const pai = no.parent;
      const declara =
        ((ts.isVariableDeclaration(pai) ||
          ts.isParameter(pai) ||
          ts.isFunctionDeclaration(pai) ||
          ts.isFunctionExpression(pai) ||
          ts.isClassDeclaration(pai) ||
          ts.isClassExpression(pai) ||
          ts.isEnumDeclaration(pai) ||
          ts.isBindingElement(pai) ||
          ts.isImportClause(pai) ||
          ts.isNamespaceImport(pai) ||
          ts.isImportEqualsDeclaration(pai)) &&
          pai.name === no) ||
        (ts.isImportSpecifier(pai) && pai.name === no);
      if (declara) declaracoes++;
    }
    ts.forEachChild(no, visitar);
  };
  visitar(sf);
  return declaracoes === 1; // só o import de `@/lib/acesso`
}

function primeiraInstrucaoOk(sf: ts.SourceFile, corpo: Corpo, chamada: string): boolean {
  return guardaVemDoAcesso(sf, chamada) && ehChamadaAguardada(corpo?.statements[0], chamada);
}

/** Importa `nome` de `@/lib/acesso`? Evita que um `comAcesso` local, que não
 *  protege nada, passe pelo verificador. */
function importaDoAcesso(sf: ts.SourceFile, nome: string): boolean {
  return sf.statements.some(
    (st) =>
      ts.isImportDeclaration(st) &&
      ts.isStringLiteral(st.moduleSpecifier) &&
      st.moduleSpecifier.text === "@/lib/acesso" &&
      !st.importClause?.isTypeOnly &&
      st.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(st.importClause.namedBindings) &&
      st.importClause.namedBindings.elements.some(
        (el) => !el.isTypeOnly && el.name.text === nome && (el.propertyName ?? el.name).text === nome,
      ),
  );
}

/* ---------- 1. route handlers ---------- */

/** Os métodos HTTP que o arquivo exporta, de qualquer forma (declaração,
 *  `const`, `export { x as GET }`). Serve à lista fixa dos `GET`. */
export function metodosExportados(fonte: string): string[] {
  const sf = analisar(fonte, "route.ts");
  const achados = new Set<string>();
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && temExport(st) && st.name && METODOS.has(st.name.text)) achados.add(st.name.text);
    else if (ts.isVariableStatement(st) && temExport(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && METODOS.has(d.name.text)) achados.add(d.name.text);
      }
    } else if (ts.isExportDeclaration(st) && st.exportClause && ts.isNamedExports(st.exportClause)) {
      for (const el of st.exportClause.elements) if (METODOS.has(el.name.text)) achados.add(el.name.text);
    }
  }
  return [...achados];
}

/**
 * Todo export de método HTTP tem de ser `export const X = comAcesso(...)` —
 * ou `rotaDoModulo(...)`, só nos arquivos do próprio módulo
 * (`permiteRotaDoModulo`). Qualquer outra forma é recusada: `export function`
 * é o jeito natural de esquecer o envoltório, e `export { y as GET }` ou
 * `export default` escondem o handler do verificador.
 */
export function problemasDeRouteHandler(fonte: string, permiteRotaDoModulo: boolean): string[] {
  const sf = analisar(fonte, "route.ts");
  const problemas: string[] = [];
  const aceitos = permiteRotaDoModulo ? ["comAcesso", "rotaDoModulo"] : ["comAcesso"];

  for (const st of sf.statements) {
    if (ts.isExportAssignment(st)) {
      problemas.push("`export default` num route.ts: o handler precisa ser um método HTTP nomeado, dentro de comAcesso");
    } else if (ts.isFunctionDeclaration(st) && temExport(st)) {
      if (temDefault(st)) problemas.push("`export default function` num route.ts: o handler precisa ser um método HTTP nomeado, dentro de comAcesso");
      else if (st.name && METODOS.has(st.name.text)) {
        problemas.push(`${st.name.text}: \`export function\` sem envoltório (use \`export const ${st.name.text} = comAcesso(...)\`)`);
      }
    } else if (ts.isExportDeclaration(st)) {
      if (!st.exportClause) problemas.push("`export * from`: pode reexportar um método HTTP sem envoltório");
      else if (ts.isNamedExports(st.exportClause)) {
        for (const el of st.exportClause.elements) {
          if (METODOS.has(el.name.text)) problemas.push(`${el.name.text}: reexportado por \`export { ... }\`, fora do verificador`);
        }
      }
    } else if (ts.isVariableStatement(st) && temExport(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) {
          // `export const { GET } = ...` e afins: nome não rastreável.
          problemas.push("export desestruturado num route.ts: não dá para conferir o envoltório");
          continue;
        }
        const nome = d.name.text;
        if (!METODOS.has(nome)) continue;
        let init = d.initializer;
        while (init && (ts.isParenthesizedExpression(init) || ts.isAsExpression(init) || ts.isSatisfiesExpression(init))) init = init.expression;
        const envoltorio =
          init && ts.isCallExpression(init) && ts.isIdentifier(init.expression) ? init.expression.text : undefined;
        if (envoltorio === "rotaDoModulo" && !permiteRotaDoModulo) {
          problemas.push(`${nome}: \`rotaDoModulo\` só vale nos arquivos de CAMINHOS_ROTAS_DO_MODULO`);
        } else if (!envoltorio || !aceitos.includes(envoltorio) || !init || !ts.isCallExpression(init) || init.arguments.length !== 1) {
          problemas.push(`${nome}: tem de ser \`export const ${nome} = ${aceitos.join(" ou ")}(handler)\``);
        } else if (!importaDoAcesso(sf, envoltorio)) {
          problemas.push(`${nome}: \`${envoltorio}\` não vem de "@/lib/acesso"`);
        }
      }
    }
  }
  return problemas;
}

/* ---------- 2. páginas ---------- */

const GUARDA_PAGINA = "exigirSessao";

/**
 * Página: sem `"use client"` (a guarda precisa rodar no servidor), default
 * export que é uma função cuja primeira instrução é `await exigirSessao();`,
 * e o mesmo para `generateMetadata`/`generateViewport`, que o Next chama
 * em paralelo com a página e sem passar por ela.
 */
export function problemasDePagina(fonte: string): string[] {
  const sf = analisar(fonte, "page.tsx");
  const problemas: string[] = [];
  if (diretivas(sf).includes("use client")) problemas.push('a página tem "use client": a guarda não roda no servidor');

  let achouDefault = false;
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && temExport(st) && temDefault(st)) {
      achouDefault = true;
      if (!primeiraInstrucaoOk(sf, st.body, GUARDA_PAGINA)) {
        problemas.push("o default export não começa por `await exigirSessao();`");
      }
    } else if (ts.isExportAssignment(st)) {
      achouDefault = true;
      problemas.push("o default export tem de ser uma declaração de função (`export default async function`)");
    } else if (ts.isFunctionDeclaration(st) && temExport(st) && st.name && (st.name.text === "generateMetadata" || st.name.text === "generateViewport")) {
      if (!primeiraInstrucaoOk(sf, st.body, GUARDA_PAGINA)) {
        problemas.push(`${st.name.text} não começa por \`await exigirSessao();\``);
      }
    } else if (ts.isVariableStatement(st) && temExport(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        if (d.name.text !== "generateMetadata" && d.name.text !== "generateViewport") continue;
        const f = funcaoDoInicializador(d.initializer);
        if (!f || !primeiraInstrucaoOk(sf, corpoDe(f), GUARDA_PAGINA)) {
          problemas.push(`${d.name.text} não começa por \`await exigirSessao();\``);
        }
      }
    } else if (ts.isExportDeclaration(st) && st.exportClause && ts.isNamedExports(st.exportClause)) {
      for (const el of st.exportClause.elements) {
        if (["default", "generateMetadata", "generateViewport"].includes(el.name.text)) {
          problemas.push(`${el.name.text}: reexportado por \`export { ... }\`, fora do verificador`);
          if (el.name.text === "default") achouDefault = true;
        }
      }
    }
  }
  if (!achouDefault) problemas.push("sem default export");
  return problemas;
}

/* ---------- 3. server actions ---------- */

export function ehArquivoDeAcao(fonte: string): boolean {
  return diretivas(analisar(fonte)).includes("use server");
}

/** Cada função exportada de um arquivo `"use server"` começa por
 *  `await exigirSessaoNaAcao();` (sessão **e** origem: `exigirSessao` sozinho
 *  não serve numa action). Export que não seja função declarada ali é
 *  recusado, porque não dá para conferi-lo. */
export function problemasDeAcao(fonte: string): string[] {
  const sf = analisar(fonte);
  const problemas: string[] = [];
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && temExport(st)) {
      const nome = st.name?.text ?? "default";
      if (!primeiraInstrucaoOk(sf, st.body, "exigirSessaoNaAcao")) {
        problemas.push(`${nome}: a action não começa por \`await exigirSessaoNaAcao();\``);
      }
    } else if (ts.isVariableStatement(st) && temExport(st)) {
      for (const d of st.declarationList.declarations) {
        const nome = ts.isIdentifier(d.name) ? d.name.text : "(desestruturado)";
        const f = funcaoDoInicializador(d.initializer);
        if (!f || !primeiraInstrucaoOk(sf, corpoDe(f), "exigirSessaoNaAcao")) {
          problemas.push(`${nome}: a action não começa por \`await exigirSessaoNaAcao();\``);
        }
      }
    } else if (ts.isExportAssignment(st)) {
      problemas.push("`export default` de expressão num arquivo de actions: não dá para conferir a guarda");
    } else if (ts.isExportDeclaration(st) && !st.isTypeOnly) {
      problemas.push("`export { ... }`/`export *` num arquivo de actions: não dá para conferir a guarda");
    }
  }
  return problemas;
}

/* ---------- 4. arquivos especiais não tocam o banco ---------- */

/** Os especificadores de módulo que o arquivo carrega: `import`,
 *  `export ... from`, `import("...")` e `require("...")`. */
export function especificadoresDeImportacao(fonte: string): string[] {
  const sf = analisar(fonte);
  const achados: string[] = [];
  const visitar = (no: ts.Node): void => {
    if (ts.isImportDeclaration(no) && ts.isStringLiteral(no.moduleSpecifier)) achados.push(no.moduleSpecifier.text);
    else if (ts.isExportDeclaration(no) && no.moduleSpecifier && ts.isStringLiteral(no.moduleSpecifier)) {
      achados.push(no.moduleSpecifier.text);
    } else if (ts.isCallExpression(no) && no.arguments.length >= 1 && ts.isStringLiteralLike(no.arguments[0])) {
      const f = no.expression;
      if (f.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(f) && f.text === "require")) {
        achados.push(no.arguments[0].text);
      }
    }
    ts.forEachChild(no, visitar);
  };
  visitar(sf);
  return achados;
}

/**
 * O caminho (relativo à raiz do repositório, sem extensão) a que um
 * especificador aponta, ou `null` para pacote de `node_modules` — que não
 * entra no grafo. `@/x` é `src/x`; relativo resolve a partir do importador.
 */
export function resolverBase(especificador: string, importador: string): string | null {
  let bruto: string;
  if (especificador.startsWith("@/")) bruto = `src/${especificador.slice(2)}`;
  else if (especificador.startsWith("./") || especificador.startsWith("../")) {
    const pasta = importador.split("/").slice(0, -1);
    bruto = [...pasta, especificador].join("/");
  } else return null;

  const partes: string[] = [];
  for (const p of bruto.split("/")) {
    if (p === "" || p === ".") continue;
    if (p === "..") partes.pop();
    else partes.push(p);
  }
  return partes.join("/").replace(/\.(tsx?|jsx?)$/, "");
}

export function ehBanco(base: string): boolean {
  return base === "src/lib/db" || base.startsWith("src/lib/db/");
}

/**
 * Se `arquivo` chega a `@/lib/db` — direta ou indiretamente —, devolve a
 * cadeia de importações até lá; senão `null`. `ler` devolve o texto de um
 * caminho (relativo à raiz, com extensão) ou `undefined` se não existe.
 */
export function cadeiaAteOBanco(
  arquivo: string,
  ler: (caminho: string) => string | undefined,
): string[] | null {
  const visitados = new Set<string>();
  const pilha: { caminho: string; cadeia: string[] }[] = [{ caminho: arquivo, cadeia: [arquivo] }];

  while (pilha.length > 0) {
    const { caminho, cadeia } = pilha.pop()!;
    if (visitados.has(caminho)) continue;
    visitados.add(caminho);
    const fonte = ler(caminho);
    if (fonte === undefined) continue;

    for (const esp of especificadoresDeImportacao(fonte)) {
      const base = resolverBase(esp, caminho);
      if (base === null) continue;
      if (ehBanco(base)) return [...cadeia, base];
      const candidatos = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`];
      const achado = candidatos.find((c) => ler(c) !== undefined);
      if (achado) pilha.push({ caminho: achado, cadeia: [...cadeia, achado] });
    }
  }
  return null;
}

/* ---------- 5. server functions dentro de função ---------- */

export const MENSAGEM_USE_SERVER_INTERNO =
  'função com "use server" dentro dela: server action só vale em arquivo com "use server" no topo, ' +
  "onde o teste confere a guarda `await exigirSessaoNaAcao();`. Mova a action para um arquivo próprio";

/**
 * Uma função com a diretiva `"use server"` no corpo é uma server function
 * declarada dentro de outro arquivo (inclusive de uma página protegida):
 * proteger a renderização da página não autentica a execução posterior da
 * action, que é um endpoint próprio. Em vez de validar essas, a regra do
 * projeto é proibi-las: o teste só confere actions de arquivo `"use server"`.
 */
export function problemasDeUseServerInterno(fonte: string): string[] {
  const sf = analisar(fonte);
  const problemas: string[] = [];
  const visitar = (no: ts.Node): void => {
    if (
      (ts.isFunctionDeclaration(no) ||
        ts.isFunctionExpression(no) ||
        ts.isArrowFunction(no) ||
        ts.isMethodDeclaration(no)) &&
      no.body &&
      ts.isBlock(no.body)
    ) {
      for (const st of no.body.statements) {
        if (!(ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression))) break;
        if (st.expression.text === "use server") {
          problemas.push(MENSAGEM_USE_SERVER_INTERNO);
          break;
        }
      }
    }
    ts.forEachChild(no, visitar);
  };
  visitar(sf);
  return problemas;
}
