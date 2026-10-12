"use client";

/**
 * Inventário da Living Dex — os Pokémon cadastrados, como o inventário das
 * cartas: registros idênticos viram uma linha com quantidade
 * (`agruparInventario`). As ações agem sobre UM Pokémon do grupo (enviar,
 * mover, apagar), menos corrigir, que corrige o grupo inteiro.
 *
 * Tudo vem do servidor de uma vez e filtra local; depois de cada ação, a
 * página recarrega os dados (`router.refresh`).
 */

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Alerta } from "@/app/_componentes/alerta";
import { Botao } from "@/app/_componentes/botao";
import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { Campo, classesEntrada } from "@/app/_componentes/campo";
import { Distintivo } from "@/app/_componentes/distintivo";
import { Modal } from "@/app/_componentes/modal";
import { textoDaRecusa, textosDasRecusas } from "@/app/_componentes/recusa";
import { classesCelulaCabecalho, classesLinha, classesLinhaCabecalho, Tabela } from "@/app/_componentes/tabela";
import { filtrarFormasDex } from "@/lib/dominio/dex-grade";
import { agruparInventario, compararPorNome, type GrupoInventario } from "@/lib/dominio/dex-inventario";
import { JOGOS_DEX, jogoDex, LOCAL_HOME } from "@/lib/dominio/dex-jogos";
import type { FormaDexDTO, JogoPossuidoDTO, RegistroDexDTO } from "@/lib/dominio/tipos-cliente";

import { nomeDaForma, SpriteDex } from "../_componentes/sprite-dex";
import { useTransferencia } from "../_componentes/use-transferencia";

export function InventarioDex({
  formas,
  jogos,
  registros,
}: {
  formas: FormaDexDTO[];
  jogos: JogoPossuidoDTO[];
  registros: RegistroDexDTO[];
}) {
  const t = useTranslations("dex");
  const tr = useTranslations("recusas");
  const router = useRouter();
  const recarregar = () => router.refresh();
  const { mover, ocupado, erro: erroMover, modal } = useTransferencia(recarregar);

  const [filtroLocal, setFiltroLocal] = useState("");
  const [busca, setBusca] = useState("");
  const [soShiny, setSoShiny] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [corrigindo, setCorrigindo] = useState<GrupoInventario | null>(null);

  const formaPorId = useMemo(() => new Map(formas.map((f) => [f.id, f])), [formas]);
  const ativos = jogos.filter((j) => j.ativo);
  const nomeLocal = (id: string) => (id === LOCAL_HOME ? t("home") : (jogoDex(id)?.nome ?? id));

  const linhas = useMemo(() => {
    const permitidas = busca.trim()
      ? new Set(filtrarFormasDex(formas, { regiao: "todas", categoria: "todas", busca }).map((f) => f.id))
      : null;
    return agruparInventario(
      registros.filter(
        (r) =>
          (!filtroLocal || r.local === filtroLocal) &&
          (!soShiny || r.shiny) &&
          (!permitidas || permitidas.has(r.formaId)),
      ),
    )
      .flatMap((g) => {
        const forma = formaPorId.get(g.formaId);
        return forma ? [{ grupo: g, forma }] : [];
      })
      .sort((a, b) => compararPorNome(a.forma, b.forma));
  }, [registros, filtroLocal, soShiny, busca, formas, formaPorId]);

  const totalPokemon = linhas.reduce((soma, l) => soma + l.grupo.ids.length, 0);

  async function apagarUm(grupo: GrupoInventario, forma: FormaDexDTO) {
    if (!window.confirm(t("inventario.confirmarApagar", { nome: nomeDaForma(forma) }))) return;
    setErro(null);
    const r = await fetch(`/api/dex/registros/${grupo.ids[grupo.ids.length - 1]}`, { method: "DELETE" });
    if (!r.ok) setErro(textoDaRecusa(tr, await r.json().catch(() => null), t("inventario.erro")));
    else recarregar();
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-8 md:h-full">
      <CabecalhoPagina titulo={t("inventario.titulo")} />

      <div className="flex flex-wrap items-end gap-3">
        <Campo rotulo={t("inventario.filtroLocal")}>
          <select className={classesEntrada} value={filtroLocal} onChange={(e) => setFiltroLocal(e.target.value)}>
            <option value="">{t("inventario.todos")}</option>
            <option value={LOCAL_HOME}>{t("home")}</option>
            {jogos.map((j) => (
              <option key={j.jogoId} value={j.jogoId}>
                {j.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo={t("inventario.buscar")}>
          <input
            className={classesEntrada}
            value={busca}
            placeholder={t("inventario.placeholderBuscar")}
            onChange={(e) => setBusca(e.target.value)}
          />
        </Campo>
        <label className="flex h-[34px] items-center gap-2 text-sm">
          <input type="checkbox" checked={soShiny} onChange={(e) => setSoShiny(e.target.checked)} />
          {t("inventario.soShiny")}
        </label>
        <span className="ml-auto text-xs text-muted">
          {t("inventario.total", { linhas: String(linhas.length), pokemon: String(totalPokemon) })}
        </span>
      </div>

      {(erro || erroMover) && <Alerta tom="perigo">{erro ?? erroMover}</Alerta>}

      <Tabela rolagemPropria>
        <thead>
          <tr className={classesLinhaCabecalho}>
            <th className={classesCelulaCabecalho} />
            <th className={classesCelulaCabecalho}>{t("inventario.colPokemon")}</th>
            <th className={classesCelulaCabecalho}>{t("inventario.colOrigem")}</th>
            <th className={classesCelulaCabecalho}>{t("inventario.colLocal")}</th>
            <th className={classesCelulaCabecalho}>{t("inventario.colQtd")}</th>
            <th className={classesCelulaCabecalho} />
          </tr>
        </thead>
        <tbody>
          {linhas.map(({ grupo: g, forma }) => {
            const destinos = [LOCAL_HOME, ...ativos.map((j) => j.jogoId)].filter((d) => d !== g.local);
            return (
              <tr key={g.chave} className={classesLinha}>
                <td className="p-1">
                  <SpriteDex sprite={forma.sprite} shiny={g.shiny} tamanho={40} />
                </td>
                <td className="p-2">
                  <span className="mr-1 font-mono text-xs tabular-nums text-muted">#{String(forma.numero).padStart(4, "0")}</span>
                  <span className="font-semibold text-strong">{forma.especie}</span>
                  {forma.forma && <span className="ml-1 text-xs text-muted">{forma.forma}</span>}
                  {g.shiny && (
                    <Distintivo tom="acento" className="ml-2">
                      {t("trilha.shiny")}
                    </Distintivo>
                  )}
                  {(g.capturadoEm || g.notas) && (
                    <div className="text-xs text-muted">{[g.capturadoEm, g.notas].filter(Boolean).join(" · ")}</div>
                  )}
                </td>
                <td className="p-2 text-xs">{nomeLocal(g.jogoOrigem)}</td>
                <td className="p-2">
                  <Distintivo tom={g.local === LOCAL_HOME ? "sucesso" : "neutro"}>{nomeLocal(g.local)}</Distintivo>
                </td>
                <td className="p-2 font-mono tabular-nums">{g.ids.length}</td>
                <td className="p-2">
                  <div className="flex flex-wrap justify-end gap-1">
                    {g.local !== LOCAL_HOME && (
                      <Botao tamanho="xs" variante="primario" disabled={ocupado} onClick={() => mover([g.ids[0]], LOCAL_HOME)}>
                        {t("inventario.enviarHome")}
                      </Botao>
                    )}
                    {destinos.length > 1 && (
                      <select
                        aria-label={t("inventario.moverPara")}
                        className={`${classesEntrada} !min-h-6 !py-0 text-xs`}
                        value=""
                        disabled={ocupado}
                        onChange={(e) => e.target.value && mover([g.ids[0]], e.target.value)}
                      >
                        <option value="">{t("inventario.moverPara")}</option>
                        {destinos.map((d) => (
                          <option key={d} value={d}>
                            {nomeLocal(d)}
                          </option>
                        ))}
                      </select>
                    )}
                    <Botao tamanho="xs" disabled={ocupado} onClick={() => setCorrigindo(g)}>
                      {t("inventario.corrigir")}
                    </Botao>
                    <Botao tamanho="xs" variante="perigo" disabled={ocupado} onClick={() => apagarUm(g, forma)}>
                      {t("inventario.apagar")}
                    </Botao>
                  </div>
                </td>
              </tr>
            );
          })}
          {linhas.length === 0 && (
            <tr>
              <td colSpan={6} className="p-4 text-center text-sm text-muted">
                {registros.length === 0 ? t("inventario.vazio") : t("inventario.nenhum")}
              </td>
            </tr>
          )}
        </tbody>
      </Tabela>

      {modal}
      {corrigindo && (
        <CorrecaoGrupo
          grupo={corrigindo}
          forma={formaPorId.get(corrigindo.formaId)!}
          jogos={jogos}
          aoFechar={(salvou) => {
            setCorrigindo(null);
            if (salvou) recarregar();
          }}
        />
      )}
    </main>
  );
}

/** Corrige shiny, origem, data e notas do grupo inteiro. Forma errada: apagar e cadastrar de novo. */
function CorrecaoGrupo({
  grupo,
  forma,
  jogos,
  aoFechar,
}: {
  grupo: GrupoInventario;
  forma: FormaDexDTO;
  jogos: JogoPossuidoDTO[];
  aoFechar: (salvou: boolean) => void;
}) {
  const t = useTranslations("dex");
  const tr = useTranslations("recusas");
  const [dados, setDados] = useState({
    shiny: grupo.shiny,
    jogoOrigem: grupo.jogoOrigem,
    capturadoEm: grupo.capturadoEm ?? "",
    notas: grupo.notas ?? "",
  });
  const [erros, setErros] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const meus = new Set(jogos.map((j) => j.jogoId));

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErros([]);
    try {
      const r = await fetch("/api/dex/registros", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: grupo.ids, formaId: grupo.formaId, ...dados }),
      });
      if (!r.ok) {
        setErros(textosDasRecusas(tr, await r.json().catch(() => null), t("inventario.erro")));
        return;
      }
      aoFechar(true);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal as="form" onSubmit={salvar}>
      <h3 className="text-base font-bold text-strong">
        {t("inventario.corrigirTitulo", { quantidade: String(grupo.ids.length) })}
      </h3>
      <p className="font-semibold">{nomeDaForma(forma)}</p>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={dados.shiny}
          onChange={(e) => setDados((d) => ({ ...d, shiny: e.target.checked }))}
        />
        {t("inventario.shiny")}
      </label>
      <Campo rotulo={t("inventario.jogoOrigem")}>
        <select
          className={classesEntrada}
          value={dados.jogoOrigem}
          onChange={(e) => setDados((d) => ({ ...d, jogoOrigem: e.target.value }))}
        >
          <optgroup label={t("inventario.seusJogos")}>
            {JOGOS_DEX.filter((j) => meus.has(j.id)).map((j) => (
              <option key={j.id} value={j.id}>
                {j.nome}
              </option>
            ))}
          </optgroup>
          <optgroup label={t("inventario.outrosJogos")}>
            {JOGOS_DEX.filter((j) => !meus.has(j.id)).map((j) => (
              <option key={j.id} value={j.id}>
                {j.nome}
              </option>
            ))}
          </optgroup>
        </select>
      </Campo>
      <Campo rotulo={t("inventario.capturadoEm")}>
        <input
          type="date"
          className={classesEntrada}
          value={dados.capturadoEm}
          onChange={(e) => setDados((d) => ({ ...d, capturadoEm: e.target.value }))}
        />
      </Campo>
      <Campo rotulo={t("inventario.notas")}>
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
          {t("inventario.cancelar")}
        </Botao>
        <Botao type="submit" variante="primario" disabled={salvando}>
          {t("inventario.salvar")}
        </Botao>
      </div>
    </Modal>
  );
}
