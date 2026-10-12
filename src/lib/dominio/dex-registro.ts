/**
 * Living Dex — regras de um registro (um Pokémon que o usuário tem) e de
 * movê-lo entre jogos e o HOME. Módulo puro: recebe o que precisa saber do
 * banco e devolve recusas, nunca grava.
 *
 * O sistema registra o que o usuário fez no jogo; ele não fala com o HOME,
 * que não tem API. As regras daqui existem para o registro não descrever
 * algo que o HOME não deixa acontecer:
 *
 *  - **Nada entra num jogo `so_envio`.** GO e FireRed/LeafGreen só mandam
 *    para o HOME. Um registro pode estar num deles só se veio dele e nunca
 *    saiu — por isso o local `so_envio` só é aceito igual à origem, e só na
 *    criação.
 *  - **Sair de um jogo `so_envio` pede confirmação** (regra 7 da spec), dita
 *    como tal na recusa: o Pokémon não volta.
 *  - **Let's Go só recebe Pokémon de Let's Go.** A página do HOME diz que,
 *    movido para outro jogo, ele "cannot be returned to its original game".
 *    O caso completo (Pokémon de Let's Go que já passou por outro jogo e não
 *    pode mais voltar) exigiria o histórico de movimentos, que o registro
 *    não guarda; a regra aqui cobre o caso comum e erra para o lado
 *    permissivo no resto.
 *  - **O local é o HOME ou um jogo que o usuário tem, ativo.**
 */
import { jogoDex, LOCAL_HOME } from "./dex-jogos";
import { recusa, type Recusa } from "./recusa";

export interface DadosRegistroDex {
  formaId: string;
  shiny: boolean;
  jogoOrigem: string;
  local: string;
  /** `YYYY-MM-DD` ou nulo. */
  capturadoEm: string | null;
  notas: string | null;
}

export interface ContextoRegistroDex {
  /** Vagas ativas do catálogo. */
  formasAtivas: ReadonlySet<string>;
  /** Jogos do catálogo que o usuário tem, ativos. */
  jogosAtivos: ReadonlySet<string>;
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function dataValida(texto: string): boolean {
  if (!DATA_ISO.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

function nomeDoJogo(id: string): string {
  return jogoDex(id)?.nome ?? id;
}

/**
 * O local de destino pode receber um registro vindo de `jogoOrigem`?
 *
 * `naCriacao` é a única porta para um jogo `so_envio`: o Pokémon nasceu lá.
 * Num movimento, nenhum jogo `so_envio` recebe nada — nem o de origem, porque
 * de volta do HOME ele não entra.
 */
function recusaDoDestino(
  local: string,
  jogoOrigem: string,
  ctx: ContextoRegistroDex,
  naCriacao: boolean,
): Recusa | null {
  if (local === LOCAL_HOME) return null;
  const jogo = jogoDex(local);
  if (!jogo) return recusa("dexJogoDesconhecido", { jogo: local });
  if (!ctx.jogosAtivos.has(local)) return recusa("dexLocalNaoPossuido", { jogo: jogo.nome });
  if (jogo.conexaoHome === "so_envio" && !(naCriacao && local === jogoOrigem)) {
    return recusa("dexNadaEntraEmSoEnvio", { jogo: jogo.nome });
  }
  if (local.startsWith("lets-go-") && !jogoOrigem.startsWith("lets-go-")) {
    return recusa("dexLetsGoSoDoProprio", { jogo: jogo.nome });
  }
  return null;
}

/** Todas as recusas de um registro novo, juntas (validação de formulário). */
export function validarNovoRegistro(dados: DadosRegistroDex, ctx: ContextoRegistroDex): Recusa[] {
  const recusas: Recusa[] = [];
  if (!ctx.formasAtivas.has(dados.formaId)) recusas.push(recusa("dexFormaDesconhecida", { forma: dados.formaId }));
  if (!jogoDex(dados.jogoOrigem)) {
    recusas.push(recusa("dexJogoDesconhecido", { jogo: dados.jogoOrigem }));
  } else {
    const destino = recusaDoDestino(dados.local, dados.jogoOrigem, ctx, true);
    if (destino) recusas.push(destino);
  }
  if (dados.capturadoEm !== null && !dataValida(dados.capturadoEm)) {
    recusas.push(recusa("dexDataInvalida", { data: dados.capturadoEm }));
  }
  return recusas;
}

export interface MovimentoDex {
  jogoOrigem: string;
  localAtual: string;
  novoLocal: string;
  /** O usuário já confirmou que o Pokémon não volta. */
  confirmarSemVolta: boolean;
}

/**
 * Pode mover? `null` = pode. A recusa `dexConfirmarSemVolta` não é um "não":
 * é o pedido de confirmação, e a tela reenvia com `confirmarSemVolta`.
 */
export function validarMovimento(m: MovimentoDex, ctx: ContextoRegistroDex): Recusa | null {
  if (m.novoLocal === m.localAtual) return null;

  const atual = jogoDex(m.localAtual);
  if (atual?.conexaoHome === "so_envio") {
    // Destino inválido recusa antes de pedir confirmação: não faz sentido
    // confirmar um movimento que depois seria negado.
    const destino = recusaDoDestino(m.novoLocal, m.jogoOrigem, ctx, false);
    if (destino) return destino;
    if (!m.confirmarSemVolta) return recusa("dexConfirmarSemVolta", { jogo: nomeDoJogo(m.localAtual) });
    return null;
  }

  return recusaDoDestino(m.novoLocal, m.jogoOrigem, ctx, false);
}

export function ehPedidoDeConfirmacao(r: Recusa | null): boolean {
  return r?.chave === "dexConfirmarSemVolta";
}

/**
 * Lê um registro do corpo de uma requisição. Devolve a frase do problema
 * (em português, como as outras guardas de corpo malformado: a tela não
 * alcança esse caminho, ver `recusa.ts`) ou os dados normalizados — texto
 * vazio vira nulo, notas sem espaço nas pontas.
 */
export function lerDadosRegistro(corpo: unknown): DadosRegistroDex | string {
  if (typeof corpo !== "object" || corpo === null) return "Corpo inválido (objeto esperado).";
  const c = corpo as Record<string, unknown>;
  for (const campo of ["formaId", "jogoOrigem", "local"] as const) {
    if (typeof c[campo] !== "string" || c[campo] === "") return `${campo} ausente ou vazio.`;
  }
  if (typeof c.shiny !== "boolean") return "shiny inválido (esperado boolean).";
  const opcional = (v: unknown): string | null | undefined => {
    if (v === undefined || v === null) return null;
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    return t === "" ? null : t;
  };
  const capturadoEm = opcional(c.capturadoEm);
  const notas = opcional(c.notas);
  if (capturadoEm === undefined) return "capturadoEm inválido (esperado texto YYYY-MM-DD).";
  if (notas === undefined) return "notas inválidas (esperado texto).";
  return {
    formaId: c.formaId as string,
    shiny: c.shiny,
    jogoOrigem: c.jogoOrigem as string,
    local: c.local as string,
    capturadoEm,
    notas,
  };
}
