"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { type FaltaNaImagemLocal, type ModoImagemLocal } from "@/app/_comum/imagem-local";
import { rotuloChaveVaga } from "@/lib/dominio/chave-vaga-set";
import { CONDICOES, IDIOMAS } from "@/lib/dominio/enums";
import type { CopiaDoDetalheV2DTO, DestinoElegivelDaCopiaDTO, DetalheCartaV2DTO } from "@/lib/dominio/tipos-cliente";

import { Botao } from "../primitivos/botao";
import { AreaTexto, Campo, Selecao } from "../primitivos/campo";
import { AvisoEmLinha } from "../primitivos/painel";
import { Segmentado } from "../primitivos/segmentado";

import estilos from "./detalhe.module.css";
import { type CampoComErro, type CorpoEdicaoCopia, corpoDaEdicao, formularioDaCopia } from "./edicao-copia";
import { opcoesDeVariante } from "./estado-detalhe";
import type { Formatos } from "./formatos";

/* ---------- Onde a cópia está ---------- */

/**
 * Onde a cópia está, e as duas ações de alocação do modo cópia:
 *
 * - **Alocada** (INV-09): desalocar, confirmado; a cópia volta livre, nunca
 *   é apagada.
 * - **Livre** (INV-08): "Alocar a uma coleção" lista os destinos elegíveis
 *   (`GET /api/copias/:id/destinos`: vaga vazia que ela preenche, ou coleção
 *   customizada), a pessoa escolhe um (regra 5: nunca sozinho, nem com um
 *   destino só) e aloca pela rota de sempre. Fora do padrão pede
 *   confirmação. Alocar uma unidade de um lote o divide no servidor.
 */
export function SecaoOnde({
  copia,
  formatos,
  destinos,
  carregandoDestinos,
  falhaDestinos,
  aoTentarDeNovo,
  mostrandoDestinos,
  escolhido,
  bloqueado,
  aoMostrarDestinos,
  aoEscolher,
  aoAlocar,
  aoDesalocar,
}: {
  copia: CopiaDoDetalheV2DTO;
  formatos: Formatos;
  destinos: DestinoElegivelDaCopiaDTO[] | null;
  carregandoDestinos: boolean;
  /** A recusa da lista de destinos, já em frase. */
  falhaDestinos: string | null;
  aoTentarDeNovo: () => void;
  mostrandoDestinos: boolean;
  escolhido: string | null;
  bloqueado: boolean;
  aoMostrarDestinos: (mostrar: boolean) => void;
  aoEscolher: (chave: string) => void;
  aoAlocar: () => void;
  aoDesalocar: () => void;
}) {
  const t = useTranslations("v2Detalhe");
  const a = copia.alocacao;
  return (
    <section className={estilos.bloco} aria-labelledby="v2-detalhe-onde">
      <h3 id="v2-detalhe-onde" className={estilos.tituloBloco}>
        {t("copia.onde")}
      </h3>
      {a ? (
        <>
          <p className={estilos.sutil}>
            {t("ondeAlocada", { colecao: a.colecaoNome, numero: a.numero, desde: formatos.instante(a.desde) })}
          </p>
          <div className={estilos.acoes}>
            <Botao variante="secundario" disabled={bloqueado} onClick={aoDesalocar}>
              {t("desalocar")}
            </Botao>
          </div>
          <p className={estilos.sutil}>{t("desalocarExplica")}</p>
        </>
      ) : (
        <>
          <p className={estilos.sutil}>{t("ondeLivre")}</p>
          <Botao
            className={estilos.alternar}
            variante={mostrandoDestinos ? "fantasma" : "primario"}
            aria-expanded={mostrandoDestinos}
            aria-controls="v2-detalhe-destinos"
            onClick={() => aoMostrarDestinos(!mostrandoDestinos)}
          >
            {mostrandoDestinos ? t("copia.esconderDestinos") : t("copia.alocarEmColecao")}
          </Botao>
          {mostrandoDestinos ? (
            <div id="v2-detalhe-destinos" className={estilos.bloco}>
              <p className={estilos.sutil}>{t("copia.destinosExplica")}</p>
              {carregandoDestinos && destinos === null ? <p className={estilos.sutil}>{t("carregando")}</p> : null}
              {falhaDestinos ? (
                <AvisoEmLinha
                  tom="perigo"
                  papel="alert"
                  titulo={t("naoDeu")}
                  acao={
                    <Botao pequeno onClick={aoTentarDeNovo}>
                      {t("tentarDeNovo")}
                    </Botao>
                  }
                >
                  {falhaDestinos}
                </AvisoEmLinha>
              ) : null}
              {destinos && destinos.length > 0 ? (
                <div role="radiogroup" aria-label={t("copia.destinos")} className={estilos.lista}>
                  {destinos.map((d) => {
                    const chave = chaveDoDestino(d);
                    return (
                      <label key={chave} className={estilos.opcao}>
                        <input
                          type="radio"
                          name="v2-detalhe-destino"
                          value={chave}
                          checked={escolhido === chave}
                          onChange={() => aoEscolher(chave)}
                          disabled={bloqueado}
                        />
                        <span className={estilos.opcaoTexto}>
                          <span>{d.colecaoNome}</span>
                          <span className={estilos.sutil}>
                            {[
                              t(`tipoColecao.${d.colecaoTipo}`),
                              d.vagaId && d.chave
                                ? t("copia.vagaNumero", { numero: rotuloChaveVaga(d.chave) })
                                : t("copia.semVagaFixa"),
                            ].join(" · ")}
                          </span>
                          {d.foraDePadrao ? (
                            <span>
                              <span className={estilos.etiquetaAviso}>
                                {t("foraDoPadrao", {
                                  idioma: copia.idioma.toUpperCase(),
                                  exigido: (d.idiomaExigido ?? "—").toUpperCase(),
                                })}
                              </span>
                            </span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : null}
              <div className={estilos.acoes}>
                <Botao variante="primario" disabled={bloqueado || escolhido === null} onClick={aoAlocar}>
                  {t("copia.alocarAqui")}
                </Botao>
              </div>
              {destinos && destinos.length === 0 ? <p className={estilos.sutil}>{t("copia.semDestinos")}</p> : null}
              {copia.quantidade > 1 ? <p className={estilos.sutil}>{t("vazia.lote")}</p> : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

/** Uma vaga se identifica pela vaga; uma customizada, pela coleção (a vaga nasce ao adicionar). */
export function chaveDoDestino(d: DestinoElegivelDaCopiaDTO): string {
  return d.vagaId ?? d.colecaoId;
}

/* ---------- Edição ---------- */

/**
 * Editar a cópia (INV-07): os campos da janela da v1, no mesmo `PATCH`, com
 * o corpo montado por `edicao-copia.ts` (só o que mudou). Regra 7: o idioma
 * aqui é o da carta física; a ficha do catálogo não aparece como campo.
 *
 * Quem chama remonta este formulário quando a cópia guardada muda (outra
 * leitura), por `key`: o que se vê nos campos é sempre o que está no banco
 * mais o que a pessoa digitou desde então.
 */
export function FormularioEdicao({
  copia,
  carta,
  bloqueado,
  aoSalvar,
  aoBarrar,
}: {
  copia: CopiaDoDetalheV2DTO;
  carta: DetalheCartaV2DTO["carta"];
  bloqueado: boolean;
  aoSalvar: (corpo: CorpoEdicaoCopia) => void;
  /** A validação local barrou o envio (a recusa da ação anterior sai da tela). */
  aoBarrar: () => void;
}) {
  const t = useTranslations("v2Detalhe.edicao");
  const tDet = useTranslations("v2Detalhe");
  const tComp = useTranslations("componentes");
  const [f, setF] = useState(() => formularioDaCopia(copia));
  const [erros, setErros] = useState<CampoComErro[]>([]);
  const resultado = corpoDaEdicao(copia, f);
  const mudou = !resultado.ok || resultado.corpo !== null;

  function mudar<K extends keyof typeof f>(campo: K, valor: (typeof f)[K]) {
    setF((atual) => ({ ...atual, [campo]: valor }));
    setErros((atuais) => atuais.filter((e) => e !== campo));
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!resultado.ok) {
      setErros(resultado.erros);
      aoBarrar();
      return;
    }
    if (resultado.corpo) aoSalvar(resultado.corpo);
  }

  const erro = (campo: CampoComErro) => (erros.includes(campo) ? t(`erro.${campo}`) : undefined);

  return (
    <form className={estilos.formulario} onSubmit={enviar} noValidate>
      {/* Desabilitado enquanto salva ou relê: o que se digitasse agora seria
          apagado quando o formulário remonta com a cópia relida. */}
      <fieldset className={estilos.semMoldura} disabled={bloqueado}>
      <div className={estilos.duas}>
        <Campo
          rotulo={t("quantidade")}
          inputMode="numeric"
          value={f.quantidade}
          onChange={(e) => mudar("quantidade", e.target.value)}
          erro={erro("quantidade")}
        />
        <Selecao rotulo={t("idioma")} dica={t("idiomaDica")} value={f.idioma} onChange={(e) => mudar("idioma", e.target.value as typeof f.idioma)}>
          {IDIOMAS.map((i) => (
            <option key={i} value={i}>
              {tDet(`idiomaNome.${i}`)}
            </option>
          ))}
        </Selecao>
        <Selecao rotulo={t("variante")} value={f.variante} onChange={(e) => mudar("variante", e.target.value as typeof f.variante)}>
          {opcoesDeVariante(carta, copia.variante).map((v) => (
            <option key={v} value={v}>
              {tComp(`variante.${v}`)}
            </option>
          ))}
        </Selecao>
        <Selecao rotulo={t("condicao")} value={f.condicao} onChange={(e) => mudar("condicao", e.target.value as typeof f.condicao)}>
          {CONDICOES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Selecao>
      </div>
      <Campo
        rotulo={t("localizacao")}
        placeholder={t("localizacaoExemplo")}
        value={f.localizacao}
        onChange={(e) => mudar("localizacao", e.target.value)}
      />
      <fieldset className={estilos.grupo}>
        <legend>{t("certificacao")}</legend>
        <div className={estilos.tres}>
          <Campo rotulo={t("empresa")} value={f.gradedEmpresa} onChange={(e) => mudar("gradedEmpresa", e.target.value)} />
          <Campo rotulo={t("nota")} value={f.gradedNota} onChange={(e) => mudar("gradedNota", e.target.value)} />
          <Campo
            rotulo={t("certificado")}
            value={f.gradedCertificado}
            onChange={(e) => mudar("gradedCertificado", e.target.value)}
          />
        </div>
      </fieldset>
      <fieldset className={estilos.grupo}>
        <legend>{t("aquisicao")}</legend>
        <div className={estilos.tres}>
          <Campo
            rotulo={t("data")}
            type="date"
            value={f.aquisicaoData}
            onChange={(e) => mudar("aquisicaoData", e.target.value)}
            erro={erro("aquisicaoData")}
          />
          <Campo rotulo={t("origem")} value={f.aquisicaoOrigem} onChange={(e) => mudar("aquisicaoOrigem", e.target.value)} />
          <Campo
            rotulo={t("preco")}
            inputMode="decimal"
            placeholder="0,00"
            value={f.aquisicaoPreco}
            onChange={(e) => mudar("aquisicaoPreco", e.target.value)}
            erro={erro("aquisicaoPreco")}
          />
        </div>
      </fieldset>
      <AreaTexto rotulo={t("notas")} rows={2} value={f.notas} onChange={(e) => mudar("notas", e.target.value)} />
      </fieldset>
      <div className={estilos.acoes}>
        <Botao type="submit" variante="primario" disabled={bloqueado || !mudou}>
          {t("salvar")}
        </Botao>
        <Botao variante="fantasma" disabled={bloqueado || !mudou} onClick={() => { setF(formularioDaCopia(copia)); setErros([]); }}>
          {t("desfazer")}
        </Botao>
      </div>
      {!mudou ? <p className={estilos.sutil}>{t("semMudanca")}</p> : null}
    </form>
  );
}

/* ---------- Foto própria ---------- */

/**
 * A foto própria da carta (INV-11), portada da janela da v1
 * (`adicionar-imagem-local.tsx`) sem importá-la: os pedidos vêm de
 * `_comum/imagem-local.ts`, e aqui só os campos. A foto é **da ficha do
 * catálogo** que o detalhe mostra (toda cópia dessa ficha passa a usá-la);
 * só a foto própria se troca ou remove, a do catálogo não é da pessoa.
 *
 * O modo MyPCards mapeia o set inteiro de uma vez a partir do endereço de
 * uma imagem dele, e o download corre em segundo plano — a frase de
 * sucesso diz isso, nunca "pronto".
 */
export function SecaoFoto({
  temFotoPropria,
  setId,
  bloqueado,
  aoEnviar,
  aoRemover,
}: {
  temFotoPropria: boolean;
  setId: string;
  bloqueado: boolean;
  aoEnviar: (modo: ModoImagemLocal, arquivo: File | null, link: string) => Promise<FaltaNaImagemLocal | null>;
  aoRemover: () => void;
}) {
  const t = useTranslations("v2Detalhe.foto");
  const [modo, setModo] = useState<ModoImagemLocal>("arquivo");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [link, setLink] = useState("");
  const [falta, setFalta] = useState<FaltaNaImagemLocal | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setFalta(await aoEnviar(modo, arquivo, link));
  }

  return (
    <form className={estilos.formulario} onSubmit={enviar} noValidate>
      <p className={estilos.sutil}>{temFotoPropria ? t("explicaTrocar") : t("explicaAdicionar")}</p>
      <Segmentado
        rotulo={t("modo")}
        valor={modo}
        aoMudar={(m) => {
          setModo(m);
          setFalta(null);
          // O seletor de arquivo desmonta fora do modo arquivo e volta vazio:
          // o arquivo escolhido antes não pode ir escondido no próximo envio.
          if (m !== "arquivo") setArquivo(null);
        }}
        opcoes={[
          { valor: "arquivo", rotulo: t("modoArquivo") },
          { valor: "link", rotulo: t("modoLink") },
          { valor: "mypcards", rotulo: t("modoMypcards") },
        ]}
        largo
      />
      {modo === "arquivo" ? (
        <Campo
          key="arquivo"
          rotulo={t("arquivo")}
          dica={t("arquivoDica")}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            setArquivo(e.target.files?.[0] ?? null);
            setFalta(null);
          }}
          erro={falta === "erroEscolhaArquivo" ? t(falta) : undefined}
        />
      ) : (
        <Campo
          key={modo}
          rotulo={modo === "mypcards" ? t("mypcards", { set: setId }) : t("link")}
          dica={modo === "mypcards" ? t("mypcardsDica") : t("linkDica")}
          type="url"
          inputMode="url"
          placeholder={modo === "mypcards" ? "https://img.mypcards.com/…/pokemon_mee_004_pt.jpg" : "https://…"}
          value={link}
          onChange={(e) => {
            setLink(e.target.value);
            setFalta(null);
          }}
          erro={falta && falta !== "erroEscolhaArquivo" ? t(falta) : undefined}
        />
      )}
      <div className={estilos.acoes}>
        <Botao type="submit" variante="primario" disabled={bloqueado}>
          {modo === "mypcards" ? t("mapearSet") : t("salvarFoto")}
        </Botao>
        {temFotoPropria ? (
          <Botao variante="perigo" disabled={bloqueado} onClick={aoRemover}>
            {t("remover")}
          </Botao>
        ) : null}
      </div>
    </form>
  );
}
