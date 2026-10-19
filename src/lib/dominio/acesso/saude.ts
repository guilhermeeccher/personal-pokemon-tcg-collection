/**
 * Verificação de saúde de `/api/saude` (só com o acesso por senha ligado;
 * pública, para o monitor de fora consultar sem sessão).
 *
 * Por ser pública, ela não pode virar um jeito de sobrecarregar o banco:
 *
 * - **uma consulta por vez, de verdade**: a trava vale para a consulta
 *   real até ela terminar, não para a resposta. O prazo não cancela a
 *   consulta (o driver não tem como), então liberar a trava no prazo
 *   deixaria um banco travado acumular uma consulta nova a cada janela de
 *   cache, enchendo o pool;
 * - **depois do primeiro estouro, "fora" direto**: enquanto a consulta que
 *   estourou o prazo continuar pendurada, as verificações respondem `false`
 *   sem esperar por ela de novo. Cada nova espera (`Promise.race`) deixaria
 *   um callback registrado numa promessa que pode nunca terminar — memória
 *   que cresce a cada janela. Sobre a consulta fica um observador só, o que
 *   libera a trava quando ela enfim termina;
 * - **o resultado vale `validadeMs`** (5 s) depois que sai: uma rajada de
 *   pedidos dentro da janela não toca o banco;
 * - **prazo de `prazoMs`** (2 s) para a resposta: um banco travado responde
 *   "fora" em 2 s em vez de segurar a conexão de quem perguntou.
 *
 * Responde só `true`/`false`. A mensagem do erro não sai daqui: ela diria
 * a quem pergunta, sem sessão, detalhes do banco.
 *
 * Puro: a consulta e o relógio entram por parâmetro.
 */

export interface OpcoesSaude {
  consultar: () => Promise<unknown>;
  prazoMs?: number;
  validadeMs?: number;
  agora?: () => number;
}

/** Nunca rejeita: a consulta virar erro é "fora". */
function executar(consultar: () => Promise<unknown>): Promise<boolean> {
  return Promise.resolve()
    .then(consultar)
    .then(
      () => true,
      () => false,
    );
}

/** O resultado da consulta e se o prazo estourou. O timer é sempre limpo,
 *  para não segurar o processo nem acumular. */
async function comPrazo(
  consulta: Promise<boolean>,
  prazoMs: number,
): Promise<{ ok: boolean; estourou: boolean }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const prazo = new Promise<{ ok: boolean; estourou: boolean }>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, estourou: true }), prazoMs);
  });
  try {
    return await Promise.race([consulta.then((ok) => ({ ok, estourou: false })), prazo]);
  } finally {
    clearTimeout(timer);
  }
}

export function criarVerificadorSaude({
  consultar,
  prazoMs = 2000,
  validadeMs = 5000,
  agora = Date.now,
}: OpcoesSaude): () => Promise<boolean> {
  let ultimo: { ok: boolean; em: number } | null = null;
  /** A resposta em andamento (com prazo), compartilhada por quem chega junto. */
  let respostaEmCurso: Promise<boolean> | null = null;
  /** A consulta real, até ela terminar — mesmo depois do prazo da resposta. */
  let consultaPendente: Promise<boolean> | null = null;
  /** A consulta pendente já estourou o prazo uma vez: não se espera mais por ela. */
  let pendenteEstourou = false;

  function guardar(ok: boolean): boolean {
    ultimo = { ok, em: agora() };
    return ok;
  }

  return function verificar(): Promise<boolean> {
    if (ultimo && agora() - ultimo.em < validadeMs) return Promise.resolve(ultimo.ok);
    if (respostaEmCurso) return respostaEmCurso;
    if (consultaPendente && pendenteEstourou) return Promise.resolve(guardar(false));

    if (!consultaPendente) {
      const consulta = executar(consultar);
      consultaPendente = consulta;
      pendenteEstourou = false;
      // O único observador da consulta: solta a trava quando ela termina.
      void consulta.then(() => {
        if (consultaPendente === consulta) {
          consultaPendente = null;
          pendenteEstourou = false;
        }
      });
    }

    /* Uma espera só por consulta: enquanto ela corre, quem chega pega
       `respostaEmCurso`; se ela estoura, as próximas caem no `false`
       direto acima. */
    const resposta = comPrazo(consultaPendente, prazoMs).then(({ ok, estourou }) => {
      if (estourou) pendenteEstourou = true;
      respostaEmCurso = null;
      return guardar(ok);
    });
    respostaEmCurso = resposta;
    return resposta;
  };
}
