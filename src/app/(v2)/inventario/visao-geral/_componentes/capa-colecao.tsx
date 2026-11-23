import { Crown, Layers } from "lucide-react";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

import type { Divisao } from "@/lib/dominio/divisoes-colecao";
import { NOME_REGIAO } from "@/lib/dominio/escopo-pokedex";
import { progressoDaColecao } from "@/lib/dominio/lista-colecoes-v2";
import type { ResumoInventario } from "@/lib/db/resumo-inventario";
import { percentualSemFechar } from "@/lib/dominio/visao-geral-v2";
import { urlImagemCarta } from "@/lib/imagens";

import { ImagemEscada } from "../../../_componentes/primitivos/imagem-escada";

import estilos from "./visao-geral.module.css";

type ColecaoDaVitrine = ResumoInventario["colecoes"][number];

/** Divisões listadas na capa; o resto vira "+N" (a tela da coleção mostra todas). */
const DIVISOES_NA_CAPA = 4;

/** Pokébola em SVG: a identidade da coleção Pokédex, que não tem logo de set. */
function Pokebola() {
  return (
    <svg className={estilos.pokebola} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="M3 20h12.5M24.5 20H37" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="20" cy="20" r="4.5" fill="none" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

/**
 * Rótulo de uma divisão: a região, ou o set com a parte quando ele se parte
 * (`principal`/`secretas`). A região segue como a v1 a escreve (`NOME_REGIAO`).
 */
export async function rotuloDaDivisao(d: Divisao): Promise<string> {
  if (d.tipo === "regiao") return NOME_REGIAO[d.regiao];
  if (d.parte === "inteiro") return d.setNome;
  const t = await getTranslations("divisoes");
  return `${d.setNome} · ${t(d.parte)}`;
}

export function BarraDeProgresso({ preenchidas, total, completa }: { preenchidas: number; total: number; completa: boolean }) {
  const fracao = total > 0 ? Math.min(Math.max(preenchidas / total, 0), 1) : 0;
  // O número está sempre escrito ao lado; a barra só reforça, por isso `aria-hidden`.
  return (
    <span className={estilos.barra} aria-hidden>
      <span
        className={[estilos.barraPreenchida, completa ? estilos.barraCompleta : null].filter(Boolean).join(" ")}
        style={{ width: `${fracao * 100}%` }}
      />
    </span>
  );
}

/**
 * Uma coleção como capa de fichário: a carta mais vistosa já alocada (senão o
 * logo do set, senão um ícone), o nome, o percentual e as divisões. O cartão é
 * um link só para `/colecoes/<id>`. "Customizada" não tem denominador: só a
 * contagem, sem percentual (regra 4: o percentual de um set é sobre a
 * numeração oficial, e vem pronto da leitura).
 */
export async function CapaColecao({ colecao: c }: { colecao: ColecaoDaVitrine }) {
  const t = await getTranslations("v2VisaoGeral.colecoes");
  const formato = await getFormatter();
  const progresso = progressoDaColecao(c);
  const completa = progresso.tipo === "anel" && progresso.completa;
  const capaUrl = c.capa ? urlImagemCarta(c.capa.imagemUrl, "low") : null;
  const visiveis = c.divisoes.slice(0, DIVISOES_NA_CAPA);

  const rotulosDivisao = await Promise.all(visiveis.map((d) => rotuloDaDivisao(d)));

  return (
    <Link
      href={`/colecoes/${c.id}`}
      className={["v2-painel", estilos.capa, completa ? estilos.capaCompleta : null].filter(Boolean).join(" ")}
    >
      <div className={estilos.capaImagem} aria-hidden>
        {capaUrl ? (
          <ImagemEscada
            fontes={[capaUrl]}
            className={estilos.capaFoto}
            fallback={<LogoOuIcone logos={c.logos} tipo={c.tipo} />}
          />
        ) : (
          <LogoOuIcone logos={c.logos} tipo={c.tipo} />
        )}
      </div>

      <div className={estilos.capaCorpo}>
        <div className={estilos.capaTitulo}>
          <h3 className={estilos.capaNome}>{c.nome}</h3>
          {completa && (
            <span className={estilos.chipCompleta}>
              <Crown aria-hidden />
              {t("completa")}
            </span>
          )}
        </div>
        <p className={estilos.capaTipo}>{t.has(`tipo.${c.tipo}`) ? t(`tipo.${c.tipo}`) : c.tipo}</p>

        {progresso.tipo === "contagem" && <p className={`${estilos.capaGrande} v2-num`}>{t("cartas", { total: progresso.quantas })}</p>}
        {progresso.tipo === "semVagas" && <p className={estilos.capaTipo}>{t("semVagas")}</p>}
        {progresso.tipo === "anel" && (
          <>
            <p className={estilos.capaGrande}>
              <span className="v2-num">{progresso.percentual}%</span>
              <span className={`${estilos.capaContagem} v2-num`}>
                {formato.number(c.vagasPreenchidas)}/{formato.number(c.totalVagas)}
              </span>
            </p>
            {visiveis.length > 1 ? (
              <ul className={estilos.divisoes}>
                {visiveis.map((d, i) => (
                  <li key={d.id}>
                    <div className={estilos.divisaoLinha}>
                      <span className={estilos.divisaoNome}>{rotulosDivisao[i]}</span>
                      <span className={`${estilos.divisaoNumeros} v2-num`}>
                        {d.preenchidas}/{d.total} · {percentualSemFechar(d.preenchidas, d.total)}%
                      </span>
                    </div>
                    <BarraDeProgresso
                      preenchidas={d.preenchidas}
                      total={d.total}
                      completa={d.total > 0 && d.preenchidas >= d.total}
                    />
                  </li>
                ))}
                {c.divisoes.length > visiveis.length && (
                  <li className={estilos.maisDivisoes}>{t("maisDivisoes", { total: c.divisoes.length - visiveis.length })}</li>
                )}
              </ul>
            ) : (
              <BarraDeProgresso preenchidas={c.vagasPreenchidas} total={c.totalVagas} completa={completa} />
            )}
          </>
        )}
      </div>
    </Link>
  );
}

function LogoOuIcone({ logos, tipo }: { logos: readonly string[]; tipo: ColecaoDaVitrine["tipo"] }) {
  const icone = tipo === "pokedex" ? <Pokebola /> : <Layers className={estilos.iconeCapa} aria-hidden />;
  return (
    <ImagemEscada fontes={logos} className={estilos.capaLogo} fallback={<span className={estilos.capaVazia}>{icone}</span>} />
  );
}
