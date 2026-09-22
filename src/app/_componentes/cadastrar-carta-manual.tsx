"use client";

/**
 * Cadastro de carta que a TCGdex não tem em fonte nenhuma.
 *
 * O caso que originou: um Charmander do set `SMH` (GX Starter Decks
 * japonês, 131 cartas) — set ausente do repositório de dados e da lista
 * de 184 sets japoneses da API. Não é isolado: 68 sets japoneses estão
 * sem carta a carta, e os sets em português também têm buracos. Sem
 * linha de catálogo, a carta não podia nem ser cadastrada.
 *
 * Aparece onde a falta dói: no cadastro por busca, quando a busca não
 * encontra nada. Depois de criada, a carta é normal — cadastrável,
 * alocável em vaga de Pokédex, exportável — e o sync nunca a remove.
 */

import { useTranslations } from "next-intl";
import { useState } from "react";

import { IDIOMAS, type Idioma } from "@/lib/dominio/enums";
import { Botao } from "./botao";
import { Campo, classesEntrada } from "./campo";
import { Modal } from "./modal";

export function CadastrarCartaManual({
  siglaSugerida = "",
  numeroSugerido = "",
  nomeSugerido = "",
  onCriada,
}: {
  /** Pré-preenche com o que ele acabou de procurar sem sucesso. */
  siglaSugerida?: string;
  numeroSugerido?: string;
  nomeSugerido?: string;
  onCriada: (cartaId: string, idioma: Idioma) => void;
}) {
  const t = useTranslations("cartaManual");
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <Botao type="button" variante="secundario" onClick={() => setAberto(true)}>
        {t("abrir")}
      </Botao>
      {aberto && (
        <ModalCartaManual
          siglaSugerida={siglaSugerida}
          numeroSugerido={numeroSugerido}
          nomeSugerido={nomeSugerido}
          onFechar={() => setAberto(false)}
          onCriada={(id, idioma) => {
            setAberto(false);
            onCriada(id, idioma);
          }}
        />
      )}
    </>
  );
}

function ModalCartaManual({
  siglaSugerida,
  numeroSugerido,
  nomeSugerido,
  onFechar,
  onCriada,
}: {
  siglaSugerida: string;
  numeroSugerido: string;
  nomeSugerido: string;
  onFechar: () => void;
  onCriada: (cartaId: string, idioma: Idioma) => void;
}) {
  const t = useTranslations("cartaManual");
  const [setId, setSetId] = useState(siglaSugerida);
  const [nomeDoSet, setNomeDoSet] = useState("");
  const [localId, setLocalId] = useState(numeroSugerido);
  const [nome, setNome] = useState(nomeSugerido);
  const [idioma, setIdioma] = useState<Idioma>("jp");
  const [dexId, setDexId] = useState("");
  const [qtdSet, setQtdSet] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erros, setErros] = useState<string[]>([]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
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
      const dados = await resp.json();
      if (!resp.ok) {
        setErros(dados.erros ?? [dados.erro ?? t("erroCadastrar")]);
        return;
      }
      onCriada(dados.cartaId, idioma);
    } catch {
      setErros([t("erroRede")]);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal as="form" onSubmit={enviar}>
      <h2 className="font-medium text-foreground">{t("titulo")}</h2>
      <p className="text-muted">
        {t.rich("explicacao", { forte: (partes) => <strong>{partes}</strong> })}
      </p>

      <div className="flex flex-wrap gap-3">
        <Campo rotulo={t("campoSigla")}>
          <input
            value={setId}
            onChange={(e) => setSetId(e.target.value)}
            placeholder="SMH"
            className={`w-32 ${classesEntrada}`}
          />
        </Campo>
        <Campo rotulo={t("campoNumero")}>
          <input
            value={localId}
            onChange={(e) => setLocalId(e.target.value)}
            placeholder="011"
            className={`w-28 ${classesEntrada}`}
          />
        </Campo>
        <Campo rotulo={t("campoTotalSet")}>
          <input
            value={qtdSet}
            onChange={(e) => setQtdSet(e.target.value)}
            placeholder="131"
            className={`w-28 ${classesEntrada}`}
          />
        </Campo>
      </div>

      <Campo rotulo={t("campoNomeCarta")}>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Charmander"
          className={`w-full ${classesEntrada}`}
        />
      </Campo>

      <Campo rotulo={t("campoNomeSet")}>
        <input
          value={nomeDoSet}
          onChange={(e) => setNomeDoSet(e.target.value)}
          placeholder="GX Starter Decks"
          className={`w-full ${classesEntrada}`}
        />
      </Campo>

      <div className="flex flex-wrap gap-3">
        <Campo rotulo={t("campoIdiomaCatalogo")}>
          <select
            value={idioma}
            onChange={(e) => setIdioma(e.target.value as Idioma)}
            className={classesEntrada}
          >
            {IDIOMAS.map((i) => (
              <option key={i} value={i}>
                {i.toUpperCase()}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo={t("campoDexId")}>
          <input
            value={dexId}
            onChange={(e) => setDexId(e.target.value)}
            placeholder="4"
            className={`w-28 ${classesEntrada}`}
          />
        </Campo>
      </div>
      <p className="text-xs text-muted">{t("ajudaDexId")}</p>

      {erros.length > 0 && (
        <ul className="text-danger">
          {erros.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Botao type="button" variante="secundario" onClick={onFechar}>
          {t("cancelar")}
        </Botao>
        <Botao type="submit" variante="primario" disabled={enviando}>
          {enviando ? t("cadastrando") : t("cadastrar")}
        </Botao>
      </div>
    </Modal>
  );
}
