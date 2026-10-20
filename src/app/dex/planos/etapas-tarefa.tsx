"use client";

/**
 * O checklist de uma tarefa, aberto ali mesmo na lista de planos
 * (`painel-planos.tsx` decide quando ele aparece). Regras em
 * `lib/dominio/dex-etapas.ts`; aqui só a tela.
 *
 * - **Só mexe quem pode** (`editavel`: tarefa aberta num plano ativo). Fora
 *   disso a lista aparece, com as caixas desligadas e sem botão: é
 *   histórico, e o servidor recusaria do mesmo jeito.
 * - **Reordenar é subir/descer, não arrastar.** Arrastar no iPhone briga com
 *   a rolagem da página, e o botão funciona igual com teclado. Cada clique
 *   manda a lista inteira na ordem nova (`moverNaOrdem`); uma lista velha
 *   (outra aba mexeu) volta como recusa, e a tela recarrega a lista.
 * - **O detalhe é texto de várias linhas, sempre visível** — nunca só em
 *   hover ou `title`, que o celular não tem.
 * - Um formulário por vez: acrescentar e editar usam o mesmo, no lugar.
 * - **A caixa muda no toque**, antes da resposta: a marcação otimista vale
 *   enquanto a lista recebida for a mesma (`base`), e some sozinha quando o
 *   `router.refresh()` traz a lista nova — sem efeito para limpar, e sem a
 *   caixa voltar ao estado velho por um instante. Recusada, some na hora.
 */

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Botao } from "@/app/_componentes/botao";
import { Campo, classesEntrada } from "@/app/_componentes/campo";
import { MAX_DETALHE_ETAPA, MAX_TEXTO_ETAPA, moverNaOrdem } from "@/lib/dominio/dex-etapas";
import type { EtapaDexDTO, TarefaDexDTO } from "@/lib/dominio/tipos-cliente";

type Enviar = (url: string, method: string, corpo?: unknown) => Promise<boolean>;

/** `etapaId` nulo = etapa nova, no fim. */
type Formulario = { etapaId: string | null; texto: string; detalhe: string };

const classesBotaoLinha = "max-md:h-11 max-md:min-w-11";

export function EtapasDaTarefa({
  id,
  tarefa,
  editavel,
  ocupado,
  enviar,
}: {
  id: string;
  tarefa: TarefaDexDTO;
  editavel: boolean;
  ocupado: boolean;
  enviar: Enviar;
}) {
  const t = useTranslations("dex.planos");
  const router = useRouter();
  const [form, setForm] = useState<Formulario | null>(null);
  const [marcacao, setMarcacao] = useState<{ id: string; feita: boolean; base: EtapaDexDTO[] } | null>(null);
  const feita = (e: EtapaDexDTO) => (marcacao && marcacao.base === tarefa.etapas && marcacao.id === e.id ? marcacao.feita : e.feita);
  const ids = tarefa.etapas.map((e) => e.id);

  async function salvar(f: Formulario) {
    const corpo = { texto: f.texto, detalhe: f.detalhe };
    const ok = f.etapaId
      ? await enviar(`/api/dex/etapas/${f.etapaId}`, "PATCH", corpo)
      : await enviar(`/api/dex/tarefas/${tarefa.id}/etapas`, "POST", corpo);
    if (ok) setForm(null);
  }

  async function marcar(e: EtapaDexDTO, valor: boolean) {
    setMarcacao({ id: e.id, feita: valor, base: tarefa.etapas });
    if (!(await enviar(`/api/dex/etapas/${e.id}`, "PATCH", { feita: valor }))) setMarcacao(null);
  }

  async function excluir(e: EtapaDexDTO) {
    if (!window.confirm(t("confirmarExcluirEtapa", { etapa: e.texto }))) return;
    await enviar(`/api/dex/etapas/${e.id}`, "DELETE");
  }

  async function mover(e: EtapaDexDTO, direcao: -1 | 1) {
    const ok = await enviar(`/api/dex/tarefas/${tarefa.id}/etapas/ordem`, "PUT", { ids: moverNaOrdem(ids, e.id, direcao) });
    // Recusada, a lista desta tela está velha: recarrega para o próximo clique valer.
    if (!ok) router.refresh();
  }

  function formulario(f: Formulario) {
    return (
      <form
        className="flex flex-col gap-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          void salvar(f);
        }}
      >
        <Campo rotulo={t("etapaTexto")}>
          <input
            className={classesEntrada}
            value={f.texto}
            required
            maxLength={MAX_TEXTO_ETAPA}
            onChange={(ev) => setForm({ ...f, texto: ev.target.value })}
          />
        </Campo>
        <Campo rotulo={t("etapaDetalhe")}>
          <textarea
            className={classesEntrada}
            rows={3}
            value={f.detalhe}
            maxLength={MAX_DETALHE_ETAPA}
            onChange={(ev) => setForm({ ...f, detalhe: ev.target.value })}
          />
        </Campo>
        <div className="flex flex-wrap gap-2">
          <Botao type="submit" tamanho="sm" variante="primario" disabled={ocupado || !f.texto.trim()}>
            {f.etapaId ? t("salvar") : t("adicionar")}
          </Botao>
          <Botao type="button" tamanho="sm" onClick={() => setForm(null)}>
            {t("cancelar")}
          </Botao>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-l-2 border-line pl-3">
      {tarefa.etapas.length === 0 ? (
        <p className="text-sm text-muted">{t("semEtapas")}</p>
      ) : (
        <ol className="flex flex-col gap-2" aria-labelledby={`${id}-titulo`}>
          {tarefa.etapas.map((e, i) =>
            form?.etapaId === e.id ? (
              <li key={e.id}>{formulario(form)}</li>
            ) : (
              <li key={e.id} className="flex flex-wrap items-start gap-2">
                <label className={`flex min-w-48 flex-1 items-start gap-2 max-md:min-h-11 ${editavel ? "cursor-pointer" : ""}`}>
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 shrink-0 max-md:mt-0 max-md:size-5"
                    checked={feita(e)}
                    disabled={!editavel || ocupado}
                    onChange={(ev) => void marcar(e, ev.target.checked)}
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className={`break-words ${feita(e) ? "text-muted line-through" : "text-foreground"}`}>{e.texto}</span>
                    {e.detalhe && <span className="text-sm break-words whitespace-pre-line text-muted">{e.detalhe}</span>}
                  </span>
                </label>
                {editavel && (
                  <div className="flex flex-wrap gap-1.5 max-md:gap-2">
                    <Botao
                      tamanho="xs"
                      className={classesBotaoLinha}
                      aria-label={t("subir", { etapa: e.texto })}
                      disabled={ocupado || i === 0}
                      onClick={() => void mover(e, -1)}
                    >
                      ↑
                    </Botao>
                    <Botao
                      tamanho="xs"
                      className={classesBotaoLinha}
                      aria-label={t("descer", { etapa: e.texto })}
                      disabled={ocupado || i === tarefa.etapas.length - 1}
                      onClick={() => void mover(e, 1)}
                    >
                      ↓
                    </Botao>
                    <Botao
                      tamanho="xs"
                      className={classesBotaoLinha}
                      disabled={ocupado}
                      onClick={() => setForm({ etapaId: e.id, texto: e.texto, detalhe: e.detalhe ?? "" })}
                    >
                      {t("editar")}
                    </Botao>
                    <Botao tamanho="xs" variante="perigo" className={classesBotaoLinha} disabled={ocupado} onClick={() => void excluir(e)}>
                      {t("excluir")}
                    </Botao>
                  </div>
                )}
              </li>
            ),
          )}
        </ol>
      )}
      {editavel &&
        (form?.etapaId === null ? (
          formulario(form)
        ) : (
          <div>
            <Botao
              tamanho="xs"
              className={classesBotaoLinha}
              disabled={ocupado}
              onClick={() => setForm({ etapaId: null, texto: "", detalhe: "" })}
            >
              {t("adicionarEtapa")}
            </Botao>
          </div>
        ))}
    </div>
  );
}
