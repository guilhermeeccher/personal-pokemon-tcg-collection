"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import {
  CONDICOES,
  IDIOMAS,
  VARIANTES_COPIA,
  type Condicao,
  type Idioma,
  type VarianteCopia,
} from "@/lib/dominio/enums";
import { variantesDisponiveis } from "@/lib/dominio/variantes-catalogo";
import { AdicionarImagemLocal } from "@/app/_componentes/adicionar-imagem-local";
import { ehOrigemPropria } from "@/lib/dominio/origem-imagem";
import { Botao, classesBotao } from "@/app/_componentes/botao";
import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { Campo, classesEntrada } from "@/app/_componentes/campo";
import { ChipCondicao } from "@/app/_componentes/ds/chip-condicao";
import { ChipVariante } from "@/app/_componentes/ds/chip-variante";
import { Distintivo } from "@/app/_componentes/distintivo";
import { EstadoVazio } from "@/app/_componentes/estado-vazio";
import { ImagemCartaComZoom } from "@/app/_componentes/imagem-carta-zoom";
import { Modal } from "@/app/_componentes/modal";
import { Painel } from "@/app/_componentes/painel";
import {
  classesCabecalhoComControle,
  classesCelulaCabecalho,
  classesCelulaCabecalhoControle,
  classesCelulaCabecalhoOculta,
  classesCelulaEmpilhada,
  classesLinha,
  classesLinhaCabecalho,
  classesTabelaEmpilhada,
  Tabela,
} from "@/app/_componentes/tabela";
import { useEhMobile } from "@/app/_componentes/use-eh-mobile";
import type { CopiaDoInventarioDTO, DestinoElegivelDaCopiaDTO } from "@/lib/dominio/tipos-cliente";
import { NomeCarta } from "@/app/_componentes/nome-carta";
import { textoDaRecusa } from "@/app/_componentes/recusa";
import { rotuloChaveVaga } from "@/lib/dominio/chave-vaga-set";

interface Opcoes {
  sets: { setId: string; setNome: string }[];
  raridades: string[];
}

interface Filtros {
  set: string;
  idioma: string;
  raridade: string;
  variante: string;
  condicao: string;
  graded: string;
  localizacao: string;
  alocacao: string;
  semImagem: string;
  q: string;
}

const FILTROS_VAZIOS: Filtros = {
  set: "",
  idioma: "",
  raridade: "",
  variante: "",
  condicao: "",
  graded: "",
  localizacao: "",
  alocacao: "",
  semImagem: "",
  q: "",
};

const TAMANHO_PAGINA = 50;

/** Os filtros que, no celular, ficam no painel recolhível — todos menos a busca por nome. */
const FILTROS_DO_PAINEL = (Object.keys(FILTROS_VAZIOS) as (keyof Filtros)[]).filter((chave) => chave !== "q");

/* ------------------------------------------------------------------------
   Linha do inventário no celular (só abaixo de 768px)

   A mesma `<tr>` vira um cartão: à esquerda, uma calha com a caixa de
   seleção e a miniatura; à direita, o resto em linhas — nome, set, os selos
   (quantidade, variante, idioma, condição, graded), a localização, a
   alocação e as ações.

   Por que flex com quebra, e não a grade de `classesLinhaEmpilhada`: os
   selos são cinco células, e na grade cada célula ocupa uma trilha própria
   — virariam cinco linhas de um selo só, um cartão de 194 cópias por página
   comprido demais. Na linha flexível elas correm lado a lado e quebram
   sozinhas; quem precisa de linha própria (nome, set, alocação, ações)
   ganha `basis-full`. A calha é posicionada (`absolute`) e não um item do
   fluxo porque assim o texto da direita começa no topo, ao lado da
   miniatura, em vez de descer para debaixo dela.

   Medidas da calha: a caixa ocupa 0–44px (o `label` de 44 é a área de
   toque), a miniatura 52–96px (a área de toque do zoom tem 44 de largura),
   8px entre as duas; o texto começa em 104px (`pl-[6.5rem]`). As duas
   alinham pelo centro: ambas começam em `top-3` e têm 44 de altura. Embaixo
   o recuo é só de 4px: a última linha são as ações, cuja área de 44 já folga.
   ------------------------------------------------------------------------ */
const classesLinhaCartao =
  "max-md:relative max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-2 max-md:gap-y-1.5 max-md:pt-3 max-md:pr-3 max-md:pb-1 max-md:pl-[6.5rem]";

/** Botão de ação da linha: o desenho de link de sempre, com 44px de área no celular. */
const classesAcaoLinha = "max-md:mr-0 max-md:inline-flex max-md:min-h-11 max-md:min-w-11 max-md:items-center max-md:px-2";

function paraQueryString(filtros: Filtros, pagina: number): string {
  const params = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtros)) {
    if (valor) params.set(chave, valor);
  }
  params.set("pagina", String(pagina));
  params.set("tamanhoPagina", String(TAMANHO_PAGINA));
  return params.toString();
}

export default function InventarioPage() {
  const t = useTranslations("inventario");
  const tm = useTranslations("componentes.mobile");
  const ehMobile = useEhMobile();
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  // Só a visibilidade do painel de filtros no celular. O estado dos filtros
  // continua todo em `filtros`: fechar o painel não limpa nem muda nada.
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [itens, setItens] = useState<CopiaDoInventarioDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [opcoes, setOpcoes] = useState<Opcoes>({ sets: [], raridades: [] });
  // Inicia `true`: a primeira carga é feita pelo efeito de montagem, sem
  // nenhum evento de usuário para disparar um `setCarregando(true)` síncrono
  // (ver comentário no efeito abaixo).
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [editando, setEditando] = useState<CopiaDoInventarioDTO | null>(null);
  const [alocando, setAlocando] = useState<CopiaDoInventarioDTO | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [editandoMassa, setEditandoMassa] = useState(false);

  // Nenhum setState síncrono no corpo desta função — só dentro de
  // then/catch/finally. É o que permite chamá-la a partir de um efeito
  // reagindo a `filtros`/`pagina` sem o eslint-plugin-react-hooks acusar
  // "setState síncrono em efeito": quem quer feedback imediato de
  // "carregando" (troca de filtro, paginação) seta isso no próprio
  // manipulador de evento, antes de mudar `filtros`/`pagina`.
  const carregar = useCallback(() => {
    fetch(`/api/copias?${paraQueryString(filtros, pagina)}`)
      .then((r) => r.json())
      .then((d) => {
        setItens(d.itens ?? []);
        setTotal(d.total ?? 0);
        if (d.opcoes) setOpcoes(d.opcoes);
        setErro(null);
      })
      .catch(() => setErro(t("erroCarregar")))
      .finally(() => setCarregando(false));
  }, [filtros, pagina, t]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Item 1 da visão geral: "clicar para ir ao inventário já filtrado por
  // aquele recorte" — a visão geral e a tela de repetidas linkam pra cá
  // com querystring (`/inventario?set=...`, `?alocacao=livre` etc.), as
  // MESMAS chaves de `Filtros`/`paraQueryString` acima. Lido uma vez, só
  // no cliente, depois da montagem (nunca no corpo do componente): ler
  // `window.location` durante a renderização divergiria entre o HTML do
  // servidor (sem `window`) e a primeira renderização do cliente. Se não
  // houver nenhum parâmetro reconhecido, não mexe em `filtros` — mantém o
  // comportamento de sempre para quem chega pela navegação normal.
  //
  // `setState` só dentro do `.then()` de uma promise resolvida — mesmo
  // motivo do comentário em `carregar` acima: setState síncrono no corpo
  // do efeito é acusado pelo eslint-plugin-react-hooks.
  useEffect(() => {
    Promise.resolve().then(() => {
      const params = new URLSearchParams(window.location.search);
      const chaves = Object.keys(FILTROS_VAZIOS) as (keyof Filtros)[];
      let mudou = false;
      const iniciais: Filtros = { ...FILTROS_VAZIOS };
      for (const chave of chaves) {
        const valor = params.get(chave);
        if (valor) {
          iniciais[chave] = valor;
          mudou = true;
        }
      }
      if (mudou) {
        setCarregando(true);
        setFiltros(iniciais);
        setPagina(1);
      }
    });
  }, []);

  function atualizarFiltro<K extends keyof Filtros>(campo: K, valor: string) {
    setCarregando(true);
    setPagina(1);
    setSelecionados(new Set());
    setFiltros((f) => ({ ...f, [campo]: valor }));
  }

  function irParaPagina(nova: number) {
    setCarregando(true);
    setSelecionados(new Set());
    setPagina(nova);
  }

  function limparFiltros() {
    setCarregando(true);
    setSelecionados(new Set());
    setFiltros(FILTROS_VAZIOS);
    setPagina(1);
  }

  function alternarSelecao(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function alternarSelecaoTodos() {
    setSelecionados((atual) =>
      atual.size === itens.length ? new Set() : new Set(itens.map((i) => i.id)),
    );
  }

  async function remover(copia: CopiaDoInventarioDTO) {
    const confirmado = window.confirm(
      t("confirmarRemover", {
        carta: copia.cartaNome,
        set: copia.setNome,
        numero: copia.cartaLocalId,
      }) + (copia.alocada ? t("confirmarRemoverAlocada") : ""),
    );
    if (!confirmado) return;
    const resp = await fetch(`/api/copias/${copia.id}`, { method: "DELETE" });
    if (resp.ok) {
      setCarregando(true);
      carregar();
    } else {
      setErro(t("erroRemover"));
    }
  }

  async function desalocar(copia: CopiaDoInventarioDTO) {
    if (!copia.vagaId) return;
    const confirmado = window.confirm(
      t("confirmarDesalocar", {
        carta: copia.cartaNome,
        colecao: copia.colecaoNome ?? "",
        vaga: copia.vagaChave ? rotuloChaveVaga(copia.vagaChave) : "",
      }),
    );
    if (!confirmado) return;
    const resp = await fetch(`/api/vagas/${copia.vagaId}/alocar`, { method: "DELETE" });
    if (resp.ok) {
      setCarregando(true);
      carregar();
    } else {
      setErro(t("erroDesalocar"));
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA));
  const filtrosAtivos = FILTROS_DO_PAINEL.filter((chave) => filtros[chave] !== "").length;
  const idPainelFiltros = "inventario-filtros";

  return (
    // Com seleção, a barra de ações fica fixa embaixo no celular: o fim da
    // página (paginação) ganha o espaço dela para não ficar escondido atrás.
    // O `!` é necessário: o `sm:p-8` (celular deitado, 640–767px) vem depois
    // na folha de estilos e devolveria o recuo de 32px por cima deste.
    <main
      className={`mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-8 md:h-full${
        selecionados.size > 0 ? " max-md:pb-[calc(7rem+env(safe-area-inset-bottom))]!" : ""
      }`}
    >
      <CabecalhoPagina
        titulo={t("titulo")}
        descricao={t("descricao", { total })}
        acoes={
          // Download de arquivo (rota de API, não página) — <a> normal é o
          // padrão correto aqui, não navegação client-side do Next.
          <span className="flex gap-2">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/api/copias/exportar" className={classesBotao("secundario")}>
              {t("baixarCsv")}
            </a>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/api/copias/exportar-liga"
              className={classesBotao("secundario")}
              title={t("exportarLigaTitulo")}
            >
              {t("exportarLiga")}
            </a>
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <input
          value={filtros.q}
          onChange={(e) => atualizarFiltro("q", e.target.value)}
            aria-label={ehMobile ? t("placeholderBusca") : undefined}
          placeholder={t("placeholderBusca")}
          className={`col-span-2 ${classesEntrada}`}
        />
        {/* Filtros recolhíveis no celular: a busca por nome fica à vista; o
            resto mora num painel aberto por este botão, ao lado de "Limpar
            filtros". Só visibilidade — os valores ficam em `filtros`, iguais
            com o painel aberto ou fechado e ao girar o aparelho. O botão não
            existe para o desktop (`md:hidden`), e o painel ali é
            `md:contents`: não gera caixa, e os campos voltam a ser itens
            diretos desta grade, na posição e na ordem de sempre.

            No celular, o painel vem por último na grade (`order-last`): o
            botão e o "Limpar" ficam juntos numa linha e o painel abre embaixo
            deles. Na ordem do Tab ele segue o botão que o abre, que é o
            padrão de um painel recolhível; o "Limpar" vem depois. */}
        <Botao
          type="button"
          variante="secundario"
          className="md:hidden"
          aria-expanded={ehMobile ? filtrosAbertos : undefined}
          aria-controls={ehMobile ? idPainelFiltros : undefined}
          onClick={() => setFiltrosAbertos((aberto) => !aberto)}
        >
          {filtrosAtivos > 0 ? tm("filtrosAtivos", { total: filtrosAtivos }) : tm("filtros")}
        </Botao>
        <div
          id={ehMobile ? idPainelFiltros : undefined}
          className={`md:contents max-md:order-last max-md:col-span-full max-md:grid-cols-2 max-md:gap-3 max-md:sm:grid-cols-4 ${
            filtrosAbertos ? "max-md:grid" : "max-md:hidden"
          }`}
        >
          <select
            value={filtros.set}
            onChange={(e) => atualizarFiltro("set", e.target.value)}
            aria-label={ehMobile ? t("filtroSet") : undefined}
            className={classesEntrada}
          >
            <option value="">{t("filtroSet")}</option>
            {opcoes.sets.map((s) => (
              <option key={s.setId} value={s.setId}>
                {s.setNome}
              </option>
            ))}
          </select>
          <select
            value={filtros.idioma}
            onChange={(e) => atualizarFiltro("idioma", e.target.value)}
            aria-label={ehMobile ? t("filtroIdioma") : undefined}
            className={classesEntrada}
          >
            <option value="">{t("filtroIdioma")}</option>
            {IDIOMAS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          <select
            value={filtros.raridade}
            onChange={(e) => atualizarFiltro("raridade", e.target.value)}
            aria-label={ehMobile ? t("filtroRaridade") : undefined}
            className={classesEntrada}
          >
            <option value="">{t("filtroRaridade")}</option>
            {opcoes.raridades.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            value={filtros.variante}
            onChange={(e) => atualizarFiltro("variante", e.target.value)}
            aria-label={ehMobile ? t("filtroVariante") : undefined}
            className={classesEntrada}
          >
            <option value="">{t("filtroVariante")}</option>
            {VARIANTES_COPIA.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={filtros.condicao}
            onChange={(e) => atualizarFiltro("condicao", e.target.value)}
            aria-label={ehMobile ? t("filtroCondicao") : undefined}
            className={classesEntrada}
          >
            <option value="">{t("filtroCondicao")}</option>
            {CONDICOES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={filtros.graded}
            onChange={(e) => atualizarFiltro("graded", e.target.value)}
            aria-label={ehMobile ? t("filtroGraded") : undefined}
            className={classesEntrada}
          >
            <option value="">{t("filtroGraded")}</option>
            <option value="true">{t("filtroGradedSim")}</option>
            <option value="false">{t("filtroGradedNao")}</option>
          </select>
          <select
            value={filtros.alocacao}
            onChange={(e) => atualizarFiltro("alocacao", e.target.value)}
            aria-label={ehMobile ? t("filtroAlocacao") : undefined}
            className={classesEntrada}
          >
            <option value="">{t("filtroAlocacao")}</option>
            <option value="alocada">{t("filtroAlocacaoAlocadas")}</option>
            <option value="livre">{t("filtroAlocacaoLivres")}</option>
          </select>
          <select
            value={filtros.semImagem}
            onChange={(e) => atualizarFiltro("semImagem", e.target.value)}
            aria-label={ehMobile ? t("filtroImagem") : undefined}
            className={classesEntrada}
            title={t("filtroImagemTitulo")}
          >
            <option value="">{t("filtroImagem")}</option>
            <option value="true">{t("filtroImagemSem")}</option>
          </select>
          <input
            value={filtros.localizacao}
            onChange={(e) => atualizarFiltro("localizacao", e.target.value)}
            aria-label={ehMobile ? t("placeholderLocalizacao") : undefined}
            placeholder={t("placeholderLocalizacao")}
            className={`max-md:col-span-2 ${classesEntrada}`}
          />
        </div>
        <Botao type="button" variante="secundario" onClick={limparFiltros}>
          {t("limparFiltros")}
        </Botao>
      </div>

      {erro && <p className="text-sm text-danger">{erro}</p>}
      {mensagem && <p className="text-sm text-success-fg">{mensagem}</p>}
      {carregando && <p className="text-sm text-muted">{t("carregando")}</p>}

      {/* Seleção em massa: no celular, barra fixa embaixo, na zona do polegar,
          enquanto houver seleção (o `main` reserva o espaço dela). `z-30`:
          acima do conteúdo, abaixo do sheet (`z-40`), que a cobre quando a
          edição em massa abre. Em pé, o texto numa linha e os botões embaixo;
          deitado (640px ou mais), tudo numa linha só, para a barra não comer
          um quarto da altura. No desktop, o painel de sempre, no lugar de
          sempre. */}
      {selecionados.size > 0 && (
        <Painel
          padding="sm"
          className="flex items-center justify-between max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-30 max-md:flex-wrap max-md:gap-2 max-md:rounded-none max-md:border-x-0 max-md:border-b-0 max-md:border-line max-md:px-4 max-md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
        >
          <span className="text-sm max-md:basis-full max-md:sm:basis-auto">
            {t("selecionadas", { total: selecionados.size })}
          </span>
          <div className="flex gap-2 max-md:basis-full max-md:sm:basis-auto">
            <Botao
              type="button"
              variante="primario"
              tamanho="sm"
              className="max-md:flex-1"
              onClick={() => setEditandoMassa(true)}
            >
              {t("editarSelecionadas")}
            </Botao>
            <Botao
              type="button"
              variante="secundario"
              tamanho="sm"
              className="max-md:flex-1"
              onClick={() => setSelecionados(new Set())}
            >
              {t("limparSelecao")}
            </Botao>
          </div>
        </Painel>
      )}

      {/* No celular a tabela vira lista de cartões (ver `classesLinhaCartao`).
          O cabeçalho continua visível como uma faixa só com o "selecionar
          todos" — o único controle que ele tem; as demais células saem de
          cena. A faixa ocupa a largura toda (a linha do cabeçalho é bloco, e
          não a faixa com recuo de `classesLinhaCabecalhoComControle`): o fundo
          e a régua são da célula, e um recuo na linha deixaria as pontas sem
          fundo. A caixa fica a 12px da borda, alinhada com a das linhas. */}
      <Tabela rolagemPropria className={classesTabelaEmpilhada}>
        <thead className={classesCabecalhoComControle}>
          <tr className={`${classesLinhaCabecalho} max-md:block`}>
            <th className={`${classesCelulaCabecalho} ${classesCelulaCabecalhoControle} max-md:p-0`}>
              <label className="md:contents max-md:flex max-md:min-h-11 max-md:flex-1 max-md:items-center max-md:gap-3 max-md:pl-3">
                <input
                  type="checkbox"
                  checked={itens.length > 0 && selecionados.size === itens.length}
                  onChange={alternarSelecaoTodos}
                  aria-label={t("selecionarTodos")}
                />
                <span className="md:hidden">{tm("selecionarTodos")}</span>
              </label>
            </th>
            <th className={`${classesCelulaCabecalho} ${classesCelulaCabecalhoOculta}`}></th>
            <th className={`${classesCelulaCabecalho} ${classesCelulaCabecalhoOculta}`}>{t("colunaCarta")}</th>
            <th className={`${classesCelulaCabecalho} ${classesCelulaCabecalhoOculta}`}>{t("colunaSet")}</th>
            <th className={`${classesCelulaCabecalho} ${classesCelulaCabecalhoOculta}`}>{t("colunaQtd")}</th>
            <th className={`${classesCelulaCabecalho} ${classesCelulaCabecalhoOculta}`}>{t("colunaVariante")}</th>
            <th className={`${classesCelulaCabecalho} ${classesCelulaCabecalhoOculta}`}>{t("colunaIdioma")}</th>
            <th className={`${classesCelulaCabecalho} ${classesCelulaCabecalhoOculta}`}>{t("colunaCondicao")}</th>
            <th className={`${classesCelulaCabecalho} ${classesCelulaCabecalhoOculta}`}>{t("colunaGraded")}</th>
            <th className={`${classesCelulaCabecalho} ${classesCelulaCabecalhoOculta}`}>{t("colunaLocalizacao")}</th>
            <th className={`${classesCelulaCabecalho} ${classesCelulaCabecalhoOculta}`}>{t("colunaVaga")}</th>
            <th className={`${classesCelulaCabecalho} ${classesCelulaCabecalhoOculta}`}></th>
          </tr>
        </thead>
        <tbody className={classesTabelaEmpilhada}>
          {itens.map((c) => {
            return (
              <tr key={c.id} className={`${classesLinha} ${classesLinhaCartao}`}>
                {/* O `label` é a área de toque de 44 da caixa no celular; no
                    desktop é `contents` e a célula sai como sempre. */}
                <td className="p-2 max-md:absolute max-md:top-3 max-md:left-0 max-md:p-0">
                  <label className="md:contents max-md:flex max-md:size-11 max-md:items-center max-md:justify-center">
                    <input
                      type="checkbox"
                      checked={selecionados.has(c.id)}
                      onChange={() => alternarSelecao(c.id)}
                      aria-label={t("selecionarCarta", { carta: c.cartaNome })}
                    />
                  </label>
                </td>
                {/* Miniatura centrada numa coluna de 44 (a largura da área de
                    toque do zoom). O "+ foto"/"trocar" de `AdicionarImagemLocal`
                    é filho direto da célula e ganha aqui os 44px de área no
                    celular; `>` e não descendente, para não alcançar os botões
                    da janela que ele abre, renderizada dentro da mesma célula. */}
                <td className="p-2 max-md:absolute max-md:top-3 max-md:left-[3.25rem] max-md:flex max-md:w-11 max-md:flex-col max-md:items-center max-md:p-0 max-md:[&>button]:inline-flex max-md:[&>button]:min-h-11 max-md:[&>button]:min-w-11 max-md:[&>button]:items-center max-md:[&>button]:justify-center">
                  <ImagemCartaComZoom
                    imagemUrl={c.imagemUrl}
                    origem={c.imagemOrigem}
                    alt={c.cartaNome}
                    width={32}
                    height={44}
                    className="rounded-tcg"
                    // O catálogo pode "achar" que existe imagem no CDN
                    // (tem set_serie_id) e mesmo assim o arquivo não
                    // existir lá — só se sabe depois do 404 real do
                    // <img> (caso do mep-079). Por isso o controle de
                    // adicionar imagem entra como fallback do próprio
                    // componente, não como um `if (!imagemUrl)` aqui:
                    // ele aparece exatamente onde a imagem de fato não
                    // aparece, e não só quando o campo já vem nulo.
                    fallback={
                      <AdicionarImagemLocal
                        cartaId={c.cartaId}
                        idiomaCatalogo={c.idiomaCatalogo}
                        cartaNome={c.cartaNome}
                        setId={c.setId}
                        onEnviada={() => {
                          setCarregando(true);
                          carregar();
                        }}
                      />
                    }
                  />
                  {/* A imagem que O USUÁRIO enviou pode ser trocada ou
                      removida; a do catálogo não é dele para mexer. */}
                  {ehOrigemPropria(c.imagemOrigem) && (
                    <AdicionarImagemLocal
                      cartaId={c.cartaId}
                      idiomaCatalogo={c.idiomaCatalogo}
                      cartaNome={c.cartaNome}
                      setId={c.setId}
                      jaTemImagemPropria
                      onEnviada={() => {
                        setCarregando(true);
                        carregar();
                      }}
                    />
                  )}
                </td>
                <td className={`p-2 ${classesCelulaEmpilhada} max-md:basis-full`}>
                  <NomeCarta nome={c.cartaNome} nomeEspecie={c.nomeEspecie} />{" "}
                  <span className="text-muted">#{c.cartaLocalId}</span>
                </td>
                <td className={`p-2 text-muted ${classesCelulaEmpilhada} max-md:basis-full max-md:text-xs`}>
                  {c.setNome}
                </td>
                {/* Daqui até a condição, os selos correm numa linha só no
                    celular. Sem o cabeçalho, um número solto não diz o que é:
                    o rótulo da coluna entra antes dele, só no celular. */}
                <td className={`p-2 font-mono tabular-nums ${classesCelulaEmpilhada} max-md:text-xs`}>
                  <span className="font-sans text-muted md:hidden">{t("colunaQtd")} </span>
                  {c.quantidade}
                </td>
                <td className={`p-2 ${classesCelulaEmpilhada}`}>
                  <ChipVariante variante={c.variante} tamanho="sm" />
                </td>
                <td className={`p-2 font-mono text-xs ${classesCelulaEmpilhada}`}>{c.idioma}</td>
                {/* Selo solto, fora de controle: no celular ganha a `Dica` com
                    o nome completo da condição, que no desktop é o `title`. */}
                <td className={`p-2 ${classesCelulaEmpilhada}`}>
                  <ChipCondicao condicao={c.condicao} dica />
                </td>
                {/* Graded e localização vazias são um "—" na tabela, que
                    mantém a coluna legível; no cartão seriam ruído, e somem.
                    Com valor, levam o nome do campo na frente. */}
                <td
                  className={`p-2 font-mono text-xs ${classesCelulaEmpilhada} ${
                    c.gradedEmpresa ? "" : "max-md:hidden"
                  }`}
                >
                  <span className="font-sans text-muted md:hidden">{t("colunaGraded")} </span>
                  {c.gradedEmpresa ? `${c.gradedEmpresa} ${c.gradedNota ?? ""}` : "—"}
                </td>
                <td
                  className={`p-2 text-muted ${classesCelulaEmpilhada} max-md:basis-full max-md:text-xs ${
                    c.localizacao ? "" : "max-md:hidden"
                  }`}
                >
                  <span className="md:hidden">{t("colunaLocalizacao")}: </span>
                  {c.localizacao ?? "—"}
                </td>
                <td className={`p-2 ${classesCelulaEmpilhada} max-md:basis-full`}>
                  {c.alocada ? (
                    <Distintivo tom="acento" className="max-md:whitespace-normal">
                      {c.colecaoNome} #{c.vagaChave ? rotuloChaveVaga(c.vagaChave) : ""}
                    </Distintivo>
                  ) : (
                    <Distintivo tom="neutro">{t("livre")}</Distintivo>
                  )}
                </td>
                {/* Ações com 44px de altura no celular e 8px entre as áreas
                    (`gap-2`); o recuo negativo alinha o texto da primeira com
                    o resto do cartão. "Remover", destrutiva, vai para a ponta
                    oposta, longe das outras. Quebram de linha quando não cabem
                    (a 320px, com a calha da miniatura, sobram ~170px). */}
                <td className="p-2 whitespace-nowrap max-md:-ml-2 max-md:flex max-md:min-w-0 max-md:basis-full max-md:flex-wrap max-md:gap-2 max-md:p-0">
                  {c.alocada ? (
                    <button
                      type="button"
                      onClick={() => desalocar(c)}
                      className={`mr-2 text-warning-fg hover:underline ${classesAcaoLinha}`}
                    >
                      {t("desalocar")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAlocando(c)}
                      className={`mr-2 text-accent hover:underline ${classesAcaoLinha}`}
                    >
                      {t("alocar")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditando(c)}
                    className={`mr-2 text-accent hover:underline ${classesAcaoLinha}`}
                  >
                    {t("editar")}
                  </button>
                  <button
                    type="button"
                    onClick={() => remover(c)}
                    className={`text-danger hover:underline ${classesAcaoLinha} max-md:ml-auto`}
                  >
                    {t("remover")}
                  </button>
                </td>
              </tr>
            );
          })}
          {itens.length === 0 && !carregando && (
            <tr className="max-md:block">
              <td colSpan={12} className="p-4 max-md:block">
                <EstadoVazio>{t("vazio")}</EstadoVazio>
              </td>
            </tr>
          )}
        </tbody>
      </Tabela>

      <div className="flex items-center justify-between text-sm">
        <Botao type="button" variante="secundario" disabled={pagina <= 1} onClick={() => irParaPagina(pagina - 1)}>
          {t("anterior")}
        </Botao>
        <span>{t("paginacao", { pagina, totalPaginas })}</span>
        <Botao
          type="button"
          variante="secundario"
          disabled={pagina >= totalPaginas}
          onClick={() => irParaPagina(pagina + 1)}
        >
          {t("proxima")}
        </Botao>
      </div>

      {editando && (
        <ModalEdicao
          copia={editando}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            setCarregando(true);
            carregar();
          }}
        />
      )}

      {alocando && (
        <ModalAlocarDestino
          copia={alocando}
          onFechar={() => setAlocando(null)}
          onAlocado={(msg) => {
            setAlocando(null);
            setErro(null);
            setMensagem(msg);
            setCarregando(true);
            carregar();
          }}
        />
      )}

      {editandoMassa && (
        <ModalEdicaoMassa
          itens={itens.filter((i) => selecionados.has(i.id))}
          onFechar={() => setEditandoMassa(false)}
          onSalvo={(msg) => {
            setEditandoMassa(false);
            setSelecionados(new Set());
            setErro(null);
            setMensagem(msg);
            setCarregando(true);
            carregar();
          }}
        />
      )}
    </main>
  );
}

function ModalEdicao({
  copia,
  onFechar,
  onSalvo,
}: {
  copia: CopiaDoInventarioDTO;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  // Nunca oferece uma variante que a carta não tem no catálogo (mesma
  // regra do cadastro por set/busca).
  const t = useTranslations("inventario");
  const tr = useTranslations("recusas");
  const opcoesVariante = variantesDisponiveis(copia);
  const [quantidade, setQuantidade] = useState(copia.quantidade);
  const [variante, setVariante] = useState<VarianteCopia>(copia.variante);
  const [idioma, setIdioma] = useState<Idioma>(copia.idioma);
  const [condicao, setCondicao] = useState<Condicao>(copia.condicao);
  const [localizacao, setLocalizacao] = useState(copia.localizacao ?? "");
  const [gradedEmpresa, setGradedEmpresa] = useState(copia.gradedEmpresa ?? "");
  const [gradedNota, setGradedNota] = useState(copia.gradedNota ?? "");
  const [gradedCertificado, setGradedCertificado] = useState(copia.gradedCertificado ?? "");
  const [aquisicaoData, setAquisicaoData] = useState(copia.aquisicaoData ?? "");
  const [aquisicaoOrigem, setAquisicaoOrigem] = useState(copia.aquisicaoOrigem ?? "");
  const [aquisicaoPreco, setAquisicaoPreco] = useState(copia.aquisicaoPreco ?? "");
  const [notas, setNotas] = useState(copia.notas ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const resp = await fetch(`/api/copias/${copia.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantidade,
          variante,
          idioma,
          condicao,
          localizacao,
          gradedEmpresa,
          gradedNota,
          gradedCertificado,
          aquisicaoData: aquisicaoData || null,
          aquisicaoOrigem,
          aquisicaoPreco: aquisicaoPreco === "" ? null : aquisicaoPreco,
          notas,
        }),
      });
      const dados = await resp.json();
      if (!resp.ok) {
        setErro(textoDaRecusa(tr, dados, t("erroSalvar")));
        return;
      }
      onSalvo();
    } catch {
      setErro(t("erroRedeSalvar"));
    } finally {
      setSalvando(false);
    }
  }

  // Um `id` fixo por cópia, e não `useId`: só há uma janela de edição aberta
  // por vez, e assim o trecho não depende de nada fora dele.
  const tituloId = `editar-copia-titulo-${copia.id}`;

  return (
    <Modal
      as="form"
      onSubmit={salvar}
      rotuloId={tituloId}
      onFechar={onFechar}
      rodape={
        <div className="flex justify-end gap-2 pt-2">
          <Botao type="button" variante="secundario" onClick={onFechar}>
            {t("cancelar")}
          </Botao>
          <Botao type="submit" variante="primario" disabled={salvando}>
            {salvando ? t("salvando") : t("salvar")}
          </Botao>
        </div>
      }
    >
      <h2 id={tituloId} className="font-medium text-foreground">
        {t("modalEditarTitulo", { carta: copia.cartaNome })} — {copia.setNome} #
        {copia.cartaLocalId}
      </h2>

      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo={t("campoQuantidade")}>
          <input
            type="number"
            min={1}
            value={quantidade}
            onChange={(e) => setQuantidade(Number(e.target.value) || 1)}
            className={classesEntrada}
          />
        </Campo>
        <Campo rotulo={t("colunaVariante")}>
          <select
            value={variante}
            onChange={(e) => setVariante(e.target.value as VarianteCopia)}
            className={classesEntrada}
          >
            {opcoesVariante.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo={t("campoIdiomaFisico")}>
          <select value={idioma} onChange={(e) => setIdioma(e.target.value as Idioma)} className={classesEntrada}>
            {IDIOMAS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo={t("colunaCondicao")}>
          <select value={condicao} onChange={(e) => setCondicao(e.target.value as Condicao)} className={classesEntrada}>
            {CONDICOES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      <Campo rotulo={t("campoLocalizacaoFisica")}>
        <input
          value={localizacao}
          onChange={(e) => setLocalizacao(e.target.value)}
          placeholder={t("placeholderFichario")}
          className={classesEntrada}
        />
      </Campo>

      <fieldset className="flex flex-col gap-2 rounded border border-line p-3">
        <legend className="px-1 text-muted">{t("colunaGraded")}</legend>
        {/* Três campos de texto lado a lado não cabem em 393px com 16px de
            fonte: no celular, um por linha. Mesmo para a aquisição abaixo. */}
        <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
          <input
            value={gradedEmpresa}
            onChange={(e) => setGradedEmpresa(e.target.value)}
            placeholder={t("placeholderGradedEmpresa")}
            className={classesEntrada}
          />
          <input
            value={gradedNota}
            onChange={(e) => setGradedNota(e.target.value)}
            placeholder={t("placeholderGradedNota")}
            className={classesEntrada}
          />
          <input
            value={gradedCertificado}
            onChange={(e) => setGradedCertificado(e.target.value)}
            placeholder={t("placeholderGradedCertificado")}
            className={classesEntrada}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2 rounded border border-line p-3">
        <legend className="px-1 text-muted">{t("aquisicao")}</legend>
        <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
          <input
            type="date"
            value={aquisicaoData}
            onChange={(e) => setAquisicaoData(e.target.value)}
            className={classesEntrada}
          />
          <input
            value={aquisicaoOrigem}
            onChange={(e) => setAquisicaoOrigem(e.target.value)}
            placeholder={t("placeholderAquisicaoOrigem")}
            className={classesEntrada}
          />
          <input
            type="number"
            step="0.01"
            min={0}
            value={aquisicaoPreco}
            onChange={(e) => setAquisicaoPreco(e.target.value)}
            placeholder={t("placeholderAquisicaoPreco")}
            className={classesEntrada}
          />
        </div>
      </fieldset>

      <Campo rotulo={t("campoNotas")}>
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={classesEntrada} />
      </Campo>

      {erro && <p className="text-danger">{erro}</p>}
    </Modal>
  );
}

/**
 * Item 1 do incremento pós-Fase 3: "estou olhando esta carta no
 * inventário, em qual coleção ela cabe?" — fluxo inverso de
 * `ModalAlocarVaga` (tela da coleção). Consome `GET
 * /api/copias/:id/destinos` e aloca pelas MESMAS rotas já existentes:
 * `POST /api/vagas/:id/alocar` para destino com vaga (pokedex/set),
 * `POST /api/colecoes/:id/copias` para customizada — nenhuma regra de
 * alocação nova, só uma porta de entrada nova. A escolha é sempre do
 * usuário (regra 5): nunca aloca sozinho, mesmo com um único destino.
 */
function ModalAlocarDestino({
  copia,
  onFechar,
  onAlocado,
}: {
  copia: CopiaDoInventarioDTO;
  onFechar: () => void;
  onAlocado: (msg: string) => void;
}) {
  const t = useTranslations("inventario");
  const tr = useTranslations("recusas");
  const [destinos, setDestinos] = useState<DestinoElegivelDaCopiaDTO[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmandoChave, setConfirmandoChave] = useState<string | null>(null);
  const [enviandoChave, setEnviandoChave] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/copias/${copia.id}/destinos`)
      .then((r) => r.json())
      .then((d) => setDestinos(d.itens ?? []))
      .catch(() => setErro(t("erroDestinos")))
      .finally(() => setCarregando(false));
  }, [copia.id, t]);

  // Chave de UI: uma vaga se identifica pelo vagaId, uma customizada pelo
  // colecaoId (não tem vaga ainda — ela nasce ao adicionar).
  function chaveDestino(d: DestinoElegivelDaCopiaDTO): string {
    return d.vagaId ?? d.colecaoId;
  }

  async function alocar(destino: DestinoElegivelDaCopiaDTO, permitirForaDePadrao: boolean) {
    const chave = chaveDestino(destino);
    setEnviandoChave(chave);
    setErro(null);
    try {
      const resp = await fetch(
        destino.vagaId ? `/api/vagas/${destino.vagaId}/alocar` : `/api/colecoes/${destino.colecaoId}/copias`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ copiaId: copia.id, permitirForaDePadrao }),
        },
      );
      const dados = await resp.json();
      if (!resp.ok) {
        setErro(textoDaRecusa(tr, dados, t("erroAlocar")));
        return;
      }
      const partes = [
        destino.vagaId
          ? t("alocadaEmVaga", {
              carta: copia.cartaNome,
              colecao: destino.colecaoNome,
              vaga: destino.chave ? rotuloChaveVaga(destino.chave) : "",
            })
          : t("adicionadaAColecao", { carta: copia.cartaNome, colecao: destino.colecaoNome }),
      ];
      if (dados.dividida) {
        partes.push(t("loteDividido"));
      }
      onAlocado(partes.join(" "));
    } catch {
      setErro(t("erroRedeAlocar"));
    } finally {
      setEnviandoChave(null);
      setConfirmandoChave(null);
    }
  }

  // Mesmo raciocínio do `id` fixo em `ModalEdicao`: uma janela por vez.
  const tituloId = `alocar-copia-titulo-${copia.id}`;

  return (
    <Modal
      rotuloId={tituloId}
      onFechar={onFechar}
      rodape={
        <div className="flex justify-end pt-2">
          <Botao type="button" variante="secundario" onClick={onFechar}>
            {t("fechar")}
          </Botao>
        </div>
      }
    >
      <h2 id={tituloId} className="font-medium text-foreground">
        {t("modalAlocarTitulo", { carta: copia.cartaNome })}{" "}
        <span className="text-muted">#{copia.cartaLocalId}</span>
      </h2>
      <p className="text-muted">{t("modalAlocarExplicacao")}</p>

      {carregando && <p className="text-muted">{t("carregandoDestinos")}</p>}
      {erro && <p className="text-danger">{erro}</p>}

      <ul className="flex flex-col divide-y divide-hairline">
        {destinos?.map((d) => {
          const chave = chaveDestino(d);
          return (
            // No celular: mais altura por candidato, para as áreas de toque
            // de 44 dos botões `xs` de duas linhas vizinhas não se tocarem; e a
            // confirmação de fora de padrão desce para uma linha própria.
            <li key={chave} className="flex items-center gap-3 py-2 max-md:flex-wrap max-md:py-3">
              <div className="flex-1">
                <div>
                  {d.colecaoNome}
                  <Distintivo tom="neutro" className="ml-2">
                    {t.has(`tipoColecao.${d.colecaoTipo}`)
                      ? t(`tipoColecao.${d.colecaoTipo}`)
                      : d.colecaoTipo}
                  </Distintivo>
                  {d.foraDePadrao && (
                    <Distintivo tom="aviso" className="ml-2">
                      {t("foraDePadrao", { idioma: copia.idioma })}
                    </Distintivo>
                  )}
                </div>
                <div className="text-xs text-muted">
                  {d.vagaId ? t("vagaNumero", { vaga: d.chave ? rotuloChaveVaga(d.chave) : "" }) : t("semVagaFixa")}
                </div>
              </div>
              {confirmandoChave === chave ? (
                <div className="flex items-center gap-2 max-md:basis-full max-md:justify-end">
                  <span className="text-xs text-warning-fg">{t("confirmaForaDePadrao")}</span>
                  <Botao type="button" variante="secundario" tamanho="xs" onClick={() => alocar(d, true)}>
                    {t("confirmar")}
                  </Botao>
                  <button
                    type="button"
                    onClick={() => setConfirmandoChave(null)}
                    className="alvo-toque text-xs text-muted"
                  >
                    {t("cancelar")}
                  </button>
                </div>
              ) : (
                <Botao
                  type="button"
                  variante="primario"
                  tamanho="xs"
                  disabled={enviandoChave === chave}
                  onClick={() => (d.foraDePadrao ? setConfirmandoChave(chave) : alocar(d, false))}
                >
                  {d.vagaId ? t("alocar") : t("adicionar")}
                </Botao>
              )}
            </li>
          );
        })}
        {destinos && destinos.length === 0 && (
          <EstadoVazio as="li" className="py-4">
            {t("semDestinos")}
          </EstadoVazio>
        )}
      </ul>
    </Modal>
  );
}

/**
 * Item 2 do incremento pós-Fase 3: edição em massa. Só os 4 campos que
 * fazem sentido gravar iguais num lote — condição, localização, idioma
 * FÍSICO e variante (nunca quantidade, graded, aquisição, notas: são
 * por exemplar). Cada campo só entra no PATCH se o usuário marcar
 * "alterar" explicitamente — nunca sobrescreve um campo que ele não
 * tocou. Confirmação explícita mostrando quantas cópias serão afetadas
 * antes de enviar (nunca "selecionar tudo e aplicar" direto).
 *
 * Variante: a lista oferecida é a INTERSEÇÃO do que `variantesDisponiveis`
 * (mesma função do cadastro por set/busca) permite para CADA cópia
 * selecionada — evita já na interface propor uma variante que uma das
 * cartas não tem; o servidor valida de novo por carta (defesa em
 * profundidade, `lib/db/consultas.ts`). Se a interseção for vazia
 * (seleção com cartas sem nenhuma variante em comum), o campo variante
 * fica indisponível — a escolha honesta é não oferecer, não escolher
 * uma variante arbitrária pra sobrescrever cegamente.
 */
function ModalEdicaoMassa({
  itens,
  onFechar,
  onSalvo,
}: {
  itens: CopiaDoInventarioDTO[];
  onFechar: () => void;
  onSalvo: (msg: string) => void;
}) {
  const t = useTranslations("inventario");
  const ehMobile = useEhMobile();
  const tr = useTranslations("recusas");
  const [alterarCondicao, setAlterarCondicao] = useState(false);
  const [condicao, setCondicao] = useState<Condicao>("NM");
  const [alterarLocalizacao, setAlterarLocalizacao] = useState(false);
  const [localizacao, setLocalizacao] = useState("");
  const [alterarIdioma, setAlterarIdioma] = useState(false);
  const [idioma, setIdioma] = useState<Idioma>("pt");
  const [alterarVariante, setAlterarVariante] = useState(false);
  const [variante, setVariante] = useState<VarianteCopia>("normal");
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const variantesComuns = itens.reduce<VarianteCopia[]>((acc, item, indice) => {
    const disponiveis = variantesDisponiveis(item);
    return indice === 0 ? disponiveis : acc.filter((v) => disponiveis.includes(v));
  }, []);

  const algumCampoMarcado = alterarCondicao || alterarLocalizacao || alterarIdioma || alterarVariante;

  async function aplicar() {
    setEnviando(true);
    setErro(null);
    try {
      const patch: Record<string, unknown> = {};
      if (alterarCondicao) patch.condicao = condicao;
      if (alterarLocalizacao) patch.localizacao = localizacao || null;
      if (alterarIdioma) patch.idioma = idioma;
      if (alterarVariante) patch.variante = variante;

      const resp = await fetch("/api/copias/massa", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ copiaIds: itens.map((i) => i.id), patch }),
      });
      const dados = await resp.json();
      if (!resp.ok) {
        setErro(textoDaRecusa(tr, dados, t("erroMassa")));
        setConfirmando(false);
        return;
      }
      onSalvo(t("massaAtualizadas", { total: dados.atualizadas }));
    } catch {
      setErro(t("erroRedeMassa"));
      setConfirmando(false);
    } finally {
      setEnviando(false);
    }
  }

  const tituloId = "editar-massa-titulo";

  /* No celular, um campo por bloco: a caixa e o nome do campo numa linha de
     44px (o `label` inteiro é a área de toque da caixa) e o controle embaixo,
     na largura toda — o nome com largura fixa e o controle ao lado não cabem
     em 393px com campo de 16px. */
  const classesLinhaCampo = "flex items-center gap-2 max-md:flex-wrap max-md:gap-x-3 max-md:gap-y-2";
  const classesNomeCampo = "w-28 text-muted max-md:inline-flex max-md:min-h-11 max-md:w-auto max-md:flex-1 max-md:items-center";

  return (
    <Modal
      rotuloId={tituloId}
      onFechar={onFechar}
      rodape={
        // No celular a pergunta de confirmação ocupa uma linha própria acima
        // dos botões; ao lado deles, não caberia.
        <div className="flex items-center justify-end gap-2 pt-2 max-md:flex-wrap">
          {confirmando ? (
            <>
              <span className="mr-auto text-warning-fg max-md:basis-full">
                {t("massaConfirma", { total: itens.length })}
              </span>
              <Botao type="button" variante="secundario" onClick={() => setConfirmando(false)}>
                {t("voltar")}
              </Botao>
              <Botao type="button" variante="primario" disabled={enviando} onClick={aplicar}>
                {enviando ? t("aplicando") : t("confirmar")}
              </Botao>
            </>
          ) : (
            <>
              <Botao type="button" variante="secundario" onClick={onFechar}>
                {t("cancelar")}
              </Botao>
              <Botao
                type="button"
                variante="primario"
                disabled={!algumCampoMarcado}
                onClick={() => setConfirmando(true)}
              >
                {t("massaAplicar", { total: itens.length })}
              </Botao>
            </>
          )}
        </div>
      }
    >
      <h2 id={tituloId} className="font-medium text-foreground">
        {t("massaTitulo", { total: itens.length })}
      </h2>
      <p className="text-muted">{t("massaExplicacao")}</p>

      <label className={classesLinhaCampo}>
        <input type="checkbox" checked={alterarCondicao} onChange={(e) => setAlterarCondicao(e.target.checked)} />
        <span className={classesNomeCampo}>{t("colunaCondicao")}</span>
        <select
          aria-label={ehMobile ? t("colunaCondicao") : undefined}
          value={condicao}
          disabled={!alterarCondicao}
          onChange={(e) => setCondicao(e.target.value as Condicao)}
          className={`flex-1 disabled:opacity-40 max-md:basis-full ${classesEntrada}`}
        >
          {CONDICOES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label className={classesLinhaCampo}>
        <input
          type="checkbox"
          checked={alterarLocalizacao}
          onChange={(e) => setAlterarLocalizacao(e.target.checked)}
        />
        <span className={classesNomeCampo}>{t("colunaLocalizacao")}</span>
        <input
          aria-label={ehMobile ? t("colunaLocalizacao") : undefined}
          value={localizacao}
          disabled={!alterarLocalizacao}
          onChange={(e) => setLocalizacao(e.target.value)}
          placeholder={t("placeholderFichario")}
          className={`flex-1 disabled:opacity-40 max-md:basis-full ${classesEntrada}`}
        />
      </label>

      <label className={classesLinhaCampo}>
        <input type="checkbox" checked={alterarIdioma} onChange={(e) => setAlterarIdioma(e.target.checked)} />
        <span className={classesNomeCampo}>{t("campoIdiomaFisico")}</span>
        <select
          aria-label={ehMobile ? t("campoIdiomaFisico") : undefined}
          value={idioma}
          disabled={!alterarIdioma}
          onChange={(e) => setIdioma(e.target.value as Idioma)}
          className={`flex-1 disabled:opacity-40 max-md:basis-full ${classesEntrada}`}
        >
          {IDIOMAS.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
      </label>

      <label className={classesLinhaCampo}>
        <input
          type="checkbox"
          checked={alterarVariante}
          disabled={variantesComuns.length === 0}
          onChange={(e) => setAlterarVariante(e.target.checked)}
        />
        <span className={classesNomeCampo}>{t("colunaVariante")}</span>
        {variantesComuns.length > 0 ? (
          <select
            value={variante}
            aria-label={ehMobile ? t("colunaVariante") : undefined}
            disabled={!alterarVariante}
            onChange={(e) => setVariante(e.target.value as VarianteCopia)}
            className={`flex-1 disabled:opacity-40 max-md:basis-full ${classesEntrada}`}
          >
            {variantesComuns.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        ) : (
          <span className="flex-1 text-xs text-warning-fg max-md:basis-full">{t("semVarianteComum")}</span>
        )}
      </label>

      {erro && <p className="text-danger">{erro}</p>}
    </Modal>
  );
}
