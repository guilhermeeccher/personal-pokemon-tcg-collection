"use client";

/**
 * Controle discreto para fornecer a imagem de uma carta do catálogo que
 * não tem foto em nenhuma fonte automática (tarefa "carta sem foto",
 * 2026-08-26): nem `carta_catalogo.imagem_url`, nem o CDN da TCGdex têm o
 * arquivo. Aparece exatamente onde hoje `ImagemCartaComZoom` não
 * renderiza nada — pedido explícito: "no lugar onde hoje não aparece
 * nada, um controle discreto que abre um diálogo para escolher arquivo
 * ou colar link".
 *
 * Envia para `POST /api/imagens-locais/[cartaId]/[idioma]` (`idioma` =
 * idioma do CATÁLOGO, `copia.idiomaCatalogo` — a imagem pertence à carta
 * do catálogo, não à cópia física). Uma vez enviada, a carta passa a
 * mostrar a imagem em toda cópia dela (prioridade máxima na cadeia de
 * `imagemDaCarta`, lib/db/consultas.ts) — o chamador recarrega a lista
 * (`onEnviada`) para refletir isso.
 *
 * Terceiro modo, de 2026-08-29: **mapear o set no mypcards**. Fotografar
 * carta a carta não escala quando o set inteiro está sem foto no catálogo
 * (as 8 energias de Megaevolução, os 88 promos de MEP). O mypcards tem
 * essas fotos, mas o id do set é interno deles e as páginas estão atrás
 * do challenge do Cloudflare — nenhum cliente que não seja navegador lê
 * de lá. Então o gesto é: ele abre o set no navegador, copia o endereço
 * de qualquer imagem e cola aqui. Um paste mapeia o set e dispara o
 * download de tudo o que falta nele. Ver `lib/dominio/mypcards.ts`.
 */

import { useState } from "react";

import type { Idioma } from "@/lib/dominio/enums";
import { Botao } from "./botao";
import { Campo, classesEntrada } from "./campo";
import { Modal } from "./modal";

type Modo = "arquivo" | "link" | "mypcards";

export function AdicionarImagemLocal({
  cartaId,
  idiomaCatalogo,
  cartaNome,
  setId,
  onEnviada,
  jaTemImagemPropria = false,
}: {
  cartaId: string;
  idiomaCatalogo: Idioma;
  cartaNome: string;
  /**
   * Set da carta — habilita o modo "mypcards", que resolve o set inteiro
   * de uma vez. Opcional: sem ele o diálogo é o de antes, só arquivo e
   * link. Nunca derivado de `cartaId` por corte de string: id de set tem
   * ponto e dígito (`swsh4.5sv`, `sv03.5`) e carta manual usa outro
   * formato — errar aqui gravaria o número no set errado.
   */
  setId?: string;
  onEnviada: () => void;
  /**
   * A carta já mostra uma imagem que o usuário forneceu. Muda o
   * gatilho de "+ foto" para "trocar" e libera a remoção — imagem do
   * catálogo não é dele para mexer, a que ele enviou é.
   */
  jaTemImagemPropria?: boolean;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="whitespace-nowrap text-xs text-accent hover:underline"
        title={
          jaTemImagemPropria
            ? `Trocar ou remover a imagem de ${cartaNome}`
            : `Sem imagem no catálogo — adicionar foto de ${cartaNome}`
        }
      >
        {jaTemImagemPropria ? "trocar" : "+ foto"}
      </button>
      {aberto && (
        <ModalAdicionarImagem
          cartaId={cartaId}
          idiomaCatalogo={idiomaCatalogo}
          cartaNome={cartaNome}
          setId={setId}
          jaTemImagemPropria={jaTemImagemPropria}
          onFechar={() => setAberto(false)}
          onEnviada={() => {
            setAberto(false);
            onEnviada();
          }}
        />
      )}
    </>
  );
}

function ModalAdicionarImagem({
  cartaId,
  idiomaCatalogo,
  cartaNome,
  setId,
  jaTemImagemPropria,
  onFechar,
  onEnviada,
}: {
  cartaId: string;
  idiomaCatalogo: Idioma;
  cartaNome: string;
  setId?: string;
  jaTemImagemPropria: boolean;
  onFechar: () => void;
  onEnviada: () => void;
}) {
  const [modo, setModo] = useState<Modo>("arquivo");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function remover() {
    setErro(null);
    setRemovendo(true);
    try {
      const resp = await fetch(
        `/api/imagens-locais/${encodeURIComponent(cartaId)}/${idiomaCatalogo}`,
        { method: "DELETE" },
      );
      if (!resp.ok) {
        const dados = await resp.json().catch(() => ({}));
        setErro(dados.erro ?? "Falha ao remover a imagem.");
        return;
      }
      onEnviada();
    } catch {
      setErro("Falha de rede ao remover a imagem.");
    } finally {
      setRemovendo(false);
    }
  }

  async function mapearSet() {
    if (!setId) return;
    setEnviando(true);
    try {
      const resp = await fetch("/api/sets-mypcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setId, url: url.trim() }),
      });
      const dados = await resp.json();
      if (!resp.ok) {
        setErro(dados.erro ?? "Falha ao mapear o set.");
        return;
      }
      // O download roda em segundo plano (ver a rota): dizer "pronto"
      // aqui seria mentira, e dizer só "ok" deixaria ele sem saber
      // quando olhar de novo.
      setAviso(
        dados.cartasNaFila > 0
          ? `Set mapeado. Baixando ${dados.cartasNaFila} foto(s) em segundo plano — recarregue em instantes.`
          : "Set mapeado. Nenhuma carta deste set estava sem foto.",
      );
    } catch {
      setErro("Falha de rede ao mapear o set.");
    } finally {
      setEnviando(false);
    }
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);

    if (modo === "mypcards") {
      if (!url.trim()) {
        setErro("Cole o endereço de uma imagem do set no mypcards.");
        return;
      }
      await mapearSet();
      return;
    }

    const formData = new FormData();
    if (modo === "arquivo") {
      if (!arquivo) {
        setErro("Escolha um arquivo de imagem.");
        return;
      }
      formData.set("arquivo", arquivo);
    } else {
      if (!url.trim()) {
        setErro("Cole o link da imagem.");
        return;
      }
      formData.set("url", url.trim());
    }

    setEnviando(true);
    try {
      const resp = await fetch(
        `/api/imagens-locais/${encodeURIComponent(cartaId)}/${idiomaCatalogo}`,
        { method: "POST", body: formData },
      );
      const dados = await resp.json();
      if (!resp.ok) {
        setErro(dados.erro ?? "Falha ao enviar a imagem.");
        return;
      }
      onEnviada();
    } catch {
      setErro("Falha de rede ao enviar a imagem.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal as="form" onSubmit={enviar}>
      <h2 className="font-medium text-foreground">
        {jaTemImagemPropria ? "Trocar imagem" : "Adicionar imagem"} — {cartaNome}
      </h2>
      <p className="text-muted">
        {jaTemImagemPropria
          ? "Esta carta usa uma imagem que você enviou. Envie outra para substituir, ou remova para voltar ao que o catálogo oferece."
          : "Esta carta não tem imagem no catálogo. Envie um arquivo ou cole um link — a imagem fica salva no sistema e passa a valer para toda cópia desta carta."}
      </p>

      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="modo"
            checked={modo === "arquivo"}
            onChange={() => setModo("arquivo")}
          />
          Arquivo
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="modo"
            checked={modo === "link"}
            onChange={() => setModo("link")}
          />
          Link (URL)
        </label>
        {setId && (
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="modo"
              checked={modo === "mypcards"}
              onChange={() => setModo("mypcards")}
            />
            Set inteiro (mypcards)
          </label>
        )}
      </div>

      {modo === "mypcards" ? (
        <Campo
          rotulo={`Link de qualquer imagem do set ${setId} no mypcards`}
          ajuda="Abra o set no mypcards, clique com o botão direito numa carta e copie o endereço da imagem. Um link resolve o set inteiro: o sistema lê o id do set e baixa todas as fotos que faltam nele."
        >
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://img.mypcards.com/…/pokemon_mee_004_pt.jpg"
            className={classesEntrada}
          />
        </Campo>
      ) : modo === "arquivo" ? (
        <Campo rotulo="Arquivo de imagem" ajuda="JPEG, PNG ou WEBP, até 8 MB.">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            className={classesEntrada}
          />
        </Campo>
      ) : (
        <Campo rotulo="Link da imagem" ajuda="O servidor baixa e guarda o arquivo — não só o link.">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className={classesEntrada}
          />
        </Campo>
      )}

      {erro && <p className="text-danger">{erro}</p>}
      {aviso && <p className="text-muted">{aviso}</p>}

      <div className="flex items-center justify-end gap-2 pt-2">
        {jaTemImagemPropria && (
          // À esquerda e separado dos outros dois: remover é a ação
          // destrutiva do diálogo, não deve ficar encostada no botão que
          // o dedo procura por padrão.
          <Botao
            type="button"
            variante="secundario"
            onClick={remover}
            disabled={removendo || enviando}
            className="mr-auto"
          >
            {removendo ? "Removendo…" : "Remover imagem"}
          </Botao>
        )}
        <Botao type="button" variante="secundario" onClick={onFechar}>
          Cancelar
        </Botao>
        <Botao type="submit" variante="primario" disabled={enviando}>
          {enviando
            ? modo === "mypcards"
              ? "Mapeando…"
              : "Enviando…"
            : modo === "mypcards"
              ? "Mapear set"
              : "Salvar imagem"}
        </Botao>
      </div>
    </Modal>
  );
}
