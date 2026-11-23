"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { textoDaRecusa } from "@/app/_comum/recusa";
import type { GrupoListaV2DTO } from "@/lib/dominio/lista-colecoes-v2";
import type { SugestaoDeTemaDTO } from "@/lib/dominio/tipos-cliente";

import { Botao, BotaoLink } from "../../_componentes/primitivos/botao";
import { Campo, Selecao } from "../../_componentes/primitivos/campo";
import { Modal } from "../../_componentes/primitivos/modal";
import { AvisoEmLinha } from "../../_componentes/primitivos/painel";
import estilos from "./organizar.module.css";
import { colecaoQueJaExiste } from "./organizar";
import { pedirApi } from "./pedir-api";

/**
 * Criar uma coleção temática a partir de uma sugestão (COL-19): confirma o
 * nome (já no idioma da interface, editável) e o grupo opcional, e cria pela
 * rota única de criação (`POST /api/colecoes`, uma `customizada` com
 * `parametro.tema`).
 *
 * - **A coleção nasce vazia** e a janela não aloca nada: o passo seguinte,
 *   "suas cartas que cabem", é outra janela, que a página abre com o id
 *   devolvido (regra 5).
 * - **Uma coleção por tema, e quem decide é o servidor**, dentro do lock de
 *   organização. Um segundo `POST` do mesmo tema volta 409
 *   `temaJaTemColecao` com a coleção que existe; a janela diz isso e oferece
 *   abri-la, sem presumir que ela é desta tentativa. Por isso tentar de novo
 *   depois de uma resposta perdida é seguro.
 * - **O grupo escolhido que a lista nova já não traz** (excluído em outra aba)
 *   vale como "sem grupo"; uma recusa relê a lista.
 */
export function JanelaTema({
  sugestao,
  rotuloTema,
  nomePadrao,
  grupos,
  aoFechar,
  aoCriada,
  aoReler,
}: {
  sugestao: SugestaoDeTemaDTO;
  /** O tema escrito no idioma da interface. */
  rotuloTema: string;
  nomePadrao: string;
  grupos: readonly GrupoListaV2DTO[];
  aoFechar: () => void;
  aoCriada: (colecao: { id: string; nome: string }) => void;
  aoReler: () => void;
}) {
  const t = useTranslations("v2Organizar.tema");
  const tRecusas = useTranslations("recusas");
  const [nome, setNome] = useState(nomePadrao);
  const [grupoId, setGrupoId] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [existente, setExistente] = useState<{ id: string; nome: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const grupoValido = grupos.some((g) => g.id === grupoId) ? grupoId : "";
  const nomeAparado = nome.trim();
  const podeCriar = !enviando && nomeAparado !== "";

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (!podeCriar) return;
    setErro(null);
    setExistente(null);
    setEnviando(true);
    const r = await pedirApi("/api/colecoes", "POST", {
      nome: nomeAparado,
      tipo: "customizada",
      parametro: { tema: { tipo: sugestao.tipo, valor: sugestao.valor } },
      grupoId: grupoValido || null,
    });
    setEnviando(false);
    const id = (r.corpo as { id?: unknown } | null)?.id;
    if (r.ok && typeof id === "string") {
      aoCriada({ id, nome: nomeAparado });
      return;
    }
    // Daqui para baixo a tela estava atrás do servidor (ou não sabe se ele gravou): relê.
    aoReler();
    if (r.status === null || r.ok) {
      // Sem resposta, ou 2xx sem o id: tentar de novo é seguro (o 409 aponta a coleção, se ela nasceu).
      setErro(t("erroRede"));
      return;
    }
    setExistente(colecaoQueJaExiste(r.corpo));
    setErro(textoDaRecusa(tRecusas, r.corpo, t("erroCriar")));
  }

  return (
    <Modal
      aberto
      onFechar={enviando ? () => {} : aoFechar}
      titulo={t("titulo", { tema: rotuloTema })}
      descricao={t("descricao")}
      fecharPeloVeu={false}
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar} disabled={enviando}>
            {t("cancelar")}
          </Botao>
          <Botao variante="primario" type="submit" form="v2-form-tema" carregando={enviando} disabled={!podeCriar}>
            {t("criar")}
          </Botao>
        </>
      }
    >
      <form id="v2-form-tema" onSubmit={criar} className={estilos.linhas}>
        <Campo
          rotulo={t("campoNome")}
          value={nome}
          required
          autoComplete="off"
          disabled={enviando}
          onChange={(e) => setNome(e.target.value)}
        />
        {grupos.length > 0 && (
          <Selecao rotulo={t("campoGrupo")} value={grupoValido} disabled={enviando} onChange={(e) => setGrupoId(e.target.value)}>
            <option value="">{t("semGrupo")}</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
          </Selecao>
        )}
        {erro && (
          <AvisoEmLinha
            tom={existente ? "alerta" : "perigo"}
            papel="alert"
            acao={
              existente ? (
                <BotaoLink href={`/colecoes/${existente.id}`} pequeno>
                  {t("abrirExistente", { colecao: existente.nome })}
                </BotaoLink>
              ) : undefined
            }
          >
            {erro}
          </AvisoEmLinha>
        )}
      </form>
    </Modal>
  );
}
