"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { textoDaRecusa } from "@/app/_comum/recusa";
import { chaveVagaSet } from "@/lib/dominio/chave-vaga-set";
import type { Idioma } from "@/lib/dominio/enums";
import type { CartaEncontradaDTO } from "@/lib/dominio/tipos-cliente";

import { Carta } from "../../../_componentes/carta/carta";
import { chaveDaRecusa, seguimentoDaRecusa } from "../../../_componentes/detalhe/estado-detalhe";
import { useAviso } from "../../../_componentes/primitivos/aviso-flutuante";
import { Botao } from "../../../_componentes/primitivos/botao";
import { Campo } from "../../../_componentes/primitivos/campo";
import { AvisoEmLinha, Painel } from "../../../_componentes/primitivos/painel";

import estilos from "./colecao.module.css";
import { umaLinhaPorCarta } from "./vista-colecao";

/**
 * Incluir uma carta avulsa numa coleção de set (CID-10), no modo "Editar
 * cartas": busca no catálogo, de qualquer set, por nome, set e número, e a
 * carta entra como **vaga vazia** (`POST /api/colecoes/:id/cartas`). É a
 * CARTA que entra, não uma cópia: alocar continua sendo o passo de sempre,
 * na vaga. A chave da vaga leva o set (`set/local_id`) e a tela nunca a
 * mostra crua.
 */
export function IncluirCarta({
  colecaoId,
  idiomaCatalogo,
  chavesNaColecao,
  onIncluida,
}: {
  colecaoId: string;
  idiomaCatalogo: Idioma;
  chavesNaColecao: ReadonlySet<string>;
  /** A carta entrou (ou a recusa mostrou que a coleção mudou): relê a grade. */
  onIncluida: () => void;
}) {
  const t = useTranslations("v2Colecao.incluir");
  const tRecusas = useTranslations("recusas");
  const avisar = useAviso();
  const [nome, setNome] = useState("");
  const [setId, setSetId] = useState("");
  const [numero, setNumero] = useState("");
  const [resultados, setResultados] = useState<CartaEncontradaDTO[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function buscar(e: FormEvent) {
    e.preventDefault();
    if (!nome.trim() && !setId.trim() && !numero.trim()) return;
    setBuscando(true);
    setErro(null);
    try {
      const params = new URLSearchParams();
      if (nome.trim()) params.set("nome", nome.trim());
      if (setId.trim()) params.set("set", setId.trim());
      if (numero.trim()) params.set("numero", numero.trim());
      const r = await fetch(`/api/cartas?${params.toString()}`);
      const corpo = (await r.json().catch(() => null)) as { cartas?: CartaEncontradaDTO[] } | null;
      if (!r.ok) {
        setErro(textoDaRecusa(tRecusas, corpo, t("erroBuscar")));
        return;
      }
      setResultados(umaLinhaPorCarta(corpo?.cartas ?? [], idiomaCatalogo));
    } catch {
      setErro(t("erroBuscar"));
    } finally {
      setBuscando(false);
    }
  }

  async function incluir(carta: CartaEncontradaDTO) {
    const chave = chaveVagaSet(carta.setId, carta.localId);
    setEnviando(chave);
    setErro(null);
    try {
      const r = await fetch(`/api/colecoes/${colecaoId}/cartas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setId: carta.setId, localId: carta.localId }),
      });
      const corpo: unknown = await r.json().catch(() => null);
      if (!r.ok) {
        setErro(textoDaRecusa(tRecusas, corpo, t("erroIncluir")));
        // "Já está na coleção" vindo de outra aba: a grade relida corrige a marca.
        if (seguimentoDaRecusa(r.status, chaveDaRecusa(corpo)) === "reler" || chaveDaRecusa(corpo) === "cartaJaNaColecao") onIncluida();
        return;
      }
      avisar(t("incluida", { carta: `${carta.nome} (${carta.setNome} #${carta.localId})` }), { tom: "sucesso" });
      onIncluida();
    } catch {
      setErro(t("erroIncluir"));
    } finally {
      setEnviando(null);
    }
  }

  return (
    <Painel className={estilos.incluir}>
      <h3 className={estilos.subtitulo}>{t("titulo")}</h3>
      <p className={estilos.mudo}>{t("explica")}</p>
      <form className={estilos.formBusca} onSubmit={buscar}>
        <Campo rotulo={t("nome")} value={nome} onChange={(e) => setNome(e.target.value)} />
        <Campo rotulo={t("set")} value={setId} onChange={(e) => setSetId(e.target.value)} placeholder="30th" />
        <Campo rotulo={t("numero")} value={numero} onChange={(e) => setNumero(e.target.value)} inputMode="text" />
        <Botao type="submit" variante="secundario" icone={<Search aria-hidden />} carregando={buscando}>
          {t("buscar")}
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
            const chave = chaveVagaSet(c.setId, c.localId);
            const jaEsta = chavesNaColecao.has(chave);
            return (
              <li key={chave} className={estilos.resultado}>
                <span className={estilos.miniatura} aria-hidden>
                  <Carta imagemUrl={c.imagemUrl} origem={c.imagemOrigem} alt="" raridade={c.raridade} />
                </span>
                <span className={estilos.textoResultado}>
                  <b>
                    {c.nome} <span className={`${estilos.numeroMudo} v2-num`}>#{c.localId}</span>
                  </b>
                  <span className={estilos.mudo}>
                    {c.setNome} · <span className="v2-num">{c.setId}</span>
                  </span>
                </span>
                {jaEsta ? (
                  <span className={estilos.mudo}>{t("jaEsta")}</span>
                ) : (
                  <Botao pequeno variante="primario" carregando={enviando === chave} disabled={enviando !== null} onClick={() => void incluir(c)}>
                    {t("incluir")}
                  </Botao>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Painel>
  );
}
