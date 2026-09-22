"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { Alerta } from "@/app/_componentes/alerta";
import { Botao, classesBotao } from "@/app/_componentes/botao";
import { Distintivo } from "@/app/_componentes/distintivo";
import { EstadoVazio } from "@/app/_componentes/estado-vazio";
import { ImagemCartaComZoom } from "@/app/_componentes/imagem-carta-zoom";
import { classesEntrada } from "@/app/_componentes/campo";
import { copiarTexto } from "@/app/_componentes/copiar-texto";
import {
  FILTROS_PADRAO,
  FILTROS_PADRAO_SET,
  type Filtros,
  type Ordenacao,
} from "@/lib/dominio/liga-opcoes";
import { formatarDuracao } from "@/lib/dominio/estimativa-varredura";
import { VALIDADE_CONSULTA_HORAS } from "@/lib/dominio/frescor-consulta";
import { compararLocalId } from "@/lib/dominio/ordenacao";
import type { OrigemImagem } from "@/lib/dominio/origem-imagem";
import { textoDaRecusa } from "@/app/_componentes/recusa";

/**
 * Tela de opções de compra das vagas vazias — a Fase 6 em uso, nas coleções
 * Pokédex e de set.
 *
 * O fluxo é o definido em 2026-09-02: o usuário escolhe os parâmetros,
 * dispara a varredura, **vê todas as opções que passaram** e marca as que
 * quer. O sistema não escolhe carta por ele (regra 5).
 *
 * ## A mesma tela, dois formatos de vaga
 *
 * Na Pokédex a vaga é uma espécie com dezenas de opções, e a pergunta é "qual
 * destas eu compro". No set a vaga é uma carta específica com uma oferta só, e
 * a pergunta é "quanto custa o que falta". Por isso o set não mostra a
 * ordenação por preferência (não há entre o que escolher) nem o filtro de
 * carta fora do catálogo (a carta do set está no catálogo por construção) — e
 * ganha, no lugar, a ordem da própria lista de vagas.
 *
 * ## A varredura leva horas, e a tela precisa dizer isso
 *
 * O intervalo entre requisições passou a obedecer o `robots.txt` deles
 * (`lib/liga/ritmo.ts`): as mesmas 161 vagas que levavam ~12 minutos levam
 * ~16 horas. Um texto em minutos e uma ampulheta não servem nessa escala —
 * daí o progresso trazer **consultadas, restantes e previsão de término**, e a
 * tela dizer de onde o ritmo saiu. Ela continua se atualizando sozinha e
 * mostrando o que já chegou; ninguém precisa ficar com a aba aberta.
 */

const SITE = "https://www.ligapokemon.com.br";

type TipoColecaoComVaga = "pokedex" | "set";

interface OpcaoDTO {
  id: string;
  chave: string;
  dex: number | null;
  especie: string | null;
  nome: string;
  edicaoSigla: string;
  edicaoNome: string;
  numero: string;
  total: string | null;
  preco: number;
  precoMedio: number | null;
  precoMaximo: number | null;
  raridade: string | null;
  setNome: string | null;
  cartaId: string | null;
  caminho: string;
  selecionada: boolean;
  /** `null` na carta fora do nosso catálogo — não fazemos hotlink da foto deles. */
  imagemUrl: string | null;
  imagemOrigem: OrigemImagem | null;
}

interface VagaDTO {
  chave: string;
  /** A espécie, na Pokédex; o nome da carta, no set. */
  rotulo: string;
  dex: number | null;
  opcoes: OpcaoDTO[];
  descartadas: number;
}

interface VarreduraDTO {
  id: string;
  filtros: Filtros;
  vagasConsultadas: number;
  requisicoes: number;
  concluidaEm: string | null;
  erro: string | null;
  criadoEm: string;
  emAndamento: boolean;
  /** Vagas que ainda faltam consultar. Nulo quando a rodada já acabou. */
  vagasRestantes: number | null;
  segundosRestantes: number | null;
  previsaoTermino: string | null;
}

/** De onde saiu o intervalo entre requisições — ver `lib/liga/ritmo.ts`. */
interface RitmoDTO {
  intervaloSegundos: number;
  origem: "env" | "robots" | "conservador";
}

interface RespostaDTO {
  tipo: TipoColecaoComVaga;
  ritmo: RitmoDTO;
  varredura: VarreduraDTO | null;
  vagas: VagaDTO[];
  /** Cartas da triagem cuja vaga ainda está vazia — as que vão na string. */
  selecionadas: number;
  /** Escolhas de vaga já preenchida: guardadas, fora da string. */
  guardadas: number;
  /** O bloco pronto para colar na Compra por Lista deles. */
  listaLiga: string;
  total: number;
  /** Escolhas sem preço conhecido — entram na string, não no total. */
  semPreco: number;
  /** Data do preço mais antigo da lista. Preço sem data é armadilha. */
  precoMaisAntigo: string | null;
}

/** Como a lista de vagas de um set é ordenada na tela. */
type OrdemVagasSet = "numero" | "preco";

/* O preço é sempre em reais — vem da LigaPokemon, que vende em BRL. O que
   muda com o idioma da interface é só a PONTUAÇÃO do número (R$ 1.234,56 em
   pt-BR, R$ 1,234.56 em inglês), nunca a moeda. */
const brl = (valor: number, locale: string) =>
  valor.toLocaleString(locale, { style: "currency", currency: "BRL" });

/**
 * O intervalo entre requisições em texto curto. As unidades (`min`, `s`) são
 * as mesmas nos dois idiomas — só a frase em volta é que muda, e essa vem do
 * catálogo de mensagens.
 */
function intervaloLegivel(ritmo: RitmoDTO): string {
  return ritmo.intervaloSegundos >= 60
    ? `${Math.round(ritmo.intervaloSegundos / 60)} min`
    : `${ritmo.intervaloSegundos} s`;
}

/** O menor preço encontrado para a vaga, ou `null` quando ela não tem oferta. */
function menorPreco(vaga: VagaDTO): number | null {
  if (vaga.opcoes.length === 0) return null;
  return Math.min(...vaga.opcoes.map((o) => o.preco));
}

export default function OpcoesCompraPage() {
  const t = useTranslations("opcoesCompra");
  const tr = useTranslations("recusas");
  const locale = useLocale();
  const { id } = useParams<{ id: string }>();

  const dinheiro = useCallback((valor: number) => brl(valor, locale), [locale]);

  /**
   * Hora do fim, curta. Numa rodada de 16 horas a previsão quase sempre cai em
   * outro dia — então a data aparece quando não é hoje, e só então.
   */
  const horaLegivel = useCallback(
    (iso: string | null): string => {
      if (iso === null) return "—";
      const quando = new Date(iso);
      const hora = quando.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
      const hoje = new Date().toDateString() === quando.toDateString();
      if (hoje) return t("asHora", { hora });
      return t("dataHora", {
        data: quando.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" }),
        hora,
      });
    },
    [locale, t],
  );

  /** Como a tela explica de onde veio o intervalo entre requisições. */
  const textoDoRitmo = useCallback(
    (ritmo: RitmoDTO | undefined): string => {
      if (!ritmo) return "";
      const intervalo = intervaloLegivel(ritmo);
      if (ritmo.origem === "env") return t("ritmoEnv", { intervalo });
      if (ritmo.origem === "robots") return t("ritmoRobots", { intervalo });
      return t("ritmoConservador", { intervalo });
    },
    [t],
  );

  const [dados, setDados] = useState<RespostaDTO | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [disparando, setDisparando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const [teto, setTeto] = useState(String(FILTROS_PADRAO.tetoPreco ?? ""));
  const [ordenacao, setOrdenacao] = useState<Ordenacao>(FILTROS_PADRAO.ordenacao);
  const [incluirFora, setIncluirFora] = useState(FILTROS_PADRAO.incluirForaDoCatalogo);
  // Escape do pulo por frescor: sem ele, quem varreu hoje só receberia
  // "já consultadas" ao clicar, sem caminho para pedir preço novo.
  const [reconsultarTudo, setReconsultarTudo] = useState(false);
  const [soComOpcao, setSoComOpcao] = useState(false);
  const [ordemVagas, setOrdemVagas] = useState<OrdemVagasSet>("numero");

  // O padrão da coleção de set é outro (sem teto, ordenado por preço), e o
  // tipo só se sabe depois da primeira resposta — então os padrões são
  // aplicados na chegada dela, uma vez só e nunca por cima do que ele já
  // tiver mexido.
  const padraoAplicado = useRef(false);

  // Consulta adiada, para juntar uma rajada de cliques de marcação numa só.
  const atualizacaoAgendada = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `carregar` é não-async de propósito, como o resto das telas deste repo: a
  // regra `react-hooks/set-state-in-effect` acusa `setState` alcançável de
  // forma síncrona a partir do efeito, e a cadeia de `.then` é o que a
  // satisfaz.

  const carregar = useCallback(() => {
    fetch(`/api/colecoes/${id}/opcoes-compra`)
      .then(async (r) => {
        if (!r.ok) throw new Error("resposta não ok");
        return (await r.json()) as RespostaDTO;
      })
      .then((d) => {
        setDados(d);
        if (padraoAplicado.current) return;
        padraoAplicado.current = true;
        if (d.tipo !== "set") return;
        setTeto(String(FILTROS_PADRAO_SET.tetoPreco ?? ""));
        setOrdenacao(FILTROS_PADRAO_SET.ordenacao);
        setIncluirFora(FILTROS_PADRAO_SET.incluirForaDoCatalogo);
      })
      .catch(() => setErro(t("erroCarregar")))
      .finally(() => setCarregando(false));
  }, [id, t]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const agendarAtualizacao = useCallback(() => {
    if (atualizacaoAgendada.current !== null) clearTimeout(atualizacaoAgendada.current);
    atualizacaoAgendada.current = setTimeout(() => {
      atualizacaoAgendada.current = null;
      carregar();
    }, 700);
  }, [carregar]);

  // Sair da tela com uma consulta agendada deixaria um `setState` procurando
  // componente desmontado.
  useEffect(
    () => () => {
      if (atualizacaoAgendada.current !== null) clearTimeout(atualizacaoAgendada.current);
    },
    [],
  );

  // Enquanto a varredura roda, a tela se atualiza sozinha — num período
  // amarrado ao ritmo dela, e não fixo. A ideia original continua valendo
  // ("cada consulta traz novidade, e não vira polling à toa"), só que o ritmo
  // deixou de ser 3 s: com 360 s entre requisições, perguntar de 5 em 5
  // segundos são 70 consultas ao banco para uma vaga de novidade.
  const periodoAtualizacao = Math.min(
    60_000,
    Math.max(5_000, (dados?.ritmo?.intervaloSegundos ?? 3) * 250),
  );
  useEffect(() => {
    if (!dados?.varredura?.emAndamento) return;
    const timer = setInterval(() => carregar(), periodoAtualizacao);
    return () => clearInterval(timer);
  }, [dados?.varredura?.emAndamento, carregar, periodoAtualizacao]);

  const ehSet = dados?.tipo === "set";

  async function dispararVarredura() {
    setDisparando(true);
    setErro(null);
    setAviso(null);

    const tetoNumero = teto.trim() === "" ? null : Number(teto.replace(",", "."));
    if (tetoNumero !== null && (!Number.isFinite(tetoNumero) || tetoNumero <= 0)) {
      setErro(t("erroTeto"));
      setDisparando(false);
      return;
    }

    const resposta = await fetch(`/api/colecoes/${id}/opcoes-compra`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tetoPreco: tetoNumero,
        ordenacao,
        incluirForaDoCatalogo: incluirFora,
        // Zero desliga o pulo por frescor: consulta tudo de novo.
        ...(reconsultarTudo ? { validadeHoras: 0 } : {}),
      }),
    });

    const corpo = await resposta.json();
    setDisparando(false);

    if (!resposta.ok) {
      setErro(textoDaRecusa(tr, corpo, t("erroIniciar")));
      return;
    }

    const puladas =
      corpo.vagasPuladas > 0 ? t("varreduraPuladas", { total: corpo.vagasPuladas }) : "";
    setAviso(
      t("varreduraIniciada", {
        vagas: corpo.vagasParaConsultar,
        estimativa: formatarDuracao(corpo.estimativaSegundos),
        previsao: horaLegivel(corpo.previsaoTermino),
      }) +
        puladas +
        t("varreduraPodeSair"),
    );
    carregar();
  }

  async function alternar(opcao: OpcaoDTO) {
    // Otimista: marcar carta é gesto de lista, e esperar o servidor a cada
    // clique tornaria a seleção de dezenas de cartas insuportável.
    setDados((atual) =>
      atual === null
        ? atual
        : {
            ...atual,
            selecionadas: atual.selecionadas + (opcao.selecionada ? -1 : 1),
            vagas: atual.vagas.map((v) => ({
              ...v,
              opcoes: v.opcoes.map((o) =>
                o.id === opcao.id ? { ...o, selecionada: !o.selecionada } : o,
              ),
            })),
          },
    );

    const resposta = await fetch(`/api/colecoes/${id}/opcoes-compra/selecao`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [opcao.id], selecionada: !opcao.selecionada }),
    });
    if (!resposta.ok) {
      setErro(t("erroMarcacao"));
      carregar();
      return;
    }
    // O bloco para colar é montado no servidor, para não divergir do arquivo
    // baixado — então a marcação otimista o deixa defasado até a próxima
    // consulta. Recarregar a cada clique desfaria a razão de ser otimista, e
    // marcar 31 cartas viraria 31 idas ao servidor; o atraso junta a rajada
    // numa consulta só, depois que ele para de clicar.
    agendarAtualizacao();
  }

  /**
   * Marca a primeira opção de cada vaga que ainda não tem nada marcado.
   *
   * A ordem da lista já é a preferência dele (raridade dentro do teto, ou
   * preço), então "a primeira" é "a melhor pelo critério que ele escolheu".
   * Continua sendo clique dele — a regra 5 fala de o sistema não escolher
   * sozinho, e aqui quem aperta é ele. Sem isto, marcar as 31 vagas de um set
   * são 31 cliques, e a camada 2 fica cara de alcançar.
   */
  async function marcarMelhorDeCadaVaga() {
    const alvos = (dados?.vagas ?? [])
      .filter((v) => v.opcoes.length > 0 && !v.opcoes.some((o) => o.selecionada))
      .map((v) => v.opcoes[0].id);

    if (alvos.length === 0) {
      setAviso(t("todasJaMarcadas"));
      return;
    }

    const resposta = await fetch(`/api/colecoes/${id}/opcoes-compra/selecao`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: alvos, selecionada: true }),
    });
    if (!resposta.ok) setErro(t("erroMarcacao"));
    carregar();
  }

  async function copiar(texto: string) {
    // `copiarTexto` existe porque a app é HTTP na rede local e a Clipboard API
    // não existe fora de contexto seguro — ver o cabeçalho daquele arquivo.
    if (await copiarTexto(texto)) {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2_000);
      return;
    }
    setErro(t("erroCopiar"));
  }

  const varredura = dados?.varredura ?? null;
  // Duas rodadas simultâneas dobram o ritmo contra o site deles — o servidor
  // recusa, e a tela não deve nem oferecer.
  const rodando = varredura?.emAndamento ?? false;

  const vagasVisiveis = useMemo(() => {
    const vagas = dados?.vagas ?? [];
    const filtradas = soComOpcao ? vagas.filter((v) => v.opcoes.length > 0) : vagas;
    if (!ehSet || ordemVagas === "numero") return filtradas;

    // Por preço, no set: a vaga sem oferta vai para o fim, e não para o topo
    // como um "R$ 0,00" faria. Ela continua na lista — é informação, não ruído.
    return [...filtradas].sort((a, b) => {
      const pa = menorPreco(a);
      const pb = menorPreco(b);
      if (pa === null && pb === null) return compararLocalId(a.chave, b.chave);
      if (pa === null) return 1;
      if (pb === null) return -1;
      return pa - pb;
    });
  }, [dados?.vagas, soComOpcao, ehSet, ordemVagas]);

  // O total vem do servidor, e não da grade: a triagem existe sem varredura
  // nenhuma, e a grade pode nem estar na tela. A marcação otimista deixa este
  // número defasado por um instante — `agendarAtualizacao` o acerta junto com
  // o bloco para colar.
  const totalSelecionado = dados?.total ?? 0;

  const semOpcao = (dados?.vagas ?? []).filter((v) => v.opcoes.length === 0).length;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
      <Link href={`/colecoes/${id}`} className="text-sm text-accent hover:underline">
        {t("voltar")}
      </Link>

      <CabecalhoPagina
        titulo={t("titulo")}
        descricao={ehSet ? t("descricaoSet") : t("descricaoPokedex")}
      />

      {erro && <Alerta tom="perigo">{erro}</Alerta>}
      {aviso && <Alerta tom="neutro">{aviso}</Alerta>}

      <section className="rounded-card border border-hairline bg-surface p-4 shadow-1">
        <h2 className="mb-3 text-sm font-semibold text-foreground">{t("parametros")}</h2>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">{t("tetoPorCarta")}</span>
            <input
              className={classesEntrada}
              value={teto}
              onChange={(e) => setTeto(e.target.value)}
              placeholder={t("semTeto")}
              inputMode="decimal"
            />
          </label>

          {ehSet ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">{t("ordenarListaPor")}</span>
              <select
                className={classesEntrada}
                value={ordemVagas}
                onChange={(e) => setOrdemVagas(e.target.value as OrdemVagasSet)}
              >
                <option value="numero">{t("ordemNumero")}</option>
                <option value="preco">{t("ordemMaisBarata")}</option>
              </select>
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">{t("ordenarPor")}</span>
              <select
                className={classesEntrada}
                value={ordenacao}
                onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}
              >
                <option value="preferencia">{t("ordemPreferencia")}</option>
                <option value="preco">{t("ordemMaisBarata")}</option>
              </select>
            </label>
          )}

          {/* No set toda opção é a carta do próprio set, que está no catálogo
              por construção — o filtro não teria o que esconder. */}
          {!ehSet && (
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={incluirFora}
                onChange={(e) => setIncluirFora(e.target.checked)}
              />
              {t("incluirFora")}
            </label>
          )}

          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={reconsultarTudo}
              onChange={(e) => setReconsultarTudo(e.target.checked)}
            />
            {t("reconsultarTudo")}
          </label>

          <Botao
            type="button"
            variante="primario"
            onClick={dispararVarredura}
            disabled={disparando || rodando}
          >
            {disparando
              ? t("iniciando")
              : rodando
                ? t("emAndamentoBotao")
                : t("verificarOpcoes")}
          </Botao>
        </div>
        <p className="mt-3 text-xs text-muted">
          {textoDoRitmo(dados?.ritmo)} {t("explicacaoFrescor", { horas: VALIDADE_CONSULTA_HORAS })}
          {ehSet && t("explicacaoSet")}
        </p>
      </section>

      {varredura && (
        <section className="flex flex-wrap items-center gap-3 rounded-card border border-hairline bg-surface p-3 text-sm shadow-1">
          <Distintivo tom={varredura.emAndamento ? "aviso" : "neutro"}>
            {varredura.emAndamento ? t("emAndamento") : t("concluida")}
          </Distintivo>
          <span className="text-muted">
            {t("resumoVarredura", {
              vagas: varredura.vagasConsultadas,
              requisicoes: varredura.requisicoes,
            })}{" "}
            · {new Date(varredura.criadoEm).toLocaleString(locale)}
          </span>
          {/* Numa rodada de horas, "em andamento" sozinho não é informação:
              o que responde "posso fechar isto?" é quanto falta e até quando. */}
          {rodando && varredura.vagasRestantes !== null && (
            <span className="text-muted">
              {t("faltamVagas", { total: varredura.vagasRestantes })}
              {varredura.segundosRestantes !== null &&
                ` · ~${formatarDuracao(varredura.segundosRestantes)}`}
              {varredura.previsaoTermino !== null &&
                t("terminoPrevisto", { quando: horaLegivel(varredura.previsaoTermino) })}
            </span>
          )}
          {rodando && (
            <span className="text-muted">
              {t("telaSeAtualiza")}
            </span>
          )}
          {varredura.filtros.tetoPreco !== null && (
            <span className="text-muted">
              {t("tetoValor", { valor: dinheiro(varredura.filtros.tetoPreco) })}
            </span>
          )}
          {semOpcao > 0 && (
            <span className="text-muted">
              {ehSet
                ? t("vagasSemOferta", { total: semOpcao })
                : t("vagasSemOpcao", { total: semOpcao })}
              {varredura.filtros.tetoPreco !== null ? t("dentroDoTeto") : t("comEstoque")}
            </span>
          )}
        </section>
      )}

      {varredura?.erro && (
        <Alerta tom="perigo">
          {t("varreduraInterrompida", { erro: varredura.erro })}
        </Alerta>
      )}

      {dados && dados.vagas.some((v) => v.opcoes.length > 0) && (
        <div className="flex flex-wrap items-center gap-3">
          <Botao variante="secundario" tamanho="sm" onClick={() => void marcarMelhorDeCadaVaga()}>
            {t("marcarMelhor")}
          </Botao>
          <span className="text-xs text-muted">{t("marcarMelhorAjuda")}</span>
        </div>
      )}

      {(dados?.selecionadas ?? 0) > 0 && (
        <section className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-card border-2 border-accent bg-surface p-3 shadow-3">
          <strong className="text-sm text-foreground">
            {t("cartasNaLista", {
              total: dados?.selecionadas ?? 0,
              valor: dinheiro(totalSelecionado),
            })}
          </strong>
          {(dados?.semPreco ?? 0) > 0 && (
            <span
              className="text-xs text-muted"
              title={t("semPrecoTitulo")}
            >
              {t("semPrecoConhecido", { total: dados?.semPreco ?? 0 })}
            </span>
          )}
          {(dados?.guardadas ?? 0) > 0 && (
            <span
              className="text-xs text-muted"
              title={t("guardadasTitulo")}
            >
              {t("guardadas", { total: dados?.guardadas ?? 0 })}
            </span>
          )}
          <a
            href={`/api/colecoes/${id}/opcoes-compra/exportar?formato=liga`}
            className={classesBotao("secundario", "sm")}
          >
            {t("baixarListaLiga")}
          </a>
          <a
            href={`/api/colecoes/${id}/opcoes-compra/exportar?formato=csv`}
            className={classesBotao("secundario", "sm")}
          >
            {t("baixarCsv")}
          </a>
          <a
            href={`/api/colecoes/${id}/opcoes-compra/exportar?formato=texto`}
            className={classesBotao("secundario", "sm")}
          >
            {t("baixarListaTexto")}
          </a>
        </section>
      )}

      {dados && dados.listaLiga !== "" && (
        <section className="flex flex-col gap-2 rounded-card border border-hairline bg-surface p-3 shadow-1">
          <header className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              {t("compraPorLista")}
            </h2>
            <Botao
              variante="secundario"
              tamanho="sm"
              onClick={() => void copiar(dados.listaLiga)}
              className="ml-auto"
            >
              {copiado ? t("copiado") : t("copiar")}
            </Botao>
          </header>

          {/* Uma lista só, de propósito. A divisão por variante existiu por
              algumas horas em 16/09 e foi desfeita: duas listas viram duas
              otimizações de loja independentes na Liga, contra o frete. A
              organização de lojas é deles — eles enxergam o marketplace
              inteiro e o preço real; nós, uma fatia. */}
          <p className="text-xs text-muted">
            {t.rich("comoColar", { forte: (partes) => <strong className="text-foreground">{partes}</strong> })}
          </p>

          <pre className="max-h-80 overflow-auto rounded-card bg-inset p-2 text-xs leading-relaxed text-foreground">
            {dados.listaLiga}
          </pre>

          <p className="text-xs text-muted">
            {t("listaGuardada")}
            {dados.precoMaisAntigo &&
              t("precoMaisAntigo", {
                data: new Date(dados.precoMaisAntigo).toLocaleDateString(locale),
              })}{" "}
            {t("totalEhPiso", { valor: dinheiro(totalSelecionado) })}
          </p>
        </section>
      )}

      {dados && dados.vagas.length > 0 && (
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={soComOpcao}
            onChange={(e) => setSoComOpcao(e.target.checked)}
          />
          {ehSet ? t("esconderSemOferta") : t("esconderSemOpcao")}
        </label>
      )}

      {carregando && <p className="text-sm text-muted">{t("carregando")}</p>}

      {!carregando && !varredura && (
        <EstadoVazio>
          {(dados?.selecionadas ?? 0) > 0
            ? t("vazioComLista")
            : t("vazioSemVarredura")}
        </EstadoVazio>
      )}

      <div className="flex flex-col gap-4">
        {vagasVisiveis.map((vaga) => (
          <section
            key={vaga.chave}
            className="overflow-hidden rounded-card border border-hairline bg-surface shadow-1"
          >
            <header className="flex items-center justify-between border-b border-line px-3 py-2">
              <h2 className="text-sm font-semibold text-foreground">
                {vaga.dex !== null ? String(vaga.dex).padStart(3, "0") : vaga.chave} — {vaga.rotulo}
              </h2>
              <span className="text-xs text-muted">
                {/* No set a contagem é sempre 0 ou 1: repetir "1 opção(ões)" em
                    cada linha seria ruído. O que informa lá é o descarte. */}
                {!ehSet && t("contagemOpcoes", { total: vaga.opcoes.length })}
                {vaga.descartadas > 0 &&
                  `${ehSet ? "" : " · "}${t("foraDosFiltros", { total: vaga.descartadas })}`}
              </span>
            </header>

            {vaga.opcoes.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted">
                {ehSet ? t("semOfertaSet") : t("semOpcaoPokedex")}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {vaga.opcoes.map((opcao) => (
                  <li
                    key={opcao.id}
                    className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={opcao.selecionada}
                      onChange={() => void alternar(opcao)}
                      aria-label={t("selecionarOpcao", {
                        nome: opcao.nome,
                        edicao: opcao.edicaoNome,
                      })}
                    />
                    {/* Só a carta que casou com o nosso catálogo tem foto. A
                        LigaPokemon publica a dela, mas o projeto decidiu em
                        2026-08-29 não fazer hotlink de terceiro. */}
                    <ImagemCartaComZoom
                      imagemUrl={opcao.imagemUrl}
                      origem={opcao.imagemOrigem}
                      alt={`${opcao.nome} (${opcao.numero})`}
                      width={34}
                      height={47}
                      fallback={
                        <span
                          className="inline-block shrink-0 rounded-tcg border border-dashed border-line"
                          style={{ width: 34, height: 47 }}
                          title={t("semFoto")}
                        />
                      }
                    />
                    <span className="min-w-40 font-medium text-foreground">{opcao.nome}</span>
                    <span className="text-muted">
                      {opcao.edicaoNome} ({opcao.numero}
                      {opcao.total ? `/${opcao.total}` : ""})
                    </span>
                    {opcao.raridade && <Distintivo tom="neutro">{opcao.raridade}</Distintivo>}
                    {opcao.cartaId === null && (
                      <Distintivo tom="aviso" title={t("foraDoCatalogoTitulo")}>
                        {t("foraDoCatalogo")}
                      </Distintivo>
                    )}
                    <strong className="ml-auto text-foreground">{dinheiro(opcao.preco)}</strong>
                    <a
                      href={`${SITE}${opcao.caminho}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-xs text-accent hover:underline"
                    >
                      {t("verOfertas")}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
