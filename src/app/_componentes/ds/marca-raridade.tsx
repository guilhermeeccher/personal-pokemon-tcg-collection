/**
 * MarcaRaridade — glifo + cor para a raridade, com o rótulo real ao lado.
 *
 * O design system fechou a raridade num enum de cinco valores em inglês.
 * A raridade do catálogo é texto livre em dois idiomas, com 56 valores
 * distintos. Mapear 56 em 5 na exibição perderia informação que o
 * usuário usa, então aqui só o **glifo e a cor** vêm dos cinco baldes
 * (por `classificarRaridade`, que é módulo puro e testado contra os 56
 * valores reais); o texto exibido é a string original, sem tradução.
 *
 * Os glifos são genéricos de propósito — círculo, losango, estrela — e
 * nunca os símbolos oficiais de raridade, que são material licenciado.
 *
 * `dica` (padrão `false`): sem o rótulo ao lado, o glifo só se explica pelo
 * `title`, que o celular não tem. Com `comRotulo={false}` e `dica`, o glifo
 * vem envolto em `Dica` (botão "i" que mostra a raridade ao toque). Com o
 * rótulo visível não há o que explicar, por isso o tipo recusa `dica` ali.
 * Com `false` — ou em 768px ou mais — a saída é a de sempre.
 */

import { useTranslations } from "next-intl";

import { Dica } from "../dica";
import { Icone, type NomeIcone } from "../icone";
import { classificarRaridade, type ClasseRaridade } from "@/lib/dominio/raridade-visual";

const MAPA: Record<ClasseRaridade, { cor: string; icone: NomeIcone }> = {
  comum: { cor: "var(--rarity-common)", icone: "circle" },
  incomum: { cor: "var(--rarity-uncommon)", icone: "diamond" },
  rara: { cor: "var(--rarity-rare)", icone: "star" },
  holo: { cor: "var(--rarity-holo)", icone: "sparkles" },
  secreta: { cor: "var(--rarity-secret)", icone: "crown" },
};

/** Cor da raridade, para pintar a barra do recorte "Por raridade". */
export function corRaridade(raridade: string | null | undefined): string {
  return MAPA[classificarRaridade(raridade)].cor;
}

export function MarcaRaridade({
  raridade,
  comRotulo = true,
  dica = false,
}: {
  raridade: string | null | undefined;
} & ({ comRotulo?: true; dica?: false } | { comRotulo: false; dica?: boolean })) {
  const t = useTranslations("componentes");
  const { cor, icone } = MAPA[classificarRaridade(raridade)];
  /* A raridade em si nunca é traduzida — é texto livre do catálogo, em 56
     valores distintos (ver o cabeçalho). Só a ausência dela tem rótulo
     nosso, e esse fala o idioma da interface. */
  const rotulo = raridade ?? t("semRaridade");
  const marca = (
    <span className="inline-flex items-center gap-1.5 text-xs" title={rotulo}>
      <span style={{ color: cor }} className="shrink-0">
        <Icone nome={icone} tamanho={13} />
      </span>
      {comRotulo && <span className="text-muted">{rotulo}</span>}
    </span>
  );
  return dica ? <Dica texto={rotulo}>{marca}</Dica> : marca;
}
