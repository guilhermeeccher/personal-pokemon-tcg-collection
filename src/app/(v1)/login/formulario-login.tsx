"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { Alerta } from "@/app/_componentes/alerta";
import { Botao } from "@/app/_componentes/botao";
import { Campo, classesEntrada } from "@/app/_componentes/campo";

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
  const t = useTranslations("login");
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
           roteador e o cache de páginas de antes do login. O botão fica
           desabilitado até a página trocar. */
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
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <Campo rotulo={t("campoSenha")}>
        <input
          type="password"
          name="senha"
          autoComplete="current-password"
          autoFocus
          required
          disabled={enviando}
          className={classesEntrada}
        />
      </Campo>
      {erro && (
        <div role="alert">
          <Alerta tom="perigo">{t(`erros.${erro}`)}</Alerta>
        </div>
      )}
      <Botao type="submit" variante="primario" disabled={enviando} className="self-start max-md:self-stretch">
        {enviando ? t("entrando") : t("entrar")}
      </Botao>
    </form>
  );
}
