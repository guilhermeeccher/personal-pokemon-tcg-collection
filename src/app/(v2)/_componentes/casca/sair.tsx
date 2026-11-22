"use client";

import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { destinoAposSair } from "@/lib/dominio/acesso/sair";

import { Botao } from "../primitivos/botao";
import estilos from "./casca.module.css";

/**
 * "Sair" — só com o acesso por senha ligado (quem decide é o layout). Pede o
 * `DELETE /api/sessao` e só navega para o login quando o servidor confirma
 * (`destinoAposSair`): navegar sem a confirmação mostraria um login que o
 * proxy mandaria de volta para dentro, e a pessoa acharia que saiu. A mesma
 * regra do "Sair" da v1, com o desenho da v2.
 */
export function Sair() {
  const t = useTranslations("nav");
  const [saindo, setSaindo] = useState(false);
  const [erro, setErro] = useState(false);

  async function sair() {
    setSaindo(true);
    setErro(false);
    let status: number | null = null;
    try {
      status = (await fetch("/api/sessao", { method: "DELETE" })).status;
    } catch {
      status = null;
    }
    if (destinoAposSair(status) === "login") {
      // `replace`: "Voltar" depois de sair não deve reabrir a tela de dentro.
      window.location.replace("/login");
      return;
    }
    setSaindo(false);
    setErro(true);
  }

  return (
    <>
      <Botao variante="fantasma" largo carregando={saindo} icone={<LogOut aria-hidden />} onClick={sair}>
        {t("sair")}
      </Botao>
      {erro && (
        <p className={estilos.erroSair} role="alert">
          {t("sairErro")}
        </p>
      )}
    </>
  );
}
