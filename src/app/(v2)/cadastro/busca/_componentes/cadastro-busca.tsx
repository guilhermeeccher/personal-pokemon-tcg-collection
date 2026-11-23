"use client";

/**
 * `/cadastro/busca` da v2 (pacote 3b): cadastrar uma carta avulsa, buscando-a
 * no catálogo por nome, set e número, ou pela sigla impressa + número.
 *
 * Fluxo: buscar → escolher um resultado (ou cancelar) → preencher a cópia →
 * gravar. Quando a carta não está no catálogo, cadastra-a à mão. Tudo passa
 * pelas rotas da v1, sem nada novo no servidor.
 *
 * - **Uma busca vale só a última.** Cada pedido aborta o anterior e uma
 *   resposta velha nunca sobrescreve a lista: digitar depressa, ou buscar de
 *   novo com a primeira ainda no ar, não pode trocar os resultados por baixo
 *   de quem já está escolhendo.
 * - **A lista não é virtualizada**: a rota devolve no máximo 100 cartas numa
 *   busca de texto, e a busca por sigla + número devolve as que casam o número
 *   (poucas). Abaixo do limiar de 300 da regra 13 de `docs/design-v2/rules.md`.
 * - **O formulário abre sob a carta escolhida**, dentro da própria lista, e não
 *   no fim da página.
 * - **Gravar não apaga a lista**: quem cadastra uma carta costuma cadastrar a
 *   seguinte da mesma busca. O "já tem N" das linhas sobe com o que acabou de
 *   entrar, e a mensagem diz se a cópia foi **somada** a uma linha que já
 *   existia ou **gravada** nova: esconder a diferença faria o cadastro parecer
 *   perdido quando ele some numa linha antiga.
 */

import { useTranslations } from "next-intl";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";

import { textoDaRecusa } from "@/app/_comum/recusa";
import {
  type FiltrosBusca,
  type FormularioCopia,
  chaveDoResultado,
  corpoDaCopia,
  desfechoDaBuscaRapida,
  escolhaAposGravar,
  escolhaContinuaValida,
  formularioInicial,
  paramsDaBusca,
  paramsDaBuscaRapida,
  raridadeExibivel,
  somarPossuidas,
  sugestaoParaCartaManual,
} from "@/lib/dominio/cadastro-busca-v2";
import type { CartaEncontradaDTO } from "@/lib/dominio/tipos-cliente";

import { Carta } from "../../../_componentes/carta/carta";
import { Botao } from "../../../_componentes/primitivos/botao";
import { Campo } from "../../../_componentes/primitivos/campo";
import { AvisoEmLinha, Painel } from "../../../_componentes/primitivos/painel";

import { AmpliarCarta } from "./ampliar-carta";
import estilos from "./cadastro-busca.module.css";
import { CartaManual, type CartaManualCriada } from "./carta-manual";
import { FormularioCopiaBusca } from "./formulario-copia";

type Tipo = "busca" | "rapida";

interface Aviso {
  tom: "sucesso" | "neutro";
  texto: string;
}

export function CadastroBusca() {
  const t = useTranslations("v2CadastroBusca");
  const tr = useTranslations("recusas");
  const tRaridade = useTranslations("raridadesCarta");

  const [nome, setNome] = useState("");
  const [setId, setSetId] = useState("");
  const [numero, setNumero] = useState("");
  const [siglaNumero, setSiglaNumero] = useState("");

  const [resultados, setResultados] = useState<CartaEncontradaDTO[] | null>(null);
  const [buscando, setBuscando] = useState<Tipo | null>(null);
  // O que a última busca **enviou**, não o que os campos dizem agora: é isso
  // que pré-preenche a carta à mão. Mexer num campo sem buscar de novo não
  // muda o que a pessoa procurou sem achar.
  const [consulta, setConsulta] = useState<{ tipo: Tipo; filtros: FiltrosBusca; siglaNumero: string }>({
    tipo: "busca",
    filtros: { nome: "", set: "", numero: "" },
    siglaNumero: "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const [escolhida, setEscolhida] = useState<CartaEncontradaDTO | null>(null);
  const [form, setForm] = useState<FormularioCopia | null>(null);
  const [gravando, setGravando] = useState(false);
  const [quantidadeInvalida, setQuantidadeInvalida] = useState(false);

  const [ampliada, setAmpliada] = useState<CartaEncontradaDTO | null>(null);
  // O botão que abriu o zoom: o Safari não foca um botão tocado, e a pilha de
  // camadas devolveria o foco a outro lugar.
  const abridorZoom = useRef<HTMLElement | null>(null);

  const refTituloForm = useRef<HTMLHeadingElement | null>(null);
  const refAviso = useRef<HTMLDivElement | null>(null);
  const botoesEscolher = useRef(new Map<string, HTMLButtonElement>());
  const buscaEmCurso = useRef<AbortController | null>(null);

  // O formulário que abre embaixo de uma lista comprida fica fora da tela de
  // quem tocou "Cadastrar cópia", e o aviso de "gravada" nasce acima do que
  // está na tela: depois de cada um, a página vai até o que apareceu e o foco
  // vai junto. Uma vez por toque: girar o aparelho não rola de novo.
  const pendente = useRef<"formulario" | "aviso" | null>(null);
  useEffect(() => {
    const que = pendente.current;
    if (!que) return;
    pendente.current = null;
    if (que === "formulario") {
      refTituloForm.current?.focus({ preventScroll: true });
      refTituloForm.current?.scrollIntoView({ block: "start" });
    } else {
      refAviso.current?.scrollIntoView({ block: "nearest" });
    }
  }, [escolhida, aviso, erro]);

  useEffect(() => () => buscaEmCurso.current?.abort(), []);

  const abrirFormulario = useCallback((carta: CartaEncontradaDTO) => {
    setEscolhida(carta);
    setForm(formularioInicial(carta));
    setQuantidadeInvalida(false);
    setAviso(null);
    pendente.current = "formulario";
  }, []);

  /**
   * Uma busca: aborta a anterior, lê a resposta só se ainda é a última e, se
   * a carta escolhida saiu da lista, desfaz a escolha (um formulário de uma
   * carta que a pessoa já não vê gravaria sem ela saber).
   */
  async function pesquisar(tipo: Tipo, params: URLSearchParams): Promise<CartaEncontradaDTO[] | null> {
    buscaEmCurso.current?.abort();
    const controle = new AbortController();
    buscaEmCurso.current = controle;
    setBuscando(tipo);
    setErro(null);
    setAviso(null);
    try {
      const resp = await fetch(`/api/cartas?${params.toString()}`, { signal: controle.signal });
      const dados = await resp.json().catch(() => null);
      if (controle.signal.aborted) return null;
      if (!resp.ok || !Array.isArray(dados?.cartas)) {
        setErro(textoDaRecusa(tr, dados, t("erroBusca")));
        return null;
      }
      const cartas: CartaEncontradaDTO[] = dados.cartas;
      setResultados(cartas);
      setEscolhida((atual) => (escolhaContinuaValida(cartas, atual) ? atual : null));
      return cartas;
    } catch {
      if (!controle.signal.aborted) setErro(t("erroBusca"));
      return null;
    } finally {
      if (buscaEmCurso.current === controle) {
        buscaEmCurso.current = null;
        setBuscando(null);
      }
    }
  }

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    const params = paramsDaBusca({ nome, set: setId, numero });
    if (!params) {
      setErro(t("erroCriterio"));
      return;
    }
    setConsulta({ tipo: "busca", filtros: { nome, set: setId, numero }, siglaNumero: "" });
    await pesquisar("busca", params);
  }

  async function buscarRapido(e: React.FormEvent) {
    e.preventDefault();
    const params = paramsDaBuscaRapida(siglaNumero);
    if (!params) {
      setErro(t("erroSiglaNumero"));
      return;
    }
    setConsulta({ tipo: "rapida", filtros: { nome: "", set: "", numero: "" }, siglaNumero });
    const cartas = await pesquisar("rapida", params);
    if (!cartas) return;
    // Uma candidata só resolve direto na carta; zero ou várias ficam na lista,
    // para a pessoa escolher: o sistema nunca escolhe a carta por ela.
    const desfecho = desfechoDaBuscaRapida(cartas);
    if (desfecho.tipo === "unica") abrirFormulario(desfecho.carta);
  }

  async function gravar() {
    if (!escolhida || !form || gravando) return;
    const pronto = corpoDaCopia(escolhida, form);
    if (!pronto.ok) {
      setQuantidadeInvalida(true);
      return;
    }
    setQuantidadeInvalida(false);
    setGravando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/copias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pronto.corpo),
      });
      const dados = await resp.json().catch(() => null);
      if (!resp.ok) {
        setErro(textoDaRecusa(tr, dados, t("erroGravar")));
        pendente.current = "aviso";
        return;
      }
      const carta = escolhida;
      setAviso({
        tom: "sucesso",
        texto: dados?.fundida
          ? t("somada", { carta: carta.nome, total: Number(dados.quantidadeFinal) })
          : t("gravada", { carta: carta.nome }),
      });
      setResultados((lista) => (lista ? somarPossuidas(lista, carta.cartaId, pronto.corpo.quantidade) : lista));
      // Só fecha o formulário se ainda for o desta carta: os botões da lista
      // ficam desligados enquanto grava, mas a resposta de uma gravação
      // nunca pode apagar a escolha de outra.
      setEscolhida((atual) => escolhaAposGravar(atual, carta));
      pendente.current = "aviso";
      // A lista continua: o foco volta ao botão da carta que acabou de entrar,
      // pronto para a próxima cópia dela, e o aviso é lido pela região viva.
      requestAnimationFrame(() => botoesEscolher.current.get(chaveDoResultado(carta))?.focus({ preventScroll: true }));
    } catch {
      setErro(t("erroRede"));
      pendente.current = "aviso";
    } finally {
      setGravando(false);
    }
  }

  function cancelar() {
    const carta = escolhida;
    setEscolhida(null);
    if (carta) {
      requestAnimationFrame(() => botoesEscolher.current.get(chaveDoResultado(carta))?.focus({ preventScroll: true }));
    }
  }

  /**
   * Depois de criar a carta à mão, busca-a pelo que a pessoa digitou (a
   * sigla e o número, nunca um `cartaId` repartido) e a deixa na lista, para
   * ela escolher e cadastrar a cópia. Nada é gravado em nome dela.
   */
  async function aoCriarManual(criada: CartaManualCriada) {
    setNome("");
    setSiglaNumero("");
    setSetId(criada.setId);
    setNumero(criada.localId);
    const params = new URLSearchParams({ set: criada.setId, numero: criada.localId });
    setConsulta({ tipo: "busca", filtros: { nome: "", set: criada.setId, numero: criada.localId }, siglaNumero: "" });
    const cartas = await pesquisar("busca", params);
    // `pesquisar` zera o aviso ao começar; o desta criação entra depois.
    if (cartas) {
      setAviso({ tom: "neutro", texto: criada.jaExistia ? t("manual.jaExistia") : t("manual.criada") });
      pendente.current = "aviso";
    }
  }

  const sugestao = sugestaoParaCartaManual(consulta.filtros, consulta.siglaNumero, consulta.tipo);
  const semResultado = resultados !== null && resultados.length === 0;

  return (
    <div className={estilos.pagina}>
      <header className={estilos.cabecalho}>
        <h1 className={estilos.titulo}>{t("titulo")}</h1>
        <p className={estilos.subtitulo}>{t("descricao")}</p>
      </header>

      <Painel className={estilos.buscas}>
        <form onSubmit={buscar} className={estilos.formBusca} noValidate>
          <div className={estilos.camposBusca}>
            <div className={estilos.campoNome}>
              <Campo
                rotulo={t("campoNome")}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder={t("placeholderNome")}
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            <div className={estilos.campoSet}>
              <Campo
                rotulo={t("campoSet")}
                value={setId}
                onChange={(e) => setSetId(e.target.value)}
                placeholder={t("placeholderSet")}
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            <div className={estilos.campoNumero}>
              <Campo
                rotulo={t("campoNumero")}
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder={t("placeholderNumero")}
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
          </div>
          <Botao type="submit" variante="primario" carregando={buscando === "busca"} className={estilos.botaoBusca}>
            {buscando === "busca" ? t("buscando") : t("buscar")}
          </Botao>
        </form>

        <form onSubmit={buscarRapido} className={estilos.formBusca} noValidate>
          <div className={estilos.campoSigla}>
            <Campo
              rotulo={t("campoSigla")}
              dica={t("dicaSigla")}
              value={siglaNumero}
              onChange={(e) => setSiglaNumero(e.target.value)}
              placeholder={t("placeholderSigla")}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <Botao type="submit" carregando={buscando === "rapida"} className={estilos.botaoBusca}>
            {buscando === "rapida" ? t("buscando") : t("resolver")}
          </Botao>
        </form>
      </Painel>

      <div ref={refAviso} className={estilos.avisos}>
        {/* A região viva existe sempre, vazia: o leitor de tela só anuncia o
            que entra numa região que já estava no DOM. */}
        <div role="status">
          {aviso && <AvisoEmLinha tom={aviso.tom === "sucesso" ? "sucesso" : "neutro"}>{aviso.texto}</AvisoEmLinha>}
        </div>
        {erro && (
          <AvisoEmLinha tom="perigo" papel="alert">
            {erro}
          </AvisoEmLinha>
        )}
      </div>

      {/* Busca sem resultado ficava muda. Agora diz que não achou e oferece a
          saída: cadastrar a carta à mão, já preenchida com o que foi digitado.
          É aqui que se descobre que a TCGdex não tem a carta. */}
      {semResultado && (
        <Painel className={estilos.vazio}>
          <div>
            <p className={estilos.vazioTitulo}>{t("nenhumaCarta")}</p>
            <p className={estilos.vazioTexto}>{t("nenhumaCartaAjuda")}</p>
          </div>
          <CartaManual
            siglaSugerida={sugestao.sigla}
            numeroSugerido={sugestao.numero}
            nomeSugerido={sugestao.nome}
            aoCriar={aoCriarManual}
          />
        </Painel>
      )}

      {resultados && resultados.length > 0 && (
        <section className={estilos.resultados} aria-labelledby="v2-busca-resultados">
          <h2 id="v2-busca-resultados" className={estilos.contagem}>
            {t("resultados", { total: resultados.length })}
          </h2>
          <ul className={estilos.lista}>
            {resultados.map((carta) => {
              const chave = chaveDoResultado(carta);
              const ativa = escolhida !== null && chaveDoResultado(escolhida) === chave;
              // Chave com `.` não existe no next-intl (`Rare Holo LV.X`): mostra como veio.
              const crua = raridadeExibivel(carta.raridade);
              const raridade = crua && !crua.includes(".") && tRaridade.has(crua) ? tRaridade(crua) : crua;
              return (
                <Fragment key={chave}>
                  <li className={`v2-painel ${estilos.linha} ${ativa ? estilos.linhaAtiva : ""}`}>
                    <button
                      type="button"
                      className={estilos.miniatura}
                      aria-label={t("ampliar", { nome: carta.nome })}
                      onClick={(e) => {
                        abridorZoom.current = e.currentTarget;
                        setAmpliada(carta);
                      }}
                    >
                      <Carta
                        imagemUrl={carta.imagemUrl}
                        origem={carta.imagemOrigem}
                        alt=""
                        raridade={carta.raridade}
                        fallback={<span className={estilos.semImagem} aria-hidden />}
                      />
                    </button>
                    <div className={estilos.corpoLinha}>
                      <h3 className={estilos.nomeCarta}>
                        {carta.nome}
                        {carta.nomeEspecie && carta.nomeEspecie !== carta.nome ? (
                          <span className={estilos.especie}> ({carta.nomeEspecie})</span>
                        ) : null}
                      </h3>
                      <p className={estilos.detalhes}>
                        {carta.setNome} · <span className="v2-num">#{carta.localId}</span> ·{" "}
                        {t("catalogo", { idioma: carta.idiomaCatalogo.toUpperCase() })}
                        {raridade ? ` · ${raridade}` : ""}
                      </p>
                      {carta.qtdPossuida > 0 && (
                        <p className={`${estilos.jaTem} v2-num`}>{t("jaTem", { total: carta.qtdPossuida })}</p>
                      )}
                    </div>
                    <Botao
                      pequeno
                      variante={ativa ? "primario" : "secundario"}
                      aria-pressed={ativa}
                      disabled={gravando}
                      className={estilos.escolher}
                      ref={(el) => {
                        if (el) botoesEscolher.current.set(chave, el);
                        else botoesEscolher.current.delete(chave);
                      }}
                      onClick={() => abrirFormulario(carta)}
                    >
                      {ativa ? t("escolhida") : t("cadastrarCopia")}
                    </Botao>
                  </li>
                  {/* O formulário abre logo abaixo da carta escolhida: numa lista
                      de cem, um formulário no fim da página ficaria a milhares de
                      pixels de quem acabou de tocar, e cancelar o devolveria lá. */}
                  {ativa && escolhida && form && (
                    <li className={estilos.itemFormulario}>
                      <FormularioCopiaBusca
                        carta={escolhida}
                        form={form}
                        aoMudar={setForm}
                        aoGravar={gravar}
                        aoCancelar={cancelar}
                        gravando={gravando}
                        erroQuantidade={quantidadeInvalida}
                        titulo={t("copia.titulo", { nome: escolhida.nome, set: escolhida.setNome, numero: escolhida.localId })}
                        refTitulo={refTituloForm}
                      />
                    </li>
                  )}
                </Fragment>
              );
            })}
          </ul>
          <div className={estilos.naoE}>
            <p className={estilos.vazioTexto}>{t("nenhumaDessas")}</p>
            <CartaManual
              siglaSugerida={sugestao.sigla}
              numeroSugerido={sugestao.numero}
              nomeSugerido={sugestao.nome}
              aoCriar={aoCriarManual}
            />
          </div>
        </section>
      )}

      <AmpliarCarta carta={ampliada} onFechar={() => setAmpliada(null)} devolverFocoPara={() => abridorZoom.current} />
    </div>
  );
}
