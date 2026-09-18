"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
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
import { compararLocalId } from "@/lib/dominio/ordenacao";
import type { OrigemImagem } from "@/lib/dominio/origem-imagem";

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
 * A varredura leva minutos (uma requisição a cada 3 segundos contra o site
 * deles), então a tela pergunta o progresso de tempos em tempos e vai
 * mostrando o que já chegou — em vez de uma ampulheta que não diz nada.
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
}

interface RespostaDTO {
  tipo: TipoColecaoComVaga;
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

const brl = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** O menor preço encontrado para a vaga, ou `null` quando ela não tem oferta. */
function menorPreco(vaga: VagaDTO): number | null {
  if (vaga.opcoes.length === 0) return null;
  return Math.min(...vaga.opcoes.map((o) => o.preco));
}

export default function OpcoesCompraPage() {
  const { id } = useParams<{ id: string }>();

  const [dados, setDados] = useState<RespostaDTO | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [disparando, setDisparando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const [teto, setTeto] = useState(String(FILTROS_PADRAO.tetoPreco ?? ""));
  const [ordenacao, setOrdenacao] = useState<Ordenacao>(FILTROS_PADRAO.ordenacao);
  const [incluirFora, setIncluirFora] = useState(FILTROS_PADRAO.incluirForaDoCatalogo);
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
      .catch(() => setErro("Não foi possível carregar as opções."))
      .finally(() => setCarregando(false));
  }, [id]);

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

  // Enquanto a varredura roda, a tela se atualiza sozinha. Cinco segundos é
  // mais lento que o ritmo dela (uma vaga a cada ~3,75s), então cada consulta
  // traz novidade — e não vira polling à toa.
  useEffect(() => {
    if (!dados?.varredura?.emAndamento) return;
    const timer = setInterval(() => carregar(), 5_000);
    return () => clearInterval(timer);
  }, [dados?.varredura?.emAndamento, carregar]);

  const ehSet = dados?.tipo === "set";

  async function dispararVarredura() {
    setDisparando(true);
    setErro(null);
    setAviso(null);

    const tetoNumero = teto.trim() === "" ? null : Number(teto.replace(",", "."));
    if (tetoNumero !== null && (!Number.isFinite(tetoNumero) || tetoNumero <= 0)) {
      setErro("Teto de preço inválido.");
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
      }),
    });

    const corpo = await resposta.json();
    setDisparando(false);

    if (!resposta.ok) {
      setErro(corpo.erro ?? "Não foi possível iniciar a varredura.");
      return;
    }

    const minutos = Math.ceil(corpo.estimativaSegundos / 60);
    setAviso(
      `Varredura iniciada: ${corpo.vagasParaConsultar} vaga(s), estimativa de ${minutos} minuto(s). ` +
        `Pode sair desta tela — o resultado fica salvo.`,
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
      setErro("A marcação não foi salva. Recarregue a página.");
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
      setAviso("Todas as vagas com oferta já têm uma carta marcada.");
      return;
    }

    const resposta = await fetch(`/api/colecoes/${id}/opcoes-compra/selecao`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: alvos, selecionada: true }),
    });
    if (!resposta.ok) setErro("A marcação não foi salva. Recarregue a página.");
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
    setErro("Não deu para copiar sozinho — selecione o texto acima e copie à mão.");
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
        ← Voltar para a coleção
      </Link>

      <CabecalhoPagina
        titulo="Opções de compra"
        descricao={
          ehSet
            ? "Preços da LigaPokemon para as cartas que faltam neste set. Cada vaga tem uma carta só — a decisão de comprar é sua."
            : "Preços da LigaPokemon para as vagas vazias desta Pokédex. O sistema filtra e ordena; a escolha é sua."
        }
      />

      {erro && <Alerta tom="perigo">{erro}</Alerta>}
      {aviso && <Alerta tom="neutro">{aviso}</Alerta>}

      <section className="rounded-card border border-hairline bg-surface p-4 shadow-1">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Parâmetros da busca</h2>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Teto por carta (R$)</span>
            <input
              className={classesEntrada}
              value={teto}
              onChange={(e) => setTeto(e.target.value)}
              placeholder="sem teto"
              inputMode="decimal"
            />
          </label>

          {ehSet ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">Ordenar a lista por</span>
              <select
                className={classesEntrada}
                value={ordemVagas}
                onChange={(e) => setOrdemVagas(e.target.value as OrdemVagasSet)}
              >
                <option value="numero">Número da carta no set</option>
                <option value="preco">Mais barata primeiro</option>
              </select>
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">Ordenar por</span>
              <select
                className={classesEntrada}
                value={ordenacao}
                onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}
              >
                <option value="preferencia">Melhor carta dentro do teto</option>
                <option value="preco">Mais barata primeiro</option>
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
              Incluir cartas fora do nosso catálogo
            </label>
          )}

          <Botao
            type="button"
            variante="primario"
            onClick={dispararVarredura}
            disabled={disparando || rodando}
          >
            {disparando
              ? "Iniciando…"
              : rodando
                ? "Varredura em andamento…"
                : "Verificar opções faltantes"}
          </Botao>
        </div>
        <p className="mt-3 text-xs text-muted">
          Uma requisição a cada 3 segundos contra o site deles. Reverse e holo não entram aqui: a
          variante é da oferta, não da carta — ela aparece ao abrir uma carta específica.
          {ehSet &&
            " No set, a busca é pelo nome da carta e só entra a edição e o número certos: reimpressão em outra edição não preenche a vaga."}
        </p>
      </section>

      {varredura && (
        <section className="flex flex-wrap items-center gap-3 rounded-card border border-hairline bg-surface p-3 text-sm shadow-1">
          <Distintivo tom={varredura.emAndamento ? "aviso" : "neutro"}>
            {varredura.emAndamento ? "Em andamento" : "Concluída"}
          </Distintivo>
          <span className="text-muted">
            {varredura.vagasConsultadas} vaga(s) consultada(s) · {varredura.requisicoes}{" "}
            requisição(ões) · {new Date(varredura.criadoEm).toLocaleString("pt-BR")}
          </span>
          {rodando && (
            <span className="text-muted">
              a tela se atualiza sozinha; pode sair e voltar
            </span>
          )}
          {varredura.filtros.tetoPreco !== null && (
            <span className="text-muted">teto {brl(varredura.filtros.tetoPreco)}</span>
          )}
          {semOpcao > 0 && (
            <span className="text-muted">
              {semOpcao} vaga(s) sem {ehSet ? "oferta" : "opção"}
              {varredura.filtros.tetoPreco !== null ? " dentro do teto" : " com estoque"}
            </span>
          )}
        </section>
      )}

      {varredura?.erro && (
        <Alerta tom="perigo">
          A varredura parou antes do fim: {varredura.erro} O que já foi consultado continua abaixo.
        </Alerta>
      )}

      {dados && dados.vagas.some((v) => v.opcoes.length > 0) && (
        <div className="flex flex-wrap items-center gap-3">
          <Botao variante="secundario" tamanho="sm" onClick={() => void marcarMelhorDeCadaVaga()}>
            Marcar a melhor de cada vaga
          </Botao>
          <span className="text-xs text-muted">
            Marca a primeira opção das vagas ainda sem nenhuma carta escolhida — a melhor pelo
            critério de ordenação que você escolheu.
          </span>
        </div>
      )}

      {(dados?.selecionadas ?? 0) > 0 && (
        <section className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-card border-2 border-accent bg-surface p-3 shadow-3">
          <strong className="text-sm text-foreground">
            {dados?.selecionadas} carta(s) na lista · {brl(totalSelecionado)}
          </strong>
          {(dados?.semPreco ?? 0) > 0 && (
            <span
              className="text-xs text-muted"
              title="Cartas que não apareceram na última varredura. Continuam na lista com o preço da última vez — ou sem preço, quando nunca houve um."
            >
              {dados?.semPreco} sem preço conhecido
            </span>
          )}
          {(dados?.guardadas ?? 0) > 0 && (
            <span
              className="text-xs text-muted"
              title="Cartas que você escolheu e cuja vaga já está preenchida. Saem da string, mas ficam guardadas — se a cópia sair da vaga, elas voltam."
            >
              {dados?.guardadas} já cadastrada(s), fora da lista
            </span>
          )}
          <a
            href={`/api/colecoes/${id}/opcoes-compra/exportar?formato=liga`}
            className={classesBotao("secundario", "sm")}
          >
            Baixar lista da Liga
          </a>
          <a
            href={`/api/colecoes/${id}/opcoes-compra/exportar?formato=csv`}
            className={classesBotao("secundario", "sm")}
          >
            Baixar CSV
          </a>
          <a
            href={`/api/colecoes/${id}/opcoes-compra/exportar?formato=texto`}
            className={classesBotao("secundario", "sm")}
          >
            Baixar lista em texto
          </a>
        </section>
      )}

      {dados && dados.listaLiga !== "" && (
        <section className="flex flex-col gap-2 rounded-card border border-hairline bg-surface p-3 shadow-1">
          <header className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              Compra por Lista — texto para colar
            </h2>
            <Botao
              variante="secundario"
              tamanho="sm"
              onClick={() => void copiar(dados.listaLiga)}
              className="ml-auto"
            >
              {copiado ? "Copiado" : "Copiar"}
            </Botao>
          </header>

          {/* Uma lista só, de propósito. A divisão por variante existiu por
              algumas horas em 16/09 e foi desfeita: duas listas viram duas
              otimizações de loja independentes na Liga, contra o frete. A
              organização de lojas é deles — eles enxergam o marketplace
              inteiro e o preço real; nós, uma fatia. */}
          <p className="text-xs text-muted">
            Cole na Compra por Lista deles. Em &ldquo;Adicionar Detalhes&rdquo;, Qualidade:{" "}
            <strong className="text-foreground">NM</strong>. O agrupamento por loja quem faz é a
            Liga, em &ldquo;Otimizar minha Lista de Compras&rdquo;.
          </p>

          <pre className="max-h-80 overflow-auto rounded-card bg-inset p-2 text-xs leading-relaxed text-foreground">
            {dados.listaLiga}
          </pre>

          <p className="text-xs text-muted">
            A lista fica guardada: ela sobrevive a uma varredura nova (que atualiza os preços em
            vez de apagar a triagem) e encolhe sozinha conforme você cadastra as cartas.
            {dados.precoMaisAntigo &&
              ` Preço mais antigo da lista: ${new Date(dados.precoMaisAntigo).toLocaleDateString("pt-BR")}.`}{" "}
            Os {brl(totalSelecionado)} são o menor preço de cada carta em qualquer condição —
            piso de conferência, não orçamento em NM.
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
          Esconder vagas sem nenhuma {ehSet ? "oferta" : "opção"}
        </label>
      )}

      {carregando && <p className="text-sm text-muted">Carregando…</p>}

      {!carregando && !varredura && (
        <EstadoVazio>
          {(dados?.selecionadas ?? 0) > 0
            ? "Sua lista de compras está acima, pronta para colar. Dispare uma busca quando quiser atualizar os preços."
            : "Nenhuma varredura ainda. Escolha os parâmetros acima e dispare a primeira busca."}
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
                {!ehSet && `${vaga.opcoes.length} opção(ões)`}
                {vaga.descartadas > 0 &&
                  `${ehSet ? "" : " · "}${vaga.descartadas} fora dos filtros`}
              </span>
            </header>

            {vaga.opcoes.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted">
                {ehSet
                  ? "Nenhuma oferta com estoque para esta carta dentro dos filtros."
                  : "Nenhuma carta com estoque dentro do teto."}
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
                      aria-label={`Selecionar ${opcao.nome} de ${opcao.edicaoNome}`}
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
                          title="Sem foto no nosso catálogo"
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
                      <Distintivo tom="aviso" title="Não existe no nosso catálogo: se comprar, o cadastro depois é manual">
                        fora do catálogo
                      </Distintivo>
                    )}
                    <strong className="ml-auto text-foreground">{brl(opcao.preco)}</strong>
                    <a
                      href={`${SITE}${opcao.caminho}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-xs text-accent hover:underline"
                    >
                      ver ofertas
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
