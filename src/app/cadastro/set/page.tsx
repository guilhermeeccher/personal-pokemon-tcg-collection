"use client";

import { useMemo, useReducer, useRef, useState } from "react";

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
import { classesCelulaCabecalho, classesLinha, classesLinhaCabecalho, Tabela } from "@/app/_componentes/tabela";
import type { CartaParaGradeDTO, GradeDoSetDTO } from "@/lib/dominio/tipos-cliente";
import { NomeCarta } from "@/app/_componentes/nome-carta";

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
      .catch(() => setErro("Falha ao carregar a grade do set."))
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
    const itens = construirItensSubmissao(estado);
    if (itens.length === 0) return;

    setEnviando(true);
    setErro(null);
    setMensagem(null);
    try {
      const resp = await fetch(`/api/sets/${encodeURIComponent(gradeAtual.setId)}/copias`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idiomaCatalogo: gradeAtual.idiomaCatalogo, itens }),
      });
      const dados = await resp.json();
      if (!resp.ok) {
        setErro(dados.erro ?? "Falha ao gravar o lote.");
        return;
      }
      setMensagem(
        dados.fundidas > 0
          ? `${dados.inseridas} cópia(s) gravada(s) e ${dados.fundidas} somada(s) a cópia(s) existente(s) de ${gradeAtual.setNome}.`
          : `${dados.inseridas} cópia(s) gravada(s) de ${gradeAtual.setNome}.`,
      );
      dispatch({ tipo: "reset" });
    } catch {
      setErro("Falha de rede ao gravar o lote.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-8">
      <CabecalhoPagina
        titulo="Cadastro rápido por set"
        descricao="Marque a quantidade das cartas que você tem. Tab avança para a próxima carta. Variante, idioma e condição de cada carta começam no padrão do lote, definido na barra abaixo; mudar numa carta vale só para ela. O seletor de variante só oferece o que a carta de fato tem no catálogo."
      />

      <SeletorExpansao
        setSelecionadoId={setSelecionado}
        onSelecionar={(set) => selecionarSet(set?.setId ?? "")}
      />

      {carregandoGrade && <p className="text-sm text-muted">Carregando grade…</p>}
      {erro && <p className="text-sm text-danger">{erro}</p>}
      {mensagem && <p className="text-sm text-success-fg">{mensagem}</p>}

      {gradeAtual && (
        <>
          {!gradeAtual.temPt ? (
            <Alerta tom="aviso">
              <strong>Catálogo: EN</strong> — este set não tem carta a carta em português no upstream. A
              identidade de cada carta usa a ficha em inglês; o idioma abaixo é o da SUA cópia física (ex.:
              escolha <code>pt</code> se for a edição brasileira).
            </Alerta>
          ) : (
            <Alerta tom="neutro">
              <strong>Catálogo: PT</strong> — {gradeAtual.setNome}
            </Alerta>
          )}

          <div className="sticky top-0 z-10 rounded-card flex flex-wrap items-end gap-4 rounded border border-line bg-surface/95 p-3 backdrop-blur">
            <span className="text-sm font-medium">Padrão do lote:</span>
            <CampoSelect
              rotulo="Variante"
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
              rotulo="Idioma"
              valor={estado.defaults.idioma}
              opcoes={IDIOMAS}
              onChange={(v) => dispatch({ tipo: "campoDefault", campo: "idioma", valor: v })}
            />
            <CampoSelect
              rotulo="Condição"
              valor={estado.defaults.condicao}
              opcoes={CONDICOES}
              onChange={(v) => dispatch({ tipo: "campoDefault", campo: "condicao", valor: v })}
            />
            <div className="ml-auto flex items-center gap-3">
              <span className="text-sm text-muted">{totalMarcadas} marcada(s)</span>
              <Botao
                type="button"
                variante="primario"
                onClick={enviar}
                disabled={enviando || totalMarcadas === 0}
              >
                {enviando ? "Gravando…" : "Gravar lote"}
              </Botao>
            </div>
          </div>

          <Campo rotulo="Filtrar por número (carta avulsa — tolera zero à esquerda)" className="max-w-xs">
            <input
              value={filtroNumero}
              onChange={(e) => setFiltroNumero(e.target.value)}
              placeholder="ex.: 4, 04 ou 004"
              className={classesEntrada}
            />
          </Campo>

          <Tabela>
            <thead>
              <tr className={classesLinhaCabecalho}>
                <th className={classesCelulaCabecalho}></th>
                <th className={classesCelulaCabecalho}>#</th>
                <th className={classesCelulaCabecalho}>Nome</th>
                <th className={classesCelulaCabecalho}>Qtd.</th>
                <th className={classesCelulaCabecalho}>Variante</th>
                <th className={classesCelulaCabecalho}>Idioma</th>
                <th className={classesCelulaCabecalho}>Condição</th>
              </tr>
            </thead>
            <tbody>
              {cartasFiltradas.map((carta, indice) => {
                const linha = estado.linhas[carta.cartaId];
                const possui = (linha?.quantidade ?? 0) > 0;
                const flags = flagsDaCarta(carta);
                const opcoesVariante = variantesDisponiveis(flags);
                return (
                  <tr key={carta.cartaId} className={`${classesLinha} ${possui ? "bg-success-soft" : ""}`}>
                    <td className="p-2">
                      <ImagemCartaComZoom
                        imagemUrl={carta.imagemUrl}
                        origem={carta.imagemOrigem}
                        alt={carta.nome}
                        width={40}
                        height={55}
                        className="rounded-tcg"
                      />
                    </td>
                    <td className="p-2 tabular-nums text-muted">{carta.localId}</td>
                    <td className="p-2">
                      <NomeCarta nome={carta.nome} nomeEspecie={carta.nomeEspecie} />
                      {carta.qtdPossuida > 0 && (
                        <Distintivo tom="aviso" className="ml-2">
                          já tem {carta.qtdPossuida}
                        </Distintivo>
                      )}
                    </td>
                    <td className="p-2">
                      <input
                        ref={(el) => {
                          refsQuantidade.current[carta.cartaId] = el;
                        }}
                        type="number"
                        min={0}
                        inputMode="numeric"
                        tabIndex={indice + 1}
                        value={linha?.quantidade || ""}
                        onChange={(e) =>
                          dispatch({
                            tipo: "quantidade",
                            cartaId: carta.cartaId,
                            valor: Number(e.target.value) || 0,
                            flags,
                          })
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            focarProximaQuantidade(carta.cartaId);
                          }
                        }}
                        onFocus={(e) => e.target.select()}
                        className={`w-16 text-right ${classesEntrada} p-1`}
                      />
                    </td>
                    <td className="p-2">
                      <CampoSelect
                        rotulo=""
                        valor={linha?.variante ?? estado.defaults.variante}
                        opcoes={opcoesVariante}
                        onChange={(v) =>
                          dispatch({ tipo: "campoLinha", cartaId: carta.cartaId, campo: "variante", valor: v })
                        }
                      />
                    </td>
                    <td className="p-2">
                      <CampoSelect
                        rotulo=""
                        valor={linha?.idioma ?? estado.defaults.idioma}
                        opcoes={IDIOMAS}
                        onChange={(v) =>
                          dispatch({ tipo: "campoLinha", cartaId: carta.cartaId, campo: "idioma", valor: v })
                        }
                      />
                    </td>
                    <td className="p-2">
                      <CampoSelect
                        rotulo=""
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
                <tr>
                  <td colSpan={7} className="p-4 text-center text-sm text-muted">
                    Nenhuma carta com esse número neste set.
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
  valor,
  opcoes,
  onChange,
}: {
  rotulo: string;
  valor: T;
  opcoes: readonly T[];
  onChange: (v: T) => void;
}) {
  // Se o valor corrente não está entre as opções (ex.: default global é
  // "normal" mas a linha só oferece "holo"), mostra a opção mesmo assim —
  // quem decide qual materializar de fato é `escolherVarianteDisponivel`
  // no dominio; este componente só precisa não quebrar o <select>.
  const opcoesComValor = opcoes.includes(valor) ? opcoes : [valor, ...opcoes];
  return (
    <label className="flex items-center gap-1 text-sm">
      {rotulo && <span className="text-muted">{rotulo}</span>}
      <select value={valor} onChange={(e) => onChange(e.target.value as T)} className={`${classesEntrada} p-1`}>
        {opcoesComValor.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
