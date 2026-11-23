"use client";

import { Copy, Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { type KeyboardEvent, useState } from "react";

import { rotuloChaveVaga } from "@/lib/dominio/chave-vaga-set";
import { LIMITE_COMPRA_POR_LISTA } from "@/lib/dominio/exportacao-lista-compra";

import type { Formatos } from "../../../../_componentes/detalhe/formatos";
import { Botao } from "../../../../_componentes/primitivos/botao";
import { Painel } from "../../../../_componentes/primitivos/painel";
import { Explicacao } from "../../../../_componentes/primitivos/explicacao";
import { useCopiarAba, useRotuloAba } from "../../_componentes/lista-liga";

import type { RespostaOpcoesDTO } from "./opcoes-compra";
import estilos from "./opcoes.module.css";

/** O arquivo de uma aba: a mesma rota e o mesmo `id` de aba da v1, então o mesmo arquivo. */
export const urlExportar = (colecaoId: string, busca: string) => `/api/colecoes/${colecaoId}/opcoes-compra/exportar?${busca}`;

/**
 * Baixa pela rota de exportação. A resposta vem com `Content-Disposition:
 * attachment`, então a página não sai do lugar. É um botão, e não um link,
 * para poder esperar a lista ser relida depois de uma marcação.
 */
export function baixar(url: string) {
  window.location.assign(url);
}

/**
 * A lista para colar na Compra por Lista da Liga, inteira na tela, como na
 * v1: abas de até 110 cartas (o limite deles por busca), uma por região na
 * Pokédex e uma por set numa coleção que junta sets. **As abas são as do
 * servidor** (`abasLiga`, de `dividirListaCompra`), as mesmas do arquivo
 * baixado: a tela só escolhe qual mostrar, nada é remontado aqui.
 *
 * "Copiar" passa por `copiarTexto` (`_comum/`), que funciona por HTTP na rede
 * local, onde a Clipboard API não existe. Copiar e baixar esperam enquanto
 * uma marcação não foi relida (`atualizando`): o texto estaria velho.
 */
export function ListaParaColar({
  colecaoId,
  dados,
  cardmarket,
  atualizando,
  formatos,
}: {
  colecaoId: string;
  dados: Pick<RespostaOpcoesDTO, "abasLiga" | "multiplas" | "total" | "semPreco" | "guardadas" | "precoMaisAntigo">;
  cardmarket: boolean;
  atualizando: boolean;
  formatos: Formatos;
}) {
  const t = useTranslations("v2OpcoesCompra.lista");
  const rotuloAba = useRotuloAba();
  const { copiar, copiada } = useCopiarAba();
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const abas = dados.abasLiga;
  // A aba escolhida pode sumir quando a lista encolhe: cai na primeira.
  const ativa = abas.find((a) => a.id === escolhida) ?? abas[0] ?? null;
  if (!ativa) return null;

  function teclaAba(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const passo = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!passo) return;
    e.preventDefault();
    const proxima = abas[(i + passo + abas.length) % abas.length];
    setEscolhida(proxima.id);
    const fileira = e.currentTarget.parentElement;
    requestAnimationFrame(() => fileira?.querySelector<HTMLButtonElement>(`[data-aba="${CSS.escape(proxima.id)}"]`)?.focus());
  }

  const varias = abas.length > 1;
  return (
    <Painel as="section" className={estilos.lista} aria-labelledby="v2-opcoes-lista-titulo">
      <div className={estilos.listaTopo}>
        <h2 id="v2-opcoes-lista-titulo" className={estilos.subtitulo}>
          {t("titulo")}
        </h2>
        <div className={estilos.listaBotoes}>
          <Botao
            pequeno
            icone={<Download aria-hidden />}
            disabled={atualizando}
            onClick={() => baixar(urlExportar(colecaoId, `formato=liga&aba=${encodeURIComponent(ativa.id)}`))}
          >
            {t("baixarAba")}
          </Botao>
          <Botao pequeno variante="primario" icone={<Copy aria-hidden />} disabled={atualizando} onClick={() => void copiar(ativa)}>
            {atualizando ? t("atualizando") : copiada === ativa.id ? t("copiado") : t("copiar")}
          </Botao>
        </div>
      </div>

      {varias ? (
        <div role="tablist" aria-label={t("abas")} className={estilos.abas}>
          {abas.map((aba, i) => {
            const selecionada = aba.id === ativa.id;
            return (
              <button
                key={aba.id}
                type="button"
                role="tab"
                id={`v2-opcoes-aba-${aba.id}`}
                data-aba={aba.id}
                aria-selected={selecionada}
                aria-controls="v2-opcoes-painel-lista"
                tabIndex={selecionada ? 0 : -1}
                className={estilos.aba}
                onClick={(e) => {
                  setEscolhida(aba.id);
                  // A fileira rola de lado no celular: a aba tocada pela metade
                  // vem inteira, sem rolar a página na vertical.
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
        id="v2-opcoes-painel-lista"
        role={varias ? "tabpanel" : undefined}
        aria-labelledby={varias ? `v2-opcoes-aba-${ativa.id}` : undefined}
        aria-label={varias ? undefined : rotuloAba(ativa)}
        className={estilos.textoLista}
        tabIndex={0}
      >
        {ativa.texto}
      </pre>
      <p className={estilos.sutil}>{t("abaResumo", { total: ativa.quantidade, valor: formatos.brl(ativa.total) })}</p>

      {dados.multiplas.length > 0 ? (
        <p className={estilos.texto} role="note">
          {t("multiplas")}{" "}
          {dados.multiplas.map((m) => t("multiplasItem", { vaga: rotuloChaveVaga(m.chave), rotulo: m.rotulo, total: m.quantidade })).join(" · ")}
        </p>
      ) : null}

      {dados.semPreco > 0 || dados.guardadas > 0 ? (
        <div className={estilos.etiquetas}>
          {dados.semPreco > 0 ? (
            <Explicacao
              assunto={t("semPreco", { total: dados.semPreco })}
              texto={cardmarket ? t("semPrecoTextoCardmarket") : t("semPrecoTextoLiga")}
            />
          ) : null}
          {dados.guardadas > 0 ? <Explicacao assunto={t("guardadas", { total: dados.guardadas })} texto={t("guardadasTexto")} /> : null}
        </div>
      ) : null}

      <p className={estilos.sutil}>
        {cardmarket ? t("listaGuardadaCardmarket") : t("listaGuardada")}
        {dados.precoMaisAntigo ? ` ${t("precoMaisAntigo", { data: formatos.instante(dados.precoMaisAntigo) })}` : ""}{" "}
        {cardmarket ? t("totalEhReferencia", { valor: formatos.brl(dados.total) }) : t("totalEhPiso", { valor: formatos.brl(dados.total) })}
      </p>
    </Painel>
  );
}
