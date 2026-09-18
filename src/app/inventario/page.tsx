"use client";

import { useCallback, useEffect, useState } from "react";

import {
  CONDICOES,
  IDIOMAS,
  VARIANTES_COPIA,
  type Condicao,
  type Idioma,
  type VarianteCopia,
} from "@/lib/dominio/enums";
import { variantesDisponiveis } from "@/lib/dominio/variantes-catalogo";
import { AdicionarImagemLocal } from "@/app/_componentes/adicionar-imagem-local";
import { ehOrigemPropria } from "@/lib/dominio/origem-imagem";
import { Botao, classesBotao } from "@/app/_componentes/botao";
import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { Campo, classesEntrada } from "@/app/_componentes/campo";
import { ChipCondicao } from "@/app/_componentes/ds/chip-condicao";
import { ChipVariante } from "@/app/_componentes/ds/chip-variante";
import { Distintivo } from "@/app/_componentes/distintivo";
import { EstadoVazio } from "@/app/_componentes/estado-vazio";
import { ImagemCartaComZoom } from "@/app/_componentes/imagem-carta-zoom";
import { Modal } from "@/app/_componentes/modal";
import { Painel } from "@/app/_componentes/painel";
import { classesCelulaCabecalho, classesLinha, classesLinhaCabecalho, Tabela } from "@/app/_componentes/tabela";
import type { CopiaDoInventarioDTO, DestinoElegivelDaCopiaDTO } from "@/lib/dominio/tipos-cliente";
import { NomeCarta } from "@/app/_componentes/nome-carta";

interface Opcoes {
  sets: { setId: string; setNome: string }[];
  raridades: string[];
}

interface Filtros {
  set: string;
  idioma: string;
  raridade: string;
  variante: string;
  condicao: string;
  graded: string;
  localizacao: string;
  alocacao: string;
  semImagem: string;
  q: string;
}

const FILTROS_VAZIOS: Filtros = {
  set: "",
  idioma: "",
  raridade: "",
  variante: "",
  condicao: "",
  graded: "",
  localizacao: "",
  alocacao: "",
  semImagem: "",
  q: "",
};

const TAMANHO_PAGINA = 50;

function paraQueryString(filtros: Filtros, pagina: number): string {
  const params = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtros)) {
    if (valor) params.set(chave, valor);
  }
  params.set("pagina", String(pagina));
  params.set("tamanhoPagina", String(TAMANHO_PAGINA));
  return params.toString();
}

export default function InventarioPage() {
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const [pagina, setPagina] = useState(1);
  const [itens, setItens] = useState<CopiaDoInventarioDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [opcoes, setOpcoes] = useState<Opcoes>({ sets: [], raridades: [] });
  // Inicia `true`: a primeira carga é feita pelo efeito de montagem, sem
  // nenhum evento de usuário para disparar um `setCarregando(true)` síncrono
  // (ver comentário no efeito abaixo).
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [editando, setEditando] = useState<CopiaDoInventarioDTO | null>(null);
  const [alocando, setAlocando] = useState<CopiaDoInventarioDTO | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [editandoMassa, setEditandoMassa] = useState(false);

  // Nenhum setState síncrono no corpo desta função — só dentro de
  // then/catch/finally. É o que permite chamá-la a partir de um efeito
  // reagindo a `filtros`/`pagina` sem o eslint-plugin-react-hooks acusar
  // "setState síncrono em efeito": quem quer feedback imediato de
  // "carregando" (troca de filtro, paginação) seta isso no próprio
  // manipulador de evento, antes de mudar `filtros`/`pagina`.
  const carregar = useCallback(() => {
    fetch(`/api/copias?${paraQueryString(filtros, pagina)}`)
      .then((r) => r.json())
      .then((d) => {
        setItens(d.itens ?? []);
        setTotal(d.total ?? 0);
        if (d.opcoes) setOpcoes(d.opcoes);
        setErro(null);
      })
      .catch(() => setErro("Falha ao carregar o inventário."))
      .finally(() => setCarregando(false));
  }, [filtros, pagina]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Item 1 da visão geral: "clicar para ir ao inventário já filtrado por
  // aquele recorte" — a visão geral e a tela de repetidas linkam pra cá
  // com querystring (`/inventario?set=...`, `?alocacao=livre` etc.), as
  // MESMAS chaves de `Filtros`/`paraQueryString` acima. Lido uma vez, só
  // no cliente, depois da montagem (nunca no corpo do componente): ler
  // `window.location` durante a renderização divergiria entre o HTML do
  // servidor (sem `window`) e a primeira renderização do cliente. Se não
  // houver nenhum parâmetro reconhecido, não mexe em `filtros` — mantém o
  // comportamento de sempre para quem chega pela navegação normal.
  //
  // `setState` só dentro do `.then()` de uma promise resolvida — mesmo
  // motivo do comentário em `carregar` acima: setState síncrono no corpo
  // do efeito é acusado pelo eslint-plugin-react-hooks.
  useEffect(() => {
    Promise.resolve().then(() => {
      const params = new URLSearchParams(window.location.search);
      const chaves = Object.keys(FILTROS_VAZIOS) as (keyof Filtros)[];
      let mudou = false;
      const iniciais: Filtros = { ...FILTROS_VAZIOS };
      for (const chave of chaves) {
        const valor = params.get(chave);
        if (valor) {
          iniciais[chave] = valor;
          mudou = true;
        }
      }
      if (mudou) {
        setCarregando(true);
        setFiltros(iniciais);
        setPagina(1);
      }
    });
  }, []);

  function atualizarFiltro<K extends keyof Filtros>(campo: K, valor: string) {
    setCarregando(true);
    setPagina(1);
    setSelecionados(new Set());
    setFiltros((f) => ({ ...f, [campo]: valor }));
  }

  function irParaPagina(nova: number) {
    setCarregando(true);
    setSelecionados(new Set());
    setPagina(nova);
  }

  function limparFiltros() {
    setCarregando(true);
    setSelecionados(new Set());
    setFiltros(FILTROS_VAZIOS);
    setPagina(1);
  }

  function alternarSelecao(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function alternarSelecaoTodos() {
    setSelecionados((atual) =>
      atual.size === itens.length ? new Set() : new Set(itens.map((i) => i.id)),
    );
  }

  async function remover(copia: CopiaDoInventarioDTO) {
    const confirmado = window.confirm(
      `Remover a cópia de ${copia.cartaNome} (${copia.setNome} #${copia.cartaLocalId})?` +
        (copia.alocada ? " Ela está alocada a uma vaga, que ficará livre." : ""),
    );
    if (!confirmado) return;
    const resp = await fetch(`/api/copias/${copia.id}`, { method: "DELETE" });
    if (resp.ok) {
      setCarregando(true);
      carregar();
    } else {
      setErro("Falha ao remover.");
    }
  }

  async function desalocar(copia: CopiaDoInventarioDTO) {
    if (!copia.vagaId) return;
    const confirmado = window.confirm(
      `Desalocar ${copia.cartaNome} de ${copia.colecaoNome} (vaga #${copia.vagaChave})? A cópia volta a ficar livre no inventário.`,
    );
    if (!confirmado) return;
    const resp = await fetch(`/api/vagas/${copia.vagaId}/alocar`, { method: "DELETE" });
    if (resp.ok) {
      setCarregando(true);
      carregar();
    } else {
      setErro("Falha ao desalocar.");
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-8 md:h-full">
      <CabecalhoPagina
        titulo="Inventário"
        descricao={`${total} cópia(s) no total.`}
        acoes={
          // Download de arquivo (rota de API, não página) — <a> normal é o
          // padrão correto aqui, não navegação client-side do Next.
          <span className="flex gap-2">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/api/copias/exportar" className={classesBotao("secundario")}>
              Baixar CSV
            </a>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/api/copias/exportar-liga"
              className={classesBotao("secundario")}
              title="ZIP com o inventário no formato de importação da LigaPokemon, fatiado em arquivos de até 995 cartas."
            >
              Exportar p/ LigaPokemon
            </a>
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <input
          value={filtros.q}
          onChange={(e) => atualizarFiltro("q", e.target.value)}
          placeholder="Buscar por nome…"
          className={`col-span-2 ${classesEntrada}`}
        />
        <select
          value={filtros.set}
          onChange={(e) => atualizarFiltro("set", e.target.value)}
          className={classesEntrada}
        >
          <option value="">Set (todos)</option>
          {opcoes.sets.map((s) => (
            <option key={s.setId} value={s.setId}>
              {s.setNome}
            </option>
          ))}
        </select>
        <select
          value={filtros.idioma}
          onChange={(e) => atualizarFiltro("idioma", e.target.value)}
          className={classesEntrada}
        >
          <option value="">Idioma (todos)</option>
          {IDIOMAS.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
        <select
          value={filtros.raridade}
          onChange={(e) => atualizarFiltro("raridade", e.target.value)}
          className={classesEntrada}
        >
          <option value="">Raridade (todas)</option>
          {opcoes.raridades.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          value={filtros.variante}
          onChange={(e) => atualizarFiltro("variante", e.target.value)}
          className={classesEntrada}
        >
          <option value="">Variante (todas)</option>
          {VARIANTES_COPIA.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={filtros.condicao}
          onChange={(e) => atualizarFiltro("condicao", e.target.value)}
          className={classesEntrada}
        >
          <option value="">Condição (todas)</option>
          {CONDICOES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={filtros.graded}
          onChange={(e) => atualizarFiltro("graded", e.target.value)}
          className={classesEntrada}
        >
          <option value="">Graded (todas)</option>
          <option value="true">Só graded</option>
          <option value="false">Só não-graded</option>
        </select>
        <select
          value={filtros.alocacao}
          onChange={(e) => atualizarFiltro("alocacao", e.target.value)}
          className={classesEntrada}
        >
          <option value="">Alocação (todas)</option>
          <option value="alocada">Só alocadas</option>
          <option value="livre">Só livres</option>
        </select>
        <select
          value={filtros.semImagem}
          onChange={(e) => atualizarFiltro("semImagem", e.target.value)}
          className={classesEntrada}
          title="Cartas sem imagem própria e sem imagem no catálogo. Algumas podem mostrar foto assim mesmo: quando as duas faltam, o sistema tenta o CDN da TCGdex, e só o navegador descobre se o arquivo existe."
        >
          <option value="">Imagem (todas)</option>
          <option value="true">Sem imagem no catálogo</option>
        </select>
        <input
          value={filtros.localizacao}
          onChange={(e) => atualizarFiltro("localizacao", e.target.value)}
          placeholder="Localização contém…"
          className={classesEntrada}
        />
        <Botao type="button" variante="secundario" onClick={limparFiltros}>
          Limpar filtros
        </Botao>
      </div>

      {erro && <p className="text-sm text-danger">{erro}</p>}
      {mensagem && <p className="text-sm text-success-fg">{mensagem}</p>}
      {carregando && <p className="text-sm text-muted">Carregando…</p>}

      {selecionados.size > 0 && (
        <Painel padding="sm" className="flex items-center justify-between">
          <span className="text-sm">{selecionados.size} cópia(s) selecionada(s).</span>
          <div className="flex gap-2">
            <Botao type="button" variante="primario" tamanho="sm" onClick={() => setEditandoMassa(true)}>
              Editar selecionadas
            </Botao>
            <Botao type="button" variante="secundario" tamanho="sm" onClick={() => setSelecionados(new Set())}>
              Limpar seleção
            </Botao>
          </div>
        </Painel>
      )}

      <Tabela rolagemPropria>
        <thead>
          <tr className={classesLinhaCabecalho}>
            <th className={classesCelulaCabecalho}>
              <input
                type="checkbox"
                checked={itens.length > 0 && selecionados.size === itens.length}
                onChange={alternarSelecaoTodos}
                aria-label="Selecionar todos nesta página"
              />
            </th>
            <th className={classesCelulaCabecalho}></th>
            <th className={classesCelulaCabecalho}>Carta</th>
            <th className={classesCelulaCabecalho}>Set</th>
            <th className={classesCelulaCabecalho}>Qtd.</th>
            <th className={classesCelulaCabecalho}>Variante</th>
            <th className={classesCelulaCabecalho}>Idioma</th>
            <th className={classesCelulaCabecalho}>Condição</th>
            <th className={classesCelulaCabecalho}>Graded</th>
            <th className={classesCelulaCabecalho}>Localização</th>
            <th className={classesCelulaCabecalho}>Vaga</th>
            <th className={classesCelulaCabecalho}></th>
          </tr>
        </thead>
        <tbody>
          {itens.map((c) => {
            return (
              <tr key={c.id} className={classesLinha}>
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={selecionados.has(c.id)}
                    onChange={() => alternarSelecao(c.id)}
                    aria-label={`Selecionar ${c.cartaNome}`}
                  />
                </td>
                <td className="p-2">
                  <ImagemCartaComZoom
                    imagemUrl={c.imagemUrl}
                    origem={c.imagemOrigem}
                    alt={c.cartaNome}
                    width={32}
                    height={44}
                    className="rounded-tcg"
                    // O catálogo pode "achar" que existe imagem no CDN
                    // (tem set_serie_id) e mesmo assim o arquivo não
                    // existir lá — só se sabe depois do 404 real do
                    // <img> (caso do mep-079). Por isso o controle de
                    // adicionar imagem entra como fallback do próprio
                    // componente, não como um `if (!imagemUrl)` aqui:
                    // ele aparece exatamente onde a imagem de fato não
                    // aparece, e não só quando o campo já vem nulo.
                    fallback={
                      <AdicionarImagemLocal
                        cartaId={c.cartaId}
                        idiomaCatalogo={c.idiomaCatalogo}
                        cartaNome={c.cartaNome}
                        setId={c.setId}
                        onEnviada={() => {
                          setCarregando(true);
                          carregar();
                        }}
                      />
                    }
                  />
                  {/* A imagem que ELE enviou pode ser trocada ou removida;
                      a do catálogo não é dele para mexer. */}
                  {ehOrigemPropria(c.imagemOrigem) && (
                    <AdicionarImagemLocal
                      cartaId={c.cartaId}
                      idiomaCatalogo={c.idiomaCatalogo}
                      cartaNome={c.cartaNome}
                      setId={c.setId}
                      jaTemImagemPropria
                      onEnviada={() => {
                        setCarregando(true);
                        carregar();
                      }}
                    />
                  )}
                </td>
                <td className="p-2">
                  <NomeCarta nome={c.cartaNome} nomeEspecie={c.nomeEspecie} />{" "}
                  <span className="text-muted">#{c.cartaLocalId}</span>
                </td>
                <td className="p-2 text-muted">{c.setNome}</td>
                <td className="p-2 font-mono tabular-nums">{c.quantidade}</td>
                <td className="p-2">
                  <ChipVariante variante={c.variante} tamanho="sm" />
                </td>
                <td className="p-2 font-mono text-xs">{c.idioma}</td>
                <td className="p-2">
                  <ChipCondicao condicao={c.condicao} />
                </td>
                <td className="p-2 font-mono text-xs">
                  {c.gradedEmpresa ? `${c.gradedEmpresa} ${c.gradedNota ?? ""}` : "—"}
                </td>
                <td className="p-2 text-muted">{c.localizacao ?? "—"}</td>
                <td className="p-2">
                  {c.alocada ? (
                    <Distintivo tom="acento">
                      {c.colecaoNome} #{c.vagaChave}
                    </Distintivo>
                  ) : (
                    <Distintivo tom="neutro">livre</Distintivo>
                  )}
                </td>
                <td className="p-2 whitespace-nowrap">
                  {c.alocada ? (
                    <button type="button" onClick={() => desalocar(c)} className="mr-2 text-warning-fg hover:underline">
                      Desalocar
                    </button>
                  ) : (
                    <button type="button" onClick={() => setAlocando(c)} className="mr-2 text-accent hover:underline">
                      Alocar
                    </button>
                  )}
                  <button type="button" onClick={() => setEditando(c)} className="mr-2 text-accent hover:underline">
                    Editar
                  </button>
                  <button type="button" onClick={() => remover(c)} className="text-danger hover:underline">
                    Remover
                  </button>
                </td>
              </tr>
            );
          })}
          {itens.length === 0 && !carregando && (
            <tr>
              <td colSpan={12} className="p-4">
                <EstadoVazio>Nenhuma cópia encontrada com esses filtros.</EstadoVazio>
              </td>
            </tr>
          )}
        </tbody>
      </Tabela>

      <div className="flex items-center justify-between text-sm">
        <Botao type="button" variante="secundario" disabled={pagina <= 1} onClick={() => irParaPagina(pagina - 1)}>
          Anterior
        </Botao>
        <span>
          Página {pagina} de {totalPaginas}
        </span>
        <Botao
          type="button"
          variante="secundario"
          disabled={pagina >= totalPaginas}
          onClick={() => irParaPagina(pagina + 1)}
        >
          Próxima
        </Botao>
      </div>

      {editando && (
        <ModalEdicao
          copia={editando}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            setCarregando(true);
            carregar();
          }}
        />
      )}

      {alocando && (
        <ModalAlocarDestino
          copia={alocando}
          onFechar={() => setAlocando(null)}
          onAlocado={(msg) => {
            setAlocando(null);
            setErro(null);
            setMensagem(msg);
            setCarregando(true);
            carregar();
          }}
        />
      )}

      {editandoMassa && (
        <ModalEdicaoMassa
          itens={itens.filter((i) => selecionados.has(i.id))}
          onFechar={() => setEditandoMassa(false)}
          onSalvo={(msg) => {
            setEditandoMassa(false);
            setSelecionados(new Set());
            setErro(null);
            setMensagem(msg);
            setCarregando(true);
            carregar();
          }}
        />
      )}
    </main>
  );
}

function ModalEdicao({
  copia,
  onFechar,
  onSalvo,
}: {
  copia: CopiaDoInventarioDTO;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  // Nunca oferece uma variante que a carta não tem no catálogo (mesma
  // regra do cadastro por set/busca).
  const opcoesVariante = variantesDisponiveis(copia);
  const [quantidade, setQuantidade] = useState(copia.quantidade);
  const [variante, setVariante] = useState<VarianteCopia>(copia.variante);
  const [idioma, setIdioma] = useState<Idioma>(copia.idioma);
  const [condicao, setCondicao] = useState<Condicao>(copia.condicao);
  const [localizacao, setLocalizacao] = useState(copia.localizacao ?? "");
  const [gradedEmpresa, setGradedEmpresa] = useState(copia.gradedEmpresa ?? "");
  const [gradedNota, setGradedNota] = useState(copia.gradedNota ?? "");
  const [gradedCertificado, setGradedCertificado] = useState(copia.gradedCertificado ?? "");
  const [aquisicaoData, setAquisicaoData] = useState(copia.aquisicaoData ?? "");
  const [aquisicaoOrigem, setAquisicaoOrigem] = useState(copia.aquisicaoOrigem ?? "");
  const [aquisicaoPreco, setAquisicaoPreco] = useState(copia.aquisicaoPreco ?? "");
  const [notas, setNotas] = useState(copia.notas ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const resp = await fetch(`/api/copias/${copia.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantidade,
          variante,
          idioma,
          condicao,
          localizacao,
          gradedEmpresa,
          gradedNota,
          gradedCertificado,
          aquisicaoData: aquisicaoData || null,
          aquisicaoOrigem,
          aquisicaoPreco: aquisicaoPreco === "" ? null : aquisicaoPreco,
          notas,
        }),
      });
      const dados = await resp.json();
      if (!resp.ok) {
        setErro(dados.erro ?? "Falha ao salvar.");
        return;
      }
      onSalvo();
    } catch {
      setErro("Falha de rede ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal as="form" onSubmit={salvar}>
      <h2 className="font-medium text-foreground">
        Editar {copia.cartaNome} — {copia.setNome} #{copia.cartaLocalId}
      </h2>

      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Quantidade">
          <input
            type="number"
            min={1}
            value={quantidade}
            onChange={(e) => setQuantidade(Number(e.target.value) || 1)}
            className={classesEntrada}
          />
        </Campo>
        <Campo rotulo="Variante">
          <select
            value={variante}
            onChange={(e) => setVariante(e.target.value as VarianteCopia)}
            className={classesEntrada}
          >
            {opcoesVariante.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Idioma (físico)">
          <select value={idioma} onChange={(e) => setIdioma(e.target.value as Idioma)} className={classesEntrada}>
            {IDIOMAS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Condição">
          <select value={condicao} onChange={(e) => setCondicao(e.target.value as Condicao)} className={classesEntrada}>
            {CONDICOES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      <Campo rotulo="Localização física">
        <input
          value={localizacao}
          onChange={(e) => setLocalizacao(e.target.value)}
          placeholder="ex.: Fichário 1, página 3"
          className={classesEntrada}
        />
      </Campo>

      <fieldset className="flex flex-col gap-2 rounded border border-line p-3">
        <legend className="px-1 text-muted">Graded</legend>
        <div className="grid grid-cols-3 gap-3">
          <input
            value={gradedEmpresa}
            onChange={(e) => setGradedEmpresa(e.target.value)}
            placeholder="Empresa (PSA…)"
            className={classesEntrada}
          />
          <input
            value={gradedNota}
            onChange={(e) => setGradedNota(e.target.value)}
            placeholder="Nota"
            className={classesEntrada}
          />
          <input
            value={gradedCertificado}
            onChange={(e) => setGradedCertificado(e.target.value)}
            placeholder="Certificado"
            className={classesEntrada}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2 rounded border border-line p-3">
        <legend className="px-1 text-muted">Aquisição</legend>
        <div className="grid grid-cols-3 gap-3">
          <input
            type="date"
            value={aquisicaoData}
            onChange={(e) => setAquisicaoData(e.target.value)}
            className={classesEntrada}
          />
          <input
            value={aquisicaoOrigem}
            onChange={(e) => setAquisicaoOrigem(e.target.value)}
            placeholder="Origem"
            className={classesEntrada}
          />
          <input
            type="number"
            step="0.01"
            min={0}
            value={aquisicaoPreco}
            onChange={(e) => setAquisicaoPreco(e.target.value)}
            placeholder="Preço pago (R$)"
            className={classesEntrada}
          />
        </div>
      </fieldset>

      <Campo rotulo="Notas">
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={classesEntrada} />
      </Campo>

      {erro && <p className="text-danger">{erro}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <Botao type="button" variante="secundario" onClick={onFechar}>
          Cancelar
        </Botao>
        <Botao type="submit" variante="primario" disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar"}
        </Botao>
      </div>
    </Modal>
  );
}

/**
 * Item 1 do incremento pós-Fase 3: "estou olhando esta carta no
 * inventário, em qual coleção ela cabe?" — fluxo inverso de
 * `ModalAlocarVaga` (tela da coleção). Consome `GET
 * /api/copias/:id/destinos` e aloca pelas MESMAS rotas já existentes:
 * `POST /api/vagas/:id/alocar` para destino com vaga (pokedex/set),
 * `POST /api/colecoes/:id/copias` para customizada — nenhuma regra de
 * alocação nova, só uma porta de entrada nova. A escolha é sempre do
 * usuário (regra 5): nunca aloca sozinho, mesmo com um único destino.
 */
function ModalAlocarDestino({
  copia,
  onFechar,
  onAlocado,
}: {
  copia: CopiaDoInventarioDTO;
  onFechar: () => void;
  onAlocado: (msg: string) => void;
}) {
  const [destinos, setDestinos] = useState<DestinoElegivelDaCopiaDTO[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmandoChave, setConfirmandoChave] = useState<string | null>(null);
  const [enviandoChave, setEnviandoChave] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/copias/${copia.id}/destinos`)
      .then((r) => r.json())
      .then((d) => setDestinos(d.itens ?? []))
      .catch(() => setErro("Falha ao carregar destinos elegíveis."))
      .finally(() => setCarregando(false));
  }, [copia.id]);

  // Chave de UI: uma vaga se identifica pelo vagaId, uma customizada pelo
  // colecaoId (não tem vaga ainda — ela nasce ao adicionar).
  function chaveDestino(d: DestinoElegivelDaCopiaDTO): string {
    return d.vagaId ?? d.colecaoId;
  }

  async function alocar(destino: DestinoElegivelDaCopiaDTO, permitirForaDePadrao: boolean) {
    const chave = chaveDestino(destino);
    setEnviandoChave(chave);
    setErro(null);
    try {
      const resp = await fetch(
        destino.vagaId ? `/api/vagas/${destino.vagaId}/alocar` : `/api/colecoes/${destino.colecaoId}/copias`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ copiaId: copia.id, permitirForaDePadrao }),
        },
      );
      const dados = await resp.json();
      if (!resp.ok) {
        setErro(dados.erro ?? "Falha ao alocar.");
        return;
      }
      const partes = [
        destino.vagaId
          ? `${copia.cartaNome} alocada em ${destino.colecaoNome} — vaga #${destino.chave}.`
          : `${copia.cartaNome} adicionada a ${destino.colecaoNome}.`,
      ];
      if (dados.dividida) {
        partes.push(
          "O lote foi dividido: 1 unidade foi para a coleção, o restante segue livre no inventário.",
        );
      }
      onAlocado(partes.join(" "));
    } catch {
      setErro("Falha de rede ao alocar.");
    } finally {
      setEnviandoChave(null);
      setConfirmandoChave(null);
    }
  }

  return (
    <Modal>
      <h2 className="font-medium text-foreground">
        Alocar {copia.cartaNome} <span className="text-muted">#{copia.cartaLocalId}</span>
      </h2>
      <p className="text-muted">O sistema sugere coleções/vagas elegíveis; a escolha é sempre sua.</p>

      {carregando && <p className="text-muted">Carregando destinos…</p>}
      {erro && <p className="text-danger">{erro}</p>}

      <ul className="flex flex-col divide-y divide-hairline">
        {destinos?.map((d) => {
          const chave = chaveDestino(d);
          return (
            <li key={chave} className="flex items-center gap-3 py-2">
              <div className="flex-1">
                <div>
                  {d.colecaoNome}
                  <Distintivo tom="neutro" className="ml-2">
                    {d.colecaoTipo}
                  </Distintivo>
                  {d.foraDePadrao && (
                    <Distintivo tom="aviso" className="ml-2">
                      fora de padrão ({copia.idioma})
                    </Distintivo>
                  )}
                </div>
                <div className="text-xs text-muted">
                  {d.vagaId ? `vaga #${d.chave}` : "coleção customizada — sem vaga fixa"}
                </div>
              </div>
              {confirmandoChave === chave ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-warning-fg">Confirma fora de padrão?</span>
                  <Botao type="button" variante="secundario" tamanho="xs" onClick={() => alocar(d, true)}>
                    Confirmar
                  </Botao>
                  <button type="button" onClick={() => setConfirmandoChave(null)} className="text-xs text-muted">
                    Cancelar
                  </button>
                </div>
              ) : (
                <Botao
                  type="button"
                  variante="primario"
                  tamanho="xs"
                  disabled={enviandoChave === chave}
                  onClick={() => (d.foraDePadrao ? setConfirmandoChave(chave) : alocar(d, false))}
                >
                  {d.vagaId ? "Alocar" : "Adicionar"}
                </Botao>
              )}
            </li>
          );
        })}
        {destinos && destinos.length === 0 && (
          <EstadoVazio as="li" className="py-4">
            Nenhuma coleção ou vaga elegível para esta cópia.
          </EstadoVazio>
        )}
      </ul>

      <div className="flex justify-end pt-2">
        <Botao type="button" variante="secundario" onClick={onFechar}>
          Fechar
        </Botao>
      </div>
    </Modal>
  );
}

/**
 * Item 2 do incremento pós-Fase 3: edição em massa. Só os 4 campos que
 * fazem sentido gravar iguais num lote — condição, localização, idioma
 * FÍSICO e variante (nunca quantidade, graded, aquisição, notas: são
 * por exemplar). Cada campo só entra no PATCH se o usuário marcar
 * "alterar" explicitamente — nunca sobrescreve um campo que ele não
 * tocou. Confirmação explícita mostrando quantas cópias serão afetadas
 * antes de enviar (nunca "selecionar tudo e aplicar" direto).
 *
 * Variante: a lista oferecida é a INTERSEÇÃO do que `variantesDisponiveis`
 * (mesma função do cadastro por set/busca) permite para CADA cópia
 * selecionada — evita já na interface propor uma variante que uma das
 * cartas não tem; o servidor valida de novo por carta (defesa em
 * profundidade, `lib/db/consultas.ts`). Se a interseção for vazia
 * (seleção com cartas sem nenhuma variante em comum), o campo variante
 * fica indisponível — a escolha honesta é não oferecer, não escolher
 * uma variante arbitrária pra sobrescrever cegamente.
 */
function ModalEdicaoMassa({
  itens,
  onFechar,
  onSalvo,
}: {
  itens: CopiaDoInventarioDTO[];
  onFechar: () => void;
  onSalvo: (msg: string) => void;
}) {
  const [alterarCondicao, setAlterarCondicao] = useState(false);
  const [condicao, setCondicao] = useState<Condicao>("NM");
  const [alterarLocalizacao, setAlterarLocalizacao] = useState(false);
  const [localizacao, setLocalizacao] = useState("");
  const [alterarIdioma, setAlterarIdioma] = useState(false);
  const [idioma, setIdioma] = useState<Idioma>("pt");
  const [alterarVariante, setAlterarVariante] = useState(false);
  const [variante, setVariante] = useState<VarianteCopia>("normal");
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const variantesComuns = itens.reduce<VarianteCopia[]>((acc, item, indice) => {
    const disponiveis = variantesDisponiveis(item);
    return indice === 0 ? disponiveis : acc.filter((v) => disponiveis.includes(v));
  }, []);

  const algumCampoMarcado = alterarCondicao || alterarLocalizacao || alterarIdioma || alterarVariante;

  async function aplicar() {
    setEnviando(true);
    setErro(null);
    try {
      const patch: Record<string, unknown> = {};
      if (alterarCondicao) patch.condicao = condicao;
      if (alterarLocalizacao) patch.localizacao = localizacao || null;
      if (alterarIdioma) patch.idioma = idioma;
      if (alterarVariante) patch.variante = variante;

      const resp = await fetch("/api/copias/massa", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ copiaIds: itens.map((i) => i.id), patch }),
      });
      const dados = await resp.json();
      if (!resp.ok) {
        setErro(dados.erro ?? "Falha ao aplicar a edição em massa.");
        setConfirmando(false);
        return;
      }
      onSalvo(`${dados.atualizadas} cópia(s) atualizada(s).`);
    } catch {
      setErro("Falha de rede ao aplicar a edição em massa.");
      setConfirmando(false);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal>
      <h2 className="font-medium text-foreground">Editar {itens.length} cópia(s) selecionada(s)</h2>
      <p className="text-muted">
        Marque só os campos que quer alterar. A alocação de nenhuma das cópias é tocada por esta edição.
      </p>

      <label className="flex items-center gap-2">
        <input type="checkbox" checked={alterarCondicao} onChange={(e) => setAlterarCondicao(e.target.checked)} />
        <span className="w-28 text-muted">Condição</span>
        <select
          value={condicao}
          disabled={!alterarCondicao}
          onChange={(e) => setCondicao(e.target.value as Condicao)}
          className={`flex-1 disabled:opacity-40 ${classesEntrada}`}
        >
          {CONDICOES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={alterarLocalizacao}
          onChange={(e) => setAlterarLocalizacao(e.target.checked)}
        />
        <span className="w-28 text-muted">Localização</span>
        <input
          value={localizacao}
          disabled={!alterarLocalizacao}
          onChange={(e) => setLocalizacao(e.target.value)}
          placeholder="ex.: Fichário 1, página 3"
          className={`flex-1 disabled:opacity-40 ${classesEntrada}`}
        />
      </label>

      <label className="flex items-center gap-2">
        <input type="checkbox" checked={alterarIdioma} onChange={(e) => setAlterarIdioma(e.target.checked)} />
        <span className="w-28 text-muted">Idioma (físico)</span>
        <select
          value={idioma}
          disabled={!alterarIdioma}
          onChange={(e) => setIdioma(e.target.value as Idioma)}
          className={`flex-1 disabled:opacity-40 ${classesEntrada}`}
        >
          {IDIOMAS.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={alterarVariante}
          disabled={variantesComuns.length === 0}
          onChange={(e) => setAlterarVariante(e.target.checked)}
        />
        <span className="w-28 text-muted">Variante</span>
        {variantesComuns.length > 0 ? (
          <select
            value={variante}
            disabled={!alterarVariante}
            onChange={(e) => setVariante(e.target.value as VarianteCopia)}
            className={`flex-1 disabled:opacity-40 ${classesEntrada}`}
          >
            {variantesComuns.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        ) : (
          <span className="flex-1 text-xs text-warning-fg">
            a seleção mistura cartas sem nenhuma variante em comum no catálogo — edite a variante cópia a
            cópia
          </span>
        )}
      </label>

      {erro && <p className="text-danger">{erro}</p>}

      <div className="flex items-center justify-end gap-2 pt-2">
        {confirmando ? (
          <>
            <span className="mr-auto text-warning-fg">Confirma alterar {itens.length} cópia(s)?</span>
            <Botao type="button" variante="secundario" onClick={() => setConfirmando(false)}>
              Voltar
            </Botao>
            <Botao type="button" variante="primario" disabled={enviando} onClick={aplicar}>
              {enviando ? "Aplicando…" : "Confirmar"}
            </Botao>
          </>
        ) : (
          <>
            <Botao type="button" variante="secundario" onClick={onFechar}>
              Cancelar
            </Botao>
            <Botao
              type="button"
              variante="primario"
              disabled={!algumCampoMarcado}
              onClick={() => setConfirmando(true)}
            >
              Aplicar a {itens.length} cópia(s)
            </Botao>
          </>
        )}
      </div>
    </Modal>
  );
}
