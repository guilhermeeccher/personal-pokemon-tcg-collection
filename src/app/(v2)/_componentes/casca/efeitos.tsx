"use client";

import { useTranslations } from "next-intl";
import { useEffect, useSyncExternalStore } from "react";

import type { EscolhaModo, ModoEfeitos } from "../movimento/preferencias-movimento";
import { Segmentado } from "../primitivos/segmentado";
import { CADEIA_APOS_REFRACAO, decidirRefracao, escalaDoDeslocamento, mapaDaLente } from "./refracao";

/*
 * O encaixe do modo leve na casca, e os dois efeitos da casca que ele corta
 * (brilho do vidro sob o ponteiro e refração).
 *
 * ## Quem decide e quem aplica
 *
 * A decisão de modo leve é do pacote 0b (`movimento/`: heurística de quadros,
 * interruptor manual que sempre vence, `localStorage`, movimento reduzido à
 * parte). A casca não decide nada: ela lê **um atributo só**,
 * `html[data-v2-efeitos="leve"]`, que o CSS (`v2.css`) e os efeitos abaixo
 * obedecem. A casca (`casca.tsx`) escreve o atributo com
 * `<AtributoEfeitos modo={useMovimento().modo} />`, e quem mostra o
 * interruptor alimenta o `InterruptorModoLeve` com o `useEscolhaModo()` de
 * lá. Um escritor só: outra tela que renderizasse `AtributoEfeitos` brigaria
 * com a casca pelo atributo. Sem o atributo, vale o modo completo.
 */

export type { ModoEfeitos };
/** O interruptor: `auto` deixa a heurística decidir. É o tipo do `movimento/`. */
export type EscolhaModoEfeitos = EscolhaModo;

export const ATRIBUTO_EFEITOS = "data-v2-efeitos";

/** Escreve o modo em vigor no `<html>`; ao desmontar, volta ao completo. */
export function AtributoEfeitos({ modo }: { modo: ModoEfeitos }) {
  useEffect(() => {
    const html = document.documentElement;
    if (modo === "leve") html.setAttribute(ATRIBUTO_EFEITOS, "leve");
    else html.removeAttribute(ATRIBUTO_EFEITOS);
    return () => html.removeAttribute(ATRIBUTO_EFEITOS);
  }, [modo]);
  return null;
}

function assinarAtributo(aviso: () => void): () => void {
  const observador = new MutationObserver(aviso);
  observador.observe(document.documentElement, { attributes: true, attributeFilter: [ATRIBUTO_EFEITOS] });
  return () => observador.disconnect();
}

/** O modo leve em vigor, reativo ao atributo. No servidor, completo. */
export function useModoLeve(): boolean {
  return useSyncExternalStore(
    assinarAtributo,
    () => document.documentElement.getAttribute(ATRIBUTO_EFEITOS) === "leve",
    () => false,
  );
}

/**
 * A interface do interruptor (decisão 7: automático por heurística, com um
 * interruptor que sempre vence). Só o desenho: a escolha e o modo efetivo
 * vêm de quem chama — na integração, do `useEscolhaModo()` do 0b.
 */
export function InterruptorModoLeve({
  escolha,
  efetivo,
  aoEscolher,
}: {
  escolha: EscolhaModoEfeitos;
  /** O modo em vigor agora, para dizer "Automático · leve agora". */
  efetivo: ModoEfeitos;
  aoEscolher: (escolha: EscolhaModoEfeitos) => void;
}) {
  const t = useTranslations("v2ModoEfeitos");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Segmentado
        rotulo={t("rotulo")}
        valor={escolha}
        aoMudar={aoEscolher}
        opcoes={[
          { valor: "auto", rotulo: t("auto") },
          { valor: "completo", rotulo: t("completo") },
          { valor: "leve", rotulo: t("leve") },
        ]}
      />
      <span style={{ fontSize: 12.5, color: "var(--v2-tinta-3)" }}>
        {escolha === "auto" ? t("autoAgora", { modo: t(efetivo) }) : t("manual")}
      </span>
    </div>
  );
}

/**
 * Brilho do vidro sob o ponteiro: escreve `--v2-mx`/`--v2-my` na superfície
 * `.v2-vidro` sob o mouse, uma vez por quadro. Só mouse — no toque não há
 * ponteiro pairando, e escrever estilo a cada arrasto custaria quadros à
 * rolagem. Desligado no modo leve (o CSS também esconde o brilho).
 */
export function useBrilhoVidro(modoLeve: boolean): void {
  useEffect(() => {
    if (modoLeve) return;
    let pedido: number | null = null;
    let ultimo: PointerEvent | null = null;
    function aplicar() {
      pedido = null;
      const e = ultimo;
      if (!e || !(e.target instanceof Element)) return;
      const vidro = e.target.closest<HTMLElement>(".v2-vidro");
      if (!vidro) return;
      const r = vidro.getBoundingClientRect();
      vidro.style.setProperty("--v2-mx", `${((e.clientX - r.left) / r.width) * 100}%`);
      vidro.style.setProperty("--v2-my", `${((e.clientY - r.top) / r.height) * 100}%`);
    }
    function aoMover(e: PointerEvent) {
      if (e.pointerType !== "mouse") return;
      ultimo = e;
      pedido ??= requestAnimationFrame(aplicar);
    }
    document.addEventListener("pointermove", aoMover, { passive: true });
    return () => {
      document.removeEventListener("pointermove", aoMover);
      if (pedido !== null) cancelAnimationFrame(pedido);
    };
  }, [modoLeve]);
}

type NavegadorComMarcas = Navigator & { userAgentData?: { brands?: readonly { brand: string }[] } };

/**
 * Refração nas superfícies marcadas com `data-v2-lente` (decisão 6): só no
 * Chromium, por HTTPS e no modo completo (`decidirRefracao`). Gera um filtro
 * SVG por superfície, do tamanho dela, dentro de `defs`, e escreve a cadeia
 * com `url()` no estilo do elemento — nunca no CSS, onde o Safari derrubaria
 * o desfoque junto. Fora dessas condições, apaga o que escreveu e o vidro
 * fica com o desfoque literal de `v2.css`.
 */
export function useRefracao(defs: React.RefObject<SVGDefsElement | null>, modoLeve: boolean): void {
  useEffect(() => {
    const raiz = defs.current;
    if (!raiz) return;
    const ligada = decidirRefracao({
      contextoSeguro: window.isSecureContext,
      marcas: (navigator as NavegadorComMarcas).userAgentData?.brands,
      modoLeve,
    });
    const superficies = Array.from(document.querySelectorAll<HTMLElement>("[data-v2-lente]"));
    if (!ligada) {
      for (const el of superficies) el.style.removeProperty("backdrop-filter");
      raiz.replaceChildren();
      return;
    }

    const tela = document.createElement("canvas");
    const contexto = tela.getContext("2d");
    if (!contexto) return;
    const tamanhos = new WeakMap<HTMLElement, string>();

    function aplicar(el: HTMLElement, indice: number) {
      const largura = el.offsetWidth;
      const altura = el.offsetHeight;
      if (!largura || !altura || !contexto || !raiz) return;
      const chave = `${largura}x${altura}`;
      if (tamanhos.get(el) === chave) return;
      tamanhos.set(el, chave);
      const raio = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 20, largura / 2, altura / 2);
      const mapa = mapaDaLente({ largura, altura, raio, borda: Math.min(28, Math.min(largura, altura) / 2.4) });
      tela.width = mapa.largura;
      tela.height = mapa.altura;
      const imagem = contexto.createImageData(mapa.largura, mapa.altura);
      imagem.data.set(mapa.pixels);
      contexto.putImageData(imagem, 0, 0);
      const id = `v2-lente-${indice}`;
      const ns = "http://www.w3.org/2000/svg";
      let filtro = raiz.querySelector<SVGFilterElement>(`#${id}`);
      if (!filtro) {
        filtro = document.createElementNS(ns, "filter");
        filtro.id = id;
        filtro.setAttribute("color-interpolation-filters", "sRGB");
        raiz.appendChild(filtro);
      }
      const feImage = document.createElementNS(ns, "feImage");
      feImage.setAttribute("href", tela.toDataURL());
      feImage.setAttribute("x", "0");
      feImage.setAttribute("y", "0");
      feImage.setAttribute("width", String(largura));
      feImage.setAttribute("height", String(altura));
      feImage.setAttribute("preserveAspectRatio", "none");
      feImage.setAttribute("result", "mapa");
      const deslocamento = document.createElementNS(ns, "feDisplacementMap");
      deslocamento.setAttribute("in", "SourceGraphic");
      deslocamento.setAttribute("in2", "mapa");
      deslocamento.setAttribute("scale", String(escalaDoDeslocamento(largura, altura)));
      deslocamento.setAttribute("xChannelSelector", "R");
      deslocamento.setAttribute("yChannelSelector", "G");
      filtro.replaceChildren(feImage, deslocamento);
      el.style.setProperty("backdrop-filter", `url(#${id}) ${CADEIA_APOS_REFRACAO}`);
    }

    superficies.forEach(aplicar);
    const observador = new ResizeObserver(() => superficies.forEach(aplicar));
    for (const el of superficies) observador.observe(el);
    return () => {
      observador.disconnect();
      for (const el of superficies) el.style.removeProperty("backdrop-filter");
      raiz.replaceChildren();
    };
  }, [defs, modoLeve]);
}
