"use client";

/**
 * Planos na v2 (pacote 5e-b), portado de `(v1)/v1/dex/planos/painel-planos.tsx`
 * — nunca importado de lá. O que fazer nos jogos a seguir: cada plano tem
 * tarefas marcáveis e pode mirar troféus; cada tarefa pode ter um checklist
 * de etapas (`etapas-tarefa.tsx`).
 *
 * - **Concluir oferece o cadastro, nunca registra.** Uma tarefa de captura,
 *   evolução ou troca concluída mostra, ali mesmo, "Cadastrar" já no jogo
 *   dela (`hrefCadastroDaTarefa`); o Pokémon só entra se a pessoa cadastrar.
 * - **Marcar a última etapa não conclui a tarefa.** Com todas feitas, a
 *   linha diz isso ao lado de "Concluir", e o clique continua da pessoa: é
 *   ela quem sabe se a missão acabou (AGENTS.md, "Plans, tasks and planning
 *   sessions").
 * - **As tarefas começam recolhidas**: o título é o botão que abre o
 *   checklist ali mesmo, e recolhida ela mostra só a contagem de etapas. Uma
 *   tela com vários planos abertos de uma vez viraria uma parede de caixas.
 * - **Plano fechado é histórico**, numa seção que abre por botão; é de lá que
 *   um plano se reativa.
 *
 * Um pedido por vez na tela inteira, e a tela fica ocupada até a página
 * relida chegar. A recusa vira frase por `recusa.ts` e
 * aparece junto do que a provocou (a tarefa, o plano, o formulário), ou no
 * topo quando aquilo saiu da vista; um 404 ou 409 relê a página, porque quer
 * dizer que outra aba mudou o que esta tela mostra.
 */

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useId, useMemo, useRef, useState, useTransition } from "react";

import { hojeLocal } from "@/app/_comum/dex/hoje";
import { progressoEtapas } from "@/lib/dominio/dex-etapas";
import { jogoDex } from "@/lib/dominio/dex-jogos";
import { TIPOS_TAREFA, type StatusPlanoDex, type StatusTarefaDex } from "@/lib/dominio/dex-sessao";
import { JOGO_HOME, type IdiomaTrofeu } from "@/lib/dominio/dex-trofeus";
import type { FormaDexDTO, JogoPossuidoDTO, PlanoDexDTO, TarefaDexDTO, TrofeuDexDTO } from "@/lib/dominio/tipos-cliente";

import { useAviso } from "../../../_componentes/primitivos/aviso-flutuante";
import { Botao, BotaoLink } from "../../../_componentes/primitivos/botao";
import { Campo, Selecao } from "../../../_componentes/primitivos/campo";
import { useConfirmacao } from "../../../_componentes/primitivos/dialogo-confirmacao";
import { AvisoEmLinha, Painel } from "../../../_componentes/primitivos/painel";
import { hrefTrofeus } from "../../_componentes/caminhos";
import { SpriteDex } from "../../_componentes/sprite-dex";
import { DataCurta } from "../../trofeus/_componentes/data-curta";

import { EtapasTarefa, type Enviar } from "./etapas-tarefa";
import estilos from "./planos.module.css";
import {
  avisoTodasFeitas,
  erroDoPlano,
  etapasEditaveis,
  fraseDaRecusa,
  hrefCadastroDaTarefa,
  ofereceCadastro,
  telaVelha,
  type ErroPlano,
} from "./regras-planos";

type TrofeuResumo = Pick<TrofeuDexDTO, "id" | "jogoId" | "textos">;

/** Onde a última recusa aparece: o id de um plano ou tarefa, o formulário de plano novo, ou o topo. */
type Erro = { texto: string; onde: string };
const NO_TOPO = "topo";
const NO_PLANO_NOVO = "plano-novo";

type FormPlano = { titulo: string; objetivo: string; inicio: string; fim: string };
type FormTarefa = { planoId: string; titulo: string; tipo: TarefaDexDTO["tipo"]; jogoId: string };

export function PainelPlanos({
  planos,
  trofeus,
  jogos,
  formas,
}: {
  planos: PlanoDexDTO[];
  trofeus: TrofeuResumo[];
  jogos: JogoPossuidoDTO[];
  /** Só as vagas que alguma tarefa mira. */
  formas: FormaDexDTO[];
}) {
  const t = useTranslations("v2DexPlanos");
  const tp = useTranslations("dex.planos");
  const tr = useTranslations("recusas");
  const idioma = useLocale() as IdiomaTrofeu;
  const router = useRouter();
  const avisar = useAviso();
  const { confirmar, dialogo } = useConfirmacao();
  const idHistorico = useId();

  const [erro, setErro] = useState<Erro | null>(null);
  const [enviando, setEnviando] = useState(false);
  /* A página relida chega depois da resposta: até ela chegar, as listas na
     tela são as velhas, e um segundo "descer" calcularia a ordem sobre elas e
     desfaria o primeiro. Por isso a tela fica ocupada até a releitura
     aplicar, não só até a resposta. */
  const [relendo, iniciarReleitura] = useTransition();
  const ocupado = enviando || relendo;
  /** Um pedido por vez, mesmo com dois cliques no mesmo quadro (antes do botão desligar). */
  const emVoo = useRef(false);
  const [novoPlano, setNovoPlano] = useState<FormPlano | null>(null);
  const [erroPlano, setErroPlano] = useState<ErroPlano | null>(null);
  const [novaTarefa, setNovaTarefa] = useState<FormTarefa | null>(null);
  /** Tarefa recém-concluída que oferece o cadastro do Pokémon. */
  const [oferta, setOferta] = useState<string | null>(null);
  /** Tarefas com o checklist aberto. Todas começam recolhidas. */
  const [expandidas, setExpandidas] = useState<ReadonlySet<string>>(() => new Set());
  const [historicoAberto, setHistoricoAberto] = useState(false);

  const formaPorId = useMemo(() => new Map(formas.map((f) => [f.id, f])), [formas]);
  const trofeuPorId = useMemo(() => new Map(trofeus.map((x) => [x.id, x])), [trofeus]);
  const ativos = planos.filter((p) => p.status === "ativo");
  const fechados = planos.filter((p) => p.status !== "ativo");

  /* Os lugares que estão na tela agora: uma recusa de algo que saiu da vista
     (o plano foi para o histórico fechado, a tarefa sumiu) aparece no topo. */
  const naTela = new Set<string>([NO_TOPO, NO_PLANO_NOVO]);
  for (const p of historicoAberto ? planos : ativos) {
    naTela.add(p.id);
    for (const x of p.tarefas) naTela.add(x.id);
  }
  const erroEm = (onde: string) => (erro && (erro.onde === onde || (onde === NO_TOPO && !naTela.has(erro.onde))) ? erro.texto : null);

  const reler = () => iniciarReleitura(() => router.refresh());

  const enviar: Enviar = async (url, method, corpo, onde = NO_TOPO) => {
    if (emVoo.current) return false;
    emVoo.current = true;
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch(url, {
        method,
        ...(corpo === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }),
      });
      if (!r.ok) {
        setErro({ texto: fraseDaRecusa(tr, await r.json().catch(() => null), tp("erro")), onde });
        if (telaVelha(r.status)) reler();
        return false;
      }
      reler();
      return true;
    } catch {
      setErro({ texto: tp("erro"), onde });
      return false;
    } finally {
      emVoo.current = false;
      setEnviando(false);
    }
  };

  function alternar(tarefaId: string) {
    setExpandidas((atual) => {
      const nova = new Set(atual);
      if (!nova.delete(tarefaId)) nova.add(tarefaId);
      return nova;
    });
  }

  async function statusTarefa(tarefa: TarefaDexDTO, status: StatusTarefaDex) {
    if (!(await enviar(`/api/dex/tarefas/${tarefa.id}`, "PATCH", { status }, tarefa.id))) return;
    setOferta(status === "feita" && ofereceCadastro(tarefa.tipo) ? tarefa.id : null);
  }

  const statusPlano = (p: PlanoDexDTO, status: StatusPlanoDex) =>
    enviar(`/api/dex/planos/${p.id}`, "PATCH", { status }, p.id);

  async function criarPlano(f: FormPlano) {
    const problema = erroDoPlano(f);
    setErroPlano(problema);
    if (problema) return;
    const ok = await enviar(
      "/api/dex/planos",
      "POST",
      { titulo: f.titulo, objetivo: f.objetivo || null, inicio: f.inicio, fim: f.fim || null },
      NO_PLANO_NOVO,
    );
    if (ok) {
      setNovoPlano(null);
      avisar(t("planoCriado"), { tom: "sucesso" });
    }
  }

  async function criarTarefa(f: FormTarefa) {
    const ok = await enviar(
      `/api/dex/planos/${f.planoId}/tarefas`,
      "POST",
      { titulo: f.titulo, tipo: f.tipo, jogoId: f.jogoId || null },
      f.planoId,
    );
    if (ok) {
      setNovaTarefa(null);
      avisar(t("tarefaCriada"), { tom: "sucesso" });
    }
  }

  const nomeTrofeu = (id: string) => trofeuPorId.get(id)?.textos[idioma].titulo ?? id;

  function renderTarefa(p: PlanoDexDTO, x: TarefaDexDTO) {
    const aberta = expandidas.has(x.id);
    const idEtapas = `etapas-${x.id}`;
    const progresso = progressoEtapas(x.etapas);
    const editavel = etapasEditaveis(p, x);
    const erroAqui = erroEm(x.id);
    return (
      <li key={x.id} className={estilos.tarefa} data-status={x.status}>
        <div className={estilos.tarefaLinha}>
          <button
            type="button"
            className={estilos.tarefaBotao}
            aria-expanded={aberta}
            aria-controls={idEtapas}
            onClick={() => alternar(x.id)}
          >
            <ChevronRight size={16} aria-hidden className={estilos.seta} data-aberta={aberta || undefined} />
            <span className={estilos.tarefaTexto}>
              <span id={`${idEtapas}-titulo`} className={estilos.tarefaTitulo}>
                {x.titulo}
              </span>
              <span className={estilos.selos}>
                {x.status !== "aberta" && (
                  <span className={estilos.selo} data-tom={x.status === "feita" ? "sucesso" : "fraco"}>
                    {t(`statusTarefa.${x.status}`)}
                  </span>
                )}
                <span className={estilos.selo}>{tp(`tipo.${x.tipo}`)}</span>
                {x.jogoId && <span className={estilos.selo}>{jogoDex(x.jogoId)?.nome ?? x.jogoId}</span>}
                {x.trofeuId && (
                  <span className={estilos.selo} data-tom="alvo">
                    {nomeTrofeu(x.trofeuId)}
                  </span>
                )}
                {progresso.total > 0 && (
                  <span className={estilos.contagemEtapas}>
                    {tp("etapasContagem", { feitas: progresso.feitas, total: progresso.total })}
                  </span>
                )}
              </span>
            </span>
          </button>
          {p.status === "ativo" && (
            <div className={estilos.tarefaAcoes}>
              {avisoTodasFeitas(p, x) && (
                <span className={estilos.todasFeitas} role="status">
                  {t("todasFeitas")}
                </span>
              )}
              {x.status === "aberta" ? (
                <>
                  <Botao variante="primario" pequeno disabled={ocupado} onClick={() => void statusTarefa(x, "feita")}>
                    {t("concluirTarefa")}
                  </Botao>
                  <Botao variante="fantasma" pequeno disabled={ocupado} onClick={() => void statusTarefa(x, "descartada")}>
                    {tp("descartar")}
                  </Botao>
                </>
              ) : (
                <Botao pequeno disabled={ocupado} onClick={() => void statusTarefa(x, "aberta")}>
                  {tp("reabrir")}
                </Botao>
              )}
            </div>
          )}
        </div>
        {x.descricao && <p className={estilos.descricao}>{x.descricao}</p>}
        {x.formaIds.length > 0 && (
          <ul className={estilos.formas} aria-label={t("vagasDaTarefa")}>
            {x.formaIds.map((id) => {
              const f = formaPorId.get(id);
              return f ? (
                <li key={id}>
                  <SpriteDex sprite={f.sprite} shiny={false} tamanho={32} />
                  {f.especie}
                </li>
              ) : null;
            })}
          </ul>
        )}
        {oferta === x.id && x.status === "feita" && (
          <AvisoEmLinha
            tom="sucesso"
            papel="status"
            acao={
              <span className={estilos.botoes}>
                <BotaoLink
                  href={hrefCadastroDaTarefa(x, (id) => formaPorId.get(id)?.especie)}
                  variante="primario"
                  pequeno
                >
                  {tp("irCadastrar")}
                </BotaoLink>
                <Botao variante="fantasma" pequeno onClick={() => setOferta(null)}>
                  {tp("agoraNao")}
                </Botao>
              </span>
            }
          >
            {tp("oferta", { tarefa: x.titulo })}
          </AvisoEmLinha>
        )}
        {erroAqui && (
          <AvisoEmLinha tom="perigo" papel="alert">
            {erroAqui}
          </AvisoEmLinha>
        )}
        <div id={idEtapas} hidden={!aberta}>
          <EtapasTarefa
            tarefa={x}
            idTitulo={`${idEtapas}-titulo`}
            editavel={editavel}
            ocupado={ocupado}
            enviar={enviar}
            confirmar={confirmar}
          />
        </div>
      </li>
    );
  }

  function renderPlano(p: PlanoDexDTO) {
    const feitas = p.tarefas.filter((x) => x.status === "feita").length;
    const idTitulo = `plano-${p.id}`;
    const erroAqui = erroEm(p.id);
    return (
      <Painel as="li" key={p.id} className={estilos.plano} data-status={p.status} aria-labelledby={idTitulo}>
        <div className={estilos.planoCab}>
          <h3 id={idTitulo} className={estilos.planoTitulo}>
            {p.titulo}
          </h3>
          <p className={estilos.selos}>
            <span className={estilos.selo}>
              <DataCurta iso={p.inicio} />
              {p.fim && (
                <>
                  {" → "}
                  <DataCurta iso={p.fim} />
                </>
              )}
            </span>
            {p.status !== "ativo" && (
              <span className={estilos.selo} data-tom="fraco">
                {tp(`status.${p.status}`)}
              </span>
            )}
            {p.origem === "sessao" && (
              <span className={estilos.selo} data-tom="acento">
                {tp("daSessao")}
              </span>
            )}
          </p>
        </div>
        {p.objetivo && <p className={estilos.descricao}>{p.objetivo}</p>}
        {p.tarefas.length > 0 && (
          <div className={estilos.progresso}>
            <span className={estilos.barra} aria-hidden>
              <span style={{ width: `${(feitas / p.tarefas.length) * 100}%` }} />
            </span>
            <span className={estilos.numeros}>{t("tarefasContagem", { feitas, total: p.tarefas.length })}</span>
          </div>
        )}
        {p.trofeuIds.length > 0 && (
          <div className={estilos.alvos}>
            <span className={estilos.alvoRotulo}>{tp("alvo")}</span>
            {p.trofeuIds.map((id) => {
              const x = trofeuPorId.get(id);
              return x ? (
                <Link key={id} href={hrefTrofeus(x.jogoId)} className={estilos.alvo}>
                  {x.textos[idioma].titulo}
                </Link>
              ) : (
                <span key={id} className={estilos.selo}>
                  {id}
                </span>
              );
            })}
          </div>
        )}

        {p.tarefas.length > 0 && (
          <ul className={estilos.tarefas} aria-label={t("tarefasDe", { plano: p.titulo })}>
            {p.tarefas.map((x) => renderTarefa(p, x))}
          </ul>
        )}

        {erroAqui && (
          <AvisoEmLinha tom="perigo" papel="alert">
            {erroAqui}
          </AvisoEmLinha>
        )}

        {p.status === "ativo" &&
          (novaTarefa?.planoId === p.id ? (
            <form
              className={estilos.formulario}
              aria-label={tp("novaTarefa")}
              onSubmit={(e) => {
                e.preventDefault();
                void criarTarefa(novaTarefa);
              }}
            >
              <div className={estilos.campos}>
                <Campo
                  rotulo={tp("tarefa")}
                  value={novaTarefa.titulo}
                  required
                  autoFocus
                  onChange={(e) => setNovaTarefa({ ...novaTarefa, titulo: e.target.value })}
                />
                <Selecao
                  rotulo={tp("tipoRotulo")}
                  value={novaTarefa.tipo}
                  onChange={(e) => setNovaTarefa({ ...novaTarefa, tipo: e.target.value as TarefaDexDTO["tipo"] })}
                >
                  {TIPOS_TAREFA.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {tp(`tipo.${tipo}`)}
                    </option>
                  ))}
                </Selecao>
                <Selecao
                  rotulo={tp("jogo")}
                  value={novaTarefa.jogoId}
                  onChange={(e) => setNovaTarefa({ ...novaTarefa, jogoId: e.target.value })}
                >
                  <option value="">{tp("semJogo")}</option>
                  {jogos.map((j) => (
                    <option key={j.jogoId} value={j.jogoId}>
                      {j.nome}
                    </option>
                  ))}
                </Selecao>
              </div>
              <div className={estilos.botoes}>
                <Botao
                  type="submit"
                  variante="primario"
                  pequeno
                  carregando={ocupado}
                  disabled={!novaTarefa.titulo.trim()}
                >
                  {tp("adicionar")}
                </Botao>
                <Botao variante="fantasma" pequeno disabled={ocupado} onClick={() => setNovaTarefa(null)}>
                  {tp("cancelar")}
                </Botao>
              </div>
            </form>
          ) : (
            <div className={estilos.botoes}>
              <Botao
                pequeno
                disabled={ocupado}
                onClick={() =>
                  setNovaTarefa({ planoId: p.id, titulo: "", tipo: "captura", jogoId: jogos[0]?.jogoId ?? "" })
                }
              >
                {tp("novaTarefa")}
              </Botao>
              <Botao variante="fantasma" pequeno disabled={ocupado} onClick={() => void statusPlano(p, "concluido")}>
                {tp("concluir")}
              </Botao>
              <Botao variante="fantasma" pequeno disabled={ocupado} onClick={() => void statusPlano(p, "encerrado")}>
                {tp("encerrar")}
              </Botao>
            </div>
          ))}
        {p.status !== "ativo" && (
          <div className={estilos.botoes}>
            <Botao pequeno disabled={ocupado} onClick={() => void statusPlano(p, "ativo")}>
              {tp("reativar")}
            </Botao>
          </div>
        )}
      </Painel>
    );
  }

  const erroTopo = erroEm(NO_TOPO);

  return (
    <div className={estilos.pagina}>
      <header className={estilos.cabecalho}>
        <div>
          <p className={estilos.sobretitulo}>Living Dex</p>
          <h1 className={estilos.titulo}>{tp("titulo")}</h1>
          <p className={estilos.subtitulo}>{t("descricao")}</p>
        </div>
        <nav aria-label={t("atalhos")} className={estilos.botoes}>
          <BotaoLink href="/dex" pequeno>
            {t("visaoGeral")}
          </BotaoLink>
          <BotaoLink href={hrefTrofeus(JOGO_HOME)} pequeno>
            {t("trofeus")}
          </BotaoLink>
        </nav>
      </header>

      {erroTopo && (
        <AvisoEmLinha tom="perigo" papel="alert">
          {erroTopo}
        </AvisoEmLinha>
      )}

      <section className={estilos.secao} aria-labelledby="planos-ativos">
        <div className={estilos.secaoCab}>
          <h2 id="planos-ativos" className={estilos.secaoTitulo}>
            {t("ativos")}
          </h2>
          {!novoPlano && (
            <Botao
              variante="primario"
              pequeno
              onClick={() => {
                setErroPlano(null);
                setNovoPlano({ titulo: "", objetivo: "", inicio: hojeLocal(), fim: "" });
              }}
            >
              {tp("novoPlano")}
            </Botao>
          )}
        </div>

        {novoPlano && (
          <Painel>
            <form
              className={estilos.formulario}
              aria-label={tp("novoPlano")}
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void criarPlano(novoPlano);
              }}
            >
              <div className={estilos.campos}>
                <Campo
                  rotulo={tp("tituloRotulo")}
                  value={novoPlano.titulo}
                  required
                  autoFocus
                  erro={erroPlano === "tituloVazio" ? t("erroPlano.tituloVazio") : undefined}
                  onChange={(e) => setNovoPlano({ ...novoPlano, titulo: e.target.value })}
                />
                <Campo
                  rotulo={tp("objetivo")}
                  value={novoPlano.objetivo}
                  onChange={(e) => setNovoPlano({ ...novoPlano, objetivo: e.target.value })}
                />
                <Campo
                  type="date"
                  rotulo={tp("inicio")}
                  value={novoPlano.inicio}
                  required
                  erro={erroPlano === "inicioVazio" ? t("erroPlano.inicioVazio") : undefined}
                  onChange={(e) => setNovoPlano({ ...novoPlano, inicio: e.target.value })}
                />
                <Campo
                  type="date"
                  rotulo={tp("fim")}
                  value={novoPlano.fim}
                  min={novoPlano.inicio || undefined}
                  erro={erroPlano === "fimAntesDoInicio" ? t("erroPlano.fimAntesDoInicio") : undefined}
                  onChange={(e) => setNovoPlano({ ...novoPlano, fim: e.target.value })}
                />
              </div>
              {erroEm(NO_PLANO_NOVO) && (
                <AvisoEmLinha tom="perigo" papel="alert">
                  {erroEm(NO_PLANO_NOVO)}
                </AvisoEmLinha>
              )}
              <div className={estilos.botoes}>
                <Botao type="submit" variante="primario" pequeno carregando={ocupado}>
                  {tp("criar")}
                </Botao>
                <Botao variante="fantasma" pequeno disabled={ocupado} onClick={() => setNovoPlano(null)}>
                  {tp("cancelar")}
                </Botao>
              </div>
            </form>
          </Painel>
        )}

        {ativos.length === 0 ? (
          <Painel>
            <p className={estilos.textoFraco}>{tp("nenhumAtivo")}</p>
          </Painel>
        ) : (
          <ul className={estilos.planos}>{ativos.map(renderPlano)}</ul>
        )}
      </section>

      {fechados.length > 0 && (
        <section className={estilos.secao} aria-labelledby={`${idHistorico}-botao`}>
          <h2 className={estilos.secaoTitulo}>
            <button
              id={`${idHistorico}-botao`}
              type="button"
              className={estilos.historicoBotao}
              aria-expanded={historicoAberto}
              aria-controls={idHistorico}
              onClick={() => setHistoricoAberto(!historicoAberto)}
            >
              <ChevronRight size={18} aria-hidden className={estilos.seta} data-aberta={historicoAberto || undefined} />
              {tp("historico", { quantidade: String(fechados.length) })}
            </button>
          </h2>
          <div id={idHistorico} hidden={!historicoAberto}>
            <p className={`${estilos.textoFraco} ${estilos.explicacao}`}>{t("historicoNota")}</p>
            <ul className={estilos.planos}>{historicoAberto && fechados.map(renderPlano)}</ul>
          </div>
        </section>
      )}
      {dialogo}
    </div>
  );
}

