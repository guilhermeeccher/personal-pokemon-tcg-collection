"use client";

/**
 * `/dex/recebidos` na v2 (pacote 5b): a rodada que chegou ao HOME, separada
 * pela caixa onde cada Pokémon vai. A leitura é a da v1
 * (`(v1)/v1/dex/recebidos/recebidos-home.tsx`), com as mesmas funções de
 * domínio (`montarRecebidos`); só o desenho e o toque mudam.
 *
 * - **"A guardar" é estado gravado, não derivado** (`dex_registro.a_guardar`):
 *   a tela só lê o que `montarRecebidos` separa e só escreve por "Guardei"
 *   (`POST /api/dex/registros/guardar`). O sistema não sabe quando a pessoa
 *   arrumou o HOME, e nada aqui o adivinha.
 * - **Cada caixa mostra a grade 6 × 5** com as posições a guardar acesas e os
 *   vizinhos já guardados apagados, para achar o lugar de olho; embaixo, a
 *   lista "posição · nome" é o que o leitor de tela e o celular leem (a grade
 *   é só desenho, `aria-hidden`).
 * - **A cópia extra aparece à parte**, em "Sem lugar nas caixas": a vaga
 *   dela já tem um Pokémon guardado, ou outro desta rodada chegou antes, ou
 *   está fora das caixas (seção desligada, shiny de forma sem shiny).
 * - **"Guardei tudo" pergunta antes** (diálogo de confirmação): tira a rodada
 *   inteira da lista e não há como desfazer por aqui. Na v1 não perguntava;
 *   "Guardei" de uma caixa continua direto, que é o gesto do dia a dia.
 * - **Doze caixas por vez** ("Mostrar mais"): cada uma monta 30 posições e a
 *   lista; uma primeira carga do HOME inteiro chega a dezenas de caixas, e a
 *   tela mora no orçamento de nós da regra 13. "Guardei tudo" vale para a
 *   rodada inteira, à vista ou não.
 */

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { useNomeCaixa } from "@/app/_comum/dex/use-nome-caixa";
import { useRotuloForma } from "@/app/_comum/dex/use-rotulo-forma";
import { textoDaRecusa } from "@/app/_comum/recusa";
import { VAGAS_POR_CAIXA } from "@/lib/dominio/dex-caixas";
import { montarRecebidos } from "@/lib/dominio/dex-recebidos";
import type { SecoesContadas } from "@/lib/dominio/dex-secoes";
import type { FormaDexDTO, RegistroDexDTO } from "@/lib/dominio/tipos-cliente";

import { useAviso } from "../../../_componentes/primitivos/aviso-flutuante";
import { Botao, BotaoLink } from "../../../_componentes/primitivos/botao";
import { useConfirmacao } from "../../../_componentes/primitivos/dialogo-confirmacao";
import { AvisoEmLinha, Painel } from "../../../_componentes/primitivos/painel";
import { SpriteDex } from "../../_componentes/sprite-dex";

import { guardarRecebidos } from "./guardar-recebidos";
import estilos from "./recebidos.module.css";

/** Quantas caixas a tela monta por vez; o resto vem em "Mostrar mais". */
const CAIXAS_POR_VEZ = 12;
/** E quantas linhas de "sem lugar" (cada uma com um sprite). */
const SEM_LUGAR_POR_VEZ = 60;

export function RecebidosHome({
  formas,
  secoes,
  registros,
  caixasReservadas,
}: {
  formas: FormaDexDTO[];
  secoes: SecoesContadas;
  registros: RegistroDexDTO[];
  caixasReservadas: number;
}) {
  const t = useTranslations("v2DexRecebidos");
  const td = useTranslations("dex");
  const tr = useTranslations("recusas");
  const router = useRouter();
  const avisar = useAviso();
  const { confirmar, dialogo } = useConfirmacao();
  const rotulo = useRotuloForma(formas);
  const nomeCaixa = useNomeCaixa();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, iniciarLeitura] = useTransition();
  const [caixasVisiveis, setCaixasVisiveis] = useState(CAIXAS_POR_VEZ);
  const [semLugarVisiveis, setSemLugarVisiveis] = useState(SEM_LUGAR_POR_VEZ);
  const status = useRef<HTMLParagraphElement>(null);

  const formaPorId = useMemo(() => new Map(formas.map((f) => [f.id, f])), [formas]);
  const recebidos = useMemo(
    () => montarRecebidos(formas, registros, secoes, caixasReservadas),
    [formas, registros, secoes, caixasReservadas],
  );
  const total = recebidos.ids.length;
  const nomeDe = (formaId: string) => {
    const f = formaPorId.get(formaId);
    return f ? rotulo.nome(f) : formaId;
  };

  // A caixa que se guardou sai da lista, e com ela o botão que tinha o foco:
  // quando a leitura nova chega, o foco vai para a contagem, que diz o que
  // sobrou. Sem isso ele cairia no `body`.
  const lendoAntes = useRef(false);
  useEffect(() => {
    if (lendoAntes.current && !lendo) status.current?.focus({ preventScroll: true });
    lendoAntes.current = lendo;
  }, [lendo]);

  async function guardar(chave: string, ids: string[]) {
    setOcupado(chave);
    setErro(null);
    const r = await guardarRecebidos(ids, (url, init) => fetch(url, init));
    setOcupado(null);
    switch (r.tipo) {
      case "guardou":
        avisar(t("guardados", { quantidade: r.guardados }), { tom: "sucesso" });
        break;
      case "nadaMudou":
        // 200 sem nada a guardar: outra aba já tinha guardado. Lê de novo.
        avisar(t("nadaMudou"));
        break;
      case "recusa":
        setErro(textoDaRecusa(tr, r.corpo, td("recebidos.erro")));
        // Uma lista velha (registro apagado, 404) ou conflito: lê de novo, para o próximo clique partir do que o servidor tem.
        if (r.status === 404 || r.status === 409) iniciarLeitura(() => router.refresh());
        return;
      case "falhaDeRede":
        setErro(td("recebidos.erro"));
        return;
    }
    iniciarLeitura(() => router.refresh());
  }

  async function guardarTudo() {
    const ok = await confirmar({
      titulo: t("confirmarTitulo"),
      descricao: t("confirmarTexto", { quantidade: total }),
      rotuloConfirmar: td("recebidos.guardeiTudo"),
    });
    if (ok) await guardar("tudo", recebidos.ids);
  }

  const desligado = ocupado !== null || lendo;
  const caixas = recebidos.caixas.slice(0, caixasVisiveis);
  const semLugar = recebidos.semLugar.slice(0, semLugarVisiveis);

  return (
    <div className={estilos.pagina}>
      <header className={estilos.cabecalho}>
        <div>
          <p className={estilos.sobretitulo}>Living Dex</p>
          <h1 className={estilos.titulo}>{td("recebidos.titulo")}</h1>
          <p className={estilos.subtitulo}>{t("descricao")}</p>
        </div>
        <div className={estilos.acoes}>
          <BotaoLink href="/dex/caixas" pequeno>
            {t("caixas")}
          </BotaoLink>
          <BotaoLink href="/dex" pequeno>
            {t("visaoGeral")}
          </BotaoLink>
        </div>
      </header>

      <div className={estilos.barra}>
        <p ref={status} tabIndex={-1} role="status" className={estilos.contagem}>
          {td("recebidos.aGuardar", { quantidade: String(total) })}
        </p>
        {total > 0 && (
          <Botao
            variante="primario"
            pequeno
            carregando={ocupado === "tudo"}
            disabled={desligado}
            onClick={guardarTudo}
          >
            {td("recebidos.guardeiTudo")}
          </Botao>
        )}
      </div>
      {erro && (
        <AvisoEmLinha tom="perigo" papel="alert">
          {erro}
        </AvisoEmLinha>
      )}

      {total === 0 ? (
        <AvisoEmLinha>{td("recebidos.vazio")}</AvisoEmLinha>
      ) : (
        <>
          <ul className={estilos.legenda} aria-label={t("legenda")}>
            <li className={estilos.legendaItem}>
              <span aria-hidden className={estilos.amostra} data-tipo="guardar" />
              {t("aGuardarLegenda")}
            </li>
            <li className={estilos.legendaItem}>
              <span aria-hidden className={estilos.amostra} data-tipo="guardada" />
              {t("jaGuardadaLegenda")}
            </li>
          </ul>

          <div className={estilos.caixas}>
            {caixas.map(({ trilha, caixa, itens, jaGuardadas }) => {
              const shiny = trilha === "shiny";
              const naPosicao = new Map(itens.map((i) => [i.posicao, i]));
              const chave = `${trilha}-${caixa.numero}`;
              return (
                <Painel key={chave} as="section" className={estilos.caixa} aria-labelledby={`recebidos-${chave}`}>
                  <header className={estilos.cabecalhoCaixa}>
                    <h2 id={`recebidos-${chave}`} className={estilos.tituloCaixa}>
                      <span className="v2-num">{td("caixas.caixaN", { numero: String(caixa.numero) })}</span>
                      <span className={estilos.nomeCaixa}>{nomeCaixa.nome(caixa)}</span>
                    </h2>
                    {shiny && <span className={estilos.seloShiny}>{td("trilha.shiny")}</span>}
                    <span className={estilos.nota}>{td("recebidos.nestaCaixa", { quantidade: String(itens.length) })}</span>
                    <Botao
                      pequeno
                      className={estilos.guardei}
                      disabled={desligado}
                      carregando={ocupado === chave}
                      aria-label={t("guardeiCaixa", { quantidade: itens.length, numero: caixa.numero })}
                      onClick={() => guardar(chave, itens.map((i) => i.registro.id))}
                    >
                      {td("recebidos.guardei")}
                    </Botao>
                  </header>
                  {/* A grade é só desenho: a lista logo abaixo é o que se lê. */}
                  <ol className={estilos.posicoes} aria-hidden>
                    {caixa.lugares.map(({ forma: f, buraco }, i) => {
                      const item = naPosicao.get(i + 1);
                      if (buraco) return <li key={f.id} className={estilos.buraco} />;
                      if (item) {
                        return (
                          <li key={f.id} className={estilos.posicao} data-tipo="guardar">
                            <SpriteDex sprite={f.sprite} shiny={shiny} tamanho={56} className={estilos.sprite} />
                            <span className={`${estilos.numeroPosicao} v2-num`}>{i + 1}</span>
                          </li>
                        );
                      }
                      return (
                        <li key={f.id} className={estilos.posicao} data-tipo={jaGuardadas.has(f.id) ? "guardada" : undefined}>
                          {jaGuardadas.has(f.id) && (
                            <SpriteDex sprite={f.sprite} shiny={shiny} tamanho={56} className={estilos.sprite} apagado />
                          )}
                        </li>
                      );
                    })}
                    {Array.from({ length: VAGAS_POR_CAIXA - caixa.lugares.length }, (_, i) => (
                      <li key={`vazia-${i}`} className={estilos.vazia} />
                    ))}
                  </ol>
                  <ul className={estilos.lista} aria-label={t("listaCaixa", { numero: caixa.numero })}>
                    {itens.map(({ registro, posicao }) => (
                      <li key={registro.id}>
                        <span className={`${estilos.posicaoNumero} v2-num`}>{posicao}</span>
                        <span>{nomeDe(registro.formaId)}</span>
                      </li>
                    ))}
                  </ul>
                </Painel>
              );
            })}

            {recebidos.semLugar.length > 0 && (
              <Painel as="section" className={estilos.caixa} aria-labelledby="recebidos-sem-lugar">
                <header className={estilos.cabecalhoCaixa}>
                  <h2 id="recebidos-sem-lugar" className={estilos.tituloCaixa}>
                    {td("recebidos.semLugar")}
                  </h2>
                  <Botao
                    pequeno
                    className={estilos.guardei}
                    disabled={desligado}
                    carregando={ocupado === "sem-lugar"}
                    aria-label={t("guardeiSemLugar", { quantidade: recebidos.semLugar.length })}
                    onClick={() => guardar("sem-lugar", recebidos.semLugar.map((s) => s.registro.id))}
                  >
                    {td("recebidos.guardei")}
                  </Botao>
                </header>
                <ul className={estilos.semLugar}>
                  {semLugar.map(({ registro, motivo }) => {
                    const f = formaPorId.get(registro.formaId);
                    return (
                      <li key={registro.id}>
                        <span className={estilos.miniatura}>
                          {f && <SpriteDex sprite={f.sprite} shiny={registro.shiny} tamanho={40} className={estilos.sprite} />}
                        </span>
                        <span className={estilos.nomeSemLugar}>{nomeDe(registro.formaId)}</span>
                        {registro.shiny && <span className={estilos.seloShiny}>{td("trilha.shiny")}</span>}
                        <span className={estilos.motivo}>{td(`recebidos.motivo.${motivo}`)}</span>
                      </li>
                    );
                  })}
                </ul>
                {recebidos.semLugar.length > semLugarVisiveis && (
                  <Botao pequeno onClick={() => setSemLugarVisiveis((n) => n + SEM_LUGAR_POR_VEZ)}>
                    {t("mostrarMais", { restantes: recebidos.semLugar.length - semLugarVisiveis })}
                  </Botao>
                )}
              </Painel>
            )}
          </div>

          {recebidos.caixas.length > caixasVisiveis && (
            <Botao onClick={() => setCaixasVisiveis((n) => n + CAIXAS_POR_VEZ)}>
              {t("mostrarMais", { restantes: recebidos.caixas.length - caixasVisiveis })}
            </Botao>
          )}
        </>
      )}
      {dialogo}
    </div>
  );
}
