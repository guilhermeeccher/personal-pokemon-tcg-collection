"use client";

/**
 * Meus jogos — o usuário marca quais jogos do catálogo fixo tem
 * (`lib/dominio/dex-jogos.ts`). O catálogo não se edita aqui: ele carrega a
 * conexão de cada jogo com o HOME, que é dado conferido, não preferência.
 *
 * Remover só funciona sem Pokémon no jogo; para quem parou de jogar, o
 * caminho é "parado", que mantém o histórico e impede registro novo lá.
 */

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Alerta } from "@/app/_componentes/alerta";
import { Botao } from "@/app/_componentes/botao";
import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { Campo, classesEntrada } from "@/app/_componentes/campo";
import { Distintivo } from "@/app/_componentes/distintivo";
import { EstadoVazio } from "@/app/_componentes/estado-vazio";
import { Painel } from "@/app/_componentes/painel";
import { textoDaRecusa } from "@/app/_componentes/recusa";
import { JOGOS_DEX } from "@/lib/dominio/dex-jogos";
import type { JogoPossuidoDTO } from "@/lib/dominio/tipos-cliente";

export function ListaJogos({ jogos }: { jogos: JogoPossuidoDTO[] }) {
  const t = useTranslations("dex");
  const tr = useTranslations("recusas");
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState({ desde: "", notas: "" });

  const disponiveis = JOGOS_DEX.filter((j) => !jogos.some((p) => p.jogoId === j.id));
  const [novo, setNovo] = useState({ jogoId: disponiveis[0]?.id ?? "", desde: "", notas: "" });

  async function enviar(url: string, method: string, corpo?: unknown): Promise<boolean> {
    setOcupado(true);
    setErro(null);
    try {
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
      if (!r.ok) {
        setErro(textoDaRecusa(tr, await r.json().catch(() => null), t("jogos.erro")));
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setErro(t("jogos.erro"));
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!novo.jogoId) return;
    if (await enviar("/api/dex/jogos", "POST", novo)) {
      const restantes = disponiveis.filter((j) => j.id !== novo.jogoId);
      setNovo({ jogoId: restantes[0]?.id ?? "", desde: "", notas: "" });
    }
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-8">
      <CabecalhoPagina titulo={t("jogos.titulo")} descricao={t("jogos.descricao")} />
      {erro && <Alerta tom="perigo">{erro}</Alerta>}

      {jogos.length === 0 ? (
        <EstadoVazio>{t("jogos.nenhum")}</EstadoVazio>
      ) : (
        <ul className="flex flex-col gap-3">
          {jogos.map((j) => (
            <Painel as="li" key={j.id} className={`flex flex-col gap-2 ${j.ativo ? "" : "opacity-70"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-base font-bold text-strong">{j.nome}</span>
                <Distintivo tom={j.conexaoHome === "so_envio" ? "aviso" : "sucesso"}>
                  {t(`conexao.${j.conexaoHome}`)}
                </Distintivo>
                <Distintivo>{j.ativo ? t("jogos.ativo") : t("jogos.inativo")}</Distintivo>
              </div>
              {j.conexaoHome === "so_envio" && <p className="text-xs text-muted">{t("jogos.avisoSoEnvio")}</p>}
              <p className="text-sm text-muted">
                {t("jogos.registrosAqui", { quantidade: String(j.registrosAqui) })}
                {j.desde && ` · ${t("jogos.desde")} ${j.desde}`}
                {j.notas && ` · ${j.notas}`}
              </p>

              {editando === j.id ? (
                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (await enviar(`/api/dex/jogos/${j.id}`, "PATCH", rascunho)) setEditando(null);
                  }}
                >
                  <Campo rotulo={t("jogos.desde")}>
                    <input
                      type="date"
                      className={classesEntrada}
                      value={rascunho.desde}
                      onChange={(e) => setRascunho((r) => ({ ...r, desde: e.target.value }))}
                    />
                  </Campo>
                  <Campo rotulo={t("jogos.notas")} className="min-w-48 flex-1">
                    <input
                      className={classesEntrada}
                      value={rascunho.notas}
                      placeholder={t("jogos.placeholderNotas")}
                      onChange={(e) => setRascunho((r) => ({ ...r, notas: e.target.value }))}
                    />
                  </Campo>
                  <Botao type="submit" variante="primario" tamanho="sm" disabled={ocupado}>
                    {t("jogos.salvar")}
                  </Botao>
                  <Botao type="button" tamanho="sm" onClick={() => setEditando(null)}>
                    {t("jogos.cancelar")}
                  </Botao>
                </form>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Botao
                    tamanho="xs"
                    disabled={ocupado}
                    onClick={() => {
                      setRascunho({ desde: j.desde ?? "", notas: j.notas ?? "" });
                      setEditando(j.id);
                    }}
                  >
                    {t("jogos.editar")}
                  </Botao>
                  <Botao
                    tamanho="xs"
                    disabled={ocupado}
                    onClick={() => enviar(`/api/dex/jogos/${j.id}`, "PATCH", { ativo: !j.ativo })}
                  >
                    {j.ativo ? t("jogos.desativar") : t("jogos.reativar")}
                  </Botao>
                  <Botao
                    tamanho="xs"
                    variante="perigo"
                    disabled={ocupado}
                    onClick={() => {
                      if (window.confirm(t("jogos.confirmarRemover", { jogo: j.nome }))) {
                        void enviar(`/api/dex/jogos/${j.id}`, "DELETE");
                      }
                    }}
                  >
                    {t("jogos.remover")}
                  </Botao>
                </div>
              )}
            </Painel>
          ))}
        </ul>
      )}

      <Painel as="section" className="flex flex-col gap-3">
        <h2 className="text-base font-bold text-strong">{t("jogos.adicionar")}</h2>
        {disponiveis.length === 0 ? (
          <p className="text-sm text-muted">{t("jogos.todosCadastrados")}</p>
        ) : (
          <form className="flex flex-wrap items-end gap-2" onSubmit={adicionar}>
            <Campo rotulo={t("jogos.jogo")}>
              <select
                className={classesEntrada}
                value={novo.jogoId}
                onChange={(e) => setNovo((n) => ({ ...n, jogoId: e.target.value }))}
              >
                {disponiveis.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo={t("jogos.desde")}>
              <input
                type="date"
                className={classesEntrada}
                value={novo.desde}
                onChange={(e) => setNovo((n) => ({ ...n, desde: e.target.value }))}
              />
            </Campo>
            <Campo rotulo={t("jogos.notas")} className="min-w-48 flex-1">
              <input
                className={classesEntrada}
                value={novo.notas}
                placeholder={t("jogos.placeholderNotas")}
                onChange={(e) => setNovo((n) => ({ ...n, notas: e.target.value }))}
              />
            </Campo>
            <Botao type="submit" variante="primario" disabled={ocupado || !novo.jogoId}>
              {t("jogos.adicionar")}
            </Botao>
          </form>
        )}
      </Painel>
    </main>
  );
}
