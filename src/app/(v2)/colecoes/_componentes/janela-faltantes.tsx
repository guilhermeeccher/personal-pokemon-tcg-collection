"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { textoDaRecusa } from "@/app/_comum/recusa";
import { MAXIMO_SETS_POR_CRIACAO } from "@/lib/dominio/grupos-colecao";
import type { GrupoListaV2DTO } from "@/lib/dominio/lista-colecoes-v2";
import type { CriarFaltantesDTO, FaltantesCriadasDTO, FaltantesDoGrupoDTO } from "@/lib/dominio/tipos-cliente";

import { Botao } from "../../_componentes/primitivos/botao";
import { Campo } from "../../_componentes/primitivos/campo";
import { Modal } from "../../_componentes/primitivos/modal";
import { AvisoEmLinha } from "../../_componentes/primitivos/painel";
import estilos from "./organizar.module.css";
import { chaveDaRecusa, marcasDeFaltantes, nomesDeFaltantes, reacaoDaPrevia } from "./organizar";
import { pedirApi } from "./pedir-api";

/**
 * "Criar as que faltam" de um grupo ligado a uma série (COL-14): a prévia de
 * `GET /api/grupos-colecao/:id/faltantes` e a confirmação em `POST` da mesma
 * rota, que cria tudo numa transação ou nada (`criarFaltantesDoGrupo`, pelo
 * mesmo caminho de `POST /api/colecoes`: regra 4, catálogo carta a carta).
 *
 * - **Quem marca é o usuário.** Vêm marcados só os sets que o servidor manda
 *   (`marcadoPorPadrao`); promo e energia aparecem desmarcados, com o
 *   motivo. Set que já tem coleção aparece apagado, com o nome dela, e não
 *   se marca. O nome de cada coleção é editável antes de criar.
 * - **A confirmação manda o que a prévia mostrou**: a série com que ela foi
 *   lida (`serieId`) e os sets, na ordem dela. Série trocada ou set que
 *   ganhou coleção em outra aba voltam 409 e nada é gravado.
 * - **Depois de qualquer falha, a prévia é relida** e o botão fica desligado
 *   até uma leitura válida chegar; marcas e nomes ficam onde ainda valem
 *   (`marcasDeFaltantes`, `nomesDeFaltantes`). Sem resposta o servidor pode
 *   ter criado: a página relê a lista também.
 * - **O grupo sumiu ou perdeu a série** (`reacaoDaPrevia` → `fechar`): não há
 *   o que reler, e a página fecha a janela dizendo por quê.
 */
export function JanelaFaltantes({
  grupo,
  aoFechar,
  aoCriadas,
  aoEncerrar,
  aoReler,
}: {
  grupo: GrupoListaV2DTO;
  aoFechar: () => void;
  /** Criadas: os `setId` dos sets (a sugestão deles sai já) e quantas. */
  aoCriadas: (setIds: string[], total: number) => void;
  /** O grupo sumiu (404) ou perdeu a série: a página fecha com o aviso. */
  aoEncerrar: (motivo: "sumiu" | "semSerie") => void;
  /** A lista pode ter mudado por baixo: relê. */
  aoReler: () => void;
}) {
  const t = useTranslations("v2Organizar.faltantes");
  const tRecusas = useTranslations("recusas");
  const [previa, setPrevia] = useState<FaltantesDoGrupoDTO | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [nomes, setNomes] = useState<Record<string, string>>({});
  // O da leitura some quando uma leitura válida chega; o da confirmação fica,
  // porque é ele que explica por que a prévia foi relida.
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  // A recusa da confirmação: o motivo (traduzido, quando o servidor diz um) e o que aconteceu.
  const [erro, setErro] = useState<{ motivo: string; texto: string } | null>(null);
  const [relendo, setRelendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const sequencia = useRef(0);
  // As marcas da última leitura válida, com a série dela: só valem na mesma série.
  const anteriores = useRef<{ serieId: string; marcados: ReadonlySet<string> } | null>(null);
  // O estado e o callback mais recentes, sem refazer a leitura a cada render.
  const marcadosRef = useRef(marcados);
  const encerrarRef = useRef(aoEncerrar);
  useEffect(() => {
    marcadosRef.current = marcados;
    encerrarRef.current = aoEncerrar;
  });

  const encerrar = useCallback(
    (corpo: unknown) => encerrarRef.current(chaveDaRecusa(corpo) === "grupoSemSerie" ? "semSerie" : "sumiu"),
    [],
  );

  // Em promessa encadeada, não `async`: o `setState` fica no `then`, nunca no corpo do efeito que a chama.
  const carregar = useCallback(() => {
    const minha = ++sequencia.current;
    return pedirApi(`/api/grupos-colecao/${grupo.id}/faltantes`).then((r) => {
      if (minha !== sequencia.current) return; // superada por uma leitura mais nova
      setRelendo(false);
      const lida = r.corpo as FaltantesDoGrupoDTO | null;
      if (!r.ok || !lida || !Array.isArray(lida.sets)) {
        if (!r.ok && reacaoDaPrevia(r.status, r.corpo) === "fechar") {
          encerrar(r.corpo);
          return;
        }
        setPrevia(null);
        setErroLeitura(textoDaRecusa(tRecusas, r.corpo, t("erroCarregar")));
        return;
      }
      const antes = anteriores.current ? { ...anteriores.current, marcados: marcadosRef.current } : null;
      const novas = marcasDeFaltantes(lida.sets, antes, lida.serieId);
      anteriores.current = { serieId: lida.serieId, marcados: novas };
      setPrevia(lida);
      setMarcados(novas);
      setNomes((atuais) => nomesDeFaltantes(lida.sets, antes && antes.serieId === lida.serieId ? atuais : {}));
      setErroLeitura(null);
    });
  }, [grupo.id, encerrar, t, tRecusas]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function reler() {
    setPrevia(null);
    setErroLeitura(null);
    setRelendo(true);
    void carregar();
  }

  const sets = previa?.sets ?? [];
  const escolhidos = sets.filter((s) => marcados.has(s.setId));
  const nomeVazio = escolhidos.some((s) => !(nomes[s.setId] ?? "").trim());
  const demais = escolhidos.length > MAXIMO_SETS_POR_CRIACAO;
  const podeCriar = previa !== null && escolhidos.length > 0 && !demais && !nomeVazio && !enviando;

  function alternar(setId: string, valor: boolean) {
    setMarcados((atuais) => {
      const proximo = new Set(atuais);
      if (valor) proximo.add(setId);
      else proximo.delete(setId);
      return proximo;
    });
  }

  async function criar() {
    if (!podeCriar || previa === null) return;
    setErro(null);
    setEnviando(true);
    // Na ordem da prévia (lançamento), com a série que ela mostrava.
    const corpo: CriarFaltantesDTO = {
      serieId: previa.serieId,
      sets: escolhidos.map((s) => ({ setId: s.setId, nome: (nomes[s.setId] ?? "").trim() })),
    };
    const r = await pedirApi(`/api/grupos-colecao/${grupo.id}/faltantes`, "POST", corpo);
    setEnviando(false);
    if (r.ok) {
      const criadas = (r.corpo as Partial<FaltantesCriadasDTO> | null)?.criadas;
      aoCriadas(
        escolhidos.map((s) => s.setId),
        Array.isArray(criadas) ? criadas.length : escolhidos.length,
      );
      return;
    }
    aoReler();
    if (r.status !== null && reacaoDaPrevia(r.status, r.corpo) === "fechar") {
      encerrar(r.corpo);
      return;
    }
    setErro(
      r.status === null
        ? { motivo: "", texto: t("erroRede") }
        : { motivo: textoDaRecusa(tRecusas, r.corpo, ""), texto: t("erroCriar") },
    );
    reler();
  }

  return (
    <Modal
      aberto
      onFechar={enviando ? () => {} : aoFechar}
      titulo={t("titulo", { grupo: grupo.nome })}
      descricao={previa ? t("descricao", { serie: previa.serieRotulo }) : t("descricaoCarregando")}
      largura={640}
      fecharPeloVeu={false}
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar} disabled={enviando}>
            {t("cancelar")}
          </Botao>
          <Botao variante="primario" carregando={enviando} disabled={!podeCriar} onClick={() => void criar()}>
            {t("criar", { total: escolhidos.length })}
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
      {previa && sets.length === 0 && <p className={estilos.mudo}>{t("semSets")}</p>}
      {previa && sets.length > 0 && (
        <p className={`${estilos.mudo} v2-num`}>{t("marcados", { marcados: escolhidos.length, total: sets.length })}</p>
      )}
      <ul className={estilos.listaPrevia}>
        {sets.map((s) => {
          const jaTem = s.colecoesExistentes.length > 0;
          const marcado = marcados.has(s.setId);
          const ano = s.lancamento ? s.lancamento.slice(0, 4) : null;
          const detalhes = [s.sigla, ano, t("cartasOficiais", { total: s.qtdOficial })]
            .filter((x): x is string => Boolean(x))
            .join(" · ");
          return (
            <li key={s.setId} className={[estilos.itemPrevia, jaTem ? estilos.itemApagado : null].filter(Boolean).join(" ")}>
              <label className={estilos.rotuloMarca}>
                <input
                  type="checkbox"
                  className={estilos.caixa}
                  checked={marcado}
                  disabled={jaTem || enviando}
                  onChange={(e) => alternar(s.setId, e.target.checked)}
                />
                <span className={estilos.textoMarca}>
                  <b>{s.nome}</b>
                  <span className={estilos.mudo}>{detalhes}</span>
                </span>
              </label>
              {jaTem && (
                <p className={`${estilos.mudo} ${estilos.recuo}`}>
                  {t("jaTem", { colecoes: s.colecoesExistentes.map((c) => c.nome).join(", ") })}
                </p>
              )}
              {!jaTem && !marcado && s.motivoDesmarcado && (
                <div className={estilos.recuo}>
                  <span className={estilos.etiquetaAlerta}>{t(`motivo.${s.motivoDesmarcado}`)}</span>
                </div>
              )}
              {!jaTem && marcado && (
                <div className={estilos.recuo}>
                  <Campo
                    aria-label={t("nomeDaColecao", { set: s.nome })}
                    value={nomes[s.setId] ?? ""}
                    disabled={enviando}
                    autoComplete="off"
                    onChange={(e) => setNomes((atuais) => ({ ...atuais, [s.setId]: e.target.value }))}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {nomeVazio && <AvisoEmLinha tom="alerta">{t("nomeVazio")}</AvisoEmLinha>}
      {demais && <AvisoEmLinha tom="alerta">{t("demais", { maximo: MAXIMO_SETS_POR_CRIACAO })}</AvisoEmLinha>}
    </Modal>
  );
}
