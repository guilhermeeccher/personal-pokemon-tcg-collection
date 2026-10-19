/**
 * Ícones do PWA (`/pwa/icone-180.png` e os outros três). Só existe com
 * `ACESSO_COM_SENHA=1`; desligado, `rotaDoModulo` responde 404 **antes** de
 * qualquer leitura de disco. É só leitura: não escreve nada.
 *
 * Por que rota e não arquivo estático: um PNG em `public/` ou importado como
 * módulo viraria cópia em `/_next/static/`, servida mesmo com o módulo
 * desligado — uma exceção ao "desligado, nada muda". Por isso o genérico é
 * lido com `fs` em tempo de execução e **nunca** importado. A imagem Docker
 * copia o repositório inteiro (`COPY . .`, `WORKDIR /app`, sem `standalone`),
 * então o arquivo está lá.
 *
 * Fonte: `PWA_ICONES_DIR` (pasta da instalação, montada só leitura) quando
 * ela tem o arquivo; senão o genérico daquele arquivo. O nome usado em disco
 * é sempre o da constante `ICONES_PWA`, escolhido por igualdade — nada vindo
 * da URL chega a `path.join`.
 *
 * `no-store`: desligar o módulo tem de valer na hora, e um navegador não
 * pode reaproveitar o PNG de quando estava ligado. Isso não remove o ícone de
 * um app que já foi instalado no iPhone: a cópia é do aparelho.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { rotaDoModulo } from "@/lib/acesso";
import {
  escolherIcone,
  nomeIconeConhecido,
  type LeituraPasta,
  type NomeIconePwa,
} from "@/lib/pwa/escolha-icone";

/* `force-dynamic`: mesmo motivo do manifesto — sem ele o build congela o 404
   do módulo desligado. */
export const dynamic = "force-dynamic";

const PASTA_GENERICOS = path.join("src", "lib", "pwa", "icones-genericos");

/** Quem já foi avisado, em `globalThis`: o módulo pode ser avaliado de novo
 *  (HMR, mais de um bundle) e o aviso é uma vez por arquivo, não por carga. */
const global = globalThis as typeof globalThis & { __pwaIconesAvisados?: Set<NomeIconePwa> };
const jaAvisados = (global.__pwaIconesAvisados ??= new Set<NomeIconePwa>());

async function lerDaPasta(pasta: string, nome: NomeIconePwa): Promise<LeituraPasta> {
  try {
    return { estado: "ok", bytes: await readFile(path.join(pasta, nome)) };
  } catch (erro) {
    return (erro as NodeJS.ErrnoException).code === "ENOENT" ? { estado: "ausente" } : { estado: "erro" };
  }
}

export const GET = rotaDoModulo(async (_req: Request, contexto: { params: Promise<{ arquivo: string }> }) => {
  const nome = nomeIconeConhecido((await contexto.params).arquivo);
  if (nome === null) return new Response(null, { status: 404 });

  const pasta = process.env.PWA_ICONES_DIR;
  const escolha = await escolherIcone({
    nome,
    pasta,
    lerDaPasta: (n) => lerDaPasta((pasta ?? "").trim(), n),
    lerGenerico: (n) => readFile(path.join(process.cwd(), PASTA_GENERICOS, n)),
    jaAvisados,
  });
  // Sem o caminho da pasta: o log é de quem instalou, mas a resposta não é.
  if (escolha.avisar) {
    console.warn(`[pwa] ${nome} não encontrado ou ilegível em PWA_ICONES_DIR; servindo o ícone genérico.`);
  }

  return new Response(Buffer.from(escolha.bytes), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
});
