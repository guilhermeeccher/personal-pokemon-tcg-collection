"use client";

import { useTranslations } from "next-intl";

import { valoresDaCarta } from "@/lib/dominio/cadastro-set-v2";
import { CONDICOES, IDIOMAS } from "@/lib/dominio/enums";
import type { DefaultsGrade, LinhaGrade } from "@/lib/dominio/grade-set";
import type { CartaParaGradeDTO } from "@/lib/dominio/tipos-cliente";
import { variantesDisponiveis } from "@/lib/dominio/variantes-catalogo";

import { Carta } from "../../../_componentes/carta/carta";
import { Botao } from "../../../_componentes/primitivos/botao";
import { Selecao } from "../../../_componentes/primitivos/campo";
import { Modal } from "../../../_componentes/primitivos/modal";
import estilos from "./cadastro-set.module.css";
import { flagsDaCarta } from "./flags";

/**
 * O ajuste de uma carta: variante, idioma físico e condição só dela. Vale na
 * hora (o estado do lote é a fonte), e "Pronto" só fecha — não há o que
 * cancelar. A variante oferece só o que o catálogo tem para a carta, como na
 * v1; o servidor confere de novo, carta a carta, contra a ficha dela.
 */
export function AjusteCarta({
  carta,
  linha,
  padrao,
  aoMudar,
  onFechar,
}: {
  carta: CartaParaGradeDTO | null;
  linha: LinhaGrade | undefined;
  padrao: DefaultsGrade;
  aoMudar: (cartaId: string, campo: keyof DefaultsGrade, valor: string) => void;
  onFechar: () => void;
}) {
  const t = useTranslations("v2CadastroSet");
  const tc = useTranslations("componentes");
  if (!carta) return <Modal aberto={false} onFechar={onFechar} titulo="" />;
  const flags = flagsDaCarta(carta);
  const valores = valoresDaCarta(linha, padrao, flags);
  return (
    <Modal
      aberto
      onFechar={onFechar}
      titulo={t("ajuste.titulo", { numero: carta.localId, nome: carta.nome })}
      rodape={
        <Botao variante="primario" largo onClick={onFechar}>
          {t("ajuste.pronto")}
        </Botao>
      }
    >
      <div className={estilos.ajusteJanela}>
        <p className={estilos.ajusteExplica}>{t("ajuste.explica")}</p>
        {valores.semVarianteDoPadrao ? (
          <p className={estilos.ajusteAviso}>{t("ajuste.semVariante", { padrao: tc(`variante.${padrao.variante}`) })}</p>
        ) : null}
        <Selecao
          rotulo={t("padrao.variante")}
          value={valores.variante}
          onChange={(e) => aoMudar(carta.cartaId, "variante", e.target.value)}
        >
          {variantesDisponiveis(flags).map((v) => (
            <option key={v} value={v}>
              {tc(`variante.${v}`)}
            </option>
          ))}
        </Selecao>
        <Selecao
          rotulo={t("padrao.idioma")}
          value={valores.idioma}
          onChange={(e) => aoMudar(carta.cartaId, "idioma", e.target.value)}
        >
          {IDIOMAS.map((i) => (
            <option key={i} value={i}>
              {t(`idioma.${i}`)}
            </option>
          ))}
        </Selecao>
        <Selecao
          rotulo={t("padrao.condicao")}
          value={valores.condicao}
          onChange={(e) => aoMudar(carta.cartaId, "condicao", e.target.value)}
        >
          {CONDICOES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Selecao>
      </div>
    </Modal>
  );
}

/**
 * A carta ampliada: a Carta do pacote 0b no palco, com a imagem grande (a
 * pequena aparece primeiro e troca quando a grande decodifica). Abre pelo
 * toque na miniatura — nunca pelo passar do mouse.
 */
export function ZoomCarta({ carta, onFechar }: { carta: CartaParaGradeDTO | null; onFechar: () => void }) {
  const t = useTranslations("v2CadastroSet");
  if (!carta) return <Modal aberto={false} onFechar={onFechar} titulo="" />;
  return (
    <Modal aberto onFechar={onFechar} titulo={t("zoom.titulo", { numero: carta.localId, nome: carta.nome })} largura={420}>
      <div className={estilos.zoom}>
        <div className={estilos.zoomCarta}>
          <Carta
            imagemUrl={carta.imagemUrl}
            origem={carta.imagemOrigem}
            alt={carta.nome}
            raridade={carta.raridade}
            qualidade="high"
            modo="palco"
          />
        </div>
        {carta.nomeEspecie ? <p className={estilos.zoomInfo}>{carta.nomeEspecie}</p> : null}
      </div>
    </Modal>
  );
}
