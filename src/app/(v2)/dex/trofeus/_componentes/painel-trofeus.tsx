"use client";

/**
 * Troféus na v2 (pacote 5e-b), portado de `(v1)/v1/dex/trofeus/painel-trofeus.tsx`
 * — nunca importado de lá. A lista de cada jogo vem na ordem do arquivo, que
 * é a da história; a platina é derivada (`progressoTrofeus`), nunca uma linha.
 *
 * - **O HOME conta sozinho.** Os troféus dele são calculados dos registros
 *   (`comTrofeusDoHome`, no servidor) e não têm botão de marcar nem de
 *   desfazer; a rota recusa marcá-los (`dexTrofeuCalculado`). O que falta
 *   oferece só "Caçar".
 * - **Checkpoint diz o que libera.** Enquanto não conquistado, aparece com
 *   cadeado e com "Libera N espécies", em texto (a cor é realce, regra 1).
 * - **Marcar pede a data** ali mesmo, com hoje (o local, `hojeLocal`) já
 *   preenchido; desfazer pergunta pelo diálogo de confirmação da v2, e
 *   cancelar não envia nada.
 * - **"Caçar" cria um plano** com o troféu como alvo e leva aos planos. Não
 *   marca nada.
 *
 * Toda recusa vira frase por `recusa.ts`. Um 404 ou 409 quer dizer que a
 * lista está velha (outra aba mexeu): a página é lida de novo.
 */

import { Lock, Medal, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";

import { hojeLocal } from "@/app/_comum/dex/hoje";
import { textoDaRecusa } from "@/app/_comum/recusa";
import { progressoTrofeus, type IdiomaTrofeu, type NivelTrofeu } from "@/lib/dominio/dex-trofeus";
import type { TrofeuDexDTO } from "@/lib/dominio/tipos-cliente";

import { useAviso } from "../../../_componentes/primitivos/aviso-flutuante";
import { Botao, BotaoLink } from "../../../_componentes/primitivos/botao";
import { Campo } from "../../../_componentes/primitivos/campo";
import { useConfirmacao } from "../../../_componentes/primitivos/dialogo-confirmacao";
import { AvisoEmLinha, Painel } from "../../../_componentes/primitivos/painel";

import { DataCurta } from "./data-curta";
import { acoesDoTrofeu, dataDeConquistaValida, jogoQueAbre, trofeusVisiveis, type AbaTrofeus } from "./regras-trofeus";
import estilos from "./trofeus.module.css";

/** As cores dos níveis: só realce, o nível também vem escrito. As mesmas da visão geral da Dex. */
const COR_NIVEL: Record<NivelTrofeu | "platina", string> = {
  bronze: "#d59a6a",
  prata: "#c9ced8",
  ouro: "#ffd27a",
  platina: "#d9e4f5",
};

export function PainelTrofeus({
  jogos,
  trofeus,
  jogoInicial,
}: {
  /** As abas: o HOME e os jogos da pessoa que têm troféus (`abasDeTrofeus`). */
  jogos: AbaTrofeus[];
  trofeus: TrofeuDexDTO[];
  /** O `?jogo=` da URL, cru: um jogo que não é aba abre a primeira. */
  jogoInicial: string;
}) {
  const t = useTranslations("v2DexTrofeus");
  const td = useTranslations("dex.trofeus");
  const tr = useTranslations("recusas");
  const idioma = useLocale() as IdiomaTrofeu;
  const router = useRouter();
  const avisar = useAviso();
  const { confirmar, dialogo } = useConfirmacao();
  const idLista = useId();

  const [jogoId, setJogoId] = useState(() => jogoQueAbre(jogos, jogoInicial));
  const [soFalta, setSoFalta] = useState(false);
  const [marcando, setMarcando] = useState<{ id: string; data: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const doJogo = useMemo(() => trofeus.filter((x) => x.jogoId === jogoId), [trofeus, jogoId]);
  const obtidos = useMemo(() => new Set(doJogo.filter((x) => x.obtido).map((x) => x.id)), [doJogo]);
  const progresso = progressoTrofeus(doJogo, jogoId, obtidos);
  const visiveis = trofeusVisiveis(trofeus, jogoId, soFalta);
  const titulo = (id: string) => trofeus.find((x) => x.id === id)?.textos[idioma].titulo ?? id;
  const nomeJogo = jogos.find((j) => j.jogoId === jogoId)?.nome ?? jogoId;

  /** Um pedido por vez. `true` no 2xx; a recusa vira frase em `erro`. */
  async function enviar(url: string, method: string, corpo?: unknown): Promise<boolean> {
    setOcupado(true);
    setErro(null);
    try {
      const r = await fetch(url, {
        method,
        ...(corpo === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }),
      });
      if (!r.ok) {
        setErro(textoDaRecusa(tr, await r.json().catch(() => null), td("erro")));
        // A lista desta tela está velha (outra aba desfez, o troféu saiu do arquivo): relê.
        if (r.status === 404 || r.status === 409) router.refresh();
        return false;
      }
      return true;
    } catch {
      setErro(td("erro"));
      return false;
    } finally {
      setOcupado(false);
    }
  }

  function trocarJogo(id: string) {
    setJogoId(id);
    setMarcando(null);
    setErro(null);
  }

  async function confirmarConquista() {
    if (!marcando || !dataDeConquistaValida(marcando.data)) return;
    if (await enviar("/api/dex/trofeus", "POST", { trofeuId: marcando.id, obtidoEm: marcando.data })) {
      setMarcando(null);
      avisar(t("marcado"), { tom: "sucesso" });
      router.refresh();
    }
  }

  async function desfazer(x: TrofeuDexDTO) {
    const nome = x.textos[idioma].titulo;
    const ok = await confirmar({
      titulo: t("desfazerTitulo", { trofeu: nome }),
      descricao: t("desfazerTexto"),
      rotuloConfirmar: t("desfazerConfirmar"),
      perigoso: true,
    });
    if (!ok) return;
    if (await enviar(`/api/dex/trofeus/${encodeURIComponent(x.id)}`, "DELETE")) {
      avisar(t("desfeito"), { tom: "sucesso" });
      router.refresh();
    }
  }

  async function cacar(x: TrofeuDexDTO) {
    const ok = await enviar("/api/dex/planos", "POST", {
      titulo: td("tituloPlanoCacar", { trofeu: x.textos[idioma].titulo }),
      inicio: hojeLocal(),
      trofeuIds: [x.id],
    });
    if (ok) {
      avisar(t("planoCriado"), { tom: "sucesso" });
      router.push("/dex/planos");
    }
  }

  return (
    <div className={estilos.pagina}>
      <header className={estilos.cabecalho}>
        <div>
          <p className={estilos.sobretitulo}>Living Dex</p>
          <h1 className={estilos.titulo}>{td("titulo")}</h1>
          <p className={estilos.subtitulo}>{t("descricao")}</p>
        </div>
        <nav aria-label={t("atalhos")} className={estilos.acoes}>
          <BotaoLink href="/dex" pequeno>
            {t("visaoGeral")}
          </BotaoLink>
          <BotaoLink href="/dex/planos" pequeno>
            {t("planos")}
          </BotaoLink>
        </nav>
      </header>

      {jogos.length === 0 ? (
        <Painel>
          <p className={estilos.textoFraco}>{td("nenhumJogo")}</p>
        </Painel>
      ) : (
        <>
          <div className={estilos.chips} role="group" aria-label={td("jogo")}>
            {jogos.map((j) => (
              <button
                key={j.jogoId}
                type="button"
                className={estilos.chip}
                data-ativo={jogoId === j.jogoId || undefined}
                aria-pressed={jogoId === j.jogoId}
                aria-controls={idLista}
                onClick={() => trocarJogo(j.jogoId)}
              >
                {j.nome}
              </button>
            ))}
          </div>

          <Painel as="section" className={estilos.resumo} aria-labelledby={`${idLista}-resumo`}>
            <h2 id={`${idLista}-resumo`} className="v2-so-leitor">
              {t("resumo", { jogo: nomeJogo })}
            </h2>
            <div className={estilos.platina} data-conquistada={progresso.platina || undefined}>
              <Trophy
                size={30}
                aria-hidden
                style={{ color: progresso.platina ? COR_NIVEL.platina : "var(--v2-tinta-3)" }}
              />
              <div className={estilos.platinaTexto}>
                <b>{progresso.platina ? td("platinaConquistada") : td("platina")}</b>
                <span className={estilos.textoFraco}>{progresso.platina ? t("platinaFeita") : t("platinaComo")}</span>
                <Barra valor={progresso.obtidos} maximo={progresso.total} cor={COR_NIVEL.platina} />
              </div>
              <span className={`${estilos.contagem} v2-num`}>
                {t("contagem", { obtidos: progresso.obtidos, total: progresso.total })}
              </span>
            </div>
            <ul className={estilos.niveis} aria-label={t("porNivel")}>
              {(["ouro", "prata", "bronze"] as const).map((n) => (
                <li key={n}>
                  <Medal size={18} aria-hidden style={{ color: COR_NIVEL[n] }} />
                  <span>{td(`nivel.${n}`)}</span>
                  <b className="v2-num">
                    {progresso.porNivel[n].obtidos}/{progresso.porNivel[n].total}
                  </b>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className={estilos.chip}
              data-ativo={soFalta || undefined}
              aria-pressed={soFalta}
              aria-controls={idLista}
              onClick={() => setSoFalta(!soFalta)}
            >
              {td("soFalta")}
            </button>
          </Painel>

          {erro && (
            <AvisoEmLinha tom="perigo" papel="alert">
              {erro}
            </AvisoEmLinha>
          )}

          <ul id={idLista} className={estilos.lista} aria-label={t("lista", { jogo: nomeJogo })}>
            {visiveis.length === 0 && (
              <li>
                <Painel>
                  <p className={estilos.textoFraco}>{t("nadaFalta")}</p>
                </Painel>
              </li>
            )}
            {visiveis.map((x) => {
              const texto = x.textos[idioma];
              const acoes = acoesDoTrofeu(x);
              const trancado = x.tipo === "checkpoint" && !x.obtido;
              return (
                <Painel as="li" key={x.id} className={estilos.trofeu} data-obtido={x.obtido ? true : undefined}>
                  <span className={estilos.icone} aria-hidden style={{ color: x.obtido ? COR_NIVEL[x.nivel] : undefined }}>
                    {trancado ? <Lock size={20} /> : <Medal size={22} />}
                  </span>
                  <div className={estilos.corpo}>
                    <h3 className={estilos.trofeuTitulo}>{texto.titulo}</h3>
                    <p className={estilos.selos}>
                      <span className={estilos.selo} data-nivel={x.nivel}>
                        {td(`nivel.${x.nivel}`)}
                      </span>
                      {x.tipo === "checkpoint" && (
                        <span className={estilos.selo} data-tom="acento">
                          {td("libera", { quantidade: String(x.libera.length) })}
                        </span>
                      )}
                      {x.tipo === "calculado" && <span className={estilos.selo}>{t("calculado")}</span>}
                      {x.obtido ? (
                        <span className={estilos.selo} data-tom="sucesso">
                          {x.obtido.em ? (
                            <>
                              {t("conquistadoEm")} <DataCurta iso={x.obtido.em} />
                            </>
                          ) : (
                            td("conquistado")
                          )}
                        </span>
                      ) : (
                        <span className={estilos.selo} data-tom="fraco">
                          {trancado ? t("trancado") : t("falta")}
                        </span>
                      )}
                    </p>
                    <p className={estilos.descricao}>{texto.descricao}</p>
                    {!x.obtido && x.requer.length > 0 && (
                      <p className={estilos.textoFraco}>{td("depoisDe", { trofeus: x.requer.map(titulo).join(", ") })}</p>
                    )}
                    {x.tipo === "calculado" && <p className={estilos.textoFraco}>{td("contaSozinho")}</p>}

                    {marcando?.id === x.id ? (
                      <form
                        className={estilos.marcar}
                        onSubmit={(e) => {
                          e.preventDefault();
                          void confirmarConquista();
                        }}
                      >
                        <Campo
                          type="date"
                          rotulo={td("data")}
                          value={marcando.data}
                          required
                          autoFocus
                          erro={dataDeConquistaValida(marcando.data) ? undefined : t("dataInvalida")}
                          onChange={(e) => setMarcando({ id: x.id, data: e.target.value })}
                        />
                        <div className={estilos.botoes}>
                          <Botao
                            type="submit"
                            variante="primario"
                            pequeno
                            carregando={ocupado}
                            disabled={!dataDeConquistaValida(marcando.data)}
                          >
                            {td("confirmar")}
                          </Botao>
                          <Botao variante="fantasma" pequeno disabled={ocupado} onClick={() => setMarcando(null)}>
                            {td("cancelar")}
                          </Botao>
                        </div>
                      </form>
                    ) : (
                      acoes.length > 0 && (
                        <div className={estilos.botoes}>
                          {acoes.includes("conquistei") && (
                            <Botao
                              variante="primario"
                              pequeno
                              disabled={ocupado}
                              onClick={() => {
                                setErro(null);
                                setMarcando({ id: x.id, data: hojeLocal() });
                              }}
                            >
                              {td("conquistei")}
                            </Botao>
                          )}
                          {acoes.includes("cacar") && (
                            <Botao pequeno disabled={ocupado} onClick={() => void cacar(x)}>
                              {td("cacar")}
                            </Botao>
                          )}
                          {acoes.includes("desfazer") && (
                            <Botao variante="fantasma" pequeno disabled={ocupado} onClick={() => void desfazer(x)}>
                              {td("desfazer")}
                            </Botao>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </Painel>
              );
            })}
          </ul>
        </>
      )}
      {dialogo}
    </div>
  );
}

/** A barra de progresso, só desenho: o número vem escrito ao lado. */
function Barra({ valor, maximo, cor }: { valor: number; maximo: number; cor?: string }) {
  const fracao = maximo > 0 ? Math.min(Math.max(valor / maximo, 0), 1) : 0;
  return (
    <span className={estilos.barra} aria-hidden>
      <span style={{ width: `${fracao * 100}%`, background: cor }} />
    </span>
  );
}
