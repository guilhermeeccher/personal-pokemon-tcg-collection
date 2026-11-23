"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { textoDaRecusa } from "@/app/_comum/recusa";
import { MAXIMO_COLECOES_POR_TRAZER } from "@/lib/dominio/grupos-colecao";
import type { GrupoListaV2DTO } from "@/lib/dominio/lista-colecoes-v2";
import type { ExistentesDoGrupoDTO, TrazerExistentesDTO } from "@/lib/dominio/tipos-cliente";

import { Botao } from "../../_componentes/primitivos/botao";
import { Modal } from "../../_componentes/primitivos/modal";
import { AvisoEmLinha } from "../../_componentes/primitivos/painel";
import estilos from "./organizar.module.css";
import { chaveDaRecusa, marcasDeExistentes, origensDaPrevia, reacaoDaPrevia } from "./organizar";
import { pedirApi } from "./pedir-api";

/**
 * "Trazer as existentes" para um grupo ligado a uma série (COL-15): a prévia
 * de `GET /api/grupos-colecao/:id/existentes` e a confirmação em `POST` da
 * mesma rota, que move tudo numa transação ou nada.
 *
 * - **Só vêm marcadas as que não estão em grupo nenhum**; tirar uma de outro
 *   grupo é escolha do usuário, e a linha diz de onde ela sai.
 * - **A confirmação manda o que a prévia mostrou**: a série com que ela foi
 *   lida e, de cada coleção, o grupo de onde sai (`grupoOrigemId`). Se um
 *   dos dois mudou em outra aba, o servidor recusa com 409 e nada é movido —
 *   uma coleção que outra aba pôs num grupo nunca é tirada de lá sem que a
 *   escolha tenha estado na tela.
 * - **A janela não mostra o nome da série**: o rótulo da página pode ser de
 *   uma série que outra aba já trocou, e a prévia relida listaria as coleções
 *   da nova sob o nome da antiga.
 * - **Depois de qualquer falha a prévia é relida**, com o botão desligado até
 *   uma leitura válida; a marca fica só onde a coleção sai do mesmo grupo
 *   (`marcasDeExistentes`). O grupo que sumiu ou perdeu a série fecha a
 *   janela pela página.
 */
export function JanelaExistentes({
  grupo,
  aoFechar,
  aoTrazidas,
  aoEncerrar,
  aoReler,
}: {
  grupo: GrupoListaV2DTO;
  aoFechar: () => void;
  aoTrazidas: (total: number) => void;
  aoEncerrar: (motivo: "sumiu" | "semSerie") => void;
  aoReler: () => void;
}) {
  const t = useTranslations("v2Organizar.existentes");
  const tRecusas = useTranslations("recusas");
  const [previa, setPrevia] = useState<ExistentesDoGrupoDTO | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [erro, setErro] = useState<{ motivo: string; texto: string } | null>(null);
  const [relendo, setRelendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const sequencia = useRef(0);
  // De que grupo cada coleção saía na última leitura válida.
  const origens = useRef<Map<string, string | null> | null>(null);
  // O estado e o callback mais recentes, sem refazer a leitura a cada render.
  const marcadasRef = useRef(marcadas);
  const encerrarRef = useRef(aoEncerrar);
  useEffect(() => {
    marcadasRef.current = marcadas;
    encerrarRef.current = aoEncerrar;
  });

  // Em promessa encadeada, não `async`: o `setState` fica no `then`, nunca no corpo do efeito que a chama.
  const carregar = useCallback(() => {
    const minha = ++sequencia.current;
    return pedirApi(`/api/grupos-colecao/${grupo.id}/existentes`).then((r) => {
      if (minha !== sequencia.current) return; // superada por uma leitura mais nova
      setRelendo(false);
      const lida = r.corpo as ExistentesDoGrupoDTO | null;
      if (!r.ok || !lida || !Array.isArray(lida.colecoes)) {
        if (!r.ok && reacaoDaPrevia(r.status, r.corpo) === "fechar") {
          encerrarRef.current(chaveDaRecusa(r.corpo) === "grupoSemSerie" ? "semSerie" : "sumiu");
          return;
        }
        setPrevia(null);
        setErroLeitura(textoDaRecusa(tRecusas, r.corpo, t("erroCarregar")));
        return;
      }
      const novas = marcasDeExistentes(lida.colecoes, origens.current, marcadasRef.current);
      origens.current = origensDaPrevia(lida.colecoes);
      setPrevia(lida);
      setMarcadas(novas);
      setErroLeitura(null);
    });
  }, [grupo.id, t, tRecusas]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function reler() {
    setPrevia(null);
    setErroLeitura(null);
    setRelendo(true);
    void carregar();
  }

  const colecoes = previa?.colecoes ?? [];
  const escolhidas = colecoes.filter((c) => marcadas.has(c.id));
  const demais = escolhidas.length > MAXIMO_COLECOES_POR_TRAZER;
  const podeTrazer = previa !== null && escolhidas.length > 0 && !demais && !enviando;

  function alternar(id: string, valor: boolean) {
    setMarcadas((atuais) => {
      const proximo = new Set(atuais);
      if (valor) proximo.add(id);
      else proximo.delete(id);
      return proximo;
    });
  }

  async function trazer() {
    if (!podeTrazer || previa === null) return;
    setErro(null);
    setEnviando(true);
    // Na ordem da prévia, que é a da lista: elas entram no fim do grupo assim.
    const corpo: TrazerExistentesDTO = {
      serieId: previa.serieId,
      itens: escolhidas.map((c) => ({ id: c.id, grupoOrigemId: c.grupoAtual?.id ?? null })),
    };
    const r = await pedirApi(`/api/grupos-colecao/${grupo.id}/existentes`, "POST", corpo);
    setEnviando(false);
    if (r.ok) {
      const movidas = (r.corpo as { movidas?: unknown } | null)?.movidas;
      aoTrazidas(typeof movidas === "number" ? movidas : escolhidas.length);
      return;
    }
    aoReler();
    if (r.status !== null && reacaoDaPrevia(r.status, r.corpo) === "fechar") {
      aoEncerrar(chaveDaRecusa(r.corpo) === "grupoSemSerie" ? "semSerie" : "sumiu");
      return;
    }
    setErro(
      r.status === null
        ? { motivo: "", texto: t("erroRede") }
        : { motivo: textoDaRecusa(tRecusas, r.corpo, ""), texto: t("erroTrazer") },
    );
    reler();
  }

  return (
    <Modal
      aberto
      onFechar={enviando ? () => {} : aoFechar}
      titulo={t("titulo", { grupo: grupo.nome })}
      descricao={t("descricao")}
      largura={600}
      fecharPeloVeu={false}
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar} disabled={enviando}>
            {t("cancelar")}
          </Botao>
          <Botao variante="primario" carregando={enviando} disabled={!podeTrazer} onClick={() => void trazer()}>
            {t("trazer", { total: escolhidas.length })}
          </Botao>
        </>
      }
    >
      {erro && (
        <AvisoEmLinha tom="perigo" papel="alert" titulo={erro.motivo || undefined}>
          {erro.texto}
        </AvisoEmLinha>
      )}
      {previa === null && erroLeitura === null && (
        <p className={estilos.mudo} role="status">
          {relendo ? t("relendo") : t("carregando")}
        </p>
      )}
      {erroLeitura && (
        <AvisoEmLinha
          tom="perigo"
          papel="alert"
          acao={
            <Botao pequeno onClick={reler} disabled={enviando}>
              {t("tentarDeNovo")}
            </Botao>
          }
        >
          {erroLeitura}
        </AvisoEmLinha>
      )}
      {previa && colecoes.length === 0 && <p className={estilos.mudo}>{t("nenhuma")}</p>}
      {previa && colecoes.length > 0 && (
        <p className={`${estilos.mudo} v2-num`}>{t("marcadas", { marcadas: escolhidas.length, total: colecoes.length })}</p>
      )}
      <ul className={estilos.listaPrevia}>
        {colecoes.map((c) => (
          <li key={c.id} className={estilos.itemPrevia}>
            <label className={estilos.rotuloMarca}>
              <input
                type="checkbox"
                className={estilos.caixa}
                checked={marcadas.has(c.id)}
                disabled={enviando}
                onChange={(e) => alternar(c.id, e.target.checked)}
              />
              <span className={estilos.textoMarca}>
                <b>{c.nome}</b>
                <span className={estilos.mudo}>{c.grupoAtual ? t("saiDe", { grupo: c.grupoAtual.nome }) : t("semGrupo")}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {demais && <AvisoEmLinha tom="alerta">{t("demais", { maximo: MAXIMO_COLECOES_POR_TRAZER })}</AvisoEmLinha>}
    </Modal>
  );
}
