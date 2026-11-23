"use client";

import { Lightbulb } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { textoDaRecusa } from "@/app/_comum/recusa";
import { MAXIMO_SUGESTOES_VISIVEIS } from "@/lib/dominio/sugestoes-colecao";
import type { DispensarSugestaoDTO, ListaSugestoesDTO, SugestaoDeTemaDTO, SugestaoDTO } from "@/lib/dominio/tipos-cliente";

import { Botao, BotaoLink } from "../../_componentes/primitivos/botao";
import { useAviso } from "../../_componentes/primitivos/aviso-flutuante";
import { useConfirmacao } from "../../_componentes/primitivos/dialogo-confirmacao";
import { AvisoEmLinha, Painel } from "../../_componentes/primitivos/painel";
import estilos from "./organizar.module.css";
import { sugestoesNaTela, sugestoesRecolhidas } from "./organizar";
import { pedirApi } from "./pedir-api";

/** Preferência do aparelho (regra 19 de `rules.md`): prefixo `v2-`, nunca a chave da v1. */
const CHAVE_RECOLHIDA = "v2-colecoes-sugestoes-recolhida";
/** A mesma linha da casca: abaixo de 768 px é celular. */
const CONSULTA_CELULAR = "(max-width: 47.99rem)";

function lerGuardada(): string | null {
  try {
    return window.localStorage.getItem(CHAVE_RECOLHIDA);
  } catch {
    return null;
  }
}

function guardar(recolhida: boolean) {
  try {
    window.localStorage.setItem(CHAVE_RECOLHIDA, recolhida ? "1" : "0");
  } catch {
    // Navegador sem armazenamento: a escolha vale só nesta visita.
  }
}

const semAssinatura = () => () => {};

function assinarLargura(aviso: () => void) {
  const mq = window.matchMedia(CONSULTA_CELULAR);
  mq.addEventListener("change", aviso);
  return () => mq.removeEventListener("change", aviso);
}

/**
 * A seção "Sugestões" no alto de `/colecoes` (COL-16 a COL-20): sets e temas
 * que o usuário já está perto de colecionar, cada um com o motivo e um botão.
 * Regras de contagem, cobertura e ordem em `lib/dominio/sugestoes-colecao.ts`.
 *
 * - **Nada é criado sem o clique** (regra 5). "Criar coleção" de um set só
 *   abre `/colecoes/nova?set=<id>` preenchida; de um tema, abre a janela que
 *   confirma o nome (`aoCriarTema`).
 * - **A ordem é a do servidor** (rodadas entre tipos): a tela mostra as
 *   `MAXIMO_SUGESTOES_VISIVEIS` primeiras e "Ver todas" o resto, sem ordenar.
 * - **Recolhível, e lembrada no aparelho** (`localStorage`, em `try/catch`,
 *   lida depois da hidratação por `useSyncExternalStore`): sem escolha, começa
 *   recolhida no celular, para não empurrar as coleções para baixo.
 * - **"Não tenho interesse" é para sempre**, então pergunta pelo diálogo de
 *   confirmação (cancelar não envia nada). Num 2xx a sugestão sai da tela e a
 *   chave fica guardada (`dispensadas`): nenhuma leitura velha a traz de
 *   volta. Dê certo ou não, a lista é relida.
 * - Acessória: uma leitura que falha mostra o erro com "Tentar de novo" na
 *   própria seção; a lista de coleções não depende dela. Cada leitura aborta
 *   a anterior, e a resposta de uma leitura superada é descartada.
 */
export function SecaoSugestoes({
  versao,
  setsCriados,
  rotularTema,
  aoCriarTema,
}: {
  /** Muda quando a página criou ou mudou uma coleção: a seção relê. */
  versao: number;
  /** Sets que ganharam coleção nesta página (as ações em lote de um grupo): a sugestão sai já. */
  setsCriados: ReadonlySet<string>;
  rotularTema: (s: SugestaoDeTemaDTO) => string;
  aoCriarTema: (sugestao: SugestaoDeTemaDTO) => void;
}) {
  const t = useTranslations("v2Organizar.sugestoes");
  const tRecusas = useTranslations("recusas");
  const avisar = useAviso();
  const { confirmar, dialogo } = useConfirmacao();
  const [lidas, setLidas] = useState<SugestaoDTO[] | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pedido, setPedido] = useState(0);
  const [verTodas, setVerTodas] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [escolha, setEscolha] = useState<boolean | null>(null);
  const [dispensadas, setDispensadas] = useState<ReadonlySet<string>>(new Set());
  const guardada = useSyncExternalStore(semAssinatura, lerGuardada, () => null);
  const celular = useSyncExternalStore(
    assinarLargura,
    () => window.matchMedia(CONSULTA_CELULAR).matches,
    () => false,
  );

  // Os tradutores mudam de identidade a cada releitura da página: por ref, a
  // leitura não se repete por isso — só quando `versao` ou "Tentar de novo" pedem.
  const textos = useRef({ t, tRecusas });
  useEffect(() => {
    textos.current = { t, tRecusas };
  });

  useEffect(() => {
    const controle = new AbortController();
    pedirApi("/api/sugestoes", "GET", undefined, controle.signal)
      .then((r) => {
        if (controle.signal.aborted) return;
        const d = r.corpo as Partial<ListaSugestoesDTO> | null;
        if (!r.ok || !Array.isArray(d?.sugestoes)) {
          setErroLista(textoDaRecusa(textos.current.tRecusas, r.corpo, textos.current.t("erroCarregar")));
          return;
        }
        setLidas(d.sugestoes);
        setErroLista(null);
      })
      .catch(() => {});
    return () => controle.abort();
  }, [versao, pedido]);

  const reler = useCallback(() => setPedido((p) => p + 1), []);

  const sugestoes = useMemo(
    () => (lidas ? sugestoesNaTela(lidas, dispensadas, setsCriados) : []),
    [lidas, dispensadas, setsCriados],
  );

  async function dispensar(s: SugestaoDTO, rotulo: ReactNode) {
    if (ocupado) return;
    const ok = await confirmar({
      titulo: t("confirmarTitulo"),
      descricao: (
        <>
          {rotulo}
          <br />
          {t("confirmarTexto")}
        </>
      ),
      rotuloConfirmar: t("confirmarBotao"),
      perigoso: true,
    });
    if (!ok) return;
    setOcupado(true);
    setErro(null);
    const corpo: DispensarSugestaoDTO = { tipo: s.tipo, valor: s.valor };
    const r = await pedirApi("/api/sugestoes/dispensar", "POST", corpo);
    if (r.ok) {
      setDispensadas((atuais) => new Set([...atuais, s.chave]));
      avisar(t("dispensada"), { tom: "sucesso" });
    } else {
      setErro(r.status === null ? t("erroRede") : textoDaRecusa(tRecusas, r.corpo, t("erroDispensar")));
    }
    setOcupado(false);
    reler();
  }

  // Antes da primeira leitura, e sem nada a sugerir, a seção não aparece.
  if (lidas === null && erroLista === null) return dialogo;
  if (sugestoes.length === 0 && erroLista === null) return dialogo;

  const recolhida = sugestoesRecolhidas(escolha, guardada, celular);
  const visiveis = verTodas ? sugestoes : sugestoes.slice(0, MAXIMO_SUGESTOES_VISIVEIS);
  const escondidas = sugestoes.length - visiveis.length;

  function alternar() {
    const proxima = !recolhida;
    setEscolha(proxima);
    guardar(proxima);
  }

  const forte = (partes: ReactNode) => <strong>{partes}</strong>;
  function razao(s: SugestaoDTO): ReactNode {
    if (s.tipo === "set") {
      // `total` é a numeração oficial; num set sem ela (`totalOficial` falso) a frase não diz "oficiais".
      return t.rich(s.totalOficial ? "razao.set" : "razao.setSemOficial", {
        quantidade: s.quantidade,
        total: s.total,
        rotulo: s.rotulo,
        forte,
      });
    }
    return t.rich(`razao.${s.tipo}`, { quantidade: s.quantidade, rotulo: rotularTema(s), forte });
  }

  return (
    <section className={estilos.sugestoes} aria-labelledby="v2-sugestoes-titulo">
      <div className={estilos.sugestoesTopo}>
        <h2 id="v2-sugestoes-titulo" className={estilos.sugestoesTitulo}>
          <Lightbulb aria-hidden size={20} />
          {t("titulo")}
          {sugestoes.length > 0 && <span className={`${estilos.contagem} v2-num`}>{sugestoes.length}</span>}
        </h2>
        <Botao pequeno variante="fantasma" aria-expanded={!recolhida} aria-controls="v2-sugestoes-corpo" onClick={alternar}>
          {recolhida ? t("mostrar") : t("recolher")}
        </Botao>
      </div>

      {!recolhida && (
        <div id="v2-sugestoes-corpo" className={estilos.sugestoes}>
          <p className={estilos.mudo}>{t("descricao")}</p>
          {erroLista && (
            <AvisoEmLinha
              tom="perigo"
              papel="alert"
              acao={
                <Botao pequeno onClick={reler}>
                  {t("tentarDeNovo")}
                </Botao>
              }
            >
              {erroLista}
            </AvisoEmLinha>
          )}
          {erro && (
            <AvisoEmLinha tom="perigo" papel="alert">
              {erro}
            </AvisoEmLinha>
          )}
          <ul className={estilos.gradeSugestoes}>
            {visiveis.map((s) => {
              const texto = razao(s);
              return (
                <li key={s.chave}>
                  <Painel className={estilos.sugestao}>
                    <span className={estilos.sugestaoTipo}>{t(`tipos.${s.tipo}`)}</span>
                    <p className={estilos.sugestaoRazao}>{texto}</p>
                    <div className={estilos.barra}>
                      {s.tipo === "set" ? (
                        <BotaoLink href={`/colecoes/nova?set=${encodeURIComponent(s.setId)}`} variante="primario" pequeno>
                          {t("criarColecao")}
                        </BotaoLink>
                      ) : (
                        <Botao variante="primario" pequeno disabled={ocupado} onClick={() => aoCriarTema(s)}>
                          {t("criarTema")}
                        </Botao>
                      )}
                      <Botao pequeno variante="fantasma" disabled={ocupado} onClick={() => void dispensar(s, texto)}>
                        {t("semInteresse")}
                      </Botao>
                    </div>
                  </Painel>
                </li>
              );
            })}
          </ul>
          {sugestoes.length > MAXIMO_SUGESTOES_VISIVEIS && (
            <div>
              <Botao pequeno onClick={() => setVerTodas(!verTodas)} aria-expanded={verTodas}>
                {verTodas ? t("verMenos") : t("verTodas", { total: escondidas })}
              </Botao>
            </div>
          )}
        </div>
      )}
      {dialogo}
    </section>
  );
}
