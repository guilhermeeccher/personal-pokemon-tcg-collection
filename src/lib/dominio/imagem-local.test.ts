import { describe, expect, it } from "vitest";

import {
  TAMANHO_MAXIMO_BYTES,
  detectarTipoImagemPorAssinatura,
  extensaoParaMime,
  validarArquivoImagem,
  validarUrlOrigem,
  ehImagemPropria,
} from "./imagem-local";

function bytes(...valores: number[]): Uint8Array {
  return new Uint8Array(valores);
}

describe("detectarTipoImagemPorAssinatura", () => {
  it("reconhece JPEG pela assinatura FF D8 FF, não pela extensão", () => {
    expect(detectarTipoImagemPorAssinatura(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00))).toBe(
      "image/jpeg",
    );
  });

  it("reconhece PNG pela assinatura de 8 bytes", () => {
    expect(
      detectarTipoImagemPorAssinatura(
        bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00),
      ),
    ).toBe("image/png");
  });

  it("reconhece WEBP pelo contêiner RIFF com a tag WEBP no offset 8", () => {
    // RIFF + 4 bytes de tamanho (irrelevantes aqui) + "WEBP".
    expect(
      detectarTipoImagemPorAssinatura(
        bytes(0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50),
      ),
    ).toBe("image/webp");
  });

  it("não confunde outro contêiner RIFF (ex.: WAV) com WEBP", () => {
    expect(
      detectarTipoImagemPorAssinatura(
        bytes(0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45),
      ),
    ).toBeNull();
  });

  it("devolve null para um PDF (assinatura %PDF)", () => {
    expect(detectarTipoImagemPorAssinatura(bytes(0x25, 0x50, 0x44, 0x46))).toBeNull();
  });

  it("devolve null para arquivo vazio ou curto demais", () => {
    expect(detectarTipoImagemPorAssinatura(bytes())).toBeNull();
    expect(detectarTipoImagemPorAssinatura(bytes(0xff, 0xd8))).toBeNull();
  });

  it("não é enganado por um .jpg renomeado que na verdade é texto", () => {
    const textoComoBytes = new TextEncoder().encode("isto nao e uma imagem");
    expect(detectarTipoImagemPorAssinatura(textoComoBytes)).toBeNull();
  });
});

describe("validarArquivoImagem", () => {
  const jpegValido = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10);

  it("aceita um JPEG válido dentro do limite de tamanho", () => {
    const resultado = validarArquivoImagem(jpegValido);
    expect(resultado.ok).toBe(true);
    expect(resultado.tipo).toBe("image/jpeg");
  });

  it("recusa arquivo vazio", () => {
    const resultado = validarArquivoImagem(bytes());
    expect(resultado.ok).toBe(false);
  });

  it("recusa arquivo maior que o limite, mesmo com assinatura válida", () => {
    const grande = new Uint8Array(TAMANHO_MAXIMO_BYTES + 1);
    grande[0] = 0xff;
    grande[1] = 0xd8;
    grande[2] = 0xff;
    const resultado = validarArquivoImagem(grande);
    expect(resultado.ok).toBe(false);
    // Chave + valores, não a frase: quem monta a frase é a tela, no idioma
    // da interface. O limite continua sendo verificado — agora no valor.
    expect(resultado.erro?.chave).toBe("arquivoAcimaDoLimite");
    expect(resultado.erro?.valores).toEqual({ mb: "8" });
  });

  it("recusa conteúdo que não é imagem, mesmo pequeno", () => {
    const resultado = validarArquivoImagem(new TextEncoder().encode("<html>não é imagem</html>"));
    expect(resultado.ok).toBe(false);
  });
});

describe("validarUrlOrigem", () => {
  it("aceita http e https", () => {
    expect(validarUrlOrigem("https://assets.tcgdex.net/pt/sv/sv03.5/001/high.webp").ok).toBe(
      true,
    );
    expect(validarUrlOrigem("http://exemplo.com/carta.png").ok).toBe(true);
  });

  it("recusa esquema que não é http/https", () => {
    expect(validarUrlOrigem("file:///etc/passwd").ok).toBe(false);
    expect(validarUrlOrigem("ftp://exemplo.com/carta.png").ok).toBe(false);
  });

  it("recusa string que não é URL válida", () => {
    expect(validarUrlOrigem("não é uma url").ok).toBe(false);
    expect(validarUrlOrigem("").ok).toBe(false);
  });
});

describe("extensaoParaMime", () => {
  it("mapeia cada mime suportado para uma extensão", () => {
    expect(extensaoParaMime("image/jpeg")).toBe("jpg");
    expect(extensaoParaMime("image/png")).toBe("png");
    expect(extensaoParaMime("image/webp")).toBe("webp");
  });
});

describe("ehImagemPropria", () => {
  it("reconhece a imagem fornecida pelo usuário", () => {
    expect(ehImagemPropria("/api/imagens-locais/mep-079/pt")).toBe(true);
  });

  it("não confunde com imagem do catálogo nem do CDN", () => {
    expect(ehImagemPropria("https://assets.tcgdex.net/pt/me/mep/079")).toBe(false);
    expect(ehImagemPropria(null)).toBe(false);
    expect(ehImagemPropria(undefined)).toBe(false);
    expect(ehImagemPropria("")).toBe(false);
  });
});
