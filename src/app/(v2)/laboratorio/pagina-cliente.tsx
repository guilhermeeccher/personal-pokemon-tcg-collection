"use client";

import { Check, Info, Sparkles, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { InterruptorModoLeve, useModoLeve } from "../_componentes/casca/efeitos";
import { decidirRefracao } from "../_componentes/casca/refracao";
import { useEscolhaModo } from "../_componentes/movimento/use-movimento";
import { useAviso } from "../_componentes/primitivos/aviso-flutuante";
import { Botao, BotaoLink } from "../_componentes/primitivos/botao";
import { AreaTexto, Campo, Selecao } from "../_componentes/primitivos/campo";
import { useConfirmacao } from "../_componentes/primitivos/dialogo-confirmacao";
import { Modal } from "../_componentes/primitivos/modal";
import { AvisoEmLinha, Painel } from "../_componentes/primitivos/painel";
import { Segmentado } from "../_componentes/primitivos/segmentado";
import estilos from "./laboratorio.module.css";
import { type ParametrosDetalhe, SecaoDetalhe } from "./secao-detalhe";

/* Tons de luz ambiente para conferir a transição de cor registrada por
   `@property`. Cores soltas, não dado de carta. */
const TONS = {
  padrao: ["#ff6a3d", "#7b4dff", "#2f7bff"],
  fogo: ["#ff7a2f", "#ff3d5a", "#ffb02f"],
  agua: ["#2fa8ff", "#3d6bff", "#2fe0d0"],
  planta: ["#3ddc84", "#9be15d", "#1fa67a"],
} as const;
type Tom = keyof typeof TONS;

const assinarNada = () => () => {};

function Secao({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section className={estilos.secao} aria-labelledby={id}>
      <h2 id={id} className={estilos.tituloSecao}>
        {titulo}
      </h2>
      {children}
    </section>
  );
}

export function PaginaCliente({ detalhe }: { detalhe: ParametrosDetalhe }) {
  const t = useTranslations("v2Laboratorio");
  const tDetalhe = useTranslations("v2Detalhe.laboratorio");
  const avisar = useAviso();
  const { confirmar, dialogo } = useConfirmacao();

  // Modo leve: o interruptor real (o mesmo da futura tela de Ajustes); quem
  // escreve o atributo é a casca.
  const { escolha, decisao, definir } = useEscolhaModo();
  const modoLeve = useModoLeve();

  const [tom, setTom] = useState<Tom>("padrao");
  useEffect(() => {
    const html = document.documentElement;
    const [a1, a2, a3] = TONS[tom];
    html.style.setProperty("--v2-a1", a1);
    html.style.setProperty("--v2-a2", a2);
    html.style.setProperty("--v2-a3", a3);
    return () => {
      for (const p of ["--v2-a1", "--v2-a2", "--v2-a3"]) html.style.removeProperty(p);
    };
  }, [tom]);

  // Lido na renderização depois de montar (no servidor não há `window`).
  const montado = useSyncExternalStore(
    assinarNada,
    () => true,
    () => false,
  );
  const marcas = montado
    ? (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands
    : undefined;
  const refracao = montado
    ? t("refracaoEstado", {
        seguro: String(window.isSecureContext),
        chromium: String(Boolean(marcas?.some((m) => m.brand === "Chromium"))),
        leve: String(modoLeve),
        ligada: String(decidirRefracao({ contextoSeguro: window.isSecureContext, marcas, modoLeve })),
      })
    : "—";

  const [segmento, setSegmento] = useState<"fichario" | "inteiro" | "falta">("fichario");
  const [grade, setGrade] = useState<"3" | "4" | "5" | "6">("3");
  const [nome, setNome] = useState("");

  const [modalSimples, setModalSimples] = useState(false);
  const [modalLongo, setModalLongo] = useState(false);
  const [modalPilha, setModalPilha] = useState(false);
  const [balaoNaPilha, setBalaoNaPilha] = useState(false);

  // Retorno de foco a um alvo que saiu do DOM (o caso da grade virtual).
  const [origens, setOrigens] = useState(["a", "b", "c"]);
  const [aberturaDaOrigem, setAberturaDaOrigem] = useState<string | null>(null);
  const [focoFinal, setFocoFinal] = useState("—");
  const resolverDaOrigem = useRef<() => HTMLElement | null>(() => null);

  async function excluir() {
    const ok = await confirmar({
      titulo: t("confirmarTitulo"),
      descricao: t("confirmarDescricao"),
      rotuloConfirmar: t("confirmarAcao"),
      perigoso: true,
    });
    avisar(ok ? t("confirmado") : t("cancelado"), { tom: ok ? "sucesso" : "neutro" });
  }

  function anotarFoco() {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = document.activeElement;
        setFocoFinal(el ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} “${(el.textContent ?? "").trim().slice(0, 24)}”` : "—");
      }),
    );
  }

  return (
    <div className={estilos.tela}>
      <header className={estilos.cabecalho}>
        <p className={estilos.sobre}>{t("sobre")}</p>
        <h1 className={estilos.titulo}>{t("titulo")}</h1>
        <p className={estilos.texto}>{t("intro")}</p>
      </header>

      <Secao id="lab-detalhe" titulo={tDetalhe("titulo")}>
        <SecaoDetalhe parametros={detalhe} />
      </Secao>

      <Secao id="lab-tokens" titulo={t("tokens")}>
        <div className={estilos.amostras}>
          {["--v2-fundo", "--v2-tinta", "--v2-tinta-2", "--v2-tinta-3", "--v2-falta", "--v2-livre", "--v2-perigo", "--v2-foco"].map(
            (v) => (
              <div key={v} className={estilos.amostra}>
                <span className={estilos.cor} style={{ background: `var(${v})` }} />
                <code className="v2-num">{v}</code>
              </div>
            ),
          )}
          <div className={estilos.amostra}>
            <span className={estilos.cor} style={{ background: "var(--v2-iris)" }} />
            <code className="v2-num">--v2-iris</code>
          </div>
        </div>
        <div className={estilos.tipos}>
          <span className={estilos.display}>{t("amostraDisplay")}</span>
          <span>{t("amostraUi")}</span>
          <span className="v2-num">1.025 · 48,30 € · 87%</span>
        </div>
        <Segmentado
          rotulo={t("luzAmbiente")}
          valor={tom}
          aoMudar={setTom}
          opcoes={(Object.keys(TONS) as Tom[]).map((k) => ({ valor: k, rotulo: t(`tons.${k}`) }))}
        />
      </Secao>

      <Secao id="lab-botoes" titulo={t("botoes")}>
        <div className={estilos.linha}>
          <Botao variante="primario" icone={<Check aria-hidden />}>
            {t("primario")}
          </Botao>
          <Botao>{t("secundario")}</Botao>
          <Botao variante="fantasma">{t("fantasma")}</Botao>
          <Botao variante="perigo" icone={<Trash2 aria-hidden />}>
            {t("perigo")}
          </Botao>
          <Botao variante="iris" icone={<Sparkles aria-hidden />}>
            {t("iris")}
          </Botao>
        </div>
        <div className={estilos.linha}>
          <Botao pequeno>{t("pequeno")}</Botao>
          <Botao soIcone aria-label={t("soIcone")} icone={<Info aria-hidden />} />
          <Botao carregando>{t("carregando")}</Botao>
          <Botao disabled>{t("desligado")}</Botao>
          <BotaoLink href="/colecoes" variante="secundario">
            {t("link")}
          </BotaoLink>
        </div>
      </Secao>

      <Secao id="lab-campos" titulo={t("campos")}>
        <div className={estilos.grade2}>
          <Campo rotulo={t("campoNome")} placeholder={t("campoNomeExemplo")} value={nome} onChange={(e) => setNome(e.target.value)} />
          <Campo rotulo={t("campoComDica")} dica={t("campoDica")} inputMode="numeric" defaultValue="12" />
          <Campo rotulo={t("campoComErro")} erro={t("campoErro")} defaultValue="abc" />
          <Campo rotulo={t("campoDesligado")} disabled defaultValue="—" />
          <Selecao rotulo={t("selecao")} defaultValue="pt">
            <option value="pt">PT</option>
            <option value="en">EN</option>
            <option value="jp">JP</option>
          </Selecao>
          <AreaTexto rotulo={t("areaTexto")} placeholder={t("areaTextoExemplo")} />
        </div>
      </Secao>

      <Secao id="lab-paineis" titulo={t("paineis")}>
        <div className={estilos.grade2}>
          <Painel>
            <b>{t("painel")}</b>
            <p className={estilos.texto}>{t("painelTexto")}</p>
          </Painel>
          <AvisoEmLinha tom="iris" icone={<Sparkles aria-hidden />} titulo={t("avisoIris")} acao={<Botao pequeno>{t("acao")}</Botao>}>
            {t("avisoTexto")}
          </AvisoEmLinha>
          <AvisoEmLinha tom="sucesso" icone={<Check aria-hidden />} titulo={t("avisoSucesso")}>
            {t("avisoTexto")}
          </AvisoEmLinha>
          <AvisoEmLinha tom="alerta" icone={<Info aria-hidden />} titulo={t("avisoAlerta")}>
            {t("avisoTexto")}
          </AvisoEmLinha>
          <AvisoEmLinha tom="perigo" icone={<Info aria-hidden />} titulo={t("avisoPerigo")}>
            {t("avisoTexto")}
          </AvisoEmLinha>
        </div>
      </Secao>

      <Secao id="lab-segmentado" titulo={t("segmentado")}>
        <Segmentado
          rotulo={t("segmentadoAbas")}
          papel="abas"
          valor={segmento}
          aoMudar={setSegmento}
          opcoes={[
            { valor: "fichario", rotulo: t("fichario"), contagem: 9 },
            { valor: "inteiro", rotulo: t("inteiro"), contagem: 165 },
            { valor: "falta", rotulo: t("falta"), contagem: 21 },
          ]}
        />
        <Segmentado
          rotulo={t("segmentadoGrade")}
          pequeno
          valor={grade}
          aoMudar={setGrade}
          opcoes={(["3", "4", "5", "6"] as const).map((g) => ({ valor: g, rotulo: `${g}×${g}` }))}
        />
        <Segmentado
          rotulo={t("segmentadoLargo")}
          largo
          valor={segmento}
          aoMudar={setSegmento}
          opcoes={[
            { valor: "fichario", rotulo: t("fichario") },
            { valor: "inteiro", rotulo: t("inteiro") },
            { valor: "falta", rotulo: t("falta"), desabilitada: true },
          ]}
        />
      </Secao>

      <Secao id="lab-avisos" titulo={t("avisosFlutuantes")}>
        <div className={estilos.linha}>
          <Botao onClick={() => avisar(t("avisoNeutro"))}>{t("disparar", { tom: t("neutro") })}</Botao>
          <Botao onClick={() => avisar(t("avisoOk"), { tom: "sucesso" })}>{t("disparar", { tom: t("sucesso") })}</Botao>
          <Botao onClick={() => avisar(t("avisoErro"), { tom: "erro" })}>{t("disparar", { tom: t("erro") })}</Botao>
        </div>
      </Secao>

      <Secao id="lab-camadas" titulo={t("camadas")}>
        <p className={estilos.texto}>{t("camadasTexto")}</p>
        <div className={estilos.linha}>
          <Botao onClick={() => setModalSimples(true)}>{t("abrirSimples")}</Botao>
          <Botao onClick={() => setModalLongo(true)}>{t("abrirLongo")}</Botao>
          <Botao onClick={() => setModalPilha(true)}>{t("abrirPilha")}</Botao>
          <Botao variante="perigo" icone={<Trash2 aria-hidden />} onClick={excluir}>
            {t("abrirConfirmacao")}
          </Botao>
        </div>

        <h3 className={estilos.subtitulo}>{t("focoTitulo")}</h3>
        <p className={estilos.texto}>{t("focoTexto")}</p>
        <div className={estilos.linha}>
          {origens.map((o) => (
            <Botao
              key={o}
              id={`lab-origem-${o}`}
              onClick={() => {
                resolverDaOrigem.current = () => document.getElementById(`lab-origem-${o}`);
                setAberturaDaOrigem(o);
              }}
            >
              {t("origem", { nome: o.toUpperCase() })}
            </Botao>
          ))}
          <Botao variante="fantasma" onClick={() => setOrigens(["a", "b", "c"])}>
            {t("repor")}
          </Botao>
        </div>
        <p className={estilos.texto}>
          {t("focoFinal")} <code className="v2-num">{focoFinal}</code>
        </p>
      </Secao>

      <Secao id="lab-efeitos" titulo={t("efeitos")}>
        <InterruptorModoLeve escolha={escolha} efetivo={decisao.modo} aoEscolher={definir} />
        <p className={estilos.texto}>{t("efeitosTexto")}</p>
        <p className={estilos.texto}>
          <code className="v2-num">{refracao}</code>
        </p>
      </Secao>

      <Secao id="lab-rolagem" titulo={t("rolagem")}>
        <p className={estilos.texto}>{t("rolagemTexto")}</p>
        <ol className={estilos.lista}>
          {Array.from({ length: 30 }, (_, i) => (
            <li key={i} className="v2-painel">
              {t("linha", { n: i + 1 })}
            </li>
          ))}
        </ol>
      </Secao>

      <Modal
        aberto={modalSimples}
        onFechar={() => setModalSimples(false)}
        titulo={t("simplesTitulo")}
        descricao={t("simplesDescricao")}
        rodape={
          <>
            <Botao variante="fantasma" onClick={() => setModalSimples(false)}>
              {t("cancelar")}
            </Botao>
            <Botao variante="primario" onClick={() => setModalSimples(false)}>
              {t("salvar")}
            </Botao>
          </>
        }
      >
        <div className={estilos.grade1}>
          <Campo rotulo={t("campoNome")} placeholder={t("campoNomeExemplo")} />
          <Selecao rotulo={t("selecao")} defaultValue="pt">
            <option value="pt">PT</option>
            <option value="en">EN</option>
          </Selecao>
        </div>
      </Modal>

      <Modal
        aberto={modalLongo}
        onFechar={() => setModalLongo(false)}
        titulo={t("longoTitulo")}
        largura={640}
        rodape={
          <Botao variante="primario" onClick={() => setModalLongo(false)}>
            {t("entendi")}
          </Botao>
        }
      >
        {Array.from({ length: 24 }, (_, i) => (
          <p key={i} className={estilos.texto}>
            {t("linha", { n: i + 1 })} — {t("longoTexto")}
          </p>
        ))}
      </Modal>

      <Modal aberto={modalPilha} onFechar={() => setModalPilha(false)} titulo={t("pilhaTitulo")} descricao={t("pilhaDescricao")}>
        <div className={estilos.linha}>
          <Botao onClick={() => setBalaoNaPilha(true)}>{t("abrirPorCima")}</Botao>
          <Botao variante="perigo" onClick={excluir}>
            {t("abrirConfirmacao")}
          </Botao>
        </div>
      </Modal>
      <Modal aberto={balaoNaPilha} onFechar={() => setBalaoNaPilha(false)} titulo={t("porCimaTitulo")} nivel="detalhe">
        <p className={estilos.texto}>{t("porCimaTexto")}</p>
      </Modal>

      <Modal
        aberto={aberturaDaOrigem !== null}
        onFechar={() => {
          setAberturaDaOrigem(null);
          anotarFoco();
        }}
        titulo={t("origemTitulo", { nome: (aberturaDaOrigem ?? "").toUpperCase() })}
        devolverFocoPara={() => resolverDaOrigem.current()}
        rodape={
          <Botao
            variante="perigo"
            onClick={() => {
              setOrigens((lista) => lista.filter((o) => o !== aberturaDaOrigem));
              setAberturaDaOrigem(null);
              anotarFoco();
            }}
          >
            {t("removerOrigem")}
          </Botao>
        }
      >
        <p className={estilos.texto}>{t("origemTexto")}</p>
      </Modal>

      {dialogo}
    </div>
  );
}
