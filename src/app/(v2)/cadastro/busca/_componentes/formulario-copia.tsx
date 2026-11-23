"use client";

import { useTranslations } from "next-intl";
import { type Ref } from "react";

import { CONDICOES, IDIOMAS, type Condicao, type Idioma, type VarianteCopia } from "@/lib/dominio/enums";
import type { FormularioCopia } from "@/lib/dominio/cadastro-busca-v2";
import type { CartaEncontradaDTO } from "@/lib/dominio/tipos-cliente";
import { variantesDisponiveis } from "@/lib/dominio/variantes-catalogo";

import { Botao } from "../../../_componentes/primitivos/botao";
import { Campo, Selecao } from "../../../_componentes/primitivos/campo";

import estilos from "./cadastro-busca.module.css";

/**
 * O formulário da cópia (CBUS-04), inline abaixo dos resultados: quantidade,
 * variante, idioma **físico**, condição e localização.
 *
 * - **A variante é o que o catálogo diz que a carta tem** (o mesmo
 *   `variantesDisponiveis` do cadastro por set); o servidor recusa o resto.
 * - **O idioma é o da carta física** (regra 7). A linha do catálogo aparece
 *   só como informação ("catálogo EN"): escolher EN aqui não troca a carta, e
 *   uma carta de um set sem dado em português pode existir impressa em
 *   português. O texto de ajuda diz isso ao lado do campo, não num `title`.
 * - Não é uma janela: no celular o teclado sobre uma folha fixa esconde os
 *   campos de baixo, e uma janela sobre a lista tiraria a carta da vista.
 */
export function FormularioCopiaBusca({
  carta,
  form,
  aoMudar,
  aoGravar,
  aoCancelar,
  gravando,
  erroQuantidade,
  titulo,
  refTitulo,
}: {
  carta: CartaEncontradaDTO;
  form: FormularioCopia;
  aoMudar: (form: FormularioCopia) => void;
  aoGravar: () => void;
  aoCancelar: () => void;
  gravando: boolean;
  erroQuantidade: boolean;
  titulo: string;
  /** O título recebe o foco quando a carta é escolhida: o leitor de tela o lê. */
  refTitulo: Ref<HTMLHeadingElement>;
}) {
  const t = useTranslations("v2CadastroBusca.copia");
  const tVariante = useTranslations("componentes.variante");
  const tIdioma = useTranslations("v2Detalhe.idiomaNome");

  return (
    <form
      className={`v2-painel ${estilos.formularioCopia}`}
      aria-labelledby="v2-busca-form-titulo"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        aoGravar();
      }}
    >
      <h2 id="v2-busca-form-titulo" ref={refTitulo} tabIndex={-1} className={estilos.tituloForm}>
        {titulo}
      </h2>
      <p className={estilos.ajuda}>{t("catalogoDiz", { idioma: carta.idiomaCatalogo.toUpperCase() })}</p>
      <fieldset className={estilos.semMoldura} disabled={gravando}>
        <div className={estilos.camposCopia}>
          <Campo
            rotulo={t("quantidade")}
            inputMode="numeric"
            value={form.quantidade}
            onChange={(e) => aoMudar({ ...form, quantidade: e.target.value })}
            erro={erroQuantidade ? t("erroQuantidade") : undefined}
          />
          <Selecao
            rotulo={t("variante")}
            value={form.variante}
            onChange={(e) => aoMudar({ ...form, variante: e.target.value as VarianteCopia })}
          >
            {variantesDisponiveis(carta).map((v) => (
              <option key={v} value={v}>
                {tVariante(v)}
              </option>
            ))}
          </Selecao>
          <Selecao
            rotulo={t("idiomaFisico")}
            dica={t("idiomaFisicoDica")}
            value={form.idioma}
            onChange={(e) => aoMudar({ ...form, idioma: e.target.value as Idioma })}
          >
            {IDIOMAS.map((i) => (
              <option key={i} value={i}>
                {tIdioma(i)}
              </option>
            ))}
          </Selecao>
          <Selecao
            rotulo={t("condicao")}
            value={form.condicao}
            onChange={(e) => aoMudar({ ...form, condicao: e.target.value as Condicao })}
          >
            {CONDICOES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Selecao>
          <div className={estilos.larguraTotal}>
            <Campo
              rotulo={t("localizacao")}
              value={form.localizacao}
              onChange={(e) => aoMudar({ ...form, localizacao: e.target.value })}
              placeholder={t("localizacaoExemplo")}
            />
          </div>
        </div>
      </fieldset>
      <div className={estilos.acoesForm}>
        <Botao type="submit" variante="primario" carregando={gravando}>
          {gravando ? t("gravando") : t("gravar")}
        </Botao>
        <Botao variante="secundario" disabled={gravando} onClick={aoCancelar}>
          {t("cancelar")}
        </Botao>
      </div>
    </form>
  );
}
