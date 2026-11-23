"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { textoDaRecusa } from "@/app/_comum/recusa";
import { MAXIMO_COPIAS_POR_LOTE_TEMA } from "@/lib/dominio/cartas-do-tema";
import type { TemaColecao } from "@/lib/dominio/tema-colecao";
import type {
  AlocarCartasDoTemaDTO,
  CartaDoTemaDTO,
  CartasDoTemaAlocadasDTO,
  CartasDoTemaDTO,
} from "@/lib/dominio/tipos-cliente";

import { Carta } from "../../../_componentes/carta/carta";
import { Botao } from "../../../_componentes/primitivos/botao";
import { Modal } from "../../../_componentes/primitivos/modal";
import { AvisoEmLinha } from "../../../_componentes/primitivos/painel";

import estilos from "./colecao.module.css";
import { estadoDaCartaDoTema, marcasAposReler } from "./vista-colecao";

/** O atributo da miniatura de uma cópia na lista: é por ele que o foco volta do detalhe. */
export const ATRIBUTO_COPIA_TEMA = "data-v2-copia-tema";

/** O mínimo do `t` do next-intl para rotular o tema (`useRotuloDoTema` na página). */
export type RotularTema = (tema: TemaColecao, rotulo?: string) => string;

/**
 * O bloco de uma coleção temática (CID-13): o tema e, quando há, "N cartas
 * novas cabem neste tema", com o botão que abre a lista. A contagem é sinal
 * acessório: se a leitura falha, o bloco mostra só o tema. Ela é relida a
 * cada leitura nova da grade (que é o que muda quando uma cópia entra ou sai
 * da coleção, por qualquer caminho).
 */
export function BlocoTema({
  colecaoId,
  tema,
  temaRotulo,
  versaoGrade,
  rotularTema,
  aoAbrir,
}: {
  colecaoId: string;
  tema: TemaColecao;
  temaRotulo?: string;
  versaoGrade: number;
  rotularTema: RotularTema;
  aoAbrir: () => void;
}) {
  const t = useTranslations("temaColecao.bloco");
  const [novas, setNovas] = useState<number | null>(null);

  useEffect(() => {
    const controle = new AbortController();
    fetch(`/api/colecoes/${colecaoId}/cartas-do-tema`, { cache: "no-store", signal: controle.signal })
      .then(async (r) => (r.ok ? ((await r.json()) as Partial<CartasDoTemaDTO>) : null))
      .then((d) => setNovas(typeof d?.cartasNovas === "number" ? d.cartasNovas : null))
      .catch(() => {
        if (!controle.signal.aborted) setNovas(null);
      });
    return () => controle.abort();
  }, [colecaoId, versaoGrade]);

  return (
    <AvisoEmLinha
      tom={novas ? "sucesso" : "neutro"}
      icone={<Sparkles aria-hidden />}
      titulo={t("tema", { tipo: t(`tipos.${tema.tipo}`), tema: rotularTema(tema, temaRotulo) })}
      acao={
        novas ? (
          <Botao pequeno variante="primario" onClick={aoAbrir}>
            {t("ver")}
          </Botao>
        ) : undefined
      }
    >
      {novas ? t("cartasNovas", { total: novas }) : null}
    </AvisoEmLinha>
  );
}

/**
 * "Suas cartas que cabem neste tema" (CID-13), a lista da v1 na janela da
 * v2. As regras são as de lá (`lib/dominio/cartas-do-tema.ts`):
 *
 * - **Só lista; quem aloca é o clique em "Alocar"** (regra 5). Vem marcada
 *   uma cópia por carta física; a de carta que a coleção já tem e a fora do
 *   idioma exigido não vêm, e a fora do idioma nem se marca aqui (a
 *   confirmação de "fora de padrão" mora na vaga, não num lote).
 * - **Tudo ou nada.** Cada item leva o que a prévia mostrou; uma recusa
 *   (409), ou uma falha sem resposta, relê a lista e só mantém a marca das
 *   linhas que não mudaram (`marcasAposReler`).
 * - **Ver a carta maior sem perder as marcas** (COL-22): a miniatura abre o
 *   detalhe de carta no modo cópia, por cima desta janela; as marcas moram
 *   aqui e não são tocadas. Uma edição feita no detalhe chega como leitura
 *   nova da grade (`versaoGrade`) e a lista é relida com a mesma regra.
 */
export function CartasDoTema({
  colecaoId,
  nomeColecao,
  aberto,
  versaoGrade,
  rotularTema,
  onFechar,
  onAlocadas,
  aoAmpliar,
}: {
  colecaoId: string;
  nomeColecao: string;
  aberto: boolean;
  versaoGrade: number;
  rotularTema: RotularTema;
  onFechar: () => void;
  onAlocadas: (total: number) => void;
  /** Abre o detalhe da cópia (modo cópia) por cima da janela. */
  aoAmpliar: (c: CartaDoTemaDTO) => void;
}) {
  const t = useTranslations("temaColecao.cartas");
  const tRecusas = useTranslations("recusas");
  const tVariante = useTranslations("componentes.variante");
  const tGeral = useTranslations("v2Colecao.tema");
  const [dados, setDados] = useState<CartasDoTemaDTO | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const sequencia = useRef(0);
  const estadoLido = useRef<Map<string, string> | null>(null);

  const carregar = useCallback(() => {
    const minha = ++sequencia.current;
    return fetch(`/api/colecoes/${colecaoId}/cartas-do-tema`, { cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, corpo: (await r.json().catch(() => null)) as unknown }))
      .then(({ ok, corpo }) => {
        if (minha !== sequencia.current) return;
        if (!ok || !corpo || !Array.isArray((corpo as CartasDoTemaDTO).cartas)) {
          setDados(null);
          setErroLeitura(textoDaRecusa(tRecusas, corpo, t("erroCarregar")));
          return;
        }
        const lida = corpo as CartasDoTemaDTO;
        const anteriores = estadoLido.current;
        estadoLido.current = new Map(lida.cartas.map((c) => [c.copiaId, estadoDaCartaDoTema(c)] as const));
        setDados(lida);
        setMarcadas((atuais) => marcasAposReler(lida.cartas, anteriores, atuais));
        setErroLeitura(null);
      })
      .catch(() => {
        if (minha !== sequencia.current) return;
        setDados(null);
        setErroLeitura(t("erroCarregar"));
      });
  }, [colecaoId, t, tRecusas]);

  // Abrir lê do zero (marcas do padrão); cada leitura nova da grade relê com a regra das marcas.
  useEffect(() => {
    if (!aberto) {
      estadoLido.current = null;
      return;
    }
    void carregar();
  }, [aberto, versaoGrade, carregar]);

  // Sem leitura válida e sem erro: a primeira leitura (ou a releitura depois de uma recusa) está a caminho.
  const carregando = dados === null && erroLeitura === null;
  const cartas = dados?.cartas ?? [];
  const escolhidas = cartas.filter((c) => marcadas.has(c.copiaId));
  const demais = escolhidas.length > MAXIMO_COPIAS_POR_LOTE_TEMA;

  function alternar(copiaId: string, valor: boolean) {
    setMarcadas((atuais) => {
      const proximo = new Set(atuais);
      if (valor) proximo.add(copiaId);
      else proximo.delete(copiaId);
      return proximo;
    });
  }

  async function alocar() {
    if (!dados || escolhidas.length === 0 || demais) return;
    setErro(null);
    setEnviando(true);
    let reler = false;
    try {
      const corpo: AlocarCartasDoTemaDTO = {
        itens: escolhidas.map((c) => ({ copiaId: c.copiaId, quantidade: c.quantidade, jaNaColecao: c.jaNaColecao })),
      };
      const r = await fetch(`/api/colecoes/${colecaoId}/cartas-do-tema`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const resposta: unknown = await r.json().catch(() => null);
      if (r.ok) {
        const vagas = (resposta as Partial<CartasDoTemaAlocadasDTO> | null)?.vagas;
        onAlocadas(Array.isArray(vagas) ? vagas.length : escolhidas.length);
        return;
      }
      setErro(textoDaRecusa(tRecusas, resposta, t("erroAlocar")));
      reler = true;
    } catch {
      setErro(t("erroRede"));
      reler = true;
    } finally {
      setEnviando(false);
    }
    if (reler) {
      setDados(null);
      void carregar();
    }
  }

  return (
    <Modal
      aberto={aberto}
      onFechar={enviando ? () => {} : onFechar}
      titulo={t("titulo", { colecao: nomeColecao })}
      descricao={dados ? t("descricao", { tema: rotularTema(dados.tema, dados.temaRotulo) }) : t("descricaoSemTema")}
      largura={640}
      fecharPeloVeu={false}
      rodape={
        <>
          <Botao variante="fantasma" onClick={onFechar} disabled={enviando}>
            {t("agoraNao")}
          </Botao>
          <Botao
            variante="primario"
            carregando={enviando}
            disabled={!dados || escolhidas.length === 0 || demais}
            onClick={() => void alocar()}
          >
            {t("alocar", { total: escolhidas.length })}
          </Botao>
        </>
      }
    >
      {carregando && <p className={estilos.mudo}>{t("carregando")}</p>}
      {dados && cartas.length === 0 && <p className={estilos.mudo}>{t("nenhuma")}</p>}
      {dados && cartas.length > 0 && (
        <div className={estilos.marcarTodas}>
          <Botao pequeno onClick={() => setMarcadas(new Set(cartas.filter((c) => !c.foraDePadrao).map((c) => c.copiaId)))} disabled={enviando}>
            {t("marcarTodas")}
          </Botao>
          <Botao pequeno onClick={() => setMarcadas(new Set())} disabled={enviando}>
            {t("desmarcarTodas")}
          </Botao>
          <span className={estilos.mudo}>{t("marcadas", { marcadas: escolhidas.length, total: cartas.length })}</span>
        </div>
      )}
      <ul className={estilos.listaTema}>
        {cartas.map((c) => (
          <li key={c.copiaId} className={estilos.linhaTema}>
            {/* Dois alvos de 44 px, a 8 px um do outro: o rótulo (caixa + texto)
                marca; a miniatura abre a carta maior. */}
            <label className={estilos.rotuloTema}>
              <input
                type="checkbox"
                className={estilos.caixa}
                checked={marcadas.has(c.copiaId)}
                disabled={enviando || c.foraDePadrao}
                onChange={(e) => alternar(c.copiaId, e.target.checked)}
              />
              <span className={estilos.textoResultado}>
                <b>
                  {c.cartaNome} <span className={`${estilos.numeroMudo} v2-num`}>#{c.cartaLocalId}</span>
                </b>
                <span className={estilos.mudo}>
                  {c.setNome} · {c.idioma.toUpperCase()} · {tVariante.has(c.variante) ? tVariante(c.variante) : c.variante} · {c.condicao} ·{" "}
                  {t("qtd", { total: c.quantidade })}
                </span>
                {c.jaNaColecao && <span className={estilos.etiqueta}>{t("jaNaColecao")}</span>}
                {c.foraDePadrao && <span className={estilos.etiquetaAlerta}>{t("foraDePadrao", { idioma: c.idioma.toUpperCase() })}</span>}
              </span>
            </label>
            <button
              type="button"
              className={estilos.miniaturaBotao}
              aria-label={tGeral("ampliar", { carta: c.cartaNome })}
              onClick={() => aoAmpliar(c)}
              {...{ [ATRIBUTO_COPIA_TEMA]: c.copiaId }}
            >
              <span className={estilos.miniatura} aria-hidden>
                <Carta imagemUrl={c.imagemUrl} origem={c.imagemOrigem} alt="" variante={c.variante} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      {demais && <AvisoEmLinha tom="alerta">{t("demais", { maximo: MAXIMO_COPIAS_POR_LOTE_TEMA })}</AvisoEmLinha>}
      {erroLeitura && (
        <AvisoEmLinha
          tom="perigo"
          papel="alert"
          acao={
            <Botao
              pequeno
              onClick={() => {
                setErroLeitura(null);
                void carregar();
              }}
              disabled={enviando}
            >
              {tGeral("tentarDeNovo")}
            </Botao>
          }
        >
          {erroLeitura}
        </AvisoEmLinha>
      )}
      {erro && (
        <AvisoEmLinha tom="perigo" papel="alert">
          {erro}
        </AvisoEmLinha>
      )}
    </Modal>
  );
}
