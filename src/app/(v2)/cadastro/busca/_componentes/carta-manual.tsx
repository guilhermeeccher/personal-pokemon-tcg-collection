"use client";

/**
 * Cadastro de carta que a TCGdex não tem em fonte nenhuma (CBUS-05), o caso
 * do set `SMH` (GX Starter Decks japonês): sem linha de catálogo a carta não
 * podia nem ser cadastrada. Aparece onde a falta dói, quando a busca não acha
 * nada. A linha nasce `origem = manual` pela mesma rota da v1
 * (`POST /api/cartas/manual`); dali em diante é uma carta como as outras
 * (cadastrável, alocável numa vaga de Pokédex, exportável) e o sync nunca a
 * inativa nem a rebaixa para `sync`.
 *
 * O número da Pokédex é o que a torna elegível a uma vaga de Pokédex (regra
 * 2: só carta com **um** `dexId`). Treinador e Energia ficam sem.
 */

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { IDIOMAS, type Idioma } from "@/lib/dominio/enums";
import { textosDasRecusas } from "@/app/_comum/recusa";

import { Botao } from "../../../_componentes/primitivos/botao";
import { Campo, Selecao } from "../../../_componentes/primitivos/campo";
import { Modal } from "../../../_componentes/primitivos/modal";

import estilos from "./cadastro-busca.module.css";

export interface CartaManualCriada {
  cartaId: string;
  idioma: Idioma;
  /** A rota responde 200 em vez de 201 quando a carta já existia: nada foi criado. */
  jaExistia: boolean;
  /** O que a pessoa digitou, para a tela buscar a carta recém-criada sem separar o `cartaId`. */
  setId: string;
  localId: string;
}

export function CartaManual({
  siglaSugerida,
  numeroSugerido,
  nomeSugerido,
  aoCriar,
}: {
  /** Pré-preenche com o que a pessoa acabou de procurar sem sucesso. */
  siglaSugerida: string;
  numeroSugerido: string;
  nomeSugerido: string;
  aoCriar: (criada: CartaManualCriada) => void;
}) {
  const t = useTranslations("v2CadastroBusca.manual");
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Botao className={estilos.botaoManual} onClick={() => setAberto(true)}>
        {t("abrir")}
      </Botao>
      {aberto && (
        <JanelaCartaManual
          siglaSugerida={siglaSugerida}
          numeroSugerido={numeroSugerido}
          nomeSugerido={nomeSugerido}
          onFechar={() => setAberto(false)}
          aoCriar={(criada) => {
            setAberto(false);
            aoCriar(criada);
          }}
        />
      )}
    </>
  );
}

function JanelaCartaManual({
  siglaSugerida,
  numeroSugerido,
  nomeSugerido,
  onFechar,
  aoCriar,
}: {
  siglaSugerida: string;
  numeroSugerido: string;
  nomeSugerido: string;
  onFechar: () => void;
  aoCriar: (criada: CartaManualCriada) => void;
}) {
  const t = useTranslations("v2CadastroBusca.manual");
  const tr = useTranslations("recusas");
  const tIdioma = useTranslations("v2Detalhe.idiomaNome");
  const idForm = useId();
  const [setId, setSetId] = useState(siglaSugerida);
  const [nomeDoSet, setNomeDoSet] = useState("");
  const [localId, setLocalId] = useState(numeroSugerido);
  const [nome, setNome] = useState(nomeSugerido);
  // Japonês de partida: é o caso que originou a tela (set japonês fora do
  // catálogo). A pessoa troca se a carta é de outro idioma.
  const [idioma, setIdioma] = useState<Idioma>("jp");
  const [dexId, setDexId] = useState("");
  const [qtdSet, setQtdSet] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erros, setErros] = useState<string[]>([]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErros([]);
    setEnviando(true);
    try {
      const resp = await fetch("/api/cartas/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setId,
          setNome: nomeDoSet,
          localId,
          nome,
          idioma,
          dexId: dexId || undefined,
          qtdSet: qtdSet || undefined,
        }),
      });
      const dados = await resp.json().catch(() => null);
      if (!resp.ok) {
        setErros(textosDasRecusas(tr, dados, t("erroCadastrar")));
        return;
      }
      aoCriar({
        cartaId: String(dados.cartaId),
        idioma,
        jaExistia: dados.jaExistia === true,
        setId: setId.trim(),
        localId: localId.trim(),
      });
    } catch {
      setErros([t("erroRede")]);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      aberto
      onFechar={onFechar}
      titulo={t("titulo")}
      descricao={t("explicacao")}
      largura={560}
      // Fechar pelo véu perderia o que foi digitado.
      fecharPeloVeu={false}
      rodape={
        <>
          <Botao variante="secundario" onClick={onFechar}>
            {t("cancelar")}
          </Botao>
          <Botao type="submit" form={idForm} variante="primario" carregando={enviando}>
            {enviando ? t("cadastrando") : t("cadastrar")}
          </Botao>
        </>
      }
    >
      <form id={idForm} onSubmit={enviar} className={estilos.formManual} noValidate>
        <div className={estilos.tresCampos}>
          <Campo
            rotulo={t("campoSigla")}
            value={setId}
            onChange={(e) => setSetId(e.target.value)}
            placeholder="SMH"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
          <Campo
            rotulo={t("campoNumero")}
            value={localId}
            onChange={(e) => setLocalId(e.target.value)}
            placeholder="011"
            autoCorrect="off"
            spellCheck={false}
          />
          <Campo
            rotulo={t("campoTotalSet")}
            value={qtdSet}
            onChange={(e) => setQtdSet(e.target.value)}
            placeholder="131"
            inputMode="numeric"
          />
        </div>
        <Campo
          rotulo={t("campoNomeCarta")}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Charmander"
        />
        <Campo
          rotulo={t("campoNomeSet")}
          value={nomeDoSet}
          onChange={(e) => setNomeDoSet(e.target.value)}
          placeholder="GX Starter Decks"
        />
        <div className={estilos.doisCampos}>
          <Selecao
            rotulo={t("campoIdiomaCatalogo")}
            value={idioma}
            onChange={(e) => setIdioma(e.target.value as Idioma)}
          >
            {IDIOMAS.map((i) => (
              <option key={i} value={i}>
                {tIdioma(i)}
              </option>
            ))}
          </Selecao>
          <Campo
            rotulo={t("campoDexId")}
            value={dexId}
            onChange={(e) => setDexId(e.target.value)}
            placeholder="4"
            inputMode="numeric"
          />
        </div>
        <p className={estilos.ajuda}>{t("ajudaDexId")}</p>
        {erros.length > 0 && (
          <ul className={estilos.erros} role="alert">
            {erros.map((erro) => (
              <li key={erro}>{erro}</li>
            ))}
          </ul>
        )}
      </form>
    </Modal>
  );
}
