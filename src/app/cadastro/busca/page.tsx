"use client";

import { useState } from "react";

import {
  CONDICOES,
  IDIOMAS,
  type Condicao,
  type Idioma,
  type VarianteCopia,
} from "@/lib/dominio/enums";
import { variantesDisponiveis } from "@/lib/dominio/variantes-catalogo";
import { parseSiglaNumero } from "@/lib/dominio/busca-carta";
import { CadastrarCartaManual } from "@/app/_componentes/cadastrar-carta-manual";
import { Botao } from "@/app/_componentes/botao";
import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { Distintivo } from "@/app/_componentes/distintivo";
import { Campo, classesEntrada } from "@/app/_componentes/campo";
import { ImagemCartaComZoom } from "@/app/_componentes/imagem-carta-zoom";
import { Painel } from "@/app/_componentes/painel";
import type { CartaEncontradaDTO } from "@/lib/dominio/tipos-cliente";
import { NomeCarta } from "@/app/_componentes/nome-carta";

interface FormularioCopia {
  quantidade: number;
  variante: VarianteCopia;
  idioma: Idioma;
  condicao: Condicao;
  localizacao: string;
}

const FORM_INICIAL: FormularioCopia = {
  quantidade: 1,
  variante: "normal",
  idioma: "pt",
  condicao: "NM",
  localizacao: "",
};

export default function CadastroPorBuscaPage() {
  const [nome, setNome] = useState("");
  const [setId, setSetId] = useState("");
  const [numero, setNumero] = useState("");
  const [resultados, setResultados] = useState<CartaEncontradaDTO[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Busca rápida "sigla + número" (ex.: "MEW 151", "mew151") — resolve
  // direto na carta quando há um único candidato; senão cai na lista de
  // resultados normal, como pedido ("mostre as candidatas em vez de
  // escolher por conta").
  const [siglaNumero, setSiglaNumero] = useState("");
  const [buscandoRapido, setBuscandoRapido] = useState(false);

  const [cartaSelecionada, setCartaSelecionada] = useState<CartaEncontradaDTO | null>(null);
  const [form, setForm] = useState<FormularioCopia>(FORM_INICIAL);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() && !setId.trim() && !numero.trim()) {
      setErro("Informe ao menos um critério: nome, set ou número.");
      return;
    }
    setBuscando(true);
    setErro(null);
    setMensagem(null);
    try {
      const params = new URLSearchParams();
      if (nome.trim()) params.set("nome", nome.trim());
      if (setId.trim()) params.set("set", setId.trim());
      if (numero.trim()) params.set("numero", numero.trim());
      const resp = await fetch(`/api/cartas?${params.toString()}`);
      const dados = await resp.json();
      setResultados(dados.cartas);
    } catch {
      setErro("Falha na busca.");
    } finally {
      setBuscando(false);
    }
  }

  async function buscarRapidoPorSigla(e: React.FormEvent) {
    e.preventDefault();
    const parseado = parseSiglaNumero(siglaNumero);
    if (!parseado) {
      setErro('Não entendi como "sigla + número" — ex.: "MEW 151" ou "mew151".');
      return;
    }
    setBuscandoRapido(true);
    setErro(null);
    setMensagem(null);
    try {
      const params = new URLSearchParams({ sigla: parseado.sigla, numero: parseado.numero });
      const resp = await fetch(`/api/cartas?${params.toString()}`);
      const dados = await resp.json();
      const encontradas: CartaEncontradaDTO[] = dados.cartas ?? [];
      if (encontradas.length === 1) {
        // Resolve direto na carta — só 1 candidata, não precisa passar
        // pela lista de resultados.
        setResultados(null);
        escolherCarta(encontradas[0]);
      } else {
        // 0 ou 2+: mostra como candidatas na lista normal, nunca escolhe
        // por conta.
        setResultados(encontradas);
      }
    } catch {
      setErro("Falha na busca.");
    } finally {
      setBuscandoRapido(false);
    }
  }

  function escolherCarta(carta: CartaEncontradaDTO) {
    setCartaSelecionada(carta);
    // Nunca abre o formulário com uma variante que a carta não tem — cai
    // para a primeira disponível segundo o catálogo (mesma regra do
    // cadastro por set, ver lib/dominio/variantes-catalogo.ts).
    const disponiveis = variantesDisponiveis(carta);
    setForm({
      ...FORM_INICIAL,
      variante: disponiveis.includes(FORM_INICIAL.variante) ? FORM_INICIAL.variante : disponiveis[0],
    });
    setMensagem(null);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!cartaSelecionada) return;
    setSalvando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/copias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cartaId: cartaSelecionada.cartaId,
          idiomaCatalogo: cartaSelecionada.idiomaCatalogo,
          idioma: form.idioma,
          variante: form.variante,
          quantidade: form.quantidade,
          condicao: form.condicao,
          localizacao: form.localizacao || undefined,
        }),
      });
      const dados = await resp.json();
      if (!resp.ok) {
        setErro(dados.erro ?? "Falha ao gravar a cópia.");
        return;
      }
      // "somada" e "gravada" são resultados diferentes: esconder a
      // distinção faria o cadastro parecer perdido quando ele some numa
      // linha que já existia.
      setMensagem(
        dados.fundida
          ? `Somada à cópia que você já tinha de ${cartaSelecionada.nome} — agora são ${dados.quantidadeFinal}.`
          : `Cópia de ${cartaSelecionada.nome} gravada.`,
      );
      setCartaSelecionada(null);
    } catch {
      setErro("Falha de rede ao gravar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-8">
      <CabecalhoPagina titulo="Cadastro por busca" descricao="Para carta avulsa: busque por nome, set ou número." />

      <form onSubmit={buscar} className="flex flex-wrap items-end gap-3">
        <Campo rotulo="Nome">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="ex.: Charizard"
            className={classesEntrada}
          />
        </Campo>
        <Campo rotulo="Set (id ou nome)">
          <input
            value={setId}
            onChange={(e) => setSetId(e.target.value)}
            placeholder="ex.: base1 ou Base Set"
            className={classesEntrada}
          />
        </Campo>
        <Campo rotulo="Número">
          <input
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="ex.: 4"
            className={`w-24 ${classesEntrada}`}
          />
        </Campo>
        <Botao type="submit" variante="primario" disabled={buscando}>
          {buscando ? "Buscando…" : "Buscar"}
        </Botao>
      </form>

      <form onSubmit={buscarRapidoPorSigla} className="flex flex-wrap items-end gap-3">
        <Campo rotulo="Ou direto pela sigla impressa na carta + número">
          <input
            value={siglaNumero}
            onChange={(e) => setSiglaNumero(e.target.value)}
            placeholder='ex.: "MEW 151" ou "mew151"'
            className={`w-56 ${classesEntrada}`}
          />
        </Campo>
        <Botao type="submit" variante="secundario" disabled={buscandoRapido}>
          {buscandoRapido ? "Buscando…" : "Resolver"}
        </Botao>
      </form>

      {erro && <p className="text-sm text-danger">{erro}</p>}
      {mensagem && <p className="text-sm text-success-fg">{mensagem}</p>}

      {/* Busca sem resultado ficava MUDA (achado do redesign, no backlog
          desde 2026-08-25). Agora diz que não achou e oferece a saída:
          cadastrar a carta à mão, pré-preenchida com o que ele digitou —
          é exatamente aqui que se descobre que a TCGdex não tem a carta. */}
      {resultados && resultados.length === 0 && (
        <div className="flex flex-col items-start gap-3 rounded border border-line bg-surface p-4">
          <div>
            <p className="font-medium text-foreground">Nenhuma carta encontrada.</p>
            <p className="text-sm text-muted">
              Confira a sigla e o número impressos na carta. Se ela realmente não estiver no
              catálogo — acontece com sets japoneses e promocionais que a TCGdex não cataloga —
              cadastre à mão.
            </p>
          </div>
          <CadastrarCartaManual
            siglaSugerida={parseSiglaNumero(siglaNumero)?.sigla ?? setId}
            numeroSugerido={parseSiglaNumero(siglaNumero)?.numero ?? numero}
            nomeSugerido={nome}
            onCriada={(cartaId) => {
              setErro(null);
              setNome("");
              setSiglaNumero("");
              setSetId(cartaId.split("-")[0]);
              setNumero(cartaId.split("-").slice(1).join("-"));
            }}
          />
        </div>
      )}

      {resultados && resultados.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">{resultados.length} resultado(s).</p>
          <ul className="divide-y divide-hairline">
            {resultados.map((carta) => {
              return (
                <li key={`${carta.cartaId}-${carta.idiomaCatalogo}`} className="flex items-center gap-3 py-2">
                  <ImagemCartaComZoom
                    imagemUrl={carta.imagemUrl}
                    origem={carta.imagemOrigem}
                    alt={carta.nome}
                    width={40}
                    height={55}
                    className="rounded-tcg"
                  />
                  <div className="flex-1 text-sm">
                    <div className="font-medium">
                      <NomeCarta nome={carta.nome} nomeEspecie={carta.nomeEspecie} />
                      {carta.qtdPossuida > 0 && (
                        <Distintivo tom="aviso" className="ml-2">
                          já tem {carta.qtdPossuida}
                        </Distintivo>
                      )}
                    </div>
                    <div className="text-muted">
                      {carta.setNome} · #{carta.localId} · catálogo {carta.idiomaCatalogo}
                      {carta.raridade ? ` · ${carta.raridade}` : ""}
                    </div>
                  </div>
                  <Botao type="button" variante="secundario" tamanho="sm" onClick={() => escolherCarta(carta)}>
                    Cadastrar cópia
                  </Botao>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {cartaSelecionada && (
        <Painel as="form" onSubmit={salvar} className="flex flex-col gap-3">
          <h2 className="font-medium text-foreground">
            {cartaSelecionada.nome} — {cartaSelecionada.setNome} #{cartaSelecionada.localId}
          </h2>
          <div className="flex flex-wrap gap-4">
            <Campo rotulo="Quantidade">
              <input
                type="number"
                min={1}
                value={form.quantidade}
                onChange={(e) => setForm({ ...form, quantidade: Number(e.target.value) || 1 })}
                className={`w-20 ${classesEntrada}`}
              />
            </Campo>
            <Campo rotulo="Variante">
              <select
                value={form.variante}
                onChange={(e) => setForm({ ...form, variante: e.target.value as VarianteCopia })}
                className={classesEntrada}
              >
                {variantesDisponiveis(cartaSelecionada).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Idioma (físico)">
              <select
                value={form.idioma}
                onChange={(e) => setForm({ ...form, idioma: e.target.value as Idioma })}
                className={classesEntrada}
              >
                {IDIOMAS.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Condição">
              <select
                value={form.condicao}
                onChange={(e) => setForm({ ...form, condicao: e.target.value as Condicao })}
                className={classesEntrada}
              >
                {CONDICOES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Localização">
              <input
                value={form.localizacao}
                onChange={(e) => setForm({ ...form, localizacao: e.target.value })}
                placeholder="ex.: Fichário 1, pág. 3"
                className={classesEntrada}
              />
            </Campo>
          </div>
          <div className="flex gap-2">
            <Botao type="submit" variante="primario" disabled={salvando}>
              {salvando ? "Gravando…" : "Gravar cópia"}
            </Botao>
            <Botao type="button" variante="secundario" onClick={() => setCartaSelecionada(null)}>
              Cancelar
            </Botao>
          </div>
        </Painel>
      )}
    </main>
  );
}
