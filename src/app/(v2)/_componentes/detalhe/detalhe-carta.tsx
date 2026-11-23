"use client";

/**
 * `<DetalheCarta>` — a camada de detalhe de carta da v2. Um componente, não
 * uma página (regra 7 de `docs/design-v2/rules.md`: o detalhe é estado de
 * cliente sobre a tela, para a carta da grade virar a carta do detalhe no
 * mesmo commit). A coleção, o inventário e o início o abrem a partir de uma
 * carta; ele substitui as janelas de alocar, de melhoria, de editar cópia,
 * de destino e o zoom da v1.
 *
 * É a janela da v2 (`primitivos/modal`) no nível `detalhe` da pilha de
 * camadas: painel no desktop, folha que sobe de baixo no celular, Esc e foco
 * pela pilha, trava de rolagem em qualquer largura. As confirmações saem por
 * cima dele, no nível `confirmacao`.
 *
 * ## Contrato com quem abre
 *
 * - `abertura`: `null` fecha. Modo vaga leva a coleção e a vaga **da grade**
 *   (`GET /api/colecoes/:id/grade`); modo cópia leva a carta e a cópia.
 * - `onMudou(evento)`: chamado depois de toda escrita que deu certo, e
 *   depois de uma recusa que mostra que o estado mudou por baixo. Quem abriu
 *   relê a grade (ou a lista) e passa a vaga nova: o detalhe usa a vaga
 *   recebida como verdade, salvo logo depois de uma escrita sua, quando lê
 *   a própria vaga pelo detalhe da carta até a nova chegar.
 * - `onFechar`: chamado dentro de `startTransition`, para a carta voltar à
 *   grade pela mesma transição de vista em que saiu.
 * - `chaveTransicao`: a chave da carta que abriu (a vaga, a cópia). Com ela,
 *   a carta do palco leva `nomeTransicaoCarta(chave, true)`; quem abriu tira
 *   o nome da carta dele no mesmo commit em que abre (o nome só existe no par
 *   ativo) e abre dentro de `startTransition`.
 * - `secaoCompra`: o ponto de extensão da compra na vaga vazia (a aba "O que
 *   falta" o preenche). Sem ele, as escolhas de compra aparecem só para
 *   leitura.
 *
 * ## Recusas
 *
 * Toda recusa vira frase por `_comum/recusa.ts`. Validação (400) mantém a
 * tela; sumiu (404) ou mudou (409, ou a candidata tomada por outra aba)
 * relê tudo e avisa quem abriu (`seguimentoDaRecusa`). Se o que foi aberto
 * não existe mais, o detalhe diz isso e só oferece fechar.
 */

import { useTranslations } from "next-intl";
import { type ReactNode, startTransition, useCallback, useEffect, useRef, useState } from "react";

import { type FaltaNaImagemLocal, type ModoImagemLocal, pedidoDeEnvio, pedidoDeRemocao } from "@/app/_comum/imagem-local";
import { textoDaRecusa } from "@/app/_comum/recusa";
import { rotuloChaveVaga } from "@/lib/dominio/chave-vaga-set";
import { urlSpritePokemon } from "@/lib/imagens";
import { ehOrigemPropria } from "@/lib/dominio/origem-imagem";
import type {
  CandidataMelhoriaDTO,
  CandidatoVagaDTO,
  DestinoElegivelDaCopiaDTO,
  DetalheCartaV2DTO,
  MelhoriaDaVagaDTO,
  VagaGradeV2DTO,
} from "@/lib/dominio/tipos-cliente";

import { useAviso } from "../primitivos/aviso-flutuante";
import { Botao } from "../primitivos/botao";
import { useConfirmacao } from "../primitivos/dialogo-confirmacao";
import { Modal } from "../primitivos/modal";
import { AvisoEmLinha } from "../primitivos/painel";
import type { ResolvedorFoco } from "../primitivos/use-camada";

import estilos from "./detalhe.module.css";
import type { CorpoEdicaoCopia } from "./edicao-copia";
import {
  type AberturaDetalhe,
  type ColecaoDaVaga,
  chaveDaRecusa,
  ordenarCopias,
  seguimentoDaRecusa,
  urlDoDetalhe,
  vagaMudouDesdeAGrade,
  vagaSomeAoDesalocar,
} from "./estado-detalhe";
import { type Formatos, useFormatos } from "./formatos";
import { FormularioEdicao, SecaoFoto, SecaoOnde, chaveDoDestino } from "./modo-copia";
import { SecaoVagaPreenchida, SecaoVagaVazia } from "./modo-vaga";
import { BlocoPreco, Ficha, ListaCopias, Palco } from "./secoes";
import { useLeitura, useVersao } from "./use-leitura";

export type { AberturaDetalhe, ColecaoDaVaga, PreviaDaCarta } from "./estado-detalhe";

/** O que mudou, para quem abriu decidir o que reler. */
export type EventoDetalhe =
  | { tipo: "alocada"; vagaId: string | null; colecaoId: string; copiaId: string; dividida: boolean }
  | { tipo: "desalocada"; vagaId: string; copiaId: string | null }
  | { tipo: "trocada"; vagaId: string; copiaId: string; dividida: boolean }
  | { tipo: "melhoriaDescartada" | "melhoriaRestaurada"; vagaId: string; copiaId: string }
  | { tipo: "copiaEditada"; copiaId: string }
  | { tipo: "fotoAlterada"; cartaId: string }
  | { tipo: "setMapeado"; setId: string }
  | { tipo: "compra"; vagaId: string }
  /** Uma recusa ou uma leitura mostrou que o estado mudou por baixo (outra aba). */
  | { tipo: "desatualizada" };

/** O que a seção de compra recebe do detalhe (o ponto de extensão do pacote da aba "O que falta"). */
export interface ContextoCompra {
  colecao: ColecaoDaVaga;
  vaga: VagaGradeV2DTO;
  /** Chame depois de marcar ou desmarcar: o detalhe relê e avisa quem abriu. */
  aoMudar: () => void;
}

export interface PropsDetalheCarta {
  abertura: AberturaDetalhe | null;
  onFechar: () => void;
  onMudou?: (evento: EventoDetalhe) => void;
  chaveTransicao?: string;
  devolverFocoPara?: ResolvedorFoco;
  secaoCompra?: (contexto: ContextoCompra) => ReactNode;
}

export function DetalheCarta(props: PropsDetalheCarta) {
  const { abertura } = props;
  if (!abertura) return null;
  // Outra carta aberta por cima desta: estado novo, sem resto da anterior.
  const chave = abertura.modo === "vaga" ? `vaga:${abertura.vaga.id}` : `copia:${abertura.copiaId}`;
  return <DetalheAberto key={chave} {...props} abertura={abertura} />;
}

type Resposta = { ok: true; corpo: Record<string, unknown> } | { ok: false };

function DetalheAberto({
  abertura,
  onFechar,
  onMudou,
  chaveTransicao,
  devolverFocoPara,
  secaoCompra,
}: PropsDetalheCarta & { abertura: AberturaDetalhe }) {
  const t = useTranslations("v2Detalhe");
  const tRecusas = useTranslations("recusas");
  const avisar = useAviso();
  const formatos = useFormatos();
  const { confirmar, dialogo } = useConfirmacao();
  const [versao, reler] = useVersao();
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const fechar = useCallback(() => startTransition(() => onFechar()), [onFechar]);

  // Os callbacks mais recentes de quem abriu, sem refazer efeitos.
  const mudou = useRef(onMudou);
  useEffect(() => {
    mudou.current = onMudou;
  });
  const avisarMudanca = useCallback((evento: EventoDetalhe) => mudou.current?.(evento), []);

  /**
   * Um pedido de escrita. A recusa vira frase; se ela diz que o estado mudou
   * por baixo, relê tudo e avisa quem abriu. Nunca lança.
   */
  const executar = useCallback(
    async (url: string, init: RequestInit, padrao: string): Promise<Resposta> => {
      setErro(null);
      setOcupado(true);
      try {
        const r = await fetch(url, init);
        const corpo: unknown = await r.json().catch(() => null);
        if (!r.ok) {
          setErro(textoDaRecusa(tRecusas, corpo, padrao));
          if (seguimentoDaRecusa(r.status, chaveDaRecusa(corpo)) === "reler") {
            reler();
            avisarMudanca({ tipo: "desatualizada" });
          }
          return { ok: false };
        }
        return { ok: true, corpo: (corpo ?? {}) as Record<string, unknown> };
      } catch {
        setErro(t("erroRede"));
        return { ok: false };
      } finally {
        setOcupado(false);
      }
    },
    [tRecusas, t, reler, avisarMudanca],
  );

  const comum: Comum = {
    t,
    formatos,
    confirmar,
    executar,
    ocupado,
    reler,
    versao,
    avisar,
    avisarMudanca,
    fechar,
    erro,
    limparErro: () => setErro(null),
    dialogo,
    devolverFocoPara,
  };

  return abertura.modo === "vaga" ? (
    <ModoVaga {...comum} abertura={abertura} chaveTransicao={chaveTransicao} secaoCompra={secaoCompra} />
  ) : (
    <ModoCopia {...comum} abertura={abertura} chaveTransicao={chaveTransicao} />
  );
}

/* ====================================================================== */

interface Comum {
  t: ReturnType<typeof useTranslations>;
  formatos: Formatos;
  confirmar: ReturnType<typeof useConfirmacao>["confirmar"];
  executar: (url: string, init: RequestInit, padrao: string) => Promise<Resposta>;
  ocupado: boolean;
  reler: () => void;
  versao: number;
  avisar: ReturnType<typeof useAviso>;
  avisarMudanca: (evento: EventoDetalhe) => void;
  fechar: () => void;
  erro: string | null;
  /** Tira da tela a recusa da ação anterior (a validação local barrou a seguinte). */
  limparErro: () => void;
  dialogo: ReactNode;
  devolverFocoPara?: ResolvedorFoco;
}

/**
 * A janela do detalhe, igual nos dois modos: a camada `detalhe` da pilha,
 * larga no desktop, a recusa da última ação no alto e a confirmação por cima.
 */
function Moldura({
  comum,
  titulo,
  descricao,
  children,
}: {
  comum: Comum;
  titulo: ReactNode;
  descricao: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <Modal
        aberto
        onFechar={comum.fechar}
        nivel="detalhe"
        largura={1000}
        titulo={titulo}
        descricao={descricao}
        devolverFocoPara={comum.devolverFocoPara}
      >
        {comum.erro ? (
          <div className={estilos.erro}>
            <AvisoEmLinha tom="perigo" papel="alert" titulo={comum.t("naoDeu")}>
              {comum.erro}
            </AvisoEmLinha>
          </div>
        ) : null}
        {children}
      </Modal>
      {comum.dialogo}
    </>
  );
}

const JSON_POST = (corpo: unknown, method: "POST" | "DELETE" | "PATCH" = "POST"): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(corpo),
});

/** A linha de identificação: set, número/oficial. */
function linhaDaCarta(carta: DetalheCartaV2DTO["carta"]): string {
  const numero = carta.setQtdOficial ? `${carta.localId}/${carta.setQtdOficial}` : carta.localId;
  return [carta.setNome, carta.setSigla, numero].filter(Boolean).join(" · ");
}

/** O estado "isto não existe mais": a frase e o único caminho, fechar. */
function Sumiu({ t, texto, fechar }: { t: Comum["t"]; texto: string; fechar: () => void }) {
  return (
    <div className={estilos.info}>
      <AvisoEmLinha tom="alerta" titulo={t("sumiu.titulo")} papel="status" acao={<Botao onClick={fechar}>{t("fechar")}</Botao>}>
        {texto}
      </AvisoEmLinha>
    </div>
  );
}

/* ---------------------------- Modo vaga ---------------------------- */

/**
 * O que o detalhe sabe da vaga **além** da grade: logo depois de uma escrita
 * sua, a carta que está (ou espera) na vaga, até quem abriu passar a vaga
 * relida. Presa à vaga que estava em vigor (`base`): quando a vaga nova
 * chega, a sobrescrita perde a validade sozinha.
 */
interface Sobrescrita {
  base: VagaGradeV2DTO;
  carta: VagaGradeV2DTO["carta"] | null;
}

function ModoVaga({
  abertura,
  chaveTransicao,
  secaoCompra,
  ...comum
}: Comum & {
  abertura: Extract<AberturaDetalhe, { modo: "vaga" }>;
  chaveTransicao?: string;
  secaoCompra?: PropsDetalheCarta["secaoCompra"];
}) {
  const { t, formatos, confirmar, executar, ocupado, reler, versao, avisar, avisarMudanca, fechar } = comum;
  const { colecao, vaga } = abertura;
  const tComp = useTranslations("componentes");
  const [sobrescrita, setSobrescrita] = useState<Sobrescrita | null>(null);
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [descartadas, setDescartadas] = useState<string[]>([]);
  const [viuMelhoria, setViuMelhoria] = useState(false);

  const sobrescritaValida = sobrescrita !== null && sobrescrita.base === vaga;
  const cartaDaVaga = sobrescritaValida ? sobrescrita.carta : (vaga.carta ?? null);
  const urlDetalhe = urlDoDetalhe({ modo: "vaga", colecao, vaga: { ...vaga, carta: cartaDaVaga ?? undefined } }, null);
  const detalhe = useLeitura<DetalheCartaV2DTO>(urlDetalhe, versao);

  // A cópia na vaga: a do detalhe (lido agora), senão a da grade.
  const contexto = detalhe.dados?.contexto.vaga ?? null;
  const copiaNaVaga = contexto ? contexto.copiaId : sobrescritaValida ? null : (vaga.copia?.id ?? null);
  const vazia = copiaNaVaga === null;

  const candidatos = useLeitura<{ itens: CandidatoVagaDTO[] }>(vazia ? `/api/vagas/${vaga.id}/candidatos` : null, versao);
  const pedeMelhoria = !vazia && (vaga.upgrade !== undefined || sobrescritaValida || descartadas.length > 0 || viuMelhoria);
  const melhorias = useLeitura<{ itens: MelhoriaDaVagaDTO[] }>(
    pedeMelhoria ? `/api/colecoes/${colecao.id}/melhorias` : null,
    versao,
  );
  const melhoria = melhorias.dados?.itens.find((m) => m.vagaId === vaga.id && m.atual.copiaId === copiaNaVaga) ?? null;
  // Depois de ver a lista uma vez, ela fica pedida: um descarte que apaga o
  // sinal da grade não pode levar junto o "Restaurar".
  if (melhoria && !viuMelhoria) setViuMelhoria(true);

  // Outra aba mexeu na vaga desde a grade: avisa quem abriu, uma vez por leitura.
  const desatualizada = !sobrescritaValida && vagaMudouDesdeAGrade(vaga, detalhe.dados);
  const avisouDe = useRef<DetalheCartaV2DTO | null>(null);
  useEffect(() => {
    if (desatualizada && detalhe.dados && avisouDe.current !== detalhe.dados) {
      avisouDe.current = detalhe.dados;
      avisarMudanca({ tipo: "desatualizada" });
    }
  }, [desatualizada, detalhe.dados, avisarMudanca]);

  const leituraEmCurso = detalhe.carregando || detalhe.relendo || candidatos.relendo || melhorias.relendo;
  const bloqueado = ocupado || leituraEmCurso;
  const ficha = detalhe.dados?.carta ?? null;
  const copias = detalhe.dados ? ordenarCopias(detalhe.dados.copias, copiaNaVaga) : [];
  const copiaAtual = copias.find((c) => c.id === copiaNaVaga) ?? null;

  const nomeVaga = ficha?.nome ?? vaga.cartaNome ?? vaga.especie ?? `#${vaga.numero}`;
  const ehPokedex = colecao.tipo === "pokedex";
  const titulo = vazia && !cartaDaVaga && ehPokedex ? t("tituloEspecie", { numero: vaga.numero, especie: vaga.especie ?? "" }) : nomeVaga;
  const descricao = t("descricaoVaga", { colecao: colecao.nome, numero: vaga.numero });

  /* ---------- Ações ---------- */

  async function alocar() {
    const c = candidatos.dados?.itens.find((x) => x.id === escolhida);
    if (!c) return;
    if (c.foraDePadrao) {
      const ok = await confirmar({
        titulo: t("confirmar.foraTitulo"),
        descricao: t("confirmar.foraDescricao", {
          idioma: c.idioma.toUpperCase(),
          exigido: (colecao.idiomaExigido ?? "—").toUpperCase(),
        }),
        rotuloConfirmar: t("confirmar.alocarMesmoAssim"),
      });
      if (!ok) return;
    }
    const r = await executar(
      `/api/vagas/${vaga.id}/alocar`,
      JSON_POST({ copiaId: c.id, permitirForaDePadrao: c.foraDePadrao }),
      t("erro.alocar"),
    );
    if (!r.ok) {
      setEscolhida(null);
      return;
    }
    const dividida = r.corpo.dividida === true;
    setSobrescrita({ base: vaga, carta: { cartaId: c.cartaId, idiomaCatalogo: c.idiomaCatalogo, raridade: null } });
    setEscolhida(null);
    avisar(dividida ? t("feito.alocadaDividida", { carta: c.cartaNome, numero: vaga.numero }) : t("feito.alocada", { carta: c.cartaNome, numero: vaga.numero }), { tom: "sucesso" });
    reler();
    avisarMudanca({ tipo: "alocada", vagaId: vaga.id, colecaoId: colecao.id, copiaId: String(r.corpo.copiaAlocadaId ?? c.id), dividida });
  }

  async function desalocar() {
    const ok = await confirmar({
      titulo: t("confirmar.desalocarTitulo", { numero: vaga.numero }),
      descricao: vagaSomeAoDesalocar(colecao.tipo) ? t("confirmar.desalocarCustomizada") : t("confirmar.desalocarDescricao"),
      rotuloConfirmar: t("desalocar"),
    });
    if (!ok) return;
    const r = await executar(`/api/vagas/${vaga.id}/alocar`, { method: "DELETE" }, t("erro.desalocar"));
    if (!r.ok) return;
    avisar(t("feito.desalocada", { numero: vaga.numero }), { tom: "sucesso" });
    avisarMudanca({ tipo: "desalocada", vagaId: vaga.id, copiaId: copiaNaVaga });
    if (vagaSomeAoDesalocar(colecao.tipo)) {
      fechar();
      return;
    }
    setSobrescrita({ base: vaga, carta: ehPokedex ? null : cartaDaVaga });
    setDescartadas([]);
    reler();
  }

  async function trocar(c: CandidataMelhoriaDTO) {
    const atual = melhoria?.atual;
    const ok = await confirmar({
      titulo: t("confirmar.trocarTitulo", { numero: vaga.numero }),
      descricao: t("confirmar.trocarDescricao", {
        sai: atual ? `${atual.cartaNome} (${atual.idioma.toUpperCase()} · ${tComp(`variante.${atual.variante}`)} · ${atual.condicao})` : "—",
        entra: `${c.cartaNome} (${c.idioma.toUpperCase()} · ${tComp(`variante.${c.variante}`)} · ${c.condicao})`,
      }),
      rotuloConfirmar: t("melhoria.trocar"),
    });
    if (!ok) return;
    const r = await executar(`/api/vagas/${vaga.id}/trocar`, JSON_POST({ copiaId: c.id }), t("erro.trocar"));
    if (!r.ok) return;
    const dividida = r.corpo.dividida === true;
    setSobrescrita({ base: vaga, carta: { cartaId: c.cartaId, idiomaCatalogo: c.idiomaCatalogo, raridade: c.raridade } });
    setDescartadas([]);
    avisar(dividida ? t("feito.trocadaDividida", { numero: vaga.numero }) : t("feito.trocada", { numero: vaga.numero }), { tom: "sucesso" });
    reler();
    avisarMudanca({ tipo: "trocada", vagaId: vaga.id, copiaId: String(r.corpo.copiaAlocadaId ?? c.id), dividida });
  }

  async function alternarDescarte(c: CandidataMelhoriaDTO, descartar: boolean) {
    const r = await executar(
      `/api/vagas/${vaga.id}/melhorias/descartar`,
      JSON_POST({ copiaId: c.id }, descartar ? "POST" : "DELETE"),
      t("erro.descartar"),
    );
    if (!r.ok) return;
    // Sem reler a lista: a descartada fica nela, apagada, com "Restaurar".
    setDescartadas((atuais) => (descartar ? [...atuais, c.id] : atuais.filter((id) => id !== c.id)));
    avisarMudanca({ tipo: descartar ? "melhoriaDescartada" : "melhoriaRestaurada", vagaId: vaga.id, copiaId: c.id });
  }

  /* ---------- Desenho ---------- */

  const sumiu =
    detalhe.falha?.status === 404 || candidatos.falha?.status === 404
      ? t("sumiu.vaga")
      : null;
  if (sumiu) {
    return (
      <Moldura comum={comum} titulo={titulo} descricao={descricao}>
        <Sumiu t={t} texto={sumiu} fechar={fechar} />
      </Moldura>
    );
  }

  const falhaLeitura = detalhe.falha ?? candidatos.falha;
  const sprite = vazia && !cartaDaVaga ? urlSpritePokemon(vaga.chave) : undefined;

  return (
    <Moldura comum={comum} titulo={titulo} descricao={descricao}>
    <div className={estilos.grade}>
      <Palco
        imagemUrl={ficha?.imagemUrl ?? (sobrescritaValida ? null : (vaga.imagemUrl ?? null))}
        origem={ficha?.imagemOrigem ?? vaga.imagemOrigem ?? null}
        alt={nomeVaga}
        variante={copiaAtual?.variante ?? (vazia ? null : (vaga.copia?.variante ?? null))}
        raridade={ficha?.raridade ?? cartaDaVaga?.raridade ?? null}
        fantasma={vazia}
        sprite={sprite}
        chaveTransicao={chaveTransicao}
      />
      <div className={estilos.info}>
        {ficha ? <p className={estilos.sobre}>{linhaDaCarta(ficha)}</p> : null}
        {ficha ? <Ficha carta={ficha} /> : null}
        {desatualizada ? (
          <AvisoEmLinha tom="alerta" papel="status" titulo={t("desatualizada.titulo")}>
            {t("desatualizada.texto")}
          </AvisoEmLinha>
        ) : null}
        {falhaLeitura && falhaLeitura.status !== 404 ? (
          <AvisoEmLinha tom="perigo" papel="alert" titulo={t("naoDeu")} acao={<Botao pequeno onClick={reler}>{t("tentarDeNovo")}</Botao>}>
            {t("erro.ler")}
          </AvisoEmLinha>
        ) : null}

        {vazia ? (
          <SecaoVagaVazia
            alvo={cartaDaVaga ? "carta" : "especie"}
            candidatos={candidatos.dados?.itens ?? null}
            carregando={candidatos.carregando}
            escolhida={escolhida}
            bloqueado={bloqueado}
            idiomaExigido={colecao.idiomaExigido}
            escolhas={sobrescritaValida ? [] : (vaga.escolhas ?? [])}
            secaoCompra={secaoCompra?.({
              colecao,
              vaga,
              aoMudar: () => {
                reler();
                avisarMudanca({ tipo: "compra", vagaId: vaga.id });
              },
            })}
            aoEscolher={setEscolhida}
            aoAlocar={alocar}
          />
        ) : (
          <SecaoVagaPreenchida
            copia={copiaAtual}
            melhoria={melhoria}
            carregandoMelhoria={melhorias.carregando}
            descartadas={descartadas}
            bloqueado={bloqueado}
            formatos={formatos}
            aoTrocar={trocar}
            aoDescartar={(c) => alternarDescarte(c, true)}
            aoRestaurar={(c) => alternarDescarte(c, false)}
            aoDesalocar={desalocar}
          />
        )}

        {detalhe.dados ? (
          <>
            <ListaCopias copias={copias} foco={copiaNaVaga} formatos={formatos} />
            <BlocoPreco preco={detalhe.dados.preco} serie={detalhe.dados.serie} formatos={formatos} />
          </>
        ) : null}
      </div>
    </div>
    </Moldura>
  );
}

/* ---------------------------- Modo cópia ---------------------------- */

function ModoCopia({
  abertura,
  chaveTransicao,
  ...comum
}: Comum & { abertura: Extract<AberturaDetalhe, { modo: "copia" }>; chaveTransicao?: string }) {
  const { t, formatos, confirmar, executar, ocupado, reler, versao, avisar, avisarMudanca, fechar } = comum;
  const [copiaFoco, setCopiaFoco] = useState(abertura.copiaId);
  const [mostrandoDestinos, setMostrandoDestinos] = useState(false);
  const [destinoEscolhido, setDestinoEscolhido] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [mexendoFoto, setMexendoFoto] = useState(false);

  const detalhe = useLeitura<DetalheCartaV2DTO>(urlDoDetalhe(abertura, copiaFoco), versao);
  const dados = detalhe.dados;
  const copia = dados?.copias.find((c) => c.id === copiaFoco) ?? null;
  const livre = copia !== null && copia.alocacao === null;
  const destinos = useLeitura<{ itens: DestinoElegivelDaCopiaDTO[] }>(
    mostrandoDestinos && livre ? `/api/copias/${copiaFoco}/destinos` : null,
    versao,
  );
  const bloqueado = ocupado || detalhe.carregando || detalhe.relendo || destinos.relendo;

  const ficha = dados?.carta ?? null;
  const titulo = ficha?.nome ?? abertura.previa?.nome ?? t("carregando");
  const descricao = ficha ? linhaDaCarta(ficha) : null;

  function focar(id: string) {
    setCopiaFoco(id);
    setMostrandoDestinos(false);
    setDestinoEscolhido(null);
    setEditando(false);
  }

  /* ---------- Ações ---------- */

  async function salvar(corpo: CorpoEdicaoCopia) {
    const r = await executar(`/api/copias/${copiaFoco}`, JSON_POST(corpo, "PATCH"), t("erro.salvar"));
    if (!r.ok) return;
    avisar(t("feito.salva"), { tom: "sucesso" });
    reler();
    avisarMudanca({ tipo: "copiaEditada", copiaId: copiaFoco });
  }

  async function desalocar() {
    const a = copia?.alocacao;
    if (!a) return;
    const ok = await confirmar({
      titulo: t("confirmar.desalocarCopiaTitulo"),
      descricao: t("confirmar.desalocarCopiaDescricao", { colecao: a.colecaoNome, numero: a.numero }),
      rotuloConfirmar: t("desalocar"),
    });
    if (!ok) return;
    const r = await executar(`/api/vagas/${a.vagaId}/alocar`, { method: "DELETE" }, t("erro.desalocar"));
    if (!r.ok) return;
    avisar(t("feito.desalocadaCopia", { colecao: a.colecaoNome }), { tom: "sucesso" });
    reler();
    avisarMudanca({ tipo: "desalocada", vagaId: a.vagaId, copiaId: copiaFoco });
  }

  async function alocar() {
    const d = destinos.dados?.itens.find((x) => chaveDoDestino(x) === destinoEscolhido);
    if (!d || !copia) return;
    if (d.foraDePadrao) {
      const ok = await confirmar({
        titulo: t("confirmar.foraTitulo"),
        descricao: t("confirmar.foraDescricao", {
          idioma: copia.idioma.toUpperCase(),
          exigido: (d.idiomaExigido ?? "—").toUpperCase(),
        }),
        rotuloConfirmar: t("confirmar.alocarMesmoAssim"),
      });
      if (!ok) return;
    }
    const r = await executar(
      d.vagaId ? `/api/vagas/${d.vagaId}/alocar` : `/api/colecoes/${d.colecaoId}/copias`,
      JSON_POST({ copiaId: copia.id, permitirForaDePadrao: d.foraDePadrao }),
      t("erro.alocar"),
    );
    setDestinoEscolhido(null);
    if (!r.ok) return;
    const dividida = r.corpo.dividida === true;
    const frase = d.vagaId
      ? t("feito.alocadaNoDestino", { colecao: d.colecaoNome, numero: d.chave ? rotuloChaveVaga(d.chave) : "" })
      : t("feito.adicionadaAColecao", { colecao: d.colecaoNome });
    avisar(dividida ? `${frase} ${t("feito.loteDividido")}` : frase, { tom: "sucesso" });
    setMostrandoDestinos(false);
    reler();
    avisarMudanca({
      tipo: "alocada",
      vagaId: d.vagaId ?? (typeof r.corpo.vagaId === "string" ? r.corpo.vagaId : null),
      colecaoId: d.colecaoId,
      copiaId: String(r.corpo.copiaAlocadaId ?? copia.id),
      dividida,
    });
  }

  async function enviarFoto(modo: ModoImagemLocal, arquivo: File | null, link: string): Promise<FaltaNaImagemLocal | null> {
    if (!ficha) return null;
    const p = pedidoDeEnvio(modo, { cartaId: ficha.cartaId, idiomaCatalogo: ficha.idioma, setId: ficha.setId, arquivo, link });
    if (!p.ok) {
      comum.limparErro();
      return p.falta;
    }
    const r = await executar(p.pedido.url, p.pedido.init, modo === "mypcards" ? t("erro.mapear") : t("erro.foto"));
    if (!r.ok) return null;
    if (modo === "mypcards") {
      const naFila = typeof r.corpo.cartasNaFila === "number" ? r.corpo.cartasNaFila : 0;
      avisar(naFila > 0 ? t("feito.setMapeadoComFila", { total: naFila }) : t("feito.setMapeadoSemFila"), { tom: "sucesso" });
      avisarMudanca({ tipo: "setMapeado", setId: ficha.setId });
    } else {
      avisar(t("feito.fotoSalva"), { tom: "sucesso" });
      avisarMudanca({ tipo: "fotoAlterada", cartaId: ficha.cartaId });
      setMexendoFoto(false);
    }
    reler();
    return null;
  }

  async function removerFoto() {
    if (!ficha) return;
    const ok = await confirmar({
      titulo: t("confirmar.removerFotoTitulo"),
      descricao: t("confirmar.removerFotoDescricao"),
      rotuloConfirmar: t("foto.remover"),
      perigoso: true,
    });
    if (!ok) return;
    const p = pedidoDeRemocao(ficha.cartaId, ficha.idioma);
    const r = await executar(p.url, p.init, t("erro.removerFoto"));
    if (!r.ok) return;
    avisar(t("feito.fotoRemovida"), { tom: "sucesso" });
    avisarMudanca({ tipo: "fotoAlterada", cartaId: ficha.cartaId });
    setMexendoFoto(false);
    reler();
  }

  /* ---------- Desenho ---------- */

  if (detalhe.falha?.status === 404) {
    return (
      <Moldura comum={comum} titulo={titulo} descricao={descricao}>
        <Sumiu t={t} texto={t("sumiu.copia")} fechar={fechar} />
      </Moldura>
    );
  }

  const previa = abertura.previa;
  const temFotoPropria = ehOrigemPropria(ficha?.imagemOrigem);

  return (
    <Moldura comum={comum} titulo={titulo} descricao={descricao}>
    <div className={estilos.grade}>
      <Palco
        imagemUrl={ficha?.imagemUrl ?? previa?.imagemUrl ?? null}
        origem={ficha?.imagemOrigem ?? previa?.imagemOrigem ?? null}
        alt={ficha?.nome ?? previa?.nome ?? ""}
        variante={copia?.variante ?? previa?.variante ?? null}
        raridade={ficha?.raridade ?? previa?.raridade ?? null}
        fantasma={false}
        chaveTransicao={chaveTransicao}
      />
      <div className={estilos.info}>
        {ficha ? <Ficha carta={ficha} /> : null}
        {detalhe.falha ? (
          <AvisoEmLinha tom="perigo" papel="alert" titulo={t("naoDeu")} acao={<Botao pequeno onClick={reler}>{t("tentarDeNovo")}</Botao>}>
            {t("erro.ler")}
          </AvisoEmLinha>
        ) : null}
        {!dados && !detalhe.falha ? <p className={estilos.sutil}>{t("carregando")}</p> : null}

        {copia ? (
          <>
            <SecaoOnde
              copia={copia}
              formatos={formatos}
              destinos={destinos.dados?.itens ?? null}
              carregandoDestinos={destinos.carregando}
              mostrandoDestinos={mostrandoDestinos}
              escolhido={destinoEscolhido}
              bloqueado={bloqueado}
              aoMostrarDestinos={(m) => {
                setMostrandoDestinos(m);
                setDestinoEscolhido(null);
              }}
              aoEscolher={setDestinoEscolhido}
              aoAlocar={alocar}
              aoDesalocar={desalocar}
            />

            <section className={estilos.bloco} aria-labelledby="v2-detalhe-editar">
              <h3 id="v2-detalhe-editar" className={estilos.tituloBloco}>
                {t("copia.editar")}
              </h3>
              <Botao
                className={estilos.alternar}
                variante={editando ? "fantasma" : "secundario"}
                aria-expanded={editando}
                aria-controls="v2-detalhe-formulario"
                onClick={() => setEditando((v) => !v)}
              >
                {editando ? t("copia.fecharEdicao") : t("copia.abrirEdicao")}
              </Botao>
              {editando && ficha ? (
                <div id="v2-detalhe-formulario">
                  <FormularioEdicao
                    // Remonta quando a cópia guardada muda: os campos mostram o banco.
                    key={`${copia.id}:${JSON.stringify(copia)}`}
                    copia={copia}
                    carta={ficha}
                    bloqueado={bloqueado}
                    aoSalvar={salvar}
                    aoBarrar={comum.limparErro}
                  />
                </div>
              ) : null}
            </section>

            {ficha ? (
              <section className={estilos.bloco} aria-labelledby="v2-detalhe-foto">
                <h3 id="v2-detalhe-foto" className={estilos.tituloBloco}>
                  {t("foto.titulo")}
                </h3>
                <Botao
                  className={estilos.alternar}
                  variante={mexendoFoto ? "fantasma" : "secundario"}
                  aria-expanded={mexendoFoto}
                  aria-controls="v2-detalhe-foto-form"
                  onClick={() => setMexendoFoto((v) => !v)}
                >
                  {mexendoFoto ? t("foto.fechar") : temFotoPropria ? t("foto.trocar") : t("foto.adicionar")}
                </Botao>
                {mexendoFoto ? (
                  <div id="v2-detalhe-foto-form">
                    <SecaoFoto
                      temFotoPropria={temFotoPropria}
                      setId={ficha.setId}
                      bloqueado={bloqueado}
                      aoEnviar={enviarFoto}
                      aoRemover={removerFoto}
                    />
                  </div>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}

        {dados ? (
          <>
            <ListaCopias copias={ordenarCopias(dados.copias, copiaFoco)} foco={copiaFoco} formatos={formatos} aoFocar={focar} />
            <BlocoPreco preco={dados.preco} serie={dados.serie} formatos={formatos} />
          </>
        ) : null}
      </div>
    </div>
    </Moldura>
  );
}
