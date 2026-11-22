"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useReducer, useRef, useState } from "react";

import { CONDICOES, IDIOMAS } from "@/lib/dominio/enums";
import { casaNumeroCarta } from "@/lib/dominio/busca-carta";
import {
  DEFAULTS_INICIAIS,
  construirItensSubmissao,
  estadoGradeInicial,
  reduzirGrade,
} from "@/lib/dominio/grade-set";
import { variantesDisponiveis } from "@/lib/dominio/variantes-catalogo";
import { Alerta } from "@/app/_componentes/alerta";
import { Botao } from "@/app/_componentes/botao";
import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { Distintivo } from "@/app/_componentes/distintivo";
import { Campo, classesEntrada } from "@/app/_componentes/campo";
import { ImagemCartaComZoom } from "@/app/_componentes/imagem-carta-zoom";
import { SeletorExpansao } from "@/app/_componentes/seletor-expansao";
import { Quantidade } from "@/app/_componentes/quantidade";
import {
  classesCabecalhoEmpilhado,
  classesCelulaCabecalho,
  classesCelulaEmpilhada,
  classesLinha,
  classesLinhaCabecalho,
  classesTabelaEmpilhada,
  Tabela,
} from "@/app/_componentes/tabela";
import { useEhMobile } from "@/app/_componentes/use-eh-mobile";
import type { CartaParaGradeDTO, GradeDoSetDTO } from "@/lib/dominio/tipos-cliente";
import { NomeCarta } from "@/app/_componentes/nome-carta";
import { textoDaRecusa } from "@/app/_componentes/recusa";

/* Linha da grade no celular (< 768px): um cartão em vez de 7 colunas.

   Primeira linha: miniatura, número e nome (com o "já tem"); depois a
   quantidade na largura toda, e os três selects embaixo — variante na
   largura toda (é o valor mais comprido) e idioma e condição lado a lado,
   numa grade de 2 colunas. É a mesma `<tr>` do desktop com classes
   `max-md:` (uma árvore só): refs, `tabIndex`, Enter e o reducer não mudam.

   Por que `flex-wrap` e não a grade de `classesLinhaEmpilhada`: a primeira
   linha tem três campos de larguras diferentes (miniatura e número no
   tamanho do conteúdo, o nome com o resto) e a última tem duas metades
   iguais. Numa `grid` isso pede colunas que não servem às duas linhas ao
   mesmo tempo; no `flex-wrap`, cada célula diz a própria base. */
const classesLinhaCartao =
  "max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:gap-y-2 max-md:p-3";
/** Meia largura da linha do cartão, descontada a metade do `gap-x-3`. */
const classesMetadeCartao = "max-md:grow max-md:basis-[calc(50%-0.375rem)]";

/* Barra de ação fixa do celular: "N marcada(s)" + "Gravar lote" grudados
   embaixo, na zona do polegar, acima da barra de gestos do iPhone. É o MESMO
   bloco que, do `md` para cima, fica à direita na barra do padrão do lote —
   só a posição muda. Altura: 12 + 44 + 12 px + a área segura; o conteúdo
   reserva um pouco mais que isso (`classesReservaBarra`). */
const classesBarraFixa =
  "max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-30 max-md:ml-0 max-md:justify-between max-md:border-t max-md:border-line max-md:bg-surface max-md:px-4 max-md:pt-3 max-md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]";
// `!`: entre 640 e 767px o `sm:p-8` da página venceria esta reserva (mesma
// especificidade, ordem do CSS) e o fim da grade ficaria sob a barra.
const classesReservaBarra = "max-md:pb-[calc(5.5rem+env(safe-area-inset-bottom))]!";

function flagsDaCarta(carta: CartaParaGradeDTO) {
  return {
    varianteNormalDisponivel: carta.varianteNormalDisponivel,
    varianteReverseDisponivel: carta.varianteReverseDisponivel,
    varianteHoloDisponivel: carta.varianteHoloDisponivel,
    variantePrimeiraEdicaoDisponivel: carta.variantePrimeiraEdicaoDisponivel,
    variantePromoDisponivel: carta.variantePromoDisponivel,
  };
}

export default function CadastroPorSetPage() {
  const t = useTranslations("cadastroSet");
  const tr = useTranslations("recusas");
  const tm = useTranslations("componentes.mobile");
  const [setSelecionado, setSetSelecionado] = useState("");
  const [grade, setGrade] = useState<GradeDoSetDTO | null>(null);
  const [carregandoGrade, setCarregandoGrade] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [estado, dispatch] = useReducer(reduzirGrade, estadoGradeInicial(DEFAULTS_INICIAIS));

  // Filtro por número dentro da grade já carregada (carta avulsa comprada
  // solta): tolera zero à esquerda ("4"/"04"/"004" acham "004").
  const [filtroNumero, setFiltroNumero] = useState("");

  const refsQuantidade = useRef<Record<string, HTMLInputElement | null>>({});

  const ehMobile = useEhMobile();

  // Celular: o padrão do lote fica recolhido num resumo ("Padrão do lote:
  // normal · pt · NM — Alterar"). Do `md` para cima este estado não tem
  // efeito: os selects aparecem sempre, como hoje.
  const [padraoAberto, setPadraoAberto] = useState(false);
  const idPadrao = useId();

  // Celular: o "Gravar lote" fica na barra de baixo, e o resultado (gravado ou
  // erro) aparece no topo da página, fora da tela de quem acabou de tocar.
  // Depois de gravar, leva a página até o aviso. Só no envio, e só uma vez:
  // girar o aparelho não rola de novo.
  const rolarAteAviso = useRef(false);
  const refAviso = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    if (!rolarAteAviso.current || (!mensagem && !erro)) return;
    rolarAteAviso.current = false;
    if (ehMobile) refAviso.current?.scrollIntoView({ block: "center" });
  }, [mensagem, erro, ehMobile]);

  function selecionarSet(novoSetId: string) {
    setSetSelecionado(novoSetId);
    setMensagem(null);
    setErro(null);
    setFiltroNumero("");
    dispatch({ tipo: "reset" });
    if (!novoSetId) {
      setGrade(null);
      return;
    }
    setGrade(null);
    setCarregandoGrade(true);
    fetch(`/api/sets/${encodeURIComponent(novoSetId)}/cartas`)
      .then((r) => r.json())
      .then((d: GradeDoSetDTO) => setGrade(d))
      .catch(() => setErro(t("erroGrade")))
      .finally(() => setCarregandoGrade(false));
  }

  const gradeAtual = grade && grade.setId === setSelecionado ? grade : null;

  const totalMarcadas = useMemo(
    () => Object.values(estado.linhas).filter((l) => l.quantidade > 0).length,
    [estado.linhas],
  );

  // Filtro por número: carta avulsa comprada solta (tolera zero à
  // esquerda — lib/dominio/busca-carta.ts). Sobre a grade já carregada,
  // sem round-trip ao servidor.
  const cartasFiltradas = useMemo(
    () => gradeAtual?.cartas.filter((c) => casaNumeroCarta(c.localId, filtroNumero)) ?? [],
    [gradeAtual, filtroNumero],
  );

  const cartaIdsOrdenados = useMemo(() => cartasFiltradas.map((c) => c.cartaId), [cartasFiltradas]);

  function focarProximaQuantidade(cartaId: string) {
    const idx = cartaIdsOrdenados.indexOf(cartaId);
    const proximoId = cartaIdsOrdenados[idx + 1];
    if (proximoId) refsQuantidade.current[proximoId]?.focus();
  }

  async function enviar() {
    if (!gradeAtual) return;
    const idiomaPorCarta = new Map(gradeAtual.cartas.map((c) => [c.cartaId, c.idiomaCatalogo]));
    const itens = construirItensSubmissao(
      estado,
      (cartaId) => idiomaPorCarta.get(cartaId) ?? gradeAtual.idiomaCatalogo,
    );
    if (itens.length === 0) return;

    setEnviando(true);
    setErro(null);
    setMensagem(null);
    try {
      const resp = await fetch(`/api/sets/${encodeURIComponent(gradeAtual.setId)}/copias`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens }),
      });
      const dados = await resp.json();
      if (!resp.ok) {
        setErro(textoDaRecusa(tr, dados, t("erroLote")));
        return;
      }
      setMensagem(
        dados.fundidas > 0
          ? t("loteComFusao", {
              inseridas: dados.inseridas,
              fundidas: dados.fundidas,
              set: gradeAtual.setNome,
            })
          : t("loteGravado", { inseridas: dados.inseridas, set: gradeAtual.setNome }),
      );
      dispatch({ tipo: "reset" });
    } catch {
      setErro(t("erroRede"));
    } finally {
      setEnviando(false);
      rolarAteAviso.current = true;
    }
  }

  return (
    <main className={`mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-8 ${gradeAtual ? classesReservaBarra : ""}`}>
      <CabecalhoPagina
        titulo={t("titulo")}
        descricao={t("descricao")}
      />

      <SeletorExpansao
        setSelecionadoId={setSelecionado}
        onSelecionar={(set) => selecionarSet(set?.setId ?? "")}
      />

      {carregandoGrade && <p className="text-sm text-muted">{t("carregandoGrade")}</p>}
      {erro && (
        <p ref={refAviso} className="text-sm text-danger">
          {erro}
        </p>
      )}
      {mensagem && (
        <p ref={refAviso} className="text-sm text-success-fg">
          {mensagem}
        </p>
      )}

      {gradeAtual && (
        <>
          {!gradeAtual.temPt ? (
            <Alerta tom="aviso">
              {t.rich("catalogoEn", {
                forte: (partes) => <strong>{partes}</strong>,
                codigo: (partes) => <code>{partes}</code>,
              })}
            </Alerta>
          ) : (
            <Alerta tom="neutro">
              {t.rich("catalogoPt", { forte: (partes) => <strong>{partes}</strong> })} —{" "}
              {gradeAtual.setNome}
            </Alerta>
          )}
          {gradeAtual.temPt && gradeAtual.cartasEmOutroIdioma > 0 && (
            <Alerta tom="aviso">
              {t("catalogoMisto", { total: gradeAtual.cartasEmOutroIdioma })}
            </Alerta>
          )}

          {/* Celular: não gruda no topo (na tela de 852px a barra comeria um
              quarto da altura) e perde o desfoque — além de não servir sem o
              `sticky`, `backdrop-filter` faz do painel o bloco de contenção de
              quem é `fixed` dentro dele, e a barra de baixo grudaria no painel
              em vez de na tela. */}
          <div className="sticky top-0 z-10 rounded-card flex flex-wrap items-end gap-4 rounded border border-line bg-surface/95 p-3 backdrop-blur max-md:static max-md:items-center max-md:gap-x-3 max-md:gap-y-3 max-md:[-webkit-backdrop-filter:none] max-md:[backdrop-filter:none]">
            <span className="text-sm font-medium">{t("padraoLote")}</span>
            {/* Resumo do celular. `md:hidden`: no desktop não existe nem para
                o leitor de tela, e os selects continuam à mostra. */}
            <span className="min-w-0 flex-1 text-sm text-muted md:hidden">
              {estado.defaults.variante} · {estado.defaults.idioma} · {estado.defaults.condicao}
            </span>
            <Botao
              type="button"
              variante="secundario"
              tamanho="sm"
              className="md:hidden"
              aria-expanded={padraoAberto}
              aria-controls={idPadrao}
              onClick={() => setPadraoAberto((v) => !v)}
            >
              {padraoAberto ? tm("fechar") : tm("alterar")}
            </Botao>
            {/* `md:contents`: do `md` para cima este invólucro não gera caixa,
                e os três selects voltam a ser itens da barra, como sempre. No
                celular é o painel recolhível, em 2 colunas. */}
            <div
              id={idPadrao}
              className={`md:contents ${
                padraoAberto ? "max-md:grid max-md:basis-full max-md:grid-cols-2 max-md:gap-3" : "max-md:hidden"
              }`}
            >
              <CampoSelect
                className="max-md:col-span-2"
                rotulo={t("colunaVariante")}
                valor={estado.defaults.variante}
                opcoes={variantesDisponiveis({
                  varianteNormalDisponivel: true,
                  varianteReverseDisponivel: true,
                  varianteHoloDisponivel: true,
                  variantePrimeiraEdicaoDisponivel: true,
                  variantePromoDisponivel: true,
                })}
                onChange={(v) => dispatch({ tipo: "campoDefault", campo: "variante", valor: v })}
              />
              <CampoSelect
                rotulo={t("colunaIdioma")}
                valor={estado.defaults.idioma}
                opcoes={IDIOMAS}
                onChange={(v) => dispatch({ tipo: "campoDefault", campo: "idioma", valor: v })}
              />
              <CampoSelect
                rotulo={t("colunaCondicao")}
                valor={estado.defaults.condicao}
                opcoes={CONDICOES}
                onChange={(v) => dispatch({ tipo: "campoDefault", campo: "condicao", valor: v })}
              />
            </div>
            <div className={`ml-auto flex items-center gap-3 ${classesBarraFixa}`}>
              <span className="text-sm text-muted">{t("marcadas", { total: totalMarcadas })}</span>
              <Botao
                type="button"
                variante="primario"
                onClick={enviar}
                disabled={enviando || totalMarcadas === 0}
              >
                {enviando ? t("gravando") : t("gravarLote")}
              </Botao>
            </div>
          </div>

          <Campo rotulo={t("filtrarNumero")} className="max-w-xs">
            <input
              value={filtroNumero}
              onChange={(e) => setFiltroNumero(e.target.value)}
              placeholder={t("placeholderNumero")}
              className={classesEntrada}
            />
          </Campo>

          <Tabela className={classesTabelaEmpilhada}>
            <thead className={classesCabecalhoEmpilhado}>
              <tr className={classesLinhaCabecalho}>
                <th className={classesCelulaCabecalho}></th>
                <th className={classesCelulaCabecalho}>#</th>
                <th className={classesCelulaCabecalho}>{t("colunaNome")}</th>
                <th className={classesCelulaCabecalho}>{t("colunaQtd")}</th>
                <th className={classesCelulaCabecalho}>{t("colunaVariante")}</th>
                <th className={classesCelulaCabecalho}>{t("colunaIdioma")}</th>
                <th className={classesCelulaCabecalho}>{t("colunaCondicao")}</th>
              </tr>
            </thead>
            <tbody className={classesTabelaEmpilhada}>
              {cartasFiltradas.map((carta, indice) => {
                const linha = estado.linhas[carta.cartaId];
                const possui = (linha?.quantidade ?? 0) > 0;
                const flags = flagsDaCarta(carta);
                const opcoesVariante = variantesDisponiveis(flags);
                return (
                  <tr
                    key={carta.cartaId}
                    className={`${classesLinha} ${classesLinhaCartao} ${possui ? "bg-success-soft" : ""}`}
                  >
                    <td className={`p-2 ${classesCelulaEmpilhada} max-md:shrink-0`}>
                      <ImagemCartaComZoom
                        imagemUrl={carta.imagemUrl}
                        origem={carta.imagemOrigem}
                        alt={carta.nome}
                        width={40}
                        height={55}
                        className="rounded-tcg"
                      />
                    </td>
                    <td className={`p-2 tabular-nums text-muted ${classesCelulaEmpilhada} max-md:shrink-0`}>
                      {carta.localId}
                    </td>
                    <td className={`p-2 ${classesCelulaEmpilhada} max-md:flex-1`}>
                      <NomeCarta nome={carta.nome} nomeEspecie={carta.nomeEspecie} />
                      {carta.qtdPossuida > 0 && (
                        <Distintivo tom="aviso" className="ml-2">
                          {t("jaTem", { total: carta.qtdPossuida })}
                        </Distintivo>
                      )}
                    </td>
                    <td className={`p-2 ${classesCelulaEmpilhada} max-md:basis-full`}>
                      {/* Desktop: o mesmo `<input>` de sempre (`Quantidade` o
                          devolve sem invólucro). Celular: entre "−" e "+", na
                          linha toda. `aria-label` e `enterKeyHint` só no
                          celular — lá o cabeçalho da coluna some. */}
                      <Quantidade
                        rotulo={carta.nome}
                        inputProps={{
                          ref: (el) => {
                            refsQuantidade.current[carta.cartaId] = el;
                          },
                          type: "number",
                          min: 0,
                          inputMode: "numeric",
                          enterKeyHint: ehMobile ? "next" : undefined,
                          "aria-label": ehMobile ? t("rotuloQuantidade", { nome: carta.nome }) : undefined,
                          tabIndex: indice + 1,
                          value: linha?.quantidade || "",
                          onChange: (e) =>
                            dispatch({
                              tipo: "quantidade",
                              cartaId: carta.cartaId,
                              valor: Number(e.target.value) || 0,
                              flags,
                            }),
                          onKeyDown: (e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              focarProximaQuantidade(carta.cartaId);
                            }
                          },
                          onFocus: (e) => e.target.select(),
                          className: `w-16 text-right ${classesEntrada} p-1 max-md:text-center`,
                        }}
                        onAjustar={(delta) =>
                          dispatch({
                            tipo: "quantidade",
                            cartaId: carta.cartaId,
                            valor: Math.max(0, (linha?.quantidade ?? 0) + delta),
                            flags,
                          })
                        }
                      />
                    </td>
                    <td className={`p-2 ${classesCelulaEmpilhada} max-md:basis-full`}>
                      <CampoSelect
                        rotulo=""
                        rotuloAcessivel={
                          ehMobile ? t("rotuloCampoCarta", { campo: t("colunaVariante"), nome: carta.nome }) : undefined
                        }
                        valor={linha?.variante ?? estado.defaults.variante}
                        opcoes={opcoesVariante}
                        onChange={(v) =>
                          dispatch({ tipo: "campoLinha", cartaId: carta.cartaId, campo: "variante", valor: v })
                        }
                      />
                    </td>
                    <td className={`p-2 ${classesCelulaEmpilhada} ${classesMetadeCartao}`}>
                      <CampoSelect
                        rotulo=""
                        rotuloAcessivel={
                          ehMobile ? t("rotuloCampoCarta", { campo: t("colunaIdioma"), nome: carta.nome }) : undefined
                        }
                        valor={linha?.idioma ?? estado.defaults.idioma}
                        opcoes={IDIOMAS}
                        onChange={(v) =>
                          dispatch({ tipo: "campoLinha", cartaId: carta.cartaId, campo: "idioma", valor: v })
                        }
                      />
                    </td>
                    <td className={`p-2 ${classesCelulaEmpilhada} ${classesMetadeCartao}`}>
                      <CampoSelect
                        rotulo=""
                        rotuloAcessivel={
                          ehMobile ? t("rotuloCampoCarta", { campo: t("colunaCondicao"), nome: carta.nome }) : undefined
                        }
                        valor={linha?.condicao ?? estado.defaults.condicao}
                        opcoes={CONDICOES}
                        onChange={(v) =>
                          dispatch({ tipo: "campoLinha", cartaId: carta.cartaId, campo: "condicao", valor: v })
                        }
                      />
                    </td>
                  </tr>
                );
              })}
              {cartasFiltradas.length === 0 && (
                <tr className="max-md:block">
                  <td colSpan={7} className="p-4 text-center text-sm text-muted max-md:block">
                    {t("nenhumaCarta")}
                  </td>
                </tr>
              )}
            </tbody>
          </Tabela>
        </>
      )}
    </main>
  );
}

function CampoSelect<T extends string>({
  rotulo,
  rotuloAcessivel,
  valor,
  opcoes,
  onChange,
  className = "",
}: {
  rotulo: string;
  /** `aria-label` do select sem rótulo visível. Só o celular passa (lá não há cabeçalho de coluna). */
  rotuloAcessivel?: string;
  valor: T;
  opcoes: readonly T[];
  onChange: (v: T) => void;
  className?: string;
}) {
  // Se o valor corrente não está entre as opções (ex.: default global é
  // "normal" mas a linha só oferece "holo"), mostra a opção mesmo assim —
  // quem decide qual materializar de fato é `escolherVarianteDisponivel`
  // no dominio; este componente só precisa não quebrar o <select>.
  const opcoesComValor = opcoes.includes(valor) ? opcoes : [valor, ...opcoes];
  return (
    // Celular: rótulo em cima e select na largura da célula (a coluna da grade
    // ou a linha do cartão), em vez de lado a lado.
    <label className={`flex items-center gap-1 text-sm max-md:flex-col max-md:items-stretch ${className}`}>
      {rotulo && <span className="text-muted">{rotulo}</span>}
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value as T)}
        aria-label={rotuloAcessivel}
        className={`${classesEntrada} p-1`}
      >
        {opcoesComValor.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
