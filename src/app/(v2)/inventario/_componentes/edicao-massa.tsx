"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { textoDaRecusa } from "@/app/_comum/recusa";
import { CONDICOES, IDIOMAS, type Condicao, type Idioma, type VarianteCopia } from "@/lib/dominio/enums";
import type { CopiaDoInventarioDTO } from "@/lib/dominio/tipos-cliente";

import { Botao } from "../../_componentes/primitivos/botao";
import { Campo, Selecao } from "../../_componentes/primitivos/campo";
import { useConfirmacao } from "../../_componentes/primitivos/dialogo-confirmacao";
import { Modal } from "../../_componentes/primitivos/modal";
import { AvisoEmLinha } from "../../_componentes/primitivos/painel";
import { type EscolhaMassa, corpoEdicaoMassa, variantesEmComum } from "./estado-inventario";
import estilos from "./inventario.module.css";

/** A recusa que diz que a seleção mudou por baixo (uma cópia removida em outra aba). */
const RECUSA_SELECAO_SUMIU = "copiasNaoEncontradasNadaAlterado";

/**
 * A edição em massa: condição, localização, idioma físico e variante, cada um
 * só se marcado, sobre as cópias selecionadas da página. É o
 * `PATCH /api/copias/massa` da v1, com o mesmo corpo (`corpoEdicaoMassa`), que
 * aplica tudo ou nada numa transação e nunca toca em alocação. O idioma é o
 * da carta na mão, nunca a linha do catálogo (regra 7).
 *
 * "Aplicar" pergunta pela confirmação da v2, com a lista do que muda; cancelar
 * não envia nada. Uma recusa mantém a janela aberta com a frase; se a recusa
 * diz que uma cópia sumiu, a tela relê a lista (a seleção é podada) e a
 * pessoa confere antes de tentar de novo.
 */
export function EdicaoMassa({
  aberto,
  itens,
  relendo,
  onFechar,
  onAplicada,
  onDesatualizada,
}: {
  aberto: boolean;
  itens: CopiaDoInventarioDTO[];
  /** A lista está sendo relida: a seleção ainda pode mudar, então não se aplica nada. */
  relendo: boolean;
  onFechar: () => void;
  onAplicada: (atualizadas: number) => void;
  onDesatualizada: () => void;
}) {
  if (!aberto) return null;
  return <Janela itens={itens} relendo={relendo} onFechar={onFechar} onAplicada={onAplicada} onDesatualizada={onDesatualizada} />;
}

function Janela({
  itens,
  relendo,
  onFechar,
  onAplicada,
  onDesatualizada,
}: {
  itens: CopiaDoInventarioDTO[];
  relendo: boolean;
  onFechar: () => void;
  onAplicada: (atualizadas: number) => void;
  onDesatualizada: () => void;
}) {
  const t = useTranslations("v2Inventario.massa");
  const tInv = useTranslations("v2Inventario");
  const tComp = useTranslations("componentes");
  const tRecusas = useTranslations("recusas");
  const { confirmar, dialogo } = useConfirmacao();

  const [marcados, setMarcados] = useState({ condicao: false, localizacao: false, idioma: false, variante: false });
  const [condicao, setCondicao] = useState<Condicao>("NM");
  const [localizacao, setLocalizacao] = useState("");
  const [idioma, setIdioma] = useState<Idioma>("pt");
  const [varianteEscolhida, setVariante] = useState<VarianteCopia | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // A seleção pode mudar com a janela aberta (uma releitura poda o que
  // sumiu): as variantes em comum e a escolhida saem dela a cada render. A
  // escolhida que deixou de servir cai na primeira que serve.
  const comuns = variantesEmComum(itens);
  const variante = varianteEscolhida && comuns.includes(varianteEscolhida) ? varianteEscolhida : (comuns[0] ?? null);

  const escolha: EscolhaMassa = {
    condicao: marcados.condicao ? condicao : null,
    localizacao: marcados.localizacao ? localizacao : null,
    idioma: marcados.idioma ? idioma : null,
    variante: marcados.variante && comuns.length > 0 ? variante : null,
  };
  const corpo = corpoEdicaoMassa(
    itens.map((i) => i.id),
    escolha,
  );
  // A seleção de agora, para conferir depois da confirmação: enquanto a
  // pergunta esperava, uma releitura pode ter podado a seleção, e o corpo
  // montado antes dela levaria uma cópia que já não está selecionada.
  const selecaoAgora = useRef({ ids: "", relendo: false });
  useEffect(() => {
    selecaoAgora.current = { ids: itens.map((i) => i.id).join(","), relendo };
  });

  function marcar(campo: keyof typeof marcados, valor: boolean) {
    setMarcados((m) => ({ ...m, [campo]: valor }));
  }

  /** O que muda, em frases curtas, para a confirmação. */
  function mudancas(): string[] {
    const linhas: string[] = [];
    if (escolha.condicao) linhas.push(t("muda.condicao", { valor: escolha.condicao }));
    if (escolha.localizacao !== null) {
      linhas.push(
        escolha.localizacao.trim() ? t("muda.localizacao", { valor: escolha.localizacao.trim() }) : t("muda.semLocalizacao"),
      );
    }
    if (escolha.idioma) linhas.push(t("muda.idioma", { valor: tInv(`idioma.${escolha.idioma}`) }));
    if (escolha.variante) linhas.push(t("muda.variante", { valor: tComp(`variante.${escolha.variante}`) }));
    return linhas;
  }

  async function aplicar() {
    if (!corpo) return;
    const ok = await confirmar({
      titulo: t("confirmarTitulo", { total: corpo.copiaIds.length }),
      descricao: `${mudancas().join(" · ")}. ${t("confirmarAlocacao")}`,
      rotuloConfirmar: t("aplicar", { total: corpo.copiaIds.length }),
    });
    if (!ok) return;
    // Uma releitura começada com a pergunta aberta (uma remoção que já estava
    // a caminho) ainda pode mudar a seleção: espera ela acabar.
    if (selecaoAgora.current.relendo || selecaoAgora.current.ids !== corpo.copiaIds.join(",")) {
      setErro(t("selecaoMudou"));
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch("/api/copias/massa", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const dados = (await r.json().catch(() => null)) as { atualizadas?: number; recusa?: { chave?: string } } | null;
      if (!r.ok) {
        setErro(textoDaRecusa(tRecusas, dados, t("erro")));
        if (dados?.recusa?.chave === RECUSA_SELECAO_SUMIU) onDesatualizada();
        return;
      }
      onAplicada(dados?.atualizadas ?? corpo.copiaIds.length);
    } catch {
      setErro(tInv("erroRede"));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Modal
        aberto
        onFechar={enviando ? () => {} : onFechar}
        titulo={t("titulo", { total: itens.length })}
        descricao={t("explica")}
        // Fechar pelo véu perderia o que foi marcado; aqui só "Cancelar", o X e o Esc.
        fecharPeloVeu={false}
        largura={560}
        rodape={
          <>
            <Botao variante="fantasma" disabled={enviando} onClick={onFechar}>
              {t("cancelar")}
            </Botao>
            <Botao variante="primario" disabled={!corpo || relendo} carregando={enviando} onClick={() => void aplicar()}>
              {t("aplicar", { total: itens.length })}
            </Botao>
          </>
        }
      >
        <div className={estilos.massa}>
          <CampoMassa
            rotulo={tInv("filtros.condicao")}
            marcado={marcados.condicao}
            onMarcar={(v) => marcar("condicao", v)}
            rotuloMarcar={t("alterar", { campo: tInv("filtros.condicao") })}
          >
            <Selecao
              aria-label={tInv("filtros.condicao")}
              value={condicao}
              disabled={!marcados.condicao}
              onChange={(e) => setCondicao(e.target.value as Condicao)}
            >
              {CONDICOES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Selecao>
          </CampoMassa>

          <CampoMassa
            rotulo={tInv("filtros.localizacao")}
            marcado={marcados.localizacao}
            onMarcar={(v) => marcar("localizacao", v)}
            rotuloMarcar={t("alterar", { campo: tInv("filtros.localizacao") })}
            dica={t("localizacaoDica")}
          >
            <Campo
              aria-label={tInv("filtros.localizacao")}
              value={localizacao}
              placeholder={tInv("filtros.localizacaoExemplo")}
              disabled={!marcados.localizacao}
              onChange={(e) => setLocalizacao(e.target.value)}
            />
          </CampoMassa>

          <CampoMassa
            rotulo={t("idiomaFisico")}
            marcado={marcados.idioma}
            onMarcar={(v) => marcar("idioma", v)}
            rotuloMarcar={t("alterar", { campo: t("idiomaFisico") })}
            dica={t("idiomaDica")}
          >
            <Selecao
              aria-label={t("idiomaFisico")}
              value={idioma}
              disabled={!marcados.idioma}
              onChange={(e) => setIdioma(e.target.value as Idioma)}
            >
              {IDIOMAS.map((i) => (
                <option key={i} value={i}>
                  {tInv(`idioma.${i}`)}
                </option>
              ))}
            </Selecao>
          </CampoMassa>

          <CampoMassa
            rotulo={tInv("filtros.variante")}
            marcado={marcados.variante && comuns.length > 0}
            desligado={comuns.length === 0}
            onMarcar={(v) => marcar("variante", v)}
            rotuloMarcar={t("alterar", { campo: tInv("filtros.variante") })}
            dica={comuns.length === 0 ? t("semVarianteComum") : t("varianteDica")}
          >
            {comuns.length > 0 && variante ? (
              <Selecao
                aria-label={tInv("filtros.variante")}
                value={variante}
                disabled={!marcados.variante}
                onChange={(e) => setVariante(e.target.value as VarianteCopia)}
              >
                {comuns.map((v) => (
                  <option key={v} value={v}>
                    {tComp(`variante.${v}`)}
                  </option>
                ))}
              </Selecao>
            ) : null}
          </CampoMassa>

          {erro ? (
            <AvisoEmLinha tom="perigo" papel="alert" titulo={t("naoAplicou")}>
              {erro}
            </AvisoEmLinha>
          ) : null}
        </div>
      </Modal>
      {dialogo}
    </>
  );
}

/**
 * Um campo da edição em massa: a caixa "alterar" com o nome do campo (o
 * `label` inteiro é a área de toque de 44 px) e o controle embaixo, desligado
 * enquanto a caixa não estiver marcada. A dica é texto visível, nunca `title`.
 */
function CampoMassa({
  rotulo,
  rotuloMarcar,
  marcado,
  desligado = false,
  onMarcar,
  dica,
  children,
}: {
  rotulo: string;
  rotuloMarcar: string;
  marcado: boolean;
  desligado?: boolean;
  onMarcar: (marcado: boolean) => void;
  dica?: string;
  children?: ReactNode;
}) {
  return (
    <fieldset className={estilos.campoMassa} data-marcado={marcado || undefined} disabled={desligado}>
      <legend className="v2-so-leitor">{rotulo}</legend>
      <label className={estilos.marcarCampo}>
        <input
          type="checkbox"
          className={estilos.caixa}
          checked={marcado}
          onChange={(e) => onMarcar(e.target.checked)}
          aria-label={rotuloMarcar}
        />
        <span aria-hidden>{rotulo}</span>
      </label>
      {children}
      {dica ? <span className={estilos.dicaMassa}>{dica}</span> : null}
    </fieldset>
  );
}
