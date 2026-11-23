"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { Idioma } from "@/lib/dominio/enums";
import type {
  CandidataMelhoriaDTO,
  CandidatoVagaDTO,
  CopiaDoDetalheV2DTO,
  MelhoriaDaVagaDTO,
  VagaGradeV2DTO,
} from "@/lib/dominio/tipos-cliente";

import { Carta } from "../carta/carta";
import { Botao } from "../primitivos/botao";
import { AvisoEmLinha } from "../primitivos/painel";

import estilos from "./detalhe.module.css";
import { valoresDoEixo } from "./estado-detalhe";
import type { Formatos } from "./formatos";
import { LinhaCopia, rotuloRaridade } from "./secoes";

/* ---------- Vaga preenchida ---------- */

/**
 * A vaga preenchida: a cópia que está nela, desalocar (CID-18) e, quando há
 * cópia livre melhor, as candidatas com o eixo visível (CID-19) e o
 * descartar/restaurar de cada sugestão (CID-20).
 *
 * Regra 8: a troca é um clique da pessoa, confirmado, e vai numa transação
 * só no servidor (`POST /api/vagas/:id/trocar`) — nunca desalocar e alocar
 * em dois pedidos, que deixaria a vaga vazia se o segundo falhasse. Quem
 * decide quem é melhor é a escada de `melhoria-vaga.ts`, no servidor; aqui
 * só se mostra o eixo que ela escolheu.
 *
 * Descartar cala a sugestão **desta cópia nesta vaga** (o par), e a frase que
 * diz isso está sempre à vista, não num `title`. A candidata descartada fica
 * na lista, apagada, com "Restaurar", enquanto o detalhe está aberto: um
 * descarte sem volta imediata é como um toque errado vira dado perdido.
 */
export function SecaoVagaPreenchida({
  copia,
  melhoria,
  carregandoMelhoria,
  descartadas,
  bloqueado,
  formatos,
  aoTrocar,
  aoDescartar,
  aoRestaurar,
  aoDesalocar,
}: {
  copia: CopiaDoDetalheV2DTO | null;
  melhoria: MelhoriaDaVagaDTO | null;
  carregandoMelhoria: boolean;
  descartadas: readonly string[];
  bloqueado: boolean;
  formatos: Formatos;
  aoTrocar: (c: CandidataMelhoriaDTO) => void;
  aoDescartar: (c: CandidataMelhoriaDTO) => void;
  aoRestaurar: (c: CandidataMelhoriaDTO) => void;
  aoDesalocar: () => void;
}) {
  const t = useTranslations("v2Detalhe");
  return (
    <>
      <section className={estilos.bloco} aria-labelledby="v2-detalhe-nesta-vaga">
        <h3 id="v2-detalhe-nesta-vaga" className={estilos.tituloBloco}>
          {t("nestaVaga")}
        </h3>
        {copia ? (
          <ul className={estilos.lista}>
            <LinhaCopia copia={copia} formatos={formatos} />
          </ul>
        ) : (
          <p className={estilos.sutil}>{t("carregando")}</p>
        )}
        <div className={estilos.acoes}>
          <Botao variante="secundario" disabled={bloqueado} onClick={aoDesalocar}>
            {t("desalocar")}
          </Botao>
        </div>
        <p className={estilos.sutil}>{t("desalocarExplica")}</p>
      </section>

      {melhoria || carregandoMelhoria ? (
        <section className={estilos.bloco} aria-labelledby="v2-detalhe-melhoria">
          <h3 id="v2-detalhe-melhoria" className={estilos.tituloBloco}>
            {t("melhoria.titulo")}
          </h3>
          {melhoria ? (
            <>
              <AvisoEmLinha tom="iris" icone={<Sparkles aria-hidden />} titulo={t("melhoria.temMelhor", { total: melhoria.candidatas.length })}>
                {t("melhoria.explica")}
              </AvisoEmLinha>
              <ul className={estilos.lista}>
                {melhoria.candidatas.map((c) => (
                  <LinhaMelhoria
                    key={c.id}
                    candidata={c}
                    atual={melhoria.atual}
                    descartada={descartadas.includes(c.id)}
                    bloqueado={bloqueado}
                    aoTrocar={() => aoTrocar(c)}
                    aoDescartar={() => aoDescartar(c)}
                    aoRestaurar={() => aoRestaurar(c)}
                  />
                ))}
              </ul>
              <p className={estilos.sutil}>{t("melhoria.descartarExplica")}</p>
            </>
          ) : (
            <p className={estilos.sutil}>{t("carregando")}</p>
          )}
        </section>
      ) : null}
    </>
  );
}

function LinhaMelhoria({
  candidata: c,
  atual,
  descartada,
  bloqueado,
  aoTrocar,
  aoDescartar,
  aoRestaurar,
}: {
  candidata: CandidataMelhoriaDTO;
  atual: MelhoriaDaVagaDTO["atual"];
  descartada: boolean;
  bloqueado: boolean;
  aoTrocar: () => void;
  aoDescartar: () => void;
  aoRestaurar: () => void;
}) {
  const t = useTranslations("v2Detalhe");
  const tComp = useTranslations("componentes");
  const tRaridades = useTranslations("raridadesCarta");
  const semRaridade = tComp("semRaridade");
  const { de, para } = valoresDoEixo(c.eixo, atual, c);
  const rotulo = (eixoValor: string | null) => {
    if (c.eixo === "raridade") return rotuloRaridade(tRaridades, semRaridade, eixoValor);
    if (c.eixo === "variante" && eixoValor) return tComp(`variante.${eixoValor}`);
    return (eixoValor ?? "—").toUpperCase();
  };
  return (
    <li className={[estilos.linhaMelhoria, descartada ? estilos.descartada : null].filter(Boolean).join(" ")}>
      <div className={estilos.miniatura}>
        <Carta imagemUrl={c.imagemUrl} origem={c.imagemOrigem} alt={c.cartaNome} variante={c.variante} raridade={c.raridade} />
      </div>
      <div className={estilos.opcaoTexto}>
        <span>
          {c.cartaNome} <span className={estilos.sutil}>#{c.cartaLocalId}</span>
        </span>
        <span>
          <span className={estilos.etiquetaIris}>
            {t(`melhoria.eixo.${c.eixo}`, { de: rotulo(de), para: rotulo(para) })}
          </span>
        </span>
        <span className={estilos.sutil}>
          {[c.setNome, rotuloRaridade(tRaridades, semRaridade, c.raridade), c.idioma.toUpperCase(), tComp(`variante.${c.variante}`), c.condicao, t("quantidade", { total: c.quantidade })].join(" · ")}
        </span>
        {descartada ? <span className={estilos.sutil}>{t("melhoria.descartadaAgora")}</span> : null}
      </div>
      <div className={estilos.acoes}>
        {descartada ? (
          <Botao pequeno variante="secundario" disabled={bloqueado} onClick={aoRestaurar}>
            {t("melhoria.restaurar")}
          </Botao>
        ) : (
          <>
            <Botao pequeno variante="iris" disabled={bloqueado} onClick={aoTrocar}>
              {t("melhoria.trocar")}
            </Botao>
            <Botao pequeno variante="fantasma" disabled={bloqueado} onClick={aoDescartar}>
              {t("melhoria.descartar")}
            </Botao>
          </>
        )}
      </div>
    </li>
  );
}

/* ---------- Vaga vazia ---------- */

/**
 * A vaga vazia (CID-17): as cópias livres que servem
 * (`GET /api/vagas/:id/candidatos`, que já aplica as regras 1, 2 e 3 — só
 * cópia livre, só carta de exatamente um `dexId` na Pokédex, formas
 * concorrendo pela mesma vaga), a pessoa escolhe uma e aloca (regra 5). O
 * botão fica **visível e desabilitado** sem candidata, com o porquê escrito
 * ao lado: a vaga vazia é saída de primeira classe (regra 6), e um botão que
 * some faz a tela parecer quebrada.
 *
 * Fora do padrão (idioma físico diferente do exigido pela coleção, regra 7)
 * pede a confirmação da v2 antes de enviar; cancelar não envia nada.
 *
 * As escolhas de compra da vaga aparecem **só para leitura**: marcar e
 * desmarcar compra é do pacote da aba "O que falta", que entra por
 * `secaoCompra`.
 */
export function SecaoVagaVazia({
  alvo,
  candidatos,
  carregando,
  escolhida,
  bloqueado,
  idiomaExigido,
  escolhas,
  secaoCompra,
  aoEscolher,
  aoAlocar,
}: {
  alvo: "carta" | "especie";
  candidatos: CandidatoVagaDTO[] | null;
  carregando: boolean;
  escolhida: string | null;
  bloqueado: boolean;
  idiomaExigido: Idioma | null;
  escolhas: NonNullable<VagaGradeV2DTO["escolhas"]>;
  secaoCompra?: ReactNode;
  aoEscolher: (id: string) => void;
  aoAlocar: () => void;
}) {
  const t = useTranslations("v2Detalhe");
  const tComp = useTranslations("componentes");
  const vazio = candidatos !== null && candidatos.length === 0;
  const idSemCandidata = "v2-detalhe-sem-candidata";

  return (
    <>
      <section className={estilos.bloco} aria-labelledby="v2-detalhe-livres">
        <h3 id="v2-detalhe-livres" className={estilos.tituloBloco}>
          {t("vazia.titulo")}
        </h3>
        <p className={estilos.sutil}>{alvo === "especie" ? t("vazia.explicaEspecie") : t("vazia.explicaCarta")}</p>
        {carregando && candidatos === null ? <p className={estilos.sutil}>{t("carregando")}</p> : null}
        {candidatos && candidatos.length > 0 ? (
          <div role="radiogroup" aria-label={t("vazia.titulo")} className={estilos.lista}>
            {candidatos.map((c) => (
              <label key={c.id} className={estilos.opcao}>
                <input
                  type="radio"
                  name="v2-detalhe-candidata"
                  value={c.id}
                  checked={escolhida === c.id}
                  onChange={() => aoEscolher(c.id)}
                  disabled={bloqueado}
                />
                <span className={estilos.miniatura}>
                  <Carta imagemUrl={c.imagemUrl} origem={c.imagemOrigem} alt={c.cartaNome} variante={c.variante} />
                </span>
                <span className={estilos.opcaoTexto}>
                  <span>
                    {c.cartaNome} <span className={estilos.sutil}>#{c.cartaLocalId}</span>
                  </span>
                  <span className={estilos.sutil}>
                    {[c.setNome, c.idioma.toUpperCase(), tComp(`variante.${c.variante}`), c.condicao, t("quantidade", { total: c.quantidade })].join(" · ")}
                  </span>
                  {c.foraDePadrao ? (
                    <span>
                      <span className={estilos.etiquetaAviso}>
                        {t("foraDoPadrao", { idioma: c.idioma.toUpperCase(), exigido: (idiomaExigido ?? "—").toUpperCase() })}
                      </span>
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        ) : null}
        <div className={estilos.acoes}>
          <Botao
            variante="primario"
            disabled={bloqueado || escolhida === null}
            aria-describedby={vazio ? idSemCandidata : undefined}
            onClick={aoAlocar}
          >
            {t("vazia.alocar")}
          </Botao>
        </div>
        {vazio ? (
          <p id={idSemCandidata} className={estilos.sutil}>
            {t("vazia.semCandidata")}
          </p>
        ) : candidatos && escolhida === null ? (
          <p className={estilos.sutil}>{t("vazia.escolhaUma")}</p>
        ) : null}
        {/* O lote: alocar uma unidade de uma linha com quantidade > 1 a divide
            no servidor (a unidade alocada vira uma linha própria). Dito antes,
            não só no aviso depois. */}
        {candidatos?.some((c) => c.quantidade > 1) ? <p className={estilos.sutil}>{t("vazia.lote")}</p> : null}
      </section>

      {secaoCompra ?? (
        <section className={estilos.bloco} aria-labelledby="v2-detalhe-compra">
          <h3 id="v2-detalhe-compra" className={estilos.tituloBloco}>
            {t("compra.titulo")}
          </h3>
          {escolhas.length === 0 ? (
            <p className={estilos.sutil}>{t("compra.nenhuma")}</p>
          ) : (
            <ul className={estilos.lista}>
              {escolhas.map((e) => (
                <li key={e.id} className={estilos.linhaCopia}>
                  {e.nome}
                </li>
              ))}
            </ul>
          )}
          <p className={estilos.sutil}>{t("compra.soLeitura")}</p>
        </section>
      )}
    </>
  );
}
