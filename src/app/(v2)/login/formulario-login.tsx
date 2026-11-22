"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { Botao } from "@/app/(v2)/_componentes/primitivos/botao";
import { Campo } from "@/app/(v2)/_componentes/primitivos/campo";
import { AvisoEmLinha } from "@/app/(v2)/_componentes/primitivos/painel";

import estilos from "./login.module.css";

type Erro = "senhaInvalida" | "muitasTentativas" | "generico";

/**
 * Formulário de senha. Sem `target`, pop-up ou janela nova: dentro do app
 * instalado no iPhone, qualquer coisa que abrisse o Safari tiraria a pessoa
 * do app.
 *
 * As mensagens de erro são genéricas de propósito: não dizem se a senha
 * chegou perto, nem quantas tentativas restam.
 */
export function FormularioLogin({ volta }: { volta: string }) {
  const t = useTranslations("v2Login");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<Erro | null>(null);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando) return;
    const senha = String(new FormData(evento.currentTarget).get("senha") ?? "");
    setEnviando(true);
    setErro(null);
    try {
      const resposta = await fetch("/api/sessao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senha }),
      });
      if (resposta.ok) {
        /* Navegação completa e não `router.push`: descarta o estado do
           roteador e o cache de páginas de antes do login — e é ela que
           atravessa de uma versão para a outra, já que um `volta` para a v1
           é outro layout raiz. O botão fica desabilitado até a página trocar. */
        window.location.replace(volta);
        return;
      }
      setErro(
        resposta.status === 401 ? "senhaInvalida" : resposta.status === 429 ? "muitasTentativas" : "generico",
      );
    } catch {
      setErro("generico");
    }
    setEnviando(false);
  }

  return (
    <form onSubmit={enviar} className={estilos.formulario}>
      <Campo
        rotulo={t("campoSenha")}
        type="password"
        name="senha"
        autoComplete="current-password"
        autoFocus
        required
        disabled={enviando}
      />
      {erro && (
        <AvisoEmLinha tom="perigo" papel="alert">
          {t(`erros.${erro}`)}
        </AvisoEmLinha>
      )}
      <Botao type="submit" variante="primario" largo carregando={enviando}>
        {enviando ? t("entrando") : t("entrar")}
      </Botao>
    </form>
  );
}
