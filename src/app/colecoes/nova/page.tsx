"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { textoDaRecusa } from "@/app/_componentes/recusa";

/* Nome de região é nome próprio do universo Pokémon: igual nos dois
   idiomas, e por isso fica no código, não no catálogo de mensagens. A
   faixa é numeral puro. */
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

const TIPOS: readonly TipoColecao[] = ["pokedex", "set", "customizada"] as const;

export default function NovaColecaoPage() {
  const t = useTranslations("colecaoNova");
  const tr = useTranslations("recusas");
  const router = useRouter();

  const [tipo, setTipo] = useState<TipoColecao>("pokedex");
  const [nome, setNome] = useState("");
  const [idiomaExigido, setIdiomaExigido] = useState<Idioma | "">("");
  const [notas, setNotas] = useState("");

  // pokedex
  const [escopo, setEscopo] = useState<"nacional" | "regioes">("nacional");
  const [regioesEscolhidas, setRegioesEscolhidas] = useState<Regiao[]>([]);

  // set — a RECEITA: um ou mais sets, na ordem em que foram escolhidos. O
  // 30th Celebration e a Coleção Clássica dele são sets separados no
  // catálogo, e o usuário quer os dois numa coleção só (2026-09-30).
  const [setsEscolhidos, setSetsEscolhidos] = useState<SetParaCadastroDTO[]>([]);
  const [idiomaCatalogo, setIdiomaCatalogo] = useState<IdiomaCatalogo>("pt");
  const [incluirSecretas, setIncluirSecretas] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [detalhesErro, setDetalhesErro] = useState<string[]>([]);

  function adicionarSet(set: SetParaCadastroDTO | null) {
    if (!set) return;
    setSetsEscolhidos((atuais) =>
      atuais.some((s) => s.setId === set.setId) ? atuais : [...atuais, set],
    );
    // O idioma é a PREFERÊNCIA da coleção: a ficha é escolhida carta a
    // carta (`escolherLinhaPorCarta`), e pt completa com en onde falta.
    // Por isso pt é o padrão de todo set ocidental, mesmo sem nenhuma
    // carta em pt hoje — quando o upstream traduzir, a coleção passa a
    // mostrar os nomes em português sem ser recriada.
    setIdiomaCatalogo("pt");
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
        setErro(t("erroRegiao"));
        return;
      }
      parametro =
        escopo === "nacional"
          ? { escopo: "nacional" }
          : { escopo: "regioes", regioes: regioesEscolhidas };
    } else if (tipo === "set") {
      if (setsEscolhidos.length === 0) {
        setErro(t("erroExpansao"));
        return;
      }
      parametro = { sets: setsEscolhidos.map((s) => s.setId), idiomaCatalogo, incluirSecretas };
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
        setErro(textoDaRecusa(tr, dados, t("erroCriar")));
        setDetalhesErro(dados.detalhes ?? []);
        return;
      }
      router.push(`/colecoes/${dados.id}`);
    } catch {
      setErro(t("erroRede"));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4 sm:p-8">
      <CabecalhoPagina
        titulo={t("titulo")}
        descricao={t("descricao")}
      />

      <form onSubmit={enviar} className="flex flex-col gap-4">
        <Campo rotulo={t("campoNome")}>
          <input value={nome} onChange={(e) => setNome(e.target.value)} required className={classesEntrada} />
        </Campo>

        <fieldset className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
          <legend className="px-2 text-[13px] font-bold text-strong">{t("tipo")}</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            {TIPOS.map((valor) => (
              <label key={valor} className="flex items-center gap-1">
                <input
                  type="radio"
                  name="tipo"
                  checked={tipo === valor}
                  onChange={() => setTipo(valor)}
                />
                {t(`tipos.${valor}`)}
              </label>
            ))}
          </div>
        </fieldset>

        {tipo === "pokedex" && (
          <fieldset className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
            <legend className="px-2 text-[13px] font-bold text-strong">{t("escopo")}</legend>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="escopo"
                  checked={escopo === "nacional"}
                  onChange={() => setEscopo("nacional")}
                />
                {t("escopoNacional")}
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="escopo"
                  checked={escopo === "regioes"}
                  onChange={() => setEscopo("regioes")}
                />
                {t("escopoRegioes")}
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
            <legend className="px-2 text-[13px] font-bold text-strong">{t("expansao")}</legend>
            {setsEscolhidos.length > 0 && (
              <ul className="flex flex-col gap-1">
                {setsEscolhidos.map((set) => (
                  <li
                    key={set.setId}
                    className="flex items-center justify-between gap-2 rounded border border-line px-3 py-1.5 text-sm"
                  >
                    <span>
                      {set.setNome} <span className="text-muted">· {set.setId}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setSetsEscolhidos((atuais) => atuais.filter((s) => s.setId !== set.setId))
                      }
                      className="text-xs text-muted hover:text-danger"
                      aria-label={t("removerSet", { set: set.setNome })}
                    >
                      {t("remover")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <SeletorExpansao
              // Sempre vazio: escolher um set o acrescenta à receita, e o
              // seletor fica livre para o próximo.
              setSelecionadoId=""
              onSelecionar={adicionarSet}
            />
            {setsEscolhidos.length > 1 && (
              <span className="text-xs text-muted">{t("ajudaVariosSets")}</span>
            )}
            {setsEscolhidos.length > 0 && (
              <>
                <Campo rotulo={t("campoIdiomaCatalogo")}>
                  <select
                    value={idiomaCatalogo}
                    onChange={(e) => setIdiomaCatalogo(e.target.value as IdiomaCatalogo)}
                    className={`w-40 ${classesEntrada}`}
                  >
                    <option value="pt">pt</option>
                    <option value="en">en</option>
                  </select>
                  {setsEscolhidos.some((s) => !s.temPt) && (
                    <span className="text-xs text-warning-fg">{t("semPt")}</span>
                  )}
                </Campo>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={incluirSecretas}
                    onChange={(e) => setIncluirSecretas(e.target.checked)}
                  />
                  {t("incluirSecretas", {
                    total: setsEscolhidos.reduce((soma, s) => soma + s.qtdTotal, 0),
                    // Set sem numeração oficial (a Clássica do 30th) conta
                    // o total dos dois lados: não tem secretas a ligar.
                    oficiais: setsEscolhidos.reduce(
                      (soma, s) => soma + (s.qtdOficial > 0 ? s.qtdOficial : s.qtdTotal),
                      0,
                    ),
                  })}
                </label>
              </>
            )}
          </fieldset>
        )}

        <Campo rotulo={t("campoIdiomaExigido")} ajuda={t("ajudaIdiomaExigido")}>
          <select
            value={idiomaExigido}
            onChange={(e) => setIdiomaExigido(e.target.value as Idioma | "")}
            className={`w-40 ${classesEntrada}`}
          >
            <option value="">{t("qualquer")}</option>
            {IDIOMAS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </Campo>

        <Campo rotulo={t("campoNotas")}>
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
            {enviando ? t("criando") : t("criar")}
          </Botao>
        </div>
      </form>
    </main>
  );
}
