"use client";

/**
 * "Suas cartas que cabem neste tema": as cópias livres do usuário que casam
 * com o tema de uma coleção temática, para ele marcar e confirmar. A mesma
 * janela serve ao fim da criação e à página da coleção ("N cartas novas cabem
 * neste tema"). Regras em `lib/dominio/cartas-do-tema.ts`; aqui só a tela.
 *
 * - **A janela só lista; quem aloca é o clique em "Alocar".** Nada é alocado
 *   ao abrir nem ao fechar (regra 5). Vem marcada uma cópia por carta física
 *   (`marcadaPorPadrao`); cópia de carta que a coleção já tem e cópia fora do
 *   idioma exigido não vêm marcadas, e a fora do idioma nem se marca aqui —
 *   a confirmação de "fora de padrão" mora na vaga, não num lote.
 * - **Tudo ou nada.** O `POST` aloca o lote numa transação; uma cópia levada
 *   por outra aba no meio do caminho recusa o lote inteiro (409) e nada é
 *   gravado. Depois de qualquer recusa, ou de uma falha sem resposta (o
 *   servidor pode ter gravado), a lista é relida e o botão fica desligado até
 *   chegar uma leitura válida. Das marcas, fica só a das linhas cujo estado
 *   não mudou (mesma cópia, mesma `quantidade`, mesmo `jaNaColecao`): um lote
 *   que outra aba dividiu mantém o id e voltaria marcado, mas é outra decisão
 *   — a linha mudada volta desmarcada e a pessoa a marca de novo. Cópia nova
 *   na lista segue o padrão (`marcadaPorPadrao`).
 * - Cada leitura leva um número de sequência: a resposta de uma leitura já
 *   superada é descartada. Leitura recusada é erro na tela, nunca lista vazia.
 * - Acima de `MAXIMO_COPIAS_POR_LOTE_TEMA` o botão fica desligado, com uma
 *   frase, em vez de deixar a API recusar.
 */

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Botao } from "@/app/_componentes/botao";
import { Distintivo } from "@/app/_componentes/distintivo";
import { ImagemCartaComZoom } from "@/app/_componentes/imagem-carta-zoom";
import { Modal } from "@/app/_componentes/modal";
import { textoDaRecusa } from "@/app/_comum/recusa";
import { MAXIMO_COPIAS_POR_LOTE_TEMA } from "@/lib/dominio/cartas-do-tema";
import type {
  AlocarCartasDoTemaDTO,
  CartasDoTemaAlocadasDTO,
  CartaDoTemaDTO,
  CartasDoTemaDTO,
} from "@/lib/dominio/tipos-cliente";

import { chamarApi } from "./chamar-api";
import { useRotuloTema } from "./rotulo-tema";

/** O que o servidor confere no lote: a mesma `quantidade` e o mesmo `jaNaColecao` que a prévia mostrou. */
function estadoDaLinha(c: CartaDoTemaDTO): string {
  return `${c.quantidade}|${c.jaNaColecao}`;
}

export function ModalCartasDoTema({
  colecaoId,
  nomeColecao,
  onFechar,
  onAlocadas,
}: {
  colecaoId: string;
  nomeColecao: string;
  /** "Agora não" / Esc: fecha sem alocar nada. */
  onFechar: () => void;
  /** O lote foi alocado: quem abriu fecha a janela e relê o que mostra. */
  onAlocadas: (total: number) => void;
}) {
  const t = useTranslations("temaColecao.cartas");
  const tr = useTranslations("recusas");
  const tc = useTranslations("colecoes");
  const tv = useTranslations("componentes");
  const { rotuloDoTema } = useRotuloTema();
  const tituloId = useId();
  // `null` = não há leitura válida (ainda não leu, ou a última falhou).
  const [dados, setDados] = useState<CartasDoTemaDTO | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(true);
  // O da leitura some quando uma leitura válida chega; o da confirmação (a
  // recusa ou o "resultado incerto") fica na tela depois da releitura, que é
  // justamente o que o explica.
  const [erro, setErro] = useState<string | null>(null);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const sequencia = useRef(0);
  // O estado de cada linha na última leitura válida: é com ele que uma marca
  // se mantém ou cai quando a lista é relida.
  const estadoLido = useRef<Map<string, string> | null>(null);

  const carregar = useCallback(() => {
    const minha = ++sequencia.current;
    return fetch(`/api/colecoes/${colecaoId}/cartas-do-tema`)
      .then(async (resp) => ({ ok: resp.ok, corpo: (await resp.json().catch(() => null)) as unknown }))
      .then(({ ok, corpo }) => {
        if (minha !== sequencia.current) return; // superada por uma leitura mais nova
        if (!ok || !corpo || !Array.isArray((corpo as CartasDoTemaDTO).cartas)) {
          setDados(null);
          setErroLeitura(textoDaRecusa(tr, corpo, t("erroCarregar")));
          return;
        }
        const lida = corpo as CartasDoTemaDTO;
        const anteriores = estadoLido.current;
        const novos = new Map(lida.cartas.map((c) => [c.copiaId, estadoDaLinha(c)] as const));
        estadoLido.current = novos;
        setDados(lida);
        setMarcadas((atuais) =>
          new Set(
            lida.cartas
              .filter((c) => {
                if (c.foraDePadrao) return false;
                const antes = anteriores?.get(c.copiaId);
                if (antes === undefined) return c.marcadaPorPadrao;
                return antes === novos.get(c.copiaId) && atuais.has(c.copiaId);
              })
              .map((c) => c.copiaId),
          ),
        );
        setErroLeitura(null);
      })
      .catch(() => {
        if (minha !== sequencia.current) return;
        setDados(null);
        setErroLeitura(t("erroCarregar"));
      })
      .finally(() => {
        if (minha === sequencia.current) setCarregando(false);
      });
  }, [colecaoId, t, tr]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const valida = dados !== null;
  const cartas = dados?.cartas ?? [];
  // Na ordem da lista, que é a da tela: é a ordem em que as vagas nascem.
  const escolhidas = cartas.filter((c) => marcadas.has(c.copiaId));
  const demais = escolhidas.length > MAXIMO_COPIAS_POR_LOTE_TEMA;

  /** "Tentar de novo" de uma leitura que falhou: as marcas de agora ficam onde ainda valem. */
  function reler() {
    setErroLeitura(null);
    setCarregando(true);
    void carregar();
  }

  function alternar(copiaId: string, valor: boolean) {
    setMarcadas((atuais) => {
      const proximo = new Set(atuais);
      if (valor) proximo.add(copiaId);
      else proximo.delete(copiaId);
      return proximo;
    });
  }

  function marcarTodas(valor: boolean) {
    setMarcadas(valor ? new Set(cartas.filter((c) => !c.foraDePadrao).map((c) => c.copiaId)) : new Set());
  }

  async function alocar() {
    if (dados === null || escolhidas.length === 0 || demais) return;
    setErro(null);
    setEnviando(true);
    let relido = false;
    try {
      // Cada item devolve o que a prévia mostrou: o servidor recusa o lote
      // (409 `cartasDoTemaDesatualizadas`) se a quantidade do lote ou o "já tem
      // esta carta" mudou desde então, e a releitura abaixo cobre esse caso.
      const corpo: AlocarCartasDoTemaDTO = {
        itens: escolhidas.map((c) => ({ copiaId: c.copiaId, quantidade: c.quantidade, jaNaColecao: c.jaNaColecao })),
      };
      const r = await chamarApi(`/api/colecoes/${colecaoId}/cartas-do-tema`, "POST", corpo);
      if (r.ok) {
        const total = Array.isArray((r.corpo as Partial<CartasDoTemaAlocadasDTO> | null)?.vagas)
          ? (r.corpo as CartasDoTemaAlocadasDTO).vagas.length
          : escolhidas.length;
        onAlocadas(total);
        return;
      }
      setErro(textoDaRecusa(tr, r.corpo, t("erroAlocar")));
      relido = true;
    } catch {
      // Sem resposta: o servidor pode ter alocado tudo ou nada.
      setErro(t("erroRede"));
      relido = true;
    } finally {
      setEnviando(false);
    }
    if (relido) {
      setDados(null);
      setCarregando(true);
      void carregar();
    }
  }

  return (
    <Modal
      rotuloId={tituloId}
      className="md:max-w-2xl"
      onFechar={enviando ? undefined : onFechar}
      rodape={
        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          <Botao type="button" onClick={onFechar} disabled={enviando}>
            {t("agoraNao")}
          </Botao>
          <Botao
            type="button"
            variante="primario"
            onClick={() => void alocar()}
            disabled={enviando || !valida || escolhidas.length === 0 || demais}
          >
            {enviando ? t("alocando") : t("alocar", { total: escolhidas.length })}
          </Botao>
        </div>
      }
    >
      <h2 id={tituloId} className="font-medium break-words text-foreground">
        {t("titulo", { colecao: nomeColecao })}
      </h2>
      <p className="break-words text-muted">
        {dados
          ? t("descricao", { tema: rotuloDoTema(dados.tema.tipo, dados.tema.valor, dados.temaRotulo) }) : t("descricaoSemTema")}
      </p>
      {carregando && <p className="text-muted">{t("carregando")}</p>}
      {valida && cartas.length === 0 && <p className="text-muted">{t("nenhuma")}</p>}
      {valida && cartas.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Botao type="button" tamanho="sm" onClick={() => marcarTodas(true)} disabled={enviando}>
            {t("marcarTodas")}
          </Botao>
          <Botao type="button" tamanho="sm" onClick={() => marcarTodas(false)} disabled={enviando}>
            {t("desmarcarTodas")}
          </Botao>
          <span className="text-sm text-muted">{t("marcadas", { marcadas: escolhidas.length, total: cartas.length })}</span>
        </div>
      )}
      {/* Abaixo de md cada linha tem dois alvos de 44px, a 8px um do outro: o
          rótulo (caixa + texto, um bloco só, tocar em qualquer ponto marca) e a
          miniatura, que abre o zoom. A miniatura fica fora do rótulo, e o
          `px-1.5` do invólucro deixa a área de toque dela (6px além de cada
          lado, em `imagem-carta-zoom.tsx`) dentro dele, sem tocar o rótulo. */}
      <ul className="flex flex-col divide-y divide-hairline max-md:gap-2 max-md:divide-y-0">
        {cartas.map((c) => {
          return (
            <li key={c.copiaId} className="flex items-center gap-2 py-2 max-md:py-0 md:gap-3">
              {/* Do `md` para cima o rótulo não gera caixa (`md:contents`) e a
                  ordem é a de sempre: caixa, miniatura, texto. Abaixo dele, o
                  rótulo é o bloco de 44px (caixa + texto) e a miniatura vai
                  depois, no seu próprio alvo. */}
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 max-md:min-h-11 md:contents">
                <input
                  type="checkbox"
                  className="size-4 shrink-0 max-md:size-5 md:order-1"
                  checked={marcadas.has(c.copiaId)}
                  disabled={enviando || c.foraDePadrao}
                  onChange={(e) => alternar(c.copiaId, e.target.checked)}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 md:order-3">
                  <span className="break-words text-foreground">
                    {c.cartaNome} <span className="text-muted">#{c.cartaLocalId}</span>
                  </span>
                  <span className="text-xs break-words text-muted">
                    {c.setNome} · {c.idioma} · {tv.has(`variante.${c.variante}`) ? tv(`variante.${c.variante}`) : c.variante} ·{" "}
                    {c.condicao} · {t("qtd", { total: c.quantidade })}
                  </span>
                  {(c.jaNaColecao || c.foraDePadrao) && (
                    <span className="flex flex-wrap gap-1">
                      {c.jaNaColecao && <Distintivo tom="neutro">{t("jaNaColecao")}</Distintivo>}
                      {c.foraDePadrao && <Distintivo tom="aviso">{t("foraDePadrao", { idioma: c.idioma })}</Distintivo>}
                    </span>
                  )}
                </span>
              </label>
              <span className="flex shrink-0 items-center justify-center max-md:min-h-11 max-md:px-1.5 md:order-2">
                <ImagemCartaComZoom
                  imagemUrl={c.imagemUrl}
                  origem={c.imagemOrigem}
                  alt={c.cartaNome}
                  width={32}
                  height={44}
                  className="rounded-sm"
                />
              </span>
            </li>
          );
        })}
      </ul>
      {demais && <p className="text-sm text-warning-fg">{t("demais", { maximo: MAXIMO_COPIAS_POR_LOTE_TEMA })}</p>}
      {erroLeitura && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-danger">
          <p>{erroLeitura}</p>
          <Botao type="button" tamanho="sm" onClick={reler} disabled={enviando || carregando}>
            {tc("tentarDeNovo")}
          </Botao>
        </div>
      )}
      {erro && <p className="text-sm text-danger">{erro}</p>}
    </Modal>
  );
}
