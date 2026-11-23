"use client";

import { useTranslations } from "next-intl";
import { startTransition, useCallback, useEffect, useState } from "react";

import { urlSpritePokemon } from "@/lib/imagens";
import type { DetalheCartaV2DTO, GradeColecaoV2DTO, VagaGradeV2DTO } from "@/lib/dominio/tipos-cliente";

import { Carta } from "../_componentes/carta/carta";
import { type AberturaDetalhe, DetalheCarta, type EventoDetalhe } from "../_componentes/detalhe/detalhe-carta";
import { nomeTransicaoCarta } from "../_componentes/movimento/nome-transicao";
import { TransicaoVista } from "../_componentes/movimento/transicao-vista";
import { AvisoEmLinha, Painel } from "../_componentes/primitivos/painel";
import estilos from "./laboratorio.module.css";

export interface ParametrosDetalhe {
  colecao: string | null;
  vaga: string | null;
  carta: string | null;
  copia: string | null;
  /** `abrir=1`: abre o detalhe ao carregar (para captura de tela sem clique). */
  abrir: boolean;
}

/** Quantas vagas de cada grupo o laboratório oferece: o bastante para provar cada estado. */
const POR_GRUPO = 6;

type Aberta = { tipo: "vaga"; id: string } | { tipo: "copia" };

type Grupo = "preenchidas" | "upgrade" | "livres" | "vazias";

function grupoDaVaga(v: VagaGradeV2DTO): Grupo {
  if (v.copia) return v.upgrade ? "upgrade" : "preenchidas";
  return v.livres ? "livres" : "vazias";
}

/**
 * O detalhe de carta no laboratório, aberto com ids reais da instalação
 * (`?colecao=&vaga=`, `?carta=&copia=`), antes de a coleção e o inventário
 * o ligarem. Faz o papel de quem abre: lê a grade, abre dentro de
 * `startTransition` tirando o nome de transição da carta da grade no mesmo
 * commit, relê a grade a cada `onMudou` e mostra os eventos recebidos.
 */
export function SecaoDetalhe({ parametros }: { parametros: ParametrosDetalhe }) {
  const t = useTranslations("v2Detalhe.laboratorio");
  const [colecaoId, setColecaoId] = useState(parametros.colecao);
  const [grade, setGrade] = useState<GradeColecaoV2DTO | null>(null);
  const [erroGrade, setErroGrade] = useState(false);
  const [versaoGrade, setVersaoGrade] = useState(0);
  const [abertaManual, setAberta] = useState<Aberta | null>(null);
  // A chave do par ativo da transição: a carta que abriu (e para onde o
  // detalhe volta). Só ela leva o nome compartilhado na grade.
  const [alvoManual, setAlvo] = useState<string | null>(null);
  const [previaCopia, setPreviaCopia] = useState<DetalheCartaV2DTO | null>(null);
  const [eventos, setEventos] = useState<string[]>([]);
  // `abrir=1`: aberto ao carregar, até a pessoa fechar ou abrir outra.
  const [dispensouAutomatica, setDispensouAutomatica] = useState(false);

  // `?vaga=` sem `?colecao=`: a coleção sai do contexto do detalhe da carta.
  useEffect(() => {
    if (colecaoId || !parametros.vaga || !parametros.carta) return;
    fetch(`/api/cartas/${encodeURIComponent(parametros.carta)}/detalhe?vaga=${parametros.vaga}`)
      .then((r) => (r.ok ? (r.json() as Promise<DetalheCartaV2DTO>) : null))
      .then((d) => {
        if (d?.contexto.vaga) setColecaoId(d.contexto.vaga.colecaoId);
      })
      .catch(() => setErroGrade(true));
  }, [colecaoId, parametros.vaga, parametros.carta]);

  useEffect(() => {
    if (!colecaoId) return;
    fetch(`/api/colecoes/${colecaoId}/grade`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<GradeColecaoV2DTO>) : Promise.reject(new Error(String(r.status)))))
      .then((g) => {
        setGrade(g);
        setErroGrade(false);
      })
      .catch(() => setErroGrade(true));
  }, [colecaoId, versaoGrade]);

  // A prévia da cópia (a carta que o detalhe "cresce" a partir dela).
  useEffect(() => {
    if (!parametros.carta || !parametros.copia) return;
    fetch(`/api/cartas/${encodeURIComponent(parametros.carta)}/detalhe?copia=${parametros.copia}`)
      .then((r) => (r.ok ? (r.json() as Promise<DetalheCartaV2DTO>) : null))
      .then(setPreviaCopia)
      .catch(() => setPreviaCopia(null));
  }, [parametros.carta, parametros.copia]);

  /*
   * Abrir em dois tempos, no mesmo evento: primeiro (atualização urgente) a
   * carta clicada ganha o nome de transição; depois, dentro da transição, o
   * detalhe abre e a carta sai da grade. O React confirma a urgente antes da
   * transição, então o nome já está no DOM quando a vista "antes" é
   * fotografada — e nenhuma outra carta da grade leva nome.
   */
  const abrir = useCallback((pedido: Aberta) => {
    setAlvo(pedido.tipo === "vaga" ? pedido.id : "copia");
    setDispensouAutomatica(true);
    startTransition(() => setAberta(pedido));
  }, []);

  const fechar = useCallback(() => {
    setAberta(null);
    setDispensouAutomatica(true);
  }, []);

  const aoMudar = useCallback((e: EventoDetalhe) => {
    setEventos((atuais) => [JSON.stringify(e), ...atuais].slice(0, 12));
    setVersaoGrade((v) => v + 1);
  }, []);

  if (!parametros.colecao && !parametros.carta) {
    return <p className={estilos.texto}>{t("semParametros")}</p>;
  }

  const automatica: Aberta | null =
    !parametros.abrir || dispensouAutomatica
      ? null
      : parametros.vaga && grade?.vagas.some((v) => v.id === parametros.vaga)
        ? { tipo: "vaga", id: parametros.vaga }
        : !parametros.vaga && parametros.copia && parametros.carta
          ? { tipo: "copia" }
          : null;
  const aberta: Aberta | null = abertaManual ?? automatica;
  const alvo = alvoManual ?? (automatica ? (automatica.tipo === "vaga" ? automatica.id : "copia") : null);

  const vagaAberta = aberta?.tipo === "vaga" ? (grade?.vagas.find((v) => v.id === aberta.id) ?? null) : null;
  let abertura: AberturaDetalhe | null = null;
  if (aberta?.tipo === "vaga" && grade && vagaAberta) {
    abertura = {
      modo: "vaga",
      colecao: { id: grade.id, nome: grade.nome, tipo: grade.tipo, idiomaExigido: grade.idiomaExigido },
      vaga: vagaAberta,
    };
  } else if (aberta?.tipo === "copia" && parametros.carta && parametros.copia) {
    abertura = {
      modo: "copia",
      cartaId: parametros.carta,
      copiaId: parametros.copia,
      previa: previaCopia
        ? { nome: previaCopia.carta.nome, imagemUrl: previaCopia.carta.imagemUrl, imagemOrigem: previaCopia.carta.imagemOrigem }
        : undefined,
    };
  }

  // As vagas que o laboratório oferece: a pedida, e algumas de cada estado.
  const grupos: Record<Grupo, VagaGradeV2DTO[]> = { preenchidas: [], upgrade: [], livres: [], vazias: [] };
  for (const v of grade?.vagas ?? []) {
    const g = grupos[grupoDaVaga(v)];
    if (g.length < POR_GRUPO || v.id === parametros.vaga) g.push(v);
  }

  return (
    <div className={estilos.secao}>
      <p className={estilos.texto}>{t("explica")}</p>
      {erroGrade ? <AvisoEmLinha tom="perigo">{t("erroGrade")}</AvisoEmLinha> : null}

      {grade ? (
        <>
          <p className={estilos.texto}>{t("colecao", { nome: grade.nome, total: grade.totalVagas })}</p>
          {(Object.keys(grupos) as Grupo[]).map((g) =>
            grupos[g].length === 0 ? null : (
              <div key={g} className={estilos.secao}>
                <h3 className={estilos.subtitulo}>{t(`filtro.${g}`)}</h3>
                <div className={estilos.gradeCartas}>
                  {grupos[g].map((v) => (
                    <CartaDaGrade
                      key={v.id}
                      vaga={v}
                      aberta={aberta?.tipo === "vaga" && aberta.id === v.id}
                      noParAtivo={alvo === v.id}
                      rotulo={t("abrirVaga", { numero: v.numero })}
                      aoAbrir={() => abrir({ tipo: "vaga", id: v.id })}
                    />
                  ))}
                </div>
              </div>
            ),
          )}
        </>
      ) : null}

      {parametros.carta && parametros.copia ? (
        <div className={estilos.gradeCartas}>
          <button type="button" className={estilos.cartaDaGrade} onClick={() => abrir({ tipo: "copia" })} aria-label={t("abrirCopia")}>
            {aberta?.tipo === "copia" ? (
              <span className={estilos.lugarDaCarta} aria-hidden />
            ) : (
              <TransicaoVista name={nomeTransicaoCarta(`copia:${parametros.copia}`, alvo === "copia")}>
                <Carta
                  imagemUrl={previaCopia?.carta.imagemUrl ?? null}
                  origem={previaCopia?.carta.imagemOrigem ?? null}
                  alt={previaCopia?.carta.nome ?? ""}
                  raridade={previaCopia?.carta.raridade ?? null}
                />
              </TransicaoVista>
            )}
            <span className={estilos.legendaCarta}>{t("abrirCopia")}</span>
          </button>
        </div>
      ) : null}

      <Painel>
        <b>{t("eventos")}</b>
        {eventos.length === 0 ? (
          <p className={estilos.texto}>{t("nenhumEvento")}</p>
        ) : (
          <ol className={estilos.eventos}>
            {eventos.map((e, i) => (
              <li key={`${i}-${e}`}>
                <code className="v2-num">{e}</code>
              </li>
            ))}
          </ol>
        )}
      </Painel>

      <DetalheCarta
        abertura={abertura}
        onFechar={fechar}
        onMudou={aoMudar}
        chaveTransicao={aberta?.tipo === "vaga" ? aberta.id : aberta?.tipo === "copia" ? `copia:${parametros.copia}` : undefined}
      />
    </div>
  );
}

/**
 * Uma vaga como a grade da coleção a mostraria, em miniatura. Enquanto o
 * detalhe dela está aberto, a carta sai daqui (fica o lugar dela): o nome de
 * transição só pode existir num elemento, e é o do palco que o leva.
 */
function CartaDaGrade({
  vaga,
  aberta,
  noParAtivo,
  rotulo,
  aoAbrir,
}: {
  vaga: VagaGradeV2DTO;
  aberta: boolean;
  noParAtivo: boolean;
  rotulo: string;
  aoAbrir: () => void;
}) {
  const nome = vaga.cartaNome ?? vaga.especie ?? `#${vaga.numero}`;
  const sprite = !vaga.carta ? urlSpritePokemon(vaga.chave) : null;
  return (
    <button type="button" className={estilos.cartaDaGrade} onClick={aoAbrir} aria-label={rotulo}>
      {aberta ? (
        <span className={estilos.lugarDaCarta} aria-hidden />
      ) : (
        <TransicaoVista name={nomeTransicaoCarta(vaga.id, noParAtivo)}>
          {sprite !== null || !vaga.carta ? (
            <span className={estilos.lugarDaCarta}>
              {sprite ? (
                /* eslint-disable-next-line @next/next/no-img-element -- sprite pequeno do PokeAPI, como na grade. */
                <img src={sprite} alt="" width={64} height={64} />
              ) : null}
            </span>
          ) : (
            <Carta
              imagemUrl={vaga.imagemUrl ?? null}
              origem={vaga.imagemOrigem ?? null}
              alt={nome}
              variante={vaga.copia?.variante ?? null}
              raridade={vaga.carta.raridade}
              className={vaga.copia ? undefined : estilos.cartaApagada}
            />
          )}
        </TransicaoVista>
      )}
      <span className={estilos.legendaCarta}>
        {vaga.numero} · {nome}
        {vaga.upgrade ? " · ↑" : ""}
        {vaga.livres ? ` · ${vaga.livres}` : ""}
      </span>
    </button>
  );
}
