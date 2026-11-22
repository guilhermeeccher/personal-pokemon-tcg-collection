"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import { textoDaRecusa } from "@/app/_comum/recusa";
import { IDIOMAS, type Idioma } from "@/lib/dominio/enums";
import { FAIXA_REGIAO, NOME_REGIAO, REGIOES, type Regiao } from "@/lib/dominio/escopo-pokedex";
import { nomeSugeridoDoSet } from "@/lib/dominio/grupos-colecao";
import type { IdiomaCatalogo } from "@/lib/dominio/idioma-catalogo";
import {
  type EscopoPokedex,
  adicionarSetNaReceita,
  alternarRegiao,
  montarCorpoCriacao,
  removerSetDaReceita,
  resolverSetInicial,
  totaisDeSecretas,
} from "@/lib/dominio/nova-colecao-v2";
import type { TipoColecao } from "@/lib/dominio/parametro-colecao";
import type { GrupoColecaoDTO, ListaColecoesDTO, SetParaCadastroDTO } from "@/lib/dominio/tipos-cliente";

import { Botao } from "../../../_componentes/primitivos/botao";
import { AreaTexto, Campo, Selecao } from "../../../_componentes/primitivos/campo";
import { AvisoEmLinha, Painel } from "../../../_componentes/primitivos/painel";
import { Segmentado } from "../../../_componentes/primitivos/segmentado";
import estilos from "./nova.module.css";
import { SeletorDeSet } from "./seletor-de-set";

const TIPOS: readonly TipoColecao[] = ["pokedex", "set", "customizada"];

/** Vindo de uma sugestão o formulário fica desligado até o set resolver (ver `prefill`). */
type EstadoPrefill = "carregando" | "falhou" | "livre";

/**
 * Nova coleção, o mesmo fluxo da v1 sobre o mesmo caminho de criação
 * (`POST /api/colecoes`): tipo, escopo da Pokédex ou receita de sets, idioma
 * preferido do catálogo, secretas, idioma exigido, grupo e notas. Depois de
 * criada, abre a coleção. As vagas nascem vazias e a alocação de cada uma é
 * sempre do usuário (regras 5 e 6).
 *
 * - **A receita de um set é a lista de sets, na ordem escolhida.** O idioma do
 *   catálogo é uma preferência por carta, não um filtro (pt completa com en
 *   onde falta); por isso pt é o padrão de todo set ocidental.
 * - **Vindo de uma sugestão (`?set=`)** o formulário nasce como ela promete —
 *   tipo set, esse set, catálogo pt, sem secretas, nome `AAAA - SIGLA - Nome` —
 *   e fica desligado até o set resolver. O texto da URL não é confiável: só vale
 *   se for o id de um set da lista ocidental do catálogo
 *   (`resolverSetInicial`). Um set que não está lá é uma resposta (aviso e
 *   formulário normal); uma leitura que cai não é, e fica `falhou`, com "Tentar
 *   de novo" ou "Continuar sem a sugestão". Sem isso, uma resposta lenta trocava
 *   tipo e receita por baixo de quem já estava digitando.
 * - **O grupo é opcional** e a coleção nasce no fim dele; sem nenhum grupo
 *   cadastrado o campo nem aparece.
 */
export function NovaColecao({ setInicial = "" }: { setInicial?: string }) {
  const t = useTranslations("v2Colecoes.formulario");
  const tr = useTranslations("recusas");
  const router = useRouter();

  const [tipo, setTipo] = useState<TipoColecao>("pokedex");
  const [nome, setNome] = useState("");
  const [idiomaExigido, setIdiomaExigido] = useState<Idioma | "">("");
  const [notas, setNotas] = useState("");

  const [escopo, setEscopo] = useState<EscopoPokedex>("nacional");
  const [regioes, setRegioes] = useState<Regiao[]>([]);

  const [sets, setSets] = useState<SetParaCadastroDTO[]>([]);
  const [idiomaCatalogo, setIdiomaCatalogo] = useState<IdiomaCatalogo>("pt");
  const [incluirSecretas, setIncluirSecretas] = useState(false);

  const [grupos, setGrupos] = useState<GrupoColecaoDTO[]>([]);
  const [grupoId, setGrupoId] = useState("");

  // Guarda o fato, não o texto: a frase sai do idioma de agora, na renderização.
  const [setNaoEncontrado, setSetNaoEncontrado] = useState(false);
  const [prefill, setPrefill] = useState<EstadoPrefill>(setInicial === "" ? "livre" : "carregando");
  const [tentativaPrefill, setTentativaPrefill] = useState(0);

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [detalhesErro, setDetalhesErro] = useState<string[]>([]);

  // Relê os grupos. Se o escolhido já não existe (outra aba o excluiu), a
  // escolha volta a "sem grupo" e o resto do formulário fica como está.
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

  // Roda uma vez por `?set=` (e a cada "Tentar de novo"). Nada aqui depende do
  // idioma da interface — o nome padrão é o do catálogo e o aviso é texto de
  // renderização —, então trocar pt/en depois de editar não refaz o prefill
  // nem toca num campo que a pessoa mexeu. `ativo` descarta a resposta de um
  // `?set=` que já não é o atual.
  useEffect(() => {
    if (setInicial === "") return;
    let ativo = true;
    fetch("/api/sets")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("sets"))))
      .then((d: { sets?: SetParaCadastroDTO[] } | null) => {
        if (!ativo) return;
        const achado = resolverSetInicial(d?.sets ?? [], setInicial);
        if (!achado) {
          setSetNaoEncontrado(true);
        } else {
          setSetNaoEncontrado(false);
          setTipo("set");
          setSets([achado]);
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

  function escolherSet(set: SetParaCadastroDTO) {
    setSets((atuais) => adicionarSetNaReceita(atuais, set));
    // O idioma é a PREFERÊNCIA da coleção: a ficha é escolhida carta a carta, e
    // pt completa com en onde falta. Por isso pt é o padrão mesmo sem nenhuma
    // carta em pt hoje — quando o upstream traduzir, a coleção passa a mostrar os
    // nomes em português sem ser recriada.
    setIdiomaCatalogo("pt");
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setDetalhesErro([]);

    const montado = montarCorpoCriacao({
      tipo,
      nome,
      idiomaExigido,
      notas,
      grupoId,
      escopo,
      regioes,
      sets,
      idiomaCatalogo,
      incluirSecretas,
    });
    if (!montado.ok) {
      setErro(t(montado.erro === "regiao" ? "erroRegiao" : "erroExpansao"));
      return;
    }

    setEnviando(true);
    try {
      const resp = await fetch("/api/colecoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(montado.corpo),
      });
      const dados = (await resp.json().catch(() => null)) as {
        id?: unknown;
        detalhes?: unknown;
      } | null;
      if (!resp.ok || typeof dados?.id !== "string") {
        setErro(textoDaRecusa(tr, dados, t("erroCriar")));
        setDetalhesErro(Array.isArray(dados?.detalhes) ? dados.detalhes.filter((d): d is string => typeof d === "string") : []);
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

  const secretas = totaisDeSecretas(sets);

  return (
    <div className={estilos.pagina}>
      <Link href="/colecoes" className={estilos.voltar}>
        <ChevronLeft aria-hidden />
        {t("voltar")}
      </Link>

      <header>
        <h1 className={estilos.titulo}>{t("titulo")}</h1>
        <p className={estilos.descricao}>{t("descricao")}</p>
      </header>

      {setNaoEncontrado && (
        <AvisoEmLinha tom="alerta" papel="status">
          {t("setDaSugestaoNaoEncontrado")}
        </AvisoEmLinha>
      )}
      {prefill === "carregando" && (
        <AvisoEmLinha tom="iris" papel="status">
          {t("carregandoSugestao")}
        </AvisoEmLinha>
      )}
      {prefill === "falhou" && (
        <AvisoEmLinha
          tom="perigo"
          papel="alert"
          acao={
            <div className={estilos.sugestao}>
              <Botao pequeno onClick={tentarPrefillDeNovo}>
                {t("tentarDeNovo")}
              </Botao>
              <Botao pequeno variante="fantasma" onClick={() => setPrefill("livre")}>
                {t("continuarSemSugestao")}
              </Botao>
            </div>
          }
        >
          {t("erroSugestao")}
        </AvisoEmLinha>
      )}

      <form onSubmit={enviar} className={estilos.formulario}>
        <fieldset disabled={prefill !== "livre"} className={estilos.bloco}>
          <Campo
            rotulo={t("campoNome")}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            autoComplete="off"
            enterKeyHint="done"
          />

          <Painel as="fieldset" className={estilos.secao}>
            <legend className={estilos.legenda}>{t("tipo")}</legend>
            <Segmentado
              rotulo={t("tipo")}
              valor={tipo}
              aoMudar={setTipo}
              largo
              opcoes={TIPOS.map((valor) => ({ valor, rotulo: t(`tipos.${valor}`) }))}
            />
          </Painel>

          {tipo === "pokedex" && (
            <Painel as="fieldset" className={estilos.secao}>
              <legend className={estilos.legenda}>{t("escopo")}</legend>
              <Segmentado
                rotulo={t("escopo")}
                valor={escopo}
                aoMudar={setEscopo}
                largo
                opcoes={[
                  { valor: "nacional", rotulo: t("escopoNacional") },
                  { valor: "regioes", rotulo: t("escopoRegioes") },
                ]}
              />
              {escopo === "nacional" ? (
                <p className={estilos.ajuda}>{t("escopoNacionalAjuda")}</p>
              ) : (
                <div role="group" aria-label={t("regioes")} className={estilos.regioes}>
                  {REGIOES.map((regiao) => {
                    const faixa = FAIXA_REGIAO[regiao];
                    return (
                      <button
                        key={regiao}
                        type="button"
                        className={estilos.regiao}
                        aria-pressed={regioes.includes(regiao)}
                        onClick={() => setRegioes((atuais) => alternarRegiao(atuais, regiao))}
                      >
                        {/* Nome de região é nome próprio, igual nos dois idiomas. */}
                        {NOME_REGIAO[regiao]}
                        <span className={estilos.faixa}>
                          {faixa.inicio}–{faixa.fim}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </Painel>
          )}

          {tipo === "set" && (
            <Painel as="fieldset" className={estilos.secao}>
              <legend className={estilos.legenda}>{t("receita")}</legend>
              {sets.length > 0 && (
                <ul className={estilos.receita}>
                  {sets.map((set) => (
                    <li key={set.setId} className={estilos.itemReceita}>
                      <span className={estilos.nomeSet}>
                        {set.setNome} <span className={estilos.idSet}>· {set.setId}</span>
                      </span>
                      <Botao
                        pequeno
                        variante="fantasma"
                        aria-label={t("removerSet", { set: set.setNome })}
                        onClick={() => setSets((atuais) => removerSetDaReceita(atuais, set.setId))}
                      >
                        {t("remover")}
                      </Botao>
                    </li>
                  ))}
                </ul>
              )}
              <SeletorDeSet aoEscolher={escolherSet} />
              {sets.length > 1 && <p className={estilos.ajuda}>{t("ajudaVariosSets")}</p>}
              {sets.length > 0 && (
                <>
                  <Selecao
                    rotulo={t("campoIdiomaCatalogo")}
                    dica={sets.some((s) => !s.temPt) ? `${t("ajudaIdiomaCatalogo")} ${t("semPt")}` : t("ajudaIdiomaCatalogo")}
                    value={idiomaCatalogo}
                    onChange={(e) => setIdiomaCatalogo(e.target.value as IdiomaCatalogo)}
                  >
                    <option value="pt">pt</option>
                    <option value="en">en</option>
                  </Selecao>
                  <label className={estilos.marcar}>
                    <input
                      type="checkbox"
                      checked={incluirSecretas}
                      onChange={(e) => setIncluirSecretas(e.target.checked)}
                    />
                    {t("incluirSecretas", secretas)}
                  </label>
                </>
              )}
            </Painel>
          )}

          <Selecao
            rotulo={t("campoIdiomaExigido")}
            dica={t("ajudaIdiomaExigido")}
            value={idiomaExigido}
            onChange={(e) => setIdiomaExigido(e.target.value as Idioma | "")}
          >
            <option value="">{t("qualquer")}</option>
            {IDIOMAS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </Selecao>

          {grupos.length > 0 && (
            <Selecao rotulo={t("campoGrupo")} value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
              <option value="">{t("semGrupo")}</option>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome}
                </option>
              ))}
            </Selecao>
          )}

          <AreaTexto rotulo={t("campoNotas")} value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />

          {erro && (
            <AvisoEmLinha tom="perigo" papel="alert">
              {erro}
              {detalhesErro.length > 0 && (
                <ul className={estilos.detalhes}>
                  {detalhesErro.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
            </AvisoEmLinha>
          )}

          <div className={estilos.acoes}>
            <Botao type="submit" variante="primario" carregando={enviando}>
              {enviando ? t("criando") : t("criar")}
            </Botao>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
