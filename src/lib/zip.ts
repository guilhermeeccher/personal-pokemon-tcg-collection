/**
 * Escritor de ZIP mínimo, modo **stored** (sem compressão).
 *
 * Por que à mão, e não uma biblioteca: o projeto tem cinco dependências
 * de runtime e a disciplina de manter assim é deliberada
 * (`AGENTS.md`). O que precisamos daqui é a menor parte do formato — um
 * arquivo por entrada, sem compressão, sem pastas, sem senha —, e ela
 * cabe em cem linhas verificáveis. O ZIP gerado é conferido com
 * `unzip -t` contra o binário de verdade antes de qualquer entrega.
 *
 * Sem compressão de propósito: CSV comprime bem, mas implementar deflate
 * à mão seria trocar cem linhas auditáveis por mil. O ganho de banda numa
 * rede local, para arquivos de algumas centenas de KB, não paga isso.
 *
 * Referência do formato: APPNOTE.TXT do PKWARE, seções 4.3.7 (local file
 * header), 4.3.12 (central directory) e 4.3.16 (end of central
 * directory).
 */

/**
 * Tabela do CRC-32 (polinômio 0xEDB88320, o do ZIP e do PNG). Calculada
 * uma vez na carga do módulo — 256 entradas.
 */
const TABELA_CRC32 = (() => {
  const tabela = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tabela[n] = c >>> 0;
  }
  return tabela;
})();

export function crc32(dados: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < dados.length; i += 1) {
    c = TABELA_CRC32[(c ^ dados[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export interface EntradaZip {
  /** Caminho dentro do ZIP. Sem barra inicial, sem `..`. */
  nome: string;
  conteudo: Uint8Array;
}

function escreverU16(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff];
}

function escreverU32(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
}

/**
 * Data/hora no formato MS-DOS, que é o que o ZIP guarda. Segundos têm
 * resolução de 2 (o campo tem 5 bits), e o ano é contado a partir de
 * 1980 — datas anteriores não são representáveis e viram 1980-01-01.
 */
function dataHoraDos(data: Date): { hora: number; data: number } {
  const ano = data.getFullYear();
  if (ano < 1980) return { hora: 0, data: (1 << 5) | 1 };
  return {
    hora:
      (data.getHours() << 11) | (data.getMinutes() << 5) | (data.getSeconds() >> 1),
    data: ((ano - 1980) << 9) | ((data.getMonth() + 1) << 5) | data.getDate(),
  };
}

/**
 * Monta o ZIP inteiro em memória.
 *
 * Aceitável aqui porque as entradas são CSVs de algumas centenas de KB no
 * pior caso; para dado grande isto precisaria virar stream.
 */
export function montarZip(entradas: readonly EntradaZip[], data = new Date()): Uint8Array {
  const { hora: horaDos, data: dataDos } = dataHoraDos(data);
  const codificador = new TextEncoder();

  const locais: number[] = [];
  const central: number[] = [];
  let deslocamento = 0;

  for (const entrada of entradas) {
    const nomeBytes = codificador.encode(entrada.nome);
    const crc = crc32(entrada.conteudo);
    const tamanho = entrada.conteudo.length;

    // Bit 11 do flag: nome do arquivo em UTF-8. Sem ele, nome com acento
    // é lido como cp437 e vira lixo em alguns extratores.
    const flag = 0x0800;

    const local = [
      ...escreverU32(0x04034b50), // assinatura do local file header
      ...escreverU16(20), // versão mínima (2.0)
      ...escreverU16(flag),
      ...escreverU16(0), // método 0 = stored
      ...escreverU16(horaDos),
      ...escreverU16(dataDos),
      ...escreverU32(crc),
      ...escreverU32(tamanho), // comprimido
      ...escreverU32(tamanho), // descomprimido (iguais, sem compressão)
      ...escreverU16(nomeBytes.length),
      ...escreverU16(0), // sem campo extra
      ...nomeBytes,
    ];
    locais.push(...local, ...entrada.conteudo);

    central.push(
      ...escreverU32(0x02014b50), // assinatura da central directory
      ...escreverU16(20), // versão que criou
      ...escreverU16(20), // versão mínima
      ...escreverU16(flag),
      ...escreverU16(0), // stored
      ...escreverU16(horaDos),
      ...escreverU16(dataDos),
      ...escreverU32(crc),
      ...escreverU32(tamanho),
      ...escreverU32(tamanho),
      ...escreverU16(nomeBytes.length),
      ...escreverU16(0), // extra
      ...escreverU16(0), // comentário
      ...escreverU16(0), // número do disco
      ...escreverU16(0), // atributos internos
      ...escreverU32(0), // atributos externos
      ...escreverU32(deslocamento), // onde começa o local header
      ...nomeBytes,
    );

    deslocamento += local.length + tamanho;
  }

  const inicioCentral = deslocamento;
  const fim = [
    ...escreverU32(0x06054b50), // end of central directory
    ...escreverU16(0), // disco atual
    ...escreverU16(0), // disco onde começa a central
    ...escreverU16(entradas.length),
    ...escreverU16(entradas.length),
    ...escreverU32(central.length),
    ...escreverU32(inicioCentral),
    ...escreverU16(0), // comentário do arquivo
  ];

  return Uint8Array.from([...locais, ...central, ...fim]);
}
