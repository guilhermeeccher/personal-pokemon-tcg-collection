import Link from "next/link";
import { useTranslations } from "next-intl";

import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { Icone, type NomeIcone } from "@/app/_componentes/icone";
import { Painel } from "@/app/_componentes/painel";

/* Os mesmos glifos da barra lateral, para o atalho e o item de navegação
   serem reconhecíveis como a mesma coisa. O título e a descrição de cada
   atalho vivem no catálogo de mensagens, sob a chave que está aqui. */
const ATALHOS: readonly { href: string; chave: string; icone: NomeIcone }[] = [
  { href: "/inventario/visao-geral", icone: "chart-pie", chave: "visaoGeral" },
  { href: "/cadastro/set", icone: "grid-2x2", chave: "cadastroSet" },
  { href: "/cadastro/busca", icone: "search", chave: "cadastroBusca" },
  { href: "/inventario", icone: "library", chave: "inventario" },
  { href: "/inventario/repetidas", icone: "copy", chave: "repetidas" },
  { href: "/colecoes", icone: "layers", chave: "colecoes" },
] as const;

export default function Home() {
  const t = useTranslations("home");
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-8">
      <CabecalhoPagina titulo={t("titulo")} descricao={t("descricao")} />
      <div className="grid gap-4 sm:grid-cols-3">
        {ATALHOS.map((a) => (
          <Painel
            key={a.href}
            as={Link}
            href={a.href}
            className="[transition:var(--transition-surface)] hover:-translate-y-0.5 hover:shadow-3"
          >
            <h2 className="flex items-center gap-2 text-[length:var(--fs-title-2)] text-strong">
              <span className="text-accent">
                <Icone nome={a.icone} tamanho={17} />
              </span>
              {t(`atalhos.${a.chave}.titulo`)}
            </h2>
            <p className="mt-1 text-sm text-muted">{t(`atalhos.${a.chave}.descricao`)}</p>
          </Painel>
        ))}
      </div>
    </main>
  );
}
