import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { listarInventarioParaLiga } from "@/lib/db/consultas";
import {
  csvLiga,
  dividirEmArquivos,
  linhaLiga,
  nomeArquivoLiga,
} from "@/lib/dominio/exportacao-liga";
import { montarZip, type EntradaZip } from "@/lib/zip";

/**
 * O arquivo da LigaPokemon é **BOM de UTF-8 seguido de corpo em
 * Latin-1** — combinação estranha, mas é exatamente o que o site deles
 * gera (conferido byte a byte no export de 2026-08-29: `EF BB BF` no
 * início e `Heróis` gravado como `Her\xf3is`).
 *
 * Reproduzimos isso em vez de "corrigir" para UTF-8 puro: o importador
 * deles aceita comprovadamente o que eles mesmos exportam, e essa é a
 * única garantia que temos.
 */
const BOM_UTF8 = new Uint8Array([0xef, 0xbb, 0xbf]);

/**
 * Codifica em Latin-1. Caractere fora da tabela (japonês, emoji, travessão
 * tipográfico) não existe em Latin-1 — vira `?`, e o chamador é avisado
 * pela contagem, para o resumo poder dizer que houve perda.
 */
function paraLatin1(texto: string): { bytes: Uint8Array; substituidos: number } {
  const bytes = new Uint8Array(texto.length);
  let substituidos = 0;
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto.codePointAt(i) ?? 0;
    if (c > 0xff) {
      bytes[i] = 0x3f; // '?'
      substituidos += 1;
    } else {
      bytes[i] = c;
    }
  }
  return { bytes, substituidos };
}

function comBom(bytes: Uint8Array): Uint8Array {
  const saida = new Uint8Array(BOM_UTF8.length + bytes.length);
  saida.set(BOM_UTF8, 0);
  saida.set(bytes, BOM_UTF8.length);
  return saida;
}

/**
 * GET /api/copias/exportar-liga — o inventário inteiro no formato de
 * importação da LigaPokemon, em ZIP.
 *
 * ZIP e não CSV único porque o site deles aceita no máximo 995 cartas por
 * arquivo (limite declarado pelo site): um inventário de 1.100
 * cartas vira dois arquivos, importados um de cada vez.
 *
 * O resumo do que ficou de fora vai em cabeçalho HTTP (`X-Excluidas`), e
 * também dentro do ZIP num `LEIA-ME.txt` — cabeçalho some quando o
 * navegador salva o arquivo, e é justamente depois de salvar que o usuário
 * vai querer saber o que faltou.
 */
export async function GET() {
  const { itens, excluidas } = await listarInventarioParaLiga(db);

  const linhas = itens.map(linhaLiga);
  const blocos = dividirEmArquivos(linhas);
  const data = new Date().toISOString().slice(0, 10);

  let substituidosTotal = 0;
  const entradas: EntradaZip[] = blocos.map((bloco, i) => {
    const { bytes, substituidos } = paraLatin1(csvLiga(bloco));
    substituidosTotal += substituidos;
    return {
      nome: nomeArquivoLiga(i, blocos.length, data),
      conteudo: comBom(bytes),
    };
  });

  const resumo = [
    `Exportação para a LigaPokemon — ${data}`,
    "",
    `Cartas exportadas: ${itens.length}`,
    `Arquivos: ${blocos.length} (máximo de 995 cartas por arquivo, limite do site)`,
    "",
    "Importe um arquivo de cada vez, na ordem da numeração do nome.",
    "",
    excluidas.length > 0
      ? `Ficaram de fora ${excluidas.length} cópia(s):`
      : "Nenhuma cópia ficou de fora.",
    ...excluidas.map((e) => `  - ${e.nome} (${e.cartaId}): ${e.motivo}`),
    "",
    "Sobre as colunas preenchidas por dedução:",
    "  - Cor: resolvida por completo a partir dos seus exports.",
    "  - Raridade: seis das nossas mapeiam para um código único e saem",
    "    preenchidas. Rara, Ultra Rara e Mega Hiper Raro saem EM BRANCO —",
    "    cada uma corresponde a mais de um código do site, e o que separa",
    "    os casos não existe no nosso catálogo.",
    "  - Extras: holo, reverse e promo saem preenchidos; o resto, em branco.",
    substituidosTotal > 0
      ? `\nAtenção: ${substituidosTotal} caractere(s) não existem em Latin-1 e viraram "?".`
      : "",
  ].join("\n");

  // O LEIA-ME é NOSSO, não deles: vai em UTF-8. Em Latin-1 os nomes das
  // cartas japonesas viravam "?????" — justamente a informação que o usuário
  // precisa para saber o que ficou de fora. A restrição de Latin-1 vale
  // só para os CSVs, que o site deles vai ler.
  entradas.push({
    nome: "LEIA-ME.txt",
    conteudo: comBom(new TextEncoder().encode(resumo)),
  });

  const zip = montarZip(entradas);

  return new NextResponse(zip as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="ligapokemon-${data}.zip"`,
      "Content-Length": String(zip.length),
      "X-Cartas-Exportadas": String(itens.length),
      "X-Arquivos": String(blocos.length),
      "X-Excluidas": String(excluidas.length),
      // Sem cache: o inventário muda a cada cadastro, e um ZIP velho
      // servido do cache seria uma importação incompleta silenciosa.
      "Cache-Control": "no-store",
    },
  });
}
