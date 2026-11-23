"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { textoDaRecusa } from "@/app/_comum/recusa";
import type { Idioma } from "@/lib/dominio/enums";
import type { CopiaDoInventarioDTO } from "@/lib/dominio/tipos-cliente";

import { Carta } from "../../../_componentes/carta/carta";
import { useAviso } from "../../../_componentes/primitivos/aviso-flutuante";
import { Botao } from "../../../_componentes/primitivos/botao";
import { Campo } from "../../../_componentes/primitivos/campo";
import { useConfirmacao } from "../../../_componentes/primitivos/dialogo-confirmacao";
import { Modal } from "../../../_componentes/primitivos/modal";
import { AvisoEmLinha } from "../../../_componentes/primitivos/painel";

import estilos from "./colecao.module.css";

/**
 * Adicionar uma cópia livre a uma coleção customizada (CID-12): busca as
 * cópias livres do inventário (`GET /api/copias?alocacao=livre`) e aloca
 * uma (`POST /api/colecoes/:id/copias`); a vaga nasce com a alocação. Lote
 * de mais de uma unidade é dividido pelo servidor, e o aviso diz isso.
 *
 * **Fora do idioma exigido** (regra 7: o idioma é o da carta física) a cópia
 * pode entrar, mas só depois da confirmação da v2, e só então o pedido leva
 * `permitirForaDePadrao`. Qualquer recusa (a cópia levada por outra aba
 * enquanto isso, por exemplo) refaz a busca: a linha que não vale mais sai.
 */
export function AdicionarCopia({
  colecaoId,
  idiomaExigido,
  aberto,
  onFechar,
  onAdicionada,
}: {
  colecaoId: string;
  idiomaExigido: Idioma | null;
  aberto: boolean;
  onFechar: () => void;
  onAdicionada: () => void;
}) {
  const t = useTranslations("v2Colecao.adicionar");
  const tRecusas = useTranslations("recusas");
  const tVariante = useTranslations("componentes.variante");
  const avisar = useAviso();
  const { confirmar, dialogo } = useConfirmacao();
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<CopiaDoInventarioDTO[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function buscar(texto: string) {
    setBuscando(true);
    try {
      const params = new URLSearchParams({ alocacao: "livre", tamanhoPagina: "20", pagina: "1" });
      if (texto.trim()) params.set("q", texto.trim());
      const r = await fetch(`/api/copias?${params.toString()}`, { cache: "no-store" });
      const corpo = (await r.json().catch(() => null)) as { itens?: CopiaDoInventarioDTO[] } | null;
      if (!r.ok) {
        setErro(textoDaRecusa(tRecusas, corpo, t("erroBuscar")));
        return;
      }
      setResultados(corpo?.itens ?? []);
    } catch {
      setErro(t("erroBuscar"));
    } finally {
      setBuscando(false);
    }
  }

  async function adicionar(c: CopiaDoInventarioDTO) {
    const foraDePadrao = idiomaExigido !== null && c.idioma !== idiomaExigido;
    if (foraDePadrao) {
      const ok = await confirmar({
        titulo: t("foraTitulo", { idioma: c.idioma.toUpperCase() }),
        descricao: t("foraTexto", { exigido: idiomaExigido.toUpperCase(), idioma: c.idioma.toUpperCase() }),
        rotuloConfirmar: t("foraConfirmar"),
      });
      if (!ok) return;
    }
    setErro(null);
    setEnviando(c.id);
    try {
      const r = await fetch(`/api/colecoes/${colecaoId}/copias`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ copiaId: c.id, permitirForaDePadrao: foraDePadrao }),
      });
      const corpo = (await r.json().catch(() => null)) as { dividida?: boolean } | null;
      if (!r.ok) {
        setErro(textoDaRecusa(tRecusas, corpo, t("erroAdicionar")));
        void buscar(q);
        return;
      }
      avisar(corpo?.dividida ? `${t("adicionada", { carta: c.cartaNome })} ${t("loteDividido")}` : t("adicionada", { carta: c.cartaNome }), {
        tom: "sucesso",
      });
      setResultados((r2) => r2?.filter((x) => x.id !== c.id) ?? null);
      onAdicionada();
    } catch {
      // Sem resposta: o servidor pode ter alocado. A busca relida diz a verdade.
      setErro(t("erroRede"));
      void buscar(q);
      onAdicionada();
    } finally {
      setEnviando(null);
    }
  }

  return (
    <>
      <Modal aberto={aberto} onFechar={onFechar} titulo={t("titulo")} descricao={t("explica")} largura={600}>
        <form
          className={estilos.formBusca}
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            setErro(null);
            void buscar(q);
          }}
        >
          <Campo rotulo={t("buscar")} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("placeholder")} />
          <Botao type="submit" variante="secundario" icone={<Search aria-hidden />} carregando={buscando}>
            {t("botaoBuscar")}
          </Botao>
        </form>
        {erro && (
          <AvisoEmLinha tom="perigo" papel="alert">
            {erro}
          </AvisoEmLinha>
        )}
        {resultados && (
          <ul className={estilos.resultados}>
            {resultados.length === 0 && <li className={estilos.mudo}>{t("nenhuma")}</li>}
            {resultados.map((c) => {
              const fora = idiomaExigido !== null && c.idioma !== idiomaExigido;
              return (
                <li key={c.id} className={estilos.resultado}>
                  <span className={estilos.miniatura} aria-hidden>
                    <Carta imagemUrl={c.imagemUrl} origem={c.imagemOrigem} alt="" variante={c.variante} raridade={c.raridade} />
                  </span>
                  <span className={estilos.textoResultado}>
                    <b>
                      {c.cartaNome} <span className={`${estilos.numeroMudo} v2-num`}>#{c.cartaLocalId}</span>
                    </b>
                    <span className={estilos.mudo}>
                      {c.setNome} · {c.idioma.toUpperCase()} · {tVariante.has(c.variante) ? tVariante(c.variante) : c.variante} ·{" "}
                      {t("qtd", { total: c.quantidade })}
                    </span>
                    {fora && <span className={estilos.etiquetaAlerta}>{t("fora", { idioma: c.idioma.toUpperCase() })}</span>}
                  </span>
                  <Botao pequeno variante="primario" carregando={enviando === c.id} disabled={enviando !== null} onClick={() => void adicionar(c)}>
                    {t("adicionar")}
                  </Botao>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>
      {dialogo}
    </>
  );
}
