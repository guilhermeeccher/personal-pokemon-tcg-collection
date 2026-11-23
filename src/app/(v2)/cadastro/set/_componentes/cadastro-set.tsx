"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";

import { textoDaRecusa } from "@/app/_comum/recusa";
import { casaNumeroCarta } from "@/lib/dominio/busca-carta";
import {
  caminhoGradeDoSet,
  lerRespostaLote,
  proximaCarta,
  resultadoPorLinha,
  totaisDoLote,
} from "@/lib/dominio/cadastro-set-v2";
import { CONDICOES, IDIOMAS, VARIANTES_COPIA } from "@/lib/dominio/enums";
import {
  DEFAULTS_INICIAIS,
  type DefaultsGrade,
  type ItemSubmissaoGrade,
  construirItensSubmissao,
  estadoGradeInicial,
  reduzirGrade,
} from "@/lib/dominio/grade-set";
import type { CartaParaGradeDTO, GradeDoSetDTO } from "@/lib/dominio/tipos-cliente";

import { type ControleGradeVirtual, GradeVirtual, type PropsCelula } from "../../../_componentes/grade/grade-virtual";
import { Botao } from "../../../_componentes/primitivos/botao";
import { Campo, Selecao } from "../../../_componentes/primitivos/campo";
import { useConfirmacao } from "../../../_componentes/primitivos/dialogo-confirmacao";
import { AvisoEmLinha, Painel } from "../../../_componentes/primitivos/painel";
import estilos from "./cadastro-set.module.css";
import { ALTURA_CELULA, ATRIBUTO_QUANTIDADE, CelulaCarta } from "./celula-carta";
import { flagsDaCarta } from "./flags";
import { AjusteCarta, ZoomCarta } from "./janelas";
import { type SetEscolhido, SeletorSet } from "./seletor-set";

type Leitura =
  | { estado: "nada" }
  | { estado: "carregando" }
  | { estado: "erro" }
  | { estado: "pronta"; grade: GradeDoSetDTO };

interface LinhaVista {
  item: ItemSubmissaoGrade;
  carta: CartaParaGradeDTO | undefined;
}

type Resultado =
  | { tipo: "gravado"; inseridas: number; fundidas: number; setNome: string; linhas: LinhaVista[] }
  | { tipo: "recusado"; texto: string; recusadas: LinhaVista[] }
  | { tipo: "rede" };

/** A largura mínima de uma célula: uma coluna no celular, mais conforme a largura. */
const MIN_CELULA = 300;

/**
 * O cadastro por set da v2 (`/cadastro/set`, pacote 3a), feito primeiro para
 * o celular, com a carta na mão.
 *
 * - **O lote é o da v1**: o estado e a regra de materialização são
 *   `reduzirGrade`, e a gravação é o mesmo `POST /api/sets/:setId/copias`
 *   com o mesmo corpo (`construirItensSubmissao`), cada item com o
 *   `idiomaCatalogo` da própria carta — a grade decide a ficha carta a carta
 *   (pt→en), e o servidor confere a variante de cada carta contra a sua
 *   ficha. O idioma de cada cópia é o da carta física (regra 7), escolhido no
 *   padrão do lote ou na carta, nunca amarrado ao catálogo.
 * - **A grade é a `GradeVirtual`** (pacote 1d): monta tudo até o limiar medido
 *   e virtualiza acima dele. Nada mora na célula — quantidades, ajustes e
 *   recusas são deste estado, por carta.
 * - **Enter vai à próxima carta**, e na última ao "Gravar lote". O foco é
 *   posto na hora quando a próxima já está montada (o caso de sempre: a faixa
 *   tem linhas de sobra), para o teclado do iPhone não fechar entre uma
 *   carta e outra; só uma carta fora da faixa espera a grade montá-la.
 * - **O resultado é linha a linha**: gravado, a lista do que entrou; recusado
 *   (o lote é tudo ou nada), as cartas que o servidor recusou, marcadas também
 *   na grade. Sem resposta, a grade é relida e a tela diz que o lote pode ter
 *   entrado, em vez de convidar a gravar duas vezes.
 */
export function CadastroSet() {
  const t = useTranslations("v2CadastroSet");
  const tr = useTranslations("recusas");
  const tc = useTranslations("componentes");
  const { confirmar, dialogo } = useConfirmacao();

  const [escolhido, setEscolhido] = useState<SetEscolhido | null>(null);
  const [leitura, setLeitura] = useState<Leitura>({ estado: "nada" });
  const [estado, despachar] = useReducer(reduzirGrade, DEFAULTS_INICIAIS, estadoGradeInicial);
  const [filtroNumero, setFiltroNumero] = useState("");
  const [padraoAberto, setPadraoAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [ajustando, setAjustando] = useState<string | null>(null);
  const [ampliando, setAmpliando] = useState<string | null>(null);

  const idPadrao = useId();
  const idTituloPadrao = useId();
  const lista = useRef<HTMLDivElement>(null);
  const controle = useRef<ControleGradeVirtual>(null);
  const botaoGravar = useRef<HTMLButtonElement>(null);
  const painelResultado = useRef<HTMLDivElement>(null);

  /* ---------- Leitura da grade ---------- */

  const leituraViva = useRef<AbortController | null>(null);
  useEffect(() => () => leituraViva.current?.abort(), []);

  /**
   * Lê a grade do set escolhido, abortando a leitura anterior (uma troca
   * rápida de set nunca deixa a resposta velha por cima da nova). A leitura
   * silenciosa é a releitura depois de gravar: falhando, a grade de antes
   * fica, só com o "você tem" de antes.
   */
  const ler = useCallback((escolha: SetEscolhido, silenciosa: boolean) => {
    leituraViva.current?.abort();
    const controlador = new AbortController();
    leituraViva.current = controlador;
    if (!silenciosa) setLeitura({ estado: "carregando" });
    fetch(caminhoGradeDoSet(escolha.set.setId, escolha.catalogo), { signal: controlador.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((grade: GradeDoSetDTO) => {
        if (!controlador.signal.aborted) setLeitura({ estado: "pronta", grade });
      })
      .catch(() => {
        if (!controlador.signal.aborted && !silenciosa) setLeitura({ estado: "erro" });
      });
  }, []);

  async function escolher(nova: SetEscolhido) {
    if (enviando) return;
    if (escolhido && nova.set.setId === escolhido.set.setId && nova.catalogo === escolhido.catalogo) return;
    const { cartas } = totaisDoLote(estado);
    if (cartas > 0) {
      const ok = await confirmar({
        titulo: t("trocarSet.titulo"),
        descricao: t("trocarSet.descricao", { total: cartas }),
        rotuloConfirmar: t("trocarSet.confirmar"),
        perigoso: true,
      });
      if (!ok) return;
    }
    setEscolhido(nova);
    despachar({ tipo: "reset" });
    setFiltroNumero("");
    setResultado(null);
    ler(nova, false);
  }

  const grade = leitura.estado === "pronta" ? leitura.grade : null;

  // Filtro por número sobre a grade já lida (carta avulsa comprada solta);
  // tolera zero à esquerda (`casaNumeroCarta`).
  const cartas = useMemo(
    () => grade?.cartas.filter((c) => casaNumeroCarta(c.localId, filtroNumero)) ?? [],
    [grade, filtroNumero],
  );
  const porId = useMemo(() => new Map((grade?.cartas ?? []).map((c) => [c.cartaId, c])), [grade]);
  const totais = totaisDoLote(estado);

  /* ---------- Edição ---------- */

  const aoMudarQuantidade = useCallback((carta: CartaParaGradeDTO, quantidade: number) => {
    despachar({ tipo: "quantidade", cartaId: carta.cartaId, valor: quantidade, flags: flagsDaCarta(carta) });
  }, []);

  // A ordem à vista mais recente, para o Enter não refazer o callback de toda célula.
  const ordem = useRef<readonly string[]>([]);
  useLayoutEffect(() => {
    ordem.current = cartas.map((c) => c.cartaId);
  });

  const aoEnter = useCallback((cartaId: string) => {
    const proxima = proximaCarta(ordem.current, cartaId);
    if (!proxima) {
      botaoGravar.current?.focus();
      return;
    }
    const focar = (el: HTMLElement | null) => {
      if (!el) return;
      el.focus({ preventScroll: true });
      // Respeita a margem de rolagem do campo: a carta para acima da barra do lote.
      el.scrollIntoView({ block: "nearest" });
    };
    const montada = lista.current?.querySelector<HTMLElement>(`[${ATRIBUTO_QUANTIDADE}="${CSS.escape(proxima)}"]`);
    if (montada) focar(montada);
    else void controle.current?.elementoDe(proxima).then(focar);
  }, []);

  const aoAjustar = useCallback((cartaId: string) => setAjustando(cartaId), []);
  const aoAmpliar = useCallback((cartaId: string) => setAmpliando(cartaId), []);

  const recusadas = useMemo(
    () => new Set(resultado?.tipo === "recusado" ? resultado.recusadas.map((l) => l.item.cartaId) : []),
    [resultado],
  );

  const renderizar = useCallback(
    (carta: CartaParaGradeDTO, celula: PropsCelula) => (
      <CelulaCarta
        carta={carta}
        linha={estado.linhas[carta.cartaId]}
        padrao={estado.defaults}
        recusada={recusadas.has(carta.cartaId)}
        celula={celula}
        aoMudarQuantidade={aoMudarQuantidade}
        aoEnter={aoEnter}
        aoAjustar={aoAjustar}
        aoAmpliar={aoAmpliar}
      />
    ),
    [estado, recusadas, aoMudarQuantidade, aoEnter, aoAjustar, aoAmpliar],
  );

  /* ---------- Gravação ---------- */

  async function gravar() {
    if (!grade || !escolhido || enviando) return;
    const idiomaPorCarta = new Map(grade.cartas.map((c) => [c.cartaId, c.idiomaCatalogo]));
    const itens = construirItensSubmissao(estado, (cartaId) => idiomaPorCarta.get(cartaId) ?? grade.idiomaCatalogo);
    if (itens.length === 0) return;

    setEnviando(true);
    setResultado(null);
    try {
      let resp: Response;
      try {
        resp = await fetch(`/api/sets/${encodeURIComponent(grade.setId)}/copias`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itens }),
        });
      } catch {
        // Sem resposta: o lote pode ter entrado. Relê o "você tem" e mantém o
        // lote na tela, dizendo para conferir antes de gravar de novo.
        setResultado({ tipo: "rede" });
        ler(escolhido, true);
        return;
      }
      const corpo: unknown = await resp.json().catch(() => null);
      const lida = lerRespostaLote(resp.ok, corpo);
      if (lida.ok) {
        setResultado({
          tipo: "gravado",
          inseridas: lida.inseridas,
          fundidas: lida.fundidas,
          setNome: grade.setNome,
          linhas: itens.map((item) => ({ item, carta: porId.get(item.cartaId) })),
        });
        despachar({ tipo: "reset" });
        ler(escolhido, true);
      } else {
        const { linhas } = resultadoPorLinha(itens, lida.detalhes);
        setResultado({
          tipo: "recusado",
          texto: textoDaRecusa(tr, corpo, t("resultado.padrao")),
          recusadas: linhas.filter((l) => l.recusada).map((l) => ({ item: l.item, carta: porId.get(l.item.cartaId) })),
        });
      }
    } finally {
      setEnviando(false);
    }
  }

  // O resultado aparece acima da grade; depois de gravar, a tela vai até ele
  // (no celular, quem tocou "Gravar" está no pé da página).
  useEffect(() => {
    if (!resultado) return;
    const el = painelResultado.current;
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: "center" });
  }, [resultado]);

  /* ---------- Tela ---------- */

  const nomeVariante = (v: string) => tc(`variante.${v}`);
  const resumoPadrao = [nomeVariante(estado.defaults.variante), estado.defaults.idioma.toUpperCase(), estado.defaults.condicao].join(" · ");
  const mudarPadrao = (campo: keyof DefaultsGrade, valor: string) => despachar({ tipo: "campoDefault", campo, valor });

  const cartaAjustada = ajustando ? (porId.get(ajustando) ?? null) : null;
  const cartaAmpliada = ampliando ? (porId.get(ampliando) ?? null) : null;
  const manterMontadas = useMemo(() => [ajustando, ampliando].filter((c): c is string => c !== null), [ajustando, ampliando]);

  return (
    <div className={estilos.pagina}>
      <header>
        <h1 className={estilos.titulo}>{t("titulo")}</h1>
        <p className={estilos.descricao}>{t("descricao")}</p>
      </header>

      <Painel as="section" aria-label={t("seletor.titulo")}>
        <SeletorSet escolhido={escolhido} aoEscolher={(e) => void escolher(e)} />
      </Painel>

      {leitura.estado === "carregando" ? (
        <p className={estilos.carregando} role="status">
          {t("carregando")}
        </p>
      ) : null}
      {leitura.estado === "erro" && escolhido ? (
        <AvisoEmLinha
          tom="perigo"
          papel="alert"
          titulo={t("erroGrade")}
          acao={
            <Botao pequeno onClick={() => ler(escolhido, false)}>
              {t("tentarDeNovo")}
            </Botao>
          }
        />
      ) : null}

      {resultado ? (
        <div ref={painelResultado} tabIndex={-1} className={estilos.resultado}>
          <PainelResultado resultado={resultado} aoFechar={() => setResultado(null)} nomeVariante={nomeVariante} />
        </div>
      ) : null}

      {grade ? (
        <>
          <div className={estilos.cabecaSet}>
            <h2 className={estilos.nomeSet}>{grade.setNome}</h2>
            <span className={`${estilos.infoSet} v2-num`}>
              {grade.setId} · {t("contagemCartas", { total: grade.cartas.length })}
            </span>
          </div>

          <AvisoCatalogo
            grade={grade}
            idiomaDoLote={estado.defaults.idioma}
            aoUsarJp={() => mudarPadrao("idioma", "jp")}
          />

          <Painel as="section" aria-labelledby={idTituloPadrao} className={estilos.padrao}>
            <div className={estilos.padraoCabeca}>
              <h2 id={idTituloPadrao} className={estilos.padraoTitulo}>
                {t("padrao.titulo")}
              </h2>
              <span className={estilos.padraoResumo}>{resumoPadrao}</span>
              <Botao
                pequeno
                className={estilos.padraoAlternar}
                aria-expanded={padraoAberto}
                aria-controls={idPadrao}
                onClick={() => setPadraoAberto((a) => !a)}
              >
                {padraoAberto ? t("padrao.fechar") : t("padrao.alterar")}
              </Botao>
            </div>
            <div id={idPadrao} className={estilos.padraoCampos} data-aberto={padraoAberto || undefined}>
              <Selecao
                rotulo={t("padrao.variante")}
                value={estado.defaults.variante}
                onChange={(e) => mudarPadrao("variante", e.target.value)}
              >
                {VARIANTES_COPIA.map((v) => (
                  <option key={v} value={v}>
                    {nomeVariante(v)}
                  </option>
                ))}
              </Selecao>
              <Selecao
                rotulo={t("padrao.idioma")}
                value={estado.defaults.idioma}
                onChange={(e) => mudarPadrao("idioma", e.target.value)}
              >
                {IDIOMAS.map((i) => (
                  <option key={i} value={i}>
                    {t(`idioma.${i}`)}
                  </option>
                ))}
              </Selecao>
              <Selecao
                rotulo={t("padrao.condicao")}
                value={estado.defaults.condicao}
                onChange={(e) => mudarPadrao("condicao", e.target.value)}
              >
                {CONDICOES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Selecao>
            </div>
            <p className={estilos.padraoExplica}>{t("padrao.explica")}</p>
          </Painel>

          <div className={estilos.filtroNumero}>
            <Campo
              rotulo={t("filtro.rotulo")}
              placeholder={t("filtro.placeholder")}
              value={filtroNumero}
              onChange={(e) => setFiltroNumero(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              enterKeyHint="search"
            />
          </div>

          <div ref={lista}>
            {cartas.length > 0 ? (
              <GradeVirtual
                ref={controle}
                itens={cartas}
                chaveDe={chaveDaCarta}
                renderizar={renderizar}
                minCelula={MIN_CELULA}
                vaoX={10}
                vaoY={10}
                proporcao={0}
                alturaExtra={ALTURA_CELULA}
                manterMontadas={manterMontadas}
                rotulo={t("lista", { set: grade.setNome })}
              />
            ) : (
              <Painel className={estilos.nenhuma}>{t("filtro.nenhuma")}</Painel>
            )}
          </div>

          <div className={`${estilos.barra} v2-painel-flutuante`} role="region" aria-label={t("barra.rotulo")}>
            <span className={estilos.barraTexto} data-vazio={totais.cartas === 0 || undefined} aria-live="polite">
              {totais.cartas === 0 ? t("barra.nada") : t("barra.totais", totais)}
            </span>
            <Botao ref={botaoGravar} variante="primario" carregando={enviando} disabled={totais.cartas === 0} onClick={() => void gravar()}>
              {t("barra.gravar")}
            </Botao>
          </div>
        </>
      ) : null}

      <AjusteCarta
        carta={cartaAjustada}
        linha={ajustando ? estado.linhas[ajustando] : undefined}
        padrao={estado.defaults}
        aoMudar={(cartaId, campo, valor) => despachar({ tipo: "campoLinha", cartaId, campo, valor })}
        onFechar={() => setAjustando(null)}
      />
      <ZoomCarta carta={cartaAmpliada} onFechar={() => setAmpliando(null)} />
      {dialogo}
    </div>
  );
}

function chaveDaCarta(carta: CartaParaGradeDTO): string {
  return carta.cartaId;
}

/**
 * De qual catálogo vêm as fichas desta grade. A mesma informação da v1 (pt,
 * en, misto), mais o japonês, que a v1 não distinguia: o idioma do lote
 * continua sendo o da carta física (regra 7), e com o catálogo japonês a tela
 * oferece — sem decidir sozinha — trocar o padrão do lote para japonês.
 */
function AvisoCatalogo({
  grade,
  idiomaDoLote,
  aoUsarJp,
}: {
  grade: GradeDoSetDTO;
  idiomaDoLote: string;
  aoUsarJp: () => void;
}) {
  const t = useTranslations("v2CadastroSet.catalogo");
  if (grade.idiomaCatalogo === "jp") {
    return (
      <AvisoEmLinha
        titulo={t("jp")}
        acao={
          idiomaDoLote !== "jp" ? (
            <Botao pequeno onClick={aoUsarJp}>
              {t("usarJp")}
            </Botao>
          ) : null
        }
      >
        {t("jpTexto")}
      </AvisoEmLinha>
    );
  }
  if (grade.idiomaCatalogo === "en") {
    return (
      <AvisoEmLinha tom="alerta" titulo={t("en")}>
        {t("enTexto")}
      </AvisoEmLinha>
    );
  }
  return (
    <>
      <AvisoEmLinha titulo={t("pt")}>{t("ptTexto")}</AvisoEmLinha>
      {grade.cartasEmOutroIdioma > 0 ? (
        <AvisoEmLinha tom="alerta">{t("misto", { total: grade.cartasEmOutroIdioma })}</AvisoEmLinha>
      ) : null}
    </>
  );
}

function PainelResultado({
  resultado,
  aoFechar,
  nomeVariante,
}: {
  resultado: Resultado;
  aoFechar: () => void;
  nomeVariante: (v: string) => string;
}) {
  const t = useTranslations("v2CadastroSet.resultado");
  const fechar = (
    <Botao pequeno onClick={aoFechar}>
      {t("fechar")}
    </Botao>
  );
  const linha = ({ item, carta }: LinhaVista) => (
    <li key={item.cartaId}>
      <span className="v2-num">#{carta?.localId ?? "?"}</span> {carta?.nome ?? item.cartaId} — {item.quantidade}× ·{" "}
      {nomeVariante(item.variante)} · {item.idioma.toUpperCase()} · {item.condicao}
    </li>
  );

  if (resultado.tipo === "rede") {
    return (
      <AvisoEmLinha tom="alerta" papel="alert" titulo={t("rede")} acao={fechar}>
        {t("redeTexto")}
      </AvisoEmLinha>
    );
  }
  if (resultado.tipo === "recusado") {
    return (
      <AvisoEmLinha tom="perigo" papel="alert" titulo={t("recusado")} acao={fechar}>
        {resultado.texto} {t("tudoOuNada")}
        {resultado.recusadas.length > 0 ? (
          <>
            <b className={estilos.resultadoTitulo}>{t("linhasRecusadas")}</b>
            <ul className={estilos.resultadoLista}>{resultado.recusadas.map(linha)}</ul>
          </>
        ) : null}
      </AvisoEmLinha>
    );
  }
  return (
    <AvisoEmLinha tom="sucesso" papel="status" titulo={t("gravado")} acao={fechar}>
      {resultado.fundidas > 0
        ? t("textoComFusao", { inseridas: resultado.inseridas, fundidas: resultado.fundidas, set: resultado.setNome })
        : t("textoGravado", { inseridas: resultado.inseridas, set: resultado.setNome })}
      <details className={estilos.resultadoLinhas}>
        <summary>{t("verLinhas", { total: resultado.linhas.length })}</summary>
        <ul className={estilos.resultadoLista}>{resultado.linhas.map(linha)}</ul>
      </details>
    </AvisoEmLinha>
  );
}
