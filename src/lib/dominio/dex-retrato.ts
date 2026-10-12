/**
 * Living Dex — o retrato que abre uma sessão de planejamento (`pnpm
 * dex:estado`, spec §7.1). Módulo puro: recebe o que o banco tem e monta o
 * retrato, em objeto (o `--json`) e em markdown.
 *
 * O retrato responde, por jogo, à pergunta da sessão: o que dá para buscar
 * agora, o que está trancado atrás de qual checkpoint, e quantas vagas
 * vazias cada checkpoint ainda abre. É daí que sai "o que destravar a
 * seguir". A conta é sempre sobre a trilha normal e a vista principal, com
 * as seções que o usuário ligou: é a dex que ele está montando.
 */
import { catalogoDoJogo, type ComoObter, type FormaParaDisponibilidade } from "./dex-disponibilidade";
import { estadoDaVaga, mapearEstadosDex, progressoDex, type ProgressoTrilha } from "./dex-estado";
import { contaNaTrilha, vistaDaCategoria, type FormaParaGrade, type TrilhaDex } from "./dex-grade";
import { oportunidadesHome, type RegistroParaInventario } from "./dex-inventario";
import { jogoDex } from "./dex-jogos";
import type { SecoesContadas } from "./dex-secoes";
import { especiesTrancadas, progressoTrofeus, type IdiomaTrofeu, type ProgressoTrofeus } from "./dex-trofeus";
import { NOME_REGIAO, REGIOES, regiaoDoNumero, type Regiao } from "./escopo-pokedex";
import type { JogoPossuidoDTO, PlanoDexDTO, TrofeuDexDTO } from "./tipos-cliente";

export type FormaParaRetrato = FormaParaGrade & FormaParaDisponibilidade & { especie: string; forma: string | null };

export interface EntradaRetrato {
  hoje: string;
  idioma: IdiomaTrofeu;
  formas: readonly FormaParaRetrato[];
  registros: readonly RegistroParaInventario[];
  secoes: SecoesContadas;
  naoTransferiveis: ReadonlySet<string>;
  jogos: readonly JogoPossuidoDTO[];
  trofeus: readonly TrofeuDexDTO[];
  planos: readonly PlanoDexDTO[];
  /** ISO; `null` se nunca houve sessão. */
  ultimaSessao: string | null;
}

export interface VagaRetrato {
  formaId: string;
  numero: number;
  nome: string;
}

export interface TrofeuRetrato {
  id: string;
  titulo: string;
  tipo: "checkpoint" | "marco";
  nivel: "bronze" | "prata" | "ouro";
  obtidoEm: string | null;
  /** Checkpoint pendente: vagas vazias que ele tranca (sozinho ou junto com outro). */
  vagasQueSegura?: number;
  /** Checkpoint pendente: das que ele tranca, as que abrem só com ele. */
  vagasQueAbre?: number;
}

export interface JogoRetrato {
  jogoId: string;
  nome: string;
  conexaoHome: string;
  ativo: boolean;
  notas: string | null;
  registrosAqui: number;
  trofeus: ProgressoTrofeus & { lista: TrofeuRetrato[] };
  /** Vagas vazias no HOME (trilha normal) que o jogo tem; `null` = jogo sem catálogo. */
  vagas: null | {
    agora: Record<ComoObter, VagaRetrato[]>;
    trancadas: (VagaRetrato & { checkpoints: string[] })[];
  };
}

export interface Retrato {
  geradoEm: string;
  ultimaSessao: string | null;
  progresso: {
    principal: Record<TrilhaDex, ProgressoTrilha>;
    cosmeticas: Record<TrilhaDex, ProgressoTrilha>;
    porRegiao: { regiao: Regiao; normal: ProgressoTrilha; shiny: ProgressoTrilha }[];
  };
  jogos: JogoRetrato[];
  foraDoHome: { jogoId: string; nome: string; conexaoHome: string; vagas: (VagaRetrato & { trilha: TrilhaDex })[] }[];
  planosAtivos: PlanoDexDTO[];
  /** Tarefas fechadas depois da última sessão (ou todas, sem sessão). */
  tarefasFechadas: { plano: string; titulo: string; status: string; concluidaEm: string }[];
}

const nomeDaForma = (f: { especie: string; forma: string | null }) => (f.forma ? `${f.especie} (${f.forma})` : f.especie);

export function montarRetrato(e: EntradaRetrato): Retrato {
  const mapa = mapearEstadosDex(e.registros);
  const principal = e.formas.filter((f) => vistaDaCategoria(f.categoria) === "principal");
  const porId = new Map(e.formas.map((f) => [f.id, f]));
  const obtidos = new Set(e.trofeus.filter((t) => t.obtido).map((t) => t.id));
  const vaga = (f: FormaParaRetrato): VagaRetrato => ({ formaId: f.id, numero: f.numero, nome: nomeDaForma(f) });

  const jogos: JogoRetrato[] = e.jogos.map((j) => {
    const doJogo = e.trofeus.filter((t) => t.jogoId === j.jogoId);
    const trancadas = especiesTrancadas(doJogo, j.jogoId, obtidos);
    const catalogo = catalogoDoJogo(j.jogoId, e.formas);

    let vagas: JogoRetrato["vagas"] = null;
    const abre = new Map<string, number>();
    const segura = new Map<string, number>();
    if (catalogo) {
      vagas = { agora: { livre: [], troca: [], evento: [] }, trancadas: [] };
      for (const f of principal) {
        const d = catalogo.get(f.id);
        if (!d || !d.transferivel || !contaNaTrilha(f, "normal", e.secoes)) continue;
        if (estadoDaVaga(mapa, f.id, "normal") === "no_home") continue;
        const checkpoints = trancadas.get(f.numero);
        if (checkpoints) {
          vagas.trancadas.push({ ...vaga(f), checkpoints });
          for (const c of checkpoints) segura.set(c, (segura.get(c) ?? 0) + 1);
          if (checkpoints.length === 1) abre.set(checkpoints[0], (abre.get(checkpoints[0]) ?? 0) + 1);
        } else {
          vagas.agora[d.como].push(vaga(f));
        }
      }
    }

    const lista = doJogo.map<TrofeuRetrato>((t) => ({
      id: t.id,
      titulo: t.textos[e.idioma].titulo,
      tipo: t.tipo,
      nivel: t.nivel,
      obtidoEm: t.obtido?.em ?? null,
      ...(t.tipo === "checkpoint" && !t.obtido
        ? { vagasQueSegura: segura.get(t.id) ?? 0, vagasQueAbre: abre.get(t.id) ?? 0 }
        : {}),
    }));
    return {
      jogoId: j.jogoId,
      nome: j.nome,
      conexaoHome: j.conexaoHome,
      ativo: j.ativo,
      notas: j.notas,
      registrosAqui: j.registrosAqui,
      trofeus: { ...progressoTrofeus(doJogo, j.jogoId, obtidos), lista },
      vagas,
    };
  });

  const foraDoHome = oportunidadesHome(e.registros, e.naoTransferiveis).map((o) => {
    const jogo = jogoDex(o.jogoId);
    return {
      jogoId: o.jogoId,
      nome: jogo?.nome ?? o.jogoId,
      conexaoHome: jogo?.conexaoHome ?? "",
      vagas: o.itens.flatMap((i) => {
        const f = porId.get(i.formaId);
        return f ? [{ ...vaga(f), trilha: i.trilha }] : [];
      }),
    };
  });

  const corte = e.ultimaSessao ?? "";
  const tarefasFechadas = e.planos.flatMap((p) =>
    p.tarefas
      .filter((t) => t.status !== "aberta" && t.concluidaEm && t.concluidaEm > corte)
      .map((t) => ({ plano: p.titulo, titulo: t.titulo, status: t.status, concluidaEm: t.concluidaEm! })),
  );

  return {
    geradoEm: e.hoje,
    ultimaSessao: e.ultimaSessao,
    progresso: {
      principal: progressoDex(principal, mapa, e.secoes),
      cosmeticas: progressoDex(
        e.formas.filter((f) => vistaDaCategoria(f.categoria) === "cosmeticas"),
        mapa,
        e.secoes,
      ),
      porRegiao: REGIOES.map((regiao) => {
        const p = progressoDex(
          principal.filter((f) => regiaoDoNumero(f.numero) === regiao),
          mapa,
          e.secoes,
        );
        return { regiao, normal: p.normal, shiny: p.shiny };
      }),
    },
    jogos,
    foraDoHome,
    planosAtivos: e.planos.filter((p) => p.status === "ativo"),
    tarefasFechadas,
  };
}

const pct = (p: ProgressoTrilha) => `${p.noHome}/${p.contam} in HOME${p.noJogo ? `, ${p.noJogo} in a game` : ""}`;
const listaCurta = (v: readonly VagaRetrato[], max = 40) =>
  v.length <= max ? v.map((x) => x.nome).join(", ") : `${v.slice(0, max).map((x) => x.nome).join(", ")} … (+${v.length - max})`;

/** O retrato em markdown, para ler no começo da sessão. Em inglês, como os comandos do repositório. */
export function retratoEmMarkdown(r: Retrato, nomeTrofeu: (id: string) => string): string {
  const l: string[] = [];
  l.push(`# Living Dex: state on ${r.geradoEm}`, "");
  l.push(`Last session: ${r.ultimaSessao ? r.ultimaSessao.slice(0, 10) : "none yet"}`, "");

  l.push("## Progress (main view, sections that count)", "");
  l.push(`- Normal: ${pct(r.progresso.principal.normal)}`);
  l.push(`- Shiny: ${pct(r.progresso.principal.shiny)}`);
  l.push(`- Cosmetic view: normal ${pct(r.progresso.cosmeticas.normal)}; shiny ${pct(r.progresso.cosmeticas.shiny)}`, "");
  l.push("| Region | Normal | Shiny |", "|---|---|---|");
  for (const p of r.progresso.porRegiao) l.push(`| ${NOME_REGIAO[p.regiao]} | ${pct(p.normal)} | ${pct(p.shiny)} |`);
  l.push("");

  l.push("## Games", "");
  for (const j of r.jogos) {
    const t = j.trofeus;
    l.push(`### ${j.nome} (${j.jogoId}) · ${j.conexaoHome}${j.ativo ? "" : " · stopped"}`, "");
    if (j.notas) l.push(`Notes: ${j.notas}`, "");
    l.push(`${j.registrosAqui} Pokémon in this game now.`, "");
    if (t.total > 0) {
      l.push(
        `Trophies: ${t.obtidos}/${t.total}${t.platina ? " · PLATINUM" : ""} (bronze ${t.porNivel.bronze.obtidos}/${t.porNivel.bronze.total}, silver ${t.porNivel.prata.obtidos}/${t.porNivel.prata.total}, gold ${t.porNivel.ouro.obtidos}/${t.porNivel.ouro.total})`,
        "",
      );
      const pendentesCheck = t.lista.filter((x) => x.tipo === "checkpoint" && !x.obtidoEm);
      if (pendentesCheck.length) {
        l.push("Checkpoints still locked (empty slots each one locks; in parentheses, the ones it opens alone):");
        for (const x of [...pendentesCheck].sort((a, b) => (b.vagasQueSegura ?? 0) - (a.vagasQueSegura ?? 0))) {
          l.push(`- ${x.titulo} \`${x.id}\` (${x.nivel}): ${x.vagasQueSegura ?? 0} (${x.vagasQueAbre ?? 0})`);
        }
        l.push("");
      }
      const feitos = t.lista.filter((x) => x.obtidoEm);
      if (feitos.length) l.push(`Earned: ${feitos.map((x) => `${x.titulo} (${x.obtidoEm})`).join("; ")}`, "");
      const marcos = t.lista.filter((x) => x.tipo === "marco" && !x.obtidoEm);
      if (marcos.length) l.push(`Milestones left: ${marcos.map((x) => `${x.titulo} \`${x.id}\``).join("; ")}`, "");
    }
    if (!j.vagas) {
      l.push("No availability catalog for this game.", "");
    } else {
      const a = j.vagas.agora;
      l.push(`Empty HOME slots this game reaches now: ${a.livre.length} on its own, ${a.troca.length} by trade, ${a.evento.length} by event.`);
      if (a.livre.length) l.push(`- On its own: ${listaCurta(a.livre)}`);
      if (a.troca.length) l.push(`- By trade: ${listaCurta(a.troca)}`);
      if (a.evento.length) l.push(`- By event: ${listaCurta(a.evento)}`);
      if (j.vagas.trancadas.length) {
        l.push(`Locked behind checkpoints: ${j.vagas.trancadas.length}.`);
        l.push(
          `- ${listaCurta(j.vagas.trancadas.map((v) => ({ ...v, nome: `${v.nome} [${v.checkpoints.map(nomeTrofeu).join(" + ")}]` })), 25)}`,
        );
      }
      l.push("");
    }
  }

  l.push("## In a game, not in HOME yet", "");
  if (r.foraDoHome.length === 0) l.push("Nothing.", "");
  for (const g of r.foraDoHome) {
    l.push(`- ${g.nome} (${g.conexaoHome}): ${g.vagas.map((v) => `${v.nome}${v.trilha === "shiny" ? " ★" : ""}`).join(", ")}`);
  }
  if (r.foraDoHome.length) l.push("");

  l.push("## Active plans", "");
  if (r.planosAtivos.length === 0) l.push("None.", "");
  for (const p of r.planosAtivos) {
    l.push(`### ${p.titulo} (${p.inicio}${p.fim ? ` to ${p.fim}` : ""}) \`${p.id}\``, "");
    if (p.objetivo) l.push(p.objetivo, "");
    if (p.trofeuIds.length) l.push(`Aims at: ${p.trofeuIds.map(nomeTrofeu).join(", ")}`, "");
    for (const t of p.tarefas) {
      const caixa = t.status === "feita" ? "[x]" : t.status === "descartada" ? "[-]" : "[ ]";
      l.push(`- ${caixa} ${t.titulo} (${t.tipo}${t.jogoId ? `, ${t.jogoId}` : ""}) \`${t.id}\``);
    }
    l.push("");
  }

  l.push("## Tasks closed since the last session", "");
  if (r.tarefasFechadas.length === 0) l.push("None.");
  for (const t of r.tarefasFechadas) l.push(`- ${t.titulo} (${t.status}, ${t.concluidaEm.slice(0, 10)}) · ${t.plano}`);
  l.push("");
  return l.join("\n");
}
