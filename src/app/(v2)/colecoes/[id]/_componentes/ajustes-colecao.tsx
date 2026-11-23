"use client";

import { Download, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { textoDaRecusa } from "@/app/_comum/recusa";
import { IDIOMAS, type Idioma } from "@/lib/dominio/enums";
import { NOME_REGIAO, REGIOES, type Regiao } from "@/lib/dominio/escopo-pokedex";
import type { ParametroPokedex } from "@/lib/dominio/parametro-colecao";
import type { GradeColecaoV2DTO } from "@/lib/dominio/tipos-cliente";

import { chaveDaRecusa, seguimentoDaRecusa } from "../../../_componentes/detalhe/estado-detalhe";
import { useAviso } from "../../../_componentes/primitivos/aviso-flutuante";
import { Botao } from "../../../_componentes/primitivos/botao";
import { AreaTexto, Campo, Selecao } from "../../../_componentes/primitivos/campo";
import { useConfirmacao } from "../../../_componentes/primitivos/dialogo-confirmacao";
import { Modal } from "../../../_componentes/primitivos/modal";
import { AvisoEmLinha } from "../../../_componentes/primitivos/painel";

import estilos from "./colecao.module.css";
import { proximoEscopo, regioesDoEscopo } from "./vista-colecao";

/** Uma escrita: a resposta, ou nada quando a rede falhou. */
type Resposta = { ok: boolean; status: number; corpo: unknown } | null;

async function enviar(url: string, metodo: string, corpo?: unknown): Promise<Resposta> {
  try {
    const r = await fetch(url, {
      method: metodo,
      headers: corpo === undefined ? undefined : { "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    return { ok: r.ok, status: r.status, corpo: await r.json().catch(() => null) };
  } catch {
    return null;
  }
}

/**
 * "Ajustes" da coleção: tudo o que muda a coleção em si, numa janela — nome,
 * idioma exigido e notas (CID-06), secretas (CID-07), escopo de uma Pokédex
 * (CID-08), o CSV (CID-14) e excluir (CID-15). As mesmas rotas e os mesmos
 * corpos da v1, sem mudança de regra.
 *
 * - **Toda ação destrutiva pergunta** pela confirmação da v2, que abre por
 *   cima desta janela; cancelar não envia nada. Desligar secretas e tirar
 *   uma região dizem o que acontece com as vagas que saem.
 * - **Recusa vira frase** (`recusa.ts`) dentro da janela. Validação (400)
 *   mantém o que foi digitado; uma recusa que diz que o estado mudou por
 *   baixo (404, 409) relê a grade, como o detalhe faz.
 * - Excluir leva à lista de coleções. As cópias nunca são apagadas: só
 *   voltam a ficar livres (regra 1).
 */
export function AjustesColecao({
  colecao,
  aberto,
  onFechar,
  onMudou,
}: {
  colecao: GradeColecaoV2DTO;
  aberto: boolean;
  onFechar: () => void;
  /** Uma escrita deu certo, ou uma recusa mostrou que o estado mudou: relê a grade. */
  onMudou: () => void;
}) {
  const t = useTranslations("v2Colecao.ajustes");
  const tRecusas = useTranslations("recusas");
  const avisar = useAviso();
  const router = useRouter();
  const { confirmar, dialogo } = useConfirmacao();
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<null | "salvar" | "secretas" | "escopo" | "excluir">(null);

  // O formulário nasce do que a grade diz; reabrir a janela recomeça dele.
  const [nome, setNome] = useState(colecao.nome);
  const [notas, setNotas] = useState(colecao.notas ?? "");
  const [idiomaExigido, setIdiomaExigido] = useState<Idioma | "">(colecao.idiomaExigido ?? "");
  const [abertoAntes, setAbertoAntes] = useState(aberto);
  if (aberto !== abertoAntes) {
    setAbertoAntes(aberto);
    if (aberto) {
      setNome(colecao.nome);
      setNotas(colecao.notas ?? "");
      setIdiomaExigido(colecao.idiomaExigido ?? "");
      setErro(null);
    }
  }

  /** Recusa: a frase, e a releitura quando o estado mudou por baixo. */
  function recusado(r: Resposta, padrao: string) {
    if (!r) {
      setErro(t("erroRede"));
      return;
    }
    setErro(textoDaRecusa(tRecusas, r.corpo, padrao));
    if (seguimentoDaRecusa(r.status, chaveDaRecusa(r.corpo)) === "reler") onMudou();
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setOcupado("salvar");
    const r = await enviar(`/api/colecoes/${colecao.id}`, "PATCH", {
      nome,
      notas: notas || null,
      idiomaExigido: idiomaExigido || null,
    });
    setOcupado(null);
    if (!r?.ok) return recusado(r, t("erroSalvar"));
    avisar(t("salvo"), { tom: "sucesso" });
    onMudou();
    onFechar();
  }

  const parametroSet = colecao.tipo === "set" ? (colecao.parametro as { incluirSecretas?: boolean } | null) : null;
  const secretas = parametroSet?.incluirSecretas === true;

  async function alternarSecretas(ligar: boolean) {
    if (!ligar) {
      const ok = await confirmar({
        titulo: t("secretasDesligarTitulo"),
        descricao: t("secretasDesligarTexto"),
        rotuloConfirmar: t("secretasDesligar"),
        perigoso: true,
      });
      if (!ok) return;
    }
    setErro(null);
    setOcupado("secretas");
    const r = await enviar(`/api/colecoes/${colecao.id}/secretas`, "PATCH", { incluirSecretas: ligar });
    setOcupado(null);
    if (!r?.ok) return recusado(r, t("erroSecretas"));
    avisar(ligar ? t("secretasLigadas") : t("secretasDesligadas"), { tom: "sucesso" });
    onMudou();
  }

  const parametroPokedex = colecao.tipo === "pokedex" ? (colecao.parametro as ParametroPokedex) : null;
  const regioes = parametroPokedex ? regioesDoEscopo(parametroPokedex) : [];

  async function alternarRegiao(regiao: Regiao) {
    if (!parametroPokedex) return;
    const incluir = !regioes.includes(regiao);
    const novo = proximoEscopo(parametroPokedex, regiao, incluir);
    if (!novo) {
      setErro(t("escopoVazio"));
      return;
    }
    if (!incluir) {
      const ok = await confirmar({
        titulo: t("regiaoTirarTitulo", { regiao: NOME_REGIAO[regiao] }),
        descricao: t("regiaoTirarTexto"),
        rotuloConfirmar: t("regiaoTirar"),
        perigoso: true,
      });
      if (!ok) return;
    }
    setErro(null);
    setOcupado("escopo");
    const r = await enviar(`/api/colecoes/${colecao.id}/escopo`, "PATCH", novo);
    setOcupado(null);
    if (!r?.ok) return recusado(r, t("erroEscopo"));
    const corpo = (r.corpo ?? {}) as { adicionadas?: number; removidas?: number };
    const partes = [
      corpo.adicionadas ? t("vagasAdicionadas", { total: corpo.adicionadas }) : null,
      corpo.removidas ? t("vagasRemovidas", { total: corpo.removidas }) : null,
    ].filter(Boolean);
    avisar(partes.length > 0 ? partes.join(" · ") : t("escopoInalterado"), { tom: "sucesso" });
    onMudou();
  }

  async function excluir() {
    const ok = await confirmar({
      titulo: t("excluirTitulo", { nome: colecao.nome }),
      descricao: t("excluirTexto"),
      rotuloConfirmar: t("excluir"),
      perigoso: true,
    });
    if (!ok) return;
    setErro(null);
    setOcupado("excluir");
    const r = await enviar(`/api/colecoes/${colecao.id}`, "DELETE");
    if (!r?.ok) {
      setOcupado(null);
      return recusado(r, t("erroExcluir"));
    }
    avisar(t("excluida", { nome: colecao.nome }), { tom: "sucesso" });
    router.push("/colecoes");
  }

  return (
    <>
      <Modal
        aberto={aberto}
        onFechar={onFechar}
        titulo={t("titulo")}
        descricao={colecao.nome}
        largura={560}
        fecharPeloVeu={false}
      >
        <div className={estilos.ajustes}>
          {erro && (
            <AvisoEmLinha tom="perigo" papel="alert">
              {erro}
            </AvisoEmLinha>
          )}

          <form className={estilos.formAjustes} onSubmit={salvar}>
            <Campo rotulo={t("nome")} value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={200} />
            <Selecao
              rotulo={t("idiomaExigido")}
              dica={t("idiomaExigidoDica")}
              value={idiomaExigido}
              onChange={(e) => setIdiomaExigido(e.target.value as Idioma | "")}
            >
              <option value="">{t("qualquer")}</option>
              {IDIOMAS.map((i) => (
                <option key={i} value={i}>
                  {i.toUpperCase()}
                </option>
              ))}
            </Selecao>
            <AreaTexto rotulo={t("notas")} value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} />
            <div className={estilos.acoesForm}>
              <Botao type="submit" variante="primario" carregando={ocupado === "salvar"} disabled={ocupado !== null}>
                {t("salvar")}
              </Botao>
            </div>
          </form>

          {colecao.tipo === "set" && (
            <section className={estilos.blocoAjuste}>
              <h3>{t("secretas")}</h3>
              <label className={estilos.interruptor}>
                <input
                  type="checkbox"
                  role="switch"
                  checked={secretas}
                  disabled={ocupado !== null}
                  onChange={(e) => void alternarSecretas(e.target.checked)}
                />
                <span>{t("secretasRotulo")}</span>
              </label>
            </section>
          )}

          {parametroPokedex && (
            <section className={estilos.blocoAjuste}>
              <h3>{t("escopo")}</h3>
              <p className={estilos.mudo}>{t("escopoExplica")}</p>
              <div className={estilos.regioes} role="group" aria-label={t("escopo")}>
                {REGIOES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={estilos.chipRegiao}
                    aria-pressed={regioes.includes(r)}
                    disabled={ocupado !== null}
                    onClick={() => void alternarRegiao(r)}
                  >
                    {NOME_REGIAO[r]}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className={estilos.blocoAjuste}>
            <h3>{t("exportar")}</h3>
            {/* Download de arquivo (rota de API, não tela): `<a>` comum, como na v1. */}
            <a className={estilos.linkBotao} href={`/api/colecoes/${colecao.id}/exportar`}>
              <Download aria-hidden />
              {t("baixarCsv")}
            </a>
          </section>

          <section className={`${estilos.blocoAjuste} ${estilos.zonaPerigo}`}>
            <h3>{t("excluirSecao")}</h3>
            <p className={estilos.mudo}>{t("excluirExplica")}</p>
            <Botao variante="perigo" icone={<Trash2 aria-hidden />} carregando={ocupado === "excluir"} disabled={ocupado !== null} onClick={() => void excluir()}>
              {t("excluir")}
            </Botao>
          </section>
        </div>
      </Modal>
      {dialogo}
    </>
  );
}
