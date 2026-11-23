"use client";

import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useState } from "react";

import { rotuloChaveVaga } from "@/lib/dominio/chave-vaga-set";

import type { Formatos } from "../../../../_componentes/detalhe/formatos";
import { useAviso } from "../../../../_componentes/primitivos/aviso-flutuante";
import { Botao } from "../../../../_componentes/primitivos/botao";
import { AreaTexto } from "../../../../_componentes/primitivos/campo";
import { AvisoEmLinha, Painel } from "../../../../_componentes/primitivos/painel";

import { numeracao } from "./vaga-opcoes";
import estilos from "./opcoes.module.css";

/**
 * O retorno "Cards sem estoque" da Compra por Lista, colado de volta — decisão
 * de 2026-09-24, o porquê em `lib/dominio/sem-estoque-liga.ts`. A rota é a da
 * v1 (`…/opcoes-compra/sem-estoque`), sem mudança.
 *
 * **Dois passos, de propósito.** Colar mostra primeiro o que foi entendido e
 * quais escolhas desta lista seriam desmarcadas; só "Confirmar" grava — e a
 * rota grava o registro e desmarca **na mesma transação**. Desmarcar é mexer
 * na triagem do usuário, e ele vê antes o que sai da lista. Cancelar não
 * envia nada.
 *
 * O registro é global (o estoque é da loja) e vale 30 dias; "Voltar a
 * oferecer" o apaga antes disso.
 */

interface CartaPrevia {
  nome: string;
  numero: string;
  total: string | null;
  qualidade: string;
  escolhas: Array<{ chave: string; especie: string | null; edicaoSigla: string }>;
}

interface Previa {
  cartas: CartaPrevia[];
  naoEntendidas: string[];
  desmarcariam: number;
}

interface Registro {
  id: string;
  nome: string;
  numero: string;
  total: string | null;
  qualidade: string;
  venceEm: string;
}

type Recado = { tom: "perigo" | "alerta"; texto: string; linhas?: string[] };

export function PainelSemEstoque({
  colecaoId,
  bloqueado,
  formatos,
  aoAlterar,
}: {
  colecaoId: string;
  /**
   * Há marcação a caminho: confirmar espera. A colagem desmarca pela lista do
   * servidor no instante do clique, e uma marcação no ar chegaria fora de
   * ordem em relação a ela.
   */
  bloqueado: boolean;
  formatos: Formatos;
  /** A triagem mudou: a tela relê a lista e as vagas. */
  aoAlterar: () => void;
}) {
  const t = useTranslations("v2OpcoesCompra.semEstoque");
  const avisar = useAviso();
  const rota = `/api/colecoes/${colecaoId}/opcoes-compra/sem-estoque`;
  const idCorpo = useId();

  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [registros, setRegistros] = useState<Registro[] | null>(null);
  const [falhaRegistros, setFalhaRegistros] = useState(false);
  const [recado, setRecado] = useState<Recado | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [versao, setVersao] = useState(0);
  const relerRegistros = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    const controle = new AbortController();
    fetch(rota, { cache: "no-store", signal: controle.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as { itens: Registro[] };
      })
      .then((d) => {
        if (controle.signal.aborted) return;
        setRegistros(d.itens);
        setFalhaRegistros(false);
      })
      .catch(() => {
        if (!controle.signal.aborted) setFalhaRegistros(true);
      });
    return () => controle.abort();
  }, [rota, versao]);

  async function enviar(confirmar: boolean) {
    setOcupado(true);
    setRecado(null);
    let resposta: Response;
    try {
      resposta = await fetch(rota, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto, confirmar }),
      });
    } catch {
      setOcupado(false);
      setRecado({ tom: "perigo", texto: t("erroRede") });
      return;
    }
    const corpo = (await resposta.json().catch(() => null)) as
      | (Previa & { registradas?: number; desmarcadas?: number; naoEntendidas?: string[] })
      | null;
    setOcupado(false);

    if (!resposta.ok) {
      setPrevia(null);
      if (resposta.status === 404) setRecado({ tom: "perigo", texto: t("colecaoSumiu") });
      else if (resposta.status === 400)
        setRecado({ tom: "alerta", texto: t("nadaReconhecido"), linhas: corpo?.naoEntendidas ?? [] });
      else setRecado({ tom: "perigo", texto: t("erroGravar") });
      // Uma recusa depois de confirmar não gravou nada (a transação volta
      // inteira); a lista é relida do mesmo jeito, para a tela dizer a verdade.
      if (confirmar) aoAlterar();
      return;
    }
    if (!confirmar) {
      setPrevia(corpo);
      return;
    }
    setPrevia(null);
    setTexto("");
    avisar(t("gravado", { registradas: corpo?.registradas ?? 0, desmarcadas: corpo?.desmarcadas ?? 0 }), { tom: "sucesso" });
    relerRegistros();
    aoAlterar();
  }

  async function voltarAOferecer(r: Registro) {
    setOcupado(true);
    setRecado(null);
    let ok = false;
    let status = 0;
    try {
      const resposta = await fetch(`${rota}?item=${encodeURIComponent(r.id)}`, { method: "DELETE" });
      ok = resposta.ok;
      status = resposta.status;
    } catch {
      // Sem rede: o recado abaixo diz que não deu.
    }
    setOcupado(false);
    if (!ok) {
      setRecado({ tom: "perigo", texto: status === 404 ? t("colecaoSumiu") : t("erroRemover") });
      relerRegistros();
      return;
    }
    avisar(t("voltouAOferecer", { nome: `${r.nome} (${numeracao(r)})` }), { tom: "sucesso" });
    relerRegistros();
    aoAlterar();
  }

  const total = registros?.length ?? 0;
  return (
    <Painel as="section" className={estilos.semEstoqueSecao} aria-label={t("titulo", { total })}>
      <button type="button" className={estilos.semEstoqueAbrir} aria-expanded={aberto} aria-controls={idCorpo} onClick={() => setAberto((v) => !v)}>
        <span>{t("titulo", { total })}</span>
        <ChevronRight aria-hidden />
      </button>
      <div id={idCorpo} className={estilos.semEstoque} hidden={!aberto}>
        <p className={estilos.sutil}>{t("ajuda")}</p>

        {recado ? (
          <AvisoEmLinha tom={recado.tom} papel="alert">
            {recado.texto}
            {recado.linhas && recado.linhas.length > 0 ? (
              <ul className={estilos.naoEntendidas}>
                {recado.linhas.map((l, i) => (
                  <li key={`${i}-${l}`}>{l}</li>
                ))}
              </ul>
            ) : null}
          </AvisoEmLinha>
        ) : null}

        <AreaTexto
          rotulo={t("campo")}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            // A prévia é do texto que foi conferido: mudou o texto, ela sai.
            setPrevia(null);
          }}
          rows={5}
          placeholder={t("exemplo")}
          className={estilos.campoColagem}
          spellCheck={false}
        />
        <div>
          <Botao pequeno disabled={ocupado || texto.trim() === ""} carregando={ocupado && previa === null} onClick={() => void enviar(false)}>
            {t("conferir")}
          </Botao>
        </div>

        {previa ? (
          <div className={estilos.previa} role="region" aria-label={t("previaRotulo")}>
            <strong className={estilos.texto}>{t("previa", { cartas: previa.cartas.length, desmarcadas: previa.desmarcariam })}</strong>
            <ul className={estilos.previaLista}>
              {previa.cartas.map((c) => (
                <li key={`${c.nome}|${numeracao(c)}|${c.qualidade}`}>
                  <b>
                    {c.nome} ({numeracao(c)})
                  </b>
                  {c.qualidade ? ` · ${c.qualidade}` : ""}
                  {" — "}
                  {c.escolhas.length === 0
                    ? t("soRegistra")
                    : t("desmarca", {
                        vagas: c.escolhas
                          .map((e) => [rotuloChaveVaga(e.chave), e.especie, `[${e.edicaoSigla}]`].filter(Boolean).join(" "))
                          .join(", "),
                      })}
                </li>
              ))}
            </ul>
            {previa.naoEntendidas.length > 0 ? (
              <AvisoEmLinha tom="alerta">
                {t("naoEntendidas", { total: previa.naoEntendidas.length })}
                <ul className={estilos.naoEntendidas}>
                  {previa.naoEntendidas.map((l, i) => (
                    <li key={`${i}-${l}`}>{l}</li>
                  ))}
                </ul>
              </AvisoEmLinha>
            ) : null}
            {bloqueado ? <p className={estilos.sutil}>{t("esperandoMarcacao")}</p> : null}
            <div className={estilos.previaAcoes}>
              <Botao variante="primario" pequeno disabled={ocupado || bloqueado} carregando={ocupado} onClick={() => void enviar(true)}>
                {t("confirmar")}
              </Botao>
              <Botao pequeno variante="fantasma" disabled={ocupado} onClick={() => setPrevia(null)}>
                {t("cancelar")}
              </Botao>
            </div>
          </div>
        ) : null}

        {falhaRegistros ? (
          <AvisoEmLinha
            tom="alerta"
            papel="alert"
            acao={
              <Botao pequeno onClick={relerRegistros}>
                {t("tentarDeNovo")}
              </Botao>
            }
          >
            {t("erroCarregar")}
          </AvisoEmLinha>
        ) : null}

        {registros && registros.length > 0 ? (
          <div className={estilos.grupo}>
            <h3 className={estilos.rotuloGrupo}>{t("registradas")}</h3>
            <ul className={estilos.registros}>
              {registros.map((r) => (
                <li key={r.id} className={estilos.registro}>
                  <span className={estilos.registroTexto}>
                    <b>
                      {r.nome} ({numeracao(r)})
                    </b>
                    <span className={estilos.sutil}>
                      {[r.qualidade, t("vence", { data: formatos.instante(r.venceEm) })].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <Botao pequeno disabled={ocupado} onClick={() => void voltarAOferecer(r)}>
                    {t("voltar")}
                  </Botao>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Painel>
  );
}
