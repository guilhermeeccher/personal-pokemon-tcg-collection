"use client";

import { Check, ListOrdered } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, startTransition, useCallback, useState, useTransition } from "react";

import { textoDaRecusa } from "@/app/_comum/recusa";
import type { ColecaoListaV2DTO, GrupoListaV2DTO, ListaColecoesV2DTO } from "@/lib/dominio/lista-colecoes-v2";
import { moverNaOrdem } from "@/lib/dominio/ordem-colecoes";
import type { TemaColecao } from "@/lib/dominio/tema-colecao";
import type { CartaDoTemaDTO, SugestaoDeTemaDTO } from "@/lib/dominio/tipos-cliente";

import { type AberturaDetalhe, DetalheCarta } from "../../_componentes/detalhe/detalhe-carta";
import { useAviso } from "../../_componentes/primitivos/aviso-flutuante";
import { Botao, BotaoLink } from "../../_componentes/primitivos/botao";
import { useConfirmacao } from "../../_componentes/primitivos/dialogo-confirmacao";
import { AvisoEmLinha } from "../../_componentes/primitivos/painel";
import { ATRIBUTO_COPIA_TEMA, CartasDoTema } from "../[id]/_componentes/cartas-do-tema";
import { AvisoElegiveis } from "./aviso-elegiveis";
import estilos from "./colecoes.module.css";
import { JanelaExistentes } from "./janela-existentes";
import { JanelaFaltantes } from "./janela-faltantes";
import { JanelaGrupo } from "./janela-grupo";
import { JanelaTema } from "./janela-tema";
import { ModoOrganizar } from "./modo-organizar";
import { pedirApi } from "./pedir-api";
import { rotuloDoTema } from "./rotulo-tema";
import { SecaoSugestoes } from "./secao-sugestoes";

/**
 * A janela de grupo aberta. Guarda só o id (e o nome, para o aviso): o grupo
 * que ela mostra é sempre o da última lista lida, para uma série trocada em
 * outra aba chegar à janela aberta. `encerrada` é a janela que o servidor
 * fechou (o grupo sumiu, ou perdeu a série) — a tela diz por quê.
 */
type Janela = {
  tipo: "grupo" | "faltantes" | "existentes";
  grupoId: string | null;
  nome: string;
  encerrada?: "sumiu" | "semSerie";
};

/** O fluxo da coleção temática: confirmar o nome, depois escolher as cartas que entram. */
type JanelaTemaAberta =
  | { tipo: "criar"; sugestao: SugestaoDeTemaDTO }
  | { tipo: "cartas"; colecaoId: string; nome: string };

/**
 * `/colecoes` no cliente: o cabeçalho, as sugestões e os dois modos da lista
 * — "ver" (os cartões, desenhados no servidor e recebidos prontos em
 * `vista`) e "Organizar" (pacote 4b).
 *
 * - **A ordem é a da leitura do servidor** (`listarColecoes`), nos dois
 *   modos. Nenhuma escrita reordena a tela por conta própria: toda escrita,
 *   dê certo ou não, relê a página (`router.refresh`), e os controles ficam
 *   desligados até a lista nova chegar (`relendo`, a transição do refresh) —
 *   o próximo clique sempre parte do que o servidor tem.
 * - **Toda recusa vira frase por `recusa.ts`**, com o estado que a segue: a
 *   lista velha (409) relê; o grupo que sumiu fecha a janela dele, dizendo
 *   por quê.
 * - **A coleção temática** nasce de uma sugestão (`JanelaTema`) e segue para
 *   "suas cartas que cabem" (`CartasDoTema`, a mesma lista da página da
 *   coleção), cuja miniatura abre o detalhe da carta no modo cópia por cima
 *   dela, sem perder as marcas (COL-22).
 */
export function PainelColecoes({ lista, vista }: { lista: ListaColecoesV2DTO; vista: ReactNode }) {
  const t = useTranslations("v2Organizar");
  const tLista = useTranslations("v2Colecoes");
  const tRecusas = useTranslations("recusas");
  const tTema = useTranslations("temaColecao");
  const tTipos = useTranslations("tiposPokemon");
  const tRaridades = useTranslations("raridadesCarta");
  const router = useRouter();
  const avisar = useAviso();
  const { confirmar, dialogo } = useConfirmacao();

  const [organizando, setOrganizando] = useState(false);
  const [escrevendo, setEscrevendo] = useState(false);
  const [relendo, iniciarReleitura] = useTransition();
  const [erro, setErro] = useState<{ motivo: string; texto: string } | null>(null);
  const [janela, setJanela] = useState<Janela | null>(null);
  const [janelaTema, setJanelaTema] = useState<JanelaTemaAberta | null>(null);
  const [versaoSugestoes, setVersaoSugestoes] = useState(0);
  const [setsCriados, setSetsCriados] = useState<ReadonlySet<string>>(new Set());
  // A cópia aberta no detalhe a partir de "suas cartas que cabem", e a versão que faz a lista reler.
  const [copiaAberta, setCopiaAberta] = useState<CartaDoTemaDTO | null>(null);
  const [versaoCartas, setVersaoCartas] = useState(0);

  const bloqueado = escrevendo || relendo;
  const grupos = lista.secoes.flatMap((s) => (s.grupo ? [s.grupo] : []));

  /**
   * Relê a lista (no servidor) e as sugestões: uma coleção criada ou trazida
   * aqui pode cobrir uma sugestão de set, e a que ficasse na tela deixaria
   * criar a mesma coleção de novo.
   */
  const reler = useCallback(() => {
    iniciarReleitura(() => router.refresh());
    setVersaoSugestoes((v) => v + 1);
  }, [router]);

  async function escrever(url: string, method: string, corpo: unknown, sucesso?: string) {
    if (bloqueado) return;
    setEscrevendo(true);
    setErro(null);
    const r = await pedirApi(url, method, corpo);
    if (r.ok) {
      if (sucesso) avisar(sucesso, { tom: "sucesso" });
    } else {
      setErro(
        r.status === null
          ? { motivo: "", texto: t("erroRede") }
          : { motivo: textoDaRecusa(tRecusas, r.corpo, ""), texto: t("erroOperacao") },
      );
    }
    setEscrevendo(false);
    // Dê certo ou não: uma lista velha tem de sumir antes do próximo clique.
    reler();
  }

  function abrir(j: Janela) {
    setErro(null);
    setJanela(j);
  }

  async function excluirGrupo(g: GrupoListaV2DTO) {
    const ok = await confirmar({
      titulo: t("grupo.confirmarExcluirTitulo", { grupo: g.nome }),
      descricao: t("grupo.confirmarExcluirTexto"),
      rotuloConfirmar: t("grupo.confirmarExcluir"),
      perigoso: true,
    });
    if (!ok) return;
    await escrever(`/api/grupos-colecao/${g.id}`, "DELETE", undefined, t("grupoExcluido"));
  }

  const acoes = {
    moverGrupo: (g: GrupoListaV2DTO, direcao: -1 | 1) =>
      void escrever("/api/grupos-colecao/ordem", "PUT", { ids: moverNaOrdem(grupos.map((x) => x.id), g.id, direcao) }),
    moverColecao: (c: ColecaoListaV2DTO, secao: { grupoId: string | null; ids: string[] }, direcao: -1 | 1) =>
      void escrever("/api/colecoes/ordem", "PUT", { grupoId: secao.grupoId, ids: moverNaOrdem(secao.ids, c.id, direcao) }),
    mudarDeGrupo: (c: ColecaoListaV2DTO, grupoId: string | null) =>
      void escrever(`/api/colecoes/${c.id}/grupo`, "PATCH", { grupoId }),
    novoGrupo: () => abrir({ tipo: "grupo", grupoId: null, nome: "" }),
    editarGrupo: (g: GrupoListaV2DTO) => abrir({ tipo: "grupo", grupoId: g.id, nome: g.nome }),
    excluirGrupo: (g: GrupoListaV2DTO) => void excluirGrupo(g),
    criarFaltantes: (g: GrupoListaV2DTO) => abrir({ tipo: "faltantes", grupoId: g.id, nome: g.nome }),
    trazerExistentes: (g: GrupoListaV2DTO) => abrir({ tipo: "existentes", grupoId: g.id, nome: g.nome }),
  };

  const fecharJanela = useCallback(() => setJanela(null), []);
  const encerrarJanela = useCallback(
    (motivo: "sumiu" | "semSerie") => {
      setJanela((j) => (j ? { ...j, encerrada: motivo } : j));
      reler();
    },
    [reler],
  );

  // O grupo da janela é o da última lista; se ela já não o traz (excluído em
  // outra aba), a janela fecha — com aviso, não em silêncio.
  const grupoDaJanela = janela?.grupoId ? grupos.find((g) => g.id === janela.grupoId) : undefined;
  const motivoJanelaFechada =
    janela && (janela.encerrada ?? (janela.grupoId !== null && !grupoDaJanela ? "sumiu" : undefined));
  const janelaViva = janela !== null && !motivoJanelaFechada ? janela : null;

  /* ---------- Tema ---------- */

  const rotularTema = (tema: TemaColecao, rotulo?: string) => rotuloDoTema({ ...tema, rotulo }, { tTema, tTipos, tRaridades });
  const rotularSugestao = (s: SugestaoDeTemaDTO) => rotularTema({ tipo: s.tipo, valor: s.valor }, s.rotulo);
  const nomePadraoDoTema = (s: SugestaoDeTemaDTO) => {
    const rotulo = rotularSugestao(s);
    return s.tipo === "ilustrador" ? tTema("nomePadraoIlustrador", { rotulo }) : tTema("nomePadrao", { rotulo });
  };

  let abertura: AberturaDetalhe | null = null;
  if (copiaAberta) {
    abertura = {
      modo: "copia",
      cartaId: copiaAberta.cartaId,
      copiaId: copiaAberta.copiaId,
      previa: {
        nome: copiaAberta.cartaNome,
        imagemUrl: copiaAberta.imagemUrl,
        imagemOrigem: copiaAberta.imagemOrigem,
        variante: copiaAberta.variante,
      },
    };
  }
  const devolverFocoDaCopia = useCallback(async (): Promise<HTMLElement | null> => {
    return copiaAberta
      ? document.querySelector<HTMLElement>(`[${ATRIBUTO_COPIA_TEMA}="${CSS.escape(copiaAberta.copiaId)}"]`)
      : null;
  }, [copiaAberta]);

  return (
    <div className={estilos.pagina}>
      <header className={estilos.cabecalho}>
        <div>
          <h1 className={estilos.titulo}>{tLista("titulo")}</h1>
          <p className={`${estilos.contagem} v2-num`}>{tLista("contagem", { total: lista.totalColecoes })}</p>
        </div>
        <div className={estilos.acoes}>
          <BotaoLink href="/colecoes/nova" variante="primario">
            {tLista("nova")}
          </BotaoLink>
          <BotaoLink href="/colecoes/falta">{tLista("oQueFalta")}</BotaoLink>
          <Botao
            aria-pressed={organizando}
            icone={organizando ? <Check aria-hidden /> : <ListOrdered aria-hidden />}
            variante={organizando ? "iris" : "secundario"}
            onClick={() => {
              setErro(null);
              setOrganizando(!organizando);
            }}
          >
            {organizando ? t("concluir") : t("organizar")}
          </Botao>
        </div>
      </header>

      <AvisoElegiveis />

      <SecaoSugestoes
        versao={versaoSugestoes}
        setsCriados={setsCriados}
        rotularTema={rotularSugestao}
        aoCriarTema={(sugestao) => setJanelaTema({ tipo: "criar", sugestao })}
      />

      {motivoJanelaFechada && janela && (
        <AvisoEmLinha tom="alerta" papel="status">
          {motivoJanelaFechada === "semSerie" ? t("grupoSemSerie", { grupo: janela.nome }) : t("grupoSumiu", { grupo: janela.nome })}
        </AvisoEmLinha>
      )}
      {erro && (
        <AvisoEmLinha tom="perigo" papel="alert" titulo={erro.motivo || undefined}>
          {erro.texto}
        </AvisoEmLinha>
      )}
      {organizando && relendo && (
        <p className={estilos.ajuda} role="status">
          {t("relendo")}
        </p>
      )}

      {organizando ? <ModoOrganizar lista={lista} bloqueado={bloqueado} acoes={acoes} /> : vista}

      {janelaViva?.tipo === "grupo" && (janelaViva.grupoId === null || grupoDaJanela) && (
        <JanelaGrupo
          key={janelaViva.grupoId ?? "novo"}
          grupo={grupoDaJanela ?? null}
          aoFechar={fecharJanela}
          aoSalvo={(nome) => {
            setJanela(null);
            avisar(janelaViva.grupoId ? t("grupoSalvo", { grupo: nome }) : t("grupoCriado", { grupo: nome }), { tom: "sucesso" });
            reler();
          }}
          aoSumir={() => encerrarJanela("sumiu")}
          aoReler={reler}
        />
      )}
      {janelaViva?.tipo === "faltantes" && grupoDaJanela && (
        <JanelaFaltantes
          key={grupoDaJanela.id}
          grupo={grupoDaJanela}
          aoFechar={fecharJanela}
          aoCriadas={(setIds, total) => {
            setSetsCriados((atuais) => new Set([...atuais, ...setIds]));
            setJanela(null);
            avisar(t("faltantes.criadas", { total, grupo: grupoDaJanela.nome }), { tom: "sucesso" });
            reler();
          }}
          aoEncerrar={encerrarJanela}
          aoReler={reler}
        />
      )}
      {janelaViva?.tipo === "existentes" && grupoDaJanela && (
        <JanelaExistentes
          key={grupoDaJanela.id}
          grupo={grupoDaJanela}
          aoFechar={fecharJanela}
          aoTrazidas={(total) => {
            setJanela(null);
            avisar(t("existentes.trazidas", { total, grupo: grupoDaJanela.nome }), { tom: "sucesso" });
            reler();
          }}
          aoEncerrar={encerrarJanela}
          aoReler={reler}
        />
      )}

      {janelaTema?.tipo === "criar" && (
        <JanelaTema
          key={janelaTema.sugestao.chave}
          sugestao={janelaTema.sugestao}
          rotuloTema={rotularSugestao(janelaTema.sugestao)}
          nomePadrao={nomePadraoDoTema(janelaTema.sugestao)}
          grupos={grupos}
          aoFechar={() => setJanelaTema(null)}
          aoCriada={(colecao) => {
            // A coleção já existe, vazia: a lista e as sugestões (que ela cobre agora)
            // releem, e a janela seguinte oferece as cartas que cabem.
            avisar(t("tema.criada", { colecao: colecao.nome }), { tom: "sucesso" });
            reler();
            setJanelaTema({ tipo: "cartas", colecaoId: colecao.id, nome: colecao.nome });
          }}
          aoReler={reler}
        />
      )}
      {janelaTema?.tipo === "cartas" && (
        <CartasDoTema
          key={janelaTema.colecaoId}
          colecaoId={janelaTema.colecaoId}
          nomeColecao={janelaTema.nome}
          aberto
          versaoGrade={versaoCartas}
          rotularTema={rotularTema}
          onFechar={() => setJanelaTema(null)}
          onAlocadas={(total) => {
            setJanelaTema(null);
            avisar(t("tema.cartasAlocadas", { total }), { tom: "sucesso" });
            reler();
          }}
          aoAmpliar={(c) => startTransition(() => setCopiaAberta(c))}
        />
      )}
      <DetalheCarta
        abertura={abertura}
        onFechar={() => setCopiaAberta(null)}
        onMudou={() => {
          // Uma edição da cópia pode mudar a lista das que cabem (idioma, quantidade): relê com a regra das marcas.
          setVersaoCartas((v) => v + 1);
          reler();
        }}
        devolverFocoPara={devolverFocoDaCopia}
      />
      {dialogo}
    </div>
  );
}
