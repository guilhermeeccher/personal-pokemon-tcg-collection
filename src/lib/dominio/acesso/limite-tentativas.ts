/**
 * Limite de tentativas do login (`POST /api/sessao`), em memória.
 *
 * Em memória porque o app é um processo só; reiniciar o container zera os
 * contadores, e isso é aceito. Três travas:
 *
 * 1. **Por IP**: 5 erros em 15 minutos bloqueiam aquele IP por 15 minutos.
 *    A tentativa é **reservada antes** de verificar a senha, de forma
 *    síncrona — conta como erro desde a reserva, e só uma verificação certa
 *    a desfaz. Sem isso, dez requisições simultâneas passariam todas pela
 *    conferência do contador antes de a primeira terminar o scrypt.
 * 2. **Concorrência**: no máximo 2 verificações ao mesmo tempo no servidor
 *    inteiro. A terceira é recusada na hora (o 429 de quem chama), sem
 *    consumir tentativa do IP: quem esperou a vez não deve ser punido.
 *    O scrypt usa 32 MiB e ~100 ms de CPU; sem esse teto, uma rajada de
 *    logins vira negação de serviço do app inteiro. A vaga só é devolvida
 *    quando a verificação **termina de fato** — nunca por prazo: uma vaga
 *    que vencesse por tempo deixaria entrar um terceiro scrypt justamente
 *    quando o servidor está lento, que é quando o teto mais importa.
 * 3. **Teto do mapa**: no máximo 10 mil IPs lembrados; passando disso,
 *    descartam-se os usados há mais tempo, para uma rajada de IPs não
 *    crescer a memória sem fim.
 *
 * **Sem bloqueio global por contagem de erros, de propósito.** Ele seria a
 * forma mais simples de parar quem tenta de muitos IPs — e também deixaria
 * qualquer pessoa, de qualquer lugar, trancar o dono do lado de fora errando
 * a senha cinco vezes. Contra muitos IPs a proteção é a força da senha
 * (16+ caracteres aleatórios contra scrypt) somada à regra de limite do
 * proxy reverso na frente do app. Limitação deliberada.
 *
 * A interface pública é só `executar`: ela reserva, roda a verificação e
 * devolve a vaga num `finally`. Não existe "reservar" solto, porque um
 * chamador que esquecesse de concluir prenderia a vaga para sempre — com
 * duas assim, ninguém entraria até reiniciar.
 */

export type ResultadoTentativa = "ok" | "senha_invalida" | "bloqueado" | "concorrencia";

export interface LimiteTentativas {
  /**
   * Reserva (de forma síncrona, antes de qualquer `await`), roda
   * `verificar` e conclui. `verificar` não é chamada quando o IP está
   * bloqueado ou o teto de concorrência está cheio. Uma exceção de
   * `verificar` conta como erro do IP e é propagada.
   */
  executar(ip: string, verificar: () => Promise<boolean>): Promise<ResultadoTentativa>;
}

export interface OpcoesLimite {
  maxErros?: number;
  janelaMs?: number;
  bloqueioMs?: number;
  maxConcorrentes?: number;
  maxEntradas?: number;
  agora?: () => number;
}

interface Tentativa {
  em: number;
  /** `true` depois de uma verificação errada; antes disso, em andamento. */
  confirmada: boolean;
}

interface EstadoIp {
  tentativas: Tentativa[];
  bloqueadoAte: number;
}

const QUINZE_MINUTOS = 15 * 60 * 1000;

export function criarLimiteTentativas({
  maxErros = 5,
  janelaMs = QUINZE_MINUTOS,
  bloqueioMs = QUINZE_MINUTOS,
  maxConcorrentes = 2,
  maxEntradas = 10_000,
  agora = Date.now,
}: OpcoesLimite = {}): LimiteTentativas {
  // Map guarda ordem de inserção: o primeiro é o usado há mais tempo,
  // porque cada uso remove e reinsere a chave.
  const porIp = new Map<string, EstadoIp>();
  let emAndamento = 0;

  /* Só os erros confirmados saem da janela por tempo. Uma tentativa em
     andamento fica até a verificação acabar, por mais que demore: ela
     ainda ocupa a vaga e ainda pode virar erro. */
  function limpar(estado: EstadoIp, t: number): void {
    estado.tentativas = estado.tentativas.filter((x) => !x.confirmada || x.em > t - janelaMs);
  }

  function bloquearSePassou(estado: EstadoIp, t: number): void {
    if (estado.tentativas.filter((x) => x.confirmada).length >= maxErros) {
      estado.bloqueadoAte = t + bloqueioMs;
      /* O bloqueio "paga" os erros que o causaram: quando ele vence, o IP
         recomeça com as cinco tentativas, em vez de cair de novo no
         bloqueio pelos mesmos erros (o que aconteceria com janela maior
         que o bloqueio). Tentativas ainda em andamento ficam. */
      estado.tentativas = estado.tentativas.filter((x) => !x.confirmada);
    }
  }

  function tocar(ip: string, estado: EstadoIp): void {
    porIp.delete(ip);
    porIp.set(ip, estado);
    while (porIp.size > maxEntradas) {
      const maisAntigo = porIp.keys().next().value;
      if (maisAntigo === undefined) break;
      porIp.delete(maisAntigo);
    }
  }

  type Reserva = { ok: true; concluir(sucesso: boolean): void } | { ok: false; motivo: "bloqueado" | "concorrencia" };

  /** Síncrona: é o que torna a reserva atômica num processo de uma thread. */
  function reservar(ip: string): Reserva {
    const t = agora();
    const estado = porIp.get(ip) ?? { tentativas: [], bloqueadoAte: 0 };
    limpar(estado, t);
    bloquearSePassou(estado, t);

    if (estado.bloqueadoAte > t) {
      tocar(ip, estado);
      return { ok: false, motivo: "bloqueado" };
    }
    /* Tentativas em andamento contam: são erros até prova em contrário.
       Isso as torna "bloqueado" do ponto de vista do chamador, mas sem
       gravar bloqueio — se elas acabarem certas, o IP segue livre. */
    if (estado.tentativas.length >= maxErros) {
      tocar(ip, estado);
      return { ok: false, motivo: "bloqueado" };
    }
    if (emAndamento >= maxConcorrentes) {
      if (estado.tentativas.length > 0 || estado.bloqueadoAte > 0) tocar(ip, estado);
      return { ok: false, motivo: "concorrencia" };
    }

    const tentativa: Tentativa = { em: t, confirmada: false };
    estado.tentativas.push(tentativa);
    emAndamento++;
    tocar(ip, estado);

    let concluida = false;
    return {
      ok: true,
      concluir(sucesso: boolean) {
        // Idempotente: uma segunda chamada não mexe em contador nenhum.
        if (concluida) return;
        concluida = true;
        emAndamento--;
        /* O estado pode ter sido descartado pelo teto do mapa enquanto a
           verificação rodava; só mexe se ainda for o mesmo. */
        const atual = porIp.get(ip);
        if (atual !== estado) return;
        if (sucesso) {
          atual.tentativas = atual.tentativas.filter((x) => x !== tentativa);
        } else {
          /* O erro conta a partir de quando terminou: uma verificação lenta
             não pode nascer já fora da janela. */
          const t2 = agora();
          tentativa.confirmada = true;
          tentativa.em = t2;
          limpar(atual, t2);
          bloquearSePassou(atual, t2);
        }
      },
    };
  }

  function executar(ip: string, verificar: () => Promise<boolean>): Promise<ResultadoTentativa> {
    const reserva = reservar(ip);
    if (!reserva.ok) return Promise.resolve(reserva.motivo);
    return (async () => {
      let sucesso = false;
      try {
        sucesso = (await verificar()) === true;
        return sucesso ? "ok" : "senha_invalida";
      } finally {
        reserva.concluir(sucesso);
      }
    })();
  }

  return { executar };
}
