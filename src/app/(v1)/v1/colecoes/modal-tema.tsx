"use client";

/**
 * Criar uma coleção temática a partir de uma sugestão: confirma o nome
 * (editável, já no idioma da interface) e o grupo opcional, e cria pela
 * mesma rota de toda coleção (`POST /api/colecoes`, uma `customizada` com
 * `parametro.tema`). Regras em `lib/dominio/tema-colecao.ts`; aqui só a tela.
 *
 * - **A coleção nasce vazia**: as vagas de uma customizada nascem ao alocar
 *   uma cópia. Quem decide o que entra é o passo seguinte (`ModalCartasDoTema`),
 *   que a página abre com o id devolvido — a janela não aloca nada.
 * - **O grupo só aparece com grupo cadastrado**, como em "Nova coleção". Uma
 *   recusa pode ser do grupo (excluído em outra aba): a página relê a lista
 *   (`onAtualizar`) e a escolha volta a "sem grupo" se o grupo sumiu.
 * - **Uma coleção por tema, e quem decide é o servidor.** Um segundo `POST` do
 *   mesmo tema volta 409 `temaJaTemColecao`, com o id e o nome da coleção que
 *   já existe. A janela diz isso e oferece abri-la — nunca presume que ela é a
 *   desta tentativa (pode ser de outra aba, de antes). Por isso uma resposta
 *   perdida não precisa de adivinhação: tentar de novo é seguro, e se a
 *   primeira tentativa gravou, o servidor recusa a segunda e aponta a coleção.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Botao, classesBotao } from "@/app/_componentes/botao";
import { Campo, classesEntrada } from "@/app/_componentes/campo";
import { Modal } from "@/app/_componentes/modal";
import { textoDaRecusa } from "@/app/_componentes/recusa";
import type { GrupoColecaoDTO, SugestaoDeTemaDTO } from "@/lib/dominio/tipos-cliente";

import { chamarApi } from "./chamar-api";
import { useRotuloTema } from "./rotulo-tema";

/** A coleção que o 409 `temaJaTemColecao` aponta (`valores.colecaoId` e `valores.colecao`), ou `null` se a resposta é outra. */
function colecaoQueJaExiste(corpo: unknown): { id: string; nome: string } | null {
  const recusa = (corpo as { recusa?: { chave?: unknown; valores?: Record<string, unknown> } } | null)?.recusa;
  if (recusa?.chave !== "temaJaTemColecao") return null;
  const { colecaoId, colecao } = recusa.valores ?? {};
  return typeof colecaoId === "string" && typeof colecao === "string" ? { id: colecaoId, nome: colecao } : null;
}

export function ModalTema({
  sugestao,
  grupos,
  onFechar,
  onCriada,
  onAtualizar,
}: {
  /** Uma sugestão de tema (nunca `set`, que abre a tela de nova coleção). */
  sugestao: SugestaoDeTemaDTO;
  grupos: readonly GrupoColecaoDTO[];
  onFechar: () => void;
  /** A coleção foi criada: a página abre a lista de cartas que cabem. */
  onCriada: (colecao: { id: string; nome: string }) => void;
  /** A lista de coleções e de grupos pode ter mudado (recusa, falha sem resposta): relê. */
  onAtualizar: () => void;
}) {
  const t = useTranslations("temaColecao.criar");
  const tr = useTranslations("recusas");
  const { rotuloDoTema, nomePadraoDoTema } = useRotuloTema();
  const [nome, setNome] = useState(() => nomePadraoDoTema(sugestao.tipo, sugestao.valor, sugestao.rotulo));
  const [grupoId, setGrupoId] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // A coleção deste tema que o servidor disse já existir (409).
  const [existente, setExistente] = useState<{ id: string; nome: string } | null>(null);

  // O grupo escolhido que a lista nova já não traz (excluído em outra aba)
  // vale como "sem grupo", e o resto do formulário fica como está.
  const grupoValido = grupos.some((g) => g.id === grupoId) ? grupoId : "";

  const nomeAparado = nome.trim();
  const podeCriar = !enviando && nomeAparado !== "";

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!podeCriar) return;
    setErro(null);
    setExistente(null);
    setEnviando(true);
    try {
      const r = await chamarApi("/api/colecoes", "POST", {
        nome: nomeAparado,
        tipo: "customizada",
        parametro: { tema: { tipo: sugestao.tipo, valor: sugestao.valor } },
        grupoId: grupoValido || null,
      });
      const id = (r.corpo as { id?: unknown } | null)?.id;
      if (r.ok && typeof id === "string") {
        onCriada({ id, nome: nomeAparado });
        return;
      }
      const ja = colecaoQueJaExiste(r.corpo);
      if (ja) {
        setExistente(ja);
        setErro(textoDaRecusa(tr, r.corpo, t("erroCriar")));
        // A lista da página e as sugestões estão atrás do servidor: relê.
        onAtualizar();
        return;
      }
      if (r.ok) {
        // 2xx sem o id: a coleção foi criada, só não dá para abri-la daqui.
        setErro(t("erroRede"));
        onAtualizar();
        return;
      }
      setErro(textoDaRecusa(tr, r.corpo, t("erroCriar")));
      if (grupoValido) onAtualizar();
    } catch {
      // Sem resposta: o servidor pode ter criado. Tentar de novo é seguro: se
      // criou, a segunda tentativa volta 409 e a janela aponta a coleção.
      setErro(t("erroRede"));
      onAtualizar();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      as="form"
      onSubmit={enviar}
      onFechar={enviando ? undefined : onFechar}
      rodape={
        <div className="flex justify-end gap-2 pt-2">
          <Botao type="button" onClick={onFechar} disabled={enviando}>
            {t("cancelar")}
          </Botao>
          <Botao type="submit" variante="primario" disabled={!podeCriar}>
            {enviando ? t("criando") : t("criar")}
          </Botao>
        </div>
      }
    >
      <h2 className="font-medium break-words text-foreground">
        {t("titulo", { tema: rotuloDoTema(sugestao.tipo, sugestao.valor, sugestao.rotulo) })}
      </h2>
      <p className="text-muted">{t("descricao")}</p>
      <Campo rotulo={t("campoNome")}>
        <input className={classesEntrada} value={nome} required onChange={(e) => setNome(e.target.value)} />
      </Campo>
      {grupos.length > 0 && (
        <Campo rotulo={t("campoGrupo")}>
          <select className={classesEntrada} value={grupoValido} onChange={(e) => setGrupoId(e.target.value)}>
            <option value="">{t("semGrupo")}</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
          </select>
        </Campo>
      )}
      {erro && <p className="text-sm text-danger">{erro}</p>}
      {existente && (
        <div>
          <Link href={`/v1/colecoes/${existente.id}`} className={classesBotao("secundario")}>
            {t("abrirExistente", { colecao: existente.nome })}
          </Link>
        </div>
      )}
    </Modal>
  );
}
