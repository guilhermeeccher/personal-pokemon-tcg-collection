"use client";

/**
 * A página inicial da v2 (`/`, pacote 2a). Tudo chega pronto do servidor
 * (`lib/db/inicio-v2.ts`); aqui nada é somado nem reordenado.
 *
 * De cima para baixo: a vitrine (as joias do inventário num leque, os números
 * e os atalhos), o "Quase lá", e lado a lado as cadastradas nos últimos 7 dias
 * com "Suas coleções" e, com o módulo ligado, o resumo da Living Dex.
 *
 * **Tocar numa carta abre o detalhe em modo cópia** (`<DetalheCarta>`), como
 * a regra 25 de `docs/design-v2/rules.md` pede de quem abre: a carta tocada
 * ganha o nome de transição numa atualização urgente e, no mesmo toque, o
 * detalhe abre dentro de `startTransition` enquanto a carta sai do lugar (fica
 * um lugar do mesmo tamanho). A chave da transição leva o bloco junto com a
 * cópia (`vitrine:` ou `cadastrada:`): a mesma cópia pode estar na vitrine e
 * nas cadastradas, e só a tocada pode levar o nome.
 *
 * **Depois de uma escrita no detalhe, a página relê do servidor**
 * (`router.refresh()`): editar a quantidade muda os totais, alocar muda o
 * "Quase lá". O detalhe continua aberto por cima, com o estado dele.
 */

import { useRouter } from "next/navigation";
import { startTransition, useCallback, useState } from "react";

import type { InicioV2DTO } from "@/lib/dominio/inicio-v2";

import { DetalheCarta, type AberturaDetalhe } from "../_componentes/detalhe/detalhe-carta";
import { Cadastradas } from "./cadastradas";
import { ResumoDex } from "./resumo-dex";
import { QuaseLa } from "./quase-la";
import { SuasColecoes } from "./suas-colecoes";
import { Vitrine } from "./vitrine";
import estilos from "./inicio.module.css";
import type { AbrirCarta } from "./tipos";

interface Aberta {
  chave: string;
  abertura: AberturaDetalhe;
}

export function Inicio({ dados }: { dados: InicioV2DTO }) {
  const router = useRouter();
  const [aberta, setAberta] = useState<Aberta | null>(null);
  // O par ativo da transição: a carta que abriu, e para onde o detalhe volta.
  // Fica depois de fechar, para a carta do detalhe voar de volta a ela.
  const [alvo, setAlvo] = useState<string | null>(null);

  const abrir: AbrirCarta = useCallback((chave, carta) => {
    setAlvo(chave);
    startTransition(() =>
      setAberta({
        chave,
        abertura: {
          modo: "copia",
          cartaId: carta.cartaId,
          copiaId: carta.copiaId,
          previa: {
            nome: carta.nome,
            imagemUrl: carta.imagemUrl,
            imagemOrigem: carta.imagemOrigem,
            raridade: carta.raridade,
            variante: carta.variante,
          },
        },
      }),
    );
  }, []);

  const fechar = useCallback(() => setAberta(null), []);
  const aoMudar = useCallback(() => startTransition(() => router.refresh()), [router]);

  const cartas = { abrir, aberta: aberta?.chave ?? null, alvo };

  return (
    <div className={estilos.pagina}>
      <Vitrine dados={dados} cartas={cartas} />
      {dados.quaseLa.length > 0 && <QuaseLa itens={dados.quaseLa} />}
      <div className={dados.dex ? estilos.duas : estilos.uma}>
        <div className={estilos.coluna}>
          <Cadastradas cadastradas={dados.cadastradas} cartas={cartas} />
          <SuasColecoes colecoes={dados.colecoes} total={dados.totalColecoes} />
        </div>
        {dados.dex && <ResumoDex dex={dados.dex} />}
      </div>
      <DetalheCarta abertura={aberta?.abertura ?? null} onFechar={fechar} onMudou={aoMudar} chaveTransicao={aberta?.chave} />
    </div>
  );
}
