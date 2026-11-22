"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { IDIOMAS, type Idioma } from "@/lib/dominio/enums";
import { REGIOES, type Regiao } from "@/lib/dominio/escopo-pokedex";
import type { IdiomaCatalogo } from "@/lib/dominio/idioma-catalogo";
import type { TipoColecao } from "@/lib/dominio/parametro-colecao";
import { Alerta } from "@/app/_componentes/alerta";
import { Botao } from "@/app/_componentes/botao";
import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { Campo, classesEntrada } from "@/app/_componentes/campo";
import { GradeEscopo } from "@/app/_componentes/ds/grade-escopo";
import { SeletorExpansao } from "@/app/_componentes/seletor-expansao";
import type { GrupoColecaoDTO, ListaColecoesDTO, SetParaCadastroDTO } from "@/lib/dominio/tipos-cliente";
import { textoDaRecusa } from "@/app/_componentes/recusa";
import { nomeSugeridoDoSet } from "@/lib/dominio/grupos-colecao";

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

export default function NovaColecaoPage({ setInicial = "" }: { setInicial?: string }) {
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

  // O grupo é opcional (a coleção nasce no fim dele); sem grupo cadastrado o
  // campo nem aparece, para quem não usa grupos não ver nada novo.
  const [grupos, setGrupos] = useState<GrupoColecaoDTO[]>([]);
  const [grupoId, setGrupoId] = useState("");

  // O set que a sugestão pediu (`?set=`) e não está no catálogo ocidental. Guarda o
  // fato, não o texto: a frase sai da língua de agora, na renderização.
  const [setNaoEncontrado, setSetNaoEncontrado] = useState(false);
  // Vindo de uma sugestão, o formulário fica desligado até o set resolver:
  // `carregando` (lendo o catálogo), `falhou` (a leitura caiu: tentar de novo
  // ou seguir sem a sugestão) e `livre` (resolvido, ou sem `?set=`). Sem isso,
  // a pessoa começava a digitar e a resposta lenta trocava tipo e receita por
  // baixo dela, ou era descartada e deixava a Pokédex marcada.
  const [prefill, setPrefill] = useState<"carregando" | "falhou" | "livre">(setInicial === "" ? "livre" : "carregando");
  const [tentativaPrefill, setTentativaPrefill] = useState(0);

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [detalhesErro, setDetalhesErro] = useState<string[]>([]);

  // Relê os grupos. Se o escolhido já não existe (outra aba o excluiu), a
  // escolha volta a "sem grupo", e o resto do formulário fica como está.
  const lerGrupos = useCallback(
    () =>
      fetch("/api/colecoes")
        .then((r) => (r.ok ? r.json() : null))
        .then((d: Partial<ListaColecoesDTO> | null) => {
          if (!d || !Array.isArray(d.grupos)) return;
          const lidos = d.grupos;
          setGrupos(lidos);
          setGrupoId((atual) => (lidos.some((g) => g.id === atual) ? atual : ""));
        })
        .catch(() => {}),
    [],
  );

  useEffect(() => {
    void lerGrupos();
  }, [lerGrupos]);

  // Vindo de uma sugestão de set: o formulário nasce como a sugestão promete
  // — tipo set, esse set, catálogo pt, sem secretas, nome `AAAA - SIGLA - Nome`.
  // O parâmetro da URL não é confiável: só vale se for o id de um set da lista
  // do catálogo (pt ou en; o japonês é outro catálogo). Um set que não está lá
  // é uma resposta (aviso e formulário normal); uma leitura que cai não é, e
  // fica `falhou`. A resposta só vale se ainda é a do `?set=` atual (`ativo`,
  // que o cleanup apaga). Roda uma vez por valor de `?set=` (e a cada "Tentar
  // de novo"): nada aqui depende da língua — o nome padrão é o do catálogo e o
  // aviso é texto de renderização —, então trocar PT/EN depois de editar não
  // refaz o prefill nem toca num campo que a pessoa mexeu.
  useEffect(() => {
    if (setInicial === "") return;
    let ativo = true;
    fetch("/api/sets")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("sets"))))
      .then((d: { sets?: SetParaCadastroDTO[] } | null) => {
        if (!ativo) return;
        const achado = (d?.sets ?? []).find((s) => s.setId === setInicial && s.idiomaCatalogo !== "jp");
        if (!achado) {
          setSetNaoEncontrado(true);
        } else {
          setSetNaoEncontrado(false);
          setTipo("set");
          setSetsEscolhidos([achado]);
          setIdiomaCatalogo("pt");
          setIncluirSecretas(false);
          setNome(nomeSugeridoDoSet({ lancamento: achado.setLancamento, sigla: achado.setSigla, nome: achado.setNome }));
        }
        setPrefill("livre");
      })
      .catch(() => {
        if (ativo) setPrefill("falhou");
      });
    return () => {
      ativo = false;
    };
  }, [setInicial, tentativaPrefill]);

  function tentarPrefillDeNovo() {
    setPrefill("carregando");
    setTentativaPrefill((n) => n + 1);
  }

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
          grupoId: grupoId || null,
        }),
      });
      const dados = await resp.json();
      if (!resp.ok) {
        setErro(textoDaRecusa(tr, dados, t("erroCriar")));
        setDetalhesErro(dados.detalhes ?? []);
        // A recusa pode ser do grupo (excluído em outra aba): relê a lista.
        if (grupoId) await lerGrupos();
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

      {setNaoEncontrado && <Alerta tom="aviso">{t("setDaSugestaoNaoEncontrado")}</Alerta>}

      {prefill === "carregando" && <p className="text-sm text-muted">{t("carregandoSugestao")}</p>}
      {prefill === "falhou" && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-danger">
          <p>{t("erroSugestao")}</p>
          <Botao type="button" tamanho="sm" onClick={tentarPrefillDeNovo}>
            {t("tentarDeNovo")}
          </Botao>
          <Botao type="button" tamanho="sm" onClick={() => setPrefill("livre")}>
            {t("continuarSemSugestao")}
          </Botao>
        </div>
      )}

      <form onSubmit={enviar} className="flex flex-col gap-4">
        {/* Desligado enquanto o set da sugestão não resolve (ver `prefill`). */}
        <fieldset disabled={prefill !== "livre"} className="flex min-w-0 flex-col gap-4 border-0 p-0">
        <Campo rotulo={t("campoNome")}>
          <input value={nome} onChange={(e) => setNome(e.target.value)} required className={classesEntrada} />
        </Campo>

        <fieldset className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
          <legend className="px-2 text-[13px] font-bold text-strong">{t("tipo")}</legend>
          <div className="flex flex-wrap gap-4 text-sm max-md:gap-x-6 max-md:gap-y-2">
            {TIPOS.map((valor) => (
              <label key={valor} className="flex items-center gap-1 max-md:min-h-11 max-md:gap-2">
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
            <div className="flex gap-4 text-sm max-md:flex-wrap max-md:gap-x-6 max-md:gap-y-2">
              <label className="flex items-center gap-1 max-md:min-h-11 max-md:gap-2">
                <input
                  type="radio"
                  name="escopo"
                  checked={escopo === "nacional"}
                  onChange={() => setEscopo("nacional")}
                />
                {t("escopoNacional")}
              </label>
              <label className="flex items-center gap-1 max-md:min-h-11 max-md:gap-2">
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
              <ul className="flex flex-col gap-1 max-md:gap-2">
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
                      className="text-xs text-muted hover:text-danger max-md:min-h-11 max-md:px-2"
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
                <label className="flex items-center gap-2 text-sm max-md:min-h-11">
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

        {grupos.length > 0 && (
          <Campo rotulo={t("campoGrupo")}>
            <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)} className={`max-w-xs ${classesEntrada}`}>
              <option value="">{t("semGrupo")}</option>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome}
                </option>
              ))}
            </select>
          </Campo>
        )}

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
        </fieldset>
      </form>
    </main>
  );
}
