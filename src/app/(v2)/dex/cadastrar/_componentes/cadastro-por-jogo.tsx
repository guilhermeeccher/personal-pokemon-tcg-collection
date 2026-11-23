"use client";

/**
 * `/dex/cadastrar` na v2 (pacote 5c): o cadastro por jogo da Living Dex — o
 * "por set" das cartas aplicado à Dex. Escolhe o jogo, a lista traz as formas
 * em ordem de nome, e cada uma recebe a quantidade normal e a shiny. Um botão
 * grava tudo; cada Pokémon vira um registro, nascido no jogo e ainda nele.
 * Portado da v1 (`(v1)/v1/dex/cadastrar/cadastro-por-jogo.tsx`), nunca
 * importado de lá; a conta do lote está em `lote-dex.ts`, pura e testada.
 *
 * - **O lote é o da v1**: o mesmo `POST /api/dex/registros` com
 *   `{ jogoId, itens: [{ formaId, normal, shiny }] }`. Uma recusa recusa o
 *   lote todo e nada é gravado (AGENTS.md, "Records come in by game, in
 *   batches"); a tela lista as recusas, mantém o lote e relê a página (um jogo
 *   parado em outra aba some da lista).
 * - **O HOME é oferecido sempre, depois dos jogos possuídos**: o que nasceu ou
 *   chegou pelo próprio HOME, gravado com origem e local `home`. Não tem
 *   catálogo, então mostra todas as formas.
 * - **O catálogo do jogo é o filtro padrão, não uma recusa** ("Mostrar
 *   todas" abre o resto); troca, evento, checkpoint ainda trancado e "não vai
 *   ao HOME" **marcam, nunca recusam** — o Pokémon pode ter vindo de fora.
 * - **`?jogo=` e `?busca=`** como na v1: o fim de uma tarefa de plano chega
 *   com o jogo dela, a Pokédex e a visão geral com o número.
 * - **A lista é a `GradeVirtual`** (regra 13 de `docs/design-v2/rules.md`):
 *   com o HOME são ~1.220 formas, e na v1 um toque no stepper custava ~310 ms
 *   sem virtualizar (iPhone, CPU 4×). Acima do limiar ela monta só a faixa à
 *   vista; o limiar é desta lista (`LIMIAR_CADASTRO`), e a medição contra o
 *   orçamento está na regra 39. A linha com foco e
 *   as vizinhas ficam montadas (`manterMontadas`): rolar com o teclado do
 *   iPhone aberto não tira o campo da página, e o Enter acha a próxima.
 * - **O lote mora aqui, por forma**: trocar de jogo, de vista ou de filtro não
 *   apaga o que se digitou, e a barra diz quantas formas do lote estão fora da
 *   lista à vista — elas vão junto no cadastro, como na v1.
 */

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";

import { useRotuloForma } from "@/app/_comum/dex/use-rotulo-forma";
import { textosDasRecusas } from "@/app/_comum/recusa";
import { catalogoDoJogo } from "@/lib/dominio/dex-disponibilidade";
import type { TrilhaDex, VistaDex } from "@/lib/dominio/dex-grade";
import { ORIGEM_HOME } from "@/lib/dominio/dex-jogos";
import type { SecoesContadas } from "@/lib/dominio/dex-secoes";
import type { IdiomaTrofeu } from "@/lib/dominio/dex-trofeus";
import type { FormaDexDTO, JogoPossuidoDTO, TrofeuDexDTO } from "@/lib/dominio/tipos-cliente";

import { type ControleGradeVirtual, GradeVirtual, type PropsCelula } from "../../../_componentes/grade/grade-virtual";
import { useAviso } from "../../../_componentes/primitivos/aviso-flutuante";
import { Botao, BotaoLink } from "../../../_componentes/primitivos/botao";
import { Campo } from "../../../_componentes/primitivos/campo";
import { AvisoEmLinha } from "../../../_componentes/primitivos/painel";
import { Segmentado } from "../../../_componentes/primitivos/segmentado";
import { type DadosCartaoPokemon, FolhaPokemon } from "../../_componentes/cartao-pokemon";

import estilos from "./cadastro.module.css";
import {
  ALTURA_CELULA,
  ATRIBUTO_FORMA,
  ATRIBUTO_QUANTIDADE,
  CelulaForma,
  numeroDexTexto,
  textoTenho,
  useTextoSelo,
} from "./celula-forma";
import {
  comQuantidade,
  corpoDoLote,
  formasVisiveis,
  jogoAtual,
  jogoEscolhido,
  lerRespostaCadastro,
  marcadasForaDaVista,
  type QuantidadesDex,
  rotulosTrancadas,
  selosDaForma,
  type TenhoDex,
  totalDoLote,
} from "./lote-dex";

/** A largura mínima de uma célula: uma coluna no celular, duas ou três conforme a largura. */
const MIN_CELULA = 300;
const VAO = 10;
/*
 * Quantas formas a lista monta inteira antes de virtualizar. Não é o 300 da
 * grade de cartas: uma forma aqui custa ~21 nós (nome, marcas e dois
 * steppers), contra ~8 de uma carta, e o orçamento da regra 13 é de ~2.500
 * nós por grade. Medido em 2026-11-23 (regra 39 de `rules.md`): 68 formas
 * montadas davam 1.572 nós, 171 davam 3.579, 253 (o catálogo do FireRed)
 * 5.269; o toque ficou abaixo de 100 ms em todos, então é a conta de nós que
 * decide. Com 100, a lista inteira cabe em ~2.250 nós; acima, ~500 em
 * qualquer tamanho.
 */
const LIMIAR_CADASTRO = 100;

/** O que aparece acima da barra depois de um envio que não gravou com certeza. */
type Resultado = { tipo: "recusado"; textos: string[] } | { tipo: "incerto" };

const chaveDaForma = (f: FormaDexDTO) => f.id;

/** O id da forma da célula que contém o elemento, ou nulo. */
function formaDoElemento(alvo: EventTarget | null): string | null {
  if (!(alvo instanceof Element)) return null;
  return alvo.closest<HTMLElement>(`[${ATRIBUTO_FORMA}]`)?.getAttribute(ATRIBUTO_FORMA) ?? null;
}

export function CadastroPorJogo({
  formas,
  jogos,
  tenho,
  secoes,
  checkpoints,
  buscaInicial,
  jogoInicial,
}: {
  /** O catálogo inteiro, em ordem de nome (`compararPorNome`). */
  formas: FormaDexDTO[];
  /** Os jogos possuídos e ativos. */
  jogos: JogoPossuidoDTO[];
  tenho: TenhoDex;
  secoes: SecoesContadas;
  /** Troféus-checkpoint ainda não conquistados. */
  checkpoints: TrofeuDexDTO[];
  buscaInicial: string;
  jogoInicial: string;
}) {
  const t = useTranslations("v2DexCadastrar");
  const td = useTranslations("dex");
  const tr = useTranslations("recusas");
  const router = useRouter();
  const avisar = useAviso();
  const idioma = useLocale() as IdiomaTrofeu;
  const rotulo = useRotuloForma(formas);
  const textoSelo = useTextoSelo();

  const opcoes = useMemo(
    () => [...jogos.map((j) => ({ id: j.jogoId, nome: j.nome })), { id: ORIGEM_HOME, nome: td("cadastrar.home") }],
    [jogos, td],
  );
  // Na abertura, um `?jogo=` que não é possuído cai na primeira opção, como
  // na v1. Depois, um jogo que sai da lista (parado em outra aba, relido após
  // uma recusa) deixa a tela sem jogo, nunca com outro (`jogoAtual`).
  const [jogoPedido, setJogoPedido] = useState(() => jogoEscolhido(opcoes, jogoInicial));
  const jogoId = jogoAtual(opcoes, jogoPedido);
  const nomeJogo = (jogoId && opcoes.find((o) => o.id === jogoId)?.nome) ?? "";

  const [busca, setBusca] = useState(buscaInicial);
  const [soQueNaoTenho, setSoQueNaoTenho] = useState(false);
  const [vista, setVista] = useState<VistaDex>("principal");
  const [mostrarTodas, setMostrarTodas] = useState(false);
  const [quantidades, setQuantidades] = useState<QuantidadesDex>({});
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [foco, setFoco] = useState<string | null>(null);
  const [, iniciarReleitura] = useTransition();

  const lista = useRef<HTMLDivElement>(null);
  const controle = useRef<ControleGradeVirtual>(null);
  const botaoCadastrar = useRef<HTMLButtonElement>(null);
  // A forma que abriu o cartão, guardada à parte: ao fechar, `aberta` já é
  // nulo, e o foco volta ao botão do nome dela pela grade.
  const ultimaAberta = useRef<string | null>(null);

  const catalogo = useMemo(() => (jogoId ? catalogoDoJogo(jogoId, formas) : null), [jogoId, formas]);
  const trancadas = useMemo(
    () => (jogoId ? rotulosTrancadas(checkpoints, jogoId, idioma) : new Map<number, string>()),
    [checkpoints, jogoId, idioma],
  );

  const visiveis = useMemo(
    () => formasVisiveis(formas, { vista, busca, secoes, catalogo, mostrarTodas, soQueNaoTenho, tenho }),
    [formas, vista, busca, secoes, catalogo, mostrarTodas, soQueNaoTenho, tenho],
  );
  const total = totalDoLote(quantidades);
  const foraDaVista = useMemo(() => marcadasForaDaVista(quantidades, visiveis), [quantidades, visiveis]);
  const porId = useMemo(() => new Map(formas.map((f) => [f.id, f])), [formas]);

  /* ---------- Edição ---------- */

  const aoMudar = useCallback((formaId: string, trilha: TrilhaDex, valor: number) => {
    setQuantidades((atual) => comQuantidade(atual, formaId, trilha, valor));
  }, []);

  // A ordem à vista mais recente, para o Enter não refazer o callback de toda célula.
  const ordem = useRef<readonly string[]>([]);
  useLayoutEffect(() => {
    ordem.current = visiveis.map((f) => f.id);
  });

  /*
   * Enter vai ao mesmo campo da forma seguinte; na última, ao "Cadastrar". O
   * foco é posto na hora quando ela já está montada (o caso de sempre: a
   * vizinha da linha com foco fica montada), para o teclado do iPhone não
   * fechar entre uma forma e outra; só uma forma fora da faixa espera a
   * grade montá-la.
   */
  const aoEnter = useCallback((formaId: string, trilha: TrilhaDex) => {
    const i = ordem.current.indexOf(formaId);
    const proxima = i === -1 ? undefined : ordem.current[i + 1];
    if (!proxima) {
      botaoCadastrar.current?.focus();
      return;
    }
    const seletor = `[${ATRIBUTO_QUANTIDADE}="${CSS.escape(`${proxima}:${trilha}`)}"]`;
    const focar = (el: HTMLElement | null | undefined) => {
      if (!el) return;
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "nearest" });
    };
    const montado = lista.current?.querySelector<HTMLElement>(seletor);
    if (montado) focar(montado);
    else
      void controle.current
        ?.elementoDe(proxima)
        .then((el) => focar(el?.closest<HTMLElement>(`[${ATRIBUTO_FORMA}]`)?.querySelector<HTMLElement>(seletor)));
  }, []);

  const aoAbrir = useCallback((formaId: string) => {
    ultimaAberta.current = formaId;
    setAberta(formaId);
  }, []);
  const devolverFoco = useCallback(
    () => (ultimaAberta.current ? (controle.current?.elementoDe(ultimaAberta.current) ?? null) : null),
    [],
  );

  // A linha com foco e as vizinhas ficam montadas fora da faixa, e a que abriu o cartão também.
  const manterMontadas = useMemo(() => {
    const chaves = new Set<string>();
    if (foco) {
      const i = visiveis.findIndex((f) => f.id === foco);
      for (const j of [i - 1, i, i + 1]) if (i !== -1 && visiveis[j]) chaves.add(visiveis[j].id);
    }
    if (aberta) chaves.add(aberta);
    return [...chaves];
  }, [foco, aberta, visiveis]);

  const renderizar = useCallback(
    (f: FormaDexDTO, celula: PropsCelula) => (
      <CelulaForma
        forma={f}
        rotulo={rotulo.forma(f)}
        nome={rotulo.nome(f)}
        catalogo={catalogo}
        trancadas={trancadas}
        normal={quantidades[f.id]?.normal ?? 0}
        shiny={quantidades[f.id]?.shiny ?? 0}
        tenhoNormal={tenho[f.id]?.normal ?? 0}
        tenhoShiny={tenho[f.id]?.shiny ?? 0}
        celula={celula}
        aoMudar={aoMudar}
        aoEnter={aoEnter}
        aoAbrir={aoAbrir}
      />
    ),
    [rotulo, catalogo, trancadas, quantidades, tenho, aoMudar, aoEnter, aoAbrir],
  );

  /* ---------- Gravação ---------- */

  const reler = useCallback(() => iniciarReleitura(() => router.refresh()), [router]);

  async function cadastrar() {
    if (total === 0 || enviando || !jogoId) return;
    const corpo = corpoDoLote(jogoId, quantidades);
    const nome = nomeJogo;
    setEnviando(true);
    setResultado(null);
    try {
      let resp: Response;
      try {
        resp = await fetch("/api/dex/registros", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
        });
      } catch {
        // Sem resposta: o lote pode ter entrado. Mantém o lote, relê o
        // "tenho" e diz para conferir, em vez de convidar a cadastrar duas vezes.
        setResultado({ tipo: "incerto" });
        reler();
        return;
      }
      const lido: unknown = await resp.json().catch(() => null);
      const r = lerRespostaCadastro(resp.status, lido);
      if (r.tipo === "gravado") {
        avisar(td("cadastrar.cadastrados", { quantidade: String(r.criados), jogo: nome }), { tom: "sucesso" });
        setQuantidades({});
        reler();
      } else if (r.tipo === "recusado") {
        setResultado({ tipo: "recusado", textos: textosDasRecusas(tr, lido, td("cadastrar.erro")) });
        reler();
      } else {
        setResultado({ tipo: "incerto" });
        reler();
      }
    } finally {
      setEnviando(false);
    }
  }

  /* ---------- Cartão ---------- */

  const formaAberta = aberta ? (porId.get(aberta) ?? null) : null;
  const dadosAberta: DadosCartaoPokemon | null = formaAberta
    ? {
        sprite: formaAberta.sprite,
        shiny: false,
        nome: rotulo.nome(formaAberta),
        linhas: [
          numeroDexTexto(formaAberta.numero),
          textoTenho(t, tenho[formaAberta.id]?.normal ?? 0, tenho[formaAberta.id]?.shiny ?? 0) ?? t("nenhumRegistro"),
          t("noJogo", { jogo: nomeJogo }),
          ...selosDaForma(formaAberta, catalogo, trancadas).map(textoSelo),
        ],
      }
    : null;

  /* ---------- Tela ---------- */

  return (
    <div className={estilos.pagina}>
      <header className={estilos.cabecalho}>
        <div>
          <p className={estilos.sobretitulo}>Living Dex</p>
          <h1 className={estilos.titulo}>{td("cadastrar.titulo")}</h1>
          <p className={estilos.subtitulo}>{t("descricao")}</p>
        </div>
        <div className={estilos.acoes}>
          <BotaoLink href="/dex/pokedex" pequeno>
            {t("pokedex")}
          </BotaoLink>
          <BotaoLink href="/dex/jogos" pequeno>
            {td("cadastrar.irParaJogos")}
          </BotaoLink>
        </div>
      </header>

      {/*
        Enquanto o lote vai ao servidor, nada do que o compõe muda: a resposta
        limpa o lote inteiro, e uma quantidade digitada no meio do envio sumiria
        sem ter sido gravada. `inert` tira os controles do toque, do teclado e
        do leitor de tela até a resposta.
      */}
      <div className={estilos.editavel} inert={enviando}>
        <section className={estilos.filtros} aria-label={t("filtros")}>
          <div className={estilos.chips} role="group" aria-label={td("cadastrar.jogo")}>
            {opcoes.map((o) => (
              <button
                key={o.id}
                type="button"
                className={estilos.chip}
                data-ativo={jogoId === o.id || undefined}
                aria-pressed={jogoId === o.id}
                onClick={() => setJogoPedido(o.id)}
              >
                {o.nome}
              </button>
            ))}
          </div>
          {jogos.length === 0 && (
            <AvisoEmLinha
              acao={
                <BotaoLink href="/dex/jogos" pequeno>
                  {td("cadastrar.irParaJogos")}
                </BotaoLink>
              }
            >
              {t("semJogos")}
            </AvisoEmLinha>
          )}

          <div className={estilos.linhaFiltros}>
            <Segmentado
              rotulo={td("vista.rotulo")}
              opcoes={(["principal", "cosmeticas"] as const).map((v) => ({ valor: v, rotulo: td(`vista.${v}`) }))}
              valor={vista}
              aoMudar={setVista}
            />
            <div className={estilos.campoBusca}>
              <Campo
                type="search"
                rotulo={td("cadastrar.filtrar")}
                placeholder={td("cadastrar.placeholderFiltrar")}
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                autoComplete="off"
                enterKeyHint="search"
              />
            </div>
          </div>

          <div className={estilos.chips}>
            <button
              type="button"
              className={estilos.chip}
              data-ativo={soQueNaoTenho || undefined}
              aria-pressed={soQueNaoTenho}
              onClick={() => setSoQueNaoTenho((v) => !v)}
            >
              {td("cadastrar.soQueNaoTenho")}
            </button>
            {catalogo ? (
              <button
                type="button"
                className={estilos.chip}
                data-ativo={mostrarTodas || undefined}
                aria-pressed={mostrarTodas}
                onClick={() => setMostrarTodas((v) => !v)}
              >
                {td("cadastrar.mostrarTodas")}
              </button>
            ) : null}
          </div>
          {jogoId === null && (
            <AvisoEmLinha tom="alerta" papel="alert">
              {t("jogoSaiu")}
            </AvisoEmLinha>
          )}
          <p className={estilos.nota} role="status">
            {jogoId === null
              ? t("exibindo", { total: visiveis.length })
              : catalogo
              ? t(mostrarTodas ? "catalogoTodas" : "catalogoDoJogo", { jogo: nomeJogo, total: visiveis.length })
              : `${td(jogoId === ORIGEM_HOME ? "cadastrar.direto" : "cadastrar.semCatalogo")} ${t("exibindo", { total: visiveis.length })}`}
          </p>
        </section>

        <div
          ref={lista}
          onFocus={(e) => setFoco(formaDoElemento(e.target))}
          onBlur={(e) => {
            // O foco que sai para fora da lista solta a linha; o que anda dentro dela, não.
            if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
            setFoco(null);
          }}
        >
          {formas.length === 0 ? (
            <AvisoEmLinha>{td("pokedex.catalogoVazio")}</AvisoEmLinha>
          ) : visiveis.length === 0 ? (
            <AvisoEmLinha>{td("cadastrar.nada")}</AvisoEmLinha>
          ) : (
            <GradeVirtual
              ref={controle}
              itens={visiveis}
              chaveDe={chaveDaForma}
              renderizar={renderizar}
              minCelula={MIN_CELULA}
              vaoX={VAO}
              vaoY={VAO}
              proporcao={0}
              alturaExtra={ALTURA_CELULA}
              limiar={LIMIAR_CADASTRO}
              manterMontadas={manterMontadas}
              rotulo={jogoId ? t("lista", { jogo: nomeJogo }) : t("listaSemJogo")}
            />
          )}
        </div>
      </div>

      <div className={estilos.rodape}>
        {resultado ? (
          <div className={estilos.resultado}>
            {resultado.tipo === "recusado" ? (
              <AvisoEmLinha
                tom="perigo"
                papel="alert"
                titulo={t("resultado.recusado")}
                acao={
                  <Botao pequeno onClick={() => setResultado(null)}>
                    {t("resultado.fechar")}
                  </Botao>
                }
              >
                <ul className={estilos.recusas}>
                  {resultado.textos.map((texto) => (
                    <li key={texto}>{texto}</li>
                  ))}
                </ul>
                {t("resultado.tudoOuNada")}
              </AvisoEmLinha>
            ) : (
              <AvisoEmLinha
                tom="alerta"
                papel="alert"
                titulo={t("resultado.incerto")}
                acao={
                  <Botao pequeno onClick={() => setResultado(null)}>
                    {t("resultado.fechar")}
                  </Botao>
                }
              >
                {t("resultado.incertoTexto")}
              </AvisoEmLinha>
            )}
          </div>
        ) : null}
        <div className={`${estilos.barra} v2-painel-flutuante`} role="region" aria-label={t("barra.rotulo")}>
          <span className={estilos.barraTexto} data-vazio={total === 0 || undefined} aria-live="polite">
            {total === 0
              ? t("barra.nada")
              : jogoId
                ? t("barra.total", { total, jogo: nomeJogo })
                : t("barra.semJogo", { total })}
            {foraDaVista > 0 ? <span className={estilos.barraFora}>{t("barra.fora", { total: foraDaVista })}</span> : null}
          </span>
          <span className={estilos.barraAcoes}>
            {total > 0 ? (
              <Botao pequeno disabled={enviando} onClick={() => setQuantidades({})}>
                {td("cadastrar.limpar")}
              </Botao>
            ) : null}
            <Botao
              ref={botaoCadastrar}
              variante="primario"
              carregando={enviando}
              disabled={total === 0 || jogoId === null}
              onClick={() => void cadastrar()}
            >
              {td("cadastrar.cadastrar", { quantidade: String(total) })}
            </Botao>
          </span>
        </div>
      </div>

      <FolhaPokemon dados={dadosAberta} onFechar={() => setAberta(null)} devolverFocoPara={devolverFoco} />
    </div>
  );
}
