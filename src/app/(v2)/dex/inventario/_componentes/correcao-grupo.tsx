"use client";

/**
 * Corrigir um grupo do inventário da Dex (DINV-04): shiny, origem, data de
 * captura e notas de **todos** os registros do grupo, num
 * `PATCH /api/dex/registros` com os ids dele — o corpo da v1. O local nunca
 * muda por aqui: mover é outra operação, com as regras de ida e volta
 * (AGENTS.md, "Moving and correcting are separate operations"). Forma errada
 * não se corrige: apaga e cadastra de novo, como na v1.
 *
 * A janela da v2 (`Modal`): painel a partir de 768 px, folha abaixo. Tocar
 * fora não fecha, porque fecharia perdendo o que foi digitado. Uma recusa
 * (data inválida, origem desconhecida) fica dentro da janela, para corrigir e
 * salvar de novo; um 404 (outra aba apagou o grupo) avisa quem abriu, que
 * relê a lista.
 */

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { textosDasRecusas } from "@/app/_comum/recusa";
import { JOGOS_DEX, ORIGEM_HOME } from "@/lib/dominio/dex-jogos";
import type { JogoPossuidoDTO } from "@/lib/dominio/tipos-cliente";

import { Botao } from "../../../_componentes/primitivos/botao";
import { Campo, Selecao } from "../../../_componentes/primitivos/campo";
import { Modal } from "../../../_componentes/primitivos/modal";
import { AvisoEmLinha } from "../../../_componentes/primitivos/painel";

import estilos from "./inventario-dex.module.css";
import type { LinhaInventarioDex } from "./linhas-inventario";

export function CorrecaoGrupo({
  linha,
  nome,
  jogos,
  aoFechar,
  aoRecusar,
}: {
  /** O grupo em correção; nulo fecha a janela. */
  linha: LinhaInventarioDex | null;
  nome: string;
  jogos: readonly JogoPossuidoDTO[];
  aoFechar: (salvou: boolean) => void;
  aoRecusar: (status: number) => void;
}) {
  const t = useTranslations("v2DexInventario");
  const td = useTranslations("dex");
  const idForm = useId();
  const [salvando, setSalvando] = useState(false);
  const fechar = () => {
    if (!salvando) aoFechar(false);
  };

  return (
    <Modal
      aberto={linha !== null}
      onFechar={fechar}
      titulo={linha ? td("inventario.corrigirTitulo", { quantidade: String(linha.grupo.ids.length) }) : ""}
      descricao={linha ? t("corrigirTexto", { nome }) : undefined}
      fecharPeloVeu={false}
      rodape={
        <>
          <Botao variante="fantasma" disabled={salvando} onClick={fechar}>
            {td("inventario.cancelar")}
          </Botao>
          <Botao type="submit" form={idForm} variante="primario" carregando={salvando}>
            {td("inventario.salvar")}
          </Botao>
        </>
      }
    >
      {/* A chave do grupo remonta o formulário a cada grupo aberto: o rascunho
          nasce dos valores dele, nunca do grupo anterior. */}
      {linha && (
        <FormularioCorrecao
          key={linha.grupo.chave}
          id={idForm}
          linha={linha}
          jogos={jogos}
          aoMudarSalvando={setSalvando}
          aoSalvar={() => aoFechar(true)}
          aoRecusar={aoRecusar}
        />
      )}
    </Modal>
  );
}

function FormularioCorrecao({
  id,
  linha,
  jogos,
  aoMudarSalvando,
  aoSalvar,
  aoRecusar,
}: {
  id: string;
  linha: LinhaInventarioDex;
  jogos: readonly JogoPossuidoDTO[];
  aoMudarSalvando: (salvando: boolean) => void;
  aoSalvar: () => void;
  aoRecusar: (status: number) => void;
}) {
  const td = useTranslations("dex");
  const tr = useTranslations("recusas");
  const { grupo } = linha;
  const [dados, setDados] = useState({
    shiny: grupo.shiny,
    jogoOrigem: grupo.jogoOrigem,
    capturadoEm: grupo.capturadoEm ?? "",
    notas: grupo.notas ?? "",
  });
  const [erros, setErros] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const meus = new Set(jogos.map((j) => j.jogoId));

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    aoMudarSalvando(true);
    setErros([]);
    try {
      const r = await fetch("/api/dex/registros", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: grupo.ids, formaId: grupo.formaId, ...dados }),
      });
      if (!r.ok) {
        setErros(textosDasRecusas(tr, await r.json().catch(() => null), td("inventario.erro")));
        aoRecusar(r.status);
        return;
      }
      aoSalvar();
    } catch {
      setErros([td("inventario.erro")]);
    } finally {
      setEnviando(false);
      aoMudarSalvando(false);
    }
  }

  return (
    <form id={id} className={estilos.formulario} onSubmit={salvar}>
      <label className={estilos.interruptor}>
        <input
          type="checkbox"
          role="switch"
          checked={dados.shiny}
          onChange={(e) => setDados((d) => ({ ...d, shiny: e.target.checked }))}
        />
        <span>{td("inventario.shiny")}</span>
      </label>
      <Selecao
        rotulo={td("inventario.jogoOrigem")}
        value={dados.jogoOrigem}
        onChange={(e) => setDados((d) => ({ ...d, jogoOrigem: e.target.value }))}
      >
        <option value={ORIGEM_HOME}>{td("home")}</option>
        <optgroup label={td("inventario.seusJogos")}>
          {JOGOS_DEX.filter((j) => meus.has(j.id)).map((j) => (
            <option key={j.id} value={j.id}>
              {j.nome}
            </option>
          ))}
        </optgroup>
        <optgroup label={td("inventario.outrosJogos")}>
          {JOGOS_DEX.filter((j) => !meus.has(j.id)).map((j) => (
            <option key={j.id} value={j.id}>
              {j.nome}
            </option>
          ))}
        </optgroup>
      </Selecao>
      <Campo
        type="date"
        rotulo={td("inventario.capturadoEm")}
        value={dados.capturadoEm}
        onChange={(e) => setDados((d) => ({ ...d, capturadoEm: e.target.value }))}
      />
      <Campo
        rotulo={td("inventario.notas")}
        value={dados.notas}
        onChange={(e) => setDados((d) => ({ ...d, notas: e.target.value }))}
      />
      {erros.length > 0 && (
        <AvisoEmLinha tom="perigo" papel="alert">
          {erros.length === 1 ? (
            erros[0]
          ) : (
            <ul className={estilos.listaErros}>
              {erros.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </AvisoEmLinha>
      )}
    </form>
  );
}
