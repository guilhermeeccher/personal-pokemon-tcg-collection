"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useRef, useState } from "react";

import { ProvedorAvisos } from "../primitivos/aviso-flutuante";
import { Modal } from "../primitivos/modal";
import { ID_CONTEUDO } from "../primitivos/use-camada";
import { ATRIBUTO_POLEGAR, usePolegar } from "../primitivos/use-polegar";
import estilos from "./casca.module.css";
import { useBrilhoVidro, useModoLeve, useRefracao } from "./efeitos";
import { IconeNav, Pokebola } from "./icones";
import { type GrupoNavV2, ITEM_BUSCA, abaAtiva, abasDaBarra, gruposDaNav, itemAtivo } from "./mapa-navegacao";
import { Sair } from "./sair";
import { SeletorIdioma } from "./seletor-idioma";

/** O único caminho que fica sem trilho e sem barra de abas. */
const CAMINHO_SEM_MENU = "/login";

/**
 * A casca da v2. Em todo caminho é a completa, menos em `/login`: quem chega
 * lá não tem sessão, e cada link do menu cairia de volta no login (o mesmo
 * motivo de a v1 esconder o dela). O trilho e as abas são `fixed`, então não
 * dá para escondê-los pelo conteúdo: a escolha é aqui, e os hooks de cada
 * casca ficam no seu componente.
 */
export function Casca(props: { livingDex: boolean; acessoComSenha: boolean; children: ReactNode }) {
  const pathname = usePathname();
  return pathname === CAMINHO_SEM_MENU ? <CascaSemMenu>{props.children}</CascaSemMenu> : <CascaCompleta {...props} />;
}

/**
 * A casca do login: só a luz ambiente, o brilho do vidro e o aviso flutuante
 * em volta do conteúdo, centrado. Sem refração: o único vidro da tela é o
 * cartão, que não é de `data-v2-lente`.
 */
function CascaSemMenu({ children }: { children: ReactNode }) {
  const modoLeve = useModoLeve();
  useBrilhoVidro(modoLeve);
  return (
    <ProvedorAvisos>
      <div className="v2-ambiente" aria-hidden>
        <i />
        <i />
        <i />
        <b />
      </div>
      <main id={ID_CONTEUDO} className={estilos.soConteudo} tabIndex={-1}>
        {children}
      </main>
    </ProvedorAvisos>
  );
}

/**
 * A casca completa: luz ambiente, trilho de vidro (768 px e acima), barra de
 * abas com o botão de busca e a folha "Mais" (abaixo), o conteúdo e a região
 * do aviso flutuante. Recebe do layout, lidas no servidor a cada requisição,
 * as duas flags que mudam o menu: a Living Dex e o acesso por senha ("Sair").
 *
 * O desenho e o porquê de cada regra estão em `casca.module.css`; o mapa,
 * em `mapa-navegacao.ts`.
 */
function CascaCompleta({
  livingDex,
  acessoComSenha,
  children,
}: {
  livingDex: boolean;
  acessoComSenha: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("v2Casca");
  const tNav = useTranslations("nav");
  const pathname = usePathname();
  const grupos = gruposDaNav(livingDex);
  const ativo = itemAtivo(pathname);
  const aba = abaAtiva(pathname, livingDex);
  const [maisAberto, setMaisAberto] = useState(false);
  // Fecha a folha quando a rota muda (um link dela foi seguido). Ajuste de
  // estado na renderização, o padrão do React para estado que depende de
  // outro valor.
  const [rotaDaFolha, setRotaDaFolha] = useState(pathname);
  if (rotaDaFolha !== pathname) {
    setRotaDaFolha(pathname);
    if (maisAberto) setMaisAberto(false);
  }

  const modoLeve = useModoLeve();
  const defs = useRef<SVGDefsElement>(null);
  useBrilhoVidro(modoLeve);
  useRefracao(defs, modoLeve);

  const abas = useRef<HTMLElement>(null);
  const polegar = useRef<HTMLSpanElement>(null);
  const abaComPolegar = maisAberto ? "mais" : aba;
  usePolegar(abas, polegar, abaComPolegar);

  return (
    <ProvedorAvisos>
      <div className="v2-ambiente" aria-hidden>
        <i />
        <i />
        <i />
        <b />
      </div>

      <a href={`#${ID_CONTEUDO}`} className={estilos.pular}>
        {t("pularConteudo")}
      </a>

      <nav className={`${estilos.trilho} v2-vidro`} aria-label={t("navegacao")} data-v2-lente="">
        <div className={estilos.trilhoInterno}>
          <Link href="/" className={estilos.marca}>
            <Pokebola />
            <b>{t("marca")}</b>
          </Link>
          <ListaGrupos grupos={grupos} ativoHref={ativo?.href ?? null} />
          <div className={estilos.rodapeTrilho}>
            <SeletorIdioma />
            {acessoComSenha && <Sair />}
          </div>
        </div>
      </nav>

      <main id={ID_CONTEUDO} className={estilos.conteudo} tabIndex={-1}>
        {children}
      </main>

      <nav ref={abas} className={`${estilos.abas} v2-vidro`} aria-label={t("abas")} data-v2-lente="">
        <span ref={polegar} className={estilos.polegarAbas} aria-hidden />
        {abasDaBarra(livingDex).map(({ aba: nome, item, chaveRotulo, icone }) => (
          <Link
            key={nome}
            href={item.href}
            className={estilos.aba}
            aria-current={aba === nome ? "page" : undefined}
            {...{ [ATRIBUTO_POLEGAR]: abaComPolegar === nome ? "true" : "false" }}
          >
            <IconeNav nome={icone} />
            <span className={estilos.rotuloAba}>{tNav(chaveRotulo)}</span>
          </Link>
        ))}
        <button
          type="button"
          className={estilos.aba}
          aria-expanded={maisAberto}
          aria-haspopup="dialog"
          aria-current={aba === "mais" ? "page" : undefined}
          {...{ [ATRIBUTO_POLEGAR]: abaComPolegar === "mais" ? "true" : "false" }}
          onClick={() => setMaisAberto(true)}
        >
          <IconeNav nome="mais" />
          <span className={estilos.rotuloAba}>{t("mais")}</span>
        </button>
      </nav>
      <Link
        href={ITEM_BUSCA.href}
        className={`${estilos.busca} v2-vidro`}
        aria-label={tNav(ITEM_BUSCA.chave)}
        aria-current={ativo === ITEM_BUSCA ? "page" : undefined}
        data-v2-lente=""
      >
        <IconeNav nome="busca" />
      </Link>

      <Modal aberto={maisAberto} onFechar={() => setMaisAberto(false)} titulo={t("menu")}>
        <div className={estilos.mapa}>
          <ListaGrupos grupos={grupos} ativoHref={ativo?.href ?? null} grade aoNavegar={() => setMaisAberto(false)} />
          <SeletorIdioma />
          {acessoComSenha && <Sair />}
        </div>
      </Modal>

      {/* Onde a refração põe os filtros; vazio fora do Chromium por HTTPS. */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <defs ref={defs} />
      </svg>
    </ProvedorAvisos>
  );
}

function ListaGrupos({
  grupos,
  ativoHref,
  grade = false,
  aoNavegar,
}: {
  grupos: readonly GrupoNavV2[];
  ativoHref: string | null;
  grade?: boolean;
  aoNavegar?: () => void;
}) {
  const tNav = useTranslations("nav");
  return grupos.map((grupo, i) => (
    <div key={grupo.chaveTitulo ?? `grupo-${i}`}>
      {grupo.chaveTitulo && <h3 className={estilos.tituloGrupo}>{tNav(grupo.chaveTitulo)}</h3>}
      <ul className={grade ? estilos.gradeMapa : estilos.grupo}>
        {grupo.itens.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={estilos.item}
              aria-current={item.href === ativoHref ? "page" : undefined}
              onClick={aoNavegar}
            >
              <IconeNav nome={item.icone} />
              {tNav(item.chave)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  ));
}
