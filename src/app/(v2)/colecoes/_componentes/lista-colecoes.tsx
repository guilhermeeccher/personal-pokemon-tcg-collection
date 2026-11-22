import { getTranslations } from "next-intl/server";

import { serieDistintaDoNome, type ListaColecoesV2DTO } from "@/lib/dominio/lista-colecoes-v2";

import { Painel } from "../../_componentes/primitivos/painel";
import { BotaoLink } from "../../_componentes/primitivos/botao";
import { AvisoElegiveis } from "./aviso-elegiveis";
import { CartaoColecao } from "./cartao-colecao";
import estilos from "./colecoes.module.css";

/**
 * `/colecoes`, modo "ver": as seções por grupo na ordem em que a leitura as
 * entrega — **nunca reordenada aqui** (`listarColecoes` é a única fonte da
 * ordem) —, cada coleção como um cartão que leva a ela.
 *
 * "Organizar" (subir, descer, mudar de grupo, criar e excluir grupo, ações em
 * lote), as sugestões e a coleção temática são do pacote 4b. Até lá a v1 faz
 * tudo isso, e a tela diz onde: o botão "Organizar na v1" leva a `/v1/colecoes`
 * (regra "Fazer na v1" do `docs/design-v2/README.md`).
 */
export async function ListaColecoes({ lista }: { lista: ListaColecoesV2DTO }) {
  const t = await getTranslations("v2Colecoes");
  const comGrupos = lista.secoes.some((s) => s.grupo !== null);

  return (
    <div className={estilos.pagina}>
      <header className={estilos.cabecalho}>
        <div>
          <h1 className={estilos.titulo}>{t("titulo")}</h1>
          <p className={`${estilos.contagem} v2-num`}>{t("contagem", { total: lista.totalColecoes })}</p>
        </div>
        <div className={estilos.acoes}>
          <BotaoLink href="/colecoes/nova" variante="primario">
            {t("nova")}
          </BotaoLink>
          <BotaoLink href="/colecoes/falta">{t("oQueFalta")}</BotaoLink>
          <BotaoLink href="/v1/colecoes">
            {t("organizarNaV1")}
          </BotaoLink>
        </div>
      </header>
      <p className={estilos.ajuda}>{t("ajudaOrganizar")}</p>

      <AvisoElegiveis />

      {lista.totalColecoes === 0 && !comGrupos && (
        <Painel className={estilos.estado}>
          <h2 className={estilos.estadoTitulo}>{t("vazio")}</h2>
          <p className={estilos.estadoTexto}>{t("vazioTexto")}</p>
          <BotaoLink href="/colecoes/nova" variante="primario">
            {t("criarPrimeira")}
          </BotaoLink>
        </Painel>
      )}

      {lista.secoes.map((secao) => {
        const chave = secao.grupo?.id ?? "sem-grupo";
        const serie = secao.grupo ? serieDistintaDoNome(secao.grupo) : null;
        return (
          <section key={chave} className={estilos.secao} aria-labelledby={comGrupos ? `grupo-${chave}` : undefined}>
            {comGrupos && (
              <h2 id={`grupo-${chave}`} className={estilos.tituloGrupo}>
                {secao.grupo ? secao.grupo.nome : t("semGrupo")}
                {serie && <span className={estilos.serie}>{t("serie", { serie })}</span>}
              </h2>
            )}
            {secao.colecoes.length === 0 ? (
              <p className={estilos.vazioGrupo}>{t("grupoVazio")}</p>
            ) : (
              <ul className={estilos.grade}>
                {secao.colecoes.map((c) => (
                  <li key={c.id}>
                    <CartaoColecao colecao={c} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
