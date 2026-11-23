"use client";

/**
 * `/inventario` da v2: a lista de cópias com os filtros da v1, a seleção com a
 * edição em massa e a remoção de uma cópia. Tudo o que se faz **com uma
 * cópia** — editar, alocar, desalocar, foto própria, ver a carta grande — mora
 * no `<DetalheCarta>` em modo cópia (pacote 1b), que abre ao tocar na linha.
 *
 * ## Leitura
 *
 * `GET /api/copias` com a mesma query da v1 (`consultaDaLista`). Cada leitura
 * aborta a anterior: digitar "pikachu" não pode deixar a resposta de "pik"
 * chegar por último e mostrar a lista errada. A busca e a localização esperam
 * a pessoa parar de digitar (`ESPERA_TEXTO_MS`); os seletores leem na hora.
 * "Carregando" é derivado (a última resposta não é da consulta atual), não um
 * estado ligado à mão.
 *
 * ## URL
 *
 * A tela escreve o recorte na barra com as chaves da v1 (`enderecoDaTela`),
 * por `history.replaceState`: recarregar ou compartilhar o endereço abre o
 * mesmo recorte, e trocar um filtro não empilha uma entrada no "voltar".
 *
 * ## Paginação, não grade virtual
 *
 * 50 por página, como a v1. A grade virtual é do pacote 1d; esta tela não
 * passa do limiar: 50 linhas de painel, sem desfoque nem camada de composição
 * por linha (regra 5 de `docs/design-v2/rules.md`), e só a carta sob o dedo
 * se inclina.
 */

import { CheckSquare, Download, FileArchive, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { textoDaRecusa } from "@/app/_comum/recusa";
import type { CopiaDoInventarioDTO } from "@/lib/dominio/tipos-cliente";

import { type AberturaDetalhe, DetalheCarta } from "../../_componentes/detalhe/detalhe-carta";
import { useAviso } from "../../_componentes/primitivos/aviso-flutuante";
import { Botao } from "../../_componentes/primitivos/botao";
import { useConfirmacao } from "../../_componentes/primitivos/dialogo-confirmacao";
import { AvisoEmLinha, Painel } from "../../_componentes/primitivos/painel";
import { EdicaoMassa } from "./edicao-massa";
import {
  type ChaveFiltro,
  FILTROS_DE_TEXTO,
  FILTROS_VAZIOS,
  type FiltrosTela,
  alternarTodos,
  consultaDaLista,
  enderecoDaTela,
  filtrosNoPainel,
  mesmosFiltros,
  paginaAlemDoFim,
  podarSelecao,
  totalDePaginas,
} from "./estado-inventario";
import { PainelFiltros, type OpcoesFiltro } from "./filtros";
import estilos from "./inventario.module.css";
import { LinhaCopia } from "./linha-copia";

/** Quanto a busca por texto espera a pessoa parar de digitar antes de ler. */
const ESPERA_TEXTO_MS = 300;

interface Consulta {
  filtros: FiltrosTela;
  pagina: number;
}

type Resultado =
  | { chave: string; ok: true; itens: CopiaDoInventarioDTO[]; total: number }
  | { chave: string; ok: false; texto: string; filtrosInvalidos: boolean };

interface RespostaLista {
  itens?: CopiaDoInventarioDTO[];
  total?: number;
  opcoes?: OpcoesFiltro;
}

export function Inventario({ filtrosIniciais, paginaInicial }: { filtrosIniciais: FiltrosTela; paginaInicial: number }) {
  const t = useTranslations("v2Inventario");
  const tRecusas = useTranslations("recusas");
  const avisar = useAviso();
  const { confirmar, dialogo } = useConfirmacao();

  // O que os campos mostram (na hora) e o que foi pedido à API (a busca por
  // texto chega aqui depois da espera).
  const [filtros, setFiltros] = useState<FiltrosTela>(filtrosIniciais);
  const [consulta, setConsulta] = useState<Consulta>({ filtros: filtrosIniciais, pagina: paginaInicial });
  const [versao, setVersao] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  // As opções dos seletores (sets e raridades do inventário) sobrevivem a uma
  // leitura que falhou: sumir com elas esvaziaria o filtro que está em uso.
  const [opcoes, setOpcoes] = useState<OpcoesFiltro>({ sets: [], raridades: [] });
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [selecao, setSelecao] = useState<Set<string>>(() => new Set());
  const [massaAberta, setMassaAberta] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [aberta, setAberta] = useState<AberturaDetalhe | null>(null);
  // A cópia do par ativo da transição de vista: só ela leva o nome na lista.
  const [alvo, setAlvo] = useState<string | null>(null);
  const relogioTexto = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * Uma navegação para outro recorte de `/inventario` (um link da visão geral,
   * a aba "Inventário" com a tela já aberta) chega como props novas sem
   * remontar a tela: o App Router preserva o estado do cliente numa troca de
   * query. Props que dizem outra coisa que a consulta atual mandam; as que
   * só repetem o que a própria tela escreveu na barra não mexem em nada.
   */
  const enderecoDasProps = enderecoDaTela(filtrosIniciais, paginaInicial);
  const [propsVistas, setPropsVistas] = useState(enderecoDasProps);
  if (enderecoDasProps !== propsVistas) {
    setPropsVistas(enderecoDasProps);
    if (enderecoDasProps !== enderecoDaTela(consulta.filtros, consulta.pagina)) {
      setFiltros(filtrosIniciais);
      setConsulta({ filtros: filtrosIniciais, pagina: paginaInicial });
      setSelecao(new Set());
      setMassaAberta(false);
    }
  }
  // ...e a busca digitada antes dela não chega depois para desfazê-la.
  useEffect(() => {
    if (relogioTexto.current) clearTimeout(relogioTexto.current);
  }, [enderecoDasProps]);

  const chaveConsulta = `${consultaDaLista(consulta.filtros, consulta.pagina)}#${versao}`;
  const carregando = resultado?.chave !== chaveConsulta;
  /*
   * A lista na tela é a da consulta atual, e os campos dizem o mesmo que ela?
   * Enquanto não (uma leitura a caminho, uma busca ainda esperando a pausa), a
   * lista à vista é a do recorte anterior: selecionar, editar em massa,
   * remover e abrir ficam desligados, para nada agir sobre linhas que já
   * não são as pedidas.
   */
  const pronta = !carregando && mesmosFiltros(filtros, consulta.filtros);

  useEffect(() => {
    const controle = new AbortController();
    const chave = `${consultaDaLista(consulta.filtros, consulta.pagina)}#${versao}`;
    fetch(`/api/copias?${consultaDaLista(consulta.filtros, consulta.pagina)}`, { cache: "no-store", signal: controle.signal })
      .then(async (r) => {
        const corpo = (await r.json().catch(() => null)) as RespostaLista | null;
        if (controle.signal.aborted) return;
        if (!r.ok || !corpo) {
          // 400 é filtro que a API não aceita (um link com valor inventado):
          // o corpo dela vem em português, então a frase é da tela.
          const invalidos = r.status === 400;
          setResultado({
            chave,
            ok: false,
            filtrosInvalidos: invalidos,
            texto: invalidos ? t("filtrosInvalidos") : textoDaRecusa(tRecusas, corpo, t("erroCarregar")),
          });
          return;
        }
        const itens = corpo.itens ?? [];
        const total = corpo.total ?? 0;
        if (corpo.opcoes) setOpcoes(corpo.opcoes);
        setSelecao((atual) => (atual.size === 0 ? atual : podarSelecao(atual, itens)));
        const ultima = paginaAlemDoFim(consulta.pagina, total, itens.length);
        if (ultima !== null) {
          setConsulta((c) => ({ ...c, pagina: ultima }));
          return;
        }
        setResultado({ chave, ok: true, itens, total });
      })
      .catch(() => {
        if (!controle.signal.aborted) setResultado({ chave, ok: false, filtrosInvalidos: false, texto: t("erroRede") });
      });
    return () => controle.abort();
  }, [consulta, versao, t, tRecusas]);

  // O recorte na barra de endereço, com as chaves da v1.
  useEffect(() => {
    const destino = enderecoDaTela(consulta.filtros, consulta.pagina);
    if (window.location.pathname + window.location.search !== destino) {
      // `null`, não `history.state`: o Next 16 intercepta o `replaceState`
      // e, com o estado dele por cima, passaria direto ao nativo sem atualizar
      // a URL que o roteador guarda; com `null` ele mesmo preserva o que é seu.
      window.history.replaceState(null, "", destino);
    }
  }, [consulta]);

  useEffect(() => () => {
    if (relogioTexto.current) clearTimeout(relogioTexto.current);
  }, []);

  const reler = useCallback(() => setVersao((v) => v + 1), []);

  /** Um filtro mudou: a lista volta à primeira página e a seleção esvazia, como na v1. */
  function mudarFiltro(chave: ChaveFiltro, valor: string) {
    const novos = { ...filtros, [chave]: valor };
    setFiltros(novos);
    setSelecao(new Set());
    if (relogioTexto.current) clearTimeout(relogioTexto.current);
    if (FILTROS_DE_TEXTO.includes(chave)) {
      relogioTexto.current = setTimeout(() => setConsulta({ filtros: novos, pagina: 1 }), ESPERA_TEXTO_MS);
    } else {
      setConsulta({ filtros: novos, pagina: 1 });
    }
  }

  function limparFiltros() {
    if (relogioTexto.current) clearTimeout(relogioTexto.current);
    setFiltros(FILTROS_VAZIOS);
    setSelecao(new Set());
    setConsulta({ filtros: FILTROS_VAZIOS, pagina: 1 });
  }

  function irParaPagina(pagina: number) {
    setSelecao(new Set());
    setConsulta((c) => ({ ...c, pagina }));
    window.scrollTo({ top: 0 });
  }

  const itens = useMemo(() => (resultado?.ok ? resultado.itens : []), [resultado]);
  const total = resultado?.ok ? resultado.total : 0;
  const paginas = totalDePaginas(total);
  const selecionadas = useMemo(() => itens.filter((i) => selecao.has(i.id)), [itens, selecao]);
  const todasMarcadas = itens.length > 0 && itens.every((i) => selecao.has(i.id));
  const algumaMarcada = itens.some((i) => selecao.has(i.id));
  // A edição em massa só existe com seleção: se uma releitura podou a
  // seleção até zero, ela fecha de vez (e não reabre sozinha na próxima marca).
  if (massaAberta && selecionadas.length === 0 && !carregando) setMassaAberta(false);

  function alternar(id: string) {
    setSelecao((atual) => {
      const nova = new Set(atual);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });
  }

  /*
   * Abrir em dois tempos, no mesmo evento (regra 25 de `rules.md`): a
   * miniatura tocada ganha o nome de transição numa atualização urgente, e o
   * detalhe abre dentro da transição enquanto ela sai da lista.
   */
  function abrir(c: CopiaDoInventarioDTO) {
    setAlvo(c.id);
    startTransition(() =>
      setAberta({
        modo: "copia",
        cartaId: c.cartaId,
        copiaId: c.id,
        previa: { nome: c.cartaNome, imagemUrl: c.imagemUrl, imagemOrigem: c.imagemOrigem, raridade: c.raridade, variante: c.variante },
      }),
    );
  }

  async function remover(c: CopiaDoInventarioDTO) {
    const ok = await confirmar({
      titulo: t("remover.titulo", { carta: c.cartaNome }),
      descricao: `${t("remover.qual", { set: c.setNome, numero: c.cartaLocalId, quantidade: c.quantidade })} ${
        c.alocada ? t("remover.alocada", { colecao: c.colecaoNome ?? "" }) : t("remover.livre")
      }`,
      rotuloConfirmar: t("remover.confirmar"),
      perigoso: true,
    });
    if (!ok) return;
    setRemovendo(c.id);
    try {
      const r = await fetch(`/api/copias/${c.id}`, { method: "DELETE" });
      if (r.ok) {
        avisar(t("remover.feito", { carta: c.cartaNome }), { tom: "sucesso" });
      } else if (r.status === 404) {
        // Já tinha saído (outra aba): a frase da rota vem em português, então é da tela.
        avisar(t("remover.jaRemovida"), { tom: "erro" });
      } else {
        const corpo: unknown = await r.json().catch(() => null);
        avisar(textoDaRecusa(tRecusas, corpo, t("remover.erro")), { tom: "erro" });
      }
      reler();
    } catch {
      avisar(t("erroRede"), { tom: "erro" });
    } finally {
      setRemovendo(null);
    }
  }

  const noPainel = filtrosNoPainel(filtros);
  const algumFiltro = noPainel > 0 || filtros.q !== "";

  return (
    <div className={estilos.pagina}>
      <header className={estilos.cabecalho}>
        <div>
          <h1 className={estilos.titulo}>{t("titulo")}</h1>
          <p className={`${estilos.contagem} v2-num`} aria-live="polite">
            {resultado?.ok ? t("contagem", { total }) : " "}
          </p>
        </div>
        <div className={estilos.acoes}>
          {/* Download de arquivo por rota de API: `<a>` comum, não navegação do Next. */}
          <a href="/api/copias/exportar" className={estilos.baixar} download>
            <Download aria-hidden size={18} />
            {t("baixarCsv")}
          </a>
          <a href="/api/copias/exportar-liga" className={estilos.baixar} download aria-describedby="inventario-exportar-liga">
            <FileArchive aria-hidden size={18} />
            {t("exportarLiga")}
          </a>
        </div>
      </header>
      <p id="inventario-exportar-liga" className={estilos.ajuda}>
        {t("exportarLigaExplica")}
      </p>

      <PainelFiltros
        filtros={filtros}
        opcoes={opcoes}
        aberto={filtrosAbertos}
        noPainel={noPainel}
        algumFiltro={algumFiltro}
        onMudar={mudarFiltro}
        onAlternar={() => setFiltrosAbertos((a) => !a)}
        onLimpar={limparFiltros}
      />

      {resultado && !resultado.ok && !carregando ? (
        <AvisoEmLinha
          tom="perigo"
          papel="alert"
          titulo={t("naoDeu")}
          acao={
            resultado.filtrosInvalidos ? (
              <Botao pequeno onClick={limparFiltros}>
                {t("limparFiltros")}
              </Botao>
            ) : (
              <Botao pequeno onClick={reler}>
                {t("tentarDeNovo")}
              </Botao>
            )
          }
        >
          {resultado.texto}
        </AvisoEmLinha>
      ) : null}

      <div className={estilos.barraLista}>
        <label className={estilos.marcarTodos}>
          <input
            type="checkbox"
            className={estilos.caixa}
            checked={todasMarcadas}
            ref={(el) => {
              if (el) el.indeterminate = algumaMarcada && !todasMarcadas;
            }}
            disabled={itens.length === 0 || !pronta}
            onChange={() => setSelecao((s) => alternarTodos(s, itens))}
          />
          <span>{t("selecionarTodos")}</span>
        </label>
        {!pronta ? (
          <span className={estilos.carregando} role="status">
            {t("carregando")}
          </span>
        ) : null}
      </div>

      <ul className={estilos.lista} aria-busy={!pronta || undefined} inert={!pronta} aria-label={t("titulo")}>
        {itens.map((c) => (
          <LinhaCopia
            key={c.id}
            copia={c}
            selecionada={selecao.has(c.id)}
            aberta={aberta?.modo === "copia" && aberta.copiaId === c.id}
            noParAtivo={alvo === c.id}
            removendo={removendo === c.id}
            onAlternar={() => alternar(c.id)}
            onAbrir={() => abrir(c)}
            onRemover={() => void remover(c)}
          />
        ))}
      </ul>

      {resultado?.ok && itens.length === 0 && !carregando ? (
        <Painel className={estilos.vazio}>
          <b>{algumFiltro ? t("vazioFiltrado") : t("vazio")}</b>
          {algumFiltro ? (
            <Botao onClick={limparFiltros}>{t("limparFiltros")}</Botao>
          ) : null}
        </Painel>
      ) : null}

      {/*
        Barra da seleção: grudada no pé da janela enquanto a lista rola (no
        celular, logo acima da barra de abas), e no próprio lugar, depois da
        lista, quando a lista acaba. `sticky`, não `fixed`: ela ocupa a própria
        altura no fluxo, então o fim da lista nunca fica escondido atrás dela,
        em largura nenhuma. Sem desfoque (o orçamento de três superfícies já
        está gasto pela casca e pelo véu de uma janela).
      */}
      {selecionadas.length > 0 ? (
        <div className={`${estilos.barraSelecao} v2-painel-flutuante`} role="region" aria-label={t("selecao.rotulo")}>
          <span className={estilos.selecaoTexto}>
            <CheckSquare aria-hidden size={18} />
            {t("selecao.total", { total: selecionadas.length })}
          </span>
          <div className={estilos.selecaoAcoes}>
            <Botao variante="primario" disabled={!pronta} onClick={() => setMassaAberta(true)}>
              {t("selecao.editar")}
            </Botao>
            {/* Abaixo de 360 px o rótulo some e fica o X (o nome segue no `aria-label`). */}
            <Botao
              variante="fantasma"
              className={estilos.limparSelecao}
              icone={<X aria-hidden size={18} />}
              aria-label={t("selecao.limparRotulo")}
              onClick={() => setSelecao(new Set())}
            >
              <span className={estilos.rotuloLimpar}>{t("selecao.limpar")}</span>
            </Botao>
          </div>
        </div>
      ) : null}

      {paginas > 1 || consulta.pagina > 1 ? (
        <nav className={estilos.paginacao} aria-label={t("paginacao.rotulo")}>
          <Botao disabled={consulta.pagina <= 1 || carregando} onClick={() => irParaPagina(consulta.pagina - 1)}>
            {t("paginacao.anterior")}
          </Botao>
          <span className="v2-num">{t("paginacao.texto", { pagina: consulta.pagina, total: paginas })}</span>
          <Botao disabled={consulta.pagina >= paginas || carregando} onClick={() => irParaPagina(consulta.pagina + 1)}>
            {t("paginacao.proxima")}
          </Botao>
        </nav>
      ) : null}

      <EdicaoMassa
        aberto={massaAberta && selecionadas.length > 0}
        itens={selecionadas}
        onFechar={() => setMassaAberta(false)}
        onAplicada={(atualizadas) => {
          setMassaAberta(false);
          setSelecao(new Set());
          avisar(t("massa.feito", { total: atualizadas }), { tom: "sucesso" });
          reler();
        }}
        onDesatualizada={reler}
      />

      {dialogo}

      <DetalheCarta
        abertura={aberta}
        onFechar={() => setAberta(null)}
        onMudou={reler}
        chaveTransicao={aberta?.modo === "copia" ? `copia:${aberta.copiaId}` : undefined}
        // A linha que abriu, se ainda estiver na página (a leitura depois de
        // uma escrita pode tê-la tirado do recorte); senão a pilha cai no
        // abridor ou no conteúdo.
        devolverFocoPara={() =>
          alvo ? document.querySelector<HTMLElement>(`[data-abrir-copia="${CSS.escape(alvo)}"]`) : null
        }
      />
    </div>
  );
}
