"use client";

/**
 * A seção "Sugestões" no alto de `/colecoes` (decisão de 2026-11-22): sets e
 * temas que o usuário já está perto de colecionar, cada um com o MOTIVO ("Você
 * tem 12 de 100 cartas do set X") e um botão. Regras de contagem, cobertura e
 * ordem em `lib/dominio/sugestoes-colecao.ts`; aqui só a tela.
 *
 * - **Nada é criado nem alocado sem o clique** (regra 5). "Criar coleção" de
 *   um set só abre `/colecoes/nova` já preenchida; de um tema, abre a janela
 *   que confirma o nome (`onCriarTema`, a página cuida do resto).
 * - **A lista vem pronta e ordenada do servidor**: a tela mostra as
 *   `MAXIMO_SUGESTOES_VISIVEIS` primeiras e "Ver todas" abre o resto, sem
 *   ordenar de novo.
 * - **Não empurra a lista de coleções para baixo no celular**: cartões
 *   compactos numa coluna só e a seção recolhível. Sem preferência guardada,
 *   ela começa recolhida abaixo de 768px (`useEhMobile`) e aberta de lá para
 *   cima; recolher ou abrir guarda a escolha no navegador (só conveniência:
 *   sem armazenamento a tela funciona igual).
 * - **"Não tenho interesse" é para sempre e não tem desfazer na tela**, por
 *   isso pede uma confirmação ali mesmo no cartão. Num 2xx a sugestão sai da
 *   tela na hora e a chave fica guardada (`dispensadas`): qualquer leitura
 *   seguinte, mesmo uma lenta ou uma anterior à escrita, a filtra — uma
 *   releitura que falha não a traz de volta. Depois da escrita, relê a lista
 *   (dê certo ou não).
 * - Acessória: uma leitura que falha mostra o erro com "Tentar de novo" na
 *   própria seção; a lista de coleções abaixo não depende dela. Cada leitura
 *   leva um número de sequência, e a resposta de uma leitura superada é
 *   descartada.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Botao, classesBotao } from "@/app/_componentes/botao";
import { Distintivo } from "@/app/_componentes/distintivo";
import { textoDaRecusa } from "@/app/_componentes/recusa";
import { useEhMobile } from "@/app/_componentes/use-eh-mobile";
import { MAXIMO_SUGESTOES_VISIVEIS } from "@/lib/dominio/sugestoes-colecao";
import type {
  DispensarSugestaoDTO,
  ListaSugestoesDTO,
  SugestaoDeTemaDTO,
  SugestaoDTO,
} from "@/lib/dominio/tipos-cliente";

import { chamarApi } from "./chamar-api";
import { useRotuloTema } from "./rotulo-tema";

const CHAVE_RECOLHIDA = "colecoes-sugestoes-recolhida";

/** O que o navegador guardou: `"1"` recolhida, `"0"` aberta, `null` sem escolha (ou sem armazenamento). */
function lerPreferencia(): string | null {
  try {
    return window.localStorage.getItem(CHAVE_RECOLHIDA);
  } catch {
    return null;
  }
}

const semAssinatura = () => () => {};

function guardarPreferencia(recolhida: boolean) {
  try {
    window.localStorage.setItem(CHAVE_RECOLHIDA, recolhida ? "1" : "0");
  } catch {
    // Navegador sem armazenamento: a escolha vale só nesta visita.
  }
}

export function SecaoSugestoes({
  versao,
  setsCriados,
  onCriarTema,
}: {
  /** Muda quando a página criou ou mudou uma coleção: a seção relê. */
  versao: number;
  /**
   * Os sets que ganharam coleção nesta página (as ações em lote de um grupo):
   * a sugestão deles sai da tela já, sem esperar a releitura, e continua fora
   * dela mesmo que a releitura falhe — como a dispensada.
   */
  setsCriados: readonly string[];
  onCriarTema: (sugestao: SugestaoDeTemaDTO) => void;
}) {
  const t = useTranslations("colecoes.sugestoes");
  const tr = useTranslations("recusas");
  const { rotuloDoTema } = useRotuloTema();
  const mobile = useEhMobile();
  const [lidas, setLidas] = useState<SugestaoDTO[]>([]);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [verTodas, setVerTodas] = useState(false);
  // Lida do navegador sem divergir da renderização do servidor (que não a
  // tem): na hidratação vale `null`, e a leitura real vem logo depois. A
  // escolha feita nesta visita vence a guardada.
  const guardada = useSyncExternalStore(semAssinatura, lerPreferencia, () => null);
  const [escolhaDaVisita, setEscolhaDaVisita] = useState<boolean | null>(null);
  // Qual cartão está pedindo a confirmação de "Não tenho interesse".
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const sequencia = useRef(0);
  // As chaves dispensadas com sucesso nesta vida da página.
  const dispensadas = useRef<Set<string>>(new Set());

  // Em promessas encadeadas, não `async`: o `setState` fica no `then`.
  const carregar = useCallback(() => {
    const minha = ++sequencia.current;
    return fetch("/api/sugestoes")
      .then(async (r) => ({ ok: r.ok, corpo: (await r.json().catch(() => null)) as unknown }))
      .then(({ ok, corpo }) => {
        if (minha !== sequencia.current) return; // superada por uma leitura mais nova
        const d = (corpo ?? {}) as Partial<ListaSugestoesDTO>;
        if (!ok || !Array.isArray(d.sugestoes)) {
          setErroLista(textoDaRecusa(tr, corpo, t("erroCarregar")));
          return;
        }
        setLidas(d.sugestoes.filter((s) => !dispensadas.current.has(s.chave)));
        setErroLista(null);
      })
      .catch(() => {
        if (minha === sequencia.current) setErroLista(t("erroCarregar"));
      });
  }, [t, tr]);

  useEffect(() => {
    void carregar();
  }, [carregar, versao]);

  const sugestoes = useMemo(
    () => lidas.filter((s) => !(s.tipo === "set" && setsCriados.includes(s.setId))),
    [lidas, setsCriados],
  );

  async function dispensar(s: SugestaoDTO) {
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    try {
      const corpo: DispensarSugestaoDTO = { tipo: s.tipo, valor: s.valor };
      const r = await chamarApi("/api/sugestoes/dispensar", "POST", corpo);
      if (r.ok) {
        dispensadas.current.add(s.chave);
        setLidas((atuais) => atuais.filter((x) => x.chave !== s.chave));
      } else {
        setErro(textoDaRecusa(tr, r.corpo, t("erroDispensar")));
      }
    } catch {
      setErro(t("erroRede"));
    }
    setConfirmando(null);
    // Dê certo ou não, relê: a tela nunca fica com uma sugestão que o servidor não tem.
    await carregar();
    setOcupado(false);
  }

  if (sugestoes.length === 0 && !erroLista) return null;

  const recolhida = escolhaDaVisita ?? (guardada === null ? mobile : guardada === "1");
  const visiveis = verTodas ? sugestoes : sugestoes.slice(0, MAXIMO_SUGESTOES_VISIVEIS);
  const escondidas = sugestoes.length - visiveis.length;

  function alternarRecolhida() {
    const proxima = !recolhida;
    setEscolhaDaVisita(proxima);
    guardarPreferencia(proxima);
  }

  function razao(s: SugestaoDTO) {
    const forte = (partes: React.ReactNode) => <strong>{partes}</strong>;
    if (s.tipo === "set") {
      // `total` é a contagem oficial do set, e o "12 de 100" nunca passa de 100%;
      // num set sem numeração oficial é o total do catálogo (`totalOficial`
      // falso), e a frase não diz "oficiais".
      return t.rich(s.totalOficial ? "razao.set" : "razao.setSemOficial", { quantidade: s.quantidade, total: s.total, rotulo: s.rotulo, forte });
    }
    return t.rich(`razao.${s.tipo}`, { quantidade: s.quantidade, rotulo: rotuloDoTema(s.tipo, s.valor, s.rotulo), forte });
  }

  return (
    <section aria-labelledby="sugestoes-titulo" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 id="sugestoes-titulo" className="text-[length:var(--fs-title-2)] text-strong">
            {t("titulo")}
          </h2>
          {sugestoes.length > 0 && <Distintivo tom="neutro">{sugestoes.length}</Distintivo>}
        </div>
        <Botao tamanho="sm" aria-expanded={!recolhida} onClick={alternarRecolhida}>
          {recolhida ? t("mostrar") : t("recolher")}
        </Botao>
      </div>

      {!recolhida && (
        <>
          <p className="text-sm text-muted">{t("descricao")}</p>
          {erroLista && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-danger">
              <p>{erroLista}</p>
              <Botao tamanho="sm" onClick={() => void carregar()}>
                {t("tentarDeNovo")}
              </Botao>
            </div>
          )}
          {erro && <p className="text-sm text-danger">{erro}</p>}
          <ul className="grid gap-2 md:grid-cols-2">
            {visiveis.map((s) => (
              <li
                key={s.chave}
                className="flex flex-col justify-between gap-2 rounded-card border border-line bg-surface p-3"
              >
                <p className="text-sm break-words text-foreground">{razao(s)}</p>
                {confirmando === s.chave ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-warning-fg">{t("confirmarDispensa")}</p>
                    <div className="flex flex-wrap gap-2">
                      <Botao tamanho="sm" variante="perigo" disabled={ocupado} onClick={() => void dispensar(s)}>
                        {t("confirmarDispensaBotao")}
                      </Botao>
                      <Botao tamanho="sm" disabled={ocupado} onClick={() => setConfirmando(null)}>
                        {t("cancelar")}
                      </Botao>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {s.tipo === "set" ? (
                      <Link
                        href={`/v1/colecoes/nova?set=${encodeURIComponent(s.setId)}`}
                        className={classesBotao("primario", "sm")}
                      >
                        {t("criarColecao")}
                      </Link>
                    ) : (
                      <Botao
                        tamanho="sm"
                        variante="primario"
                        disabled={ocupado}
                        onClick={() => onCriarTema(s)}
                      >
                        {t("criarTema")}
                      </Botao>
                    )}
                    <Botao tamanho="sm" disabled={ocupado} onClick={() => setConfirmando(s.chave)}>
                      {t("semInteresse")}
                    </Botao>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {sugestoes.length > MAXIMO_SUGESTOES_VISIVEIS && (
            <div>
              <Botao tamanho="sm" onClick={() => setVerTodas(!verTodas)}>
                {verTodas ? t("verMenos") : t("verTodas", { total: escondidas })}
              </Botao>
            </div>
          )}
        </>
      )}
    </section>
  );
}
