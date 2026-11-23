"use client";

/**
 * `<Carta>` — a carta da v2: a imagem, o efeito de luz da variante, o
 * brilho que segue o ponteiro e a inclinação por mola.
 *
 * ## Modos
 *
 * - `grade` (padrão): uma carta entre centenas. Em repouso é **uma imagem
 *   simples** (mais um gradiente fixo se a variante é especial); as camadas
 *   de luz, o `will-change` e a mistura de cores só montam enquanto ela está
 *   ativa — ponteiro de mouse ou caneta em cima, foco dentro dela, ou
 *   `ativa` vindo de quem a usa (o botão que a contém recebeu foco). No
 *   toque, a carta da grade **não** inclina: o dedo ali está rolando a
 *   página, e inclinar brigaria com a rolagem.
 * - `vitrine`: sempre ativa e, se a animação contínua é permitida, passeia
 *   sozinha enquanto está na tela (`IntersectionObserver`); o ponteiro
 *   assume quando passa por cima. Para as poucas cartas de destaque.
 * - `palco`: a carta do detalhe. Sempre ativa, inclina também sob o dedo,
 *   e só ela tem `touch-action: none`.
 *
 * ## Movimento
 *
 * A decisão vem de `useMovimento()`: com movimento reduzido ou no modo leve
 * não há mola nem inclinação nem passeio — a carta ativa mostra a luz
 * parada no centro, a meia-luz (`data-estatico`). Ao soltar, a mola volta a
 * carta ao repouso e só então ela desmonta as camadas: o estado final é
 * idêntico com e sem movimento. O laço de quadros é um só para todas as
 * cartas (`laco-mola.ts`) e só roda enquanto alguma se mexe.
 *
 * ## Imagem
 *
 * A URL chega pronta da cadeia de procedência em SQL, com a origem; é a
 * mesma regra de `imagem-carta-zoom.tsx` na v1 (ver `imagem-carta.ts`).
 * `qualidade="high"` carrega a grande à parte e só troca depois de
 * decodificada. A foto emprestada (outro idioma, mypcards) ganha o selo
 * curto visível e a explicação em texto para leitor de tela — nunca só num
 * `title`. Se a imagem falhar, a carta mostra o `fallback` no lugar, com o
 * mesmo tamanho; a falha é guardada pela URL, não por um booleano, para uma
 * instância reaproveitada pelo React (paginação, filtro) não esconder a
 * carta seguinte.
 *
 * ## A variante é texto também
 *
 * O brilho é realce: a variante da cópia sai sempre como texto — visível com
 * `mostrarVariante`, e para leitor de tela de qualquer jeito.
 */

import { useTranslations } from "next-intl";
import {
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { VarianteCopia } from "@/lib/dominio/enums";
import { type OrigemImagem, seloOrigemImagem } from "@/lib/dominio/origem-imagem";

import { type Animador, acordar, dispensar } from "../movimento/laco-mola";
import {
  type AlvoInclinacao,
  type EstadoInclinacao,
  REPOUSO,
  alvoAutomatico,
  alvoDoPonteiro,
  assentar,
  assentou,
  avancarMola,
  estiloDaInclinacao,
} from "../movimento/mola";
import { useMovimento } from "../movimento/use-movimento";

import estilos from "./carta.module.css";
import { efeitoDaCarta } from "./efeito-carta";
import { type QualidadeImagem, fontesDaImagem } from "./imagem-carta";

export type ModoCarta = "grade" | "vitrine" | "palco";

/** Ângulo na borda da carta, em graus. O palco é maior e aguenta mais. */
const INCLINACAO_PADRAO: Record<ModoCarta, number> = { grade: 10, vitrine: 10, palco: 12 };

/** Ativa por foco (sem ponteiro): a carta fica reta, com a luz a meia força. */
const ALVO_FOCO: AlvoInclinacao = Object.freeze({ x: 0.5, y: 0.5, intensidade: 0.6 });

export interface PropsCarta {
  /** A URL já escolhida pela cadeia de procedência (`imagemDaCarta`). */
  imagemUrl: string | null;
  /** De onde veio a imagem (`origemDaImagem`); governa o selo de foto emprestada. */
  origem?: OrigemImagem | null;
  /** Nome da carta, para o `alt`. */
  alt: string;
  /** Variante da cópia física; `null` quando não há cópia. */
  variante?: VarianteCopia | null;
  /** Raridade da linha do catálogo, como veio do upstream. */
  raridade?: string | null;
  /** `low` (padrão) em grade; `high` sob demanda (detalhe, vitrine). */
  qualidade?: QualidadeImagem;
  modo?: ModoCarta;
  /** Força a carta ativa (ex.: o botão que a contém está com foco). */
  ativa?: boolean;
  /** Ângulo máximo, em graus, na borda. */
  inclinacaoMax?: number;
  /** Mostra a variante escrita sobre a carta (leitor de tela já a ouve sempre). */
  mostrarVariante?: boolean;
  /** No lugar da imagem quando não há URL ou ela falhou. */
  fallback?: ReactNode;
  /** `lazy` por padrão em grade; `eager` nos outros modos. */
  carregamento?: "lazy" | "eager";
  className?: string;
}

/** O que o laço precisa saber a cada quadro, atualizado depois de cada render. */
interface Configuracao {
  inclinacaoMax: number;
  passeio: boolean;
  alvoParado: AlvoInclinacao;
}

export function Carta({
  imagemUrl,
  origem = null,
  alt,
  variante = null,
  raridade = null,
  qualidade = "low",
  modo = "grade",
  ativa: ativaPorFora = false,
  inclinacaoMax,
  mostrarVariante = false,
  fallback = null,
  carregamento,
  className,
}: PropsCarta) {
  const t = useTranslations("componentes");
  const movimento = useMovimento();

  const efeito = efeitoDaCarta({ variante, raridade });
  const rotuloVariante = variante ? t(`variante.${variante}`) : null;
  const selo = seloOrigemImagem(origem);
  const explicacaoSelo = selo ? t(`seloOrigem.${origem}`) : null;

  /* ---------- Imagem ---------- */

  const { base, alvo, trocaDepois } = fontesDaImagem(imagemUrl, qualidade);
  const [urlQueFalhou, setUrlQueFalhou] = useState<string | null>(null);
  const [alvoPronto, setAlvoPronto] = useState<string | null>(null);

  // Decodifica a grande à parte e só então troca. O `setState` sai da
  // promessa, nunca do corpo do efeito.
  useEffect(() => {
    if (!trocaDepois || !alvo) return;
    let viva = true;
    const imagem = new Image();
    imagem.decoding = "async";
    imagem.src = alvo;
    imagem.decode().then(
      () => {
        if (viva) setAlvoPronto(alvo);
      },
      () => {
        // A grande não veio: a pequena continua, que é melhor que nada.
      },
    );
    return () => {
      viva = false;
    };
  }, [alvo, trocaDepois]);

  const src = trocaDepois && alvoPronto === alvo ? alvo : base;
  const semImagem = !src || urlQueFalhou === src;

  /* ---------- Atividade ---------- */

  const [sobPonteiro, setSobPonteiro] = useState(false);
  const [comFoco, setComFoco] = useState(false);
  // A mola saiu do repouso (ponteiro, foco, ativa por fora) e ainda não
  // voltou a ele: as camadas só desmontam quando ela assenta no repouso.
  const [voltando, setVoltando] = useState(false);
  const [visivel, setVisivel] = useState(true);

  // Ativa por fora tira a mola do repouso como o foco tira: marca a volta,
  // para que, quando `ativa` cair, as camadas fiquem até a carta assentar
  // e o estilo escrito pelo laço seja apagado. Ajuste de estado durante o
  // render, o padrão do React para estado que acompanha uma prop.
  if (ativaPorFora && movimento.mola && !voltando) setVoltando(true);

  const sempreAtiva = modo !== "grade";
  const interagindo = sobPonteiro || comFoco || ativaPorFora;
  const ativa = sempreAtiva || interagindo || (movimento.mola && voltando);
  const passeio = modo === "vitrine" && movimento.animacaoContinua && visivel;
  const alvoParado: AlvoInclinacao = comFoco || ativaPorFora ? ALVO_FOCO : REPOUSO;

  /* ---------- Mola ---------- */

  const elRef = useRef<HTMLDivElement | null>(null);
  const configRef = useRef<Configuracao>({ inclinacaoMax: INCLINACAO_PADRAO[modo], passeio: false, alvoParado: REPOUSO });
  const animadorRef = useRef<(Animador & { alvo: AlvoInclinacao; noPonteiro: boolean }) | null>(null);

  useEffect(() => {
    configRef.current = { inclinacaoMax: inclinacaoMax ?? INCLINACAO_PADRAO[modo], passeio, alvoParado };
  });

  /** Apaga o que o laço escreveu: a carta volta a ser só o que o CSS diz. */
  const limparEstilo = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    el.style.removeProperty("transform");
    el.style.removeProperty("--px");
    el.style.removeProperty("--py");
    el.style.removeProperty("--o");
  }, []);

  /** O animador desta carta, criado na primeira vez que for preciso. */
  const obterAnimador = useCallback(() => {
    if (animadorRef.current) return animadorRef.current;
    let estado: EstadoInclinacao = assentar(REPOUSO);
    const fase = Math.random() * 6;
    const animador = {
      alvo: REPOUSO as AlvoInclinacao,
      noPonteiro: false,
      quadro(tempo: number, dt: number): boolean {
        const el = elRef.current;
        if (!el || !el.isConnected) return false;
        const { inclinacaoMax: max, passeio: passeando, alvoParado: parado } = configRef.current;
        const livre = !animador.noPonteiro;
        const alvoAgora = livre ? (passeando ? alvoAutomatico(tempo, fase) : parado) : animador.alvo;
        estado = avancarMola(estado, alvoAgora, dt);
        // Assenta em qualquer alvo parado: o repouso, a luz de foco e também
        // o ponteiro que parou em cima da carta — o próximo movimento acorda
        // o laço de novo. Só o passeio nunca assenta.
        if (!(livre && passeando) && assentou(estado, alvoAgora)) {
          estado = assentar(alvoAgora);
          if (alvoAgora === REPOUSO) {
            // Voltou ao repouso: sem resto de estilo, e a carta desmonta as
            // camadas no próximo render (se não for sempre ativa).
            limparEstilo();
            setVoltando(false);
          } else {
            aplicar(el, estado, max);
          }
          return false;
        }
        aplicar(el, estado, max);
        return true;
      },
    };
    animadorRef.current = animador;
    return animador;
  }, [limparEstilo]);

  // Liga e desliga o laço conforme o estado. Movimento desligado no meio do
  // caminho (o usuário ligou movimento reduzido): sai do laço e apaga o
  // estilo — a carta fica no estado final sem completar o caminho.
  useEffect(() => {
    if (!movimento.mola) {
      const animador = animadorRef.current;
      if (animador) {
        dispensar(animador);
        animadorRef.current = null;
      }
      limparEstilo();
      return;
    }
    // `voltando` cobre o foco que saiu: o alvo parado virou o repouso e a
    // carta, que estava assentada na luz de foco, precisa voltar.
    if (passeio || interagindo || voltando) acordar(obterAnimador());
  }, [movimento.mola, passeio, interagindo, voltando, alvoParado, obterAnimador, limparEstilo]);

  // Desmontou: sai do laço.
  useEffect(
    () => () => {
      if (animadorRef.current) dispensar(animadorRef.current);
    },
    [],
  );

  // Vitrine: o passeio só roda com a carta na tela.
  useEffect(() => {
    if (modo !== "vitrine" || !movimento.animacaoContinua) return;
    const el = elRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observador = new IntersectionObserver(([entrada]) => setVisivel(entrada?.isIntersecting ?? true));
    observador.observe(el);
    return () => observador.disconnect();
  }, [modo, movimento.animacaoContinua]);

  // Saiu do passeio (rolou para fora, animação desligada): volta ao centro.
  useEffect(() => {
    if (!passeio && modo === "vitrine" && animadorRef.current) acordar(animadorRef.current);
  }, [passeio, modo]);

  /* ---------- Ponteiro e foco ---------- */

  /** Mouse e caneta inclinam em qualquer modo; o dedo, só no palco. */
  const aceitaPonteiro = (e: PointerEvent) => e.pointerType !== "touch" || modo === "palco";

  function aoMoverPonteiro(e: PointerEvent<HTMLDivElement>) {
    if (!aceitaPonteiro(e)) return;
    if (!sobPonteiro) setSobPonteiro(true);
    if (!movimento.mola) return;
    const animador = obterAnimador();
    animador.noPonteiro = true;
    animador.alvo = alvoDoPonteiro(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
    if (!voltando) setVoltando(true);
    acordar(animador);
  }

  function soltar() {
    setSobPonteiro(false);
    const animador = animadorRef.current;
    if (!animador) return;
    animador.noPonteiro = false;
    acordar(animador);
  }

  function aoSairPonteiro(e: PointerEvent<HTMLDivElement>) {
    if (!aceitaPonteiro(e)) return;
    soltar();
  }

  function aoLevantarPonteiro(e: PointerEvent<HTMLDivElement>) {
    // No toque não há "sair": o fim do toque é o fim da inclinação.
    if (e.pointerType === "touch" && modo === "palco") soltar();
  }

  function aoFocar() {
    setComFoco(true);
    if (movimento.mola) setVoltando(true);
  }

  function aoDesfocar(e: FocusEvent<HTMLDivElement>) {
    // O foco só passou de um filho para outro: continua dentro.
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
    setComFoco(false);
  }

  const classes = [estilos.carta, semImagem ? estilos.vazia : null, className].filter(Boolean).join(" ");

  return (
    <div
      ref={elRef}
      className={classes}
      data-fx={efeito}
      data-modo={modo}
      data-variante={variante ?? undefined}
      data-ativa={ativa ? "" : undefined}
      data-estatico={ativa && !movimento.mola ? "" : undefined}
      onPointerEnter={aoMoverPonteiro}
      onPointerMove={aoMoverPonteiro}
      onPointerLeave={aoSairPonteiro}
      onPointerCancel={soltar}
      onPointerUp={aoLevantarPonteiro}
      onFocus={aoFocar}
      onBlur={aoDesfocar}
    >
      {semImagem ? (
        fallback
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element -- grade de dezenas a centenas de cartas do CDN ou do volume local; `<img>` simples, como na v1 (o otimizador só serve URL https absoluta). */
        <img
          className={estilos.imagem}
          src={src}
          alt={alt}
          width={245}
          height={337}
          loading={carregamento ?? (modo === "grade" ? "lazy" : "eager")}
          decoding="async"
          draggable={false}
          onError={() => {
            if (src === base) setUrlQueFalhou(src);
            // A grande falhou depois de decodificada (raro): volta para a pequena.
            else setAlvoPronto(null);
          }}
        />
      )}
      {ativa && !semImagem ? (
        <>
          {efeito !== "normal" ? <i aria-hidden="true" className={`${estilos.camada} ${estilos.fx}`} /> : null}
          <i aria-hidden="true" className={`${estilos.camada} ${estilos.brilho}`} />
        </>
      ) : null}
      {rotuloVariante ? (
        mostrarVariante ? (
          <span className={estilos.variante}>{rotuloVariante}</span>
        ) : (
          <span className={estilos.somenteLeitor}>{rotuloVariante}</span>
        )
      ) : null}
      {selo && !semImagem ? (
        <>
          <span aria-hidden="true" className={estilos.selo}>
            {selo.texto}
          </span>
          <span className={estilos.somenteLeitor}>{explicacaoSelo}</span>
        </>
      ) : null}
    </div>
  );
}

function aplicar(el: HTMLElement, estado: EstadoInclinacao, inclinacaoMax: number) {
  const estilo = estiloDaInclinacao(estado, inclinacaoMax);
  el.style.transform = estilo.transform;
  el.style.setProperty("--px", estilo.px);
  el.style.setProperty("--py", estilo.py);
  el.style.setProperty("--o", estilo.intensidade);
}
