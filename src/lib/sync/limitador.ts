/**
 * Limitador de taxa de saída — teto global de requisições por segundo contra
 * a TCGdex, independente de quantas tarefas estejam em paralelo.
 *
 * Por que existe: concorrência sozinha não limita taxa. Com 40 tarefas em
 * paralelo e resposta de ~100 ms, o sync disparava ~400 req/s em rajada; foi
 * o que nos rendeu o bloqueio de IP de 2026-08-25 (ver
 * `lib/dominio/bloqueio-upstream.ts`). Concorrência limita quantas estão *em
 * voo*; só um limitador limita quantas *começam por segundo*.
 *
 * Implementação deliberadamente simples: serializa a *largada* das
 * requisições, garantindo um intervalo mínimo entre duas partidas
 * consecutivas. Sem bucket, sem rajada acumulada — a rajada é exatamente o
 * que precisamos não ter.
 *
 * `agora` e `dormir` são injetáveis para o teste rodar sem relógio real.
 */
export interface OpcoesLimitador {
  /**
   * Teto de requisições por segundo.
   *
   * Aceita função para o caso em que o teto **muda enquanto o cliente roda**:
   * o coletor da LigaPokemon lê o `Crawl-delay` do `robots.txt` deles ao vivo
   * (`lib/liga/ritmo.ts`), e um aperto publicado no meio de uma varredura de
   * 16 horas precisa valer da requisição seguinte em diante. Recriar o
   * limitador com a taxa nova não serviria: zeraria a próxima largada e
   * liberaria uma rajada justamente na hora de ir mais devagar.
   */
  porSegundo: number | (() => number);
  agora?: () => number;
  dormir?: (ms: number) => Promise<void>;
}

export interface Limitador {
  /** Resolve quando é permitido disparar a próxima requisição. */
  aguardarVez(): Promise<void>;
}

export function criarLimitador({
  porSegundo,
  agora = () => Date.now(),
  dormir = (ms) => new Promise((r) => setTimeout(r, ms)),
}: OpcoesLimitador): Limitador {
  const taxa = typeof porSegundo === "function" ? porSegundo : () => porSegundo;

  function intervaloMs(): number {
    const valor = taxa();
    if (!Number.isFinite(valor) || valor <= 0) {
      throw new Error(`Taxa inválida para o limitador: ${valor}`);
    }
    return 1000 / valor;
  }

  // Taxa fixa é validada na criação, e não só no primeiro uso: configuração
  // errada tem que estourar onde foi escrita.
  if (typeof porSegundo === "number") intervaloMs();
  // Instante em que a próxima requisição pode partir. Fica no passado
  // enquanto o sync está ocioso, o que faz a primeira requisição sair na hora.
  let proximaLargada = 0;
  // Cadeia de espera: cada chamada se encaixa atrás da anterior. É o que
  // mantém o teto válido mesmo com N tarefas concorrentes chamando junto.
  let fila: Promise<void> = Promise.resolve();

  async function aguardarVez(): Promise<void> {
    const minhaVez = fila.then(async () => {
      const instante = agora();
      const largada = Math.max(instante, proximaLargada);
      proximaLargada = largada + intervaloMs();
      const espera = largada - instante;
      if (espera > 0) await dormir(espera);
    });
    // A fila avança mesmo se alguém no meio rejeitar — senão um erro
    // travaria o limitador para sempre.
    fila = minhaVez.catch(() => {});
    return minhaVez;
  }

  return { aguardarVez };
}
