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
 *  - **A origem é um jogo do catálogo ou o próprio HOME** (`ORIGEM_HOME`:
 *    presente, GTS, Caixa Surpresa). O cadastro com o HOME como "jogo"
 *    grava origem e local `home`; daí em diante ele é um Pokémon de fora
 *    como outro qualquer, e as regras acima já o barram dos jogos `so_envio`
 *    e do Let's Go.
 *  - **O que o HOME não recebe de um jogo não sai dele** (Spinda do GO e do
 *    BDSP, Zygarde do GO… — `dex-disponibilidade.ts`). Nem para outro jogo,
 *    porque todo caminho entre jogos passa pelo HOME.
 */
import { ehOrigemDex, jogoDex, LOCAL_HOME } from "./dex-jogos";
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
  /** `jogo:forma` que o HOME não recebe daquele jogo (`naoTransferiveis()`). */
  naoTransferiveis: ReadonlySet<string>;
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
  if (!ehOrigemDex(dados.jogoOrigem)) {
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
  formaId: string;
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

  if (ctx.naoTransferiveis.has(`${m.localAtual}:${m.formaId}`)) {
    return recusa("dexNaoTransferivel", { jogo: nomeDoJogo(m.localAtual) });
  }

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

/** Teto por linha do cadastro por jogo: digitar 999 por engano não cria 999 registros. */
export const MAX_QUANTIDADE_POR_LINHA = 99;

export interface LoteCadastroDex {
  jogoId: string;
  itens: { formaId: string; normal: number; shiny: number }[];
}

/** Lê o corpo do cadastro por jogo; devolve a frase do problema ou o lote. */
export function lerLoteCadastro(corpo: unknown): LoteCadastroDex | string {
  if (typeof corpo !== "object" || corpo === null) return "Corpo inválido (objeto esperado).";
  const c = corpo as { jogoId?: unknown; itens?: unknown };
  if (typeof c.jogoId !== "string" || c.jogoId === "") return "jogoId ausente ou vazio.";
  if (!Array.isArray(c.itens) || c.itens.length === 0) return "itens ausente ou vazio.";
  const itens: LoteCadastroDex["itens"] = [];
  for (const item of c.itens) {
    const i = item as { formaId?: unknown; normal?: unknown; shiny?: unknown };
    const qtd = (v: unknown) => (v === undefined ? 0 : v);
    const normal = qtd(i?.normal);
    const shiny = qtd(i?.shiny);
    if (typeof i?.formaId !== "string" || i.formaId === "") return "item sem formaId.";
    for (const q of [normal, shiny]) {
      if (typeof q !== "number" || !Number.isInteger(q) || q < 0 || q > MAX_QUANTIDADE_POR_LINHA) {
        return `quantidade inválida em ${i.formaId} (inteiro de 0 a ${MAX_QUANTIDADE_POR_LINHA}).`;
      }
    }
    itens.push({ formaId: i.formaId, normal: normal as number, shiny: shiny as number });
  }
  return { jogoId: c.jogoId, itens };
}

/**
 * Expande o lote em um registro por Pokémon, todos nascidos no jogo e
 * ainda nele — ou, com `jogoId` igual a `ORIGEM_HOME`, nascidos no HOME e
 * já guardados lá. As recusas vêm juntas; com qualquer uma, nada é gravado.
 */
export function expandirLoteCadastro(
  lote: LoteCadastroDex,
  ctx: ContextoRegistroDex,
): { ok: true; registros: DadosRegistroDex[] } | { ok: false; recusas: Recusa[] } {
  const registros: DadosRegistroDex[] = [];
  const recusas: Recusa[] = [];
  const vistas = new Set<string>();
  for (const item of lote.itens) {
    for (const [shiny, quantidade] of [
      [false, item.normal],
      [true, item.shiny],
    ] as const) {
      if (quantidade === 0) continue;
      const dados: DadosRegistroDex = {
        formaId: item.formaId,
        shiny,
        jogoOrigem: lote.jogoId,
        local: lote.jogoId,
        capturadoEm: null,
        notas: null,
      };
      for (const r of validarNovoRegistro(dados, ctx)) {
        const k = JSON.stringify(r);
        if (!vistas.has(k)) recusas.push(r);
        vistas.add(k);
      }
      for (let i = 0; i < quantidade; i++) registros.push(dados);
    }
  }
  if (recusas.length > 0) return { ok: false, recusas };
  return { ok: true, registros };
}

/**
 * Valida o envio de vários registros de uma vez ("enviar todas deste jogo").
 * Recusa de verdade vem primeiro; só depois o pedido de confirmação, uma vez
 * só para o lote inteiro.
 */
export function validarMovimentoEmLote(movimentos: readonly MovimentoDex[], ctx: ContextoRegistroDex): Recusa | null {
  let confirmacao: Recusa | null = null;
  for (const m of movimentos) {
    const r = validarMovimento(m, ctx);
    if (!r) continue;
    if (!ehPedidoDeConfirmacao(r)) return r;
    confirmacao ??= r;
  }
  return confirmacao;
}
