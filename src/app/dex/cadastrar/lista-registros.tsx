"use client";

/**
 * Registros da Living Dex — o que o usuário tem e onde está, com as ações
 * de cada um: enviar ao HOME, mover, corrigir, apagar.
 *
 * Enviar de um jogo só de envio (GO, FireRed) passa por uma confirmação:
 * a rota responde 409 com a recusa `dexConfirmarSemVolta`, a tela mostra a
 * frase dela e só reenvia com `confirmarSemVolta` depois do clique. A
 * decisão de transferir sem volta é sempre do usuário (regra 7 da spec).
 */

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { Alerta } from "@/app/_componentes/alerta";
import { Botao } from "@/app/_componentes/botao";
import { Campo, classesEntrada } from "@/app/_componentes/campo";
import { Distintivo } from "@/app/_componentes/distintivo";
import { EstadoVazio } from "@/app/_componentes/estado-vazio";
import { Modal } from "@/app/_componentes/modal";
import { Painel } from "@/app/_componentes/painel";
import { textoDaRecusa, textosDasRecusas } from "@/app/_componentes/recusa";
import { JOGOS_DEX, jogoDex, LOCAL_HOME } from "@/lib/dominio/dex-jogos";
import type { JogoPossuidoDTO, RegistroDexDTO } from "@/lib/dominio/tipos-cliente";
import { urlSpriteDex } from "@/lib/imagens";

const TAMANHO_PAGINA = 50;

const nome = (r: { especie: string; forma: string | null }) => (r.forma ? `${r.especie} (${r.forma})` : r.especie);

export function ListaRegistros({ jogos, versao }: { jogos: JogoPossuidoDTO[]; versao: number }) {
  const t = useTranslations("dex");
  const tr = useTranslations("recusas");

  const [itens, setItens] = useState<RegistroDexDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [filtroLocal, setFiltroLocal] = useState("");
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<{ registro: RegistroDexDTO; local: string; frase: string } | null>(
    null,
  );
  const [edicao, setEdicao] = useState<RegistroDexDTO | null>(null);
  const [recarga, setRecarga] = useState(0);

  const ativos = jogos.filter((j) => j.ativo);
  const nomeLocal = (id: string) => (id === LOCAL_HOME ? t("home") : (jogoDex(id)?.nome ?? id));

  const carregar = useCallback(() => {
    const p = new URLSearchParams({ pagina: String(pagina), tamanhoPagina: String(TAMANHO_PAGINA) });
    if (filtroLocal) p.set("local", filtroLocal);
    if (busca.trim()) p.set("busca", busca.trim());
    fetch(`/api/dex/registros?${p.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setItens(d.itens ?? []);
        setTotal(d.total ?? 0);
      })
      .catch(() => setErro(t("registros.erro")))
      .finally(() => setCarregando(false));
  }, [pagina, filtroLocal, busca, t]);

  useEffect(() => {
    carregar();
  }, [carregar, versao, recarga]);

  async function mover(registro: RegistroDexDTO, local: string, confirmarSemVolta: boolean) {
    setOcupado(registro.id);
    setErro(null);
    try {
      const r = await fetch(`/api/dex/registros/${registro.id}/mover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ local, confirmarSemVolta }),
      });
      const corpo = await r.json().catch(() => null);
      if (r.status === 409 && corpo?.recusa?.chave === "dexConfirmarSemVolta") {
        setConfirmacao({ registro, local, frase: textoDaRecusa(tr, corpo, t("registros.erro")) });
        return;
      }
      if (!r.ok) {
        setErro(textoDaRecusa(tr, corpo, t("registros.erro")));
        return;
      }
      setConfirmacao(null);
      setRecarga((v) => v + 1);
    } catch {
      setErro(t("registros.erro"));
    } finally {
      setOcupado(null);
    }
  }

  async function remover(registro: RegistroDexDTO) {
    if (!window.confirm(t("registros.confirmarRemover", { nome: nome(registro) }))) return;
    setOcupado(registro.id);
    setErro(null);
    try {
      const r = await fetch(`/api/dex/registros/${registro.id}`, { method: "DELETE" });
      if (!r.ok) setErro(textoDaRecusa(tr, await r.json().catch(() => null), t("registros.erro")));
      else setRecarga((v) => v + 1);
    } finally {
      setOcupado(null);
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA));

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <h2 className="mr-auto text-lg font-bold text-strong">{t("registros.titulo")}</h2>
        <Campo rotulo={t("registros.filtroLocal")}>
          <select
            className={classesEntrada}
            value={filtroLocal}
            onChange={(e) => {
              setCarregando(true);
              setPagina(1);
              setFiltroLocal(e.target.value);
            }}
          >
            <option value="">{t("registros.todos")}</option>
            <option value={LOCAL_HOME}>{t("home")}</option>
            {jogos.map((j) => (
              <option key={j.jogoId} value={j.jogoId}>
                {j.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo={t("registros.buscar")}>
          <input
            className={classesEntrada}
            value={busca}
            placeholder={t("cadastrar.placeholderBuscarForma")}
            onChange={(e) => {
              setPagina(1);
              setBusca(e.target.value);
            }}
          />
        </Campo>
      </div>

      {erro && <Alerta tom="perigo">{erro}</Alerta>}

      {carregando ? null : itens.length === 0 ? (
        <EstadoVazio>{filtroLocal || busca ? t("registros.nenhum") : t("registros.vazio")}</EstadoVazio>
      ) : (
        <ul className="flex flex-col gap-2">
          {itens.map((r) => {
            const destinos = [LOCAL_HOME, ...ativos.map((j) => j.jogoId)].filter((d) => d !== r.local);
            return (
              <Painel as="li" padding="sm" key={r.id} className="flex flex-wrap items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- sprite externo pequeno da PokeAPI. */}
                <img
                  src={urlSpriteDex(r.sprite, r.shiny)}
                  alt=""
                  width={48}
                  height={48}
                  loading="lazy"
                  style={{ imageRendering: "pixelated" }}
                />
                <div className="flex min-w-40 flex-1 flex-col">
                  <span className="text-sm font-semibold text-strong">
                    <span className="mr-1 font-mono text-xs tabular-nums text-muted">
                      #{String(r.numero).padStart(4, "0")}
                    </span>
                    {nome(r)}
                  </span>
                  <span className="text-xs text-muted">
                    {t("registros.origem", { jogo: nomeLocal(r.jogoOrigem) })}
                    {r.capturadoEm && ` · ${r.capturadoEm}`}
                    {r.notas && ` · ${r.notas}`}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {r.shiny && <Distintivo tom="acento">{t("trilha.shiny")}</Distintivo>}
                  <Distintivo tom={r.local === LOCAL_HOME ? "sucesso" : "neutro"}>{nomeLocal(r.local)}</Distintivo>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {r.local !== LOCAL_HOME && (
                    <Botao
                      tamanho="xs"
                      variante="primario"
                      disabled={ocupado !== null}
                      onClick={() => mover(r, LOCAL_HOME, false)}
                    >
                      {t("registros.enviarHome")}
                    </Botao>
                  )}
                  {destinos.length > 1 && (
                    <select
                      aria-label={t("registros.moverPara")}
                      className={`${classesEntrada} !min-h-6 !py-0 text-xs`}
                      value=""
                      disabled={ocupado !== null}
                      onChange={(e) => e.target.value && mover(r, e.target.value, false)}
                    >
                      <option value="">{t("registros.moverPara")}</option>
                      {destinos.map((d) => (
                        <option key={d} value={d}>
                          {nomeLocal(d)}
                        </option>
                      ))}
                    </select>
                  )}
                  <Botao tamanho="xs" disabled={ocupado !== null} onClick={() => setEdicao(r)}>
                    {t("registros.editar")}
                  </Botao>
                  <Botao tamanho="xs" variante="perigo" disabled={ocupado !== null} onClick={() => remover(r)}>
                    {t("registros.remover")}
                  </Botao>
                </div>
              </Painel>
            );
          })}
        </ul>
      )}

      {total > 0 && (
        <div className="flex items-center gap-3 text-xs text-muted">
          <span>{t("registros.total", { total: String(total) })}</span>
          {totalPaginas > 1 && (
            <>
              <Botao tamanho="xs" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
                {t("registros.anterior")}
              </Botao>
              <span>{t("registros.pagina", { pagina: String(pagina), total: String(totalPaginas) })}</span>
              <Botao tamanho="xs" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>
                {t("registros.proxima")}
              </Botao>
            </>
          )}
        </div>
      )}

      {confirmacao && (
        <Modal>
          <h3 className="text-base font-bold text-strong">{t("registros.confirmarSemVoltaTitulo")}</h3>
          <p>
            <strong>{nome(confirmacao.registro)}</strong>: {confirmacao.frase}
          </p>
          <div className="flex justify-end gap-2">
            <Botao onClick={() => setConfirmacao(null)}>{t("registros.cancelar")}</Botao>
            <Botao
              variante="primario"
              disabled={ocupado !== null}
              onClick={() => mover(confirmacao.registro, confirmacao.local, true)}
            >
              {t("registros.confirmar")}
            </Botao>
          </div>
        </Modal>
      )}

      {edicao && (
        <EdicaoRegistro
          registro={edicao}
          jogos={jogos}
          aoFechar={(salvou) => {
            setEdicao(null);
            if (salvou) setRecarga((v) => v + 1);
          }}
        />
      )}
    </section>
  );
}

/**
 * Corrige shiny, origem, data e notas. A forma e o local não mudam aqui: a
 * forma errada se apaga e registra de novo; o local muda movendo.
 */
function EdicaoRegistro({
  registro,
  jogos,
  aoFechar,
}: {
  registro: RegistroDexDTO;
  jogos: JogoPossuidoDTO[];
  aoFechar: (salvou: boolean) => void;
}) {
  const t = useTranslations("dex");
  const tr = useTranslations("recusas");
  const [dados, setDados] = useState({
    shiny: registro.shiny,
    jogoOrigem: registro.jogoOrigem,
    capturadoEm: registro.capturadoEm ?? "",
    notas: registro.notas ?? "",
  });
  const [erros, setErros] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const meus = new Set(jogos.map((j) => j.jogoId));

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErros([]);
    try {
      const r = await fetch(`/api/dex/registros/${registro.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formaId: registro.formaId, ...dados }),
      });
      if (!r.ok) {
        setErros(textosDasRecusas(tr, await r.json().catch(() => null), t("registros.erro")));
        return;
      }
      aoFechar(true);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal as="form" onSubmit={salvar}>
      <h3 className="text-base font-bold text-strong">{t("registros.editarTitulo")}</h3>
      <p className="font-semibold">{nome(registro)}</p>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={dados.shiny}
          onChange={(e) => setDados((d) => ({ ...d, shiny: e.target.checked }))}
        />
        {t("cadastrar.shiny")}
      </label>
      <Campo rotulo={t("cadastrar.jogoOrigem")}>
        <select
          className={classesEntrada}
          value={dados.jogoOrigem}
          onChange={(e) => setDados((d) => ({ ...d, jogoOrigem: e.target.value }))}
        >
          <optgroup label={t("cadastrar.seusJogos")}>
            {JOGOS_DEX.filter((j) => meus.has(j.id)).map((j) => (
              <option key={j.id} value={j.id}>
                {j.nome}
              </option>
            ))}
          </optgroup>
          <optgroup label={t("cadastrar.outrosJogos")}>
            {JOGOS_DEX.filter((j) => !meus.has(j.id)).map((j) => (
              <option key={j.id} value={j.id}>
                {j.nome}
              </option>
            ))}
          </optgroup>
        </select>
      </Campo>
      <Campo rotulo={t("cadastrar.capturadoEm")}>
        <input
          type="date"
          className={classesEntrada}
          value={dados.capturadoEm}
          onChange={(e) => setDados((d) => ({ ...d, capturadoEm: e.target.value }))}
        />
      </Campo>
      <Campo rotulo={t("cadastrar.notas")}>
        <input
          className={classesEntrada}
          value={dados.notas}
          onChange={(e) => setDados((d) => ({ ...d, notas: e.target.value }))}
        />
      </Campo>
      {erros.length > 0 && (
        <Alerta tom="perigo">
          <ul>
            {erros.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Alerta>
      )}
      <div className="flex justify-end gap-2">
        <Botao type="button" onClick={() => aoFechar(false)}>
          {t("registros.cancelar")}
        </Botao>
        <Botao type="submit" variante="primario" disabled={salvando}>
          {t("registros.salvar")}
        </Botao>
      </div>
    </Modal>
  );
}
