"use client";

/**
 * O checklist de uma tarefa, aberto ali mesmo na lista de planos
 * (`painel-planos.tsx` decide quando aparece), portado de
 * `(v1)/v1/dex/planos/etapas-tarefa.tsx`. Regras em `lib/dominio/dex-etapas.ts`;
 * aqui só a tela.
 *
 * - **Só mexe quem pode** (`editavel`: tarefa aberta num plano ativo). Fora
 *   disso a lista aparece com as caixas desligadas, sem botão e com a frase
 *   que diz por quê: é histórico, e o servidor recusaria do mesmo jeito.
 *   Um formulário que estava aberto quando a tarefa fechou some também.
 * - **Marcar a última etapa não conclui a tarefa.** Só o aviso de "todas
 *   feitas" aparece, ao lado de "Concluir"; o clique é da pessoa.
 * - **Reordenar é subir/descer, nunca arrastar**: arrastar no iPhone briga
 *   com a rolagem da página, e o botão funciona igual com teclado. Cada
 *   clique manda a lista inteira na ordem nova (`moverNaOrdem`); uma lista
 *   velha (outra aba mexeu) volta como recusa traduzida, e a página é lida de
 *   novo. A tela fica ocupada até a lista relida chegar, para um segundo
 *   clique não calcular a ordem sobre a lista velha e desfazer o primeiro.
 * - **O foco não se perde.** Depois de mover, o foco fica no mesmo botão, já
 *   na posição nova; depois de salvar ou cancelar um formulário, volta ao
 *   botão que o abriu (editar a etapa, ou "Adicionar etapa").
 * - **Seguir e organizar são modos separados.** Aberta, a lista é só caixa,
 *   texto e detalhe — o que se lê com o controle na mão; subir, descer,
 *   editar e excluir aparecem com "Editar etapas", por tarefa.
 * - **O detalhe é texto de várias linhas, sempre visível**, nunca em hover ou
 *   `title`.
 * - **Excluir pergunta** pelo diálogo de confirmação da v2; cancelar não
 *   envia nada.
 * - **A caixa muda no toque**, antes da resposta: a marcação otimista vale
 *   enquanto a lista recebida for a mesma (`base`) e some sozinha quando a
 *   página relida traz a lista nova. Recusada, some na hora.
 * - Os limites (1 a 200 caracteres no texto, até 2.000 no detalhe, até 50
 *   etapas) são conferidos antes de enviar, com frase traduzida; o de 50
 *   volta do servidor quando outra aba encheu a tarefa (`dexEtapasDemais`).
 */

import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { MAX_DETALHE_ETAPA, MAX_ETAPAS_POR_TAREFA, MAX_TEXTO_ETAPA, moverNaOrdem } from "@/lib/dominio/dex-etapas";
import type { EtapaDexDTO, TarefaDexDTO } from "@/lib/dominio/tipos-cliente";

import { Botao } from "../../../_componentes/primitivos/botao";
import { AreaTexto, Campo } from "../../../_componentes/primitivos/campo";
import type { OpcoesConfirmacao } from "../../../_componentes/primitivos/dialogo-confirmacao";

import estilos from "./planos.module.css";
import { cabeMaisEtapa, erroDaEtapa, type ErroEtapa } from "./regras-planos";

/** O envio da tela de planos: um pedido por vez; `onde` diz junto de quê a recusa aparece. */
export type Enviar = (url: string, method: string, corpo?: unknown, onde?: string) => Promise<boolean>;

/** `etapaId` nulo = etapa nova, no fim. */
type Formulario = { etapaId: string | null; texto: string; detalhe: string };

export function EtapasTarefa({
  tarefa,
  idTitulo,
  editavel,
  ocupado,
  enviar,
  confirmar,
}: {
  tarefa: TarefaDexDTO;
  /** O título da tarefa, que nomeia a lista. */
  idTitulo: string;
  editavel: boolean;
  ocupado: boolean;
  enviar: Enviar;
  confirmar: (opcoes: OpcoesConfirmacao) => Promise<boolean>;
}) {
  const t = useTranslations("v2DexPlanos");
  const tp = useTranslations("dex.planos");
  const [form, setForm] = useState<Formulario | null>(null);
  const [erroForm, setErroForm] = useState<ErroEtapa | null>(null);
  const [organizando, setOrganizando] = useState(false);
  const [marcacao, setMarcacao] = useState<{ id: string; feita: boolean; base: EtapaDexDTO[] } | null>(null);
  /**
   * Para onde o foco volta quando o botão que o tinha sai da tela (o
   * formulário fecha, a etapa muda de lugar ou é excluída): seletores dentro
   * deste checklist, em ordem de preferência. Só se aplica com a tela livre —
   * um botão desligado não recebe foco — e sem formulário aberto.
   */
  const focar = useRef<string[] | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  /* Formulário só com a tarefa editável: concluída ou descartada (aqui ou em
     outra aba), o editor aberto some em vez de seguir enviando. */
  const aberto = editavel ? form : null;

  const feita = (e: EtapaDexDTO) =>
    marcacao && marcacao.base === tarefa.etapas && marcacao.id === e.id ? marcacao.feita : e.feita;
  const ids = tarefa.etapas.map((e) => e.id);
  const cabe = cabeMaisEtapa(tarefa.etapas.length);

  useEffect(() => {
    if (!focar.current || ocupado || aberto) return;
    const seletores = focar.current;
    focar.current = null;
    for (const seletor of seletores) {
      const alvo = raiz.current?.querySelector<HTMLElement>(`${seletor}:not(:disabled)`);
      if (alvo) {
        alvo.focus();
        return;
      }
    }
  }, [tarefa.etapas, ocupado, aberto]);

  const naEtapa = (id: string, dentro: string) => `[data-etapa="${CSS.escape(id)}"] ${dentro}`;
  const ADICIONAR = '[data-acao="adicionar"]';
  const ORGANIZAR = '[data-acao="organizar"]';

  function fechar(f: Formulario) {
    focar.current = f.etapaId ? [naEtapa(f.etapaId, "[data-editar]"), ADICIONAR, ORGANIZAR] : [ADICIONAR, ORGANIZAR];
    setForm(null);
  }

  function abrir(f: Formulario) {
    setErroForm(null);
    setForm(f);
  }

  async function salvar(f: Formulario) {
    const problema = erroDaEtapa(f);
    setErroForm(problema);
    if (problema) return;
    const corpo = { texto: f.texto, detalhe: f.detalhe };
    const ok = f.etapaId
      ? await enviar(`/api/dex/etapas/${f.etapaId}`, "PATCH", corpo, tarefa.id)
      : await enviar(`/api/dex/tarefas/${tarefa.id}/etapas`, "POST", corpo, tarefa.id);
    if (ok) fechar(f);
  }

  async function marcar(e: EtapaDexDTO, valor: boolean) {
    setMarcacao({ id: e.id, feita: valor, base: tarefa.etapas });
    if (!(await enviar(`/api/dex/etapas/${e.id}`, "PATCH", { feita: valor }, tarefa.id))) setMarcacao(null);
  }

  async function excluir(e: EtapaDexDTO) {
    const ok = await confirmar({
      titulo: tp("confirmarExcluirEtapa", { etapa: e.texto }),
      descricao: t("excluirEtapaTexto"),
      rotuloConfirmar: t("excluirEtapaConfirmar"),
      perigoso: true,
    });
    if (!ok) return;
    // A etapa sai da lista com o botão que tinha o foco.
    if (await enviar(`/api/dex/etapas/${e.id}`, "DELETE", undefined, tarefa.id)) focar.current = [ORGANIZAR, ADICIONAR];
  }

  async function mover(e: EtapaDexDTO, direcao: -1 | 1) {
    const ok = await enviar(
      `/api/dex/tarefas/${tarefa.id}/etapas/ordem`,
      "PUT",
      { ids: moverNaOrdem(ids, e.id, direcao) },
      tarefa.id,
    );
    // Marcado só quando o pedido foi aceito: um segundo clique recusado por já
    // haver um em voo não apaga o foco do primeiro. A lista nova chega depois —
    // a tela fica ocupada até ela, e o foco só se aplica com a tela livre.
    // Na ponta, o botão daquela direção desliga: o foco vai para o outro.
    if (ok) focar.current = [naEtapa(e.id, `[data-mover="${direcao < 0 ? "subir" : "descer"}"]`), naEtapa(e.id, "[data-mover]")];
  }

  const formulario = (f: Formulario) => (
    <FormularioEtapa
      f={f}
      erro={erroForm}
      ocupado={ocupado}
      onMudar={setForm}
      onSalvar={salvar}
      onCancelar={fechar}
    />
  );

  return (
    <div ref={raiz} className={estilos.etapas}>
      {tarefa.etapas.length === 0 ? (
        <p className={estilos.textoFraco}>{tp("semEtapas")}</p>
      ) : (
        <ol className={estilos.listaEtapas} aria-labelledby={idTitulo}>
          {tarefa.etapas.map((e, i) =>
            aberto?.etapaId === e.id ? (
              <li key={e.id}>{formulario(aberto)}</li>
            ) : (
              <li key={e.id} className={estilos.etapa} data-etapa={e.id}>
                <label className={estilos.etapaMarca} data-editavel={editavel || undefined}>
                  <input
                    type="checkbox"
                    className={estilos.caixa}
                    checked={feita(e)}
                    disabled={!editavel || ocupado}
                    onChange={(ev) => void marcar(e, ev.target.checked)}
                  />
                  <span className={estilos.etapaTexto}>
                    <span className={estilos.etapaLinha} data-feita={feita(e) || undefined}>
                      {e.texto}
                    </span>
                    {e.detalhe && <span className={estilos.etapaDetalhe}>{e.detalhe}</span>}
                  </span>
                </label>
                {editavel && organizando && (
                  <div className={estilos.etapaAcoes}>
                    <Botao
                      soIcone
                      pequeno
                      data-mover="subir"
                      aria-label={tp("subir", { etapa: e.texto })}
                      disabled={ocupado || i === 0}
                      icone={<ArrowUp size={18} aria-hidden />}
                      onClick={() => void mover(e, -1)}
                    />
                    <Botao
                      soIcone
                      pequeno
                      data-mover="descer"
                      aria-label={tp("descer", { etapa: e.texto })}
                      disabled={ocupado || i === tarefa.etapas.length - 1}
                      icone={<ArrowDown size={18} aria-hidden />}
                      onClick={() => void mover(e, 1)}
                    />
                    <Botao
                      soIcone
                      pequeno
                      data-editar
                      aria-label={t("editarEtapaNome", { etapa: e.texto })}
                      disabled={ocupado}
                      icone={<Pencil size={17} aria-hidden />}
                      onClick={() => abrir({ etapaId: e.id, texto: e.texto, detalhe: e.detalhe ?? "" })}
                    />
                    <Botao
                      soIcone
                      pequeno
                      variante="perigo"
                      aria-label={t("excluirEtapaNome", { etapa: e.texto })}
                      disabled={ocupado}
                      icone={<Trash2 size={17} aria-hidden />}
                      onClick={() => void excluir(e)}
                    />
                  </div>
                )}
              </li>
            ),
          )}
        </ol>
      )}
      {!editavel && <p className={estilos.textoFraco}>{t("etapasFechadas")}</p>}
      {/* Cheia (a lista relida depois de um `dexEtapasDemais`), o formulário de etapa nova dá lugar à nota. */}
      {editavel &&
        (aberto?.etapaId === null && cabe ? (
          formulario(aberto)
        ) : (
          <>
            {!cabe && <p className={estilos.textoFraco}>{t("limiteEtapas", { maximo: MAX_ETAPAS_POR_TAREFA })}</p>}
            <div className={estilos.botoes}>
              <Botao
                pequeno
                data-acao="adicionar"
                disabled={ocupado || !cabe}
                onClick={() => abrir({ etapaId: null, texto: "", detalhe: "" })}
              >
                {tp("adicionarEtapa")}
              </Botao>
              {tarefa.etapas.length > 0 && (
                <Botao
                  pequeno
                  variante="fantasma"
                  data-acao="organizar"
                  aria-pressed={organizando}
                  onClick={() => {
                    setOrganizando(!organizando);
                    setForm(null);
                  }}
                >
                  {organizando ? tp("fecharEdicaoEtapas") : tp("editarEtapas")}
                </Botao>
              )}
            </div>
          </>
        ))}
    </div>
  );
}

/** O formulário de etapa, nova ou editada: o mesmo, no lugar dela ou no fim da lista. */
function FormularioEtapa({
  f,
  erro: erroForm,
  ocupado,
  onMudar,
  onSalvar,
  onCancelar,
}: {
  f: Formulario;
  erro: ErroEtapa | null;
  ocupado: boolean;
  onMudar: (f: Formulario) => void;
  onSalvar: (f: Formulario) => void;
  onCancelar: (f: Formulario) => void;
}) {
  const t = useTranslations("v2DexPlanos");
  const tp = useTranslations("dex.planos");
  const texto = f.texto.trim().length;
  return (
    <form
      className={estilos.formularioEtapa}
      aria-label={f.etapaId ? t("editarEtapa") : tp("adicionarEtapa")}
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        onSalvar(f);
      }}
    >
      <Campo
        rotulo={tp("etapaTexto")}
        value={f.texto}
        required
        autoFocus
        maxLength={MAX_TEXTO_ETAPA}
        dica={t("contador", { usados: texto, maximo: MAX_TEXTO_ETAPA })}
        erro={
          erroForm === "textoVazio"
            ? t("erroEtapa.textoVazio")
            : erroForm === "textoLongo"
              ? t("erroEtapa.textoLongo", { maximo: MAX_TEXTO_ETAPA })
              : undefined
        }
        onChange={(ev) => onMudar({ ...f, texto: ev.target.value })}
      />
      <AreaTexto
        rotulo={tp("etapaDetalhe")}
        rows={3}
        value={f.detalhe}
        maxLength={MAX_DETALHE_ETAPA}
        dica={t("contador", { usados: f.detalhe.trim().length, maximo: MAX_DETALHE_ETAPA })}
        erro={erroForm === "detalheLongo" ? t("erroEtapa.detalheLongo", { maximo: MAX_DETALHE_ETAPA }) : undefined}
        onChange={(ev) => onMudar({ ...f, detalhe: ev.target.value })}
      />
      <div className={estilos.botoes}>
        <Botao type="submit" variante="primario" pequeno carregando={ocupado}>
          {f.etapaId ? tp("salvar") : tp("adicionar")}
        </Botao>
        <Botao variante="fantasma" pequeno disabled={ocupado} onClick={() => onCancelar(f)}>
          {tp("cancelar")}
        </Botao>
      </div>
    </form>
  );
}
