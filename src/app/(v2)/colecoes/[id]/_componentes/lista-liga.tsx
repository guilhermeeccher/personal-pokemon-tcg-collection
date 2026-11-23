"use client";

import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

import { copiarTexto } from "@/app/_comum/copiar-texto";
import { rotuloChaveVaga } from "@/lib/dominio/chave-vaga-set";
import { LIMITE_COMPRA_POR_LISTA } from "@/lib/dominio/exportacao-lista-compra";
import { NOME_REGIAO } from "@/lib/dominio/escopo-pokedex";
import type { AbaListaLigaV2DTO, ListaDeCompraV2DTO } from "@/lib/dominio/tipos-cliente";

import { useFormatos } from "../../../_componentes/detalhe/formatos";
import { useAviso } from "../../../_componentes/primitivos/aviso-flutuante";
import { Botao } from "../../../_componentes/primitivos/botao";
import { Modal } from "../../../_componentes/primitivos/modal";
import type { ResolvedorFoco } from "../../../_componentes/primitivos/use-camada";

import estilos from "./falta.module.css";

/** O nome de uma aba da lista: a região (Pokédex), o set (coleção de vários sets) ou "Lista", com a parte. */
export function useRotuloAba() {
  const t = useTranslations("v2Falta.lista");
  return (aba: AbaListaLigaV2DTO) => {
    const nome = aba.regiao ? NOME_REGIAO[aba.regiao] : (aba.setNome ?? t("abaLista"));
    return aba.partes > 1 ? `${nome} (${aba.parte}/${aba.partes})` : nome;
  };
}

/**
 * Copia o texto de uma aba e diz se deu. `copiarTexto` (`_comum/`) é o que
 * funciona por HTTP na rede local, onde a Clipboard API não existe; quando
 * nem ele dá, o texto fica à vista para copiar à mão.
 */
export function useCopiarAba() {
  const t = useTranslations("v2Falta.lista");
  const avisar = useAviso();
  const [copiada, setCopiada] = useState<string | null>(null);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (relogio.current) clearTimeout(relogio.current);
  }, []);
  async function copiar(aba: AbaListaLigaV2DTO) {
    if (await copiarTexto(aba.texto)) {
      setCopiada(aba.id);
      avisar(t("copiadoAviso", { total: aba.quantidade }), { tom: "sucesso" });
      if (relogio.current) clearTimeout(relogio.current);
      relogio.current = setTimeout(() => setCopiada(null), 2_000);
      return true;
    }
    avisar(t("erroCopiar"), { tom: "erro" });
    return false;
  }
  return { copiar, copiada };
}

/**
 * A lista para colar na Compra por Lista da Liga, em abas — o mesmo texto da
 * tela de opções da v1 e do arquivo baixado: o servidor monta as abas
 * (`abasLiga`, de `dividirListaCompra`, até 110 cartas cada, uma por região
 * na Pokédex) e a tela só escolhe qual mostrar. Nada é remontado aqui.
 *
 * Enquanto uma marcação não foi relida, o texto está velho: copiar espera a
 * leitura nova (`atualizando`).
 */
export function ListaLiga({
  aberto,
  lista,
  atualizando,
  onFechar,
  devolverFocoPara,
}: {
  aberto: boolean;
  lista: ListaDeCompraV2DTO;
  atualizando: boolean;
  onFechar: () => void;
  devolverFocoPara?: ResolvedorFoco;
}) {
  const t = useTranslations("v2Falta.lista");
  const formatos = useFormatos();
  const rotuloAba = useRotuloAba();
  const { copiar, copiada } = useCopiarAba();
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const abas = lista.abasLiga;
  const ativa = abas.find((a) => a.id === escolhida) ?? abas[0] ?? null;
  const cardmarket = lista.fonte === "cardmarket";

  // Setas entre as abas, como numa lista de abas de verdade.
  function teclaAba(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const passo = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!passo) return;
    e.preventDefault();
    const proxima = abas[(i + passo + abas.length) % abas.length];
    setEscolhida(proxima.id);
    const fileira = e.currentTarget.parentElement;
    requestAnimationFrame(() => fileira?.querySelector<HTMLButtonElement>(`[data-aba="${CSS.escape(proxima.id)}"]`)?.focus());
  }

  return (
    <Modal
      aberto={aberto}
      onFechar={onFechar}
      titulo={t("titulo")}
      descricao={t("descricao", { total: lista.selecionadas, valor: formatos.brl(lista.total) })}
      largura={640}
      devolverFocoPara={devolverFocoPara}
      rodape={
        ativa ? (
          <Botao
            variante="primario"
            icone={<Copy aria-hidden />}
            disabled={atualizando}
            onClick={() => void copiar(ativa)}
          >
            {atualizando ? t("atualizando") : copiada === ativa.id ? t("copiado") : t("copiar")}
          </Botao>
        ) : undefined
      }
    >
      <div className={estilos.lista}>
        {!ativa ? (
          <p className={estilos.sutil}>{t("vazia")}</p>
        ) : (
          <>
            {abas.length > 1 ? (
              <div role="tablist" aria-label={t("abas")} className={estilos.abasLiga}>
                {abas.map((aba, i) => {
                  const selecionada = aba.id === ativa.id;
                  return (
                    <button
                      key={aba.id}
                      type="button"
                      role="tab"
                      id={`v2-aba-liga-${aba.id}`}
                      data-aba={aba.id}
                      aria-selected={selecionada}
                      aria-controls="v2-painel-liga"
                      tabIndex={selecionada ? 0 : -1}
                      className={estilos.abaLiga}
                      onClick={(e) => {
                        setEscolhida(aba.id);
                        // A fileira rola de lado no celular: a aba tocada pela
                        // metade vem inteira, sem rolar a página na vertical.
                        e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
                      }}
                      onKeyDown={(e) => teclaAba(e, i)}
                    >
                      {rotuloAba(aba)} <span className="v2-num">{aba.quantidade}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            <p className={estilos.sutil}>
              {t.rich("comoColar", { forte: (partes) => <strong>{partes}</strong> })} {t("limitePorAba", { limite: LIMITE_COMPRA_POR_LISTA })}
            </p>
            <pre
              id="v2-painel-liga"
              role={abas.length > 1 ? "tabpanel" : undefined}
              aria-labelledby={abas.length > 1 ? `v2-aba-liga-${ativa.id}` : undefined}
              aria-label={abas.length > 1 ? undefined : rotuloAba(ativa)}
              className={estilos.textoLista}
              tabIndex={0}
            >
              {ativa.texto}
            </pre>
            <p className={estilos.sutil}>{t("abaResumo", { total: ativa.quantidade, valor: formatos.brl(ativa.total) })}</p>
          </>
        )}
        {lista.multiplas.length > 0 ? (
          <p className={estilos.sutil}>
            {t("multiplas")}{" "}
            {lista.multiplas.map((m) => t("multiplasItem", { vaga: rotuloChaveVaga(m.chave), rotulo: m.rotulo, total: m.quantidade })).join(" · ")}
          </p>
        ) : null}
        {lista.semPreco > 0 ? <p className={estilos.sutil}>{cardmarket ? t("semPrecoCardmarket", { total: lista.semPreco }) : t("semPrecoLiga", { total: lista.semPreco })}</p> : null}
        {lista.guardadas > 0 ? <p className={estilos.sutil}>{t("guardadas", { total: lista.guardadas })}</p> : null}
        <p className={estilos.sutil}>
          {cardmarket ? t("listaGuardadaCardmarket") : t("listaGuardada")}
          {lista.precoMaisAntigo ? ` ${t("precoMaisAntigo", { data: formatos.instante(lista.precoMaisAntigo) })}` : ""}{" "}
          {cardmarket ? t("totalEhReferencia", { valor: formatos.brl(lista.total) }) : t("totalEhPiso", { valor: formatos.brl(lista.total) })}
        </p>
      </div>
    </Modal>
  );
}
