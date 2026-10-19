"use client";

/**
 * Cadastro por jogo — o "por set" das cartas aplicado à Living Dex: escolhe
 * o jogo, a tabela traz todas as vagas em ordem de nome, e cada linha recebe
 * a quantidade normal e a shiny. Um botão grava tudo; cada Pokémon vira um
 * registro, nascido no jogo e ainda nele.
 *
 * A tabela mostra só o que existe no jogo escolhido (`catalogoDoJogo`), com
 * a marca de troca e de evento; "Mostrar todas" abre o resto, para o
 * Pokémon que chegou de fora. Seções desligadas na Pokédex somem daqui, e
 * as cosméticas ficam na vista delas, como na grade.
 *
 * O HOME entra na lista como mais um "jogo", sempre, depois dos do usuário:
 * é o cadastro do que nasceu ou chegou pelo próprio HOME (presente, GTS,
 * Caixa Surpresa), gravado com origem e local `home`. Não tem catálogo —
 * o HOME dá qualquer coisa —, então mostra todas as vagas.
 *
 * Espécie que o save ainda não alcança (um troféu-checkpoint pendente, como
 * a Pokédex Nacional do FireRed) aparece com o nome do checkpoint. Só
 * marca, não recusa: um Pokémon pode ter chegado por troca.
 *
 * 1.391 linhas com dois campos cada: a linha é memorizada e só redesenha
 * quando a quantidade dela muda.
 *
 * ## No celular (abaixo de 768px)
 *
 * A mesma tabela vira uma lista de cartões, pela mesma marcação (`tr`/`td`
 * com `max-md:`; ver `tabela.tsx`): sprite, nome e número em cima, o "tenho"
 * embaixo e as duas quantidades uma sob a outra, cada uma numa linha inteira
 * com o rótulo visível à esquerda (lado a lado, a 320px, sobravam ~21px para
 * cada número).
 * "Cadastrar (N)" desce para uma barra fixa na base, na zona do polegar —
 * com 1.391 linhas, um botão no topo da página ficaria a uma rolagem inteira
 * de distância do que o usuário acabou de marcar.
 *
 * O stepper (`Quantidade`) só é montado no celular, e quem decide é o
 * componente de cima, uma vez, por `useEhMobile()`: cada `Quantidade` assina
 * a media query por conta própria, e 2.782 assinaturas no desktop seriam um
 * custo novo para um layout que não mudou. No desktop a linha devolve o
 * mesmo `<input>` de sempre.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { type ChangeEvent, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Alerta } from "@/app/_componentes/alerta";
import { Botao, classesBotao } from "@/app/_componentes/botao";
import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { classesEntrada } from "@/app/_componentes/campo";
import { Distintivo } from "@/app/_componentes/distintivo";
import { textosDasRecusas } from "@/app/_componentes/recusa";
import { Quantidade } from "@/app/_componentes/quantidade";
import {
  classesCabecalhoEmpilhado,
  classesCelulaCabecalho,
  classesCelulaEmpilhada,
  classesLinha,
  classesLinhaCabecalho,
  classesLinhaEmpilhada,
  classesTabelaEmpilhada,
  Tabela,
} from "@/app/_componentes/tabela";
import { useEhMobile } from "@/app/_componentes/use-eh-mobile";
import { catalogoDoJogo, type DisponibilidadeForma } from "@/lib/dominio/dex-disponibilidade";
import { filtrarFormasDex, type VistaDex } from "@/lib/dominio/dex-grade";
import { ORIGEM_HOME } from "@/lib/dominio/dex-jogos";
import { categoriaConta, type SecoesContadas } from "@/lib/dominio/dex-secoes";
import { MAX_QUANTIDADE_POR_LINHA } from "@/lib/dominio/dex-registro";
import { especiesTrancadas, type IdiomaTrofeu } from "@/lib/dominio/dex-trofeus";
import type { FormaDexDTO, JogoPossuidoDTO, TrofeuDexDTO } from "@/lib/dominio/tipos-cliente";

import { SpriteDex } from "../_componentes/sprite-dex";
import { useRotuloForma } from "../_componentes/use-rotulo-forma";

type Quantidades = Record<string, { normal: number; shiny: number }>;
type Trilha = "normal" | "shiny";

/* No celular a pílula chega a 44px de altura e largura (`min-h-11 min-w-11`),
   com mais respiro lateral; o intervalo de 8px entre elas vem do `gap-2` do
   grupo. De 768px para cima as classes `max-md:` não existem. */
const classesOpcao = (ativa: boolean) =>
  `rounded-pill border px-3 py-1 text-xs font-semibold [transition:var(--transition-control)] max-md:inline-flex max-md:min-h-11 max-md:min-w-11 max-md:items-center max-md:justify-center max-md:px-4 max-md:text-sm ${
    ativa ? "border-accent bg-accent text-accent-fg" : "border-line text-muted hover:bg-surface-hover"
  }`;

function lerQuantidade(texto: string): number {
  const n = Number.parseInt(texto, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, MAX_QUANTIDADE_POR_LINHA);
}

const LinhaForma = memo(function LinhaForma({
  forma,
  rotulo,
  disponibilidade,
  comCatalogo,
  trancadaPor,
  normal,
  shiny,
  tenhoNormal,
  tenhoShiny,
  ehMobile,
  aoMudar,
}: {
  forma: FormaDexDTO;
  /** Nome da forma na tela (macho/fêmea traduzidos), ou nulo. */
  rotulo: string | null;
  /** `undefined` com catálogo = fora do jogo. */
  disponibilidade: DisponibilidadeForma | undefined;
  comCatalogo: boolean;
  /** Títulos dos checkpoints que ainda trancam a espécie neste jogo. */
  trancadaPor: string | null;
  normal: number;
  shiny: number;
  tenhoNormal: number;
  tenhoShiny: number;
  /** Vem de cima (um `useEhMobile()` só): ver o cabeçalho do arquivo. */
  ehMobile: boolean;
  aoMudar: (formaId: string, trilha: Trilha, valor: number) => void;
}) {
  const t = useTranslations("dex");
  const marcada = normal + shiny > 0;
  const campo = (trilha: Trilha, valor: number) => {
    const nome = `${forma.especie} ${rotulo ?? ""} ${trilha}`;
    const props = {
      type: "number",
      inputMode: "numeric",
      min: 0,
      max: MAX_QUANTIDADE_POR_LINHA,
      "aria-label": nome,
      // `max-md:px-1`/`text-center`: o campo do stepper divide a linha com o
      // rótulo e dois botões de 44px; sem apertar o respiro lateral, em telas
      // de 320px ele ficaria estreito para dois dígitos.
      className: `${classesEntrada} w-16 text-right tabular-nums max-md:px-1 max-md:text-center`,
      value: valor || "",
      onChange: (e: ChangeEvent<HTMLInputElement>) => aoMudar(forma.id, trilha, lerQuantidade(e.target.value)),
    } as const;
    if (!ehMobile) return <input {...props} />;
    return (
      <Quantidade
        rotulo={nome.replace(/\s+/g, " ")}
        inputProps={props}
        onAjustar={(delta) => aoMudar(forma.id, trilha, Math.min(Math.max(valor + delta, 0), MAX_QUANTIDADE_POR_LINHA))}
      />
    );
  };
  /* Celular: a grade tem 4 colunas (sprite · nome · nome · número); o "tenho" e
     cada quantidade ocupam a linha inteira (`col-span-full`), uma sob a outra. */
  const rotuloCampo = "text-xs font-semibold text-muted md:hidden";
  const temAlgum = tenhoNormal > 0 || tenhoShiny > 0;
  return (
    <tr
      className={`${classesLinha} ${classesLinhaEmpilhada} max-md:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)_2.5rem] max-md:items-center ${marcada ? "bg-accent-soft" : ""}`}
    >
      <td className={`p-1 ${classesCelulaEmpilhada}`}>
        <SpriteDex sprite={forma.sprite} shiny={false} tamanho={40} />
      </td>
      <td
        className={`p-2 ${classesCelulaEmpilhada} max-md:col-span-2 max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-2 max-md:gap-y-1`}
      >
        <span className="font-semibold text-strong">{forma.especie}</span>
        {rotulo && <span className="ml-1 text-xs text-muted max-md:ml-0">{rotulo}</span>}
        {comCatalogo && !disponibilidade && (
          <Distintivo className="ml-2 max-md:ml-0">{t("cadastrar.foraDoJogo")}</Distintivo>
        )}
        {disponibilidade && disponibilidade.como !== "livre" && (
          <Distintivo tom="aviso" className="ml-2 max-md:ml-0">
            {t(`cadastrar.como.${disponibilidade.como}`)}
          </Distintivo>
        )}
        {trancadaPor && (
          /* O texto já diz o checkpoint; o `title` repetiria o mesmo, então não
             precisa de `Dica`. O nome do troféu é longo: quebra no celular. */
          <Distintivo className="ml-2 max-md:ml-0 max-md:whitespace-normal" title={trancadaPor}>
            {t("cadastrar.trancada", { checkpoint: trancadaPor })}
          </Distintivo>
        )}
        {disponibilidade && !disponibilidade.transferivel && (
          <Distintivo tom="perigo" className="ml-2 max-md:ml-0">
            {t("cadastrar.naoVaiAoHome")}
          </Distintivo>
        )}
      </td>
      <td className={`p-2 font-mono text-xs tabular-nums text-muted ${classesCelulaEmpilhada} max-md:text-right`}>
        {forma.numero}
      </td>
      {/* Sem nada que contar a célula fica vazia e `empty:hidden` a tira do
          cartão (senão sobraria um vão de 8px). O rótulo só entra quando há
          o que rotular, para não tirar o `:empty`. */}
      <td className={`p-2 text-xs tabular-nums ${classesCelulaEmpilhada} max-md:col-span-full max-md:empty:hidden`}>
        {temAlgum && <span className={`${rotuloCampo} mr-1.5`}>{t("cadastrar.colTenho")}</span>}
        {tenhoNormal > 0 && <span className="mr-1">{tenhoNormal}</span>}
        {tenhoShiny > 0 && <Distintivo tom="acento">★{tenhoShiny}</Distintivo>}
      </td>
      {/* Normal e shiny um sob o outro, cada um numa linha inteira com o rótulo
          à esquerda: lado a lado, a 320px, sobravam ~21px para cada número. */}
      <td className={`p-1 ${classesCelulaEmpilhada} max-md:col-span-full max-md:flex max-md:items-center max-md:gap-3`}>
        <span aria-hidden className={`${rotuloCampo} max-md:w-14 max-md:shrink-0`}>
          {t("cadastrar.colNormal")}
        </span>
        {campo("normal", normal)}
      </td>
      <td className={`p-1 ${classesCelulaEmpilhada} max-md:col-span-full max-md:flex max-md:items-center max-md:gap-3`}>
        <span aria-hidden className={`${rotuloCampo} max-md:w-14 max-md:shrink-0`}>
          {t("cadastrar.colShiny")}
        </span>
        {campo("shiny", shiny)}
      </td>
    </tr>
  );
});

export function CadastroPorJogo({
  formas,
  jogos,
  tenho,
  secoes,
  checkpoints,
  buscaInicial,
  jogoInicial,
}: {
  formas: FormaDexDTO[];
  jogos: JogoPossuidoDTO[];
  tenho: Quantidades;
  secoes: SecoesContadas;
  /** Troféus-checkpoint ainda não conquistados. */
  checkpoints: TrofeuDexDTO[];
  buscaInicial: string;
  jogoInicial: string;
}) {
  const t = useTranslations("dex");
  const tr = useTranslations("recusas");
  const router = useRouter();
  const rotulo = useRotuloForma(formas);
  const ehMobile = useEhMobile();
  const controlesRef = useRef<HTMLDivElement>(null);

  const idioma = useLocale() as IdiomaTrofeu;
  const opcoes = useMemo(
    () => [...jogos.map((j) => ({ id: j.jogoId, nome: j.nome })), { id: ORIGEM_HOME, nome: t("cadastrar.home") }],
    [jogos, t],
  );
  const [jogoId, setJogoId] = useState(
    opcoes.some((o) => o.id === jogoInicial) ? jogoInicial : opcoes[0].id,
  );
  const [filtro, setFiltro] = useState(buscaInicial);
  const [soQueNaoTenho, setSoQueNaoTenho] = useState(false);
  const [vista, setVista] = useState<VistaDex>("principal");
  const [mostrarTodas, setMostrarTodas] = useState(false);
  const [quantidades, setQuantidades] = useState<Quantidades>({});
  const [enviando, setEnviando] = useState(false);
  const [erros, setErros] = useState<string[]>([]);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const catalogo = useMemo(() => catalogoDoJogo(jogoId, formas), [jogoId, formas]);
  const trancadas = useMemo(() => {
    const titulo = new Map(checkpoints.map((c) => [c.id, c.textos[idioma]?.titulo ?? c.id]));
    const r = new Map<number, string>();
    for (const [n, ids] of especiesTrancadas(checkpoints, jogoId, new Set())) {
      r.set(n, ids.map((id) => titulo.get(id)).join(" + "));
    }
    return r;
  }, [checkpoints, jogoId, idioma]);

  const visiveis = useMemo(
    () =>
      filtrarFormasDex(formas, { vista, regiao: "todas", categoria: "todas", busca: filtro }).filter(
        (f) =>
          categoriaConta(f.categoria, secoes) &&
          (mostrarTodas || !catalogo || catalogo.has(f.id)) &&
          (!soQueNaoTenho || !tenho[f.id]),
      ),
    [formas, vista, filtro, secoes, mostrarTodas, catalogo, soQueNaoTenho, tenho],
  );

  const total = useMemo(
    () => Object.values(quantidades).reduce((soma, q) => soma + q.normal + q.shiny, 0),
    [quantidades],
  );

  const aoMudar = useCallback((formaId: string, trilha: Trilha, valor: number) => {
    setSucesso(null);
    setQuantidades((atual) => {
      const linha = { ...(atual[formaId] ?? { normal: 0, shiny: 0 }), [trilha]: valor };
      const proximo = { ...atual };
      if (linha.normal + linha.shiny === 0) delete proximo[formaId];
      else proximo[formaId] = linha;
      return proximo;
    });
  }, []);

  /* No celular o botão está na barra fixa da base e o resultado aparece no
     topo, fora da tela: sem isto o usuário toca em "Cadastrar" e não vê nada
     acontecer (a lista só zera as quantidades). Só leva o resultado à vista;
     não mexe em nenhum estado. Fora do celular a página nem rola o suficiente
     para isso importar, e o efeito não faz nada. */
  useEffect(() => {
    if (erros.length === 0 && !sucesso) return;
    // Pergunta à media query na hora, e não ao `ehMobile` do render: pôr o
    // valor nas dependências faria girar o aparelho com um aviso na tela
    // voltar a rolar a página para o topo.
    if (!window.matchMedia("(width < 48rem)").matches) return;
    controlesRef.current?.scrollIntoView({ block: "start" });
  }, [erros, sucesso]);

  async function cadastrar() {
    if (total === 0) return;
    setEnviando(true);
    setErros([]);
    setSucesso(null);
    try {
      const r = await fetch("/api/dex/registros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jogoId,
          itens: Object.entries(quantidades).map(([formaId, q]) => ({ formaId, ...q })),
        }),
      });
      if (!r.ok) {
        setErros(textosDasRecusas(tr, await r.json().catch(() => null), t("cadastrar.erro")));
        return;
      }
      const nomeJogo = opcoes.find((o) => o.id === jogoId)?.nome ?? jogoId;
      setSucesso(t("cadastrar.cadastrados", { quantidade: String(total), jogo: nomeJogo }));
      setQuantidades({});
      router.refresh();
    } catch {
      setErros([t("cadastrar.erro")]);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:p-8 md:h-full max-md:pb-[calc(6rem+env(safe-area-inset-bottom))]!">
      <CabecalhoPagina titulo={t("cadastrar.titulo")} />

      {/* Jogo, filtro e botão ficam parados; só a tabela rola (`rolagemPropria`). */}
      <div ref={controlesRef} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5 max-md:gap-2" role="group" aria-label={t("cadastrar.jogo")}>
          {opcoes.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={jogoId === o.id}
              onClick={() => setJogoId(o.id)}
              className={classesOpcao(jogoId === o.id)}
            >
              {o.nome}
            </button>
          ))}
          {jogos.length === 0 && (
            <Link href="/dex/jogos" className={classesBotao("secundario", "sm", "ml-2")}>
              {t("cadastrar.irParaJogos")}
            </Link>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 max-md:gap-2" role="group" aria-label={t("vista.rotulo")}>
          {(["principal", "cosmeticas"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={vista === v}
              onClick={() => setVista(v)}
              className={classesOpcao(vista === v)}
            >
              {t(`vista.${v}`)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            aria-label={t("cadastrar.filtrar")}
            className={`${classesEntrada} w-56 max-md:w-full`}
            value={filtro}
            placeholder={t("cadastrar.placeholderFiltrar")}
            onChange={(e) => setFiltro(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm max-md:min-h-11">
            <input type="checkbox" checked={soQueNaoTenho} onChange={(e) => setSoQueNaoTenho(e.target.checked)} />
            {t("cadastrar.soQueNaoTenho")}
          </label>
          {catalogo ? (
            <label className="flex items-center gap-2 text-sm max-md:min-h-11">
              <input type="checkbox" checked={mostrarTodas} onChange={(e) => setMostrarTodas(e.target.checked)} />
              {t("cadastrar.mostrarTodas")}
            </label>
          ) : (
            <span className="text-xs text-muted">
              {t(jogoId === ORIGEM_HOME ? "cadastrar.direto" : "cadastrar.semCatalogo")}
            </span>
          )}
          {/* Celular: a mesma div vira a barra fixa da base (zona do polegar),
              com a altura de 44 + 12 de cada lado e a área segura do iPhone.
              O `pb` da `main` reserva esse espaço para nada ficar escondido. */}
          <div className="ml-auto flex gap-2 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-30 max-md:ml-0 max-md:justify-end max-md:border-t max-md:border-line max-md:bg-surface max-md:px-4 max-md:pt-3 max-md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            {total > 0 && (
              <Botao tamanho="sm" onClick={() => setQuantidades({})} disabled={enviando}>
                {t("cadastrar.limpar")}
              </Botao>
            )}
            <Botao variante="primario" tamanho="sm" className="max-md:flex-1" onClick={cadastrar} disabled={enviando || total === 0}>
              {t("cadastrar.cadastrar", { quantidade: String(total) })}
            </Botao>
          </div>
        </div>
        {erros.length > 0 && (
          <Alerta tom="perigo">
            <ul>
              {erros.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Alerta>
        )}
        {sucesso && <Alerta tom="sucesso">{sucesso}</Alerta>}
      </div>

      <Tabela rolagemPropria className={classesTabelaEmpilhada}>
        <thead className={classesCabecalhoEmpilhado}>
          <tr className={classesLinhaCabecalho}>
            <th className={classesCelulaCabecalho} />
            <th className={classesCelulaCabecalho}>{t("cadastrar.colPokemon")}</th>
            <th className={classesCelulaCabecalho}>{t("cadastrar.colNumero")}</th>
            <th className={classesCelulaCabecalho}>{t("cadastrar.colTenho")}</th>
            <th className={classesCelulaCabecalho}>{t("cadastrar.colNormal")}</th>
            <th className={classesCelulaCabecalho}>{t("cadastrar.colShiny")}</th>
          </tr>
        </thead>
        <tbody className={classesTabelaEmpilhada}>
          {visiveis.map((f) => (
            <LinhaForma
              key={f.id}
              forma={f}
              rotulo={rotulo.forma(f)}
              disponibilidade={catalogo?.get(f.id)}
              comCatalogo={catalogo !== null}
              trancadaPor={trancadas.get(f.numero) ?? null}
              normal={quantidades[f.id]?.normal ?? 0}
              shiny={quantidades[f.id]?.shiny ?? 0}
              tenhoNormal={tenho[f.id]?.normal ?? 0}
              tenhoShiny={tenho[f.id]?.shiny ?? 0}
              ehMobile={ehMobile}
              aoMudar={aoMudar}
            />
          ))}
          {visiveis.length === 0 && (
            <tr className="max-md:block">
              <td colSpan={6} className="p-4 text-center text-sm text-muted max-md:block">
                {t("cadastrar.nada")}
              </td>
            </tr>
          )}
        </tbody>
      </Tabela>
    </main>
  );
}
