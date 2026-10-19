/**
 * Qual arquivo de ícone o `/pwa/[arquivo]` serve, e se isso merece um aviso
 * no log. Módulo puro: a leitura de disco entra por parâmetro, para o teste
 * não precisar de arquivo de verdade.
 *
 * Duas fontes. A pasta da instalação (`PWA_ICONES_DIR`, montada só leitura)
 * vence quando tem o arquivo; senão vale o ícone genérico do repositório. O
 * genérico nunca falta, então a rota nunca responde erro por causa da pasta.
 */
import { ICONES_PWA } from "@/lib/dominio/acesso/rotas-publicas";

export type NomeIconePwa = (typeof ICONES_PWA)[number];

/**
 * O nome da constante que é igual ao pedido, ou `null`. A comparação é por
 * igualdade e devolve o elemento **da lista**, nunca o texto recebido: é isso
 * que mantém qualquer coisa vinda da URL longe de `path.join`.
 */
export function nomeIconeConhecido(pedido: string): NomeIconePwa | null {
  return ICONES_PWA.find((nome) => nome === pedido) ?? null;
}

/** O que a leitura da pasta da instalação encontrou. */
export type LeituraPasta = { estado: "ok"; bytes: Uint8Array } | { estado: "ausente" } | { estado: "erro" };

export type EscolhaIcone = {
  bytes: Uint8Array;
  origem: "pasta" | "generico";
  /** Verdadeiro uma única vez por arquivo: a pasta foi configurada e não deu. */
  avisar: boolean;
};

export async function escolherIcone(entrada: {
  nome: NomeIconePwa;
  /** `PWA_ICONES_DIR` como está no ambiente; vazia ou ausente = sem pasta. */
  pasta: string | undefined;
  lerDaPasta: (nome: NomeIconePwa) => Promise<LeituraPasta>;
  lerGenerico: (nome: NomeIconePwa) => Promise<Uint8Array>;
  /** Arquivos cujo aviso já saiu; a função acrescenta o que avisar agora. */
  jaAvisados: Set<NomeIconePwa>;
}): Promise<EscolhaIcone> {
  const { nome, pasta, lerDaPasta, lerGenerico, jaAvisados } = entrada;
  const configurada = typeof pasta === "string" && pasta.trim() !== "";

  if (configurada) {
    const leitura = await lerDaPasta(nome);
    // Arquivo vazio não é ícone: tratado como falta, com aviso.
    if (leitura.estado === "ok" && leitura.bytes.length > 0) {
      return { bytes: leitura.bytes, origem: "pasta", avisar: false };
    }
    const avisar = !jaAvisados.has(nome);
    jaAvisados.add(nome);
    return { bytes: await lerGenerico(nome), origem: "generico", avisar };
  }

  return { bytes: await lerGenerico(nome), origem: "generico", avisar: false };
}
