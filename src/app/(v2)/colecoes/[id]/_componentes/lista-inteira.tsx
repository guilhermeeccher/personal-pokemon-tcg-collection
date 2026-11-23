"use client";

import type { Ref } from "react";

import type { TipoColecao } from "@/lib/dominio/parametro-colecao";
import type { VagaGradeV2DTO } from "@/lib/dominio/tipos-cliente";

import { type ControleGradeVirtual, GradeVirtual } from "../../../_componentes/grade/grade-virtual";

import { Bolso } from "./bolso";
import { type TamanhoInteiro, TAMANHOS_INTEIRO, densidadeDoTamanho, vaoDoTamanho } from "./vista-colecao";

const chaveDaVaga = (v: VagaGradeV2DTO) => v.id;

/**
 * A lista inteira das vagas numa grade só ("Set inteiro", "Pokédex inteira",
 * a customizada inteira, e as vazias de "O que falta"), sobre a grade virtual
 * da v2. Os mesmos bolsos do fichário, noutro tamanho: uma lista de vagas,
 * não duas.
 */
export function ListaInteira({
  vagas,
  tipo,
  tamanho,
  rotulo,
  abertaId,
  parAtivo,
  aoAbrir,
  aoTirar,
  controle,
}: {
  vagas: readonly VagaGradeV2DTO[];
  tipo: TipoColecao;
  tamanho: TamanhoInteiro;
  rotulo: string;
  abertaId: string | null;
  parAtivo: string | null;
  aoAbrir: (vaga: VagaGradeV2DTO) => void;
  aoTirar?: (vaga: VagaGradeV2DTO) => void;
  controle?: Ref<ControleGradeVirtual>;
}) {
  const vao = vaoDoTamanho(tamanho);
  const densidade = densidadeDoTamanho(tamanho);
  // A carta aberta (ou a que acabou de fechar, para onde o detalhe voa de
  // volta) fica montada mesmo que a pessoa role para longe enquanto isso.
  const manter = [abertaId, parAtivo].filter((x): x is string => x !== null);
  return (
    <GradeVirtual
      ref={controle}
      itens={vagas}
      chaveDe={chaveDaVaga}
      minCelula={TAMANHOS_INTEIRO[tamanho]}
      vaoX={vao.x}
      vaoY={vao.y}
      manterMontadas={manter}
      rotulo={rotulo}
      renderizar={(v, celula) => (
        <Bolso
          vaga={v}
          tipo={tipo}
          densidade={densidade}
          aberta={abertaId === v.id}
          noParAtivo={parAtivo === v.id}
          celula={celula}
          aoAbrir={() => aoAbrir(v)}
          aoTirar={aoTirar ? () => aoTirar(v) : undefined}
        />
      )}
    />
  );
}
