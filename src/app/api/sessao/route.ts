/**
 * Entrar e sair do acesso opcional por senha. Só existe com
 * `ACESSO_COM_SENHA=1`; desligado, `rotaDoModulo` responde 404 aos dois.
 *
 * - `POST` (entrar) é o único par público com escrita do app inteiro: sem
 *   sessão, mas com a origem conferida pelo envoltório (e pelo proxy).
 * - `DELETE` (sair) exige sessão — não é par público —, então sem ela dá
 *   401. Tanto faz para quem sai: o cliente navega para o login de
 *   qualquer jeito.
 *
 * Nenhum outro método é exportado.
 */
import { NextResponse } from "next/server";

import { configuracaoAcessoAtual, ipDoCliente, limiteLogin, respostaErroAcesso, rotaDoModulo } from "@/lib/acesso";
import { ATRASO_ERRO_MS, esperar, processarEntrada, respostaDaEntrada } from "@/lib/dominio/acesso/entrar";
import { verificarSenha } from "@/lib/dominio/acesso/senha";
import {
  DURACAO_SESSAO_SEGUNDOS,
  NOME_COOKIE_SESSAO,
  atributosCookieSessao,
  emitirSessao,
} from "@/lib/dominio/acesso/sessao";

const SEM_CACHE = { "Cache-Control": "private, no-store" } as const;

export const POST = rotaDoModulo(async (req: Request) => {
  /* O envoltório já recusou desligado e incompleto; reler aqui dá o tipo
     da configuração ligada (senha e segredo) sem passá-la por fora. */
  const config = configuracaoAcessoAtual();
  if (config.estado !== "ligada") return respostaErroAcesso(503, "configuracao_incompleta");

  const resultado = await processarEntrada({
    corpo: req.body,
    contentLength: req.headers.get("content-length"),
    ip: ipDoCliente(req.headers),
    limite: limiteLogin,
    verificar: (senha) => verificarSenha(senha, config.hashSenha),
  });
  const { status, corpo, atrasar } = respostaDaEntrada(resultado);

  if (status !== 200) {
    if (atrasar) await esperar(ATRASO_ERRO_MS);
    return NextResponse.json(corpo, { status, headers: SEM_CACHE });
  }

  const valor = await emitirSessao({
    segredo: config.segredo,
    hashSenhaTexto: config.hashSenhaTexto,
    agoraMs: Date.now(),
  });
  const resposta = NextResponse.json(corpo, { status: 200, headers: SEM_CACHE });
  resposta.cookies.set(NOME_COOKIE_SESSAO, valor, atributosCookieSessao(DURACAO_SESSAO_SEGUNDOS));
  return resposta;
});

export const DELETE = rotaDoModulo(async () => {
  const resposta = NextResponse.json(
    { ok: true },
    {
      status: 200,
      headers: {
        ...SEM_CACHE,
        /* Pede ao navegador que descarte o que guardou deste site. Nem todo
           navegador obedece; o que garante a saída é o cookie apagado e a
           navegação completa que o cliente faz para o login. */
        "Clear-Site-Data": '"cache"',
      },
    },
  );
  // Mesmo nome e atributos do cookie emitido, com Max-Age=0: só assim o
  // navegador reconhece que é o mesmo cookie e o apaga.
  resposta.cookies.set(NOME_COOKIE_SESSAO, "", atributosCookieSessao(0));
  return resposta;
});
