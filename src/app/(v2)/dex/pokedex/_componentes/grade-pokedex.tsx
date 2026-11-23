"use client";

/**
 * `/dex/pokedex` na v2 (pacote 5a): todas as vagas do HOME, por região, nas
 * duas trilhas. A leitura é a da grade da v1
 * (`(v1)/v1/dex/pokedex/grade-pokedex.tsx`), com as mesmas funções de
 * domínio; só o desenho e o toque mudam.
 *
 * - **Vista e trilha são independentes** (AGENTS.md, "Sections and views"):
 *   a vista principal ou a das cosméticas, a trilha normal ou a shiny, cada
 *   uma com o seu progresso.
 * - **Seções**: regional, gênero e especial ligam e desligam no progresso
 *   (`PATCH /api/dex/secoes`, a única escrita da grade além do "Levar ao
 *   HOME"); ligar ou desligar nunca toca registro, e uma vaga fora da conta
 *   continua na grade, marcada. A base conta sempre, e a explicação abre por
 *   toque e teclado.
 * - **Busca** no nome da espécie e da forma, nos dois idiomas (`forma_pt`,
 *   só o nome oficial), ou pelo número; macho e fêmea rotulados
 *   (`useRotuloForma`).
 * - **Uma vaga tocada abre o cartão do Pokémon** (`FolhaPokemon`): o render
 *   do HOME, o estado, a caixa e a posição, e "Registrar", que leva ao
 *   cadastro com `?busca=` (PKD-04). Na v1 o toque ia direto ao cadastro e o
 *   cartão só abria com o mouse; aqui o cartão é o caminho de toque e de
 *   teclado, e com o mouse ele também aparece ao parar em cima.
 * - **A grade é a `GradeVirtual`** (regra 13 de `docs/design-v2/rules.md`):
 *   abaixo do limiar (300) monta tudo, acima virtualiza com a janela como
 *   rolagem. Uma região tem de 72 a ~250 vagas; "Todas" passa de mil. A
 *   medição contra o orçamento está na regra 13.
 *
 * O catálogo inteiro vem do servidor de uma vez (~1.400 linhas): filtrar é
 * local, sem ida ao banco a cada toque.
 */

import { useTranslations } from "next-intl";
import { useCallback, useId, useMemo, useRef, useState } from "react";

import { useRotuloForma } from "@/app/_comum/dex/use-rotulo-forma";
import { textoDaRecusa } from "@/app/_comum/recusa";
import { montarCaixasDex, posicoesNasCaixas } from "@/lib/dominio/dex-caixas";
import { CATEGORIAS_FORMA_DEX, SECOES_LIGAVEIS, type SecaoLigavel } from "@/lib/dominio/dex-classificacao";
import { type EstadoVagaDex, estadoDaVaga, mapearEstadosDex, progressoDex } from "@/lib/dominio/dex-estado";
import { contarVagasDex, filtrarFormasDex, vistaDaCategoria, type TrilhaDex, type VistaDex } from "@/lib/dominio/dex-grade";
import type { SecoesContadas } from "@/lib/dominio/dex-secoes";
import { NOME_REGIAO, REGIOES, type Regiao } from "@/lib/dominio/escopo-pokedex";
import type { FormaDexDTO, RegistroDexDTO } from "@/lib/dominio/tipos-cliente";

import { BotaoLink } from "../../../_componentes/primitivos/botao";
import { Campo, Selecao } from "../../../_componentes/primitivos/campo";
import { type ControleGradeVirtual, GradeVirtual, type PropsCelula } from "../../../_componentes/grade/grade-virtual";
import { AvisoEmLinha, Painel } from "../../../_componentes/primitivos/painel";
import { Segmentado } from "../../../_componentes/primitivos/segmentado";
import { hrefCadastroDex } from "../../_componentes/caminhos";
import { type DadosCartaoPokemon, FolhaPokemon, useCartaoFlutuante } from "../../_componentes/cartao-pokemon";
import { SpriteDex } from "../../_componentes/sprite-dex";

import { numeroDex, resumoDaCelula, type ResumoCelula } from "./celula-pokedex";
import { LevarAoHome } from "./levar-ao-home";
import estilos from "./pokedex.module.css";

const ESTADOS: readonly EstadoVagaDex[] = ["falta", "no_jogo", "no_home"];
type Categoria = (typeof CATEGORIAS_FORMA_DEX)[number];

/*
 * A célula tem altura fixa (a grade virtual exige células uniformes): o
 * sprite, o número, a espécie, a forma, a caixa e uma linha de selos. A altura
 * é a soma do que o CSS desenha (`.celula` em `pokedex.module.css`); mudar um
 * sem o outro corta a última linha.
 */
const ALTURA_CELULA = 196;
const MIN_CELULA = 100;
const VAO = 8;

const chaveDaForma = (f: FormaDexDTO) => f.id;

export function GradePokedex({
  formas,
  secoesIniciais,
  registros,
  caixasReservadas,
}: {
  formas: FormaDexDTO[];
  secoesIniciais: SecoesContadas;
  registros: RegistroDexDTO[];
  /** Caixas do HOME antes da Nacional 1: desloca o "Caixa N" de cada vaga. */
  caixasReservadas: number;
}) {
  const t = useTranslations("v2Dex.pokedex");
  const td = useTranslations("dex");
  const tr = useTranslations("recusas");
  const rotulo = useRotuloForma(formas);
  const idExplicacao = useId();
  const [secoes, setSecoes] = useState<SecoesContadas>(secoesIniciais);
  const [salvando, setSalvando] = useState<SecaoLigavel | null>(null);
  const [erroSecao, setErroSecao] = useState<string | null>(null);
  const [explicacaoAberta, setExplicacaoAberta] = useState(false);
  const [trilha, setTrilha] = useState<TrilhaDex>("normal");
  const [vista, setVista] = useState<VistaDex>("principal");
  const [regiao, setRegiao] = useState<Regiao | "todas">("kanto");
  const [categoria, setCategoria] = useState<Categoria | "todas">("todas");
  const [busca, setBusca] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<EstadoVagaDex | "todos">("todos");
  const [aberta, setAberta] = useState<FormaDexDTO | null>(null);
  const grade = useRef<ControleGradeVirtual>(null);
  // A última vaga aberta, para o foco voltar a ela ao fechar o cartão mesmo
  // que ela tenha saído do DOM (a grade a rola para dentro e a devolve).
  const ultimaAberta = useRef<string | null>(null);
  const { abrir: preVisao, fechar: fecharPreVisao, cartao } = useCartaoFlutuante();

  const estados = useMemo(() => mapearEstadosDex(registros), [registros]);
  const formasDaVista = useMemo(() => formas.filter((f) => vistaDaCategoria(f.categoria) === vista), [formas, vista]);
  const progresso = useMemo(() => progressoDex(formasDaVista, estados, secoes), [formasDaVista, estados, secoes]);
  const categoriasDaVista = CATEGORIAS_FORMA_DEX.filter((c) => vistaDaCategoria(c) === vista);

  const visiveis = useMemo(
    () =>
      filtrarFormasDex(formas, { vista, regiao, categoria, busca }).filter(
        (f) => filtroEstado === "todos" || estadoDaVaga(estados, f.id, trilha) === filtroEstado,
      ),
    [formas, vista, regiao, categoria, busca, filtroEstado, estados, trilha],
  );
  const totaisVisiveis = useMemo(() => contarVagasDex(visiveis, secoes), [visiveis, secoes]);
  /* Caixa e posição no HOME, na trilha e com as seções de agora (`dex-caixas.ts`). */
  const posicoes = useMemo(
    () => posicoesNasCaixas(montarCaixasDex(formas, trilha, secoes, caixasReservadas)),
    [formas, trilha, secoes, caixasReservadas],
  );

  async function alternarSecao(secao: SecaoLigavel) {
    const conta = !secoes[secao];
    setSalvando(secao);
    setErroSecao(null);
    try {
      const r = await fetch("/api/dex/secoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoria: secao, conta }),
      });
      if (!r.ok) {
        const corpo: unknown = await r.json().catch(() => null);
        setErroSecao(textoDaRecusa(tr, corpo, td("erroSalvarSecao")));
        return;
      }
      setSecoes((atual) => ({ ...atual, [secao]: conta }));
    } catch {
      setErroSecao(td("erroSalvarSecao"));
    } finally {
      setSalvando(null);
    }
  }

  /* O que a célula, o cartão e o leitor de tela dizem de uma vaga. */
  const descrever = useCallback(
    (f: FormaDexDTO, r: ResumoCelula) => {
      const lugar = posicoes.get(f.id);
      const selos = [
        f.categoria !== "base" ? td(`categoria.${f.categoria}`) : null,
        r.semShiny ? td("pokedex.semShiny") : null,
        r.foraDaConta ? td("pokedex.foraDaConta") : null,
      ].filter((x): x is string => x !== null);
      return {
        nome: rotulo.nome(f),
        forma: rotulo.forma(f),
        estado: td(`estado.${r.estado}`),
        lugarLongo: lugar ? t("lugar", { caixa: lugar.caixa, posicao: lugar.posicao }) : null,
        lugarCurto: lugar ? t("lugarCurto", { caixa: lugar.caixa, posicao: lugar.posicao }) : null,
        selos,
      };
    },
    [posicoes, rotulo, t, td],
  );

  const dadosDoCartao = (f: FormaDexDTO, r: ResumoCelula): DadosCartaoPokemon => {
    const d = descrever(f, r);
    return {
      sprite: f.sprite,
      shiny: trilha === "shiny",
      nome: d.nome,
      linhas: [numeroDex(f.numero), d.estado, ...(d.lugarLongo ? [d.lugarLongo] : []), ...d.selos],
    };
  };

  function renderizar(f: FormaDexDTO, celula: PropsCelula) {
    const r = resumoDaCelula(f, trilha, secoes, estados);
    const d = descrever(f, r);
    const dados = dadosDoCartao(f, r);
    const rotuloAcessivel = [d.nome, d.estado, d.lugarLongo, ...d.selos].filter(Boolean).join(" — ");
    return (
      <button
        type="button"
        {...celula}
        className={estilos.celula}
        data-estado={r.estado}
        data-fora={!r.conta || undefined}
        aria-label={rotuloAcessivel}
        aria-haspopup="dialog"
        onPointerEnter={preVisao(dados)}
        onPointerLeave={fecharPreVisao}
        onClick={() => {
          fecharPreVisao();
          ultimaAberta.current = f.id;
          setAberta(f);
        }}
      >
        <SpriteDex sprite={f.sprite} shiny={trilha === "shiny"} tamanho={64} apagado={r.apagado} />
        <span className={`${estilos.numero} v2-num`}>{numeroDex(f.numero)}</span>
        <span className={estilos.especie}>{f.especie}</span>
        <span className={estilos.forma}>{d.forma ?? " "}</span>
        <span className={`${estilos.lugar} v2-num`}>{d.lugarCurto ?? " "}</span>
        <span className={estilos.selos}>
          <span className={estilos.estado} data-estado={r.estado}>
            {d.estado}
          </span>
          {d.selos.map((s) => (
            <span key={s} className={estilos.selo}>
              {s}
            </span>
          ))}
        </span>
      </button>
    );
  }

  const abertaResumo = aberta ? resumoDaCelula(aberta, trilha, secoes, estados) : null;

  return (
    <div className={estilos.pagina}>
      <header className={estilos.cabecalho}>
        <div>
          <p className={estilos.sobretitulo}>Living Dex</p>
          <h1 className={estilos.titulo}>{td("pokedex.titulo")}</h1>
          <p className={estilos.subtitulo}>{t("descricao")}</p>
        </div>
        <div className={estilos.acoes}>
          <BotaoLink href="/dex" pequeno>
            {t("voltarVisaoGeral")}
          </BotaoLink>
        </div>
      </header>

      <LevarAoHome formas={formas} registros={registros} />

      <Painel as="section" className={estilos.painelProgresso} aria-labelledby="pokedex-progresso">
        <div className={estilos.progressoCab}>
          <h2 id="pokedex-progresso" className={estilos.blocoTitulo}>
            {t("progresso")}
          </h2>
          <Segmentado
            rotulo={td("vista.rotulo")}
            pequeno
            opcoes={(["principal", "cosmeticas"] as const).map((v) => ({ valor: v, rotulo: td(`vista.${v}`) }))}
            valor={vista}
            aoMudar={(v) => {
              setVista(v);
              setCategoria("todas");
            }}
          />
        </div>
        <div className={estilos.trilhas}>
          {(["normal", "shiny"] as const).map((tr2) => {
            const p = progresso[tr2];
            const fracao = p.contam > 0 ? Math.min(p.noHome / p.contam, 1) : 0;
            return (
              <div key={tr2} className={estilos.trilha} data-completa={(p.contam > 0 && p.noHome >= p.contam) || undefined}>
                <span className={estilos.rotuloPequeno}>{td(`trilha.${tr2}`)}</span>
                <span className="v2-num">
                  {td("pokedex.progresso", { noHome: String(p.noHome), contam: String(p.contam) })}
                </span>
                <span className={estilos.barra} aria-hidden>
                  <span style={{ width: `${fracao * 100}%` }} />
                </span>
                {p.noJogo > 0 && (
                  <span className={estilos.nota}>{td("pokedex.progressoNoJogo", { noJogo: String(p.noJogo) })}</span>
                )}
              </div>
            );
          })}
        </div>

        {vista === "principal" && (
          <fieldset className={estilos.secoes}>
            <legend className={estilos.legenda}>{td("pokedex.secoesQueContam")}</legend>
            <div className={estilos.chips}>
              <button
                type="button"
                className={estilos.chip}
                data-ativo
                aria-expanded={explicacaoAberta}
                aria-controls={idExplicacao}
                onClick={() => setExplicacaoAberta((v) => !v)}
              >
                {td("categoria.base")}
                <span className={estilos.chipInfo} aria-hidden>
                  {explicacaoAberta ? "−" : "i"}
                </span>
                <span className="v2-so-leitor">{t("porqueBase")}</span>
              </button>
              {SECOES_LIGAVEIS.map((secao) => (
                <button
                  key={secao}
                  type="button"
                  className={estilos.chip}
                  data-ativo={secoes[secao] || undefined}
                  aria-pressed={secoes[secao]}
                  aria-busy={salvando === secao || undefined}
                  disabled={salvando !== null}
                  onClick={() => alternarSecao(secao)}
                >
                  {td(`categoria.${secao}`)}
                </button>
              ))}
            </div>
            <p id={idExplicacao} className={estilos.explicacao} hidden={!explicacaoAberta}>
              {t("baseSempre")}
            </p>
            {erroSecao && (
              <AvisoEmLinha tom="perigo" papel="alert">
                {erroSecao}
              </AvisoEmLinha>
            )}
          </fieldset>
        )}
      </Painel>

      <section className={estilos.filtros} aria-label={t("filtros")}>
        <Segmentado
          rotulo={td("pokedex.trilha")}
          opcoes={(["normal", "shiny"] as const).map((v) => ({ valor: v, rotulo: td(`trilha.${v}`) }))}
          valor={trilha}
          aoMudar={setTrilha}
        />
        <div className={estilos.chips} role="group" aria-label={td("pokedex.regiao")}>
          {(["todas", ...REGIOES] as const).map((opcao) => (
            <button
              key={opcao}
              type="button"
              className={estilos.chip}
              data-ativo={regiao === opcao || undefined}
              aria-pressed={regiao === opcao}
              onClick={() => setRegiao(opcao)}
            >
              {opcao === "todas" ? td("pokedex.todas") : NOME_REGIAO[opcao]}
            </button>
          ))}
        </div>
        <div className={estilos.campos}>
          <Campo
            type="search"
            rotulo={td("pokedex.buscar")}
            placeholder={td("pokedex.placeholderBuscar")}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            autoComplete="off"
            enterKeyHint="search"
          />
          <Selecao
            rotulo={td("pokedex.filtroEstado")}
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value as typeof filtroEstado)}
          >
            <option value="todos">{td("pokedex.todas")}</option>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {td(`estado.${e}`)}
              </option>
            ))}
          </Selecao>
          <Selecao
            rotulo={td("pokedex.secao")}
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as typeof categoria)}
          >
            <option value="todas">{td("pokedex.todas")}</option>
            {categoriasDaVista.map((c) => (
              <option key={c} value={c}>
                {td(`categoria.${c}`)}
              </option>
            ))}
          </Selecao>
        </div>
        <p className={estilos.nota} role="status">
          {td("pokedex.exibindo", { exibidas: String(visiveis.length), contam: String(totaisVisiveis[trilha]) })}
        </p>
      </section>

      {formas.length === 0 ? (
        <AvisoEmLinha>{td("pokedex.catalogoVazio")}</AvisoEmLinha>
      ) : visiveis.length === 0 ? (
        <AvisoEmLinha>{td("pokedex.nadaEncontrado")}</AvisoEmLinha>
      ) : (
        <GradeVirtual
          ref={grade}
          itens={visiveis}
          chaveDe={chaveDaForma}
          minCelula={MIN_CELULA}
          vaoX={VAO}
          vaoY={VAO}
          proporcao={0}
          alturaExtra={ALTURA_CELULA}
          manterMontadas={aberta ? [aberta.id] : undefined}
          rotulo={t("grade")}
          renderizar={(f, celula) => renderizar(f, celula)}
        />
      )}

      <FolhaPokemon
        dados={aberta && abertaResumo ? dadosDoCartao(aberta, abertaResumo) : null}
        onFechar={() => setAberta(null)}
        devolverFocoPara={() => (ultimaAberta.current ? (grade.current?.elementoDe(ultimaAberta.current) ?? null) : null)}
        acoes={
          aberta && (
            <BotaoLink href={hrefCadastroDex(aberta.numero)} variante="primario">
              {td("pokedex.registrarEsta")}
            </BotaoLink>
          )
        }
      />
      {cartao}
    </div>
  );
}
