/**
 * Refração do vidro: a borda da superfície desvia o que passa por baixo, como
 * uma lente. É um `backdrop-filter: url(#filtro-svg)` com um mapa de
 * deslocamento, e só o Blink (Chrome, Edge) o aplica.
 *
 * ## A decisão (decisão 6 de 2026-11-22: realce só no Chrome por HTTPS)
 *
 * Liga só quando TODOS valem:
 * - **contexto seguro** (HTTPS, ou `localhost`). A instalação padrão abre por
 *   HTTP no IP da máquina, e lá a refração fica desligada de propósito, sem
 *   teste funcional nenhum: o vidro foi desenhado para ficar bom sem ela;
 * - **motor Blink**, pela marca "Chromium" do `navigator.userAgentData` — que,
 *   aliás, só existe em contexto seguro. O protótipo usava só essa marca e
 *   achava que testava o motor; por HTTP ela some, e a refração nunca ligava
 *   em navegador nenhum sem que isso fosse uma decisão. Aqui é. No iPhone,
 *   todo navegador é WebKit e nenhum tem a marca;
 * - **modo completo**: o modo leve corta a refração, porque o filtro roda a
 *   cada quadro enquanto a página rola por baixo da barra.
 *
 * Por que não CSS: o Safari aceita `backdrop-filter: url(#x) blur(...)`,
 * ignora o `url()` e derruba o desfoque junto, e `@supports` não separa os
 * dois casos. Então a cadeia com `url()` só é escrita por JavaScript, no
 * estilo do elemento, depois desta decisão.
 */

export interface SinaisRefracao {
  /** `window.isSecureContext`. */
  contextoSeguro: boolean;
  /** `navigator.userAgentData?.brands`, ou `undefined` quando não existe. */
  marcas: readonly { brand: string }[] | undefined;
  /** Modo leve em vigor (`html[data-v2-efeitos="leve"]`). */
  modoLeve: boolean;
}

export function decidirRefracao({ contextoSeguro, marcas, modoLeve }: SinaisRefracao): boolean {
  if (!contextoSeguro || modoLeve || !marcas) return false;
  return marcas.some((m) => m.brand === "Chromium");
}

/**
 * O desfoque que acompanha a refração. Literal, como todo `backdrop-filter`
 * da v2 (sem `var()`), e mais fraco que o do vidro comum: a lente já distorce.
 */
export const CADEIA_APOS_REFRACAO = "blur(14px) saturate(1.9) brightness(1.08)";

/** O mapa é gerado pequeno e esticado pelo filtro: o maior lado tem isto. */
export const LADO_MAXIMO_MAPA = 260;

export interface MedidasLente {
  largura: number;
  altura: number;
  /** Raio dos cantos, em px. */
  raio: number;
  /** Espessura da borda que desvia, em px. */
  borda: number;
}

/**
 * O mapa de deslocamento da lente, em RGBA: R desloca em x, G em y, 128 é
 * "não mexe". Só a faixa da borda desvia, para dentro, com força que cresce
 * em curva cúbica até a aresta; o miolo fica neutro. Devolve as dimensões em
 * que foi gerado (reduzidas a `LADO_MAXIMO_MAPA`) e os pixels.
 *
 * Puro: o cliente só copia os pixels para um `<canvas>` e o transforma em
 * `data:` URL para o `<feImage>`.
 */
export function mapaDaLente({ largura, altura, raio, borda }: MedidasLente): {
  largura: number;
  altura: number;
  pixels: Uint8ClampedArray;
} {
  const escala = Math.min(1, LADO_MAXIMO_MAPA / Math.max(largura, altura));
  const W = Math.max(4, Math.round(largura * escala));
  const H = Math.max(4, Math.round(altura * escala));
  const R = Math.min(raio * escala, W / 2, H / 2);
  const B = Math.max(2, borda * escala);
  const metadeW = W / 2;
  const metadeH = H / 2;
  const pixels = new Uint8ClampedArray(W * H * 4);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = x + 0.5 - metadeW;
      const py = y + 0.5 - metadeH;
      // Distância à aresta do retângulo arredondado e a normal para fora.
      const qx = Math.abs(px) - (metadeW - R);
      const qy = Math.abs(py) - (metadeH - R);
      let distancia: number;
      let nx: number;
      let ny: number;
      if (qx > 0 && qy > 0) {
        const l = Math.hypot(qx, qy);
        distancia = R - l;
        nx = qx / l;
        ny = qy / l;
      } else if (qx > qy) {
        distancia = R - qx;
        nx = 1;
        ny = 0;
      } else {
        distancia = R - qy;
        nx = 0;
        ny = 1;
      }
      let forca = 0;
      if (distancia >= 0 && distancia < B) {
        const t = 1 - distancia / B;
        forca = t * t * t;
      }
      if (px < 0) nx = -nx;
      if (py < 0) ny = -ny;
      const i = (y * W + x) * 4;
      pixels[i] = 128 - nx * forca * 127;
      pixels[i + 1] = 128 - ny * forca * 127;
      pixels[i + 2] = 128;
      pixels[i + 3] = 255;
    }
  }
  return { largura: W, altura: H, pixels };
}

/** Força do deslocamento do filtro, proporcional ao menor lado. */
export function escalaDoDeslocamento(largura: number, altura: number): number {
  return Math.min(70, Math.max(26, Math.min(largura, altura) * 0.55));
}
