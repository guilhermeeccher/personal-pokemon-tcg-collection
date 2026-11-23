"use client";

import { Pencil, Plus, Settings2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { textoDaRecusa } from "@/app/_comum/recusa";
import { rotuloChaveVaga } from "@/lib/dominio/chave-vaga-set";
import type { Idioma } from "@/lib/dominio/enums";
import { type TemaColecao, temaDaColecao } from "@/lib/dominio/tema-colecao";
import type { CartaDoTemaDTO, GradeColecaoV2DTO, VagaGradeV2DTO } from "@/lib/dominio/tipos-cliente";

import { type AberturaDetalhe, DetalheCarta } from "../../_componentes/detalhe/detalhe-carta";
import { chaveDaRecusa, seguimentoDaRecusa } from "../../_componentes/detalhe/estado-detalhe";
import type { ControleGradeVirtual } from "../../_componentes/grade/grade-virtual";
import { useAviso } from "../../_componentes/primitivos/aviso-flutuante";
import { Botao } from "../../_componentes/primitivos/botao";
import { useConfirmacao } from "../../_componentes/primitivos/dialogo-confirmacao";
import { AvisoEmLinha } from "../../_componentes/primitivos/painel";
import { Segmentado } from "../../_componentes/primitivos/segmentado";
import { rotuloDoTema } from "../_componentes/rotulo-tema";

import { AbaFalta, secaoCompraDoDetalhe } from "./_componentes/aba-falta";
import { AbaUpgrades } from "./_componentes/aba-upgrades";
import { AdicionarCopia } from "./_componentes/adicionar-copia";
import { AjustesColecao } from "./_componentes/ajustes-colecao";
import { ATRIBUTO_VAGA } from "./_componentes/bolso";
import { CabecalhoColecao } from "./_componentes/cabecalho-colecao";
import { ATRIBUTO_COPIA_TEMA, BlocoTema, CartasDoTema } from "./_componentes/cartas-do-tema";
import estilos from "./_componentes/colecao.module.css";
import { Fichario, useMedidaFichario } from "./_componentes/fichario";
import { IncluirCarta } from "./_componentes/incluir-carta";
import { ListaInteira } from "./_componentes/lista-inteira";
import {
  type Aba,
  CHAVE_GRADE_FICHARIO,
  CHAVE_TAMANHO_INTEIRO,
  GRADES_FICHARIO,
  type GradeFichario,
  TAMANHOS_INTEIRO,
  type TamanhoInteiro,
  abaDaUrl,
  abasDaColecao,
  inicioDaVista,
  inicioDasDivisoes,
  lerGradeFichario,
  lerTamanhoInteiro,
  porPagina,
  paginaDoIndice,
  totalDePaginas,
  vagaDoFoco,
  vagasDaAba,
  gradeEfetiva,
  tamanhoEfetivo,
} from "./_componentes/vista-colecao";

type Leitura = { estado: "carregando" } | { estado: "ok"; grade: GradeColecaoV2DTO } | { estado: "naoEncontrada" } | { estado: "erro" };

/** O que está aberto no detalhe: uma vaga (pelo id) ou uma cópia da lista do tema. */
type Aberta = { tipo: "vaga"; id: string } | { tipo: "copia"; cartaId: string; copiaId: string; previa: CartaDoTemaDTO };

function doisQuadros(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

/** O evento que avisa a página de que uma preferência mudou (o `storage` só chega às outras abas). */
const EVENTO_PREFERENCIA = "v2-colecao-preferencia";

/** As gravações que o `localStorage` recusou (navegação privada, cheio): valem só nesta visita. */
const preferenciasDaVisita = new Map<string, string>();

function lerPreferencia(chave: string): string | null {
  // Uma gravação recusada nesta visita vence o que o armazenamento ainda tem
  // de antes: senão a escolha nova não apareceria na tela.
  const daVisita = preferenciasDaVisita.get(chave);
  if (daVisita !== undefined) return daVisita;
  try {
    return window.localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravarPreferencia(chave: string, valor: string) {
  try {
    window.localStorage.setItem(chave, valor);
    preferenciasDaVisita.delete(chave);
  } catch {
    preferenciasDaVisita.set(chave, valor);
  }
  window.dispatchEvent(new Event(EVENTO_PREFERENCIA));
}

function assinarPreferencias(aviso: () => void) {
  window.addEventListener("storage", aviso);
  window.addEventListener(EVENTO_PREFERENCIA, aviso);
  return () => {
    window.removeEventListener("storage", aviso);
    window.removeEventListener(EVENTO_PREFERENCIA, aviso);
  };
}

/**
 * Uma preferência de exibição do aparelho (regra 19 de `rules.md`). O
 * servidor e a hidratação leem `null` (o padrão); o valor guardado entra
 * logo depois, sem divergir do HTML do servidor.
 */
function usePreferencia(chave: string): string | null {
  return useSyncExternalStore(
    assinarPreferencias,
    () => lerPreferencia(chave),
    () => null,
  );
}

/**
 * A página da coleção na v2 (pacote 1d). Dona da tela `/colecoes/[id]` e do
 * contrato das abas (`vista-colecao.ts`).
 *
 * ## Leitura
 *
 * Uma leitura só, `GET /api/colecoes/:id/grade` (pacote 1a): a coleção e
 * todas as vagas, com a cópia, o upgrade, as livres e as escolhas de compra.
 * Toda escrita (aqui, no detalhe, nos ajustes) termina em "reler", que aborta
 * a leitura anterior: uma resposta velha nunca chega depois da nova. Uma
 * releitura que falha mantém a grade que está na tela e avisa.
 *
 * ## O detalhe
 *
 * Tocar numa carta abre o `<DetalheCarta>` do pacote 1b no modo vaga, com a
 * metade de quem abre da transição de vista (regra 25 de `rules.md`): a
 * carta tocada ganha o nome numa atualização urgente e o detalhe abre dentro
 * de `startTransition`, enquanto ela sai da grade. `onMudou` relê a grade e a
 * vaga nova chega ao detalhe pelo mesmo id. Ao fechar, o foco volta à célula
 * da vaga — o fichário vira para a página dela, a lista inteira rola até ela
 * e a monta — mesmo que ela tenha saído do DOM (`devolverFocoPara`).
 */
export function PaginaColecao({ id }: { id: string }) {
  const t = useTranslations("v2Colecao");
  const tRecusas = useTranslations("recusas");
  const tTema = useTranslations("temaColecao");
  const tTipos = useTranslations("tiposPokemon");
  const tRaridades = useTranslations("raridadesCarta");
  const avisar = useAviso();
  const { confirmar, dialogo } = useConfirmacao();
  const parametros = useSearchParams();

  /* ---------- Leitura da grade ---------- */

  const [leitura, setLeitura] = useState<Leitura>({ estado: "carregando" });
  const [pedido, setPedido] = useState(0);
  // Sobe a cada grade nova que chega: o que depende dela (upgrades, tema) relê junto.
  const [versaoGrade, setVersaoGrade] = useState(0);
  const [falhaReleitura, setFalhaReleitura] = useState(false);
  const reler = useCallback(() => setPedido((p) => p + 1), []);

  useEffect(() => {
    const controle = new AbortController();
    fetch(`/api/colecoes/${id}/grade`, { cache: "no-store", signal: controle.signal })
      .then(async (r) => {
        if (r.status === 404) return "naoEncontrada" as const;
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as GradeColecaoV2DTO;
      })
      .then((g) => {
        if (controle.signal.aborted) return;
        if (g === "naoEncontrada") {
          setLeitura({ estado: "naoEncontrada" });
          return;
        }
        setLeitura({ estado: "ok", grade: g });
        setVersaoGrade((v) => v + 1);
        setFalhaReleitura(false);
      })
      .catch(() => {
        if (controle.signal.aborted) return;
        // Sem grade ainda: erro na tela. Com grade: ela fica, e um aviso diz que pode estar velha.
        setLeitura((atual) => (atual.estado === "ok" ? atual : { estado: "erro" }));
        setFalhaReleitura(true);
      });
    return () => controle.abort();
  }, [id, pedido]);

  const grade = leitura.estado === "ok" ? leitura.grade : null;
  const tipo = grade?.tipo ?? "set";
  const vagas = useMemo(() => grade?.vagas ?? [], [grade]);
  const inicioDivisao = useMemo(() => inicioDasDivisoes(vagas), [vagas]);
  const vazias = useMemo(() => vagas.filter((v) => !v.copia), [vagas]);
  const comUpgrade = useMemo(() => vagas.filter((v) => v.upgrade && v.copia).length, [vagas]);

  /* ---------- Aba (na URL) e preferências (no aparelho) ---------- */

  const aba = abaDaUrl(parametros.get("aba"), tipo);
  const trocarAba = useCallback((nova: Aba) => {
    const url = new URL(window.location.href);
    url.searchParams.set("aba", nova);
    // `replaceState` sem passar pelo roteador: a troca de aba não pede nada ao
    // servidor. O estado vai `null`: o Next põe os metadados dele por conta
    // própria, e repassar `history.state` (que já traz o marcador dele) faz o
    // roteador ignorar a mudança — a URL troca e `useSearchParams` não.
    window.history.replaceState(null, "", url);
  }, []);

  const gradePreferida = lerGradeFichario(usePreferencia(CHAVE_GRADE_FICHARIO));
  const tamanhoPreferido = lerTamanhoInteiro(usePreferencia(CHAVE_TAMANHO_INTEIRO));
  const [editandoCartas, setEditandoCartas] = useState(false);

  /* ---------- Fichário ---------- */

  const [area, setArea] = useState<HTMLDivElement | null>(null);
  const { paginasPorVez, larguraUtil } = useMedidaFichario(area);
  // O que vale na tela: a preferência, até onde os alvos de 44 px cabem, e
  // os limites do modo "Editar cartas" (`vista-colecao.ts`).
  const gradeFichario = gradeEfetiva(gradePreferida, larguraUtil, editandoCartas);
  const gradeQueCabe = gradeEfetiva(6, larguraUtil, editandoCartas);
  const tamanho = tamanhoEfetivo(tamanhoPreferido, editandoCartas);
  // O lugar no fichário é a primeira vaga à vista, não o número da página:
  // trocar de grade, girar o aparelho ou entrar no modo de edição muda a
  // página, e a vaga que estava à vista continua à vista.
  const [primeiraPedida, setPrimeiraPedida] = useState(0);
  const totalPaginas = totalDePaginas(vagas.length, gradeFichario);
  const pagina = inicioDaVista(paginaDoIndice(primeiraPedida, gradeFichario), paginasPorVez, totalPaginas);
  const irParaPagina = (p: number) => setPrimeiraPedida(p * porPagina(gradeFichario));

  function trocarGradeFichario(nova: GradeFichario) {
    setPrimeiraPedida(pagina * porPagina(gradeFichario));
    gravarPreferencia(CHAVE_GRADE_FICHARIO, String(nova));
  }

  function trocarTamanho(novo: TamanhoInteiro) {
    gravarPreferencia(CHAVE_TAMANHO_INTEIRO, String(novo));
  }

  const controleGrade = useRef<ControleGradeVirtual>(null);

  function irParaDivisao(divisaoId: string) {
    const inicio = inicioDivisao.get(divisaoId);
    if (inicio === undefined) return;
    if (aba === "inteiro") {
      controleGrade.current?.rolarAte(inicio);
      return;
    }
    if (aba !== "fichario") trocarAba("fichario");
    setPrimeiraPedida(inicio);
  }

  /* ---------- Detalhe ---------- */

  const [aberta, setAberta] = useState<Aberta | null>(null);
  // A chave do par ativo da transição: a carta que abriu, e para onde o detalhe volta.
  const [parAtivo, setParAtivo] = useState<string | null>(null);

  // O que abriu o detalhe por último (a vaga e o lugar dela na aba), para o
  // foco voltar ao fechar. Não se apaga ao fechar: o resolvedor do foco roda
  // depois do commit que fecha.
  // A vaga que uma desalocação numa customizada está tirando da grade: o
  // detalhe fecha logo depois da escrita, antes de a releitura chegar, e o
  // foco não pode voltar para um botão que vai sumir.
  const vagaSaindo = useRef<string | null>(null);
  const origemDoDetalhe = useRef<{ tipo: "vaga"; id: string; posicao: number } | { tipo: "copia"; copiaId: string } | null>(null);
  const abaRef = useRef(aba);
  const vagasRef = useRef(vagas);
  useEffect(() => {
    abaRef.current = aba;
    vagasRef.current = vagas;
  });

  const abrirVaga = useCallback((v: VagaGradeV2DTO) => {
    const posicao = vagasDaAba(abaRef.current, vagasRef.current).findIndex((x) => x.id === v.id);
    origemDoDetalhe.current = { tipo: "vaga", id: v.id, posicao };
    setParAtivo(v.id);
    startTransition(() => setAberta({ tipo: "vaga", id: v.id }));
  }, []);

  const vagaAberta = aberta?.tipo === "vaga" ? (vagas.find((v) => v.id === aberta.id) ?? null) : null;
  // A vaga que sumiu (tirada da coleção, desalocada numa customizada) fecha o detalhe.
  const abertaId = vagaAberta?.id ?? null;

  let abertura: AberturaDetalhe | null = null;
  if (grade && vagaAberta) {
    abertura = {
      modo: "vaga",
      colecao: { id: grade.id, nome: grade.nome, tipo: grade.tipo, idiomaExigido: grade.idiomaExigido },
      vaga: vagaAberta,
    };
  } else if (aberta?.tipo === "copia") {
    abertura = {
      modo: "copia",
      cartaId: aberta.cartaId,
      copiaId: aberta.copiaId,
      previa: { nome: aberta.previa.cartaNome, imagemUrl: aberta.previa.imagemUrl, imagemOrigem: aberta.previa.imagemOrigem, variante: aberta.previa.variante },
    };
  }

  /*
   * O foco ao fechar o detalhe (`devolverFocoPara`): a célula da vaga que o
   * abriu, montada de novo se ela saiu do DOM — a lista inteira rola até ela
   * pela grade virtual, o fichário vira para a página dela. Se a vaga saiu da
   * aba (alocada no "O que falta", trocada nos Upgrades, tirada da coleção),
   * a que ficou no mesmo lugar da lista (`vagaDoFoco`). Lê o estado da hora em
   * que fecha, pelas refs.
   */
  const devolverFoco = useCallback(async (): Promise<HTMLElement | null> => {
    const origem = origemDoDetalhe.current;
    if (!origem) return null;
    if (origem.tipo === "copia") return document.querySelector<HTMLElement>(`[${ATRIBUTO_COPIA_TEMA}="${CSS.escape(origem.copiaId)}"]`);
    const abaAgora = abaRef.current;
    const lista = vagasDaAba(abaAgora, vagasRef.current).filter((v) => v.id !== vagaSaindo.current);
    const alvo = vagaDoFoco(lista, origem.id, origem.posicao);
    if (!alvo) return null;
    if (abaAgora === "inteiro" || abaAgora === "falta") return (await controleGrade.current?.elementoDe(alvo.id)) ?? null;
    if (abaAgora === "fichario") {
      setPrimeiraPedida(lista.indexOf(alvo));
      await doisQuadros();
    }
    return document.querySelector<HTMLElement>(`[${ATRIBUTO_VAGA}="${CSS.escape(alvo.id)}"]`);
  }, [setPrimeiraPedida]);

  /* ---------- Operações da coleção ---------- */

  const [ajustesAbertos, setAjustesAbertos] = useState(false);
  const [adicionarAberto, setAdicionarAberto] = useState(false);
  const [temaAberto, setTemaAberto] = useState(false);

  async function tirarVaga(v: VagaGradeV2DTO) {
    if (!grade) return;
    const alvo = v.cartaNome ?? t("bolso.numero", { numero: v.numero });
    const ok = await confirmar({
      titulo: t("tirar.titulo", { alvo }),
      descricao: v.copia ? t("tirar.cheia") : t("tirar.vazia"),
      rotuloConfirmar: t("tirar.confirmar"),
      perigoso: true,
    });
    if (!ok) return;
    try {
      const r = await fetch(`/api/colecoes/${grade.id}/vagas/${v.id}`, { method: "DELETE" });
      const corpo = (await r.json().catch(() => null)) as { copiaLiberada?: boolean } | null;
      if (!r.ok) {
        avisar(textoDaRecusa(tRecusas, corpo, t("tirar.erro")), { tom: "erro" });
        if (seguimentoDaRecusa(r.status, chaveDaRecusa(corpo)) === "reler") reler();
        return;
      }
      avisar(corpo?.copiaLiberada ? t("tirar.feitoCopiaLivre", { alvo }) : t("tirar.feito", { alvo }), { tom: "sucesso" });
    } catch {
      avisar(t("tirar.erroRede"), { tom: "erro" });
    }
    reler();
  }

  /* ---------- Desenho ---------- */

  if (leitura.estado === "carregando") {
    return <p className={estilos.mudo}>{t("carregando")}</p>;
  }
  if (leitura.estado === "naoEncontrada") {
    return (
      <AvisoEmLinha tom="perigo" titulo={t("naoEncontrada")}>
        <Link href="/colecoes" className={estilos.linkTexto}>
          {t("voltarParaColecoes")}
        </Link>
      </AvisoEmLinha>
    );
  }
  if (leitura.estado === "erro" || !grade) {
    return (
      <AvisoEmLinha
        tom="perigo"
        papel="alert"
        titulo={t("erroCarregar")}
        acao={
          <Botao pequeno onClick={reler}>
            {t("tentarDeNovo")}
          </Botao>
        }
      >
        {t("erroCarregarTexto")}
      </AvisoEmLinha>
    );
  }

  const tema = temaDaColecao(grade);
  const rotuloTema = tema ? rotuloDoTema({ ...tema, rotulo: grade.temaRotulo }, { tTema, tTipos, tRaridades }) : null;
  const rotularTema = (tm: TemaColecao, rotulo?: string) => rotuloDoTema({ ...tm, rotulo }, { tTema, tTipos, tRaridades });
  const colecaoDeSet = grade.tipo === "set";
  const customizada = grade.tipo === "customizada";
  const idiomaCatalogo = ((grade.parametro as { idiomaCatalogo?: Idioma } | null)?.idiomaCatalogo ?? "pt") as Idioma;
  const aoTirar = colecaoDeSet && editandoCartas ? (v: VagaGradeV2DTO) => void tirarVaga(v) : undefined;
  const nomeInteiro = grade.tipo === "pokedex" ? t("abas.pokedexInteira") : customizada ? t("abas.todas") : t("abas.setInteiro");

  const rotuloDaPagina = (primeira: VagaGradeV2DTO, ultima: VagaGradeV2DTO) =>
    grade.tipo === "pokedex"
      ? t("fichario.faixaPokedex", { de: primeira.numero, ate: ultima.numero })
      : t("fichario.faixa", { de: rotuloChaveVaga(primeira.chave), ate: rotuloChaveVaga(ultima.chave) });

  // Abaixo de 480 px o rótulo encolhe ("Tudo", "Falta") e abaixo de 360 a
  // contagem some do desenho: as quatro abas cabem a 320 px. O nome inteiro,
  // com a contagem, fica no rótulo acessível.
  const opcoesAbas = abasDaColecao(grade.tipo).map((a) => {
    const nome = a === "inteiro" ? nomeInteiro : t(`abas.${a}`);
    const contagem = a === "falta" ? vazias.length : a === "upgrades" ? comUpgrade : undefined;
    return {
      valor: a,
      rotuloAcessivel: contagem === undefined ? nome : t("abas.comContagem", { aba: nome, total: contagem }),
      rotulo: (
        <>
          <span className={estilos.rotuloLongo}>{nome}</span>
          <span className={estilos.rotuloCurto} aria-hidden>
            {t(`abas.curto.${a}`)}
          </span>
          {contagem !== undefined && <span className={`${estilos.contagemAba} v2-num`}>{contagem}</span>}
        </>
      ),
    };
  });

  const acoes = (
    <>
      <Botao icone={<Settings2 aria-hidden />} onClick={() => setAjustesAbertos(true)}>
        {t("acoes.ajustes")}
      </Botao>
      {colecaoDeSet && (
        <Botao
          variante={editandoCartas ? "primario" : "secundario"}
          icone={<Pencil aria-hidden />}
          aria-pressed={editandoCartas}
          onClick={() => setEditandoCartas((v) => !v)}
        >
          {editandoCartas ? t("acoes.concluirEdicao") : t("acoes.editarCartas")}
        </Botao>
      )}
      {customizada && (
        <Botao variante="primario" icone={<Plus aria-hidden />} onClick={() => setAdicionarAberto(true)}>
          {t("acoes.adicionarCopia")}
        </Botao>
      )}
    </>
  );

  return (
    <div className={estilos.pagina} ref={setArea}>
      <CabecalhoColecao colecao={grade} rotuloDoTema={rotuloTema} acoes={acoes} aoIrParaDivisao={irParaDivisao} />

      {falhaReleitura && (
        <AvisoEmLinha
          tom="alerta"
          papel="alert"
          acao={
            <Botao pequeno onClick={reler}>
              {t("tentarDeNovo")}
            </Botao>
          }
        >
          {t("erroReler")}
        </AvisoEmLinha>
      )}

      {tema && (
        <BlocoTema
          colecaoId={grade.id}
          tema={tema}
          temaRotulo={grade.temaRotulo}
          versaoGrade={versaoGrade}
          rotularTema={rotularTema}
          aoAbrir={() => setTemaAberto(true)}
        />
      )}

      {colecaoDeSet && editandoCartas && (
        <IncluirCarta
          colecaoId={grade.id}
          idiomaCatalogo={idiomaCatalogo}
          chavesNaColecao={new Set(vagas.map((v) => v.chave))}
          onIncluida={reler}
        />
      )}

      <div className={estilos.ferramentas}>
        {opcoesAbas.length > 1 && (
          <Segmentado
            papel="abas"
            rotulo={t("abas.rotulo")}
            opcoes={opcoesAbas}
            valor={aba}
            aoMudar={trocarAba}
            idPainel={(a) => `painel-${a}`}
          />
        )}
        {aba === "fichario" && (
          <Segmentado
            pequeno
            rotulo={t("fichario.tamanho")}
            opcoes={GRADES_FICHARIO.map((g) => ({
              valor: String(g),
              rotulo: `${g}×${g}`,
              rotuloAcessivel: t("fichario.porPagina", { total: g * g }),
              desabilitada: g > gradeQueCabe,
            }))}
            valor={String(gradeFichario)}
            aoMudar={(v) => trocarGradeFichario(lerGradeFichario(v))}
          />
        )}
        {(aba === "inteiro" || aba === "falta") && (
          <Segmentado
            pequeno
            rotulo={t("inteiro.tamanho")}
            opcoes={TAMANHOS_INTEIRO.map((_, i) => ({
              valor: String(i),
              rotulo: t(`inteiro.tamanhos.${i}`),
              desabilitada: tamanhoEfetivo(i as TamanhoInteiro, editandoCartas) !== i,
            }))}
            valor={String(tamanho)}
            aoMudar={(v) => trocarTamanho(lerTamanhoInteiro(v))}
          />
        )}
      </div>

      <section id={`painel-${aba}`} role={opcoesAbas.length > 1 ? "tabpanel" : undefined} aria-label={opcoesAbas.find((o) => o.valor === aba)?.rotuloAcessivel}>
        {aba === "fichario" &&
          (vagas.length === 0 ? (
            <AvisoEmLinha titulo={t("semVagas")}>{t("semVagasTexto")}</AvisoEmLinha>
          ) : (
            <Fichario
              vagas={vagas}
              tipo={grade.tipo}
              grade={gradeFichario}
              pagina={pagina}
              paginasPorVez={paginasPorVez}
              aoIrPara={irParaPagina}
              abertaId={abertaId}
              parAtivo={parAtivo}
              aoAbrir={abrirVaga}
              aoTirar={aoTirar}
              rotuloDaPagina={rotuloDaPagina}
            />
          ))}
        {aba === "inteiro" &&
          (vagas.length === 0 ? (
            <AvisoEmLinha titulo={customizada ? t("vazioCustomizada") : t("semVagas")}>
              {customizada ? t("vazioCustomizadaTexto") : t("semVagasTexto")}
            </AvisoEmLinha>
          ) : (
            <>
              <p className={estilos.notaTopo}>
                {customizada
                  ? t("inteiro.resumoCustomizada", { total: vagas.length })
                  : t("inteiro.resumo", { total: vagas.length, preenchidas: grade.vagasPreenchidas, vazias: vazias.length })}
              </p>
              <ListaInteira
                vagas={vagas}
                tipo={grade.tipo}
                tamanho={tamanho}
                rotulo={nomeInteiro}
                abertaId={abertaId}
                parAtivo={parAtivo}
                aoAbrir={abrirVaga}
                aoTirar={aoTirar}
                controle={controleGrade}
              />
            </>
          ))}
        {aba === "upgrades" && (
          <AbaUpgrades colecaoId={grade.id} vagas={vagas} versaoGrade={versaoGrade} abertaId={abertaId} parAtivo={parAtivo} aoAbrir={abrirVaga} />
        )}
        {aba === "falta" && (
          <AbaFalta
            colecao={grade}
            vazias={vazias}
            versaoGrade={versaoGrade}
            abrirVaga={abrirVaga}
            reler={reler}
            abertaId={abertaId}
            parAtivo={parAtivo}
            tamanho={tamanho}
            controle={controleGrade}
          />
        )}
      </section>

      <DetalheCarta
        abertura={abertura}
        onFechar={() => setAberta(null)}
        onMudou={(evento) => {
          if (evento.tipo === "desalocada" && grade.tipo === "customizada") vagaSaindo.current = evento.vagaId;
          reler();
        }}
        chaveTransicao={aberta?.tipo === "vaga" ? aberta.id : undefined}
        devolverFocoPara={devolverFoco}
        secaoCompra={secaoCompraDoDetalhe}
      />

      <AjustesColecao colecao={grade} aberto={ajustesAbertos} onFechar={() => setAjustesAbertos(false)} onMudou={reler} />
      {customizada && (
        <AdicionarCopia
          colecaoId={grade.id}
          idiomaExigido={grade.idiomaExigido}
          aberto={adicionarAberto}
          onFechar={() => setAdicionarAberto(false)}
          onAdicionada={reler}
        />
      )}
      {tema && (
        <CartasDoTema
          colecaoId={grade.id}
          nomeColecao={grade.nome}
          aberto={temaAberto}
          versaoGrade={versaoGrade}
          rotularTema={rotularTema}
          onFechar={() => setTemaAberto(false)}
          onAlocadas={(total) => {
            setTemaAberto(false);
            avisar(t("tema.alocadas", { total }), { tom: "sucesso" });
            reler();
          }}
          aoAmpliar={(c) => {
            origemDoDetalhe.current = { tipo: "copia", copiaId: c.copiaId };
            setParAtivo(null);
            setAberta({ tipo: "copia", cartaId: c.cartaId, copiaId: c.copiaId, previa: c });
          }}
        />
      )}
      {dialogo}
    </div>
  );
}
