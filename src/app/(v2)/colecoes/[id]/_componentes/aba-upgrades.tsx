"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import type { MelhoriaDaVagaDTO, VagaGradeV2DTO } from "@/lib/dominio/tipos-cliente";

import { Carta } from "../../../_componentes/carta/carta";
import { valoresDoEixo } from "../../../_componentes/detalhe/estado-detalhe";
import { nomeTransicaoCarta } from "../../../_componentes/movimento/nome-transicao";
import { TransicaoVista } from "../../../_componentes/movimento/transicao-vista";
import { Botao } from "../../../_componentes/primitivos/botao";
import { AvisoEmLinha, Painel } from "../../../_componentes/primitivos/painel";

import { ATRIBUTO_VAGA } from "./bolso";
import estilos from "./colecao.module.css";

/**
 * Upgrades: as vagas cheias para as quais existe no inventário uma cópia
 * livre melhor (regra 8). **É um sinal, nunca uma troca**: cada linha mostra
 * a cópia de hoje, a melhor candidata e o eixo que a fez ganhar, e o botão
 * abre o detalhe da vaga, onde a pessoa vê todas as candidatas e confirma.
 *
 * A lista é a da grade (a marca `upgrade` de cada vaga, lida junto com ela);
 * a melhor candidata vem de `GET /api/colecoes/:id/melhorias`, relida a cada
 * leitura nova da grade. Se essa leitura falhar, a lista continua, com o
 * eixo e sem a imagem da candidata: o sinal é acessório, a vaga não.
 */
export function AbaUpgrades({
  colecaoId,
  vagas,
  versaoGrade,
  abertaId,
  parAtivo,
  aoAbrir,
}: {
  colecaoId: string;
  vagas: readonly VagaGradeV2DTO[];
  /** Muda a cada leitura da grade: as candidatas são relidas junto. */
  versaoGrade: number;
  abertaId: string | null;
  parAtivo: string | null;
  aoAbrir: (vaga: VagaGradeV2DTO) => void;
}) {
  const t = useTranslations("v2Colecao.upgrades");
  const tVariante = useTranslations("componentes.variante");
  const tRaridades = useTranslations("raridadesCarta");
  const [melhorias, setMelhorias] = useState<Map<string, MelhoriaDaVagaDTO> | null>(null);
  const [falhou, setFalhou] = useState(false);
  const comUpgrade = vagas.filter((v) => v.upgrade && v.copia);

  useEffect(() => {
    const controle = new AbortController();
    fetch(`/api/colecoes/${colecaoId}/melhorias`, { cache: "no-store", signal: controle.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ itens?: MelhoriaDaVagaDTO[] }>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        setMelhorias(new Map((d.itens ?? []).map((m) => [m.vagaId, m])));
        setFalhou(false);
      })
      .catch(() => {
        if (!controle.signal.aborted) setFalhou(true);
      });
    return () => controle.abort();
  }, [colecaoId, versaoGrade]);

  function valor(eixo: "raridade" | "idioma" | "variante", v: string | null): string {
    if (v === null) return t("semRaridade");
    if (eixo === "variante") return tVariante.has(v) ? tVariante(v) : v;
    if (eixo === "idioma") return v.toUpperCase();
    return tRaridades.has(v) ? tRaridades(v) : v;
  }

  if (comUpgrade.length === 0) {
    return (
      <AvisoEmLinha titulo={t("nenhum")} icone={<Sparkles aria-hidden />}>
        {t("nenhumTexto")}
      </AvisoEmLinha>
    );
  }

  return (
    <div className={estilos.upgrades}>
      <p className={estilos.notaTopo}>{t("explica")}</p>
      {falhou && <AvisoEmLinha tom="alerta">{t("erroCandidatas")}</AvisoEmLinha>}
      <ul className={estilos.listaUpgrades}>
        {comUpgrade.map((v) => {
          const m = melhorias?.get(v.id);
          const melhor = m?.candidatas[0];
          const eixo = melhor?.eixo ?? v.upgrade!;
          const deAte = m && melhor ? valoresDoEixo(eixo, m.atual, melhor) : null;
          const nome = v.cartaNome ?? v.especie ?? v.numero;
          return (
            <Painel as="li" key={v.id} className={estilos.linhaUpgrade}>
              <button
                type="button"
                className={estilos.cartaUpgrade}
                aria-label={t("abrir", { carta: nome, numero: v.numero })}
                onClick={() => aoAbrir(v)}
                {...{ [ATRIBUTO_VAGA]: v.id }}
              >
                {abertaId === v.id ? (
                  <span className={estilos.lugarAberto} aria-hidden />
                ) : (
                  <TransicaoVista name={nomeTransicaoCarta(v.id, parAtivo === v.id)} default={parAtivo === v.id ? undefined : "none"}>
                    <span className={estilos.visual} aria-hidden>
                      <Carta imagemUrl={v.imagemUrl ?? null} origem={v.imagemOrigem ?? null} alt="" variante={v.copia!.variante} raridade={v.carta?.raridade ?? null} />
                    </span>
                  </TransicaoVista>
                )}
              </button>
              <ArrowRight className={estilos.setaUpgrade} aria-hidden />
              <span className={estilos.cartaUpgrade} aria-hidden>
                {melhor ? (
                  <Carta imagemUrl={melhor.imagemUrl} origem={melhor.imagemOrigem} alt="" variante={melhor.variante} raridade={melhor.raridade} />
                ) : (
                  <span className={estilos.vazioFundo} />
                )}
              </span>
              <div className={estilos.infoUpgrade}>
                <b>
                  {nome} <span className={`${estilos.numeroMudo} v2-num`}>{v.numero}</span>
                </b>
                <span>
                  {deAte
                    ? t(`eixo.${eixo}`, { de: valor(eixo, deAte.de), para: valor(eixo, deAte.para) })
                    : t(`eixoSo.${eixo}`)}
                </span>
                {m && m.candidatas.length > 1 && <span className={estilos.mudo}>{t("outras", { total: m.candidatas.length - 1 })}</span>}
              </div>
              <Botao variante="primario" pequeno onClick={() => aoAbrir(v)} className={estilos.botaoUpgrade}>
                {t("verTroca")}
              </Botao>
            </Painel>
          );
        })}
      </ul>
    </div>
  );
}
