"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { IDIOMAS, type Idioma } from "@/lib/dominio/enums";
import type { ParametroPokedex, TipoColecao } from "@/lib/dominio/parametro-colecao";
import { FAIXA_REGIAO, REGIOES, type Regiao, regiaoDoNumero } from "@/lib/dominio/escopo-pokedex";
import { Alerta } from "@/app/_componentes/alerta";
import { Botao, classesBotao } from "@/app/_componentes/botao";
import { Campo, classesEntrada } from "@/app/_componentes/campo";
import { CartaoVaga } from "@/app/_componentes/ds/cartao-vaga";
import { ChipVariante } from "@/app/_componentes/ds/chip-variante";
import { GradeEscopo, type OpcaoEscopo } from "@/app/_componentes/ds/grade-escopo";
import { Distintivo } from "@/app/_componentes/distintivo";
import { EstadoVazio } from "@/app/_componentes/estado-vazio";
import { ImagemCartaComZoom } from "@/app/_componentes/imagem-carta-zoom";
import { ImagemVagaVazia } from "@/app/_componentes/imagem-vaga-vazia";
import { Modal } from "@/app/_componentes/modal";
import type {
  CandidataMelhoriaDTO,
  CandidatoVagaDTO,
  ColecaoComVagasDTO,
  CopiaAlocadaNaVagaDTO,
  CopiaDoInventarioDTO,
  MelhoriaDaVagaDTO,
  VagaDaColecaoDTO,
} from "@/lib/dominio/tipos-cliente";
import { textoDaRecusa } from "@/app/_componentes/recusa";

/* Nome de região é nome próprio do universo Pokémon — não traduz, e por
   isso fica aqui e não no catálogo de mensagens. */
const NOME_REGIAO: Record<Regiao, string> = {
  kanto: "Kanto",
  johto: "Johto",
  hoenn: "Hoenn",
  sinnoh: "Sinnoh",
  unova: "Unova",
  kalos: "Kalos",
  alola: "Alola",
  galar: "Galar",
  paldea: "Paldea",
};

/* As regiões no formato que a GradeEscopo desenha — nome e faixa em
   campos separados, para a faixa sair na face mono. */
const OPCOES_REGIAO = REGIOES.map((regiao) => ({
  id: regiao,
  rotulo: NOME_REGIAO[regiao],
  faixa: `${FAIXA_REGIAO[regiao].inicio}–${FAIXA_REGIAO[regiao].fim}`,
}));

export default function ColecaoPage() {
  const t = useTranslations("colecaoDetalhe");
  const tr = useTranslations("recusas");
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();

  const [colecao, setColecao] = useState<ColecaoComVagasDTO | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [naoEncontrada, setNaoEncontrada] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const [somenteVazias, setSomenteVazias] = useState(false);
  const [melhorias, setMelhorias] = useState<MelhoriaDaVagaDTO[]>([]);
  const [somenteMelhorias, setSomenteMelhorias] = useState(false);
  const [vagaParaMelhorar, setVagaParaMelhorar] = useState<MelhoriaDaVagaDTO | null>(null);
  const [editando, setEditando] = useState(false);
  const [vagaParaAlocar, setVagaParaAlocar] = useState<VagaDaColecaoDTO | null>(null);
  const [regiaoFiltro, setRegiaoFiltro] = useState<Regiao | "todas">("todas");

  const carregar = useCallback(() => {
    fetch(`/api/colecoes/${id}`)
      .then(async (r) => {
        if (r.status === 404) {
          setNaoEncontrada(true);
          return null;
        }
        return (await r.json()) as ColecaoComVagasDTO;
      })
      .then((d) => {
        if (d) setColecao(d);
      })
      .catch(() => setErro(t("erroCarregar")))
      .finally(() => setCarregando(false));
  }, [id, t]);

  /* Rota separada da coleção de propósito: a grade tem que aparecer sem
     esperar o cálculo das melhorias, e uma troca não precisa recarregar as
     1025 vagas para atualizar um distintivo. */
  const carregarMelhorias = useCallback(() => {
    fetch(`/api/colecoes/${id}/melhorias`)
      .then(async (r) => (r.ok ? ((await r.json()) as { itens?: MelhoriaDaVagaDTO[] }) : null))
      .then((d) => setMelhorias(d?.itens ?? []))
      // Melhoria é sinal acessório: se falhar, a coleção continua
      // utilizável sem ela — some o distintivo, não a tela.
      .catch(() => setMelhorias([]));
  }, [id]);

  const recarregar = useCallback(() => {
    carregar();
    carregarMelhorias();
  }, [carregar, carregarMelhorias]);

  useEffect(() => {
    carregar();
    carregarMelhorias();
  }, [carregar, carregarMelhorias]);

  async function excluir() {
    if (!colecao) return;
    const confirmado = window.confirm(t("confirmarExcluir", { nome: colecao.nome }));
    if (!confirmado) return;
    const resp = await fetch(`/api/colecoes/${id}`, { method: "DELETE" });
    if (resp.ok) {
      router.push("/colecoes");
    } else {
      setErro(t("erroExcluir"));
    }
  }

  async function desalocar(vaga: VagaDaColecaoDTO) {
    const confirmado = window.confirm(
      t("confirmarDesalocar", {
        alvo: vaga.cartaNome ?? t("aVagaNumero", { chave: vaga.chave }),
      }),
    );
    if (!confirmado) return;
    const resp = await fetch(`/api/vagas/${vaga.id}/alocar`, { method: "DELETE" });
    if (resp.ok) {
      setMensagem(t("vagaDesalocada"));
      recarregar();
    } else {
      const dados = await resp.json().catch(() => null);
      setErro(textoDaRecusa(tr, dados, t("erroDesalocar")));
    }
  }

  if (naoEncontrada) {
    return (
      <main className="mx-auto flex max-w-6xl flex-col gap-3 p-4 sm:p-8">
        <p className="text-sm text-danger">{t("naoEncontrada")}</p>
        <Link href="/colecoes" className="text-sm text-accent hover:underline">
          {t("voltarParaColecoes")}
        </Link>
      </main>
    );
  }

  if (!colecao) {
    return (
      <main className="mx-auto max-w-6xl p-4 sm:p-8">
        <p className="text-sm text-muted">{t("carregando")}</p>
      </main>
    );
  }

  const customizada = colecao.tipo === "customizada";
  const parametroSet = colecao.parametro as { incluirSecretas?: boolean } | null;
  // GET /api/colecoes/:id não traz totalVagas/vagasPreenchidas (esses só
  // vêm pré-agregados em GET /api/colecoes, a lista) — deriva do próprio
  // array de vagas já carregado, sem round-trip extra.
  const totalVagas = colecao.vagas.length;
  const vagasPreenchidas = colecao.vagas.filter((v) => v.copiaId !== null).length;
  const pokedex = colecao.tipo === "pokedex";
  const melhoriaPorVaga = new Map(melhorias.map((m) => [m.vagaId, m]));
  const vagasExibidas = colecao.vagas.filter((v) => {
    if (!customizada && somenteVazias && v.copiaId !== null) return false;
    if (somenteMelhorias && !melhoriaPorVaga.has(v.id)) return false;
    if (pokedex && regiaoFiltro !== "todas" && regiaoDoNumero(Number(v.chave)) !== regiaoFiltro) {
      return false;
    }
    return true;
  });

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-8">
      <div>
        <Link href="/colecoes" className="text-sm text-accent hover:underline">
          {t("voltar")}
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">{colecao.nome}</h1>
            <Distintivo tom="neutro">
              {t.has(`tipo.${colecao.tipo}`) ? t(`tipo.${colecao.tipo}`) : colecao.tipo}
            </Distintivo>
          </div>
          <p className="text-sm text-muted">
            {customizada
              ? t("cartas", { total: vagasPreenchidas })
              : t("preenchidas", { preenchidas: vagasPreenchidas, total: totalVagas })}
            {colecao.idiomaExigido ? t("idiomaExigido", { idioma: colecao.idiomaExigido }) : ""}
          </p>
          {colecao.notas && <p className="mt-1 text-sm text-muted">{colecao.notas}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          {/* Pokédex e set: as duas têm vaga vazia que é carta a comprar
              (regra 6). Customizada não — a vaga dela nasce ao alocar. */}
          {(colecao.tipo === "pokedex" || colecao.tipo === "set") && (
            <Link
              href={`/colecoes/${colecao.id}/opcoes-compra`}
              className={classesBotao("primario", "sm")}
            >
              {t("verificarOpcoes")}
            </Link>
          )}
          {/* Download de arquivo (rota de API, não página) — <a> normal. */}
          <a href={`/api/colecoes/${colecao.id}/exportar`} className={classesBotao("secundario", "sm")}>
            {t("baixarCsv")}
          </a>
          <Botao type="button" variante="secundario" tamanho="sm" onClick={() => setEditando((v) => !v)}>
            {editando ? t("fecharEdicao") : t("editar")}
          </Botao>
          <Botao type="button" variante="perigo" tamanho="sm" onClick={excluir}>
            {t("excluir")}
          </Botao>
        </div>
      </div>

      {colecao.avisoCatalogoIncompleto && (
        <Alerta tom="aviso">
          {t("avisoCatalogoIncompleto", {
            materializadas: colecao.avisoCatalogoIncompleto.vagasMaterializadas,
            esperadas: colecao.avisoCatalogoIncompleto.vagasEsperadas,
            faltantes: colecao.avisoCatalogoIncompleto.vagasFaltantes,
          })}
        </Alerta>
      )}

      {colecao.avisoSemNumeracaoOficial && (
        <Alerta tom="aviso">
          {t("avisoSemNumeracaoOficial", { total: colecao.avisoSemNumeracaoOficial.qtdTotal })}
        </Alerta>
      )}

      {erro && <p className="text-sm text-danger">{erro}</p>}
      {mensagem && <p className="text-sm text-success-fg">{mensagem}</p>}

      {editando && (
        <EdicaoColecao
          colecao={colecao}
          onFechar={() => setEditando(false)}
          onSalvo={(msg) => {
            setEditando(false);
            setMensagem(msg);
            carregar();
          }}
          onErro={setErro}
        />
      )}

      {colecao.tipo === "set" && (
        <ToggleSecretas
          colecaoId={id}
          incluirSecretas={parametroSet?.incluirSecretas ?? false}
          onAlterado={(msg) => {
            setMensagem(msg);
            carregar();
          }}
          onErro={setErro}
        />
      )}

      {pokedex && (
        <EdicaoEscopoPokedex
          colecaoId={id}
          parametro={colecao.parametro as ParametroPokedex}
          onAlterado={(msg) => {
            setMensagem(msg);
            carregar();
          }}
          onErro={setErro}
        />
      )}

      {pokedex && colecao.progressoPorRegiao && colecao.progressoPorRegiao.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded border border-line p-3 text-sm">
          <span className="text-muted">{t("progressoPorRegiao")}</span>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {colecao.progressoPorRegiao.map((p) => (
              <span key={p.regiao}>
                {NOME_REGIAO[p.regiao]} {p.preenchidas}/{p.total}
              </span>
            ))}
          </div>
          {colecao.progressoPorRegiao.length > 1 && (
            <label className="ml-auto flex items-center gap-2">
              <span className="text-muted">{t("filtrar")}</span>
              <select
                value={regiaoFiltro}
                onChange={(e) => setRegiaoFiltro(e.target.value as Regiao | "todas")}
                className={`${classesEntrada} p-1`}
              >
                <option value="todas">{t("todasAsRegioes")}</option>
                {colecao.progressoPorRegiao.map((p) => (
                  <option key={p.regiao} value={p.regiao}>
                    {NOME_REGIAO[p.regiao]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {customizada && (
        <AdicionarCopiaCustomizada
          colecaoId={id}
          idiomaExigido={colecao.idiomaExigido}
          onAdicionado={(msg) => {
            setMensagem(msg);
            carregar();
          }}
          onErro={setErro}
        />
      )}

      {!customizada && (
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={somenteVazias}
              onChange={(e) => setSomenteVazias(e.target.checked)}
            />
            {t("filtroSoVazias", { total: totalVagas - vagasPreenchidas })}
          </label>
          {/* Só aparece quando há o que mostrar: um filtro que sempre
              resulta em zero é ruído permanente na tela. */}
          {melhorias.length > 0 && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={somenteMelhorias}
                onChange={(e) => setSomenteMelhorias(e.target.checked)}
              />
              {t("filtroSoMelhorias", { total: melhorias.length })}
            </label>
          )}
        </div>
      )}

      {carregando && <p className="text-sm text-muted">{t("atualizando")}</p>}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
        {vagasExibidas.map((v) => (
          <VagaCard
            key={v.id}
            vaga={v}
            tipo={colecao.tipo}
            melhoria={melhoriaPorVaga.get(v.id)}
            onAlocar={() => setVagaParaAlocar(v)}
            onDesalocar={() => desalocar(v)}
            onMelhorar={() => {
              const m = melhoriaPorVaga.get(v.id);
              if (m) setVagaParaMelhorar(m);
            }}
          />
        ))}
        {vagasExibidas.length === 0 && (
          <EstadoVazio className="col-span-full py-6">
            {customizada
              ? t("vazioCustomizada")
              : somenteVazias
                ? t("vazioSoVazias")
                : somenteMelhorias
                  ? t("vazioSoMelhorias")
                  : t("vazioSemVagas")}
          </EstadoVazio>
        )}
      </div>

      {vagaParaAlocar && (
        <ModalAlocarVaga
          vaga={vagaParaAlocar}
          onFechar={() => setVagaParaAlocar(null)}
          onAlocado={(msg) => {
            setVagaParaAlocar(null);
            setMensagem(msg);
            recarregar();
          }}
        />
      )}

      {vagaParaMelhorar && (
        <ModalMelhoriaVaga
          melhoria={vagaParaMelhorar}
          onFechar={() => {
            setVagaParaMelhorar(null);
            // Descarte só some da lista no próximo carregamento: dentro do
            // modal a candidata fica marcada, com "Restaurar" à mão.
            carregarMelhorias();
          }}
          onTrocado={(msg) => {
            setVagaParaMelhorar(null);
            setMensagem(msg);
            recarregar();
          }}
        />
      )}
    </main>
  );
}

function VagaCard({
  vaga,
  tipo,
  melhoria,
  onAlocar,
  onDesalocar,
  onMelhorar,
}: {
  vaga: VagaDaColecaoDTO;
  tipo: TipoColecao;
  /** Presente só quando existe cópia livre melhor que a alocada aqui. */
  melhoria?: MelhoriaDaVagaDTO;
  onAlocar: () => void;
  onDesalocar: () => void;
  onMelhorar: () => void;
}) {
  const t = useTranslations("colecaoDetalhe");
  const tc = useTranslations("comum");
  const preenchida = vaga.copiaId !== null;
  const nomeExibido = vaga.cartaNome ?? vaga.nomeEspecie;

  if (preenchida) {
    return (
      <CartaoVaga
        preenchida
        energia={vaga.energia ?? undefined}
        imagem={
          <ImagemCartaComZoom
            imagemUrl={vaga.imagemUrl}
            origem={vaga.imagemOrigem}
            alt={nomeExibido ?? vaga.chave}
            width={64}
            height={88}
            className="rounded-tcg"
          />
        }
        titulo={nomeExibido ?? `#${vaga.chave}`}
        meta={
          /* Cada pedaço é indivisível: a vaga tem 96px, e deixar o texto
             quebrar sozinho órfanava o "·" no começo da linha de baixo. */
          <span className="flex flex-wrap items-center justify-center gap-1">
            <span className="whitespace-nowrap">
              #{vaga.cartaLocalId ?? vaga.chave} · {vaga.idiomaFisico}
            </span>
            {/* Variante é nulável no DTO; sem ela a linha só não mostra o
                chip, como o código anterior já fazia. */}
            {vaga.variante && <ChipVariante variante={vaga.variante} tamanho="sm" />}
          </span>
        }
        /* O botão de melhoria fica onde o "Alocar" fica na vaga vazia — o
           mesmo canto, o mesmo formato "ação (N)". Ele pediu que
           sinalizasse "parecido com a alocação em si", e a vizinhança na
           grade é metade dessa semelhança.

           Regra 5 continua de pé: o clique ABRE a lista de candidatas com
           o motivo de cada uma; não troca nada sozinho. */
        acao={
          <div className="flex flex-col items-center gap-1">
            {melhoria && (
              <span title={tc("rotuloMelhoria", { total: melhoria.candidatas.length })}>
                <Botao type="button" variante="secundario" tamanho="xs" onClick={onMelhorar}>
                  {t("melhorar", { total: melhoria.candidatas.length })}
                </Botao>
              </span>
            )}
            <button
              type="button"
              onClick={onDesalocar}
              className="text-[11px] text-danger hover:underline"
            >
              {t("desalocar")}
            </button>
          </div>
        }
      />
    );
  }

  return (
    <CartaoVaga
      preenchida={false}
      energia={vaga.energia ?? undefined}
      imagem={
        <ImagemVagaVazia
          tipo={tipo}
          imagemUrl={vaga.imagemUrl}
          imagemOrigem={vaga.imagemOrigem}
          chave={vaga.chave}
          alt={nomeExibido ?? vaga.chave}
        />
      }
      titulo={
        <>
          #{vaga.chave}
          {nomeExibido ? ` — ${nomeExibido}` : ""}
        </>
      }
      /* Botão desabilitado continua VISÍVEL, cinza: vaga vazia é saída de
         primeira classe (regra 6), e sumir o botão faria a grade parecer
         quebrada.

         O `title` vai no SPAN, não no botão: `classesBotao` aplica
         `disabled:pointer-events-none`, então um botão desabilitado não
         recebe hover e a tooltip nunca apareceria — justamente no caso em
         que ela é necessária. Cinza sem explicação vira suspeita de bug. */
      acao={
        <span title={tc("rotuloAlocacao", { total: vaga.candidatosDisponiveis })}>
          <Botao
            type="button"
            variante="primario"
            tamanho="xs"
            onClick={onAlocar}
            disabled={vaga.candidatosDisponiveis === 0}
          >
            {vaga.candidatosDisponiveis === 0
              ? t("alocar")
              : t("alocarComTotal", { total: vaga.candidatosDisponiveis })}
          </Botao>
        </span>
      }
    />
  );
}

function EdicaoColecao({
  colecao,
  onFechar,
  onSalvo,
  onErro,
}: {
  colecao: ColecaoComVagasDTO;
  onFechar: () => void;
  onSalvo: (msg: string) => void;
  onErro: (msg: string) => void;
}) {
  const t = useTranslations("colecaoDetalhe");
  const tr = useTranslations("recusas");
  const [nome, setNome] = useState(colecao.nome);
  const [notas, setNotas] = useState(colecao.notas ?? "");
  const [idiomaExigido, setIdiomaExigido] = useState<Idioma | "">(colecao.idiomaExigido ?? "");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      const resp = await fetch(`/api/colecoes/${colecao.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          notas: notas || null,
          idiomaExigido: idiomaExigido || null,
        }),
      });
      const dados = await resp.json();
      if (!resp.ok) {
        onErro(textoDaRecusa(tr, dados, t("erroSalvar")));
        return;
      }
      onSalvo(t("colecaoAtualizada"));
    } catch {
      onErro(t("erroRedeSalvar"));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-3 rounded border border-line p-4 text-sm">
      <Campo rotulo={t("campoNome")}>
        <input value={nome} onChange={(e) => setNome(e.target.value)} className={classesEntrada} />
      </Campo>
      <Campo rotulo={t("campoIdiomaExigido")}>
        <select
          value={idiomaExigido}
          onChange={(e) => setIdiomaExigido(e.target.value as Idioma | "")}
          className={`w-40 ${classesEntrada}`}
        >
          <option value="">{t("qualquer")}</option>
          {IDIOMAS.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo={t("campoNotas")}>
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={classesEntrada} />
      </Campo>
      <div className="flex gap-2">
        <Botao type="submit" variante="primario" disabled={salvando}>
          {salvando ? t("salvando") : t("salvar")}
        </Botao>
        <Botao type="button" variante="secundario" onClick={onFechar}>
          {t("cancelar")}
        </Botao>
      </div>
    </form>
  );
}

function ToggleSecretas({
  colecaoId,
  incluirSecretas,
  onAlterado,
  onErro,
}: {
  colecaoId: string;
  incluirSecretas: boolean;
  onAlterado: (msg: string) => void;
  onErro: (msg: string) => void;
}) {
  const t = useTranslations("colecaoDetalhe");
  const tr = useTranslations("recusas");
  const [enviando, setEnviando] = useState(false);

  async function alternar(novoValor: boolean) {
    if (novoValor === incluirSecretas) return;
    if (!novoValor) {
      const confirmado = window.confirm(t("confirmarDesligarSecretas"));
      if (!confirmado) return;
    }
    setEnviando(true);
    try {
      const resp = await fetch(`/api/colecoes/${colecaoId}/secretas`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incluirSecretas: novoValor }),
      });
      const dados = await resp.json();
      if (!resp.ok) {
        onErro(textoDaRecusa(tr, dados, t("erroSecretas")));
        return;
      }
      onAlterado(novoValor ? t("secretasIncluidas") : t("secretasRemovidas"));
    } catch {
      onErro(t("erroRedeSecretas"));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={incluirSecretas}
        disabled={enviando}
        onChange={(e) => alternar(e.target.checked)}
      />
      {t("incluirSecretas")}
    </label>
  );
}

function EdicaoEscopoPokedex({
  colecaoId,
  parametro,
  onAlterado,
  onErro,
}: {
  colecaoId: string;
  parametro: ParametroPokedex;
  onAlterado: (msg: string) => void;
  onErro: (msg: string) => void;
}) {
  const t = useTranslations("colecaoDetalhe");
  const tr = useTranslations("recusas");
  const [enviando, setEnviando] = useState(false);
  const regioesAtuais: Regiao[] = parametro.escopo === "nacional" ? [...REGIOES] : parametro.regioes;

  async function alternar(regiao: Regiao, incluir: boolean) {
    if (!incluir) {
      const confirmado = window.confirm(
        t("confirmarRemoverRegiao", { regiao: NOME_REGIAO[regiao] }),
      );
      if (!confirmado) return;
    }
    const novasRegioes = incluir
      ? [...regioesAtuais, regiao]
      : regioesAtuais.filter((r) => r !== regiao);
    const novoParametro =
      novasRegioes.length === REGIOES.length
        ? { escopo: "nacional" as const }
        : { escopo: "regioes" as const, regioes: novasRegioes };

    setEnviando(true);
    try {
      const resp = await fetch(`/api/colecoes/${colecaoId}/escopo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(novoParametro),
      });
      const dados = await resp.json();
      if (!resp.ok) {
        onErro(textoDaRecusa(tr, dados, t("erroEscopo")));
        return;
      }
      const partes: string[] = [];
      if (dados.adicionadas > 0) partes.push(t("vagasAdicionadas", { total: dados.adicionadas }));
      if (dados.removidas > 0) partes.push(t("vagasRemovidas", { total: dados.removidas }));
      onAlterado(partes.length > 0 ? `${partes.join(", ")}.` : t("escopoInalterado"));
    } catch {
      onErro(t("erroRedeEscopo"));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <GradeEscopo
      legenda={t("legendaEscopo")}
      opcoes={OPCOES_REGIAO.map(
        (o): OpcaoEscopo => ({
          ...o,
          travada: enviando,
          motivoTravada: enviando ? t("alterandoEscopo") : undefined,
        }),
      )}
      selecionadas={regioesAtuais}
      onAlternar={(id) => {
        const regiao = id as Regiao;
        alternar(regiao, !regioesAtuais.includes(regiao));
      }}
    />
  );
}

function AdicionarCopiaCustomizada({
  colecaoId,
  idiomaExigido,
  onAdicionado,
  onErro,
}: {
  colecaoId: string;
  idiomaExigido: Idioma | null;
  onAdicionado: (msg: string) => void;
  onErro: (msg: string) => void;
}) {
  const t = useTranslations("colecaoDetalhe");
  const tr = useTranslations("recusas");
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<CopiaDoInventarioDTO[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [enviandoId, setEnviandoId] = useState<string | null>(null);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    setBuscando(true);
    try {
      const searchParams = new URLSearchParams({
        alocacao: "livre",
        tamanhoPagina: "20",
        pagina: "1",
      });
      if (q.trim()) searchParams.set("q", q.trim());
      const resp = await fetch(`/api/copias?${searchParams.toString()}`);
      const dados = await resp.json();
      setResultados(dados.itens ?? []);
    } catch {
      onErro(t("erroBuscarLivres"));
    } finally {
      setBuscando(false);
    }
  }

  async function adicionar(copia: CopiaDoInventarioDTO, permitirForaDePadrao: boolean) {
    setEnviandoId(copia.id);
    try {
      const resp = await fetch(`/api/colecoes/${colecaoId}/copias`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ copiaId: copia.id, permitirForaDePadrao }),
      });
      const dados = await resp.json();
      if (!resp.ok) {
        onErro(textoDaRecusa(tr, dados, t("erroAdicionar")));
        return;
      }
      const partes = [t("adicionadaAColecao", { carta: copia.cartaNome })];
      if (dados.dividida) {
        partes.push(t("loteDivididoColecao"));
      }
      onAdicionado(partes.join(" "));
      setResultados((r) => r?.filter((c) => c.id !== copia.id) ?? null);
    } catch {
      onErro(t("erroRedeAdicionar"));
    } finally {
      setEnviandoId(null);
      setConfirmandoId(null);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-line p-3">
      <form onSubmit={buscar} className="flex flex-wrap items-end gap-2 text-sm">
        <Campo rotulo={t("campoAdicionarLivre")}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("placeholderBusca")}
            className={`w-64 ${classesEntrada}`}
          />
        </Campo>
        <Botao type="submit" variante="secundario" disabled={buscando}>
          {buscando ? t("buscando") : t("buscar")}
        </Botao>
      </form>

      {resultados && (
        <ul className="flex flex-col divide-y divide-hairline text-sm">
          {resultados.map((c) => {
            const foraDePadrao = idiomaExigido !== null && c.idioma !== idiomaExigido;
            return (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <ImagemCartaComZoom
                  imagemUrl={c.imagemUrl}
                  origem={c.imagemOrigem}
                  alt={c.cartaNome}
                  width={32}
                  height={44}
                  className="rounded-sm"
                />
                <div className="flex-1">
                  <div>
                    {c.cartaNome} <span className="text-muted">#{c.cartaLocalId}</span>
                    {foraDePadrao && (
                      <Distintivo tom="aviso" className="ml-2">
                        {t("foraDePadrao", { idioma: c.idioma })}
                      </Distintivo>
                    )}
                  </div>
                  <div className="text-xs text-muted">
                    {c.setNome} · {c.idioma} · {c.variante} · {t("qtd", { total: c.quantidade })}
                  </div>
                </div>
                {confirmandoId === c.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-warning-fg">{t("confirmaForaDePadrao")}</span>
                    <Botao type="button" variante="secundario" tamanho="xs" onClick={() => adicionar(c, true)}>
                      {t("confirmar")}
                    </Botao>
                    <button type="button" onClick={() => setConfirmandoId(null)} className="text-xs text-muted">
                      {t("cancelar")}
                    </button>
                  </div>
                ) : (
                  <Botao
                    type="button"
                    variante="primario"
                    tamanho="xs"
                    disabled={enviandoId === c.id}
                    onClick={() => (foraDePadrao ? setConfirmandoId(c.id) : adicionar(c, false))}
                  >
                    {t("adicionar")}
                  </Botao>
                )}
              </li>
            );
          })}
          {resultados.length === 0 && (
            <EstadoVazio as="li" className="py-2">
              {t("nenhumaLivre")}
            </EstadoVazio>
          )}
        </ul>
      )}
    </div>
  );
}

function ModalAlocarVaga({
  vaga,
  onFechar,
  onAlocado,
}: {
  vaga: VagaDaColecaoDTO;
  onFechar: () => void;
  onAlocado: (msg: string) => void;
}) {
  const t = useTranslations("colecaoDetalhe");
  const tr = useTranslations("recusas");
  const [candidatos, setCandidatos] = useState<CandidatoVagaDTO[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [enviandoId, setEnviandoId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/vagas/${vaga.id}/candidatos`)
      .then((r) => r.json())
      .then((d) => setCandidatos(d.itens ?? []))
      .catch(() => setErro(t("erroCandidatos")))
      .finally(() => setCarregando(false));
  }, [vaga.id, t]);

  async function alocar(candidato: CandidatoVagaDTO, permitirForaDePadrao: boolean) {
    setEnviandoId(candidato.id);
    setErro(null);
    try {
      const resp = await fetch(`/api/vagas/${vaga.id}/alocar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ copiaId: candidato.id, permitirForaDePadrao }),
      });
      const dados = await resp.json();
      if (!resp.ok) {
        setErro(textoDaRecusa(tr, dados, t("erroAlocar")));
        return;
      }
      const partes = [t("alocadaNaVaga", { carta: candidato.cartaNome, vaga: vaga.chave })];
      if (dados.dividida) {
        partes.push(t("loteDivididoVaga"));
      }
      onAlocado(partes.join(" "));
    } catch {
      setErro(t("erroRedeAlocar"));
    } finally {
      setEnviandoId(null);
      setConfirmandoId(null);
    }
  }

  const nomeVaga = vaga.cartaNome ?? vaga.nomeEspecie;

  return (
    <Modal>
      <h2 className="font-medium text-foreground">
        {t("modalAlocarTitulo", { vaga: vaga.chave })}
        {nomeVaga ? ` — ${nomeVaga}` : ""}
      </h2>
      <p className="text-muted">{t("modalAlocarExplicacao")}</p>

      {carregando && <p className="text-muted">{t("carregandoCandidatos")}</p>}
      {erro && <p className="text-danger">{erro}</p>}

      <ul className="flex flex-col divide-y divide-hairline">
        {candidatos?.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-2">
            <ImagemCartaComZoom
              imagemUrl={c.imagemUrl}
              origem={c.imagemOrigem}
              alt={c.cartaNome}
              width={32}
              height={44}
              className="rounded-sm"
            />
            <div className="flex-1">
              <div>
                {c.cartaNome} <span className="text-muted">#{c.cartaLocalId}</span>
                {c.foraDePadrao && (
                  <Distintivo tom="aviso" className="ml-2">
                    {t("foraDePadrao", { idioma: c.idioma })}
                  </Distintivo>
                )}
              </div>
              <div className="text-xs text-muted">
                {c.setNome} · {c.idioma} · {c.variante} · {c.condicao} ·{" "}
                {t("qtd", { total: c.quantidade })}
              </div>
            </div>
            {confirmandoId === c.id ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-warning-fg">{t("confirmaForaDePadrao")}</span>
                <Botao type="button" variante="secundario" tamanho="xs" onClick={() => alocar(c, true)}>
                  {t("confirmar")}
                </Botao>
                <button type="button" onClick={() => setConfirmandoId(null)} className="text-xs text-muted">
                  {t("cancelar")}
                </button>
              </div>
            ) : (
              <Botao
                type="button"
                variante="primario"
                tamanho="xs"
                disabled={enviandoId === c.id}
                onClick={() => (c.foraDePadrao ? setConfirmandoId(c.id) : alocar(c, false))}
              >
                {t("alocar")}
              </Botao>
            )}
          </li>
        ))}
        {candidatos && candidatos.length === 0 && (
          <EstadoVazio as="li" className="py-4">
            {t("semCandidatos")}
          </EstadoVazio>
        )}
      </ul>

      <div className="flex justify-end pt-2">
        <Botao type="button" variante="secundario" onClick={onFechar}>
          {t("fechar")}
        </Botao>
      </div>
    </Modal>
  );
}

/**
 * Os dois valores que fizeram a candidata ganhar no eixo. Sem isto a
 * sugestão chega sem justificativa — e sugestão sem motivo vira ruído que
 * ele aprende a ignorar.
 *
 * Usa o texto de raridade CRU do catálogo (56 valores, dois idiomas), não
 * a classe visual: mapear "Ilustração Rara Especial" para "secreta" na
 * explicação esconderia justamente o dado que ele quer ver. `null` de
 * raridade sobe como `null` — quem monta a frase é que sabe como dizer
 * "sem raridade" no idioma da interface.
 *
 * Devolve valores, não frase pronta: o nome do eixo e a seta vivem no
 * catálogo de mensagens (`colecaoDetalhe.eixo.*`).
 */
function valoresDoEixo(
  eixo: CandidataMelhoriaDTO["eixo"],
  atual: CopiaAlocadaNaVagaDTO,
  candidata: CandidataMelhoriaDTO,
): { de: string | null; para: string | null } {
  if (eixo === "raridade") {
    return { de: atual.raridade, para: candidata.raridade };
  }
  if (eixo === "idioma") {
    return { de: atual.idioma, para: candidata.idioma };
  }
  return { de: atual.variante, para: candidata.variante };
}

/**
 * Lista as cópias livres que superam a que está na vaga, e oferece as
 * duas ações que ele pediu: **trocar** ou **descartar a sinalização**.
 *
 * A troca vai numa transação só no servidor (`POST /api/vagas/:id/trocar`)
 * — nunca desalocar aqui e alocar depois, que deixaria a vaga vazia se o
 * segundo passo falhasse.
 *
 * O descarte é do PAR (esta cópia, nesta vaga): a candidata fica marcada
 * na hora, com "Restaurar" ao lado enquanto o modal estiver aberto, e só
 * some da lista no próximo carregamento. Descartar sem volta imediata é
 * como um clique errado vira dado perdido.
 */
function ModalMelhoriaVaga({
  melhoria,
  onFechar,
  onTrocado,
}: {
  melhoria: MelhoriaDaVagaDTO;
  onFechar: () => void;
  onTrocado: (msg: string) => void;
}) {
  const t = useTranslations("colecaoDetalhe");
  const tr = useTranslations("recusas");
  const [erro, setErro] = useState<string | null>(null);
  const [enviandoId, setEnviandoId] = useState<string | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [descartadas, setDescartadas] = useState<string[]>([]);

  const { atual } = melhoria;

  async function trocar(candidata: CandidataMelhoriaDTO) {
    setEnviandoId(candidata.id);
    setErro(null);
    try {
      const resp = await fetch(`/api/vagas/${melhoria.vagaId}/trocar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ copiaId: candidata.id }),
      });
      const dados = await resp.json();
      if (!resp.ok) {
        setErro(textoDaRecusa(tr, dados, t("erroTrocar")));
        return;
      }
      const partes = [
        t("trocaFeita", {
          vaga: melhoria.chave,
          entrou: candidata.cartaNome,
          setEntrou: candidata.setNome,
          saiu: atual.cartaNome,
          setSaiu: atual.setNome,
        }),
      ];
      if (dados.dividida) {
        partes.push(t("loteDivididoVaga"));
      }
      onTrocado(partes.join(" "));
    } catch {
      setErro(t("erroRedeTrocar"));
    } finally {
      setEnviandoId(null);
      setConfirmandoId(null);
    }
  }

  async function alternarDescarte(candidata: CandidataMelhoriaDTO, descartar: boolean) {
    setErro(null);
    try {
      const resp = await fetch(`/api/vagas/${melhoria.vagaId}/melhorias/descartar`, {
        method: descartar ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ copiaId: candidata.id }),
      });
      if (!resp.ok) {
        const dados = await resp.json().catch(() => null);
        setErro(textoDaRecusa(tr, dados, t("erroDescartar")));
        return;
      }
      setDescartadas((atuais) =>
        descartar ? [...atuais, candidata.id] : atuais.filter((id) => id !== candidata.id),
      );
    } catch {
      setErro(t("erroRedeDescartar"));
    }
  }

  return (
    <Modal>
      <h2 className="font-medium text-foreground">
        {t("modalMelhoriaTitulo", { vaga: melhoria.chave })}
      </h2>
      <p className="text-muted">{t("modalMelhoriaExplicacao")}</p>

      <div className="flex items-center gap-3 rounded-slot border border-line p-2">
        <ImagemCartaComZoom
          imagemUrl={atual.imagemUrl}
          origem={atual.imagemOrigem}
          alt={atual.cartaNome}
          width={32}
          height={44}
          className="rounded-sm"
        />
        <div className="flex-1">
          <div>
            <span className="text-muted">{t("naVagaHoje")}</span> {atual.cartaNome}{" "}
            <span className="text-muted">#{atual.cartaLocalId}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1 text-xs text-muted">
            {atual.setNome} · {atual.raridade ?? t("semRaridade")} · {atual.idioma} ·{" "}
            {atual.condicao}
            <ChipVariante variante={atual.variante} tamanho="sm" />
          </div>
        </div>
      </div>

      {erro && <p className="text-danger">{erro}</p>}

      <ul className="flex flex-col divide-y divide-hairline">
        {melhoria.candidatas.map((c) => {
          const descartada = descartadas.includes(c.id);
          return (
            <li key={c.id} className={`flex items-center gap-3 py-2 ${descartada ? "opacity-50" : ""}`}>
              <ImagemCartaComZoom
                imagemUrl={c.imagemUrl}
                origem={c.imagemOrigem}
                alt={c.cartaNome}
                width={32}
                height={44}
                className="rounded-sm"
              />
              <div className="flex-1">
                <div>
                  {c.cartaNome} <span className="text-muted">#{c.cartaLocalId}</span>
                  <Distintivo tom="sucesso" className="ml-2">
                    {(() => {
                      const { de, para } = valoresDoEixo(c.eixo, atual, c);
                      return t(`eixo.${c.eixo}`, {
                        de: de ?? t("semRaridade"),
                        para: para ?? t("semRaridade"),
                      });
                    })()}
                  </Distintivo>
                </div>
                <div className="flex flex-wrap items-center gap-1 text-xs text-muted">
                  {c.setNome} · {c.raridade ?? t("semRaridade")} · {c.idioma} · {c.condicao} ·{" "}
                  {t("qtd", { total: c.quantidade })}
                  <ChipVariante variante={c.variante} tamanho="sm" />
                </div>
              </div>

              {descartada ? (
                <button
                  type="button"
                  onClick={() => alternarDescarte(c, false)}
                  className="text-xs text-accent hover:underline"
                >
                  {t("restaurar")}
                </button>
              ) : confirmandoId === c.id ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-warning-fg">{t("confirmaTroca")}</span>
                  <Botao
                    type="button"
                    variante="primario"
                    tamanho="xs"
                    disabled={enviandoId === c.id}
                    onClick={() => trocar(c)}
                  >
                    {t("trocar")}
                  </Botao>
                  <button
                    type="button"
                    onClick={() => setConfirmandoId(null)}
                    className="text-xs text-muted"
                  >
                    {t("cancelar")}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Botao
                    type="button"
                    variante="primario"
                    tamanho="xs"
                    disabled={enviandoId !== null}
                    onClick={() => setConfirmandoId(c.id)}
                  >
                    {t("trocar")}
                  </Botao>
                  <button
                    type="button"
                    onClick={() => alternarDescarte(c, true)}
                    className="text-xs text-muted hover:underline"
                    title={t("descartarTitulo")}
                  >
                    {t("descartar")}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex justify-end pt-2">
        <Botao type="button" variante="secundario" onClick={onFechar}>
          {t("fechar")}
        </Botao>
      </div>
    </Modal>
  );
}
