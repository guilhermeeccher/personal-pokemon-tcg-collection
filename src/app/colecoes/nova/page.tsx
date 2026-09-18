"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { IDIOMAS, type Idioma } from "@/lib/dominio/enums";
import { REGIOES, type Regiao } from "@/lib/dominio/escopo-pokedex";
import type { IdiomaCatalogo } from "@/lib/dominio/idioma-catalogo";
import type { TipoColecao } from "@/lib/dominio/parametro-colecao";
import { Botao } from "@/app/_componentes/botao";
import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { Campo, classesEntrada } from "@/app/_componentes/campo";
import { GradeEscopo } from "@/app/_componentes/ds/grade-escopo";
import { SeletorExpansao } from "@/app/_componentes/seletor-expansao";
import type { SetParaCadastroDTO } from "@/lib/dominio/tipos-cliente";

const REGIAO_LABEL: Record<Regiao, { rotulo: string; faixa: string }> = {
  kanto: { rotulo: "Kanto", faixa: "1–151" },
  johto: { rotulo: "Johto", faixa: "152–251" },
  hoenn: { rotulo: "Hoenn", faixa: "252–386" },
  sinnoh: { rotulo: "Sinnoh", faixa: "387–493" },
  unova: { rotulo: "Unova", faixa: "494–649" },
  kalos: { rotulo: "Kalos", faixa: "650–721" },
  alola: { rotulo: "Alola", faixa: "722–809" },
  galar: { rotulo: "Galar", faixa: "810–905" },
  paldea: { rotulo: "Paldea", faixa: "906–1025" },
};

const OPCOES_REGIAO = REGIOES.map((regiao) => ({ id: regiao, ...REGIAO_LABEL[regiao] }));

const TIPOS: { valor: TipoColecao; rotulo: string }[] = [
  { valor: "pokedex", rotulo: "Pokédex" },
  { valor: "set", rotulo: "Set" },
  { valor: "customizada", rotulo: "Customizada" },
];

export default function NovaColecaoPage() {
  const router = useRouter();

  const [tipo, setTipo] = useState<TipoColecao>("pokedex");
  const [nome, setNome] = useState("");
  const [idiomaExigido, setIdiomaExigido] = useState<Idioma | "">("");
  const [notas, setNotas] = useState("");

  // pokedex
  const [escopo, setEscopo] = useState<"nacional" | "regioes">("nacional");
  const [regioesEscolhidas, setRegioesEscolhidas] = useState<Regiao[]>([]);

  // set
  const [setEscolhido, setSetEscolhido] = useState<SetParaCadastroDTO | null>(null);
  const [idiomaCatalogo, setIdiomaCatalogo] = useState<IdiomaCatalogo>("pt");
  const [incluirSecretas, setIncluirSecretas] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [detalhesErro, setDetalhesErro] = useState<string[]>([]);

  function selecionarSet(set: SetParaCadastroDTO | null) {
    setSetEscolhido(set);
    // `SetParaCadastroDTO.idiomaCatalogo` é tipado como `Idioma` (inclui
    // "jp") mas `resolverIdiomaCatalogoDoSet` só devolve "pt" ou "en" —
    // nunca "jp" (spec §2: catálogo sincronizado só em pt/en por ora).
    setIdiomaCatalogo(set?.idiomaCatalogo === "pt" ? "pt" : "en");
  }

  function alternarRegiao(r: Regiao) {
    setRegioesEscolhidas((atual) =>
      atual.includes(r) ? atual.filter((x) => x !== r) : [...atual, r],
    );
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setDetalhesErro([]);

    let parametro: unknown;
    if (tipo === "pokedex") {
      if (escopo === "regioes" && regioesEscolhidas.length === 0) {
        setErro("Escolha ao menos uma região.");
        return;
      }
      parametro =
        escopo === "nacional"
          ? { escopo: "nacional" }
          : { escopo: "regioes", regioes: regioesEscolhidas };
    } else if (tipo === "set") {
      if (!setEscolhido) {
        setErro("Escolha uma expansão.");
        return;
      }
      parametro = { setId: setEscolhido.setId, idiomaCatalogo, incluirSecretas };
    } else {
      parametro = null;
    }

    setEnviando(true);
    try {
      const resp = await fetch("/api/colecoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          tipo,
          parametro,
          idiomaExigido: idiomaExigido || undefined,
          notas: notas || undefined,
        }),
      });
      const dados = await resp.json();
      if (!resp.ok) {
        setErro(dados.erro ?? "Falha ao criar a coleção.");
        setDetalhesErro(dados.detalhes ?? []);
        return;
      }
      router.push(`/colecoes/${dados.id}`);
    } catch {
      setErro("Falha de rede ao criar a coleção.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4 sm:p-8">
      <CabecalhoPagina
        titulo="Nova coleção"
        descricao="As vagas nascem junto com a coleção. A alocação de cada vaga é sempre manual, feita depois de criada — o sistema nunca preenche uma vaga sozinho."
      />

      <form onSubmit={enviar} className="flex flex-col gap-4">
        <Campo rotulo="Nome">
          <input value={nome} onChange={(e) => setNome(e.target.value)} required className={classesEntrada} />
        </Campo>

        <fieldset className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
          <legend className="px-2 text-[13px] font-bold text-strong">Tipo</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            {TIPOS.map((t) => (
              <label key={t.valor} className="flex items-center gap-1">
                <input
                  type="radio"
                  name="tipo"
                  checked={tipo === t.valor}
                  onChange={() => setTipo(t.valor)}
                />
                {t.rotulo}
              </label>
            ))}
          </div>
        </fieldset>

        {tipo === "pokedex" && (
          <fieldset className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
            <legend className="px-2 text-[13px] font-bold text-strong">Escopo</legend>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="escopo"
                  checked={escopo === "nacional"}
                  onChange={() => setEscopo("nacional")}
                />
                Nacional (1–1025)
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="escopo"
                  checked={escopo === "regioes"}
                  onChange={() => setEscopo("regioes")}
                />
                Uma ou mais regiões
              </label>
            </div>
            {escopo === "regioes" && (
              <GradeEscopo
                opcoes={OPCOES_REGIAO}
                selecionadas={regioesEscolhidas}
                onAlternar={(id) => alternarRegiao(id as Regiao)}
              />
            )}
          </fieldset>
        )}

        {tipo === "set" && (
          <fieldset className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
            <legend className="px-2 text-[13px] font-bold text-strong">Expansão</legend>
            <SeletorExpansao
              setSelecionadoId={setEscolhido?.setId ?? ""}
              onSelecionar={selecionarSet}
            />
            {setEscolhido && (
              <>
                <Campo rotulo="Idioma do catálogo (identidade das cartas — não é o idioma físico das suas cópias)">
                  <select
                    value={idiomaCatalogo}
                    onChange={(e) => setIdiomaCatalogo(e.target.value as IdiomaCatalogo)}
                    className={`w-40 ${classesEntrada}`}
                  >
                    {setEscolhido.temPt && <option value="pt">pt</option>}
                    <option value="en">en</option>
                  </select>
                  {!setEscolhido.temPt && (
                    <span className="text-xs text-warning-fg">
                      Este set não tem carta a carta em pt no upstream — a identidade das cartas usa a ficha
                      em en.
                    </span>
                  )}
                </Campo>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={incluirSecretas}
                    onChange={(e) => setIncluirSecretas(e.target.checked)}
                  />
                  Incluir secretas ({setEscolhido.qtdTotal} cartas no total, em vez de {setEscolhido.qtdOficial}{" "}
                  oficiais)
                </label>
              </>
            )}
          </fieldset>
        )}

        <Campo
          rotulo="Idioma exigido (opcional)"
          ajuda="Idioma físico da cópia. Cópia de outro idioma continua podendo ser alocada — vem marcada como fora de padrão e exige confirmação explícita."
        >
          <select
            value={idiomaExigido}
            onChange={(e) => setIdiomaExigido(e.target.value as Idioma | "")}
            className={`w-40 ${classesEntrada}`}
          >
            <option value="">Qualquer</option>
            {IDIOMAS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </Campo>

        <Campo rotulo="Notas (opcional)">
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={classesEntrada} />
        </Campo>

        {erro && (
          <div className="text-sm text-danger">
            <p>{erro}</p>
            {detalhesErro.length > 0 && (
              <ul className="list-disc pl-5">
                {detalhesErro.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Botao type="submit" variante="primario" disabled={enviando}>
            {enviando ? "Criando…" : "Criar coleção"}
          </Botao>
        </div>
      </form>
    </main>
  );
}
