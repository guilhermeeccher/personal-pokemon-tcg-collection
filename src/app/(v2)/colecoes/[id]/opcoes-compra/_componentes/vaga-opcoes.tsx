"use client";

import { Check, ChevronRight, ExternalLink, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useState } from "react";

import { caminhoBuscaLiga } from "@/lib/dominio/candidatas-compra";
import { rotuloChaveVaga } from "@/lib/dominio/chave-vaga-set";
import type { FontePreco } from "@/lib/dominio/fonte-preco";

import { Carta } from "../../../../_componentes/carta/carta";
import type { Formatos } from "../../../../_componentes/detalhe/formatos";
import { Botao } from "../../../../_componentes/primitivos/botao";
import { Explicacao } from "../../../../_componentes/primitivos/explicacao";
import { LinhaPreco } from "../../_componentes/preco-compra";

import { type OpcaoDTO, OPCOES_POR_VAGA, type VagaDTO, corpoDaMarcacao } from "./opcoes-compra";
import estilos from "./opcoes.module.css";

/** O site da Liga: o link "Ver ofertas" abre a busca deles, só `cards/search` (AGENTS.md, rotas permitidas). */
export const SITE_LIGA = "https://www.ligapokemon.com.br";

/** Número e nome da vaga: o da Pokédex com três dígitos, o do set pela chave, nunca a chave crua. */
export function tituloDaVaga(vaga: Pick<VagaDTO, "dex" | "chave" | "rotulo">): string {
  const numero = vaga.dex !== null ? String(vaga.dex).padStart(3, "0") : rotuloChaveVaga(vaga.chave);
  return `${numero} — ${vaga.rotulo}`;
}

export const numeracao = (o: { numero: string; total: string | null }) => (o.total ? `${o.numero}/${o.total}` : o.numero);

/**
 * Uma vaga vazia com as opções dela — recolhível, como na v1. Recolhida, ela
 * ainda diz o que está escolhido nela (é o que permite conferir a triagem sem
 * abrir uma por uma). Aberta, mostra as primeiras `OPCOES_POR_VAGA` opções e
 * "Mostrar todas": uma Pokédex tem dezenas de cartas por espécie.
 *
 * Cada opção diz em texto o que a v1 dizia num `title` ou numa dica — sem
 * estoque, fora do catálogo, escolha antiga, sem preço —, por toque e por
 * teclado (`Explicacao`), e o preço sai com a fonte e a conversão à vista
 * (`LinhaPreco`). Marcar e desmarcar é um botão com `aria-pressed`; a escolha
 * é sempre do usuário (regra 5), e várias por vaga são permitidas.
 */
export const VagaOpcoes = memo(function VagaOpcoes({
  vaga,
  recolhida,
  fonte,
  ehSet,
  formatos,
  textoSemOpcao,
  travada,
  aoRecolher,
  aoAlternar,
  aoZoom,
}: {
  vaga: VagaDTO;
  recolhida: boolean;
  fonte: FontePreco;
  ehSet: boolean;
  formatos: Formatos;
  textoSemOpcao: string;
  /** A confirmação do "sem estoque" está no ar: marcar espera. */
  travada: boolean;
  aoRecolher: (vaga: VagaDTO, recolher: boolean) => void;
  aoAlternar: (opcao: OpcaoDTO) => void;
  aoZoom: (opcao: OpcaoDTO) => void;
}) {
  const t = useTranslations("v2OpcoesCompra.vaga");
  const [todas, setTodas] = useState(false);
  const cardmarket = fonte === "cardmarket";
  const marcadas = vaga.opcoes.filter((o) => o.selecionada);
  // As primeiras da ordem e, além delas, toda opção marcada: a escolha da
  // vaga nunca fica escondida atrás de "Mostrar todas" (a sem preço, como uma
  // escolha antiga, vai para o fim da ordem).
  const visiveis = todas ? vaga.opcoes : vaga.opcoes.filter((o, i) => i < OPCOES_POR_VAGA || o.selecionada);
  const idCorpo = `v2-vaga-${vaga.chave}`;

  const contagem = [
    // No set a contagem é sempre 0 ou 1: repeti-la em cada linha seria ruído.
    ehSet ? null : t("contagem", { total: vaga.opcoes.length }),
    vaga.descartadas > 0 ? (cardmarket ? t("acimaDoTeto", { total: vaga.descartadas }) : t("foraDosFiltros", { total: vaga.descartadas })) : null,
    vaga.semEstoque > 0 ? t("escondidasSemEstoque", { total: vaga.semEstoque }) : null,
  ].filter(Boolean);

  function textoSemPreco(o: OpcaoDTO): string {
    return o.consultadaEm ? t("semPrecoNoCardmarket", { data: formatos.instante(o.consultadaEm) }) : t("semPrecoNaoBuscado");
  }

  return (
    <section className={`${estilos.vaga} v2-painel`} aria-label={tituloDaVaga(vaga)}>
      <button
        type="button"
        className={estilos.vagaTopo}
        aria-expanded={!recolhida}
        aria-controls={recolhida ? undefined : idCorpo}
        onClick={() => aoRecolher(vaga, !recolhida)}
      >
        <ChevronRight aria-hidden />
        <span className={estilos.vagaNome}>{tituloDaVaga(vaga)}</span>
        {marcadas.length > 1 ? <span className={estilos.etiqueta}>{t("varias", { total: marcadas.length })}</span> : null}
        {contagem.length > 0 ? <span className={estilos.vagaContagem}>{contagem.join(" · ")}</span> : null}
      </button>

      {recolhida ? (
        <p className={estilos.vagaResumo}>
          {marcadas.length > 0
            ? marcadas
                .map((o) => `✓ ${o.nome} (${numeracao(o)}) · ${o.preco === null ? t("semPreco") : formatos.brl(o.preco)}`)
                .join("  ·  ")
            : vaga.opcoes.length === 0
              ? textoSemOpcao
              : t("semSelecao")}
        </p>
      ) : (
        <div className={estilos.vagaCorpo} id={idCorpo}>
          {marcadas.length > 1 ? <p className={estilos.sutil}>{t("variasTexto")}</p> : null}
          {vaga.opcoes.length === 0 ? (
            <p className={estilos.texto}>{textoSemOpcao}</p>
          ) : (
            <ul className={estilos.opcoes}>
              {visiveis.map((o) => {
                const nome = o.nomeExibicao ? `${o.nome} · ${o.nomeExibicao}` : o.nome;
                const podeAlternar = corpoDaMarcacao(o, fonte, !o.selecionada) !== null;
                return (
                  <li key={o.id} className={`${estilos.opcao} ${o.selecionada ? estilos.opcaoMarcada : ""}`}>
                    {/* Só a carta que casou com o nosso catálogo tem foto: a
                        Liga publica a dela, mas não fazemos hotlink de
                        terceiro (decisão de 2026-08-29). */}
                    {o.imagemUrl ? (
                      <button
                        type="button"
                        className={estilos.miniatura}
                        aria-label={t("ampliar", { nome: `${o.nome} (${numeracao(o)})` })}
                        onClick={() => aoZoom(o)}
                      >
                        <Carta imagemUrl={o.imagemUrl} origem={o.imagemOrigem} alt="" raridade={o.raridade} />
                      </button>
                    ) : (
                      <span className={estilos.semFoto}>{t("semFoto")}</span>
                    )}
                    <span className={estilos.opcaoTexto}>
                      <span className={estilos.opcaoNome}>
                        {o.nome}
                        {o.nomeExibicao ? <span> · {o.nomeExibicao}</span> : null}
                      </span>
                      <span className={estilos.sutil}>
                        {[`${o.edicaoNome} (${numeracao(o)})`, o.raridade].filter(Boolean).join(" · ")}
                      </span>
                      {o.preco === null ? null : (
                        <LinhaPreco
                          preco={{ fonte, valor: o.preco, em: null, ...(cardmarket && o.cardmarket ? { cardmarket: o.cardmarket } : {}) }}
                          formatos={formatos}
                        />
                      )}
                      <span className={estilos.etiquetas}>
                        {cardmarket && o.preco === null ? <Explicacao assunto={t("semPreco")} texto={textoSemPreco(o)} /> : null}
                        {o.semEstoque ? <Explicacao assunto={t("semEstoque")} texto={t("semEstoqueTexto")} tom="perigo" /> : null}
                        {o.cartaId === null ? <Explicacao assunto={t("foraDoCatalogo")} texto={t("foraDoCatalogoTexto")} tom="aviso" /> : null}
                        {o.escolhaId ? <Explicacao assunto={t("escolhaAntiga")} texto={t("escolhaAntigaTexto")} tom="aviso" /> : null}
                      </span>
                    </span>
                    <span className={estilos.opcaoAcoes}>
                      <Botao
                        pequeno
                        variante={o.selecionada ? "primario" : "secundario"}
                        icone={o.selecionada ? <Check aria-hidden /> : <Plus aria-hidden />}
                        aria-pressed={o.selecionada}
                        aria-label={o.selecionada ? t("desmarcarDe", { nome, edicao: o.edicaoNome }) : t("marcarDe", { nome, edicao: o.edicaoNome })}
                        disabled={!podeAlternar || travada}
                        onClick={() => aoAlternar(o)}
                      >
                        {o.selecionada ? t("naLista") : t("marcar")}
                      </Botao>
                      <a
                        className={estilos.linkLiga}
                        href={`${SITE_LIGA}${o.caminho ?? caminhoBuscaLiga(o.nome)}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label={t("verOfertasDe", { nome: o.nome })}
                      >
                        {t("verOfertas")}
                        <ExternalLink aria-hidden />
                      </a>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {vaga.opcoes.length > visiveis.length ? (
            <Botao pequeno variante="fantasma" onClick={() => setTodas(true)}>
              {t("mostrarTodas", { total: vaga.opcoes.length })}
            </Botao>
          ) : null}
        </div>
      )}
    </section>
  );
});
