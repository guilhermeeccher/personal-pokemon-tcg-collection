"use client";

/**
 * `/dex/jogos` na v2 (pacote 5e-a): o usuário marca quais jogos do catálogo
 * fixo tem. Portado de `(v1)/v1/dex/jogos/lista-jogos.tsx`, com as mesmas
 * rotas e os mesmos corpos.
 *
 * - **A lista de jogos é fixa no código** (`lib/dominio/dex-jogos.ts`) e não
 *   se edita aqui: ela carrega a conexão de cada jogo com o HOME, que é dado
 *   conferido, não preferência. O usuário só marca os que tem (JOG-01) e
 *   anota desde quando e o que quiser (JOG-02).
 * - **Jogo parado guarda os registros e não recebe novos** (JOG-03). É o
 *   caminho de quem parou de jogar: remover só funciona sem Pokémon no jogo,
 *   e o servidor recusa o resto com a frase que diz isso (JOG-04). Remover
 *   pergunta antes, pelo diálogo de confirmação da v2.
 * - **Os troféus de um jogo** abrem a tela de troféus com `?jogo=` (JOG-05),
 *   que a v1 lê; enquanto ela é ponte, o 307 leva a query.
 *
 * Depois de uma escrita aceita a página é lida de novo (`router.refresh`);
 * um 404 (outra aba removeu o jogo) também relê.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { textoDaRecusa } from "@/app/_comum/recusa";
import { JOGOS_DEX } from "@/lib/dominio/dex-jogos";
import type { JogoPossuidoDTO } from "@/lib/dominio/tipos-cliente";

import { useAviso } from "../../../_componentes/primitivos/aviso-flutuante";
import { Botao, BotaoLink } from "../../../_componentes/primitivos/botao";
import { Campo, Selecao } from "../../../_componentes/primitivos/campo";
import { useConfirmacao } from "../../../_componentes/primitivos/dialogo-confirmacao";
import { AvisoEmLinha, Painel } from "../../../_componentes/primitivos/painel";
import { hrefTrofeus } from "../../_componentes/caminhos";

import estilos from "./jogos.module.css";

/** Qual botão está esperando o servidor: o giro aparece nele, e todos ficam desligados. */
type Ocupado = { acao: "adicionar" } | { acao: "salvar" | "ativo" | "remover"; id: string } | null;

export function ListaJogos({
  jogos,
  trofeus,
}: {
  jogos: JogoPossuidoDTO[];
  /** Andamento dos troféus por jogo; jogo sem troféus tem total 0. */
  trofeus: Record<string, { obtidos: number; total: number; platina: boolean }>;
}) {
  const t = useTranslations("v2DexJogos");
  const td = useTranslations("dex");
  const tr = useTranslations("recusas");
  const router = useRouter();
  const avisar = useAviso();
  const { confirmar, dialogo } = useConfirmacao();
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<Ocupado>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState({ desde: "", notas: "" });

  const disponiveis = JOGOS_DEX.filter((j) => !jogos.some((p) => p.jogoId === j.id));
  const [novo, setNovo] = useState({ jogoId: disponiveis[0]?.id ?? "", desde: "", notas: "" });
  // Outra aba pode ter marcado o jogo escolhido: o seletor nunca mostra um que já saiu da lista.
  const jogoNovo = disponiveis.some((j) => j.id === novo.jogoId) ? novo.jogoId : (disponiveis[0]?.id ?? "");

  const carregando = (acao: "salvar" | "ativo" | "remover", id: string) =>
    ocupado !== null && ocupado.acao === acao && "id" in ocupado && ocupado.id === id;

  async function enviar(url: string, method: string, corpo: unknown, qual: NonNullable<Ocupado>): Promise<boolean> {
    if (ocupado) return false;
    setOcupado(qual);
    setErro(null);
    try {
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
      if (!r.ok) {
        setErro(textoDaRecusa(tr, await r.json().catch(() => null), td("jogos.erro")));
        if (r.status === 404) router.refresh();
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setErro(td("jogos.erro"));
      return false;
    } finally {
      setOcupado(null);
    }
  }

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!jogoNovo) return;
    const corpo = { ...novo, jogoId: jogoNovo };
    if (await enviar("/api/dex/jogos", "POST", corpo, { acao: "adicionar" })) {
      const nome = JOGOS_DEX.find((j) => j.id === jogoNovo)?.nome ?? jogoNovo;
      avisar(t("adicionado", { jogo: nome }), { tom: "sucesso" });
      const restantes = disponiveis.filter((j) => j.id !== jogoNovo);
      setNovo({ jogoId: restantes[0]?.id ?? "", desde: "", notas: "" });
    }
  }

  async function salvar(j: JogoPossuidoDTO, e: React.FormEvent) {
    e.preventDefault();
    if (await enviar(`/api/dex/jogos/${j.id}`, "PATCH", rascunho, { acao: "salvar", id: j.id })) {
      setEditando(null);
      avisar(t("salvo", { jogo: j.nome }), { tom: "sucesso" });
    }
  }

  async function alternarAtivo(j: JogoPossuidoDTO) {
    if (await enviar(`/api/dex/jogos/${j.id}`, "PATCH", { ativo: !j.ativo }, { acao: "ativo", id: j.id })) {
      avisar(j.ativo ? t("parado", { jogo: j.nome }) : t("reativado", { jogo: j.nome }), { tom: "sucesso" });
    }
  }

  async function remover(j: JogoPossuidoDTO) {
    const ok = await confirmar({
      titulo: td("jogos.confirmarRemover", { jogo: j.nome }),
      descricao: t("removerTexto"),
      rotuloConfirmar: td("jogos.remover"),
      perigoso: true,
    });
    if (!ok) return;
    if (await enviar(`/api/dex/jogos/${j.id}`, "DELETE", undefined, { acao: "remover", id: j.id })) {
      avisar(t("removido", { jogo: j.nome }), { tom: "sucesso" });
    }
  }

  return (
    <div className={estilos.pagina}>
      <header className={estilos.cabecalho}>
        <div>
          <p className={estilos.sobretitulo}>Living Dex</p>
          <h1 className={estilos.titulo}>{td("jogos.titulo")}</h1>
          <p className={estilos.subtitulo}>{t("descricao")}</p>
        </div>
        <div className={estilos.acoesCab}>
          <BotaoLink href="/dex" pequeno>
            {t("voltarVisaoGeral")}
          </BotaoLink>
          <BotaoLink href="/dex/inventario" pequeno>
            {t("abrirInventario")}
          </BotaoLink>
        </div>
      </header>

      {erro && (
        <AvisoEmLinha tom="perigo" papel="alert">
          {erro}
        </AvisoEmLinha>
      )}

      {jogos.length === 0 ? (
        <AvisoEmLinha>{td("jogos.nenhum")}</AvisoEmLinha>
      ) : (
        <ul className={estilos.lista} aria-label={t("lista")}>
          {jogos.map((j) => {
            const tro = trofeus[j.jogoId];
            const idTitulo = `jogo-${j.id}`;
            return (
              <Painel
                as="li"
                key={j.id}
                className={estilos.jogo}
                data-parado={!j.ativo || undefined}
                aria-labelledby={idTitulo}
              >
                <div className={estilos.jogoCab}>
                  <h2 id={idTitulo} className={estilos.jogoNome}>
                    {j.nome}
                  </h2>
                  <span className={estilos.selos}>
                    <span className={estilos.selo} data-tom={j.conexaoHome === "so_envio" ? "aviso" : "sucesso"}>
                      {td(`conexao.${j.conexaoHome}`)}
                    </span>
                    <span className={estilos.selo} data-tom={j.ativo ? "ativo" : "parado"}>
                      {j.ativo ? td("jogos.ativo") : td("jogos.inativo")}
                    </span>
                  </span>
                </div>

                <p className={estilos.info}>
                  <span className="v2-num">{td("jogos.registrosAqui", { quantidade: String(j.registrosAqui) })}</span>
                  {j.desde && (
                    <span>
                      {td("jogos.desde")} <span className="v2-num">{j.desde}</span>
                    </span>
                  )}
                  {j.notas && <span className={estilos.notas}>{j.notas}</span>}
                </p>

                {tro && tro.total > 0 && (
                  <Link
                    href={hrefTrofeus(j.jogoId)}
                    className={estilos.trofeus}
                    data-platina={tro.platina || undefined}
                    aria-label={t("trofeusRotulo", { jogo: j.nome })}
                  >
                    <span className="v2-num">
                      {tro.platina
                        ? td("jogos.platina")
                        : td("jogos.trofeus", { obtidos: String(tro.obtidos), total: String(tro.total) })}
                    </span>
                    <span className={estilos.barra} aria-hidden>
                      <span style={{ width: `${Math.min(tro.obtidos / tro.total, 1) * 100}%` }} />
                    </span>
                  </Link>
                )}

                {editando === j.id ? (
                  <form className={estilos.formEdicao} onSubmit={(e) => void salvar(j, e)}>
                    <Campo
                      type="date"
                      rotulo={td("jogos.desde")}
                      value={rascunho.desde}
                      onChange={(e) => setRascunho((r) => ({ ...r, desde: e.target.value }))}
                    />
                    <Campo
                      rotulo={td("jogos.notas")}
                      value={rascunho.notas}
                      placeholder={td("jogos.placeholderNotas")}
                      onChange={(e) => setRascunho((r) => ({ ...r, notas: e.target.value }))}
                    />
                    <div className={estilos.acoesForm}>
                      <Botao variante="fantasma" pequeno disabled={ocupado !== null} onClick={() => setEditando(null)}>
                        {td("jogos.cancelar")}
                      </Botao>
                      <Botao
                        type="submit"
                        variante="primario"
                        pequeno
                        carregando={carregando("salvar", j.id)}
                        disabled={ocupado !== null}
                      >
                        {td("jogos.salvar")}
                      </Botao>
                    </div>
                  </form>
                ) : (
                  <div className={estilos.acoes}>
                    <Botao
                      pequeno
                      disabled={ocupado !== null}
                      aria-label={t("editarRotulo", { jogo: j.nome })}
                      onClick={() => {
                        setRascunho({ desde: j.desde ?? "", notas: j.notas ?? "" });
                        setEditando(j.id);
                      }}
                    >
                      {td("jogos.editar")}
                    </Botao>
                    <Botao
                      pequeno
                      carregando={carregando("ativo", j.id)}
                      disabled={ocupado !== null}
                      onClick={() => void alternarAtivo(j)}
                    >
                      {j.ativo ? td("jogos.desativar") : td("jogos.reativar")}
                    </Botao>
                    <Botao
                      pequeno
                      variante="perigo"
                      carregando={carregando("remover", j.id)}
                      disabled={ocupado !== null}
                      aria-label={t("removerRotulo", { jogo: j.nome })}
                      onClick={() => void remover(j)}
                    >
                      {td("jogos.remover")}
                    </Botao>
                  </div>
                )}
              </Painel>
            );
          })}
        </ul>
      )}

      <Painel as="section" className={estilos.adicionar} aria-labelledby="jogos-adicionar">
        <h2 id="jogos-adicionar" className={estilos.blocoTitulo}>
          {td("jogos.adicionar")}
        </h2>
        {disponiveis.length === 0 ? (
          <p className={estilos.nota}>{td("jogos.todosCadastrados")}</p>
        ) : (
          <form className={estilos.formAdicionar} onSubmit={(e) => void adicionar(e)}>
            <Selecao
              rotulo={td("jogos.jogo")}
              value={jogoNovo}
              onChange={(e) => setNovo((n) => ({ ...n, jogoId: e.target.value }))}
            >
              {disponiveis.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.nome}
                </option>
              ))}
            </Selecao>
            <Campo
              type="date"
              rotulo={td("jogos.desde")}
              value={novo.desde}
              onChange={(e) => setNovo((n) => ({ ...n, desde: e.target.value }))}
            />
            <Campo
              rotulo={td("jogos.notas")}
              value={novo.notas}
              placeholder={td("jogos.placeholderNotas")}
              onChange={(e) => setNovo((n) => ({ ...n, notas: e.target.value }))}
            />
            <Botao
              type="submit"
              variante="primario"
              carregando={ocupado?.acao === "adicionar"}
              disabled={ocupado !== null || !jogoNovo}
            >
              {td("jogos.adicionar")}
            </Botao>
          </form>
        )}
      </Painel>
      {dialogo}
    </div>
  );
}
