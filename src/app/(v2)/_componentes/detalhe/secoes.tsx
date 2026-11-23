"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { VarianteCopia } from "@/lib/dominio/enums";
import type { OrigemImagem } from "@/lib/dominio/origem-imagem";
import type { CopiaDoDetalheV2DTO, DetalheCartaV2DTO } from "@/lib/dominio/tipos-cliente";

import { Carta } from "../carta/carta";
import { nomeTransicaoCarta } from "../movimento/nome-transicao";
import { TransicaoVista } from "../movimento/transicao-vista";
import { Botao } from "../primitivos/botao";

import estilos from "./detalhe.module.css";
import type { Formatos } from "./formatos";
import { desenharSerie, resumirSerie } from "./serie-preco";

/* ---------- Rótulos ---------- */

type Tradutor = ReturnType<typeof useTranslations>;

/**
 * O rótulo de uma raridade: a entrada de `raridadesCarta` (chaveada pela
 * grafia en do upstream), senão o texto como está. A ficha pt já traz a
 * raridade escrita em português, e chave com `.` não existe no next-intl
 * (`Rare Holo LV.X`): nos dois casos, como está.
 */
export function rotuloRaridade(tRaridades: Tradutor, semRaridade: string, raridade: string | null): string {
  if (raridade === null) return semRaridade;
  if (raridade.includes(".")) return raridade;
  return tRaridades.has(raridade) ? tRaridades(raridade) : raridade;
}

export function rotuloTipo(tTipos: Tradutor, tipo: string): string {
  return tTipos.has(tipo) ? tTipos(tipo) : tipo;
}

/* ---------- Palco ---------- */

/**
 * A carta grande do detalhe: a Carta do 0b em `palco` e `high` (a grande só
 * troca a pequena depois de decodificada), que substitui o zoom da v1. A
 * foto própria vence (a cadeia de procedência já escolheu a URL), e a foto
 * emprestada leva o selo, como na v1.
 *
 * - **Vaga vazia**: a carta esperada, apagada ("ainda não é sua"); numa
 *   Pokédex, o sprite da espécie, porque a vaga não espera carta nenhuma
 *   (regra 3).
 * - **Transição**: com `chaveTransicao`, a carta leva o nome compartilhado
 *   (`nomeTransicaoCarta(chave, true)`) e cresce da carta da grade que a
 *   abriu. O nome só existe aqui enquanto o detalhe está aberto, que é o par
 *   ativo; a grade tira o dela no mesmo commit. `TransicaoVista` desliga com
 *   movimento reduzido e no modo leve.
 */
export function Palco({
  imagemUrl,
  origem,
  alt,
  variante,
  raridade,
  fantasma,
  sprite,
  chaveTransicao,
}: {
  imagemUrl: string | null;
  origem: OrigemImagem | null;
  alt: string;
  variante: VarianteCopia | null;
  raridade: string | null;
  fantasma: boolean;
  /** Vaga vazia de Pokédex: o sprite da espécie no lugar da carta. */
  sprite?: string | null;
  chaveTransicao?: string;
}) {
  const t = useTranslations("v2Detalhe");
  const nome = chaveTransicao === undefined ? undefined : nomeTransicaoCarta(chaveTransicao, true);

  const carta =
    sprite !== undefined ? (
      <div className={estilos.especie} role="img" aria-label={alt}>
        {sprite ? (
          /* eslint-disable-next-line @next/next/no-img-element -- sprite pequeno do CDN do PokeAPI, como na grade da v1. */
          <img src={sprite} alt="" width={96} height={96} draggable={false} />
        ) : null}
      </div>
    ) : (
      <Carta
        modo="palco"
        qualidade="high"
        imagemUrl={imagemUrl}
        origem={origem}
        alt={alt}
        variante={variante}
        raridade={raridade}
        // A variante sai em texto na linha da cópia, logo ao lado; escrita
        // sobre a carta grande, cobriria o nome impresso. O leitor de tela a
        // ouve da própria Carta.
        className={fantasma ? estilos.fantasma : undefined}
        fallback={<div className={estilos.semImagem}>{alt}</div>}
      />
    );

  return (
    <div className={estilos.palco}>
      <div className={estilos.palcoCarta}>
        {nome ? <TransicaoVista name={nome}>{carta}</TransicaoVista> : carta}
        {fantasma ? <span className={estilos.etiquetaFantasma}>{t("aindaNaoESua")}</span> : null}
      </div>
    </div>
  );
}

/* ---------- Ficha ---------- */

/** Tipos, raridade (a canônica) e ilustrador da ficha, como texto (nada só no hover). */
export function Ficha({ carta }: { carta: DetalheCartaV2DTO["carta"] }) {
  const t = useTranslations("v2Detalhe");
  const tTipos = useTranslations("tiposPokemon");
  const tRaridades = useTranslations("raridadesCarta");
  const tComp = useTranslations("componentes");
  return (
    <ul className={estilos.chips} aria-label={t("ficha")}>
      {carta.tipos.map((tipo) => (
        <li key={tipo} className={estilos.chip}>
          {rotuloTipo(tTipos, tipo)}
        </li>
      ))}
      {/* Pela canônica (a da ficha en): `raridadesCarta` é chaveado pela grafia
          en, e uma ficha pt com a interface em inglês sairia em português. */}
      <li className={estilos.chip}>{rotuloRaridade(tRaridades, tComp("semRaridade"), carta.raridadeCanonica)}</li>
      <li className={estilos.chip}>
        {carta.ilustrador ? t("ilustracaoDe", { nome: carta.ilustrador }) : t("ilustradorDesconhecido")}
      </li>
    </ul>
  );
}

/* ---------- Cópias ---------- */

/**
 * Uma cópia física numa linha: idioma físico (regra 7), variante, condição,
 * quantidade, graduação, e onde está. A variante sai em texto — o brilho da
 * carta é realce, nunca informação.
 */
export function LinhaCopia({
  copia,
  formatos,
  emFoco,
  acao,
}: {
  copia: CopiaDoDetalheV2DTO;
  formatos: Formatos;
  emFoco?: boolean;
  acao?: ReactNode;
}) {
  const t = useTranslations("v2Detalhe");
  const tComp = useTranslations("componentes");
  const onde = copia.alocacao
    ? t("ondeAlocada", {
        colecao: copia.alocacao.colecaoNome,
        numero: copia.alocacao.numero,
        desde: formatos.instante(copia.alocacao.desde),
      })
    : t("ondeLivre");
  return (
    <li className={[estilos.linhaCopia, emFoco ? estilos.emFoco : null].filter(Boolean).join(" ")}>
      <span className={estilos.idioma}>{copia.idioma.toUpperCase()}</span>
      <span className={estilos.linhaCopiaTexto}>
        <span>
          {[
            tComp(`variante.${copia.variante}`),
            copia.condicao,
            t("quantidade", { total: copia.quantidade }),
            copia.gradedEmpresa ? [copia.gradedEmpresa, copia.gradedNota].filter(Boolean).join(" ") : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          {emFoco ? <span className={estilos.marcaFoco}> · {t("estaCopia")}</span> : null}
        </span>
        <span className={estilos.sutil}>{onde}</span>
      </span>
      {acao}
    </li>
  );
}

export function ListaCopias({
  copias,
  foco,
  formatos,
  aoFocar,
}: {
  copias: CopiaDoDetalheV2DTO[];
  foco: string | null;
  formatos: Formatos;
  /** Modo cópia: pôr outra cópia da mesma carta em foco. */
  aoFocar?: (copiaId: string) => void;
}) {
  const t = useTranslations("v2Detalhe");
  return (
    <section className={estilos.bloco} aria-labelledby="v2-detalhe-copias">
      <h3 id="v2-detalhe-copias" className={estilos.tituloBloco}>
        {t("suasCopias", { total: copias.length })}
      </h3>
      {copias.length === 0 ? (
        <p className={estilos.sutil}>{t("semCopias")}</p>
      ) : (
        <ul className={estilos.lista}>
          {copias.map((c) => (
            <LinhaCopia
              key={c.id}
              copia={c}
              formatos={formatos}
              emFoco={c.id === foco}
              acao={
                aoFocar && c.id !== foco ? (
                  <Botao pequeno variante="fantasma" onClick={() => aoFocar(c.id)}>
                    {t("verEstaCopia")}
                  </Botao>
                ) : null
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- Preço ---------- */

/**
 * O preço na fonte ativa da instalação, com a fonte, a data e, no
 * Cardmarket, o euro e a cotação PTAX com a data dela. Nunca soma nem
 * compara Liga com Cardmarket: a leitura entrega uma fonte só. O valor do
 * Cardmarket é o guardado (`valor`), e quando ele não é a tendência a
 * etiqueta diz qual critério valeu e por quê, em texto.
 */
export function BlocoPreco({
  preco,
  serie,
  formatos,
}: {
  preco: DetalheCartaV2DTO["preco"];
  serie: DetalheCartaV2DTO["serie"];
  formatos: Formatos;
}) {
  const t = useTranslations("v2Detalhe.preco");
  const ref = preco.preco;

  let corpo: ReactNode;
  if (!ref) {
    corpo = <p className={estilos.sutil}>{t(`motivo.${preco.motivo ?? "foraDoInventario"}`, { fonte: t(`fonte.${preco.fonte}`) })}</p>;
  } else if (ref.fonte === "cardmarket") {
    const cm = ref.cardmarket;
    const criterio = cm?.criterioValor ?? "tendencia";
    corpo = (
      <>
        <p className={estilos.precoLinha}>
          <span className={estilos.precoValor}>{formatos.brl(ref.valor)}</span>
          {criterio !== "tendencia" ? <span className={estilos.etiqueta}>{t(`criterio.${criterio}`)}</span> : null}
        </p>
        <p className={estilos.sutil}>
          {[
            t("fonte.cardmarket"),
            cm?.valorEur !== null && cm?.valorEur !== undefined ? t("emEuro", { valor: formatos.eur(cm.valorEur) }) : null,
            cm?.cotacao !== null && cm?.cotacao !== undefined
              ? t("cotacao", {
                  cotacao: formatos.cotacao(cm.cotacao),
                  data: cm.cotacaoData ? formatos.dia(cm.cotacaoData) : "—",
                })
              : null,
            ref.em ? t("lidoEm", { data: formatos.instante(ref.em) }) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {criterio === "media30" && cm?.tendenciaEur !== undefined && cm.tendenciaEur !== null ? (
          <p className={estilos.sutil}>{t("explicaMedia30", { tendencia: formatos.eur(cm.tendenciaEur) })}</p>
        ) : null}
        {criterio === "media" ? <p className={estilos.sutil}>{t("explicaMedia")}</p> : null}
        <p className={estilos.sutil}>
          {preco.origem === "candidata" ? t("origemCandidata") : null} {t("comparavelLiga")}
        </p>
      </>
    );
  } else {
    const liga = ref.liga;
    const ehMedia = liga?.medio !== null && liga?.medio !== undefined;
    corpo = (
      <>
        <p className={estilos.precoLinha}>
          <span className={estilos.precoValor}>{formatos.brl(ref.valor)}</span>
          <span className={estilos.etiqueta}>{ehMedia ? t("ligaMedia") : t("ligaMenor")}</span>
        </p>
        <p className={estilos.sutil}>
          {[
            t("fonte.liga"),
            liga?.minimo !== null && liga?.minimo !== undefined ? t("ligaMinimo", { valor: formatos.brl(liga.minimo) }) : null,
            liga?.maximo !== null && liga?.maximo !== undefined ? t("ligaMaximo", { valor: formatos.brl(liga.maximo) }) : null,
            ref.em ? t("lidoEm", { data: formatos.instante(ref.em) }) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </>
    );
  }

  return (
    <section className={estilos.bloco} aria-labelledby="v2-detalhe-preco">
      <h3 id="v2-detalhe-preco" className={estilos.tituloBloco}>
        {t("titulo")}
      </h3>
      {corpo}
      {serie ? <SerieCurta serie={serie} formatos={formatos} /> : null}
    </section>
  );
}

const LARGURA_SERIE = 300;
const ALTURA_SERIE = 54;

/** A série curta: o desenho é decorativo; o resumo em texto diz o mesmo. */
function SerieCurta({ serie, formatos }: { serie: NonNullable<DetalheCartaV2DTO["serie"]>; formatos: Formatos }) {
  const t = useTranslations("v2Detalhe.preco");
  const desenho = desenharSerie(serie.pontos, LARGURA_SERIE, ALTURA_SERIE);
  const resumo = resumirSerie(serie.pontos);
  if (!resumo) return <p className={estilos.sutil}>{t("serieVazia")}</p>;
  return (
    <figure className={estilos.serie}>
      {desenho ? (
        <svg
          className={estilos.serieSvg}
          viewBox={`0 0 ${LARGURA_SERIE} ${ALTURA_SERIE}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d={desenho.area} className={estilos.serieArea} />
          <path d={desenho.linha} className={estilos.serieLinha} vectorEffect="non-scaling-stroke" />
        </svg>
      ) : null}
      <figcaption className={estilos.sutil}>
        {resumo.pontos === 1
          ? t("serieUmPonto", { data: formatos.instante(resumo.ultimo.em), valor: formatos.brl(resumo.ultimo.valor) })
          : t("serieResumo", {
              total: resumo.pontos,
              de: formatos.instante(resumo.primeiro.em),
              ate: formatos.instante(resumo.ultimo.em),
              primeiro: formatos.brl(resumo.primeiro.valor),
              ultimo: formatos.brl(resumo.ultimo.valor),
              menor: formatos.brl(resumo.menor),
              maior: formatos.brl(resumo.maior),
              fonte: t(`fonte.${serie.fonte}`),
            })}
      </figcaption>
    </figure>
  );
}
