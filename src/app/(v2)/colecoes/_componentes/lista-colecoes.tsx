import { getTranslations } from "next-intl/server";

import { serieDistintaDoNome, type ListaColecoesV2DTO } from "@/lib/dominio/lista-colecoes-v2";

import { Painel } from "../../_componentes/primitivos/painel";
import { BotaoLink } from "../../_componentes/primitivos/botao";
import { CartaoColecao } from "./cartao-colecao";
import estilos from "./colecoes.module.css";
import { PainelColecoes } from "./painel-colecoes";

/**
 * `/colecoes`: as seções por grupo na ordem em que a leitura as entrega —
 * **nunca reordenada aqui** (`listarColecoes` é a única fonte da ordem) —,
 * cada coleção como um cartão que leva a ela.
 *
 * Os cartões ("ver") são desenhados aqui, no servidor, e entram prontos no
 * `PainelColecoes`, que é do cliente: ele guarda o cabeçalho, as sugestões, o
 * modo "Organizar" (pacote 4b) e as janelas, e troca os cartões pelos
 * controles quando se organiza. Uma escrita relê esta mesma leitura
 * (`router.refresh`), e os dois modos voltam com a ordem nova do servidor.
 */
export async function ListaColecoes({ lista }: { lista: ListaColecoesV2DTO }) {
  const t = await getTranslations("v2Colecoes");
  const comGrupos = lista.secoes.some((s) => s.grupo !== null);

  const vista = (
    <>
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
    </>
  );

  return <PainelColecoes lista={lista} vista={vista} />;
}
