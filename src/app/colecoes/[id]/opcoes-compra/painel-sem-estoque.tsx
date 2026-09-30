"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { Alerta } from "@/app/_componentes/alerta";
import { Botao } from "@/app/_componentes/botao";
import { classesEntrada } from "@/app/_componentes/campo";

/**
 * O retorno "Cards sem estoque" da Compra por Lista, colado de volta — decisão
 * de 2026-09-24. O porquê está em `lib/dominio/sem-estoque-liga.ts`; a rota é
 * `api/colecoes/[id]/opcoes-compra/sem-estoque`.
 *
 * **Dois passos, de propósito.** Colar mostra primeiro o que foi entendido e
 * quais escolhas seriam desmarcadas; só o "Confirmar" grava. Desmarcar é
 * mexer na triagem do usuário, e ele precisa ver antes o que sai da string.
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

const numeracao = (c: { numero: string; total: string | null }) =>
  c.total ? `${c.numero}/${c.total}` : c.numero;

export function PainelSemEstoque({
  colecaoId,
  aoAlterar,
}: {
  colecaoId: string;
  /** A triagem mudou: a tela recarrega o bloco para colar e a grade. */
  aoAlterar: () => void;
}) {
  const t = useTranslations("opcoesCompra");
  const locale = useLocale();
  const rota = `/api/colecoes/${colecaoId}/opcoes-compra/sem-estoque`;

  const [texto, setTexto] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Não-async pelo mesmo motivo de `carregar` na página: a regra
  // `react-hooks/set-state-in-effect`.
  const carregarRegistros = useCallback(() => {
    fetch(rota)
      .then(async (r) => {
        if (!r.ok) throw new Error("resposta não ok");
        return (await r.json()) as { itens: Registro[] };
      })
      .then((d) => setRegistros(d.itens))
      .catch(() => setErro(t("semEstoqueErroCarregar")));
  }, [rota, t]);

  useEffect(() => {
    carregarRegistros();
  }, [carregarRegistros]);

  async function enviar(confirmar: boolean) {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    const resposta = await fetch(rota, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto, confirmar }),
    });
    const corpo = await resposta.json();
    setOcupado(false);

    if (!resposta.ok) {
      setPrevia(null);
      setErro(t("semEstoqueNadaReconhecido"));
      return;
    }
    if (!confirmar) {
      setPrevia(corpo as Previa);
      return;
    }

    setPrevia(null);
    setTexto("");
    setAviso(
      t("semEstoqueGravado", { registradas: corpo.registradas, desmarcadas: corpo.desmarcadas }),
    );
    carregarRegistros();
    aoAlterar();
  }

  async function voltarAOferecer(registro: Registro) {
    const resposta = await fetch(`${rota}?item=${encodeURIComponent(registro.id)}`, {
      method: "DELETE",
    });
    if (!resposta.ok) {
      setErro(t("semEstoqueErroRemover"));
      return;
    }
    carregarRegistros();
    aoAlterar();
  }

  return (
    <details className="rounded-card border border-hairline bg-surface p-3 shadow-1">
      <summary className="cursor-pointer text-sm font-semibold text-foreground">
        {t("semEstoqueTitulo", { total: registros.length })}
      </summary>

      <div className="mt-3 flex flex-col gap-3">
        <p className="text-xs text-muted">{t("semEstoqueAjuda")}</p>

        {erro && <Alerta tom="perigo">{erro}</Alerta>}
        {aviso && <Alerta tom="sucesso">{aviso}</Alerta>}

        <textarea
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setPrevia(null);
          }}
          rows={5}
          placeholder={t("semEstoquePlaceholder")}
          className={`${classesEntrada} font-mono text-xs`}
          aria-label={t("semEstoqueCampo")}
        />
        <div>
          <Botao
            variante="secundario"
            tamanho="sm"
            disabled={ocupado || texto.trim() === ""}
            onClick={() => void enviar(false)}
          >
            {t("semEstoqueConferir")}
          </Botao>
        </div>

        {previa && (
          <div className="flex flex-col gap-2 rounded-card bg-inset p-3 text-sm">
            <strong className="text-foreground">
              {t("semEstoquePrevia", {
                cartas: previa.cartas.length,
                desmarcadas: previa.desmarcariam,
              })}
            </strong>
            <ul className="flex flex-col gap-1 text-xs">
              {previa.cartas.map((c) => (
                <li key={`${c.nome}|${numeracao(c)}|${c.qualidade}`}>
                  <span className="font-medium text-foreground">
                    {c.nome} ({numeracao(c)})
                  </span>
                  {c.qualidade && <span className="text-muted"> · {c.qualidade}</span>}
                  <span className="text-muted">
                    {" — "}
                    {c.escolhas.length === 0
                      ? t("semEstoqueSoRegistra")
                      : t("semEstoqueDesmarca", {
                          vagas: c.escolhas
                            .map((e) => `#${e.chave} ${e.especie ?? ""} [${e.edicaoSigla}]`.trim())
                            .join(", "),
                        })}
                  </span>
                </li>
              ))}
            </ul>
            {previa.naoEntendidas.length > 0 && (
              <Alerta tom="aviso">
                {t("semEstoqueNaoEntendidas", { total: previa.naoEntendidas.length })}
                <ul className="mt-1 font-mono text-xs">
                  {previa.naoEntendidas.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </Alerta>
            )}
            <div className="flex gap-2">
              <Botao
                variante="primario"
                tamanho="sm"
                disabled={ocupado}
                onClick={() => void enviar(true)}
              >
                {t("semEstoqueConfirmar")}
              </Botao>
              <Botao variante="secundario" tamanho="sm" onClick={() => setPrevia(null)}>
                {t("semEstoqueCancelar")}
              </Botao>
            </div>
          </div>
        )}

        {registros.length > 0 && (
          <div className="flex flex-col gap-1">
            <h3 className="text-xs font-semibold text-foreground">{t("semEstoqueRegistradas")}</h3>
            <ul className="divide-y divide-line text-xs">
              {registros.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-1">
                  <span className="font-medium text-foreground">
                    {r.nome} ({numeracao(r)})
                  </span>
                  {r.qualidade && <span className="text-muted">{r.qualidade}</span>}
                  <span className="text-muted">
                    {t("semEstoqueVence", {
                      data: new Date(r.venceEm).toLocaleDateString(locale),
                    })}
                  </span>
                  <Botao
                    variante="secundario"
                    tamanho="sm"
                    className="ml-auto"
                    onClick={() => void voltarAOferecer(r)}
                  >
                    {t("semEstoqueVoltar")}
                  </Botao>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
