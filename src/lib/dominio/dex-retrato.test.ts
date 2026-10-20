import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { montarRetrato, retratoEmMarkdown, type EntradaRetrato } from "./dex-retrato";
import { lerSeedTrofeus } from "./dex-trofeus";
import { lerRegistrosCsv } from "./seed-catalogo";
import { COLUNAS_DEX_FORMA, converterLinhaDexForma } from "./seed-dex";
import type { TrofeuDexDTO } from "./tipos-cliente";

const raiz = path.resolve(__dirname, "../../..");
const formas = lerRegistrosCsv(fs.readFileSync(path.join(raiz, "seed/dex-forma.csv"), "utf8"), COLUNAS_DEX_FORMA).map(
  (linha) => {
    const f = converterLinhaDexForma(linha);
    return {
      id: f.id,
      numero: f.numero,
      especie: f.especie,
      forma: f.forma ?? null,
      categoria: f.categoria,
      mitico: linha.mitico === "t",
      shinyObtenivel: linha.shiny_obtenivel === "t",
    };
  },
);
const trofeus: TrofeuDexDTO[] = lerSeedTrofeus(
  JSON.parse(fs.readFileSync(path.join(raiz, "seed/dex-trofeus.json"), "utf8")),
).map((t) => ({ ...t, obtido: null }));

const firered = {
  id: "j1",
  jogoId: "firered",
  nome: "Pokémon FireRed",
  conexaoHome: "so_envio" as const,
  desde: null,
  notas: null,
  ativo: true,
  registrosAqui: 1,
};

const entrada = (extra: Partial<EntradaRetrato> = {}): EntradaRetrato => ({
  hoje: "2026-10-12",
  idioma: "pt-BR",
  formas,
  registros: [],
  secoes: { regional: true, genero: false, especial: true },
  naoTransferiveis: new Set(),
  jogos: [firered],
  trofeus,
  planos: [],
  ultimaSessao: null,
  ...extra,
});

describe("montarRetrato", () => {
  it("separa o que o FireRed alcança agora do que está trancado, e conta o que cada checkpoint abre", () => {
    const r = montarRetrato(entrada());
    const fr = r.jogos[0];
    const agora = fr.vagas!.agora.livre.map((v) => v.formaId);
    expect(agora).toContain("bulbasaur");
    expect(agora).not.toContain("mewtwo");
    expect(fr.vagas!.trancadas.find((v) => v.formaId === "mewtwo")?.checkpoints).toEqual(["firered-campeao"]);
    const abre = Object.fromEntries(fr.trofeus.lista.filter((t) => t.vagasQueAbre !== undefined).map((t) => [t.id, t.vagasQueAbre]));
    expect(abre["firered-campeao"]).toBe(1);
    expect(abre["firered-tanoby"]).toBe(0);
    const segura = Object.fromEntries(fr.trofeus.lista.map((t) => [t.id, t.vagasQueSegura]));
    // Um só: os outros 27 Unown são cosméticos, fora da vista principal.
    expect(segura["firered-tanoby"]).toBe(1);
    expect(segura["firered-ilhas-sevii-4-7"]).toBeGreaterThan(segura["firered-tanoby"]!);
    expect(fr.trofeus.platina).toBe(false);
  });

  it("vaga já no HOME sai da conta; Pokémon no jogo aparece em 'fora do HOME'", () => {
    const r = montarRetrato(
      entrada({
        registros: [
          { id: "a", formaId: "bulbasaur", shiny: false, jogoOrigem: "firered", local: "home", capturadoEm: null, notas: null },
          { id: "b", formaId: "charmander", shiny: false, jogoOrigem: "firered", local: "firered", capturadoEm: null, notas: null },
        ],
      }),
    );
    expect(r.jogos[0].vagas!.agora.livre.map((v) => v.formaId)).not.toContain("bulbasaur");
    expect(r.foraDoHome[0].vagas.map((v) => v.formaId)).toEqual(["charmander"]);
    expect(r.progresso.principal.normal.noHome).toBe(1);
  });

  it("tarefas fechadas: só as depois da última sessão", () => {
    const tarefa = (titulo: string, concluidaEm: string) => ({
      id: titulo,
      ordem: 1,
      titulo,
      descricao: null,
      tipo: "outro" as const,
      jogoId: null,
      formaIds: [],
      trofeuId: null,
      status: "feita" as const,
      concluidaEm,
      etapas: [],
    });
    const r = montarRetrato(
      entrada({
        ultimaSessao: "2026-10-10T12:00:00.000Z",
        planos: [
          {
            id: "p",
            titulo: "Semana",
            objetivo: null,
            inicio: "2026-10-05",
            fim: null,
            status: "ativo",
            origem: "sessao",
            trofeuIds: [],
            tarefas: [tarefa("antes", "2026-10-09T10:00:00.000Z"), tarefa("depois", "2026-10-11T10:00:00.000Z")],
          },
        ],
      }),
    );
    expect(r.tarefasFechadas.map((t) => t.titulo)).toEqual(["depois"]);
    const md = retratoEmMarkdown(r, (id) => id);
    expect(md).toContain("## Active plans");
    expect(md).toContain("- [x] depois");
  });

  it("plano ativo mostra o checklist das tarefas abertas, com id e detalhe resumido", () => {
    const base = {
      ordem: 1,
      descricao: null,
      tipo: "progresso" as const,
      jogoId: "firered",
      formaIds: [],
      trofeuId: null,
      concluidaEm: null,
    };
    const etapa = (id: string, texto: string, feita: boolean, detalhe: string | null = null) => ({
      id,
      ordem: 1,
      texto,
      detalhe,
      feita,
      feitaEm: feita ? "2026-10-11T10:00:00.000Z" : null,
    });
    const r = montarRetrato(
      entrada({
        planos: [
          {
            id: "p",
            titulo: "Semana",
            objetivo: null,
            inicio: "2026-10-05",
            fim: null,
            status: "ativo",
            origem: "sessao",
            trofeuIds: [],
            tarefas: [
              {
                ...base,
                id: "t1",
                titulo: "Missão",
                status: "aberta",
                etapas: [etapa("e1", "Ir ao porto", true), etapa("e2", "Falar com alguém", false, `linha um\n${"x".repeat(100)}`)],
              },
              { ...base, id: "t2", titulo: "Velha", status: "feita", etapas: [etapa("e3", "Feita antes", true)] },
            ],
          },
        ],
      }),
    );
    const md = retratoEmMarkdown(r, (id) => id);
    expect(md).toContain("- [ ] Missão (progresso, firered, 1/2 steps) `t1`");
    expect(md).toContain("  - [x] Ir ao porto `e1`");
    expect(md).toMatch(/ {2}- \[ \] Falar com alguém `e2` — linha um x+…\n/);
    expect(md).toContain("- [x] Velha (progresso, firered, 1/1 steps) `t2`");
    expect(md).not.toContain("Feita antes");
    // O `--json` leva o detalhe inteiro.
    expect(r.planosAtivos[0].tarefas[0].etapas[1].detalhe).toHaveLength(109);
  });
});
