"use client";

/**
 * "Caixas antes da Nacional 1" (CX-01): quantas caixas do HOME vêm antes da
 * primeira da Dex, de 0 a 20. Quem usa a primeira caixa do HOME para o que
 * chega põe 1, e a numeração daqui, da Pokédex e de Recebidos passa a bater
 * com a do HOME. Desloca só o número: nome, posição e quais vagas dividem uma
 * caixa não mudam, e nenhum registro é tocado (`PATCH /api/dex/preferencias`).
 *
 * Na v1 o campo gravava a cada tecla, desligado enquanto salvava (o que no
 * celular tira o foco do campo) e calava toda recusa. Aqui o valor é
 * aplicado por um botão (ou Enter), um pedido por vez, e uma recusa aparece em
 * texto. O campo volta ao valor do servidor quando a leitura nova chega.
 */

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";

import { textoDaRecusa } from "@/app/_comum/recusa";
import { ehCaixasReservadas, MAX_CAIXAS_RESERVADAS } from "@/lib/dominio/dex-caixas";

import { useAviso } from "../../../_componentes/primitivos/aviso-flutuante";
import { Botao } from "../../../_componentes/primitivos/botao";
import { Campo } from "../../../_componentes/primitivos/campo";

import estilos from "./caixas.module.css";

/** O texto digitado como número, ou nulo se não for um inteiro de 0 a 20. */
export function lerReservadas(texto: string): number | null {
  if (!/^\d{1,2}$/.test(texto.trim())) return null;
  const n = Number(texto);
  return ehCaixasReservadas(n) ? n : null;
}

export function CampoReservadas({ valor }: { valor: number }) {
  const t = useTranslations("v2DexCaixas.reservadas");
  const td = useTranslations("dex");
  const tr = useTranslations("recusas");
  const router = useRouter();
  const avisar = useAviso();
  const [texto, setTexto] = useState(String(valor));
  const [anterior, setAnterior] = useState(valor);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, iniciarLeitura] = useTransition();

  // O servidor leu um valor novo (a gravação daqui, ou outra aba): o campo o
  // acompanha. Ajuste na renderização, sem efeito.
  if (valor !== anterior) {
    setAnterior(valor);
    setTexto(String(valor));
  }

  const novo = lerReservadas(texto);
  const invalido = texto.trim() !== "" && novo === null;
  const mudou = novo !== null && novo !== valor;

  async function aplicar(e: FormEvent) {
    e.preventDefault();
    if (novo === null || !mudou || salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch("/api/dex/preferencias", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caixasReservadas: novo }),
      });
      if (!r.ok) {
        const corpo: unknown = await r.json().catch(() => null);
        setErro(textoDaRecusa(tr, corpo, t("erro")));
        return;
      }
      avisar(t("salvas", { quantidade: novo }), { tom: "sucesso" });
      iniciarLeitura(() => router.refresh());
    } catch {
      setErro(t("erro"));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form className={estilos.reservadas} onSubmit={aplicar} noValidate>
      <Campo
        type="number"
        inputMode="numeric"
        min={0}
        max={MAX_CAIXAS_RESERVADAS}
        rotulo={td("caixas.reservadas")}
        dica={t("dica")}
        erro={invalido ? t("invalido") : erro}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setErro(null);
        }}
        className={estilos.campoNumero}
      />
      <Botao type="submit" variante="primario" pequeno carregando={salvando || lendo} disabled={!mudou}>
        {t("aplicar")}
      </Botao>
    </form>
  );
}
