"use client";

import { Check, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import type { TipoColecao } from "@/lib/dominio/parametro-colecao";
import type { AlternativasDaVagaV2DTO, OpcaoFaltaV2DTO, VagaGradeV2DTO } from "@/lib/dominio/tipos-cliente";

import { Carta } from "../../../_componentes/carta/carta";
import { useFormatos } from "../../../_componentes/detalhe/formatos";
import { useAviso } from "../../../_componentes/primitivos/aviso-flutuante";
import { Botao } from "../../../_componentes/primitivos/botao";
import { useConfirmacao } from "../../../_componentes/primitivos/dialogo-confirmacao";

import { type CorpoSelecao, type DesfechoDaSelecao, corpoDoAlvo } from "./compra-falta";
import { enviarSelecao } from "./envio-selecao";
import estilos from "./falta.module.css";
import { LinhaPreco, textoDoCriterio } from "./preco-compra";

/** Quantas opções aparecem de cada vez: uma espécie popular tem mais de cem cartas, cada uma com foto. */
const OPCOES_POR_VEZ = 24;

type Leitura =
  | { estado: "carregando" }
  | { estado: "ok"; dados: AlternativasDaVagaV2DTO }
  | { estado: "sumiu" }
  | { estado: "erro" };

/**
 * As opções de compra de **uma** vaga vazia, e o que dela já está na lista
 * (pacote 1e). Mora em dois lugares, o mesmo componente: na folha que o toque
 * numa vaga da Pokédex abre (decisão 2), e no detalhe da carta, pelo ponto de
 * extensão `secaoCompra` (regra 24 de `rules.md`), onde substitui as escolhas
 * só de leitura.
 *
 * - **As opções vêm sob demanda**, de `GET .../falta/alternativas?chave=`, na
 *   ordem do critério, com foto: o que a tela de opções da v1 mostra para essa
 *   vaga, com o filtro de sem estoque dela (a carta marcada nunca some).
 * - **Cada carta entra e sai pelo nome.** Várias por vaga continuam
 *   permitidas (decisão de 2026-09-17); "Limpar a vaga" é ação nomeada, com
 *   confirmação, nunca um toque.
 * - **Sem preço, a escolha é manual**: a opção sem preço se marca igual, e a
 *   linha diz que não há preço (antes da primeira busca, ou o Cardmarket não
 *   tem). Na Liga, marcar só sobre opções de varreduras salvas — consulta nova
 *   não existe aqui.
 * - Cada escrita relê as opções e chama `aoMudar` (quem abriu relê a grade).
 *   Uma recusa diz o porquê e relê também.
 */
export function SecaoCompraVaga({
  colecaoId,
  tipo,
  vaga,
  aoMudar,
}: {
  colecaoId: string;
  tipo: TipoColecao;
  vaga: VagaGradeV2DTO;
  aoMudar: () => void;
}) {
  const t = useTranslations("v2Falta.opcoes");
  const tCriterio = useTranslations("v2Falta.criterio");
  const tRecusa = useTranslations("v2Falta.recusa");
  const formatos = useFormatos();
  const avisar = useAviso();
  const { confirmar, dialogo } = useConfirmacao();

  const [leitura, setLeitura] = useState<Leitura>({ estado: "carregando" });
  const [pedido, setPedido] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [mostrar, setMostrar] = useState(OPCOES_POR_VEZ);
  const reler = useCallback(() => setPedido((p) => p + 1), []);

  // As escolhas da grade mudam quando outra parte da tela marca: relê junto.
  const assinaturaEscolhas = (vaga.escolhas ?? []).map((e) => e.id).join(",");

  useEffect(() => {
    const controle = new AbortController();
    fetch(`/api/colecoes/${colecaoId}/falta/alternativas?chave=${encodeURIComponent(vaga.chave)}`, {
      cache: "no-store",
      signal: controle.signal,
    })
      .then(async (r) => {
        if (r.status === 404) return "sumiu" as const;
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as AlternativasDaVagaV2DTO;
      })
      .then((d) => {
        if (controle.signal.aborted) return;
        setLeitura(d === "sumiu" ? { estado: "sumiu" } : { estado: "ok", dados: d });
      })
      .catch(() => {
        if (controle.signal.aborted) return;
        setLeitura((atual) => (atual.estado === "ok" ? atual : { estado: "erro" }));
      });
    return () => controle.abort();
  }, [colecaoId, vaga.chave, assinaturaEscolhas, pedido]);

  function textoDoDesfecho(d: Exclude<DesfechoDaSelecao, { tipo: "ok" }>): string {
    return d.tipo === "parcial" ? tRecusa("parcial") : tRecusa(d.motivo);
  }

  async function enviar(corpos: CorpoSelecao[], sucesso?: string) {
    setOcupado(true);
    const desfecho = await enviarSelecao(colecaoId, corpos);
    setOcupado(false);
    if (desfecho.tipo === "ok") {
      if (sucesso) avisar(sucesso, { tom: "sucesso" });
    } else {
      avisar(textoDoDesfecho(desfecho), { tom: "erro" });
    }
    reler();
    aoMudar();
  }

  function alternar(o: OpcaoFaltaV2DTO) {
    const corpo = corpoDoAlvo(o.alvo, !o.selecionada);
    if (!corpo) return;
    void enviar([corpo]);
  }

  async function limparVaga() {
    const escolhas = vaga.escolhas ?? [];
    const ok = await confirmar({
      titulo: t("limparTitulo", { total: escolhas.length }),
      descricao: t("limparDescricao"),
      rotuloConfirmar: t("limpar"),
    });
    if (!ok) return;
    void enviar([{ ids: escolhas.map((e) => e.id), selecionada: false }], t("limpa"));
  }

  const escolhas = vaga.escolhas ?? [];
  const dados = leitura.estado === "ok" ? leitura.dados : null;
  // Na Liga sem varredura o critério vem nulo: é o único caso em que ele falta.
  const ligaSemVarredura = dados !== null && dados.criterio === null;
  const opcoes = dados?.opcoes ?? [];
  const visiveis = opcoes.slice(0, mostrar);

  return (
    <section className={estilos.secaoCompra} aria-labelledby={`v2-compra-${vaga.id}`} aria-busy={ocupado || undefined}>
      <h3 id={`v2-compra-${vaga.id}`} className={estilos.tituloBloco}>
        {t("titulo")}
      </h3>

      <div className={estilos.blocoCompra}>
        <h4 className={estilos.subtituloBloco}>{t("naLista")}</h4>
        {escolhas.length === 0 ? (
          <p className={estilos.sutil}>{t("nenhumaNaLista")}</p>
        ) : (
          <ul className={estilos.listaSimples}>
            {escolhas.map((e) => (
              <li key={e.id} className={estilos.linhaEscolha}>
                <span className={estilos.nomeEscolha}>{e.nome}</span>
                <Botao
                  pequeno
                  variante="fantasma"
                  icone={<X aria-hidden />}
                  disabled={ocupado}
                  aria-label={t("tirarDe", { nome: e.nome })}
                  onClick={() => void enviar([{ ids: [e.id], selecionada: false }])}
                >
                  {t("tirar")}
                </Botao>
              </li>
            ))}
          </ul>
        )}
        {escolhas.length > 1 ? (
          <Botao pequeno variante="secundario" disabled={ocupado} onClick={() => void limparVaga()}>
            {t("limpar")}
          </Botao>
        ) : null}
      </div>

      <div className={estilos.blocoCompra}>
        <h4 className={estilos.subtituloBloco}>{tipo === "pokedex" ? t("opcoesPokedex") : t("opcoesSet")}</h4>
        {dados?.criterio ? <p className={estilos.sutil}>{textoDoCriterio(tCriterio, dados.criterio, formatos)}</p> : null}
        {leitura.estado === "carregando" ? <p className={estilos.sutil}>{t("carregando")}</p> : null}
        {leitura.estado === "erro" ? (
          <p className={estilos.sutil} role="alert">
            {t("erro")}{" "}
            <Botao pequeno variante="fantasma" onClick={reler}>
              {t("tentarDeNovo")}
            </Botao>
          </p>
        ) : null}
        {leitura.estado === "sumiu" ? <p className={estilos.sutil}>{t("sumiu")}</p> : null}
        {dados && opcoes.length === 0 ? (
          <p className={estilos.sutil}>{ligaSemVarredura ? t("vazioLigaSemVarredura") : tipo === "pokedex" ? t("vazioPokedex") : t("vazioSet")}</p>
        ) : null}
        {visiveis.length > 0 ? (
          <ul className={estilos.listaOpcoes}>
            {visiveis.map((o) => {
              const soSai = o.alvo.tipo === "escolha";
              return (
                <li key={o.id} className={`${estilos.opcaoCompra} ${o.selecionada ? estilos.opcaoMarcada : ""}`}>
                  <span className={estilos.miniatura}>
                    <Carta imagemUrl={o.imagemUrl ?? null} origem={o.imagemOrigem ?? null} alt="" raridade={o.raridade} />
                  </span>
                  <span className={estilos.opcaoTexto}>
                    <span className={estilos.nomeOpcao}>{o.nomeExibicao ?? o.nome}</span>
                    <span className={estilos.sutil}>
                      {[o.edicaoNome, o.total ? `${o.numero}/${o.total}` : o.numero, o.raridade].filter(Boolean).join(" · ")}
                    </span>
                    <LinhaPreco preco={o.preco} consultadaSemPrecoEm={o.consultadaSemPrecoEm} formatos={formatos} />
                    {o.semEstoque ? <span className={estilos.etiquetaAviso}>{t("semEstoque")}</span> : null}
                    {soSai ? <span className={estilos.sutil}>{t("soSai")}</span> : null}
                  </span>
                  <Botao
                    pequeno
                    variante={o.selecionada ? "primario" : "secundario"}
                    icone={o.selecionada ? <Check aria-hidden /> : <Plus aria-hidden />}
                    aria-pressed={o.selecionada}
                    aria-label={o.selecionada ? t("desmarcarDe", { nome: o.nomeExibicao ?? o.nome }) : t("marcarDe", { nome: o.nomeExibicao ?? o.nome })}
                    disabled={ocupado || (soSai && !o.selecionada)}
                    onClick={() => alternar(o)}
                  >
                    {o.selecionada ? t("naListaCurto") : t("marcar")}
                  </Botao>
                </li>
              );
            })}
          </ul>
        ) : null}
        {opcoes.length > mostrar ? (
          <Botao pequeno variante="fantasma" onClick={() => setMostrar((m) => m + OPCOES_POR_VEZ)}>
            {t("mostrarMais", { total: opcoes.length - mostrar })}
          </Botao>
        ) : null}
        {dados && (dados.descartadas > 0 || dados.semEstoque > 0) ? (
          <p className={estilos.sutil}>
            {[
              dados.descartadas > 0 ? t("escondidasTeto", { total: dados.descartadas }) : null,
              dados.semEstoque > 0 ? t("escondidasSemEstoque", { total: dados.semEstoque }) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
      </div>
      {dialogo}
    </section>
  );
}
