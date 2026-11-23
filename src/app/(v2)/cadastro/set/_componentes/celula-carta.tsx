"use client";

import { ChevronRight, Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { type KeyboardEvent, memo } from "react";

import { QUANTIDADE_MAXIMA, quantidadeDoTexto, valoresDaCarta } from "@/lib/dominio/cadastro-set-v2";
import type { DefaultsGrade, LinhaGrade } from "@/lib/dominio/grade-set";
import type { CartaParaGradeDTO } from "@/lib/dominio/tipos-cliente";

import { Carta } from "../../../_componentes/carta/carta";
import { ATRIBUTO_CELULA, type PropsCelula } from "../../../_componentes/grade/grade-virtual";
import estilos from "./cadastro-set.module.css";
import { flagsDaCarta } from "./flags";

/**
 * A altura de cada célula, em px, igual em toda largura: a grade virtual põe
 * cada linha pela conta, sem medir (`cadastro-set.module.css`, `.celula`).
 */
export const ALTURA_CELULA = 168;

/** O atributo do campo de quantidade com o id da carta: é por ele que o Enter acha a próxima. */
export const ATRIBUTO_QUANTIDADE = "data-quantidade-de";

interface PropsCelulaCarta {
  carta: CartaParaGradeDTO;
  linha: LinhaGrade | undefined;
  padrao: DefaultsGrade;
  recusada: boolean;
  celula: PropsCelula;
  aoMudarQuantidade: (carta: CartaParaGradeDTO, quantidade: number) => void;
  aoEnter: (cartaId: string) => void;
  aoAjustar: (cartaId: string) => void;
  aoAmpliar: (cartaId: string) => void;
}

/**
 * Uma carta do set na grade do cadastro: miniatura (toque amplia), número e
 * nome com o "você tem", a quantidade entre − e +, e o resumo de variante,
 * idioma e condição, que abre o ajuste desta carta.
 *
 * - **O campo de quantidade é o elemento da célula na grade** (`celula`): o
 *   Tab entra nele, as setas andam de carta em carta e o Enter vai à próxima.
 *   É texto com teclado numérico, não `type="number"` (`quantidadeDoTexto`),
 *   e **controlado**: a célula pode sair da faixa montada e voltar, e o
 *   digitado mora no estado do lote, nunca aqui.
 * - Os botões da célula seguem a ordem do Tab da grade (só a célula ativa
 *   entra nela), **depois** do campo: a ordem do DOM é nome, quantidade,
 *   ajuste e miniatura, e o CSS põe a miniatura à esquerda. − e + ficam fora
 *   do Tab, porque o teclado digita o número.
 * - Nada só na cor ou só no passar do mouse: "ajustada", o aviso de variante
 *   e "recusada" são texto.
 */
export const CelulaCarta = memo(function CelulaCarta({
  carta,
  linha,
  padrao,
  recusada,
  celula,
  aoMudarQuantidade,
  aoEnter,
  aoAjustar,
  aoAmpliar,
}: PropsCelulaCarta) {
  const t = useTranslations("v2CadastroSet");
  const tc = useTranslations("componentes");
  const quantidade = linha?.quantidade ?? 0;
  const valores = valoresDaCarta(linha, padrao, flagsDaCarta(carta));
  const ajustado = new Set(valores.ajustes);
  const nomeCompleto = carta.nomeEspecie ? `${carta.nome} (${carta.nomeEspecie})` : carta.nome;
  const textoValores = [tc(`variante.${valores.variante}`), valores.idioma.toUpperCase(), valores.condicao].join(" · ");

  function aoTeclar(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    aoEnter(carta.cartaId);
  }

  return (
    <div className={`${estilos.celula} v2-painel`} data-marcada={quantidade > 0 || undefined} data-recusada={recusada || undefined}>
      <div className={estilos.cabeca}>
        <span className={estilos.linhaNome}>
          <span className={`${estilos.numero} v2-num`}>#{carta.localId}</span>
          {carta.nome}
          {carta.nomeEspecie ? <span className={estilos.especie}> ({carta.nomeEspecie})</span> : null}
        </span>
        <span className={estilos.selos}>
          {carta.qtdPossuida > 0 ? <span className={estilos.seloTem}>{t("carta.voceTem", { total: carta.qtdPossuida })}</span> : null}
          {valores.varianteNoLugar ? (
            <span className={estilos.seloAviso}>
              {t("carta.semVariante", {
                padrao: tc(`variante.${padrao.variante}`),
                variante: tc(`variante.${valores.varianteNoLugar}`),
              })}
            </span>
          ) : null}
          {recusada ? <span className={estilos.seloRecusada}>{t("carta.recusada")}</span> : null}
        </span>
      </div>

      <div className={estilos.passo}>
        <button
          type="button"
          className={estilos.passoBotao}
          tabIndex={-1}
          disabled={quantidade === 0}
          aria-label={t("carta.menos", { nome: nomeCompleto })}
          onClick={() => aoMudarQuantidade(carta, Math.max(0, quantidade - 1))}
        >
          <Minus aria-hidden size={18} />
        </button>
        <input
          {...celula}
          {...{ [ATRIBUTO_QUANTIDADE]: carta.cartaId }}
          className={`${estilos.quantidade} v2-num`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          enterKeyHint="next"
          autoComplete="off"
          maxLength={4}
          placeholder="0"
          aria-label={t("carta.quantidade", { nome: nomeCompleto })}
          value={quantidade > 0 ? String(quantidade) : ""}
          onChange={(e) => aoMudarQuantidade(carta, quantidadeDoTexto(e.target.value))}
          onFocus={(e) => {
            e.target.select();
            // As setas da grade rolam só pela barra de abas e focam sem rolar;
            // aqui o campo acerta a posição pela própria margem de rolagem,
            // que conta também a barra do lote (`.quantidade`).
            e.target.scrollIntoView({ block: "nearest" });
          }}
          onKeyDown={aoTeclar}
        />
        <button
          type="button"
          className={estilos.passoBotao}
          tabIndex={-1}
          disabled={quantidade >= QUANTIDADE_MAXIMA}
          aria-label={t("carta.mais", { nome: nomeCompleto })}
          onClick={() => aoMudarQuantidade(carta, quantidade + 1)}
        >
          <Plus aria-hidden size={18} />
        </button>
      </div>

      <button
        type="button"
        className={estilos.ajuste}
        tabIndex={celula.tabIndex}
        aria-label={t("carta.ajustar", { nome: nomeCompleto, valores: textoValores })}
        onClick={() => aoAjustar(carta.cartaId)}
      >
        <span className={estilos.ajusteValores} aria-hidden>
          <span className={ajustado.has("variante") ? estilos.valorAjustado : undefined}>{tc(`variante.${valores.variante}`)}</span>
          <span className={ajustado.has("idioma") ? estilos.valorAjustado : undefined}>{valores.idioma.toUpperCase()}</span>
          <span className={ajustado.has("condicao") ? estilos.valorAjustado : undefined}>{valores.condicao}</span>
        </span>
        {valores.ajustes.length > 0 ? (
          <span className={estilos.marcaAjustada} aria-hidden>
            {t("carta.ajustada")}
          </span>
        ) : null}
        <ChevronRight aria-hidden size={16} />
      </button>
      {/* Por último no DOM e à esquerda na tela (áreas da grade CSS): o Tab de
          fora entra pela quantidade, o que se digita, e a leitura vai do nome
          à quantidade antes dos botões. */}
      <button
        type="button"
        className={estilos.miniatura}
        tabIndex={celula.tabIndex}
        aria-label={t("carta.ampliar", { nome: nomeCompleto })}
        onClick={() => aoAmpliar(carta.cartaId)}
      >
        <Carta imagemUrl={carta.imagemUrl} origem={carta.imagemOrigem} alt="" raridade={carta.raridade} />
      </button>

    </div>
  );
}, mesmasProps);

/*
 * A grade cria um `celula` novo a cada render; comparar pelo conteúdo dele
 * deixa o `memo` valer, e digitar numa carta não redesenha as outras (o
 * estado do lote troca só a linha da carta tocada).
 */
function mesmasProps(a: PropsCelulaCarta, b: PropsCelulaCarta): boolean {
  return (
    a.carta === b.carta &&
    a.linha === b.linha &&
    a.padrao === b.padrao &&
    a.recusada === b.recusada &&
    a.celula.tabIndex === b.celula.tabIndex &&
    a.celula[ATRIBUTO_CELULA] === b.celula[ATRIBUTO_CELULA] &&
    a.aoMudarQuantidade === b.aoMudarQuantidade &&
    a.aoEnter === b.aoEnter &&
    a.aoAjustar === b.aoAjustar &&
    a.aoAmpliar === b.aoAmpliar
  );
}
